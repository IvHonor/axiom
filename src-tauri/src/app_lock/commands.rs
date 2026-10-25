//! The app lock commands React calls, wrapped by `src/lib/appLock.ts`.

use tauri::State;

use super::{AppLock, LockStatus};
use crate::account::{Account, AccountStatus};
use crate::error::{Error, Result};

/// The lock as it stands. Signed out, it's off: a forgotten PIN couldn't be
/// reset by email any more. Answers straight away, even while the account is
/// busy reaching the server, so the lock covers the app as it opens.
#[tauri::command]
pub async fn app_lock_status(lock: State<'_, AppLock>, account: State<'_, Account>) -> Result<LockStatus> {
    if account.status_now() == Some(AccountStatus::SignedOut) {
        lock.forget();
    }
    Ok(lock.status())
}

/// Turns the lock on, or changes its PIN or idle time (the current PIN is needed while it's on).
#[tauri::command]
pub async fn app_lock_set(
    lock: State<'_, AppLock>,
    account: State<'_, Account>,
    current: Option<String>,
    pin: Option<String>,
    idle_minutes: u32,
) -> Result<LockStatus> {
    if account.status().await == AccountStatus::SignedOut {
        return Err(Error::Invalid("Sign in to your Axiom account first, so a forgotten PIN can be reset by email.".into()));
    }
    lock.set(current.as_deref(), pin.as_deref(), idle_minutes)
}

#[tauri::command]
pub fn app_lock_turn_off(lock: State<'_, AppLock>, current: String) -> Result<LockStatus> {
    lock.turn_off(&current)
}

#[tauri::command]
pub fn app_lock_unlock(lock: State<'_, AppLock>, pin: String) -> Result<LockStatus> {
    lock.unlock(&pin)
}

/// Locks now, e.g. after the app's been idle.
#[tauri::command]
pub fn app_lock_lock(lock: State<'_, AppLock>) -> LockStatus {
    lock.lock()
}

/// Emails a code to the account, for a forgotten PIN.
#[tauri::command]
pub async fn app_lock_send_code(account: State<'_, Account>) -> Result<()> {
    account.send_unlock_code().await
}

/// With the emailed code: the lock goes, and a new PIN can be chosen.
#[tauri::command]
pub async fn app_lock_reset(lock: State<'_, AppLock>, account: State<'_, Account>, code: String) -> Result<LockStatus> {
    account.check_unlock_code(&code).await?;
    lock.forget();
    Ok(lock.status())
}
