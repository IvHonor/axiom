//! Calendar sign-ins (OAuth refresh tokens, CalDAV app passwords), kept in
//! the system credential store like the Axiom sign-in: never in the
//! database, never sent to the window.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Secret {
    /// Google or Microsoft: exchanged for short-lived access tokens.
    OAuth { refresh_token: String },
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
