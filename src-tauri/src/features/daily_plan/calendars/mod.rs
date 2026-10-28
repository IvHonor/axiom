//! Calendars on the planner: events from Google, Outlook, iCloud (or any
//! CalDAV server) and private iCal (.ics) links, shown as busy time; and the
//! plan published into one calendar. Kept on this computer only (see
//! m004_calendars and m005_calendar_accounts).
//!
//! - `ics.rs` reads iCalendar text; `google.rs`, `microsoft.rs` and
//!   `caldav.rs` talk to each provider through `remote.rs`'s `Remote`
//! - `oauth.rs` signs in to Google and Microsoft; `secrets.rs` keeps sign-ins
//! - `accounts.rs` connects and syncs accounts; `publish.rs` publishes the plan

use std::time::Duration;

use chrono::{Days, Utc};
use sea_orm::prelude::Date;
use sea_orm::sea_query::Expr;
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Select, Set, TransactionTrait};

pub mod accounts;
mod caldav;
mod google;
pub(super) mod ics;
mod microsoft;
mod oauth;
pub mod publish;
pub mod remote;
pub mod secrets;

use serde::Serialize;

use super::entities::{calendar, calendar_account, event};
use super::service::COLORS;
use crate::db::new_id;
use crate::error::{Error, Result};

/// Calendars are read again after this long.
const STALE_MINUTES: i64 = 15;
/// Events are kept from two weeks back to four months ahead.
const DAYS_BACK: u64 = 14;
const DAYS_AHEAD: u64 = 120;
/// Bigger than any real calendar; stops a wrong link filling the disk.
const MAX_BYTES: usize = 20 * 1024 * 1024;

/// The calendar Axiom makes to publish the plan into.
const AXIOM_CALENDAR: &str = "Axiom";
const AXIOM_CALENDAR_ABOUT: &str = "Your plan from Axiom's Daily Plan. Axiom keeps it up to date; changes made here are replaced.";
/// Marks events Axiom published, with the plan block's id as the value.
const MARKER: &str = "axiomBlock";

/// Everything the Calendars dialog shows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSetup {
    pub accounts: Vec<calendar_account::Model>,
    pub calendars: Vec<calendar::Model>,
    /// Which providers this copy of Axiom can connect to.
    pub available: accounts::Available,
}

pub async fn setup(db: &DatabaseConnection, hub: &accounts::CalendarHub) -> Result<CalendarSetup> {
    // An account connected on another computer needs signing in here too.
    let accounts = accounts::list_accounts(db)
        .await?
        .into_iter()
        .map(|mut account| {
            account.signed_out |= !hub.signed_in_here(&account.id);
            account
        })
        .collect();
    Ok(CalendarSetup { accounts, calendars: list_calendars(db).await?, available: hub.available() })
}

/// Calendars that haven't been removed (here or on another computer).
pub(super) fn live_calendars() -> Select<calendar::Entity> {
    calendar::Entity::find().filter(calendar::Column::DeletedAt.is_null())
}

/// Calendar accounts that haven't been removed.
pub(super) fn live_accounts() -> Select<calendar_account::Entity> {
    calendar_account::Entity::find().filter(calendar_account::Column::DeletedAt.is_null())
}

/// Removes calendars: marked deleted, so the user's other computers remove
/// them too, and their events dropped here.
pub(super) async fn remove_calendars(db: &impl ConnectionTrait, ids: &[String]) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }
    event::Entity::delete_many().filter(event::Column::CalendarId.is_in(ids.iter().cloned())).exec(db).await?;
    calendar::Entity::update_many()
        .col_expr(calendar::Column::DeletedAt, Expr::value(Some(Utc::now())))
        .filter(calendar::Column::Id.is_in(ids.iter().cloned()))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn list_calendars(db: &DatabaseConnection) -> Result<Vec<calendar::Model>> {
    Ok(live_calendars().order_by_asc(calendar::Column::CreatedAt).all(db).await?)
}

/// Adds a calendar after checking its link really returns one.
pub async fn add_calendar(db: &DatabaseConnection, name: &str, url: &str, color: &str, today: Date) -> Result<calendar::Model> {
    let url = check_url(url)?;
    let name = match name.trim() {
        "" => "Calendar".to_owned(),
        n => n.to_owned(),
    };
    let color = if COLORS.contains(&color) { color.to_owned() } else { "gray".to_owned() };
    let text = fetch(&url).await?;
    // Read it before saving anything, so a wrong link is caught here.
    let events = read(&text, today)?;

    let added = calendar::ActiveModel {
        id: Set(new_id()),
        name: Set(name),
        url: Set(url),
        color: Set(color),
        refreshed_at: Set(Some(Utc::now())),
        problem: Set(None),
        created_at: Set(Utc::now()),
        account_id: Set(None),
        remote_id: Set(None),
        writable: Set(false),
        shown: Set(true),
        publish: Set(false),
        published_hash: Set(None),
        mine: Set(false),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?;
    replace_events(db, &added, events).await?;
    Ok(added)
}

pub async fn remove_calendar(db: &DatabaseConnection, id: &str) -> Result<()> {
    remove_calendars(db, &[id.to_owned()]).await
}

/// Reads every calendar that's due (or all, with `force`), then publishes
/// the plan if it changed. A calendar that can't be read keeps its last
/// events and notes the problem. Returns whether anything was read.
pub async fn refresh_calendars(db: &DatabaseConnection, hub: &accounts::CalendarHub, today: Date, force: bool) -> Result<bool> {
    let _one_at_a_time = accounts::exclusive(hub).await;
    accounts::forget_removed(db, hub).await?;
    let mut refreshed = refresh_links(db, today, force).await?;
    for account in accounts::list_accounts(db).await? {
        refreshed |= accounts::sync_account(db, hub, &account, today, force).await?;
    }
    accounts::publish_plan(db, hub, today, force).await?;
    Ok(refreshed)
}

/// Calendars added by link.
async fn refresh_links(db: &DatabaseConnection, today: Date, force: bool) -> Result<bool> {
    let due = chrono::Duration::minutes(STALE_MINUTES);
    let mut refreshed = false;
    for cal in list_calendars(db).await?.into_iter().filter(|c| c.account_id.is_none()) {
        if !force && cal.refreshed_at.is_some_and(|at| Utc::now() - at < due) {
            continue;
        }
        let outcome = match fetch(&cal.url).await {
            Ok(text) => read(&text, today),
            Err(e) => Err(e),
        };
        let mut active: calendar::ActiveModel = cal.clone().into();
        active.refreshed_at = Set(Some(Utc::now()));
        match outcome {
            Ok(events) => {
                replace_events(db, &cal, events).await?;
                active.problem = Set(None);
            }
            Err(e) => active.problem = Set(Some(e.to_string())),
        }
        active.update(db).await?;
        refreshed = true;
    }
    Ok(refreshed)
}

/// Events for one day, all-day ones first.
pub async fn events_on(db: &impl sea_orm::ConnectionTrait, day: Date) -> Result<Vec<event::Model>> {
    Ok(event::Entity::find()
        .filter(event::Column::Day.eq(day))
        .order_by_desc(event::Column::AllDay)
        .order_by_asc(event::Column::StartMinute)
        .all(db)
        .await?)
}

/// The events in a calendar's text around `today`, in this computer's time zone.
pub(super) fn read(text: &str, today: Date) -> Result<Vec<ics::DayEvent>> {
    ics::day_events(text, today - Days::new(DAYS_BACK), today + Days::new(DAYS_AHEAD), rrule::Tz::LOCAL).map_err(Error::Invalid)
}

pub(super) async fn replace_events(db: &DatabaseConnection, cal: &calendar::Model, events: Vec<ics::DayEvent>) -> Result<()> {
    let txn = db.begin().await?;
    event::Entity::delete_many().filter(event::Column::CalendarId.eq(cal.id.as_str())).exec(&txn).await?;
    let mut used = std::collections::HashSet::new();
    let ids: Vec<String> = events
        .iter()
        .map(|e| {
            // The same id each refresh, so an event open in the panel stays
            // open, even after its time is changed.
            let base = format!("{}:{}:{}", cal.id, e.uid, e.day);
            let mut id = base.clone();
            let mut n = 1;
            while !used.insert(id.clone()) {
                n += 1;
                id = format!("{base}:{n}");
            }
            id
        })
        .collect();
    for (chunk, chunk_ids) in events.chunks(200).zip(ids.chunks(200)) {
        let rows = chunk.iter().zip(chunk_ids).map(|(e, id)| event::ActiveModel {
            id: Set(id.clone()),
            calendar_id: Set(cal.id.clone()),
            day: Set(e.day),
            start_minute: Set(e.start_minute),
            duration_minutes: Set(e.duration_minutes),
            all_day: Set(e.all_day),
            busy: Set(e.busy),
            title: Set(e.title.clone()),
            color: Set(cal.color.clone()),
            remote_id: Set(Some(e.uid.clone())),
            start_at: Set(Some(e.start_at)),
            end_at: Set(Some(e.end_at)),
            location: Set(e.details.location.clone()),
            description: Set(e.details.description.clone()),
            link: Set(e.details.link.clone()),
            recurring: Set(e.details.recurring),
            editable: Set(e.editable),
        });
        event::Entity::insert_many(rows).exec(&txn).await?;
    }
    txn.commit().await?;
    Ok(())
}

/// Accepts https (and webcal, which is https by another name) links.
fn check_url(url: &str) -> Result<String> {
    let url = url.trim();
    let url = match url.strip_prefix("webcal://") {
        Some(rest) => format!("https://{rest}"),
        None => url.to_owned(),
    };
    if !url.starts_with("https://") || url.len() < 12 || url.contains(char::is_whitespace) {
        return Err(Error::Invalid("Paste the calendar's secret iCal address: a link starting with https:// or webcal://.".into()));
    }
    Ok(url)
}

async fn fetch(url: &str) -> Result<String> {
    let unreachable = |_| Error::Invalid("Couldn't reach that calendar. Check the link and your connection.".into());
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("Axiom/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(unreachable)?;
    let mut response = client.get(url).send().await.map_err(unreachable)?;
    if !response.status().is_success() {
        return Err(Error::Invalid(match response.status().as_u16() {
            401 | 403 | 404 => "That calendar link didn't work. It may have been reset: copy the secret address again.".into(),
            code => format!("The calendar couldn't be read just now (error {code}). Try again later."),
        }));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(unreachable)? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BYTES {
            return Err(Error::Invalid("That link returned far more than a calendar. Check it's the iCal address.".into()));
        }
    }
    Ok(String::from_utf8_lossy(&body).into_owned())
}

#[cfg(test)]
mod tests;
