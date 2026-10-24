//! The user's Axiom account: signing up, in and out on this device.
//!
//! An account is optional. Everything works signed out; signing in is what
//! lets sync (`crate::sync`) copy your data to your other devices.

mod client;
pub mod commands;
pub(crate) mod store;
#[cfg(test)]
mod tests;

use std::time::{Duration, Instant};

use axiom_protocol::{
    AccountChange, AccountRole, AdminAccount, AdminSettings, Adopt, Adopted, ChangePassword, Credentials, DeleteAccount, Device, Invite, Members, MyInvite, NewInvite, PullResponse, PushRequest,
    NewTicket, PLAIN_PASSWORD, Pending, Profile, PushResponse, ResetPassword, Role, Session, Space, Ticket, check_avatar, check_email, check_password, normalize_email,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use tokio::sync::Mutex;

use crate::error::{Error, Result};
use crate::vault::login_key;
use client::{Client, ClientError, SignUp};
pub use store::{Keychain, Saved, SessionStore};

/// The server this build talks to, set with `AXIOM_SERVER_URL` when building.
/// Development builds default to one on this computer (`npm run server`).
/// Release builds have no default: without it, accounts are switched off
/// rather than sending passwords to an address nobody has checked.
pub const SERVER_URL: &str = match option_env!("AXIOM_SERVER_URL") {
    Some(url) => url,
    None if cfg!(debug_assertions) => "http://localhost:8787",
    None => "",
};

const NO_SERVER: &str = "This copy of Axiom isn't connected to an account server, so accounts and sync aren't available.";

/// Kept in Tauri's managed state. Commands receive it as `State<'_, Account>`.
pub struct Account {
    client: Client,
    store: Box<dyn SessionStore>,
    /// Behind an async lock so two actions (say, a refresh and a sign-out)
    /// never interleave.
    state: Mutex<Option<SignedIn>>,
}

struct SignedIn {
    saved: Saved,
    /// The current access token and when to stop using it.
    access: Option<(String, Instant)>,
}

/// The account as the frontend sees it. Mirrored by `AccountStatus` in `src/lib/account.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AccountStatus {
    SignedOut,
    /// `admin`: runs the server's waiting list.
    SignedIn { email: String, admin: bool },
}

/// What signing up or in did. Mirrored by `SignInOutcome` in `src/lib/account.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum SignInOutcome {
    SignedIn { email: String, admin: bool },
    /// The account waits for an admin's approval; nothing is saved here.
    Waitlisted { email: String },
    /// A code was emailed to the address: `confirm_email` with it.
    ConfirmEmail { email: String },
}

impl Account {
    /// Picks up the sign-in saved on a previous launch, without going online.
    pub fn new(server_url: &str, store: Box<dyn SessionStore>) -> Self {
        let state = store.load().map(|saved| SignedIn { saved, access: None });
        Self { client: Client::new(server_url), store, state: Mutex::new(state) }
    }

    pub async fn status(&self) -> AccountStatus {
        status_of(&*self.state.lock().await)
    }

    /// Creates an account. It signs in once its address is confirmed (and an
    /// admin approves it, if the server has a waiting list).
    pub async fn sign_up(&self, email: &str, password: &str) -> Result<SignInOutcome> {
        self.require_server()?;
        let credentials = credentials(email, password)?;
        check_password(password).map_err(Error::Invalid)?;
        // Only called once the person has ticked the box (see `commands::account_sign_up`).
        let accepted_terms = Some(axiom_protocol::TERMS_VERSION.to_owned());
        let credentials = Credentials { password: login_key(&credentials.email, password), accepted_terms, ..credentials };
        let answer = self.client.sign_up(&credentials).await.map_err(account_error)?;
        self.outcome(answer).await
    }

    pub async fn sign_in(&self, email: &str, password: &str) -> Result<SignInOutcome> {
        self.require_server()?;
        let credentials = credentials(email, password)?;
        let (client, sent) = (&self.client, &credentials);
        let sign_in = |password, login_key| async move { client.sign_in(&Credentials { password, login_key, ..sent.clone() }).await };
        let answer = with_password(&credentials.email, password, sign_in).await.map_err(account_error)?;
        self.outcome(answer).await
    }

    async fn outcome(&self, answer: SignUp) -> Result<SignInOutcome> {
        match answer {
            SignUp::Pending(Pending { email, confirm_email: true }) => Ok(SignInOutcome::ConfirmEmail { email }),
            SignUp::Pending(Pending { email, .. }) => Ok(SignInOutcome::Waitlisted { email }),
            SignUp::Session(session) => match self.start(session).await? {
                AccountStatus::SignedIn { email, admin } => Ok(SignInOutcome::SignedIn { email, admin }),
                AccountStatus::SignedOut => unreachable!("start always signs in"),
            },
        }
    }

    /// Confirms the address with the emailed code, then signs in.
    pub async fn confirm_email(&self, email: &str, code: &str, password: &str) -> Result<SignInOutcome> {
        self.require_server()?;
        if code.trim().is_empty() {
            return Err(Error::Invalid("Enter the code from the email.".into()));
        }
        let body = axiom_protocol::ConfirmEmail { email: normalize_email(email), code: code.into() };
        self.client.confirm_email(&body).await.map_err(account_error)?;
        self.sign_in(email, password).await
    }

    /// Emails a new confirmation code (if the account isn't confirmed yet).
    pub async fn send_confirmation(&self, email: &str) -> Result<()> {
        self.require_server()?;
        self.client.send_confirmation(&normalize_email(email)).await.map_err(account_error)
    }

    /// Emails a code that turns off the app lock (see `crate::app_lock`).
    pub async fn send_unlock_code(&self) -> Result<()> {
        let token = self.access_token().await?;
        let result = self.client.send_unlock_code(&token).await;
        Ok(self.after_call(result).await?)
    }

    pub async fn check_unlock_code(&self, code: &str) -> Result<()> {
        if code.trim().is_empty() {
            return Err(Error::Invalid("Enter the code from the email.".into()));
        }
        let token = self.access_token().await?;
        let result = self.client.check_unlock_code(&token, &axiom_protocol::CheckCode { code: code.into() }).await;
        Ok(self.after_call(result).await?)
    }

    /// Asks the server to email a reset code. Succeeds whether or not the
    /// account exists (the server doesn't say).
    pub async fn request_reset(&self, email: &str) -> Result<()> {
        self.require_server()?;
        let email = normalize_email(email);
        check_email(&email).map_err(|message| Error::Invalid(message.into()))?;
        self.client.forgot_password(&email).await.map_err(account_error)
    }

    /// Sets a new password with an emailed code and signs in.
    pub async fn reset_password(&self, email: &str, code: &str, password: &str) -> Result<AccountStatus> {
        self.require_server()?;
        let Credentials { email, device_name, .. } = credentials(email, password)?;
        check_password(password).map_err(Error::Invalid)?;
        if code.trim().is_empty() {
            return Err(Error::Invalid("Enter the code from the email.".into()));
        }
        let request = ResetPassword { new_password: login_key(&email, password), email, code: code.into(), device_name };
        let session = self.client.reset_password(&request).await.map_err(account_error)?;
        self.start(session).await
    }

    /// Changes the password. Other devices are signed out; this one stays in.
    /// `encryption_key` is the data key wrapped with the new password (see `crate::vault`).
    pub async fn change_password(&self, current: &str, new: &str, encryption_key: Option<String>) -> Result<()> {
        check_password(new).map_err(Error::Invalid)?;
        let email = self.email().await?;
        let new_password = login_key(&email, new);
        let token = self.access_token().await?;
        let (client, token, new_password, encryption_key) = (&self.client, &token, &new_password, &encryption_key);
        let change = |current_password, _| async move {
            let request = ChangePassword { current_password, new_password: new_password.clone(), encryption_key: encryption_key.clone() };
            client.change_password(token, &request).await
        };
        let result = with_password(&email, current, change).await;
        Ok(self.after_call(result).await?)
    }

    /// The end-to-end encryption key, wrapped (see `crate::vault`).
    pub async fn encryption_key(&self) -> std::result::Result<Option<String>, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.encryption_key(&token).await;
        Ok(self.after_call(result).await?.wrapped)
    }

    pub async fn set_encryption_key(&self, wrapped: Option<String>) -> std::result::Result<(), ServerError> {
        let token = self.access_token().await?;
        let result = self.client.set_encryption_key(&token, &axiom_protocol::EncryptionKey { wrapped }).await;
        self.after_call(result).await
    }

    /// Checks the password with the server.
    pub async fn verify_password(&self, password: &str) -> Result<()> {
        let email = self.email().await?;
        let token = self.access_token().await?;
        let (client, token) = (&self.client, &token);
        let verify = |password, login_key| async move { client.verify_password(token, &axiom_protocol::ConfirmPassword { password, login_key }).await };
        let result = with_password(&email, password, verify).await;
        Ok(self.after_call(result).await?)
    }

    /// Replaces the notification emails the server will send (see `crate::notifications`).
    pub async fn plan_emails(&self, plan: &axiom_protocol::notify::PlanEmails) -> std::result::Result<axiom_protocol::notify::PlanResult, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.plan_emails(&token, plan).await;
        self.after_call(result).await
    }

    /// The name and picture the account shows.
    pub async fn profile(&self) -> Result<ProfileView> {
        let token = self.access_token().await?;
        let result = self.client.profile(&token).await;
        Ok(self.after_call(result).await?.into())
    }

    /// Replaces the name and picture. The picture is a small `data:image/...` URL.
    pub async fn update_profile(&self, display_name: Option<String>, avatar: Option<String>) -> Result<ProfileView> {
        if let Some(avatar) = &avatar {
            check_avatar(avatar).map_err(|message| Error::Invalid(message.into()))?;
        }
        let token = self.access_token().await?;
        let result = self.client.update_profile(&token, &Profile { display_name, avatar }).await;
        Ok(self.after_call(result).await?.into())
    }

    /// Every device signed in to the account.
    pub async fn devices(&self) -> Result<Vec<DeviceView>> {
        let token = self.access_token().await?;
        let result = self.client.devices(&token).await;
        Ok(self.after_call(result).await?.into_iter().map(DeviceView::from).collect())
    }

    pub async fn sign_out_device(&self, id: &str) -> Result<()> {
        let token = self.access_token().await?;
        let result = self.client.sign_out_device(&token, id).await;
        Ok(self.after_call(result).await?)
    }

    /// Deletes the account on the server, then signs out here.
    pub async fn delete_account(&self, password: &str) -> Result<()> {
        let email = self.email().await?;
        let token = self.access_token().await?;
        let (client, token) = (&self.client, &token);
        let delete = |password, _| async move { client.delete_account(token, &DeleteAccount { password }).await };
        let result = with_password(&email, password, delete).await;
        self.after_call(result).await?;
        *self.state.lock().await = None;
        self.store.clear();
        Ok(())
    }

    /// Forgets the sign-in on this device. Local data is left alone.
    pub async fn sign_out(&self) -> AccountStatus {
        let mut state = self.state.lock().await;
        if let Some(signed_in) = state.take() {
            self.store.clear();
            // Best effort: if we're offline the server session just expires.
            let _ = self.client.sign_out(&signed_in.saved.refresh_token).await;
        }
        AccountStatus::SignedOut
    }

    async fn email(&self) -> std::result::Result<String, ServerError> {
        self.state.lock().await.as_ref().map(|s| s.saved.user.email.clone()).ok_or(ServerError::SignedOut)
    }

    /// The signed-in user's id, if any.
    pub async fn user_id(&self) -> Option<String> {
        self.state.lock().await.as_ref().map(|s| s.saved.user.id.clone())
    }

    /// A valid access token for calling the server, refreshing it if needed.
    /// If the server has ended the session, signs out here too.
    pub async fn access_token(&self) -> std::result::Result<String, ServerError> {
        let mut state = self.state.lock().await;
        let signed_in = state.as_mut().ok_or(ServerError::SignedOut)?;
        if let Some((token, until)) = &signed_in.access {
            if Instant::now() < *until {
                return Ok(token.clone());
            }
        }
        match self.client.refresh(&signed_in.saved.refresh_token).await {
            Ok(session) => {
                let token = session.access_token.clone();
                *signed_in = self.remember(session).map_err(|e| ServerError::Failed(e.to_string()))?;
                Ok(token)
            }
            Err(err) => {
                let err = ServerError::from(err);
                if err == ServerError::SignedOut {
                    *state = None;
                    self.store.clear();
                }
                Err(err)
            }
        }
    }

    pub async fn push(&self, request: &PushRequest) -> std::result::Result<PushResponse, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.push(&token, request).await;
        self.after_call(result).await
    }

    pub async fn pull(&self, since: i64) -> std::result::Result<PullResponse, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.pull(&token, since).await;
        self.after_call(result).await
    }

    // ---------- Shared boards ----------
    // Each takes a fresh token and signs out here if the server ended the session.

    pub async fn spaces(&self) -> std::result::Result<Vec<Space>, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.spaces(&token).await;
        self.after_call(result).await
    }

    pub async fn create_space(&self, id: &str) -> std::result::Result<Space, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.create_space(&token, id).await;
        self.after_call(result).await
    }

    pub async fn adopt(&self, id: &str, request: &Adopt) -> std::result::Result<Adopted, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.adopt(&token, id, request).await;
        self.after_call(result).await
    }

    pub async fn delete_space(&self, id: &str) -> std::result::Result<(), ServerError> {
        let token = self.access_token().await?;
        let result = self.client.delete_space(&token, id).await;
        self.after_call(result).await
    }

    pub async fn space_push(&self, id: &str, request: &PushRequest) -> std::result::Result<PushResponse, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.space_push(&token, id, request).await;
        self.after_call(result).await
    }

    pub async fn space_pull(&self, id: &str, since: i64) -> std::result::Result<PullResponse, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.space_pull(&token, id, since).await;
        self.after_call(result).await
    }

    pub async fn members(&self, id: &str) -> std::result::Result<Members, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.members(&token, id).await;
        self.after_call(result).await
    }

    pub async fn invite(&self, id: &str, request: &NewInvite) -> std::result::Result<Invite, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.invite(&token, id, request).await;
        self.after_call(result).await
    }

    pub async fn withdraw_invite(&self, id: &str, invite_id: &str) -> std::result::Result<(), ServerError> {
        let token = self.access_token().await?;
        let result = self.client.withdraw_invite(&token, id, invite_id).await;
        self.after_call(result).await
    }

    pub async fn change_role(&self, id: &str, user_id: &str, role: Role) -> std::result::Result<(), ServerError> {
        let token = self.access_token().await?;
        let result = self.client.change_role(&token, id, user_id, role).await;
        self.after_call(result).await
    }

    pub async fn remove_member(&self, id: &str, user_id: &str) -> std::result::Result<(), ServerError> {
        let token = self.access_token().await?;
        let result = self.client.remove_member(&token, id, user_id).await;
        self.after_call(result).await
    }

    pub async fn my_invites(&self) -> std::result::Result<Vec<MyInvite>, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.my_invites(&token).await;
        self.after_call(result).await
    }

    pub async fn accept_invite(&self, id: &str) -> std::result::Result<Space, ServerError> {
        let token = self.access_token().await?;
        let result = self.client.accept_invite(&token, id).await;
        self.after_call(result).await
    }

    pub async fn decline_invite(&self, id: &str) -> std::result::Result<(), ServerError> {
        let token = self.access_token().await?;
        let result = self.client.decline_invite(&token, id).await;
        self.after_call(result).await
    }

    // ---------- Waiting list (admins only) ----------

    pub async fn admin_accounts(&self) -> Result<Vec<AdminAccountView>> {
        let token = self.access_token().await?;
        let result = self.client.admin_accounts(&token).await;
        Ok(self.after_call(result).await?.into_iter().map(AdminAccountView::from).collect())
    }

    pub async fn approve(&self, id: &str) -> Result<()> {
        let token = self.access_token().await?;
        let result = self.client.approve(&token, id).await;
        Ok(self.after_call(result).await?)
    }

    pub async fn decline(&self, id: &str) -> Result<()> {
        let token = self.access_token().await?;
        let result = self.client.decline(&token, id).await;
        Ok(self.after_call(result).await?)
    }

    pub async fn revoke(&self, id: &str) -> Result<()> {
        let token = self.access_token().await?;
        let result = self.client.revoke(&token, id).await;
        Ok(self.after_call(result).await?)
    }

    /// Changes an account's role or permissions.
    pub async fn admin_update(&self, id: &str, role: Option<AccountRole>, permissions: Option<Vec<String>>) -> Result<AdminAccountView> {
        let token = self.access_token().await?;
        let result = self.client.admin_update(&token, id, &AccountChange { role, permissions }).await;
        Ok(self.after_call(result).await?.into())
    }

    /// Sends a message to support, as the account when signed in (its address
    /// is used); otherwise from `email`. Returns the reference to quote.
    pub async fn contact_support(&self, kind: &str, subject: &str, message: &str, email: Option<String>, app_version: &str) -> Result<String> {
        self.require_server()?;
        let signed_in = self.state.lock().await.is_some();
        let token = if signed_in { Some(self.access_token().await?) } else { None };
        let ticket = NewTicket { kind: kind.into(), subject: subject.into(), message: message.into(), email, app_version: app_version.into() };
        let result = self.client.support(token.as_deref(), &ticket).await;
        Ok(self.after_call(result).await?.reference)
    }

    /// Support tickets, for an admin: open ones first.
    pub async fn admin_tickets(&self) -> Result<Vec<TicketView>> {
        let token = self.access_token().await?;
        let result = self.client.admin_tickets(&token).await;
        Ok(self.after_call(result).await?.into_iter().map(TicketView::from).collect())
    }

    pub async fn admin_ticket_solved(&self, id: &str, solved: bool) -> Result<TicketView> {
        let token = self.access_token().await?;
        let result = self.client.admin_ticket(&token, id, &axiom_protocol::TicketChange { solved }).await;
        Ok(self.after_call(result).await?.into())
    }

    pub async fn admin_settings(&self) -> Result<AdminSettingsView> {
        let token = self.access_token().await?;
        let result = self.client.admin_settings(&token).await;
        let s = self.after_call(result).await?;
        Ok(AdminSettingsView { waitlist: s.waitlist, default_permissions: s.default_permissions })
    }

    pub async fn save_admin_settings(&self, settings: AdminSettingsView) -> Result<AdminSettingsView> {
        let token = self.access_token().await?;
        let body = AdminSettings { waitlist: settings.waitlist, default_permissions: settings.default_permissions };
        let result = self.client.save_admin_settings(&token, &body).await;
        let s = self.after_call(result).await?;
        Ok(AdminSettingsView { waitlist: s.waitlist, default_permissions: s.default_permissions })
    }

    /// A refused token means the session was ended elsewhere: sign out here.
    async fn after_call<T>(&self, result: std::result::Result<T, ClientError>) -> std::result::Result<T, ServerError> {
        let result = result.map_err(ServerError::from);
        if result.as_ref().err() == Some(&ServerError::SignedOut) {
            *self.state.lock().await = None;
            self.store.clear();
        }
        result
    }

    /// Every way of signing in starts here: a build with no server can't.
    fn require_server(&self) -> Result<()> {
        if self.client.has_server() { Ok(()) } else { Err(Error::Account(NO_SERVER.into())) }
    }

    async fn start(&self, session: Session) -> Result<AccountStatus> {
        let mut state = self.state.lock().await;
        *state = Some(self.remember(session)?);
        Ok(status_of(&state))
    }

    /// Saves a new session to the credential store and returns it as state.
    fn remember(&self, session: Session) -> Result<SignedIn> {
        let saved = Saved { refresh_token: session.refresh_token, user: session.user };
        self.store.save(&saved).map_err(Error::Account)?;
        // Stop a minute early so a token never expires mid-request.
        let lifetime = Duration::from_secs(session.expires_in.saturating_sub(60));
        Ok(SignedIn { saved, access: Some((session.access_token, Instant::now() + lifetime)) })
    }
}

fn status_of(state: &Option<SignedIn>) -> AccountStatus {
    match state {
        Some(signed_in) => AccountStatus::SignedIn { email: signed_in.saved.user.email.clone(), admin: signed_in.saved.user.admin },
        None => AccountStatus::SignedOut,
    }
}

fn credentials(email: &str, password: &str) -> Result<Credentials> {
    let email = normalize_email(email);
    check_email(&email).map_err(|message| Error::Invalid(message.into()))?;
    if password.is_empty() {
        return Err(Error::Invalid("Enter your password.".into()));
    }
    Ok(Credentials { email, password: password.into(), device_name: device_name(), login_key: None, accepted_terms: None })
}

/// Calls the server with the login key in place of the password, so it never
/// sees the password (see `crate::vault::login_key`). An account still on its
/// password from an older Axiom answers `PLAIN_PASSWORD`: then the password
/// goes once more, with the key to replace it.
async fn with_password<T, Call, Sent>(email: &str, password: &str, call: Call) -> std::result::Result<T, ClientError>
where
    Call: Fn(String, Option<String>) -> Sent,
    Sent: Future<Output = std::result::Result<T, ClientError>>,
{
    let key = login_key(email, password);
    match call(key.clone(), None).await {
        Err(err) if err.status() == Some(PLAIN_PASSWORD) => call(password.into(), Some(key)).await,
        result => result,
    }
}

/// The name in System Settings → General → About, e.g. "Ada's MacBook Air".
/// Apps opened from the Dock don't get HOSTNAME, so ask the system.
fn mac_computer_name() -> Option<String> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let output = std::process::Command::new("/usr/sbin/scutil").args(["--get", "ComputerName"]).output().ok()?;
    let name = String::from_utf8(output.stdout).ok()?.trim().to_owned();
    (output.status.success() && !name.is_empty()).then_some(name)
}

/// Shown in the account's device list, e.g. "DESKTOP-4F2 (Windows)".
fn device_name() -> String {
    let host = std::env::var("COMPUTERNAME").ok().or_else(mac_computer_name).or_else(|| std::env::var("HOSTNAME").ok()).unwrap_or_else(|| "Computer".into());
    let os = match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        other => other,
    };
    format!("{host} ({os})")
}

fn account_error(err: ClientError) -> Error {
    Error::Account(err.message())
}

/// A signed-in device for the frontend. Mirrored by `Device` in `src/lib/account.ts`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub id: String,
    pub name: String,
    pub signed_in_at: DateTime<Utc>,
    pub last_active_at: DateTime<Utc>,
    /// This computer.
    pub current: bool,
}

impl From<Device> for DeviceView {
    fn from(d: Device) -> Self {
        Self { id: d.id, name: d.name, signed_in_at: d.signed_in_at, last_active_at: d.last_active_at, current: d.current }
    }
}

/// The account's name and picture. Mirrored by `Profile` in `src/lib/account.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

impl From<Profile> for ProfileView {
    fn from(p: Profile) -> Self {
        Self { display_name: p.display_name, avatar: p.avatar }
    }
}

/// An account on the server, for an admin. Mirrored by `AdminAccount` in `src/lib/account.ts`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAccountView {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub created_at: DateTime<Utc>,
    /// None while on the waiting list.
    pub approved_at: Option<DateTime<Utc>>,
    pub role: AccountRole,
    pub permissions: Vec<String>,
    pub last_active_at: Option<DateTime<Utc>>,
}

impl From<AdminAccount> for AdminAccountView {
    fn from(a: AdminAccount) -> Self {
        Self {
            id: a.id,
            email: a.email,
            display_name: a.display_name,
            created_at: a.created_at,
            approved_at: a.approved_at,
            role: a.role,
            permissions: a.permissions,
            last_active_at: a.last_active_at,
        }
    }
}

/// A support ticket, for an admin. Mirrored by `Ticket` in `src/lib/support.ts`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketView {
    pub id: String,
    pub reference: String,
    pub email: String,
    /// Sent while signed in, so the address is confirmed.
    pub signed_in: bool,
    pub kind: String,
    pub subject: String,
    pub message: String,
    pub app_version: String,
    pub created_at: DateTime<Utc>,
    pub solved_at: Option<DateTime<Utc>>,
}

impl From<Ticket> for TicketView {
    fn from(t: Ticket) -> Self {
        Self {
            id: t.id,
            reference: t.reference,
            email: t.email,
            signed_in: t.signed_in,
            kind: t.kind,
            subject: t.subject,
            message: t.message,
            app_version: t.app_version,
            created_at: t.created_at,
            solved_at: t.solved_at,
        }
    }
}

/// The server's settings, for the admin panel. Mirrored by `AdminSettings` in `src/lib/account.ts`.
#[derive(Clone, Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSettingsView {
    pub waitlist: bool,
    pub default_permissions: Vec<String>,
}

/// Lets commands use `?` on server calls; the message is ready to show.
impl From<ServerError> for Error {
    fn from(err: ServerError) -> Self {
        Error::Account(match err {
            ServerError::Offline => ClientError::Offline.message(),
            ServerError::SignedOut => "You've been signed out. Sign in again to continue.".into(),
            ServerError::Failed(message) | ServerError::Forbidden(message) | ServerError::Missing(message) => message,
        })
    }
}

/// Why a call to the server didn't work, as sync needs to know it.
#[derive(Debug, Clone, PartialEq)]
pub enum ServerError {
    /// No answer; try again later.
    Offline,
    /// The session is over (signed out here or ended elsewhere).
    SignedOut,
    /// The server answered with an error, ready to show.
    Failed(String),
    /// Not allowed (403), e.g. a viewer pushing to a shared board.
    Forbidden(String),
    /// Not there (404), e.g. a shared board that stopped being shared, or a
    /// server too old to know the route.
    Missing(String),
}

impl From<ClientError> for ServerError {
    fn from(err: ClientError) -> Self {
        match err {
            ClientError::Offline => ServerError::Offline,
            err if err.is_unauthorized() => ServerError::SignedOut,
            err if err.status() == Some(403) => ServerError::Forbidden(err.message()),
            err if err.status() == Some(404) => ServerError::Missing(err.message()),
            err => ServerError::Failed(err.message()),
        }
    }
}
