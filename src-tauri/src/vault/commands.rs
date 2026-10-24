//! Encryption commands for React, wrapped by `src/lib/vault.ts`.

use tauri::{AppHandle, Emitter, State};

use super::{Vault, VaultStatus};
use crate::account::Account;
use crate::db::Db;
use crate::error::Result;
use crate::sync::{self, SyncEngine};

/// Sent to React when encrypted data is unlocked or locked.
pub const CHANGED_EVENT: &str = "vault-changed";

#[tauri::command]
pub fn vault_status(vault: State<'_, Vault>) -> VaultStatus {
    vault.status()
}

/// Once unlocked, what arrived while locked is applied and syncing resumes.
async fn unlocked(app: &AppHandle, db: &Db, vault: &Vault, engine: &SyncEngine) -> Result<()> {
    if let Some(key) = vault.key() {
        let applied = sync::local::apply_stash(&db.conn().await?, &key).await?;
        if applied > 0 {
            let _ = app.emit(sync::DATA_CHANGED_EVENT, ());
        }
    }
    let _ = app.emit(CHANGED_EVENT, vault.status());
    engine.wake();
    Ok(())
}

/// Unlocks with the password: for a computer signed in before encryption.
#[tauri::command]
pub async fn vault_unlock(app: AppHandle, db: State<'_, Db>, vault: State<'_, Vault>, account: State<'_, Account>, engine: State<'_, SyncEngine>, password: String) -> Result<VaultStatus> {
    let outcome = vault.unlock_with_password(&account, &password).await;
    let _ = app.emit(CHANGED_EVENT, vault.status());
    outcome?;
    unlocked(&app, &db, &vault, &engine).await?;
    Ok(vault.status())
}

/// Unlocks with the recovery code after a password reset.
#[tauri::command]
pub async fn vault_recover(
    app: AppHandle,
    db: State<'_, Db>,
    vault: State<'_, Vault>,
    account: State<'_, Account>,
    engine: State<'_, SyncEngine>,
    code: String,
    password: String,
) -> Result<VaultStatus> {
    vault.unlock_with_recovery(&account, &code, &password).await?;
    unlocked(&app, &db, &vault, &engine).await?;
    Ok(vault.status())
}

/// Starts over with a new key when the old one can't be opened: the account's
/// encrypted data is replaced by this computer's.
#[tauri::command]
pub async fn vault_start_over(
    app: AppHandle,
    db: State<'_, Db>,
    vault: State<'_, Vault>,
    account: State<'_, Account>,
    engine: State<'_, SyncEngine>,
    password: String,
) -> Result<VaultStatus> {
    vault.start_over(&account, &password).await?;
    let conn = db.conn().await?;
    sync::local::forget_stash(&conn).await?;
    sync::local::requeue(&conn, &sync::ENCRYPTED).await?;
    let _ = app.emit(CHANGED_EVENT, vault.status());
    engine.wake();
    Ok(vault.status())
}

/// The recovery code, after confirming the password.
#[tauri::command]
pub async fn vault_recovery_code(vault: State<'_, Vault>, account: State<'_, Account>, password: String) -> Result<String> {
    vault.recovery_code(&account, &password).await
}
