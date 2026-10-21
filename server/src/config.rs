//! Settings, read from environment variables. Locally they come from
//! `server/.env`; on the host they're set in its dashboard.

use axum::http::HeaderName;

pub struct Config {
    /// Neon's connection string (or `sqlite::memory:` to try things out).
    pub database_url: String,
    /// Signs access tokens. Anyone who has it can forge them, so keep it secret.
    pub jwt_secret: String,
    pub port: u16,
    /// Behind a proxy (any host), the header holding the client's real IP,
    /// e.g. `x-forwarded-for`. Used for rate limiting.
    pub client_ip_header: Option<HeaderName>,
    /// Resend's API key. Without one, emails are printed to the log instead.
    pub resend_api_key: Option<String>,
    /// The sender, e.g. `Axiom <noreply@yourdomain.com>`. The domain must be
    /// verified in Resend; `onboarding@resend.dev` only delivers to the email
    /// address you signed up to Resend with.
    pub email_from: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let var = |name: &str| std::env::var(name).ok().filter(|v| !v.trim().is_empty());

        let database_url = var("DATABASE_URL").ok_or("DATABASE_URL is not set.")?;
        let jwt_secret = var("JWT_SECRET").ok_or("JWT_SECRET is not set.")?;
        if jwt_secret.len() < 32 {
            return Err("JWT_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48".into());
        }
        let port = match var("PORT") {
            Some(port) => port.parse().map_err(|_| format!("PORT must be a number, got {port}"))?,
            None => 8787,
        };
        let client_ip_header = match var("CLIENT_IP_HEADER") {
            Some(name) => Some(name.parse().map_err(|_| format!("CLIENT_IP_HEADER isn't a valid header name: {name}"))?),
            None => None,
        };

        let resend_api_key = var("RESEND_API_KEY");
        let email_from = var("EMAIL_FROM").unwrap_or_else(|| "Axiom <onboarding@resend.dev>".into());

        Ok(Self { database_url, jwt_secret, port, client_ip_header, resend_api_key, email_from })
    }
}
