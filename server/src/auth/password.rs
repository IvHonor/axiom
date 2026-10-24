//! Password hashing with Argon2id (OWASP's first choice), using the crate's
//! defaults: 19 MiB of memory, 2 passes. Hashing is slow on purpose, so it
//! runs on a blocking thread instead of stalling other requests.

use std::sync::OnceLock;

use argon2::Argon2;
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};

use tokio::sync::{Semaphore, SemaphorePermit};

use crate::error::ApiError;

/// Each hash takes 19 MiB. A burst of sign-ins hashing all at once could run
/// the server out of memory (512 MB on Render's free plan), so a few run at
/// a time and the rest wait their turn.
static HASHING: Semaphore = Semaphore::const_new(4);

async fn turn() -> SemaphorePermit<'static> {
    HASHING.acquire().await.expect("never closed")
}

pub async fn hash(password: String) -> Result<String, ApiError> {
    let turn = turn().await;
    // The permit goes with the work: it's held until hashing ends, even if
    // the request is dropped first.
    tokio::task::spawn_blocking(move || {
        let _turn = turn;
        hash_now(&password)
    })
    .await
    .map_err(ApiError::internal)?
}

fn hash_now(password: &str) -> Result<String, ApiError> {
    let hash: PasswordHash = Argon2::default().hash_password(password.as_bytes()).map_err(ApiError::internal)?;
    Ok(hash.to_string())
}

/// Checks `password` against a stored hash. With no stored hash (no such
/// account), checks against a dummy one, so the answer takes just as long
/// and timing can't reveal which emails have accounts.
pub async fn verify(password: String, stored: Option<String>) -> bool {
    let turn = turn().await;
    tokio::task::spawn_blocking(move || {
        let _turn = turn;
        let hash = stored.as_deref().unwrap_or_else(|| dummy_hash());
        let ok = PasswordHash::new(hash).is_ok_and(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok());
        ok && stored.is_some()
    })
    .await
    .unwrap_or(false)
}

fn dummy_hash() -> &'static str {
    static DUMMY: OnceLock<String> = OnceLock::new();
    DUMMY.get_or_init(|| hash_now("not anyone's password").expect("hashing a constant can't fail"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn verifies_only_the_right_password() {
        let stored = hash("correct horse".into()).await.unwrap();
        assert!(stored.starts_with("$argon2id$"));
        assert!(verify("correct horse".into(), Some(stored.clone())).await);
        assert!(!verify("wrong horse".into(), Some(stored)).await);
        assert!(!verify("not anyone's password".into(), None).await, "no account never verifies");
    }
}
