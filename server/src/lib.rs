//! Axiom's server: accounts, sync, and shared boards.
//!
//! The desktop app never needs it to work. It keeps everything in a local
//! database; the server holds an account's copy so other devices can catch up.

mod account;
pub mod auth;
pub mod config;
pub mod db;
mod entities;
mod error;
mod limit;
pub mod mail;
mod spaces;
pub mod sync;

use std::net::SocketAddr;
use std::sync::Arc;

use axiom_protocol::routes;
use axum::Router;
use axum::http::HeaderName;
use axum::routing::{delete, get, patch, post};
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
    /// How long an already-used refresh token still works. Covers an app that
    /// refreshed but lost the response; after this, reuse means theft.
    pub reuse_grace: chrono::Duration,
    pub mailer: mail::Mailer,
}

impl Shared {
    pub fn new(db: DatabaseConnection, jwt_secret: &[u8]) -> Self {
        Self {
            db,
            keys: auth::tokens::Keys::new(jwt_secret),
            limits: limit::Limits::default(),
            client_ip_header: None,
            reuse_grace: chrono::Duration::seconds(60),
            mailer: mail::Mailer::Log,
        }
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
        .route(routes::SIGN_UP, post(auth::sign_up))
        .route(routes::SIGN_IN, post(auth::sign_in))
        .route(routes::REFRESH, post(auth::refresh))
        .route(routes::SIGN_OUT, post(auth::sign_out))
        .route(routes::ME, get(auth::me))
        .route(routes::FORGOT_PASSWORD, post(auth::forgot_password))
        .route(routes::RESET_PASSWORD, post(auth::reset_password))
        .route(routes::ACCOUNT, delete(account::delete_account))
        .route(routes::CHANGE_PASSWORD, post(account::change_password))
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
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Serves requests on `listener` until the task is dropped or the process stops.
pub async fn serve(listener: TcpListener, state: AppState) -> std::io::Result<()> {
    axum::serve(listener, app(state).into_make_service_with_connect_info::<SocketAddr>()).await
}
