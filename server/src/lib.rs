//! Axiom's server: accounts, sync, and shared boards.
//!
//! The desktop app never needs it to work. It keeps everything in a local
//! database; the server holds an account's copy so other devices can catch up.

mod account;
pub mod admin;
mod ai;
mod digest_mail;
pub mod auth;
mod codes;
pub mod config;
pub mod db;
pub mod housekeeping;
mod entities;
mod error;
mod limit;
pub mod notify;
pub mod mail;
mod privacy;
mod spaces;
mod support;
pub mod sync;
mod web_updates;

use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};

use axiom_protocol::routes;
use axum::Router;
use axum::http::HeaderName;
use axum::routing::{delete, get, patch, post, put};
use sea_orm::DatabaseConnection;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

pub use config::Config;

/// Everything a request handler needs, shared by all requests.
#[derive(Clone)]
pub struct AppState(Arc<Shared>);

pub struct Shared {
    pub db: DatabaseConnection,
    pub keys: auth::tokens::Keys,
    pub limits: limit::Limits,
    /// The header the hosting proxy puts the client's IP in, if any.
    pub client_ip_header: Option<HeaderName>,
    /// Shared with the website, which calls the API for its visitors: a request
    /// carrying it in `x-axiom-proxy` is rate limited by `x-axiom-client-ip`
    /// (the visitor), not by the website's own address.
    pub web_proxy_secret: Option<String>,
    /// How long an already-used refresh token still works. Covers an app that
    /// refreshed but lost the response; after this, reuse means theft.
    pub reuse_grace: chrono::Duration,
    pub mailer: mail::Mailer,
    /// New accounts wait for an admin to approve them before they can sign in.
    /// Off here so tests can sign up freely; `main` turns it on unless
    /// `WAITLIST=off`. The admin panel's setting, once saved, wins.
    pub waitlist: bool,
    /// New accounts confirm their address with an emailed code before they
    /// can sign in. Off here so tests can sign up freely; `main` turns it on.
    pub confirm_emails: bool,
    /// Sign-ups must agree to the current terms (`axiom_protocol::TERMS_VERSION`).
    /// Off here so tests can sign up freely; `main` turns it on.
    pub require_terms: bool,
    /// Emails (normalised) of the owners: admins who can't be demoted from the
    /// app, so the server always has one. They never wait themselves.
    pub admins: HashSet<String>,
    /// Where the server is reached from outside, for links in emails.
    pub public_url: String,
    /// Where people write about their data, shown in the privacy notice.
    pub contact_email: Option<String>,
    /// Who runs this server (a person's or business's name), named in the privacy notice and terms.
    pub operator_name: Option<String>,
    /// Talks to the AI models behind the assistant.
    pub ai: axiom_ai::Ai,
    /// Axiom's own AI keys (`GEMINI_API_KEY`, `GROQ_API_KEY`). Without any,
    /// the assistant works only for people who add their own in the app.
    pub ai_keys: axiom_ai::Keys,
    /// The admin panel's settings, read from the database at startup.
    pub settings: RwLock<admin::Settings>,
}

impl Shared {
    pub fn new(db: DatabaseConnection, jwt_secret: &[u8]) -> Self {
        Self {
            db,
            keys: auth::tokens::Keys::new(jwt_secret),
            limits: limit::Limits::default(),
            client_ip_header: None,
            web_proxy_secret: None,
            reuse_grace: chrono::Duration::seconds(60),
            mailer: mail::Mailer::Log,
            waitlist: false,
            confirm_emails: false,
            require_terms: false,
            admins: HashSet::new(),
            public_url: "http://localhost:8787".into(),
            contact_email: None,
            operator_name: None,
            ai: axiom_ai::Ai::default(),
            ai_keys: axiom_ai::Keys::default(),
            settings: RwLock::new(admin::Settings::default()),
        }
    }

    pub fn is_owner(&self, email: &str) -> bool {
        self.admins.contains(email)
    }

    pub fn is_admin(&self, user: &entities::user::Model) -> bool {
        self.is_owner(&user.email) || user.role == "admin"
    }

    pub fn role(&self, user: &entities::user::Model) -> axiom_protocol::AccountRole {
        use axiom_protocol::AccountRole;
        if self.is_owner(&user.email) {
            AccountRole::Owner
        } else if user.role == "admin" {
            AccountRole::Admin
        } else {
            AccountRole::Member
        }
    }

    /// Whether new accounts wait for approval right now.
    pub fn waitlist_on(&self) -> bool {
        self.settings.read().unwrap().waitlist.unwrap_or(self.waitlist)
    }

    /// Whether the account may sign in and sync.
    pub fn is_approved(&self, user: &entities::user::Model) -> bool {
        !self.waitlist_on() || user.approved_at.is_some() || self.is_admin(user)
    }

    /// What the account may use (owners, everything).
    pub fn permissions(&self, user: &entities::user::Model) -> Vec<String> {
        if self.is_owner(&user.email) {
            return axiom_protocol::permissions::ALL.iter().map(|p| p.to_string()).collect();
        }
        admin::split(&user.permissions)
    }

    pub fn may(&self, user: &entities::user::Model, permission: &str) -> bool {
        self.permissions(user).iter().any(|p| p == permission)
    }

    /// The account as the app sees it.
    pub fn user_view(&self, user: entities::user::Model) -> axiom_protocol::User {
        axiom_protocol::User { admin: self.is_admin(&user), id: user.id, email: user.email, created_at: user.created_at }
    }
}

impl From<Shared> for AppState {
    fn from(shared: Shared) -> Self {
        Self(Arc::new(shared))
    }
}

impl std::ops::Deref for AppState {
    type Target = Shared;
    fn deref(&self) -> &Shared {
        &self.0
    }
}

/// Every route the server answers.
pub fn app(state: AppState) -> Router {
    Router::new()
        .route(routes::HEALTH, get(|| async { "ok" }))
        .route(routes::PRIVACY, get(privacy::page))
        .route(routes::TERMS, get(privacy::terms))
        .route(routes::CLIENT_IP, get(limit::client_ip))
        .route(routes::SIGN_UP, post(auth::sign_up))
        .route(routes::SIGN_IN, post(auth::sign_in))
        .route(routes::REFRESH, post(auth::refresh))
        .route(routes::SIGN_OUT, post(auth::sign_out))
        .route(routes::ME, get(auth::me))
        .route(routes::FORGOT_PASSWORD, post(auth::forgot_password))
        .route(routes::RESET_PASSWORD, post(auth::reset_password))
        .route(routes::CONFIRM_EMAIL, post(auth::confirm_email))
        .route(routes::SEND_CONFIRMATION, post(auth::send_confirmation))
        .route(routes::APP_LOCK_CODE, post(account::app_lock_code))
        .route(routes::APP_LOCK_CHECK, post(account::app_lock_check))
        .route(routes::ACCOUNT, delete(account::delete_account))
        .route(routes::CHANGE_PASSWORD, post(account::change_password))
        .route(routes::PROFILE, get(account::profile).put(account::update_profile))
        .route(routes::ENCRYPTION_KEY, get(account::encryption_key).put(account::set_encryption_key))
        .route(routes::VERIFY_PASSWORD, post(account::verify_password))
        .route(routes::DEVICES, get(account::devices))
        .route(routes::DEVICE, delete(account::sign_out_device))
        .route(routes::SYNC_PUSH, post(sync::push))
        .route(routes::SYNC_PULL, get(sync::pull))
        .route(routes::SPACES, get(spaces::list).post(spaces::create))
        .route(routes::SPACE, delete(spaces::delete))
        .route(routes::SPACE_ADOPT, post(spaces::adopt))
        .route(routes::SPACE_PUSH, post(spaces::push))
        .route(routes::SPACE_PULL, get(spaces::pull))
        .route(routes::SPACE_MEMBERS, get(spaces::members))
        .route(routes::SPACE_MEMBER, patch(spaces::change_role).delete(spaces::remove))
        .route(routes::SPACE_INVITES, post(spaces::invite))
        .route(routes::SPACE_INVITE, delete(spaces::withdraw))
        .route(routes::INVITES, get(spaces::my_invites))
        .route(routes::INVITE_ACCEPT, post(spaces::accept))
        .route(routes::INVITE_DECLINE, post(spaces::decline))
        .route(routes::ADMIN_ACCOUNTS, get(admin::accounts))
        .route(routes::ADMIN_ACCOUNT, delete(admin::decline).patch(admin::update))
        .route(routes::ADMIN_SETTINGS, get(admin::settings).put(admin::save_settings))
        .route(routes::SUPPORT, post(support::create))
        .route(routes::ADMIN_TICKETS, get(support::list))
        .route(routes::ADMIN_TICKET, patch(support::update))
        .route(routes::ADMIN_APPROVE, post(admin::approve))
        .route(routes::ADMIN_REVOKE, post(admin::revoke))
        .route(routes::NOTIFY_EMAILS, put(notify::plan))
        .route(routes::WEB_UPDATES, post(web_updates::join))
        .route(routes::AI_CHAT, post(ai::chat))
        .route(routes::NOTIFY_UNSUBSCRIBE, get(notify::unsubscribe_page).post(notify::unsubscribe_now))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Serves requests on `listener` until the task is dropped or the process stops.
pub async fn serve(listener: TcpListener, state: AppState) -> std::io::Result<()> {
    axum::serve(listener, app(state).into_make_service_with_connect_info::<SocketAddr>()).await
}
