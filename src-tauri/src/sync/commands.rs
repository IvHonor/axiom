//! The sync commands React calls, wrapped by `src/lib/sync.ts`.

use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager, State};

use super::backup::{self, Backup};
use super::local::{self, Link};
use super::{DATA_CHANGED_EVENT, SyncEngine, SyncStatus};
use crate::account::Account;
use crate::db::Db;
use crate::error::{Error, Result};

#[tauri::command]
pub fn sync_status(engine: State<'_, SyncEngine>) -> SyncStatus {
    engine.status()
}

#[tauri::command]
pub fn sync_now(engine: State<'_, SyncEngine>) {
    engine.wake();
}

/// Settles a sync choice (see `Link`): on linking this computer to the
/// signed-in account, or signing back in with changes made while signed out.
/// A copy of the data here is taken first, so it can be brought back.
#[tauri::command]
pub async fn sync_link(
    app: AppHandle,
    engine: State<'_, SyncEngine>,
    db: State<'_, Db>,
    account: State<'_, Account>,
    how: Link,
) -> Result<()> {
    let user_id = account.user_id().await.ok_or_else(|| Error::Account("Sign in first.".into()))?;
    let conn = db.conn().await?;
    backup::take(&conn, &backups(&app)?).await.map_err(|err| {
        eprintln!("sync: couldn't take a backup: {err}");
        Error::Unavailable("Couldn't save a copy of this computer's data first, so nothing was changed. Check there's free disk space and try again.".into())
    })?;
    local::resolve(&conn, &user_id, how).await?;
    if how != Link::Merge {
        let _ = app.emit(DATA_CHANGED_EVENT, ());
    }
    engine.wake();
    Ok(())
}

/// Whether this computer syncs by itself.
#[tauri::command]
pub fn sync_auto(engine: State<'_, SyncEngine>) -> bool {
    engine.auto()
}

/// Switches syncing by itself on or off for this computer.
#[tauri::command]
pub async fn sync_set_auto(engine: State<'_, SyncEngine>, db: State<'_, Db>, on: bool) -> Result<()> {
    local::set_auto_sync(&db.conn().await?, on).await?;
    engine.set_auto(on);
    Ok(())
}

/// The copy taken at the last sync choice, if it's less than a week old.
#[tauri::command]
pub fn sync_backup(app: AppHandle) -> Result<Option<Backup>> {
    Ok(backup::latest(&backups(&app)?))
}

/// Puts this computer's data back as it was in that copy, and syncs it.
/// Returns how many rows came back.
#[tauri::command]
pub async fn sync_restore_backup(app: AppHandle, engine: State<'_, SyncEngine>, db: State<'_, Db>) -> Result<usize> {
    let copy = backup::latest(&backups(&app)?).ok_or(Error::NotFound("Backup"))?;
    let restored = backup::restore(&db.conn().await?, &copy).await?;
    let _ = app.emit(DATA_CHANGED_EVENT, ());
    engine.wake();
    Ok(restored)
}

/// Where sync-choice copies are kept, next to the database.
fn backups(app: &AppHandle) -> Result<PathBuf> {
    let data = app.path().app_data_dir().map_err(|e| Error::Unavailable(format!("Can't find Axiom's data folder: {e}")))?;
    Ok(data.join("backups"))
}
