use std::path::Path;

use axiom_server::{AppState, Config, Shared, db};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    // Locally, settings come from server/.env. On the host they're real
    // environment variables and this file doesn't exist.
    let _ = dotenvy::from_path(Path::new(env!("CARGO_MANIFEST_DIR")).join(".env"));
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "axiom_server=info,tower_http=info".into()))
        .init();

    let config = Config::from_env().unwrap_or_else(|err| fail(&err));
    let db = db::connect(&config.database_url)
        .await
        .unwrap_or_else(|err| fail(&format!("Can't open the database: {err}")));

    let mut shared = Shared::new(db, config.jwt_secret.as_bytes());
    shared.client_ip_header = config.client_ip_header;
    match config.resend_api_key {
        Some(key) => shared.mailer = axiom_server::mail::Mailer::resend(key, config.email_from),
        None => tracing::warn!("RESEND_API_KEY isn't set: emails (reset codes) are printed here instead of sent"),
    }

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", config.port))
        .await
        .unwrap_or_else(|err| fail(&format!("Can't listen on port {}: {err}", config.port)));
    tracing::info!("Axiom server listening on port {}", config.port);

    if let Err(err) = axiom_server::serve(listener, AppState::from(shared)).await {
        fail(&err.to_string());
    }
}

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(1);
}
