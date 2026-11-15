//! The system's credential store, for every secret Axiom keeps on this
//! computer (the sign-in, the data key, the PIN lock, calendar sign-ins).
//!
//! macOS asks permission separately for each keychain item an app reads, and
//! asks again on every read when someone clicks "Allow" rather than "Always
//! Allow". So on macOS every secret lives in one item ("secrets"), read once
//! per launch and kept in memory; items from before are moved into it the
//! first time they're asked for, then deleted. Elsewhere (Windows Credential
//! Manager limits an item to about 2.5 KB) each secret keeps its own item,
//! still read only once.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{LazyLock, Mutex};

/// Matches the app identifier in tauri.conf.json.
const SERVICE: &str = "app.axiom.desktop";
/// Development builds are signed differently, so they keep their own.
#[cfg(target_os = "macos")]
const BUNDLE: &str = if cfg!(debug_assertions) { "secrets-dev" } else { "secrets" };

/// Reads and writes single items. The real one is the keychain; tests count calls.
trait Backend: Send {
    /// None: there's no such item. An error: there is, but it couldn't be
    /// read (permission refused on macOS, or the keychain is locked).
    fn get(&mut self, name: &str) -> Result<Option<String>, String>;
    fn set(&mut self, name: &str, value: &str) -> Result<(), String>;
    fn delete(&mut self, name: &str);
}

struct System;

impl Backend for System {
    fn get(&mut self, name: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn set(&mut self, name: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, name)
            .map_err(|_| "This computer's credential store isn't available.".to_string())?
            .set_password(value)
            .map_err(|e| e.to_string())
    }

    fn delete(&mut self, name: &str) {
        if let Ok(entry) = keyring::Entry::new(SERVICE, name) {
            let _ = entry.delete_credential();
        }
    }
}

/// Every secret in one item (macOS).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
struct Bundled<B> {
    backend: B,
    item: &'static str,
    items: Option<BTreeMap<String, String>>,
    /// Names whose item from before has been looked for this launch.
    checked: HashSet<String>,
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
impl<B: Backend> Bundled<B> {
    fn new(backend: B, item: &'static str) -> Self {
        Self { backend, item, items: None, checked: HashSet::new() }
    }

    /// Every secret, read once. Not remembered when it couldn't be read:
    /// an unreadable item mustn't pass for an empty one, or the next save
    /// would wipe what's in it. It's tried again next time.
    fn items(&mut self) -> Result<&mut BTreeMap<String, String>, String> {
        if self.items.is_none() {
            let saved = match self.backend.get(self.item)? {
                Some(json) => serde_json::from_str(&json).map_err(|_| "Axiom's keychain item couldn't be read.".to_string())?,
                None => BTreeMap::new(),
            };
            self.items = Some(saved);
        }
        Ok(self.items.as_mut().expect("just loaded"))
    }

    fn save(&mut self) -> Result<(), String> {
        let items = self.items()?.clone();
        if items.is_empty() {
            self.backend.delete(self.item);
            return Ok(());
        }
        let json = serde_json::to_string(&items).map_err(|e| e.to_string())?;
        self.backend.set(self.item, &json)
    }

    fn get(&mut self, name: &str) -> Option<String> {
        if let Some(value) = self.items().ok()?.get(name) {
            return Some(value.clone());
        }
        // Kept on its own before: move it in (a missing item never prompts).
        if !self.checked.insert(name.to_owned()) {
            return None;
        }
        let old = match self.backend.get(name) {
            Ok(Some(old)) => old,
            Ok(None) => return None,
            Err(_) => {
                // Refused: ask again next time rather than forget it's there.
                self.checked.remove(name);
                return None;
            }
        };
        self.items().ok()?.insert(name.to_owned(), old.clone());
        if self.save().is_ok() {
            self.backend.delete(name);
        }
        Some(old)
    }

    fn set(&mut self, name: &str, value: &str) -> Result<(), String> {
        let before = self.items().map_err(unreadable)?.insert(name.to_owned(), value.to_owned());
        self.checked.insert(name.to_owned());
        let saved = self.save();
        if saved.is_err()
            && let Ok(items) = self.items()
        {
            // Not saved: memory mustn't claim it was.
            match before {
                Some(old) => items.insert(name.to_owned(), old),
                None => items.remove(name),
            };
        }
        saved
    }

    fn delete(&mut self, name: &str) {
        let had = self.items().is_ok_and(|items| items.remove(name).is_some());
        if had {
            let _ = self.save();
        }
        // An item from before would otherwise come back next launch.
        if self.checked.insert(name.to_owned()) || !had {
            self.backend.delete(name);
        }
    }
}

/// One item per secret, read once each (Windows, Linux).
#[cfg_attr(target_os = "macos", allow(dead_code))]
struct Separate<B> {
    backend: B,
    known: HashMap<String, Option<String>>,
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
impl<B: Backend> Separate<B> {
    fn get(&mut self, name: &str) -> Option<String> {
        if let Some(value) = self.known.get(name) {
            return value.clone();
        }
        // Unreadable isn't remembered: it's tried again next time.
        let value = self.backend.get(name).ok()?;
        self.known.insert(name.to_owned(), value.clone());
        value
    }

    fn set(&mut self, name: &str, value: &str) -> Result<(), String> {
        self.backend.set(name, value)?;
        self.known.insert(name.to_owned(), Some(value.to_owned()));
        Ok(())
    }

    fn delete(&mut self, name: &str) {
        self.backend.delete(name);
        self.known.insert(name.to_owned(), None);
    }
}

fn unreadable(_: String) -> String {
    "Axiom couldn't open your keychain. Choose Always Allow when your Mac asks, then try again.".into()
}

#[cfg(target_os = "macos")]
static STORE: LazyLock<Mutex<Bundled<System>>> = LazyLock::new(|| Mutex::new(Bundled::new(System, BUNDLE)));
#[cfg(not(target_os = "macos"))]
static STORE: LazyLock<Mutex<Separate<System>>> = LazyLock::new(|| Mutex::new(Separate { backend: System, known: HashMap::new() }));

pub fn get(name: &str) -> Option<String> {
    STORE.lock().unwrap_or_else(|e| e.into_inner()).get(name)
}

pub fn set(name: &str, value: &str) -> Result<(), String> {
    STORE.lock().unwrap_or_else(|e| e.into_inner()).set(name, value)
}

pub fn delete(name: &str) {
    STORE.lock().unwrap_or_else(|e| e.into_inner()).delete(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// A pretend keychain that counts how often each item is read: each read
    /// of an existing item is a possible permission prompt on macOS.
    #[derive(Clone, Default)]
    struct Fake {
        items: Arc<Mutex<HashMap<String, String>>>,
        reads: Arc<Mutex<HashMap<String, usize>>>,
        /// Reads are refused, as when someone clicks Deny.
        denied: Arc<std::sync::atomic::AtomicBool>,
    }

    impl Fake {
        fn with(items: &[(&str, &str)]) -> Self {
            let fake = Fake::default();
            fake.items.lock().unwrap().extend(items.iter().map(|(k, v)| (k.to_string(), v.to_string())));
            fake
        }
        fn reads(&self, name: &str) -> usize {
            *self.reads.lock().unwrap().get(name).unwrap_or(&0)
        }
        fn names(&self) -> Vec<String> {
            let mut names: Vec<String> = self.items.lock().unwrap().keys().cloned().collect();
            names.sort();
            names
        }
    }

    impl Backend for Fake {
        fn get(&mut self, name: &str) -> Result<Option<String>, String> {
            let value = self.items.lock().unwrap().get(name).cloned();
            if value.is_some() {
                *self.reads.lock().unwrap().entry(name.into()).or_default() += 1;
                if self.denied.load(std::sync::atomic::Ordering::SeqCst) {
                    return Err("denied".into());
                }
            }
            Ok(value)
        }
        fn set(&mut self, name: &str, value: &str) -> Result<(), String> {
            self.items.lock().unwrap().insert(name.into(), value.into());
            Ok(())
        }
        fn delete(&mut self, name: &str) {
            self.items.lock().unwrap().remove(name);
        }
    }

    #[test]
    fn everything_lives_in_one_item_read_once() {
        let fake = Fake::default();
        let mut store = Bundled::new(fake.clone(), "secrets");
        store.set("account", "a").unwrap();
        store.set("vault", "v").unwrap();
        assert_eq!(fake.names(), ["secrets"]);

        let mut next_launch = Bundled::new(fake.clone(), "secrets");
        for _ in 0..5 {
            assert_eq!(next_launch.get("account").as_deref(), Some("a"));
            assert_eq!(next_launch.get("vault").as_deref(), Some("v"));
            assert_eq!(next_launch.get("app-lock"), None);
        }
        assert_eq!(fake.reads("secrets"), 1, "one read, so at most one prompt a launch");
    }

    #[test]
    fn items_from_before_move_in_once_and_are_deleted() {
        let fake = Fake::with(&[("account", "a"), ("vault", "v"), ("calendar-x", "c")]);
        let mut store = Bundled::new(fake.clone(), "secrets");
        assert_eq!(store.get("account").as_deref(), Some("a"));
        assert_eq!(store.get("vault").as_deref(), Some("v"));
        assert_eq!(store.get("account").as_deref(), Some("a"));
        assert_eq!(fake.reads("account"), 1);
        assert_eq!(fake.names(), ["calendar-x", "secrets"], "moved ones are gone; the rest wait to be asked for");

        let mut next_launch = Bundled::new(fake.clone(), "secrets");
        assert_eq!(next_launch.get("vault").as_deref(), Some("v"));
        assert_eq!(fake.reads("vault"), 1, "not read on its own again");
    }

    #[test]
    fn deleting_removes_it_everywhere() {
        let fake = Fake::with(&[("account", "old")]);
        let mut store = Bundled::new(fake.clone(), "secrets");
        store.set("vault", "v").unwrap();
        store.delete("account");
        assert_eq!(fake.names(), ["secrets"], "the item from before can't come back");
        store.delete("vault");
        assert!(fake.names().is_empty(), "nothing left: no empty item");
        assert_eq!(Bundled::new(fake, "secrets").get("account"), None);
    }

    #[test]
    fn elsewhere_each_item_is_read_once() {
        let fake = Fake::with(&[("account", "a")]);
        let mut store = Separate { backend: fake.clone(), known: HashMap::new() };
        for _ in 0..3 {
            assert_eq!(store.get("account").as_deref(), Some("a"));
            assert_eq!(store.get("vault"), None);
        }
        assert_eq!(fake.reads("account"), 1);
        store.set("vault", "v").unwrap();
        store.delete("account");
        assert_eq!((store.get("vault").as_deref(), store.get("account")), (Some("v"), None));
    }

    #[test]
    fn a_refused_read_never_wipes_what_is_kept() {
        let fake = Fake::default();
        Bundled::new(fake.clone(), "secrets").set("vault", "v").unwrap();

        // A new build; macOS asks and they click Deny.
        fake.denied.store(true, std::sync::atomic::Ordering::SeqCst);
        let mut store = Bundled::new(fake.clone(), "secrets");
        assert_eq!(store.get("vault"), None);
        assert!(store.set("account", "a").is_err(), "saving now would overwrite the data key");
        assert_eq!(fake.items.lock().unwrap().get("secrets").map(|s| s.contains("vault")), Some(true));

        // Allowed next time: everything's still there.
        fake.denied.store(false, std::sync::atomic::Ordering::SeqCst);
        assert_eq!(store.get("vault").as_deref(), Some("v"));
        store.set("account", "a").unwrap();
        assert_eq!(Bundled::new(fake, "secrets").get("vault").as_deref(), Some("v"));
    }
}
