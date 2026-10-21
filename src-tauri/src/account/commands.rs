//! The account commands React calls, wrapped by `src/lib/account.ts`.

use tauri::{AppHandle, Emitter, State};

use super::{Account, AccountStatus, DeviceView};
use crate::db::Db;
use crate::error::Result;
use crate::sync::{self, SyncEngine};

#[tauri::command]
pub async fn account_status(account: State<'_, Account>) -> Result<AccountStatus> {
    Ok(account.status().await)
}

#[tauri::command]
pub async fn account_sign_up(
    account: State<'_, Account>,
    engine: State<'_, SyncEngine>,
    email: String,
    password: String,
) -> Result<AccountStatus> {
    let status = account.sign_up(&email, &password).await?;
    engine.wake();
    Ok(status)
}

#[tauri::command]
pub async fn account_sign_in(
    account: State<'_, Account>,
    engine: State<'_, SyncEngine>,
    email: String,
    password: String,
) -> Result<AccountStatus> {
    let status = account.sign_in(&email, &password).await?;
    engine.wake();
    Ok(status)
}

/// Signs out. With `keep_data` false, also deletes the synced data from this
/// computer (it stays in the account).
#[tauri::command]
pub async fn account_sign_out(
    app: AppHandle,
    account: State<'_, Account>,
    engine: State<'_, SyncEngine>,
    db: State<'_, Db>,
    keep_data: bool,
) -> Result<AccountStatus> {
    let status = account.sign_out().await;
    if !keep_data {
        sync::local::wipe(&db.conn().await?).await?;
        let _ = app.emit(sync::DATA_CHANGED_EVENT, ());
    }
    engine.wake();
    Ok(status)
}

#[tauri::command]
pub async fn account_request_reset(account: State<'_, Account>, email: String) -> Result<()> {
    account.request_reset(&email).await
}

/// Sets a new password with the emailed code, then signs in.
#[tauri::command]
pub async fn account_reset_password(
    account: State<'_, Account>,
    engine: State<'_, SyncEngine>,
    email: String,
    code: String,
    password: String,
) -> Result<AccountStatus> {
    let status = account.reset_password(&email, &code, &password).await?;
    engine.wake();
    Ok(status)
}

#[tauri::command]
pub async fn account_change_password(account: State<'_, Account>, current: String, new: String) -> Result<()> {
    account.change_password(&current, &new).await
}

#[tauri::command]
pub async fn account_devices(account: State<'_, Account>) -> Result<Vec<DeviceView>> {
    account.devices().await
}

#[tauri::command]
pub async fn account_sign_out_device(account: State<'_, Account>, id: String) -> Result<()> {
    account.sign_out_device(&id).await
}

/// Deletes the account and everything synced to it. The data on this
/// computer stays, no longer linked to any account.
#[tauri::command]
pub async fn account_delete(
    account: State<'_, Account>,
    engine: State<'_, SyncEngine>,
    db: State<'_, Db>,
    password: String,
) -> Result<AccountStatus> {
    account.delete_account(&password).await?;
    sync::local::unlink(&db.conn().await?).await?;
    engine.wake();
    Ok(AccountStatus::SignedOut)
}
