//! Where this computer keeps the data key: the system's credential store,
//! next to the sign-in (see `account::store`), never a plain file.

pub trait KeyStore: Send + Sync {
    fn load(&self) -> Option<String>;
    fn save(&self, key: &str) -> Result<(), String>;
    fn clear(&self);
}

const SERVICE: &str = "app.axiom.desktop";

/// One entry in the system's credential store.
pub struct Keychain(&'static str);

impl Keychain {
    /// The data key. Development builds talk to a local server, so they keep their own.
    pub const VAULT: Keychain = Keychain(if cfg!(debug_assertions) { "vault-dev" } else { "vault" });
    /// The app lock's PIN (see `crate::app_lock`).
    pub const APP_LOCK: Keychain = Keychain(if cfg!(debug_assertions) { "app-lock-dev" } else { "app-lock" });

    fn entry(&self) -> Option<keyring::Entry> {
        keyring::Entry::new(SERVICE, self.0).ok()
    }
}

impl KeyStore for Keychain {
    fn load(&self) -> Option<String> {
        self.entry()?.get_password().ok()
    }

    fn save(&self, key: &str) -> Result<(), String> {
        self.entry()
            .ok_or("This computer's credential store isn't available.")?
            .set_password(key)
            .map_err(|e| format!("Couldn't save to this computer's credential store: {e}"))
    }

    fn clear(&self) {
        if let Some(entry) = self.entry() {
            let _ = entry.delete_credential();
        }
    }
}

/// Keeps the key in memory only. For tests.
#[cfg(test)]
#[derive(Default, Clone)]
pub struct Memory(pub std::sync::Arc<std::sync::Mutex<Option<String>>>);

#[cfg(test)]
impl KeyStore for Memory {
    fn load(&self) -> Option<String> {
        self.0.lock().unwrap().clone()
    }

    fn save(&self, key: &str) -> Result<(), String> {
        *self.0.lock().unwrap() = Some(key.into());
        Ok(())
    }

    fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }
}
