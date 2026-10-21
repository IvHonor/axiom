//! Sync: copies the local database to the account and back, in the background.
//!
//! The local database stays the source of truth for the app; nothing ever
//! waits on the network. A loop here:
//!
//! 1. **Pushes** rows changed on this device (found by triggers, see `local`),
//!    sending only the fields that changed.
//! 2. **Pulls** rows other devices changed since the last pull.
//!
//! It runs at launch, a few seconds after any edit, every minute, and when
//! the app asks (signing in, coming back online). The server merges per
//! field, so two devices editing different fields of a task both keep theirs.

mod commands;
pub mod local;
pub mod migrations;
#[cfg(test)]
mod tests;

use std::sync::LazyLock;
use std::time::Duration;

use axiom_protocol::{PushRequest, SYNC_BATCH};
use chrono::{DateTime, Utc};
use sea_orm::{DatabaseConnection, DbErr};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;
use tokio::time::Instant;

use crate::account::{Account, ServerError};
use crate::db::Db;
pub use commands::*;
use local::Link;

/// Every table that syncs. Features list their own; add new lists here.
pub static TABLES: LazyLock<Vec<&'static str>> = LazyLock::new(|| {
    [crate::features::project_board::SYNCED_TABLES, crate::features::daily_plan::SYNCED_TABLES].concat()
});

/// How often the loop looks for local edits.
const TICK: Duration = Duration::from_secs(3);
/// How often to pull other devices' changes when nothing happens here.
const PULL_EVERY: Duration = Duration::from_secs(60);

/// Events sent to React.
pub const STATUS_EVENT: &str = "sync-status";
pub const DATA_CHANGED_EVENT: &str = "data-changed";
pub const ACCOUNT_EVENT: &str = "account-changed";

/// What sync is doing, for the status bar. Mirrored by `SyncStatus` in `src/lib/sync.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum SyncStatus {
    /// Signed out.
    Off,
    /// This computer has data that isn't in the account yet; the user decides
    /// whether to upload it or replace it (see `Link`).
    NeedsChoice { projects: i64, plan_tasks: i64 },
    Syncing { last_synced: Option<DateTime<Utc>> },
    Synced { at: DateTime<Utc> },
    Offline { last_synced: Option<DateTime<Utc>> },
    Error { message: String },
}

/// Kept in Tauri's managed state.
pub struct SyncEngine {
    status: std::sync::Mutex<SyncStatus>,
    wake: Notify,
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self { status: std::sync::Mutex::new(SyncStatus::Off), wake: Notify::new() }
    }
}

impl SyncEngine {
    pub fn status(&self) -> SyncStatus {
        self.status.lock().unwrap().clone()
    }

    /// Sync now rather than at the next scheduled time.
    pub fn wake(&self) {
        self.wake.notify_one();
    }

    fn set(&self, app: &AppHandle, status: SyncStatus) {
        let mut current = self.status.lock().unwrap();
        if *current != status {
            *current = status.clone();
            let _ = app.emit(STATUS_EVENT, status);
        }
    }
}

/// Starts the background loop. Call once the database is open.
pub fn start(app: AppHandle) {
    app.state::<SyncEngine>().wake();
    tauri::async_runtime::spawn(run(app));
}

async fn run(app: AppHandle) {
    let (engine, db, account) = (app.state::<SyncEngine>(), app.state::<Db>(), app.state::<Account>());
    let Ok(conn) = db.conn().await else { return };

    let mut last_synced = local::state(&conn).await.ok().and_then(|s| s.last_synced_at);
    let mut next_pull = Instant::now();
    let mut retry_at: Option<Instant> = None;
    let mut backoff = Duration::from_secs(5);

    loop {
        let asked = tokio::select! {
            _ = engine.wake.notified() => true,
            _ = tokio::time::sleep(TICK) => false,
        };
        let now = Instant::now();
        let edited = local::has_pending(&conn).await.unwrap_or(false);
        if !(asked || edited || now >= next_pull) || (!asked && retry_at.is_some_and(|at| now < at)) {
            continue;
        }

        let outcome = sync_once(&conn, &account, || engine.set(&app, SyncStatus::Syncing { last_synced })).await;
        next_pull = Instant::now() + PULL_EVERY;
        match outcome {
            Ok(Outcome::Synced { applied }) => {
                let at = Utc::now();
                last_synced = Some(at);
                engine.set(&app, SyncStatus::Synced { at });
                (retry_at, backoff) = (None, Duration::from_secs(5));
                if applied > 0 {
                    let _ = app.emit(DATA_CHANGED_EVENT, ());
                }
            }
            Ok(Outcome::NeedsChoice { projects, plan_tasks }) => engine.set(&app, SyncStatus::NeedsChoice { projects, plan_tasks }),
            Ok(Outcome::SignedOut) => engine.set(&app, SyncStatus::Off),
            Err(ServerError::SignedOut) => {
                // The server ended the session, so the account signed out.
                engine.set(&app, SyncStatus::Off);
                let _ = app.emit(ACCOUNT_EVENT, account.status().await);
            }
            Err(err) => {
                engine.set(&app, match err {
                    ServerError::Failed(message) => SyncStatus::Error { message },
                    _ => SyncStatus::Offline { last_synced },
                });
                // Back off: 5 s, 10 s, 20 s ... up to a minute.
                retry_at = Some(now + backoff);
                backoff = (backoff * 2).min(PULL_EVERY);
            }
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum Outcome {
    /// `applied` rows changed here.
    Synced { applied: usize },
    NeedsChoice { projects: i64, plan_tasks: i64 },
    SignedOut,
}

impl From<DbErr> for ServerError {
    fn from(err: DbErr) -> Self {
        eprintln!("sync: database error: {err}");
        ServerError::Failed("Couldn't read this computer's data to sync it. Restart Axiom if this keeps happening.".into())
    }
}

/// One full push-then-pull. `on_network` runs just before the first request,
/// so "Syncing" only shows when there's something to sync.
pub async fn sync_once(
    db: &DatabaseConnection,
    account: &Account,
    on_network: impl FnOnce(),
) -> Result<Outcome, ServerError> {
    let Some(user_id) = account.user_id().await else {
        return Ok(Outcome::SignedOut);
    };

    // This computer's data belongs to another account, or to none yet.
    if local::state(db).await?.user_id.as_deref() != Some(user_id.as_str()) {
        if local::live_rows(db).await? > 0 {
            return Ok(Outcome::NeedsChoice {
                projects: local::count_live(db, "project_board_projects").await?,
                plan_tasks: local::count_live(db, "daily_plan_tasks").await?,
            });
        }
        // Nothing here to lose: link straight away and download.
        local::link(db, &user_id, Link::Replace).await?;
    }
    on_network();

    loop {
        let mut batch = local::outgoing(db, SYNC_BATCH).await?;
        if batch.is_empty() {
            break;
        }
        let changes: Vec<_> = batch.iter_mut().filter_map(|o| o.change.take()).collect();
        if !changes.is_empty() {
            account.push(&PushRequest { changes }).await?;
        }
        local::pushed(db, &batch).await?;
        if batch.len() < SYNC_BATCH {
            break;
        }
    }

    let mut cursor = local::state(db).await?.cursor;
    let mut applied = 0;
    loop {
        let page = account.pull(cursor).await?;
        applied += local::apply(db, &page.records, page.cursor).await?;
        cursor = page.cursor;
        if !page.more {
            break;
        }
    }

    local::mark_synced(db, Utc::now()).await?;
    Ok(Outcome::Synced { applied })
}
