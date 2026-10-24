//! The notifications loop. Every minute (and whenever a setting changes):
//!
//! 1. Anything whose time has come today is shown: listed in the app and
//!    popped up on the desktop, as chosen. Each kind comes once a day.
//! 2. While signed in, the next week's emails are worked out and, when they
//!    differ from what the server has, sent to it to send on time.

use std::collections::HashSet;
use std::sync::RwLock;
use std::time::Duration;

use axiom_protocol::notify::{PlanEmails, PlannedEmail, Unsubscribed};
use chrono::{DateTime, Days, NaiveDateTime, TimeZone, Utc};
use rrule::Tz;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;
use tokio::time::Instant;

use super::entities::note;
use super::kinds::{self, LATE_HOURS};
use super::{CHANGED_EVENT, digests, settings};
use crate::account::Account;
use crate::db::Db;
use crate::error::Result;

const TICK: Duration = Duration::from_secs(60);
/// How often the email plan is worked out again when nothing's changed.
const REPLAN: Duration = Duration::from_secs(10 * 60);
/// The plan always resends at least this often, in case the server lost it.
const RESEND: Duration = Duration::from_secs(60 * 60);
const PLAN_DAYS: u64 = 7;
/// Ticks to wait for the app to say which extensions are off, before going
/// ahead as if none were.
const WAIT_FOR_APP: u32 = 3;
/// Notifications older than this are cleared away.
const KEEP_DAYS: i64 = 30;

/// Extensions switched off in the app: they send nothing, anywhere.
pub type Off = HashSet<String>;

/// Kept in Tauri's managed state.
#[derive(Default)]
pub struct Notifier {
    wake: Notify,
    /// Which extensions are off, as the app last said; None until it has.
    off: RwLock<Option<Off>>,
}

impl Notifier {
    /// Check now rather than at the next minute.
    pub fn wake(&self) {
        self.wake.notify_one();
    }

    /// The app says which extensions are switched off (on start, and when
    /// one is switched).
    pub fn set_off(&self, off: Off) {
        *self.off.write().unwrap_or_else(|e| e.into_inner()) = Some(off);
        self.wake();
    }

    pub fn off(&self) -> Option<Off> {
        self.off.read().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

/// Whether a notification's extension is switched on.
pub fn sends(kind: &str, off: &Off) -> bool {
    kinds::find(kind).is_none_or(|k| !off.contains(k.extension))
}

/// A notification just come due.
#[derive(Debug)]
pub struct Fresh {
    pub note: note::Model,
    pub desktop: bool,
}

/// Shows what's come due at `now` (local time): each kind once a day, from
/// its time until `LATE_HOURS` after. Nothing from extensions that are `off`.
pub async fn come_due(db: &DatabaseConnection, now: NaiveDateTime, off: &Off) -> Result<Vec<Fresh>> {
    let today = now.date();
    let mut fresh = Vec::new();
    for channels in settings::all(db).await? {
        let Some(kind) = kinds::find(&channels.kind).filter(|k| !off.contains(k.extension)) else { continue };
        if !channels.in_app && !channels.desktop {
            continue;
        }
        let Some(at) = kind.at(today) else { continue };
        if now < at || now > at + chrono::Duration::hours(LATE_HOURS) {
            continue;
        }
        let id = format!("{}:{today}", kind.id);
        if note::Entity::find_by_id(id.as_str()).one(db).await?.is_some() {
            continue;
        }
        let Some(digest) = digests::digest(db, kind.id, today, true).await? else { continue };
        let (title, body) = digest.headline();
        let made = note::ActiveModel {
            id: Set(id),
            kind: Set(kind.id.into()),
            title: Set(title),
            body: Set(body),
            in_app: Set(channels.in_app),
            created_at: Set(Utc::now()),
            read_at: Set(None),
        };
        let made = sea_orm::ActiveModelTrait::insert(made, db).await?;
        fresh.push(Fresh { note: made, desktop: channels.desktop });
    }
    note::Entity::delete_many().filter(note::Column::CreatedAt.lt(Utc::now() - chrono::Duration::days(KEEP_DAYS))).exec(db).await?;
    Ok(fresh)
}

/// The emails for the next week, from `now` (local time in `zone`). None
/// from extensions that are `off`: sending a plan without them takes back
/// any the server was holding.
pub async fn plan(db: &DatabaseConnection, now: NaiveDateTime, zone: Tz, off: &Off) -> Result<Vec<PlannedEmail>> {
    let mut emails = Vec::new();
    for channels in settings::all(db).await?.into_iter().filter(|c| c.email) {
        let Some(kind) = kinds::find(&channels.kind).filter(|k| k.email && !off.contains(k.extension)) else { continue };
        for offset in 0..PLAN_DAYS {
            let day = now.date() + Days::new(offset);
            let Some(at) = kind.at(day).filter(|at| *at > now) else { continue };
            let Some(send_at) = utc(zone, at) else { continue };
            // Routines are only laid out for the days you'd see them anyway.
            if let Some(digest) = digests::digest(db, kind.id, day, offset <= 1).await? {
                emails.push(PlannedEmail { key: format!("{}:{day}", kind.id), send_at, digest });
            }
        }
    }
    Ok(emails)
}

fn utc(zone: Tz, at: NaiveDateTime) -> Option<DateTime<Utc>> {
    zone.from_local_datetime(&at).earliest().map(|t| t.with_timezone(&Utc))
}

/// Matches the app to links clicked in emails: a kind unsubscribed from
/// there is switched off here, unless it was switched back on since. Returns
/// the kinds switched back on (for the server to resubscribe), and whether
/// anything was switched off.
pub async fn reconcile(db: &DatabaseConnection, unsubscribed: &[Unsubscribed]) -> Result<(Vec<String>, bool)> {
    let current = settings::all(db).await?;
    let (mut resubscribe, mut switched_off) = (Vec::new(), false);
    for u in unsubscribed {
        let Some(c) = current.iter().find(|c| c.kind == u.kind) else { continue };
        if !c.email {
            continue;
        }
        if c.changed_at.is_some_and(|at| at > u.at) {
            resubscribe.push(u.kind.clone());
        } else {
            settings::set(db, &u.kind, "email", false).await?;
            switched_off = true;
        }
    }
    Ok((resubscribe, switched_off))
}

/// Starts the loop. Call once the database is open.
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(run(app));
}

async fn run(app: AppHandle) {
    let (notifier, db, account) = (app.state::<Notifier>(), app.state::<Db>(), app.state::<Account>());
    let Ok(conn) = db.conn().await else { return };
    // What the server has: the plan's fingerprint, and when it was sent.
    let mut sent: Option<(String, Instant)> = None;
    let mut planned_at: Option<Instant> = None;
    let mut waited = 0;
    loop {
        let asked = tokio::select! {
            _ = notifier.wake.notified() => true,
            _ = tokio::time::sleep(TICK) => false,
        };
        let now = chrono::Local::now().naive_local();

        // Nothing goes out until the app has said which extensions are off
        // (it does as it opens), so a switched-off one can't slip through.
        let off = match notifier.off() {
            Some(off) => off,
            None if waited < WAIT_FOR_APP => {
                waited += 1;
                continue;
            }
            None => Off::new(),
        };

        match come_due(&conn, now, &off).await {
            Ok(fresh) if !fresh.is_empty() => {
                for f in fresh.iter().filter(|f| f.desktop) {
                    show_on_desktop(&app, &f.note);
                }
                if fresh.iter().any(|f| f.note.in_app) {
                    let _ = app.emit(CHANGED_EVENT, ());
                }
            }
            Ok(_) => {}
            Err(e) => eprintln!("notifications: {e}"),
        }

        if account.user_id().await.is_none() {
            sent = None;
            continue;
        }
        if !asked && planned_at.is_some_and(|at| at.elapsed() < REPLAN) {
            continue;
        }
        planned_at = Some(Instant::now());
        if let Err(e) = send_plan(&conn, &account, now, &off, &mut sent, asked).await {
            eprintln!("notifications: couldn't plan emails: {e}");
        }
    }
}

async fn send_plan(conn: &DatabaseConnection, account: &Account, now: NaiveDateTime, off: &Off, sent: &mut Option<(String, Instant)>, force: bool) -> Result<()> {
    let emails = plan(conn, now, Tz::LOCAL, off).await?;
    let mut fingerprint = serde_json::to_string(&emails).unwrap_or_default();
    let fresh = sent.as_ref().is_some_and(|(f, at)| *f == fingerprint && at.elapsed() < RESEND);
    if fresh && !force {
        return Ok(());
    }
    let result = account.plan_emails(&PlanEmails { emails, resubscribe: Vec::new() }).await?;
    let (resubscribe, switched_off) = reconcile(conn, &result.unsubscribed).await?;
    if !resubscribe.is_empty() || switched_off {
        // Again with the settings as they are now, and resubscribing what was
        // switched back on.
        let emails = plan(conn, now, Tz::LOCAL, off).await?;
        fingerprint = serde_json::to_string(&emails).unwrap_or_default();
        account.plan_emails(&PlanEmails { emails, resubscribe }).await?;
    }
    *sent = Some((fingerprint, Instant::now()));
    Ok(())
}

fn show_on_desktop(app: &AppHandle, note: &note::Model) {
    use tauri_plugin_notification::NotificationExt;
    let title = match kinds::find(&note.kind).map(|k| k.extension) {
        Some("project_board") => format!("Project Board · {}", note.title),
        Some("daily_plan") => format!("Daily Plan · {}", note.title),
        Some("uni") => format!("University · {}", note.title),
        Some("reading") => format!("Reading · {}", note.title),
        Some("finance") => format!("Finance · {}", note.title),
        Some("journal") => format!("Journal · {}", note.title),
        Some("birthdays") => format!("Birthdays · {}", note.title),
        Some("goals") => format!("Goals · {}", note.title),
        Some("learning") => format!("Learning · {}", note.title),
        _ => note.title.clone(),
    };
    if let Err(e) = app.notification().builder().title(title).body(&note.body).show() {
        eprintln!("notifications: couldn't show on the desktop: {e}");
    }
}
