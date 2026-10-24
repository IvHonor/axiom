//! The app lock: a PIN asked for when Axiom opens, and again after it's been
//! idle for a while.
//!
//! A deterrent against someone at an unlocked computer, not encryption: the
//! data on disk is the same either way. The PIN is kept hashed (Argon2id) in
//! the system's credential store. Only signed-in accounts can turn it on, so
//! a forgotten PIN can always be reset with a code emailed to the account.

pub mod commands;
#[cfg(test)]
mod tests;

use std::sync::Mutex;

use argon2::Argon2;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::vault::KeyStore;

/// Wrong PINs before only an emailed code opens it.
const MAX_TRIES: u32 = 5;
/// The longest idle time on offer, in minutes. 0 locks only on opening.
const MAX_IDLE_MINUTES: u32 = 240;

const WRONG_PIN: &str = "That PIN isn't right.";

#[derive(Serialize, Deserialize)]
struct Saved {
    salt: String,
    hash: String,
    idle_minutes: u32,
}

/// Kept in Tauri's managed state.
pub struct AppLock {
    store: Box<dyn KeyStore>,
    locked: Mutex<bool>,
    wrong: Mutex<u32>,
}

/// Mirrored by `LockStatus` in `src/lib/appLock.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockStatus {
    pub enabled: bool,
    pub locked: bool,
    /// Locks again after this long idle; 0 only on opening.
    pub idle_minutes: u32,
    /// Too many wrong PINs: only an emailed code opens it now.
    pub needs_code: bool,
}

impl AppLock {
    /// Locked from the start whenever a PIN is set.
    pub fn new(store: Box<dyn KeyStore>) -> Self {
        let locked = store.load().is_some();
        Self { store, locked: Mutex::new(locked), wrong: Mutex::new(0) }
    }

    fn saved(&self) -> Option<Saved> {
        serde_json::from_str(&self.store.load()?).ok()
    }

    pub fn status(&self) -> LockStatus {
        let saved = self.saved();
        LockStatus {
            enabled: saved.is_some(),
            locked: saved.is_some() && *self.locked.lock().unwrap(),
            idle_minutes: saved.map_or(0, |s| s.idle_minutes),
            needs_code: *self.wrong.lock().unwrap() >= MAX_TRIES,
        }
    }

    /// Turns the lock on, or changes the PIN (`pin`) or idle time. While it's
    /// on, the current PIN is needed.
    pub fn set(&self, current: Option<&str>, pin: Option<&str>, idle_minutes: u32) -> Result<LockStatus> {
        if idle_minutes > MAX_IDLE_MINUTES {
            return Err(Error::Invalid(format!("Pick an idle time up to {MAX_IDLE_MINUTES} minutes.")));
        }
        let saved = match (self.saved(), pin) {
            (Some(saved), pin) => {
                if !matches(&saved, current.unwrap_or_default()) {
                    return Err(Error::Invalid(WRONG_PIN.into()));
                }
                match pin {
                    Some(pin) => new_pin(pin, idle_minutes)?,
                    None => Saved { idle_minutes, ..saved },
                }
            }
            (None, Some(pin)) => new_pin(pin, idle_minutes)?,
            (None, None) => return Err(Error::Invalid("Choose a PIN.".into())),
        };
        self.store.save(&serde_json::to_string(&saved).expect("serialises")).map_err(Error::Invalid)?;
        Ok(self.status())
    }

    pub fn turn_off(&self, current: &str) -> Result<LockStatus> {
        let saved = self.saved().ok_or_else(|| Error::Invalid("The PIN lock is already off.".into()))?;
        if !matches(&saved, current) {
            return Err(Error::Invalid(WRONG_PIN.into()));
        }
        self.forget();
        Ok(self.status())
    }

    pub fn unlock(&self, pin: &str) -> Result<LockStatus> {
        let Some(saved) = self.saved() else { return Ok(self.status()) };
        let mut wrong = self.wrong.lock().unwrap();
        if *wrong >= MAX_TRIES {
            return Err(Error::Invalid("Too many wrong PINs. Choose “Forgot PIN?” to get a code by email.".into()));
        }
        if !matches(&saved, pin) {
            *wrong += 1;
            return Err(Error::Invalid(WRONG_PIN.into()));
        }
        *wrong = 0;
        drop(wrong);
        *self.locked.lock().unwrap() = false;
        Ok(self.status())
    }

    pub fn lock(&self) -> LockStatus {
        *self.locked.lock().unwrap() = true;
        self.status()
    }

    /// Turns the lock off without the PIN: after an emailed code, or on
    /// signing out (a forgotten PIN couldn't be reset any more).
    pub fn forget(&self) {
        self.store.clear();
        *self.locked.lock().unwrap() = false;
        *self.wrong.lock().unwrap() = 0;
    }
}

fn new_pin(pin: &str, idle_minutes: u32) -> Result<Saved> {
    if !(4..=8).contains(&pin.len()) || !pin.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Error::Invalid("Use 4 to 8 digits for your PIN.".into()));
    }
    let mut salt = [0u8; 16];
    getrandom::fill(&mut salt).expect("the system's random number generator works");
    Ok(Saved { hash: B64.encode(hash(pin, &salt)), salt: B64.encode(salt), idle_minutes })
}

fn matches(saved: &Saved, pin: &str) -> bool {
    B64.decode(&saved.salt).is_ok_and(|salt| B64.encode(hash(pin, &salt)) == saved.hash)
}

/// Argon2id with its default settings (19 MiB, two passes).
fn hash(pin: &str, salt: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    Argon2::default().hash_password_into(pin.as_bytes(), salt, &mut out).expect("valid settings");
    out
}
