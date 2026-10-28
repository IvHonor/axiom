//! What the Axiom desktop app and the Axiom server send each other.
//!
//! Both sides depend on this crate, so a field renamed here is renamed for both
//! and the compiler catches every place that needs to change.

use chrono::{DateTime, Utc};

pub mod ai;
pub mod notify;
use serde::{Deserialize, Serialize};

/// The server's routes. Bump the `/v1` prefix only for breaking changes, so
/// older versions of the app keep working.
pub mod routes {
    pub const HEALTH: &str = "/health";
    /// The privacy notice, a web page.
    pub const PRIVACY: &str = "/privacy";
    /// The terms of use, a web page.
    pub const TERMS: &str = "/terms";
    /// `GET` what the server sees of your address (for setting up rate limits behind a proxy).
    pub const CLIENT_IP: &str = "/v1/client-ip";
    pub const SIGN_UP: &str = "/v1/auth/sign-up";
    pub const SIGN_IN: &str = "/v1/auth/sign-in";
    pub const REFRESH: &str = "/v1/auth/refresh";
    pub const SIGN_OUT: &str = "/v1/auth/sign-out";
    pub const ME: &str = "/v1/me";
    pub const FORGOT_PASSWORD: &str = "/v1/auth/forgot-password";
    pub const RESET_PASSWORD: &str = "/v1/auth/reset-password";
    /// `POST` confirms the address with the code emailed at sign-up (`ConfirmEmail`).
    pub const CONFIRM_EMAIL: &str = "/v1/auth/confirm-email";
    /// `POST` emails a new confirmation code (`ForgotPassword`'s body).
    pub const SEND_CONFIRMATION: &str = "/v1/auth/confirm-email/send";
    /// `POST` emails a code that turns off the app lock, for a forgotten PIN.
    pub const APP_LOCK_CODE: &str = "/v1/account/app-lock/code";
    /// `POST` checks that code (`CheckCode`).
    pub const APP_LOCK_CHECK: &str = "/v1/account/app-lock/check";
    /// `DELETE` deletes the account and everything synced to it.
    pub const ACCOUNT: &str = "/v1/account";
    pub const CHANGE_PASSWORD: &str = "/v1/account/password";
    /// `GET` your profile (name and picture); `PUT` replaces it.
    pub const PROFILE: &str = "/v1/account/profile";
    /// `GET` the wrapped end-to-end encryption key; `PUT` replaces it.
    pub const ENCRYPTION_KEY: &str = "/v1/account/encryption-key";
    /// `POST` checks the password (`ConfirmPassword`) before something that needs it.
    pub const VERIFY_PASSWORD: &str = "/v1/account/verify-password";
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

    // The waiting list, for the server's admins only.
    /// `GET` every account: waiting for approval, and approved.
    pub const ADMIN_ACCOUNTS: &str = "/v1/admin/accounts";
    /// `PATCH` changes an account's role or permissions (`AccountChange`).
    /// `DELETE` turns down an account that's waiting (it's deleted).
    pub const ADMIN_ACCOUNT: &str = "/v1/admin/accounts/{id}";
    /// `POST` lets a waiting account in, and emails them.
    pub const ADMIN_APPROVE: &str = "/v1/admin/accounts/{id}/approve";
    /// `POST` puts an approved account back on the waiting list and signs it out everywhere.
    pub const ADMIN_REVOKE: &str = "/v1/admin/accounts/{id}/revoke";
    /// `GET` and `PUT` the server's settings (`AdminSettings`).
    pub const ADMIN_SETTINGS: &str = "/v1/admin/settings";
    /// `POST` a message to support (`NewTicket`). Signing in is optional.
    pub const SUPPORT: &str = "/v1/support";
    /// `GET` support tickets, for admins: open ones first.
    pub const ADMIN_TICKETS: &str = "/v1/admin/tickets";
    /// `PATCH` marks a ticket solved, or open again (`TicketChange`).
    pub const ADMIN_TICKET: &str = "/v1/admin/tickets/{id}";

    /// `PUT` replaces the emails planned for this account (see `notify`).
    pub const NOTIFY_EMAILS: &str = "/v1/notifications/emails";
    /// `GET` with `?token=` from an email: stops that kind of email.
    pub const NOTIFY_UNSUBSCRIBE: &str = "/v1/notifications/unsubscribe";
    /// `POST` an email to hear when Axiom on the web opens. No account needed.
    pub const WEB_UPDATES: &str = "/v1/web-updates";
    /// `POST` a `ai::ChatRequest`: the assistant answers on the server's AI keys.
    pub const AI_CHAT: &str = "/v1/ai/chat";
    /// `POST` a `ai::ChatRequest`: like `AI_CHAT`, but the answer comes as it's
    /// written, one `ai::Streamed` per line of JSON.
    pub const AI_CHAT_STREAM: &str = "/v1/ai/chat/stream";
    /// `POST` an `ai::Transcribe`: speech to text, on the server's AI keys.
    pub const AI_TRANSCRIBE: &str = "/v1/ai/transcribe";
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

impl Change {
    /// Whether the row's own `id` field, if sent, names this row. Otherwise
    /// a device applying it would write a different row than the one checked.
    pub fn id_matches(&self) -> bool {
        self.fields.get("id").is_none_or(|id| id.as_str() == Some(&self.id))
    }
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

/// Table names are written into SQL on the devices, so only plain ones are allowed.
pub fn is_plain_name(name: &str) -> bool {
    (1..=64).contains(&name.len()) && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// Row ids are only ever bound as SQL parameters, so they may also hold dots,
/// as kind-named rows do (the notification setting "birthdays.upcoming").
pub fn is_record_id(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'.')
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

/// Starts every login key: what the app sends in place of the password, so
/// the server never sees the password the encryption key is wrapped with.
/// Made on the device from the email and password (see the app's `vault::login_key`).
pub const LOGIN_KEY_PREFIX: &str = "axiom-login:";

pub fn is_login_key(secret: &str) -> bool {
    secret.starts_with(LOGIN_KEY_PREFIX) && check_password(secret).is_ok()
}

/// The status a login key gets from an account that still has a password
/// from before login keys: send the password itself, once, with the key in
/// `login_key` to replace it.
pub const PLAIN_PASSWORD: u16 = 428;

/// Body of `SIGN_UP` and `SIGN_IN`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub email: String,
    /// A login key, or (from older versions of Axiom) the password itself.
    pub password: String,
    /// Shown in the account's device list, e.g. "DESKTOP-4F2 (Windows)".
    pub device_name: String,
    /// See `PLAIN_PASSWORD`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub login_key: Option<String>,
    /// `SIGN_UP` only: the `TERMS_VERSION` the person agreed to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accepted_terms: Option<String>,
}

/// The current version of the terms of use and privacy notice. Sign-up
/// sends it to say the person agreed; change it when they change materially.
pub const TERMS_VERSION: &str = "2026-10-24";

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
    /// Runs the waiting list. Missing from older servers (and sign-ins saved
    /// by older versions of the app), so it defaults to false.
    #[serde(default)]
    pub admin: bool,
}

/// What `SIGN_UP` and `SIGN_IN` return, with status 202, for an account that
/// can't sign in yet: its address isn't confirmed (a code was just emailed,
/// for `CONFIRM_EMAIL`), or it waits for an admin to approve it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Pending {
    pub email: String,
    #[serde(default)]
    pub confirm_email: bool,
}

/// Body of `CONFIRM_EMAIL`. Confirming doesn't sign in: sign in after it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfirmEmail {
    pub email: String,
    /// As emailed, e.g. `K7Q2-M9XD`. Case, spaces and dashes don't matter.
    pub code: String,
}

/// Body of `APP_LOCK_CHECK`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckCode {
    pub code: String,
}

/// What an account is to the server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountRole {
    Member,
    /// Runs the server from the admin panel: people, permissions, the waiting list.
    Admin,
    /// Named in the server's `ADMIN_EMAILS`: an admin who can't be demoted from the app.
    Owner,
}

/// What an account may use. New accounts get the server's defaults.
pub mod permissions {
    /// Copy data to the account, so other computers get it.
    pub const SYNC: &str = "sync";
    /// Share boards with other accounts.
    pub const SHARE: &str = "share";
    /// Get notification emails.
    pub const EMAIL: &str = "email";
    /// Use the assistant on the server's AI keys (people with their own keys don't need it).
    pub const AI: &str = "ai";
    pub const ALL: &[&str] = &[SYNC, SHARE, EMAIL, AI];
}

/// An account, as an admin sees it on `ADMIN_ACCOUNTS`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdminAccount {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    /// When they signed up (asked to join).
    pub created_at: DateTime<Utc>,
    /// None while they're on the waiting list.
    pub approved_at: Option<DateTime<Utc>>,
    pub role: AccountRole,
    /// From `permissions::ALL`.
    pub permissions: Vec<String>,
    /// When one of their devices last talked to the server.
    pub last_active_at: Option<DateTime<Utc>>,
}

/// Body of `PATCH ADMIN_ACCOUNT`: what to change (owners can't be changed).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AccountChange {
    pub role: Option<AccountRole>,
    pub permissions: Option<Vec<String>>,
}

/// The server's settings, from `GET ADMIN_SETTINGS`; `PUT` replaces them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdminSettings {
    /// New accounts wait for approval.
    pub waitlist: bool,
    /// What new accounts may use.
    pub default_permissions: Vec<String>,
}

/// Body of `FORGOT_PASSWORD` and `SEND_CONFIRMATION`. The server emails a
/// code if the account exists (and, for a confirmation, isn't confirmed yet).
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
    /// The encryption key wrapped with the new password (see `EncryptionKey`),
    /// saved along with it so the two never disagree.
    #[serde(default)]
    pub encryption_key: Option<String>,
}

/// The account's end-to-end encryption key, wrapped (encrypted) on a device
/// with the user's password and recovery key. The server can't open it: it
/// only keeps it so the user's other devices can. From `GET ENCRYPTION_KEY`;
/// `PUT` replaces it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct EncryptionKey {
    /// Opaque to the server. None until a device makes one.
    pub wrapped: Option<String>,
}

/// Longest wrapped key the server keeps.
pub const MAX_WRAPPED_KEY_LEN: usize = 4096;

/// How an account presents itself, from `GET PROFILE` and the body of `PUT
/// PROFILE`. Kept out of `User` so the picture isn't sent with every sign-in.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Profile {
    /// None shows the email instead.
    pub display_name: Option<String>,
    /// A `data:image/png|jpeg|webp;base64,` URL of at most `MAX_AVATAR_LEN` characters.
    pub avatar: Option<String>,
}

pub const MAX_DISPLAY_NAME_LEN: usize = 60;
/// About 190 KB of image: plenty for the 256×256 picture the app makes.
pub const MAX_AVATAR_LEN: usize = 256 * 1024;

/// Returns the message to show if the picture isn't one the server keeps.
pub fn check_avatar(avatar: &str) -> Result<(), &'static str> {
    let data = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,"]
        .iter()
        .find_map(|prefix| avatar.strip_prefix(prefix))
        .ok_or("Use a PNG, JPEG or WebP picture.")?;
    if avatar.len() > MAX_AVATAR_LEN {
        return Err("That picture is too big. Try a smaller one.");
    }
    if data.is_empty() || !data.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=')) {
        return Err("That picture couldn't be read. Try another one.");
    }
    Ok(())
}

/// Body of `VERIFY_PASSWORD`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfirmPassword {
    pub password: String,
    /// See `PLAIN_PASSWORD`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub login_key: Option<String>,
}

/// Body of `WEB_UPDATES`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebUpdates {
    pub email: String,
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

/// What a support message is about: (id, label).
pub const TICKET_KINDS: &[(&str, &str)] =
    &[("question", "A question"), ("bug", "Something's broken"), ("idea", "An idea"), ("account", "My account"), ("other", "Something else")];
pub const MAX_TICKET_SUBJECT: usize = 120;
pub const MAX_TICKET_MESSAGE: usize = 5000;

/// Body of `SUPPORT`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewTicket {
    /// One of `TICKET_KINDS`.
    pub kind: String,
    pub subject: String,
    pub message: String,
    /// Where to reply. Ignored when signed in: the account's address is used.
    #[serde(default)]
    pub email: Option<String>,
    pub app_version: String,
}

/// What `SUPPORT` returns: the reference to quote, e.g. `A1B2C3D4`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketSent {
    pub reference: String,
}

/// A support ticket, for admins.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ticket {
    pub id: String,
    pub reference: String,
    pub email: String,
    /// Sent while signed in to that account (so the address is confirmed).
    pub signed_in: bool,
    pub kind: String,
    pub subject: String,
    pub message: String,
    pub app_version: String,
    pub created_at: DateTime<Utc>,
    /// None while open.
    pub solved_at: Option<DateTime<Utc>>,
}

/// Body of `PATCH ADMIN_TICKET`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketChange {
    pub solved: bool,
}

/// The short reference people quote for a ticket.
pub fn ticket_reference(id: &str) -> String {
    let hex: String = id.chars().filter(char::is_ascii_hexdigit).collect();
    hex[hex.len().saturating_sub(8)..].to_uppercase()
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

    #[test]
    fn avatars() {
        assert!(check_avatar("data:image/png;base64,iVBORw0KGgo=").is_ok());
        assert!(check_avatar("data:image/svg+xml;base64,PHN2Zz4=").is_err(), "SVG can carry scripts");
        assert!(check_avatar("https://example.com/me.png").is_err());
        assert!(check_avatar("data:image/png;base64,<script>").is_err());
        assert!(check_avatar(&format!("data:image/png;base64,{}", "A".repeat(MAX_AVATAR_LEN))).is_err());
    }
}
