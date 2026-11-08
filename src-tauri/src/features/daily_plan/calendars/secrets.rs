//! Calendar sign-ins (OAuth refresh tokens, CalDAV app passwords). Never
//! sent to the window.
//!
//! Each is kept twice: in the system credential store, and in the
//! `daily_plan_calendar_secrets` table, which syncs (end-to-end encrypted)
//! so a calendar connected on one computer works on the others. The table
//! wins when they differ: it has whatever another computer saved last.

use chrono::Utc;
use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement};
use serde::{Deserialize, Serialize};

/// What the synced table has for a calendar account.
#[derive(Debug, PartialEq)]
pub enum Synced {
    /// Nothing: signed in before sign-ins synced, or not yet arrived.
    Missing,
    /// Signed out of on some computer, so on all of them.
    Removed,
    Saved(Secret),
}

pub async fn synced(db: &impl ConnectionTrait, account_id: &str) -> Result<Synced, DbErr> {
    let row = db
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT secret, deleted_at IS NOT NULL AS removed FROM daily_plan_calendar_secrets WHERE id = ?",
            [account_id.into()],
        ))
        .await?;
    let Some(row) = row else { return Ok(Synced::Missing) };
    if row.try_get::<bool>("", "removed")? {
        return Ok(Synced::Removed);
    }
    // One this version can't read counts as missing, so it's replaced.
    Ok(serde_json::from_str(&row.try_get::<String>("", "secret")?).map_or(Synced::Missing, Synced::Saved))
}

/// Saves the sign-in for the account's other computers too.
pub async fn share(db: &impl ConnectionTrait, account_id: &str, secret: &Secret) -> Result<(), DbErr> {
    let json = serde_json::to_string(secret).expect("secrets serialise");
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO daily_plan_calendar_secrets (id, secret, updated_at, deleted_at) VALUES (?, ?, ?, NULL)
         ON CONFLICT (id) DO UPDATE SET secret = excluded.secret, updated_at = excluded.updated_at, deleted_at = NULL
         WHERE daily_plan_calendar_secrets.secret IS NOT excluded.secret OR daily_plan_calendar_secrets.deleted_at IS NOT NULL",
        [account_id.into(), json.into(), Utc::now().into()],
    ))
    .await?;
    Ok(())
}

/// Forgets the sign-in on every computer. The secret goes too, not just
/// marked deleted, so it doesn't linger on the server.
pub async fn unshare(db: &impl ConnectionTrait, account_id: &str) -> Result<(), DbErr> {
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE daily_plan_calendar_secrets SET secret = '', updated_at = ?, deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
        [Utc::now().into(), Utc::now().into(), account_id.into()],
    ))
    .await?;
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Secret {
    /// Google or Microsoft: exchanged for short-lived access tokens.
    OAuth {
        refresh_token: String,
        /// What the user allowed, as the provider last said.
        #[serde(default)]
        scope: Option<String>,
    },
    /// CalDAV (iCloud): an app-specific password.
    Password { username: String, password: String },
}

pub trait SecretStore: Send + Sync {
    fn load(&self, account_id: &str) -> Option<Secret>;
    fn save(&self, account_id: &str, secret: &Secret) -> Result<(), String>;
    fn delete(&self, account_id: &str);
}

/// Matches the app identifier in tauri.conf.json.
const SERVICE: &str = "app.axiom.desktop";

pub struct Keychain;

impl Keychain {
    fn entry(account_id: &str) -> Option<keyring::Entry> {
        // Development builds keep their own entries, like the Axiom sign-in.
        let prefix = if cfg!(debug_assertions) { "calendar-dev" } else { "calendar" };
        keyring::Entry::new(SERVICE, &format!("{prefix}-{account_id}")).ok()
    }
}

impl SecretStore for Keychain {
    fn load(&self, account_id: &str) -> Option<Secret> {
        serde_json::from_str(&Self::entry(account_id)?.get_password().ok()?).ok()
    }

    fn save(&self, account_id: &str, secret: &Secret) -> Result<(), String> {
        let json = serde_json::to_string(secret).map_err(|e| e.to_string())?;
        Self::entry(account_id)
            .ok_or("This computer's credential store isn't available.")?
            .set_password(&json)
            .map_err(|e| format!("Couldn't save the calendar sign-in: {e}"))
    }

    fn delete(&self, account_id: &str) {
        if let Some(entry) = Self::entry(account_id) {
            let _ = entry.delete_credential();
        }
    }
}

/// Keeps sign-ins in memory only. For tests.
#[cfg(test)]
#[derive(Default, Clone)]
pub struct Memory(pub std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Secret>>>);

#[cfg(test)]
impl SecretStore for Memory {
    fn load(&self, account_id: &str) -> Option<Secret> {
        self.0.lock().unwrap().get(account_id).cloned()
    }

    fn save(&self, account_id: &str, secret: &Secret) -> Result<(), String> {
        self.0.lock().unwrap().insert(account_id.to_owned(), secret.clone());
        Ok(())
    }

    fn delete(&self, account_id: &str) {
        self.0.lock().unwrap().remove(account_id);
    }
}
