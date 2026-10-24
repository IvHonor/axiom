//! The sync commands React calls, wrapped by `src/lib/sync.ts`.

use tauri::{AppHandle, Emitter, State};

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

/// Links this computer's data to the signed-in account: `merge` uploads it,
/// `replace` deletes it and downloads the account's data instead.
#[tauri::command]
pub async fn sync_link(
    app: AppHandle,
    engine: State<'_, SyncEngine>,
    db: State<'_, Db>,
    account: State<'_, Account>,
    how: Link,
) -> Result<()> {
    let user_id = account.user_id().await.ok_or_else(|| Error::Account("Sign in first.".into()))?;
    local::link(&db.conn().await?, &user_id, how).await?;
    if how == Link::Replace {
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
