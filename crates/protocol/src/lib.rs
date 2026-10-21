//! What the Axiom desktop app and the Axiom server send each other.
//!
//! Both sides depend on this crate, so a field renamed here is renamed for both
//! and the compiler catches every place that needs to change.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// The server's routes. Bump the `/v1` prefix only for breaking changes, so
/// older versions of the app keep working.
pub mod routes {
    pub const HEALTH: &str = "/health";
    pub const SIGN_UP: &str = "/v1/auth/sign-up";
    pub const SIGN_IN: &str = "/v1/auth/sign-in";
    pub const REFRESH: &str = "/v1/auth/refresh";
    pub const SIGN_OUT: &str = "/v1/auth/sign-out";
    pub const ME: &str = "/v1/me";
    pub const FORGOT_PASSWORD: &str = "/v1/auth/forgot-password";
    pub const RESET_PASSWORD: &str = "/v1/auth/reset-password";
    /// `DELETE` deletes the account and everything synced to it.
    pub const ACCOUNT: &str = "/v1/account";
    pub const CHANGE_PASSWORD: &str = "/v1/account/password";
    pub const DEVICES: &str = "/v1/account/devices";
    /// `DELETE` signs that device out.
    pub const DEVICE: &str = "/v1/account/devices/{id}";
    pub const SYNC_PUSH: &str = "/v1/sync/push";
    /// `GET` with `?since=<cursor>`.
    pub const SYNC_PULL: &str = "/v1/sync/pull";
}

/// Most changes in one push, and most records in one pull page.
pub const SYNC_BATCH: usize = 500;

/// One row's changed fields, sent by `SYNC_PUSH`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Change {
    /// The local table, e.g. `project_board_tasks`.
    pub table: String,
    pub id: String,
    /// Only the fields that changed since this device last synced.
    pub fields: serde_json::Map<String, serde_json::Value>,
    /// When the change was made, in Unix milliseconds. For each field, the
    /// newest change wins.
    pub changed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushRequest {
    pub changes: Vec<Change>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResponse {
    /// The account's newest sequence number after this push.
    pub seq: i64,
}

/// A whole row as the server has it after merging every device's changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Record {
    pub table: String,
    pub id: String,
    pub data: serde_json::Map<String, serde_json::Value>,
    pub seq: i64,
}

/// What `SYNC_PULL` returns: records changed after `since`, oldest first.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullResponse {
    pub records: Vec<Record>,
    /// Pass as `since` next time.
    pub cursor: i64,
    /// More records are waiting; pull again straight away.
    pub more: bool,
}

/// Table names and ids are used in SQL on the devices, so only plain ones are allowed.
pub fn is_plain_name(name: &str) -> bool {
    (1..=64).contains(&name.len()) && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// Passwords shorter than this are rejected (NIST SP 800-63B's minimum).
pub const MIN_PASSWORD_LEN: usize = 8;
/// Long enough for any passphrase, short enough to stop huge hashing requests.
pub const MAX_PASSWORD_LEN: usize = 128;

/// Body of `SIGN_UP` and `SIGN_IN`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub email: String,
    pub password: String,
    /// Shown in the account's device list, e.g. "DESKTOP-4F2 (Windows)".
    pub device_name: String,
}

/// Body of `REFRESH` and `SIGN_OUT`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

/// What signing up, signing in and refreshing return.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// Sent as `Authorization: Bearer <token>`. Short-lived.
    pub access_token: String,
    /// Seconds until `access_token` expires.
    pub expires_in: u64,
    /// Swapped for a new pair at `REFRESH`. Each one works once.
    pub refresh_token: String,
    pub user: User,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

/// Body of `FORGOT_PASSWORD`. The server emails a code if the account exists.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgotPassword {
    pub email: String,
}

/// Body of `RESET_PASSWORD`. Signs every device out, then signs this one in.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResetPassword {
    pub email: String,
    /// As emailed, e.g. `K7Q2-M9XD`. Case, spaces and dashes don't matter.
    pub code: String,
    pub new_password: String,
    pub device_name: String,
}

/// Body of `CHANGE_PASSWORD`. Signs every other device out.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangePassword {
    pub current_password: String,
    pub new_password: String,
}

/// Body of `DELETE ACCOUNT`: the password, to confirm it's really them.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteAccount {
    pub password: String,
}

/// A signed-in device, from `DEVICES`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub signed_in_at: DateTime<Utc>,
    /// Updated each time the device renews its sign-in (about every 15 minutes while open).
    pub last_active_at: DateTime<Utc>,
    /// The device making the request.
    pub current: bool,
}

/// Turns a reset code as typed (`k7q2 m9xd`) into its canonical form (`K7Q2M9XD`).
pub fn normalize_code(code: &str) -> String {
    code.chars().filter(char::is_ascii_alphanumeric).map(|c| c.to_ascii_uppercase()).collect()
}

/// The body of every error response. `message` is written to be shown to the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiError {
    pub message: String,
}

/// Trims and lowercases an email so `Me@X.com` and `me@x.com` are one account.
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

/// A plausibility check, not full RFC 5322: one `@` with something on both
/// sides and a dot in the domain. Returns the message to show if it fails.
pub fn check_email(email: &str) -> Result<(), &'static str> {
    let ok = email.len() <= 254
        && !email.contains(char::is_whitespace)
        && matches!(email.split_once('@'), Some((user, domain))
            if !user.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.') && !domain.contains('@'));
    if ok { Ok(()) } else { Err("Enter a valid email address.") }
}

/// Returns the message to show if the password is too short or too long.
pub fn check_password(password: &str) -> Result<(), String> {
    let len = password.chars().count();
    if len < MIN_PASSWORD_LEN {
        Err(format!("Use at least {MIN_PASSWORD_LEN} characters for your password."))
    } else if len > MAX_PASSWORD_LEN {
        Err(format!("Use at most {MAX_PASSWORD_LEN} characters for your password."))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emails() {
        assert_eq!(normalize_email("  Me@Example.COM "), "me@example.com");
        assert!(check_email("me@example.com").is_ok());
        for bad in ["", "me", "me@", "@example.com", "me@example", "me@.com", "me@example.", "a b@c.com", "a@b@c.com"] {
            assert!(check_email(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn passwords() {
        assert!(check_password("1234567").is_err());
        assert!(check_password("12345678").is_ok());
        assert!(check_password(&"x".repeat(129)).is_err());
    }
}
