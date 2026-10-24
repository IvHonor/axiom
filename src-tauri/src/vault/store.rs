//! Where this computer keeps the data key: the system's credential store,
//! next to the sign-in (see `account::store`), never a plain file.

pub trait KeyStore: Send + Sync {
    fn load(&self) -> Option<String>;
    fn save(&self, key: &str) -> Result<(), String>;
    fn clear(&self);
}

const SERVICE: &str = "app.axiom.desktop";
/// Development builds talk to a local server, so they keep their own key.
const ENTRY: &str = if cfg!(debug_assertions) { "vault-dev" } else { "vault" };

pub struct Keychain;

impl Keychain {
    fn entry() -> Option<keyring::Entry> {
        keyring::Entry::new(SERVICE, ENTRY).ok()
    }
}

impl KeyStore for Keychain {
    fn load(&self) -> Option<String> {
        Self::entry()?.get_password().ok()
    }

    fn save(&self, key: &str) -> Result<(), String> {
        Self::entry()
            .ok_or("This computer's credential store isn't available.")?
            .set_password(key)
            .map_err(|e| format!("Couldn't save the encryption key: {e}"))
    }

    fn clear(&self) {
        if let Some(entry) = Self::entry() {
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
