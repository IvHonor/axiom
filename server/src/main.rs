use std::path::Path;

use axiom_server::{AppState, Config, Shared, db};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    // Locally, settings come from server/.env. On the host they're real
    // environment variables and this file doesn't exist.
    // A line it can't read stops it reading the rest, so say so rather than
    // run with half the settings. (Values with spaces need quotes.)
    match dotenvy::from_path(Path::new(env!("CARGO_MANIFEST_DIR")).join(".env")) {
        Ok(()) => {}
        Err(dotenvy::Error::Io(err)) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => fail(&format!("Can't read server/.env: {err}. Put values with spaces in quotes, e.g. EMAIL_FROM=\"Axiom <noreply@example.com>\".")),
    }
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "axiom_server=info,tower_http=info".into()))
        .init();

    let config = Config::from_env().unwrap_or_else(|err| fail(&err));
    let db = db::connect(&config.database_url)
        .await
        .unwrap_or_else(|err| fail(&format!("Can't open the database: {err}")));

    let mut shared = Shared::new(db, config.jwt_secret.as_bytes());
    shared.client_ip_header = config.client_ip_header;
    shared.web_proxy_secret = config.web_proxy_secret;
    shared.waitlist = config.waitlist;
    shared.confirm_emails = true;
    shared.require_terms = true;
    shared.admins = config.admins;
    shared.public_url = config.public_url;
    if config.contact_email.is_none() {
        tracing::warn!("CONTACT_EMAIL isn't set: the privacy notice has no address for questions about people's data");
    }
    shared.contact_email = config.contact_email;
    if config.operator_name.is_none() {
        tracing::warn!("OPERATOR_NAME isn't set: the privacy notice doesn't say who runs Axiom, which UK GDPR asks it to");
    }
    shared.operator_name = config.operator_name;
    if config.gemini_unpaid {
        tracing::warn!("GEMINI_API_KEY is set but GEMINI_PAID isn't: Gemini isn't used, as Google allows only its paid service for apps used in the UK, EEA and Switzerland. Turn on billing for the key's project, then set GEMINI_PAID=yes");
    }
    if !config.ai_keys.any() {
        tracing::warn!("GEMINI_API_KEY and GROQ_API_KEY aren't set: the assistant works only for people with their own key");
    }
    shared.ai = axiom_ai::Ai::new(config.ai_models);
    shared.ai_keys = config.ai_keys;
    shared.ai_daily_limit = config.ai_daily_limit;
    if shared.waitlist && shared.admins.is_empty() {
        tracing::warn!("The waiting list is on but ADMIN_EMAILS isn't set: nobody can approve new accounts");
    }
    match config.resend_api_key {
        Some(key) => shared.mailer = axiom_server::mail::Mailer::resend(key, config.email_from),
        None => tracing::warn!("RESEND_API_KEY isn't set: emails (reset codes) are printed here instead of sent"),
    }

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", config.port))
        .await
        .unwrap_or_else(|err| fail(&format!("Can't listen on port {}: {err}", config.port)));
    tracing::info!("Axiom server listening on port {}", config.port);

    if let Err(err) = axiom_server::admin::load_settings(&shared).await {
        fail(&format!("Can't read the server's settings: {err}"));
    }
    let state = AppState::from(shared);
    tokio::spawn(axiom_server::notify::run(state.clone()));
    tokio::spawn(axiom_server::housekeeping::run(state.clone()));

    if let Err(err) = axiom_server::serve(listener, state).await {
        fail(&err.to_string());
    }
}

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(1);
}
