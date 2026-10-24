//! The account commands React calls, wrapped by `src/lib/account.ts`.

use tauri::{AppHandle, Emitter, State};

use super::{Account, AccountStatus, AdminAccountView, AdminSettingsView, DeviceView, ProfileView, SignUpOutcome};
use crate::db::Db;
use crate::error::Result;
use crate::sync::{self, SyncEngine};
use crate::vault::Vault;

#[tauri::command]
pub async fn account_status(account: State<'_, Account>) -> Result<AccountStatus> {
    Ok(account.status().await)
}

#[tauri::command]
pub async fn account_sign_up(
    account: State<'_, Account>,
    vault: State<'_, Vault>,
    engine: State<'_, SyncEngine>,
    email: String,
    password: String,
) -> Result<SignUpOutcome> {
    let status = account.sign_up(&email, &password).await?;
    if matches!(status, SignUpOutcome::SignedIn { .. }) {
        vault.after_sign_in(&account, &password).await;
    }
    engine.wake();
    Ok(status)
}

#[tauri::command]
pub async fn account_sign_in(
    account: State<'_, Account>,
    vault: State<'_, Vault>,
    engine: State<'_, SyncEngine>,
    email: String,
    password: String,
) -> Result<AccountStatus> {
    let status = account.sign_in(&email, &password).await?;
    vault.after_sign_in(&account, &password).await;
    engine.wake();
    Ok(status)
}

/// Signs out. With `keep_data` false, also deletes the synced data from this
/// computer (it stays in the account).
#[tauri::command]
pub async fn account_sign_out(
    app: AppHandle,
    account: State<'_, Account>,
    vault: State<'_, Vault>,
    engine: State<'_, SyncEngine>,
    db: State<'_, Db>,
    keep_data: bool,
) -> Result<AccountStatus> {
    let status = account.sign_out().await;
    vault.forget();
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
    vault: State<'_, Vault>,
    engine: State<'_, SyncEngine>,
    email: String,
    code: String,
    password: String,
) -> Result<AccountStatus> {
    let status = account.reset_password(&email, &code, &password).await?;
    vault.after_sign_in(&account, &password).await;
    engine.wake();
    Ok(status)
}

#[tauri::command]
pub async fn account_change_password(account: State<'_, Account>, vault: State<'_, Vault>, current: String, new: String) -> Result<()> {
    // The encryption key, wrapped with the new password, is saved with it.
    let wrapped = vault.wrapped_for(&account, &new).await?;
    account.change_password(&current, &new, wrapped).await
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
    vault: State<'_, Vault>,
    engine: State<'_, SyncEngine>,
    db: State<'_, Db>,
    password: String,
) -> Result<AccountStatus> {
    account.delete_account(&password).await?;
    vault.forget();
    sync::local::unlink(&db.conn().await?).await?;
    engine.wake();
    Ok(AccountStatus::SignedOut)
}

/// Every account on the server, for an admin: the waiting list, then everyone approved.
#[tauri::command]
pub async fn account_admin_accounts(account: State<'_, Account>) -> Result<Vec<AdminAccountView>> {
    account.admin_accounts().await
}

/// Lets an account on the waiting list in. The server emails them.
#[tauri::command]
pub async fn account_admin_approve(account: State<'_, Account>, id: String) -> Result<()> {
    account.approve(&id).await
}

/// Turns down an account on the waiting list, deleting it.
#[tauri::command]
pub async fn account_admin_decline(account: State<'_, Account>, id: String) -> Result<()> {
    account.decline(&id).await
}

/// Puts an approved account back on the waiting list and signs it out everywhere.
#[tauri::command]
pub async fn account_admin_revoke(account: State<'_, Account>, id: String) -> Result<()> {
    account.revoke(&id).await
}

#[tauri::command]
pub async fn account_profile(account: State<'_, Account>) -> Result<ProfileView> {
    account.profile().await
}

/// Replaces the name and picture; an empty name shows the email instead.
#[tauri::command]
pub async fn account_update_profile(account: State<'_, Account>, display_name: Option<String>, avatar: Option<String>) -> Result<ProfileView> {
    account.update_profile(display_name, avatar).await
}

/// Changes an account's role ("member" or "admin") or permissions, for an admin.
#[tauri::command]
pub async fn account_admin_update(
    account: State<'_, Account>,
    id: String,
    role: Option<axiom_protocol::AccountRole>,
    permissions: Option<Vec<String>>,
) -> Result<AdminAccountView> {
    account.admin_update(&id, role, permissions).await
}

/// The server's settings: the waiting list and new accounts' permissions.
#[tauri::command]
pub async fn account_admin_settings(account: State<'_, Account>) -> Result<AdminSettingsView> {
    account.admin_settings().await
}

#[tauri::command]
pub async fn account_admin_save_settings(account: State<'_, Account>, settings: AdminSettingsView) -> Result<AdminSettingsView> {
    account.save_admin_settings(settings).await
}
