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

    // Shared boards ("spaces"): a project shared with other accounts.
    /// `GET` the spaces you're in; `POST` shares one of your projects.
    pub const SPACES: &str = "/v1/spaces";
    /// `DELETE` (owner): stops sharing and deletes the shared copy.
    pub const SPACE: &str = "/v1/spaces/{id}";
    /// `POST`: moves rows already synced to your account into the space.
    pub const SPACE_ADOPT: &str = "/v1/spaces/{id}/adopt";
    pub const SPACE_PUSH: &str = "/v1/spaces/{id}/push";
    /// `GET` with `?since=<cursor>`.
    pub const SPACE_PULL: &str = "/v1/spaces/{id}/pull";
    /// `GET`: members, and (for admins) pending invitations.
    pub const SPACE_MEMBERS: &str = "/v1/spaces/{id}/members";
    /// `PATCH` changes a member's role; `DELETE` removes them (or yourself: leave).
    pub const SPACE_MEMBER: &str = "/v1/spaces/{id}/members/{user_id}";
    /// `POST` invites someone by email.
    pub const SPACE_INVITES: &str = "/v1/spaces/{id}/invites";
    /// `DELETE` withdraws an invitation.
    pub const SPACE_INVITE: &str = "/v1/spaces/{id}/invites/{invite_id}";
    /// `GET` invitations waiting for you.
    pub const INVITES: &str = "/v1/invites";
    pub const INVITE_ACCEPT: &str = "/v1/invites/{id}/accept";
    pub const INVITE_DECLINE: &str = "/v1/invites/{id}/decline";
}

/// Fills in a route's `{name}` placeholders, e.g. `route(SPACE, &[("id", "p1")])`.
pub fn route(template: &str, values: &[(&str, &str)]) -> String {
    values.iter().fold(template.to_owned(), |path, (name, value)| path.replace(&format!("{{{name}}}"), value))
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

// ---------- Shared boards ----------

/// What a member of a shared board may do. Ordered: each role can do
/// everything the ones before it can.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    /// Sees the board; changes nothing.
    Viewer,
    /// Works on cards: creates, edits, moves and completes them, with their checklists and labels.
    Editor,
    /// Also changes the board itself (columns, labels, templates, its name) and manages members.
    Admin,
    /// The person who shared it. Also makes or removes admins and can delete the board.
    Owner,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Viewer => "viewer",
            Role::Editor => "editor",
            Role::Admin => "admin",
            Role::Owner => "owner",
        }
    }

    pub fn parse(text: &str) -> Option<Role> {
        [Role::Viewer, Role::Editor, Role::Admin, Role::Owner].into_iter().find(|r| r.as_str() == text)
    }
}

/// The tables a shared board holds, and the least role that may change each.
/// Both the server (which enforces it) and the app (which explains it) use this.
pub fn space_table_role(table: &str) -> Option<Role> {
    match table {
        "project_board_projects" | "project_board_columns" | "project_board_labels" | "project_board_templates" => Some(Role::Admin),
        "project_board_tasks" | "project_board_task_labels" | "project_board_checklist_items" | "project_board_task_events" => {
            Some(Role::Editor)
        }
        _ => None,
    }
}

/// A shared board you're in, from `SPACES`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Space {
    /// The shared project's id.
    pub id: String,
    pub name: String,
    pub role: Role,
    pub owner_email: String,
    pub members: u32,
}

/// Body of `POST SPACES`: the project to share.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSpace {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordRef {
    pub table: String,
    pub id: String,
}

/// Body of `SPACE_ADOPT`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Adopt {
    pub records: Vec<RecordRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Adopted {
    pub moved: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Member {
    pub user_id: String,
    pub email: String,
    pub role: Role,
    pub joined_at: DateTime<Utc>,
    /// The account asking.
    pub you: bool,
}

/// An invitation not yet answered.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Invite {
    pub id: String,
    pub email: String,
    pub role: Role,
    /// Who sent it (their email).
    pub invited_by: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

/// What `SPACE_MEMBERS` returns. `invites` is empty unless you're an admin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Members {
    pub members: Vec<Member>,
    pub invites: Vec<Invite>,
}

/// Body of `POST SPACE_INVITES`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewInvite {
    pub email: String,
    pub role: Role,
}

/// Body of `PATCH SPACE_MEMBER`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRole {
    pub role: Role,
}

/// An invitation waiting for you, from `INVITES`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MyInvite {
    pub id: String,
    pub space_id: String,
    pub space_name: String,
    pub role: Role,
    pub invited_by: String,
    pub expires_at: DateTime<Utc>,
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
