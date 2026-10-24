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
//!
//! Shared boards (see `spaces`) sync the same way, with the board instead
//! of the account: their rows are pushed to and pulled from the board.

mod commands;
pub mod local;
pub mod migrations;
pub mod sharing;
pub mod spaces;
#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;
use std::time::Duration;

use axiom_protocol::{PushRequest, Record, RecordRef, Role, SYNC_BATCH};
use chrono::{DateTime, Utc};
use sea_orm::{DatabaseConnection, DbErr};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;
use tokio::time::Instant;

use crate::account::{Account, ServerError};
use crate::vault::DataKey;
use crate::db::Db;
pub use commands::*;
use local::{Cursor, Link};

/// Tables whose rows are end-to-end encrypted (see `crate::vault`): sealed
/// before they're pushed and opened after they're pulled. While this computer
/// is locked, their edits wait here and pulled rows are set aside.
pub static ENCRYPTED: LazyLock<Vec<&'static str>> =
    LazyLock::new(|| [crate::features::finance::SYNCED_TABLES, crate::features::journal::SYNCED_TABLES, crate::features::notes::SYNCED_TABLES, crate::features::birthdays::SYNCED_TABLES, crate::features::goals::SYNCED_TABLES].concat());

/// Every table that syncs. Features list their own; add new lists here.
pub static TABLES: LazyLock<Vec<&'static str>> = LazyLock::new(|| {
    [
        crate::features::project_board::SYNCED_TABLES,
        crate::features::daily_plan::SYNCED_TABLES,
        crate::features::reading::SYNCED_TABLES,
        crate::features::uni::SYNCED_TABLES,
        crate::notifications::SYNCED_TABLES,
        crate::features::finance::SYNCED_TABLES,
        crate::features::journal::SYNCED_TABLES,
        crate::features::notes::SYNCED_TABLES,
        crate::features::birthdays::SYNCED_TABLES,
        crate::features::goals::SYNCED_TABLES,
        crate::features::learning::SYNCED_TABLES,
    ]
    .concat()
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
    NeedsChoice { projects: i64, plan_tasks: i64, books: i64, modules: i64 },
    Syncing { last_synced: Option<DateTime<Utc>> },
    Synced { at: DateTime<Utc> },
    Offline { last_synced: Option<DateTime<Utc>> },
    Error { message: String },
}

/// Kept in Tauri's managed state.
pub struct SyncEngine {
    status: std::sync::Mutex<SyncStatus>,
    wake: Notify,
    /// Sync by itself (after edits and every minute), or only when asked.
    auto: std::sync::atomic::AtomicBool,
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self { status: std::sync::Mutex::new(SyncStatus::Off), wake: Notify::new(), auto: true.into() }
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

    pub fn auto(&self) -> bool {
        self.auto.load(std::sync::atomic::Ordering::Relaxed)
    }

    pub fn set_auto(&self, on: bool) {
        self.auto.store(on, std::sync::atomic::Ordering::Relaxed);
        self.wake();
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
    engine.auto.store(local::auto_sync(&conn).await.unwrap_or(true), std::sync::atomic::Ordering::Relaxed);
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
        // With auto sync off, only "Sync now" (or signing in) syncs.
        let scheduled = engine.auto() && (edited || now >= next_pull);
        if !(asked || scheduled) || (!asked && retry_at.is_some_and(|at| now < at)) {
            continue;
        }

        let key = app.state::<crate::vault::Vault>().key();
        let outcome = sync_once(&conn, &account, key.as_ref(), || engine.set(&app, SyncStatus::Syncing { last_synced })).await;
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
            Ok(Outcome::NeedsChoice { projects, plan_tasks, books, modules }) => {
                engine.set(&app, SyncStatus::NeedsChoice { projects, plan_tasks, books, modules })
            },
            Ok(Outcome::SignedOut) => engine.set(&app, SyncStatus::Off),
            Err(ServerError::SignedOut) => {
                // The server ended the session, so the account signed out.
                engine.set(&app, SyncStatus::Off);
                let _ = app.emit(ACCOUNT_EVENT, account.status().await);
            }
            Err(err) => {
                engine.set(&app, match err {
                    // Refused (e.g. an admin switched syncing off): say why.
                    ServerError::Failed(message) | ServerError::Forbidden(message) => SyncStatus::Error { message },
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
    NeedsChoice { projects: i64, plan_tasks: i64, books: i64, modules: i64 },
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
    key: Option<&DataKey>,
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
                books: local::count_live(db, "reading_books").await?,
                modules: local::count_live(db, "uni_modules").await?,
            });
        }
        // Nothing here to lose: link straight away and download.
        local::link(db, &user_id, Link::Replace).await?;
    }
    on_network();

    // Which boards this account is on, before deciding where rows go.
    let mut applied = refresh_boards(db, account).await?;
    let shared: HashSet<String> = spaces::list(db).await?.into_iter().map(|b| b.id).collect();

    loop {
        // Encrypted tables only go out sealed: without the key they wait.
        let held: &[&str] = if key.is_some() { &[] } else { &ENCRYPTED };
        let mut batch = local::outgoing(db, SYNC_BATCH, held).await?;
        if batch.is_empty() {
            break;
        }
        let mut own = Vec::new();
        let mut boards: HashMap<String, (Vec<_>, Vec<RecordRef>)> = HashMap::new();
        for item in batch.iter_mut() {
            let Some(mut change) = item.change.take() else { continue };
            if let (Some(key), true) = (key, ENCRYPTED.contains(&change.table.as_str())) {
                change.fields = key.seal_fields(&change.table, &change.id, &change.fields);
            }
            let board = match &item.row {
                Some(row) => spaces::project_of(db, &item.table, &item.id, row).await?.filter(|p| shared.contains(p)),
                None => None,
            };
            match board {
                Some(board) => {
                    let (changes, rows) = boards.entry(board).or_default();
                    rows.push(RecordRef { table: item.table.clone(), id: item.id.clone() });
                    changes.push(change);
                }
                None => own.push(change),
            }
        }
        if !own.is_empty() {
            account.push(&PushRequest { changes: own }).await?;
        }
        let mut refused = Vec::new();
        for (board, (changes, rows)) in boards {
            match account.space_push(&board, &PushRequest { changes }).await {
                Ok(_) => {}
                // Your role no longer allows it, or the board went: the
                // board's own version comes back on this sync's pull.
                Err(ServerError::Forbidden(_) | ServerError::Missing(_)) => {
                    refused.extend(rows);
                    spaces::set_cursor(db, &board, 0).await?;
                }
                Err(err) => return Err(err),
            }
        }
        local::pushed(db, &batch).await?;
        spaces::discard_edits(db, &refused).await?;
        if batch.len() < SYNC_BATCH {
            break;
        }
    }

    let mut cursor = local::state(db).await?.cursor;
    loop {
        let page = account.pull(cursor).await?;
        let skip = spaces::shared_rows_in(db, &page.records, &shared).await?;
        let records = local::open_or_stash(db, key, &page.records).await?;
        let keep = records.iter().filter(|r| !skip.contains(&(r.table.clone(), r.id.clone()))).collect();
        applied += local::apply_some(db, keep, Cursor::Account(page.cursor)).await?;
        cursor = page.cursor;
        if !page.more {
            break;
        }
    }

    for board in spaces::list(db).await? {
        let mut cursor = board.cursor;
        loop {
            let page = match account.space_pull(&board.id, cursor).await {
                Ok(page) => page,
                // Removed from it since the list was read: the next sync tidies up.
                Err(ServerError::Missing(_) | ServerError::Forbidden(_)) => break,
                Err(err) => return Err(err),
            };
            // Cards in this page that pass the check themselves: a checklist
            // item may hang off one of them. (Trusting every card in the page
            // would let one claim someone's private card, and then attach
            // items to it.)
            let mut tasks_in_page: HashMap<String, String> = HashMap::new();
            for card in page.records.iter().filter(|r| r.table == "project_board_tasks") {
                if spaces::belongs(db, &board.id, card, &HashMap::new()).await? {
                    tasks_in_page.insert(card.id.clone(), board.id.clone());
                }
            }
            let mut keep: Vec<&Record> = Vec::new();
            for record in &page.records {
                if spaces::belongs(db, &board.id, record, &tasks_in_page).await? {
                    keep.push(record);
                } else {
                    eprintln!("sync: ignored {}/{} from a shared board it isn't part of", record.table, record.id);
                }
            }
            applied += local::apply_some(db, keep, Cursor::Board(&board.id, page.cursor)).await?;
            cursor = page.cursor;
            if !page.more {
                break;
            }
        }
    }

    local::mark_synced(db, Utc::now()).await?;
    Ok(Outcome::Synced { applied })
}

/// Brings the list of shared boards up to date. A board you've left (or
/// that stopped being shared) leaves this computer, unless it's yours: then
/// it goes back to being one of your own projects. Returns how many boards
/// were removed here.
async fn refresh_boards(db: &DatabaseConnection, account: &Account) -> Result<usize, ServerError> {
    let found = match account.spaces().await {
        Ok(found) => found,
        // A server from before shared boards.
        Err(ServerError::Missing(_)) => return Ok(0),
        Err(err) => return Err(err),
    };
    let ids: HashSet<&str> = found.iter().map(|s| s.id.as_str()).collect();
    let mut removed = 0;
    for gone in spaces::list(db).await?.into_iter().filter(|b| !ids.contains(b.id.as_str())) {
        if gone.role == Role::Owner {
            spaces::make_personal(db, &gone.id).await?;
        } else {
            spaces::remove_board(db, &gone.id).await?;
            removed += 1;
        }
    }
    for space in &found {
        spaces::upsert(db, space).await?;
    }
    Ok(removed)
}
