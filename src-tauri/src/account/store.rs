//! Where the sign-in is kept between launches: the operating system's
//! credential store (Windows Credential Manager, macOS Keychain, Secret
//! Service on Linux), never a plain file.

use axiom_protocol::User;
use serde::{Deserialize, Serialize};

/// What's remembered: enough to stay signed in and to show who you are offline.
#[derive(Clone, Serialize, Deserialize)]
pub struct Saved {
    pub refresh_token: String,
    pub user: User,
}

pub trait SessionStore: Send + Sync {
    fn load(&self) -> Option<Saved>;
    fn save(&self, saved: &Saved) -> Result<(), String>;
    fn clear(&self);
}

/// Matches the app identifier in tauri.conf.json.
const SERVICE: &str = "app.axiom.desktop";
/// Development builds talk to a local server, so they keep a separate sign-in.
const ENTRY: &str = if cfg!(debug_assertions) { "account-dev" } else { "account" };

pub struct Keychain;

impl Keychain {
    fn entry() -> Option<keyring::Entry> {
        keyring::Entry::new(SERVICE, ENTRY).ok()
    }
}

impl SessionStore for Keychain {
    fn load(&self) -> Option<Saved> {
        let json = Self::entry()?.get_password().ok()?;
        serde_json::from_str(&json).ok()
    }

    fn save(&self, saved: &Saved) -> Result<(), String> {
        let json = serde_json::to_string(saved).map_err(|e| e.to_string())?;
        Self::entry()
            .ok_or("This computer's credential store isn't available.")?
            .set_password(&json)
            .map_err(|e| format!("Couldn't save your sign-in: {e}"))
    }

    fn clear(&self) {
        if let Some(entry) = Self::entry() {
            let _ = entry.delete_credential();
        }
    }
}

/// Keeps the sign-in in memory only. For tests.
#[cfg(test)]
#[derive(Default, Clone)]
pub struct Memory(pub std::sync::Arc<std::sync::Mutex<Option<Saved>>>);

#[cfg(test)]
impl SessionStore for Memory {
    fn load(&self) -> Option<Saved> {
        self.0.lock().unwrap().clone()
    }

    fn save(&self, saved: &Saved) -> Result<(), String> {
        *self.0.lock().unwrap() = Some(saved.clone());
        Ok(())
    }

    fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }
}
