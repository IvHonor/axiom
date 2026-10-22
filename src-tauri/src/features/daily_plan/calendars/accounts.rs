//! Calendar accounts: connecting, keeping their calendars and events up to
//! date, publishing the plan into one of them, and disconnecting.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use chrono::{Days, Utc};
use rrule::Tz;
use sea_orm::prelude::Date;
use serde::Deserialize;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set, TransactionTrait};
use serde::Serialize;
use tokio::sync::{oneshot, Mutex};

use super::caldav::{self, CalDav};
use super::google::{self, Google};
use super::microsoft::{self, Microsoft};
use super::ics::EventChange;
use super::oauth::{random_token, Loopback, OAuthApp, Pkce};
use super::publish::{self, plan_events};
use super::remote::Remote;
use super::secrets::{Secret, SecretStore};
use super::{replace_events, AXIOM_CALENDAR, DAYS_AHEAD, DAYS_BACK, STALE_MINUTES};
use crate::db::new_id;
use crate::error::{Error, Result};
use crate::features::daily_plan::entities::{calendar, calendar_account as account, event};

/// Where each provider lives, and this build's registration with Google and
/// Microsoft (see `from_build`).
#[derive(Clone)]
pub struct Providers {
    pub google: OAuthApp,
    pub google_api: String,
    pub google_revoke: String,
    pub microsoft: OAuthApp,
    pub graph_api: String,
}

impl Providers {
    /// The real services, with the client ids this copy was built with:
    /// AXIOM_GOOGLE_CLIENT_ID, AXIOM_GOOGLE_CLIENT_SECRET and
    /// AXIOM_MICROSOFT_CLIENT_ID (see docs/DEVELOPMENT.md). Without them,
    /// that provider is switched off.
    pub fn from_build() -> Self {
        Self {
            google: google::app(
                option_env!("AXIOM_GOOGLE_CLIENT_ID").unwrap_or(""),
                option_env!("AXIOM_GOOGLE_CLIENT_SECRET").unwrap_or(""),
                "https://accounts.google.com/o/oauth2/v2/auth",
                "https://oauth2.googleapis.com/token",
            ),
            google_api: "https://www.googleapis.com/calendar/v3".into(),
            google_revoke: "https://oauth2.googleapis.com/revoke".into(),
            microsoft: microsoft::app(
                option_env!("AXIOM_MICROSOFT_CLIENT_ID").unwrap_or(""),
                "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
                "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            ),
            graph_api: "https://graph.microsoft.com/v1.0".into(),
        }
    }
}

/// Kept in Tauri's managed state. Commands receive it as `State<'_, CalendarHub>`.
pub struct CalendarHub {
    providers: Providers,
    secrets: Box<dyn SecretStore>,
    http: reqwest::Client,
    /// The user's time zone (the computer's, outside tests).
    pub zone: Tz,
    /// Access tokens until they expire, by account.
    tokens: Mutex<HashMap<String, (String, Instant)>>,
    /// Cancels a sign-in waiting on the browser.
    cancel: Mutex<Option<oneshot::Sender<()>>>,
    /// One refresh at a time.
    busy: Mutex<()>,
}

/// Which providers this copy of Axiom can connect to.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Available {
    pub google: bool,
    pub microsoft: bool,
}

impl CalendarHub {
    pub fn new(secrets: Box<dyn SecretStore>, providers: Providers, zone: Tz) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("Axiom/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("HTTP client");
        Self {
            providers,
            secrets,
            http,
            zone,
            tokens: Mutex::default(),
            cancel: Mutex::default(),
            busy: Mutex::default(),
        }
    }

    pub fn available(&self) -> Available {
        Available { google: self.providers.google.configured(), microsoft: self.providers.microsoft.configured() }
    }

    fn app(&self, provider: &str) -> Result<&OAuthApp> {
        let app = match provider {
            "google" => &self.providers.google,
            "microsoft" => &self.providers.microsoft,
            _ => return Err(Error::Invalid("Axiom can't connect to that calendar.".into())),
        };
        if !app.configured() {
            return Err(Error::Invalid(format!("This copy of Axiom isn't set up to connect to {}.", app.provider)));
        }
        Ok(app)
    }

    /// A working access token, refreshed when it's about to run out.
    async fn access_token(&self, account: &account::Model) -> Result<String> {
        if let Some((token, until)) = self.tokens.lock().await.get(&account.id) {
            if *until > Instant::now() {
                return Ok(token.clone());
            }
        }
        let Some(Secret::OAuth { refresh_token, scope }) = self.secrets.load(&account.id) else {
            return Err(Error::Account("Axiom isn't signed in to this calendar any more. Reconnect it.".into()));
        };
        let app = self.app(&account.provider)?;
        let tokens = app.refresh(&self.http, &refresh_token).await?;
        // Microsoft hands out a new refresh token each time; either may say what's allowed.
        let next = Secret::OAuth {
            refresh_token: tokens.refresh_token.clone().unwrap_or_else(|| refresh_token.clone()),
            scope: tokens.scope.clone().or_else(|| scope.clone()),
        };
        if next != (Secret::OAuth { refresh_token, scope }) {
            self.secrets.save(&account.id, &next).map_err(Error::Invalid)?;
        }
        self.remember(&account.id, &tokens.access_token, tokens.expires_in).await;
        Ok(tokens.access_token)
    }

    async fn remember(&self, account_id: &str, token: &str, expires_in: Option<u64>) {
        // A minute's margin so a token doesn't run out mid-sync.
        let life = Duration::from_secs(expires_in.unwrap_or(3600).saturating_sub(60));
        self.tokens.lock().await.insert(account_id.to_owned(), (token.to_owned(), Instant::now() + life));
    }

    fn remote_with(&self, provider: &str, token: String, scope: Option<&str>) -> Box<dyn Remote> {
        match provider {
            "google" => {
                let can_edit = scope.is_some_and(|s| s.split_whitespace().any(|g| g == google::EDIT_SCOPE));
                Box::new(Google::new(self.http.clone(), &self.providers.google_api, token, can_edit))
            }
            _ => Box::new(Microsoft::new(self.http.clone(), &self.providers.graph_api, token)),
        }
    }

    pub async fn remote(&self, account: &account::Model) -> Result<Box<dyn Remote>> {
        if account.provider == "caldav" {
            let Some(Secret::Password { username, password }) = self.secrets.load(&account.id) else {
                return Err(Error::Account("Axiom isn't signed in to this calendar any more. Reconnect it.".into()));
            };
            return Ok(Box::new(CalDav::new(&account.server, &username, &password)));
        }
        let token = self.access_token(account).await?;
        let scope = match self.secrets.load(&account.id) {
            Some(Secret::OAuth { scope, .. }) => scope,
            _ => None,
        };
        Ok(self.remote_with(&account.provider, token, scope.as_deref()))
    }

    /// Stops a sign-in that's waiting on the browser.
    pub async fn cancel_sign_in(&self) {
        if let Some(cancel) = self.cancel.lock().await.take() {
            let _ = cancel.send(());
        }
    }
}

/// Connects Google or Microsoft: opens the sign-in page with `open`, waits
/// for the browser to come back, then reads the account's calendars.
pub async fn connect_oauth(
    db: &DatabaseConnection,
    hub: &CalendarHub,
    provider: &str,
    today: Date,
    open: impl FnOnce(&str) -> Result<()>,
) -> Result<account::Model> {
    let app = hub.app(provider)?.clone();
    let loopback = Loopback::bind().await?;
    let port = loopback.port;
    let (pkce, state) = (Pkce::new(), random_token());
    let (cancel, cancelled) = oneshot::channel();
    *hub.cancel.lock().await = Some(cancel);
    open(&app.sign_in_url(port, &state, &pkce))?;

    let code = tokio::select! {
        code = loopback.wait(&state, app.provider) => code?,
        _ = cancelled => return Err(Error::Invalid("The sign-in was cancelled.".into())),
    };
    let tokens = app.exchange(&hub.http, &code, port, &pkce).await?;
    let refresh_token = tokens
        .refresh_token
        .ok_or_else(|| Error::Invalid(format!("{} didn't let Axiom stay signed in. Try connecting again.", app.provider)))?;
    let remote = hub.remote_with(provider, tokens.access_token.clone(), tokens.scope.as_deref());
    let name = remote.account_name().await?;

    let saved = save_account(db, provider, &name, "").await?;
    hub.secrets.save(&saved.id, &Secret::OAuth { refresh_token, scope: tokens.scope.clone() }).map_err(Error::Invalid)?;
    hub.remember(&saved.id, &tokens.access_token, tokens.expires_in).await;
    finish_connecting(db, hub, &saved, remote.as_ref(), today).await?;
    Ok(saved)
}

/// Connects iCloud (or another CalDAV server) with an app-specific password.
pub async fn connect_caldav(db: &DatabaseConnection, hub: &CalendarHub, server: &str, username: &str, password: &str, today: Date) -> Result<account::Model> {
    let server = match server.trim() {
        "" => caldav::ICLOUD.to_owned(),
        s if s.starts_with("https://") => s.to_owned(),
        // Plain http only for a server on this computer: passwords never cross a network unencrypted.
        s if s.starts_with("http://127.0.0.1") || s.starts_with("http://localhost") => s.to_owned(),
        _ => return Err(Error::Invalid("The server address has to start with https://.".into())),
    };
    let (username, password) = (username.trim(), password.trim());
    if username.is_empty() || password.is_empty() {
        return Err(Error::Invalid("Enter the email and the app-specific password.".into()));
    }
    let remote = CalDav::new(&server, username, password);
    let name = remote.account_name().await?;
    let saved = save_account(db, "caldav", &name, &server).await?;
    hub.secrets
        .save(&saved.id, &Secret::Password { username: username.into(), password: password.into() })
        .map_err(Error::Invalid)?;
    finish_connecting(db, hub, &saved, &remote, today).await?;
    Ok(saved)
}

/// Reconnecting the same account updates it instead of adding a second.
async fn save_account(db: &DatabaseConnection, provider: &str, name: &str, server: &str) -> Result<account::Model> {
    let existing = account::Entity::find()
        .filter(account::Column::Provider.eq(provider))
        .filter(account::Column::Name.eq(name))
        .filter(account::Column::Server.eq(server))
        .one(db)
        .await?;
    Ok(match existing {
        Some(found) => {
            let mut active: account::ActiveModel = found.into();
            active.problem = Set(None);
            active.update(db).await?
        }
        None => {
            account::ActiveModel {
                id: Set(new_id()),
                provider: Set(provider.into()),
                name: Set(name.into()),
                server: Set(server.into()),
                problem: Set(None),
                created_at: Set(Utc::now()),
            }
            .insert(db)
            .await?
        }
    })
}

async fn finish_connecting(db: &DatabaseConnection, hub: &CalendarHub, account: &account::Model, remote: &dyn Remote, today: Date) -> Result<()> {
    sync_calendar_list(db, account, remote).await?;
    pull(db, hub, account, remote, today).await;
    Ok(())
}

/// Matches the stored calendars to the account's: new ones are added
/// (shown if they're the user's own), gone ones removed.
async fn sync_calendar_list(db: &DatabaseConnection, account: &account::Model, remote: &dyn Remote) -> Result<()> {
    let found = remote.calendars().await?;
    let stored = calendar::Entity::find().filter(calendar::Column::AccountId.eq(account.id.as_str())).all(db).await?;
    let txn = db.begin().await?;
    for theirs in &found {
        match stored.iter().find(|c| c.remote_id.as_deref() == Some(theirs.remote_id.as_str())) {
            Some(ours) => {
                let mut active: calendar::ActiveModel = ours.clone().into();
                active.name = Set(theirs.name.clone());
                active.writable = Set(theirs.writable);
                active.mine = Set(theirs.mine);
                active.update(&txn).await?;
            }
            None => {
                calendar::ActiveModel {
                    id: Set(new_id()),
                    name: Set(theirs.name.clone()),
                    url: Set(String::new()),
                    color: Set(theirs.color.clone()),
                    refreshed_at: Set(None),
                    problem: Set(None),
                    created_at: Set(Utc::now()),
                    account_id: Set(Some(account.id.clone())),
                    remote_id: Set(Some(theirs.remote_id.clone())),
                    writable: Set(theirs.writable),
                    // Axiom's own plan calendar would only repeat the plan.
                    shown: Set((theirs.mine || theirs.primary) && theirs.name != AXIOM_CALENDAR),
                    publish: Set(false),
                    published_hash: Set(None),
                    mine: Set(theirs.mine),
                }
                .insert(&txn)
                .await?;
            }
        }
    }
    for gone in stored.iter().filter(|c| !found.iter().any(|f| Some(f.remote_id.as_str()) == c.remote_id.as_deref())) {
        event::Entity::delete_many().filter(event::Column::CalendarId.eq(gone.id.as_str())).exec(&txn).await?;
        calendar::Entity::delete_by_id(gone.id.as_str()).exec(&txn).await?;
    }
    txn.commit().await?;
    Ok(())
}

/// Reads events for the account's shown calendars. Problems are noted on
/// the account or calendar rather than stopping the rest.
async fn pull(db: &DatabaseConnection, hub: &CalendarHub, account: &account::Model, remote: &dyn Remote, today: Date) {
    let Ok(calendars) = calendar::Entity::find().filter(calendar::Column::AccountId.eq(account.id.as_str())).all(db).await else {
        return;
    };
    let (from, to) = (today - Days::new(DAYS_BACK), today + Days::new(DAYS_AHEAD));
    for cal in calendars {
        let mut active: calendar::ActiveModel = cal.clone().into();
        if !cal.shown {
            let _ = event::Entity::delete_many().filter(event::Column::CalendarId.eq(cal.id.as_str())).exec(db).await;
            continue;
        }
        match remote.events(cal.remote_id.as_deref().unwrap_or_default(), from, to, hub.zone).await {
            Ok(mut events) => {
                for e in &mut events {
                    e.editable = cal.mine && remote.can_edit_events() && (remote.edits_occurrences() || !e.details.recurring);
                }
                if replace_events(db, &cal, events).await.is_err() {
                    continue;
                }
                active.problem = Set(None);
            }
            Err(e) => active.problem = Set(Some(e.to_string())),
        }
        active.refreshed_at = Set(Some(Utc::now()));
        let _ = active.update(db).await;
    }
}

/// Brings one account up to date if it's due (or with `force`, also
/// re-reading its list of calendars). Returns whether it was read.
pub async fn sync_account(db: &DatabaseConnection, hub: &CalendarHub, account: &account::Model, today: Date, force: bool) -> Result<bool> {
    let calendars = calendar::Entity::find().filter(calendar::Column::AccountId.eq(account.id.as_str())).all(db).await?;
    let due = chrono::Duration::minutes(STALE_MINUTES);
    let fresh = !calendars.is_empty() && calendars.iter().filter(|c| c.shown).all(|c| c.refreshed_at.is_some_and(|at| Utc::now() - at < due));
    if fresh && !force {
        return Ok(false);
    }
    let outcome = async {
        let remote = hub.remote(account).await?;
        if force {
            sync_calendar_list(db, account, remote.as_ref()).await?;
        }
        pull(db, hub, account, remote.as_ref(), today).await;
        Ok::<_, Error>(())
    }
    .await;
    let mut active: account::ActiveModel = account.clone().into();
    active.problem = Set(outcome.err().map(|e| e.to_string()));
    active.update(db).await?;
    Ok(true)
}

/// Publishes the plan if it changed since last time (or always, with `force`).
pub async fn publish_plan(db: &DatabaseConnection, hub: &CalendarHub, today: Date, force: bool) -> Result<()> {
    let Some(cal) = calendar::Entity::find().filter(calendar::Column::Publish.eq(true)).one(db).await? else {
        return Ok(());
    };
    let desired = plan_events(db, today, hub.zone).await?;
    let fingerprint = publish::fingerprint(&desired);
    if !force && cal.published_hash.as_deref() == Some(fingerprint.as_str()) {
        return Ok(());
    }
    let outcome = async {
        let account = account_of(db, &cal).await?;
        let remote = hub.remote(&account).await?;
        let (from, to) = publish::window(today, hub.zone);
        publish::publish(remote.as_ref(), cal.remote_id.as_deref().unwrap_or_default(), &desired, from, to).await
    }
    .await;
    let mut active: calendar::ActiveModel = cal.into();
    match outcome {
        Ok(_) => {
            active.published_hash = Set(Some(fingerprint));
            active.problem = Set(None);
        }
        Err(e) => active.problem = Set(Some(e.to_string())),
    }
    active.update(db).await?;
    Ok(())
}

async fn account_of(db: &DatabaseConnection, cal: &calendar::Model) -> Result<account::Model> {
    account::Entity::find_by_id(cal.account_id.clone().unwrap_or_default()).one(db).await?.ok_or(Error::NotFound("Calendar account"))
}

/// Chooses the calendar the plan is published into, or none. The calendar
/// published into before has Axiom's upcoming events taken out of it.
pub async fn set_publish(db: &DatabaseConnection, hub: &CalendarHub, calendar_id: Option<&str>, today: Date) -> Result<()> {
    if let Some(id) = calendar_id {
        let chosen = calendar::Entity::find_by_id(id).one(db).await?.ok_or(Error::NotFound("Calendar"))?;
        if !chosen.writable {
            return Err(Error::Invalid("Axiom can't add events to that calendar.".into()));
        }
    }
    let previous = calendar::Entity::find().filter(calendar::Column::Publish.eq(true)).all(db).await?;
    for old in previous.into_iter().filter(|c| Some(c.id.as_str()) != calendar_id) {
        // Best effort: an account that's gone shouldn't stop the change.
        if let Ok(account) = account_of(db, &old).await {
            if let Ok(remote) = hub.remote(&account).await {
                let (from, to) = publish::window(today, hub.zone);
                let _ = publish::publish(remote.as_ref(), old.remote_id.as_deref().unwrap_or_default(), &[], from, to).await;
            }
        }
        let mut active: calendar::ActiveModel = old.into();
        active.publish = Set(false);
        active.published_hash = Set(None);
        active.update(db).await?;
    }
    if let Some(id) = calendar_id {
        let chosen = calendar::Entity::find_by_id(id).one(db).await?.ok_or(Error::NotFound("Calendar"))?;
        let mut active: calendar::ActiveModel = chosen.into();
        active.publish = Set(true);
        active.published_hash = Set(None);
        active.update(db).await?;
        publish_plan(db, hub, today, true).await?;
    }
    Ok(())
}

/// Makes an "Axiom" calendar in the account and publishes the plan there.
pub async fn create_plan_calendar(db: &DatabaseConnection, hub: &CalendarHub, account_id: &str, today: Date) -> Result<calendar::Model> {
    let account = account::Entity::find_by_id(account_id).one(db).await?.ok_or(Error::NotFound("Calendar account"))?;
    let remote = hub.remote(&account).await?;
    let made = remote.create_calendar(AXIOM_CALENDAR).await?;
    sync_calendar_list(db, &account, remote.as_ref()).await?;
    let stored = calendar::Entity::find()
        .filter(calendar::Column::AccountId.eq(account_id))
        .filter(calendar::Column::RemoteId.eq(made.remote_id.as_str()))
        .one(db)
        .await?;
    // A calendar the list doesn't show yet (Google can take a moment) is added by hand.
    let stored = match stored {
        Some(found) => {
            let mut active: calendar::ActiveModel = found.into();
            active.writable = Set(true);
            active.shown = Set(false);
            active.update(db).await?
        }
        None => {
            calendar::ActiveModel {
                id: Set(new_id()),
                name: Set(made.name.clone()),
                url: Set(String::new()),
                color: Set(made.color.clone()),
                refreshed_at: Set(None),
                problem: Set(None),
                created_at: Set(Utc::now()),
                account_id: Set(Some(account.id.clone())),
                remote_id: Set(Some(made.remote_id.clone())),
                writable: Set(true),
                shown: Set(false),
                publish: Set(false),
                published_hash: Set(None),
                mine: Set(true),
            }
            .insert(db)
            .await?
        }
    };
    set_publish(db, hub, Some(&stored.id), today).await?;
    Ok(calendar::Entity::find_by_id(stored.id).one(db).await?.ok_or(Error::NotFound("Calendar"))?)
}

/// Shows or hides a calendar's events on the planner.
pub async fn set_shown(db: &DatabaseConnection, hub: &CalendarHub, calendar_id: &str, shown: bool, today: Date) -> Result<()> {
    let cal = calendar::Entity::find_by_id(calendar_id).one(db).await?.ok_or(Error::NotFound("Calendar"))?;
    let mut active: calendar::ActiveModel = cal.clone().into();
    active.shown = Set(shown);
    active.refreshed_at = Set(None);
    active.update(db).await?;
    if !shown {
        event::Entity::delete_many().filter(event::Column::CalendarId.eq(calendar_id)).exec(db).await?;
        return Ok(());
    }
    if let Some(account_id) = &cal.account_id {
        if let Some(account) = account::Entity::find_by_id(account_id.as_str()).one(db).await? {
            sync_account(db, hub, &account, today, false).await?;
        }
    }
    Ok(())
}

/// Disconnects an account: its calendars and events go, and its sign-in is
/// removed from the keychain (and revoked, for Google).
pub async fn remove_account(db: &DatabaseConnection, hub: &CalendarHub, account_id: &str) -> Result<()> {
    let account = account::Entity::find_by_id(account_id).one(db).await?.ok_or(Error::NotFound("Calendar account"))?;
    if account.provider == "google" {
        if let Some(Secret::OAuth { refresh_token, .. }) = hub.secrets.load(account_id) {
            let _ = hub.http.post(&hub.providers.google_revoke).form(&[("token", refresh_token)]).send().await;
        }
    }
    let calendars = calendar::Entity::find().filter(calendar::Column::AccountId.eq(account_id)).all(db).await?;
    let txn = db.begin().await?;
    for cal in &calendars {
        event::Entity::delete_many().filter(event::Column::CalendarId.eq(cal.id.as_str())).exec(&txn).await?;
    }
    calendar::Entity::delete_many().filter(calendar::Column::AccountId.eq(account_id)).exec(&txn).await?;
    account::Entity::delete_by_id(account_id).exec(&txn).await?;
    txn.commit().await?;
    hub.secrets.delete(account_id);
    hub.tokens.lock().await.remove(account_id);
    Ok(())
}

pub async fn list_accounts(db: &DatabaseConnection) -> Result<Vec<account::Model>> {
    Ok(account::Entity::find().order_by_asc(account::Column::CreatedAt).all(db).await?)
}

/// Serialises refreshes: the planner asks on a timer and after changes.
pub async fn exclusive(hub: &CalendarHub) -> tokio::sync::MutexGuard<'_, ()> {
    hub.busy.lock().await
}

// ---------- Changing events ----------

/// A change to a calendar event from the event panel. Leave a field out to
/// keep it; `when` moves an event that has a time.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventEdit {
    pub title: Option<String>,
    pub location: Option<String>,
    pub description: Option<String>,
    pub when: Option<EventWhen>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventWhen {
    pub day: Date,
    pub start_minute: i32,
    pub end_minute: i32,
}

/// The event, its calendar and a way to reach the provider, if Axiom may change it.
async fn editable_event(db: &DatabaseConnection, hub: &CalendarHub, event_id: &str) -> Result<(event::Model, calendar::Model, account::Model, Box<dyn Remote>)> {
    let found = event::Entity::find_by_id(event_id).one(db).await?.ok_or(Error::NotFound("Event"))?;
    if !found.editable {
        return Err(Error::Invalid("Axiom can't change this event. Change it in your calendar instead.".into()));
    }
    let cal = calendar::Entity::find_by_id(found.calendar_id.as_str()).one(db).await?.ok_or(Error::NotFound("Calendar"))?;
    let account = account_of(db, &cal).await?;
    let remote = hub.remote(&account).await?;
    Ok((found, cal, account, remote))
}

/// Changes an event in its calendar, then reads the account again.
pub async fn update_event(db: &DatabaseConnection, hub: &CalendarHub, event_id: &str, edit: EventEdit, today: Date) -> Result<()> {
    let (found, cal, account, remote) = editable_event(db, hub, event_id).await?;
    let times = match &edit.when {
        Some(when) if !found.all_day => {
            if when.end_minute <= when.start_minute || when.start_minute < 0 || when.end_minute > 24 * 60 {
                return Err(Error::Invalid("The event has to end after it starts, by midnight.".into()));
            }
            let at = |minute: i32| {
                when.day
                    .and_hms_opt(0, 0, 0)
                    .and_then(|midnight| super::ics::in_zone(hub.zone, midnight + chrono::Duration::minutes(minute as i64)))
                    .map(|t| t.with_timezone(&Utc))
                    .ok_or_else(|| Error::Invalid("That time doesn't exist on that day.".into()))
            };
            Some((at(when.start_minute)?, at(when.end_minute)?))
        }
        _ => None,
    };
    let title = edit.title.map(|t| t.trim().to_owned());
    if title.as_deref() == Some("") {
        return Err(Error::Invalid("Give the event a name.".into()));
    }
    let change = EventChange { title, location: edit.location, description: edit.description, times };
    remote.update_event(cal.remote_id.as_deref().unwrap_or_default(), found.remote_id.as_deref().unwrap_or_default(), &change).await?;
    pull(db, hub, &account, remote.as_ref(), today).await;
    Ok(())
}

/// Deletes an event (or one occurrence) from its calendar.
pub async fn delete_event(db: &DatabaseConnection, hub: &CalendarHub, event_id: &str, today: Date) -> Result<()> {
    let (found, cal, account, remote) = editable_event(db, hub, event_id).await?;
    remote.delete_event(cal.remote_id.as_deref().unwrap_or_default(), found.remote_id.as_deref().unwrap_or_default()).await?;
    pull(db, hub, &account, remote.as_ref(), today).await;
    Ok(())
}
