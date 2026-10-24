//! End-to-end encryption for sensitive data (Finance). The server stores and
//! merges it like any synced data, but only ever sees ciphertext.
//!
//! - Every account has one random **data key**. Each synced field is sealed
//!   with it (XChaCha20-Poly1305), bound to its table, row and field, so the
//!   server can't move a value from one place to another unnoticed.
//! - The data key is kept on this computer in the system's credential store,
//!   and on the server only **wrapped**: sealed with a key derived from the
//!   password (Argon2id), and again with a **recovery code** shown to the user.
//!   A new device unwraps it with the password when signing in.
//! - The server never gets the password: signing in sends a **login key**
//!   made from it (`login_key`), which can't unwrap anything.
//! - Changing the password wraps it again; nothing is re-encrypted. After a
//!   password reset (the old password's gone), the recovery code unwraps it.
//!
//! What the server can see: which table a row is in, its id, when it changed.

pub mod commands;
mod crypto;
pub mod store;
#[cfg(test)]
mod tests;

/// For tests elsewhere: wraps a key for another password, as a reset leaves it.
#[cfg(test)]
pub mod tests_support {
    pub fn rewrap(blob: &str, key: &super::DataKey, password: &str) -> String {
        super::Wrapped::parse(blob).unwrap().with_password(key, password).unwrap().to_json()
    }
}

use std::sync::Mutex;

use serde::Serialize;

use crate::account::Account;
use crate::error::{Error, Result};
pub use crypto::{DataKey, login_key};
use crypto::Wrapped;
pub use store::{KeyStore, Keychain};

/// Kept in Tauri's managed state.
pub struct Vault {
    store: Box<dyn KeyStore>,
    key: Mutex<Option<DataKey>>,
    /// The password no longer unwraps the key (it was reset): the recovery
    /// code is needed.
    needs_recovery: Mutex<bool>,
}

/// Mirrored by `VaultStatus` in `src/lib/vault.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VaultStatus {
    /// Encrypted data syncs.
    Unlocked,
    /// Signed in on this computer before encryption, or the key couldn't be
    /// fetched: the password unlocks it.
    NeedsPassword,
    /// The password was reset, so only the recovery code opens the key.
    NeedsRecovery,
}

const WRONG_PASSWORD: &str = "That password isn't right.";
const WRONG_CODE: &str = "That recovery code isn't right. Check it and try again.";

impl Vault {
    pub fn new(store: Box<dyn KeyStore>) -> Self {
        let key = store.load().and_then(|saved| DataKey::from_base64(&saved));
        Self { store, key: Mutex::new(key), needs_recovery: Mutex::new(false) }
    }

    pub fn status(&self) -> VaultStatus {
        if self.key.lock().unwrap().is_some() {
            VaultStatus::Unlocked
        } else if *self.needs_recovery.lock().unwrap() {
            VaultStatus::NeedsRecovery
        } else {
            VaultStatus::NeedsPassword
        }
    }

    /// The data key, while unlocked.
    pub fn key(&self) -> Option<DataKey> {
        self.key.lock().unwrap().clone()
    }

    fn keep(&self, key: DataKey) -> Result<()> {
        self.store.save(&key.to_base64()).map_err(Error::Account)?;
        *self.key.lock().unwrap() = Some(key);
        *self.needs_recovery.lock().unwrap() = false;
        Ok(())
    }

    /// Signing out (or deleting the account) forgets the key here.
    pub fn forget(&self) {
        self.store.clear();
        *self.key.lock().unwrap() = None;
        *self.needs_recovery.lock().unwrap() = false;
    }

    /// After signing in, up or after a reset, with the password just used:
    /// unwraps the account's key, or makes one if it has none yet. Failures
    /// leave it locked (the app asks again later) rather than failing sign-in.
    pub async fn after_sign_in(&self, account: &Account, password: &str) {
        if let Err(e) = self.open_or_create(account, password).await {
            eprintln!("vault: couldn't unlock after signing in: {e}");
        }
    }

    async fn open_or_create(&self, account: &Account, password: &str) -> Result<()> {
        match account.encryption_key().await? {
            None => self.create(account, password).await,
            Some(blob) => {
                let wrapped = Wrapped::parse(&blob)?;
                match wrapped.open_with_password(password) {
                    Ok(key) => self.keep(key),
                    // The password was reset. If this computer still has the
                    // key, wrap it with the new one; otherwise the recovery code's needed.
                    Err(_) => match self.key() {
                        Some(key) => {
                            account.set_encryption_key(Some(wrapped.with_password(&key, password)?.to_json())).await?;
                            Ok(())
                        }
                        None => {
                            *self.needs_recovery.lock().unwrap() = true;
                            Ok(())
                        }
                    },
                }
            }
        }
    }

    /// A new key and recovery code for an account that has none.
    async fn create(&self, account: &Account, password: &str) -> Result<()> {
        let (key, wrapped) = Wrapped::create(password)?;
        account.set_encryption_key(Some(wrapped.to_json())).await?;
        self.keep(key)
    }

    /// Unlocks with the password (on a computer signed in before encryption).
    pub async fn unlock_with_password(&self, account: &Account, password: &str) -> Result<()> {
        account.verify_password(password).await?;
        match account.encryption_key().await? {
            None => self.create(account, password).await,
            Some(blob) => match Wrapped::parse(&blob)?.open_with_password(password) {
                Ok(key) => self.keep(key),
                Err(_) => {
                    *self.needs_recovery.lock().unwrap() = true;
                    Err(Error::Invalid("Your password was reset since encrypted data was set up. Enter your recovery code instead.".into()))
                }
            },
        }
    }

    /// Unlocks with the recovery code, and wraps the key with the current
    /// password again so it unlocks normally from now on.
    pub async fn unlock_with_recovery(&self, account: &Account, code: &str, password: &str) -> Result<()> {
        account.verify_password(password).await?;
        let blob = account.encryption_key().await?.ok_or_else(|| Error::Invalid("This account has no encrypted data yet.".into()))?;
        let wrapped = Wrapped::parse(&blob)?;
        let key = wrapped.open_with_recovery(code).map_err(|_| Error::Invalid(WRONG_CODE.into()))?;
        account.set_encryption_key(Some(wrapped.with_password(&key, password)?.to_json())).await?;
        self.keep(key)
    }

    /// Gives up on the encrypted data in the account (password and recovery
    /// code both lost): a new key, under which this computer's data is
    /// uploaded again. Other computers will need the new recovery code.
    pub async fn start_over(&self, account: &Account, password: &str) -> Result<()> {
        account.verify_password(password).await?;
        self.create(account, password).await
    }

    /// The recovery code, shown again after the password's confirmed.
    pub async fn recovery_code(&self, account: &Account, password: &str) -> Result<String> {
        account.verify_password(password).await?;
        let key = self.key().ok_or_else(|| Error::Invalid("Unlock encrypted data first.".into()))?;
        let blob = account.encryption_key().await?.ok_or_else(|| Error::Invalid("This account has no encrypted data yet.".into()))?;
        Ok(Wrapped::parse(&blob)?.recovery_code(&key)?)
    }

    /// The key wrapped with a new password, to save with a password change.
    /// None while locked (the other devices keep the old wrapping until one
    /// that's unlocked changes it).
    pub async fn wrapped_for(&self, account: &Account, new_password: &str) -> Result<Option<String>> {
        let Some(key) = self.key() else { return Ok(None) };
        let Some(blob) = account.encryption_key().await? else { return Ok(None) };
        Ok(Some(Wrapped::parse(&blob)?.with_password(&key, new_password)?.to_json()))
    }
}

impl From<crypto::Broken> for Error {
    fn from(_: crypto::Broken) -> Self {
        Error::Invalid(WRONG_PASSWORD.into())
    }
}
