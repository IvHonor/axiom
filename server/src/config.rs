//! Settings, read from environment variables. Locally they come from
//! `server/.env`; on the host they're set in its dashboard.

use std::collections::HashSet;

use axiom_protocol::{check_email, normalize_email};
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
    /// `WEB_PROXY_SECRET`: the secret the website sends with its visitors' addresses.
    pub web_proxy_secret: Option<String>,
    /// Resend's API key. Without one, emails are printed to the log instead.
    pub resend_api_key: Option<String>,
    /// The sender, e.g. `Axiom <noreply@yourdomain.com>`. The domain must be
    /// verified in Resend; `onboarding@resend.dev` only delivers to the email
    /// address you signed up to Resend with.
    pub email_from: String,
    /// New accounts wait for approval. On unless `WAITLIST=off`.
    pub waitlist: bool,
    /// `ADMIN_EMAILS`, comma-separated: who approves the waiting list.
    pub admins: HashSet<String>,
    /// Where people reach the server, for links in emails: `PUBLIC_URL`, or
    /// the address Render gives the service (`RENDER_EXTERNAL_URL`).
    pub public_url: String,
    /// `CONTACT_EMAIL`: where people write about their data, shown in the
    /// privacy notice.
    pub contact_email: Option<String>,
    /// `OPERATOR_NAME`: who runs this server, named in the privacy notice
    /// and terms as the one responsible for people's data.
    pub operator_name: Option<String>,
    /// `GEMINI_API_KEY` and `GROQ_API_KEY`: the assistant's AI, Gemini first.
    /// Keys from aistudio.google.com/apikey and console.groq.com/keys. Gemini
    /// is only used with `GEMINI_PAID=yes`: Google's terms allow only its paid
    /// service for apps used in the UK, EEA and Switzerland.
    pub ai_keys: axiom_ai::Keys,
    /// A `GEMINI_API_KEY` set without `GEMINI_PAID`, and so left unused.
    pub gemini_unpaid: bool,
    /// `GEMINI_MODEL`, `GROQ_MODEL` and `WHISPER_MODEL`, to override the models used.
    pub ai_models: axiom_ai::Models,
    /// `AI_DAILY_LIMIT`: the assistant's model calls per day across every account.
    pub ai_daily_limit: u32,
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

        let web_proxy_secret = var("WEB_PROXY_SECRET");
        if web_proxy_secret.as_ref().is_some_and(|s| s.len() < 32) {
            return Err("WEB_PROXY_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48".into());
        }

        let resend_api_key = var("RESEND_API_KEY");
        let email_from = var("EMAIL_FROM").unwrap_or_else(|| "Axiom <onboarding@resend.dev>".into());

        let waitlist = match var("WAITLIST").map(|v| v.trim().to_lowercase()).as_deref() {
            None | Some("on" | "true" | "1") => true,
            Some("off" | "false" | "0") => false,
            Some(other) => return Err(format!("WAITLIST must be on or off, got {other}")),
        };
        let admins: HashSet<String> =
            var("ADMIN_EMAILS").unwrap_or_default().split(',').map(normalize_email).filter(|e| !e.is_empty()).collect();
        if let Some(bad) = admins.iter().find(|e| check_email(e).is_err()) {
            return Err(format!("ADMIN_EMAILS has an address that isn't valid: {bad}"));
        }

        let public_url = var("PUBLIC_URL")
            .or_else(|| var("RENDER_EXTERNAL_URL"))
            .unwrap_or_else(|| format!("http://localhost:{port}"))
            .trim_end_matches('/')
            .to_owned();

        let contact_email = var("CONTACT_EMAIL").map(|e| normalize_email(&e));
        if let Some(bad) = contact_email.as_ref().filter(|e| check_email(e).is_err()) {
            return Err(format!("CONTACT_EMAIL isn't a valid address: {bad}"));
        }

        let operator_name = var("OPERATOR_NAME").map(|name| name.trim().to_owned());

        let (ai_keys, gemini_unpaid) = ai_keys(var("GEMINI_API_KEY"), var("GROQ_API_KEY"), var("GEMINI_PAID").as_deref());
        let defaults = axiom_ai::Models::default();
        let ai_models = axiom_ai::Models {
            gemini: var("GEMINI_MODEL").unwrap_or(defaults.gemini),
            groq: var("GROQ_MODEL").unwrap_or(defaults.groq),
            whisper: var("WHISPER_MODEL").unwrap_or(defaults.whisper),
        };
        let ai_daily_limit = match var("AI_DAILY_LIMIT") {
            Some(limit) => limit.trim().parse().map_err(|_| format!("AI_DAILY_LIMIT must be a whole number, got {limit}"))?,
            None => crate::ai::EVERYONE_PER_DAY,
        };

        Ok(Self {
            database_url,
            jwt_secret,
            port,
            client_ip_header,
            web_proxy_secret,
            resend_api_key,
            email_from,
            waitlist,
            admins,
            public_url,
            contact_email,
            operator_name,
            ai_keys,
            gemini_unpaid,
            ai_models,
            ai_daily_limit,
        })
    }
}

/// The AI keys to use, and whether a Gemini key was left out because it
/// isn't marked as on Google's paid service.
fn ai_keys(gemini: Option<String>, groq: Option<String>, paid: Option<&str>) -> (axiom_ai::Keys, bool) {
    let paid = paid.is_some_and(|p| matches!(p.trim().to_lowercase().as_str(), "yes" | "true" | "1" | "on"));
    let unpaid = gemini.is_some() && !paid;
    (axiom_ai::Keys { gemini: gemini.filter(|_| paid), groq }, unpaid)
}

#[cfg(test)]
mod ai_key_tests {
    use super::ai_keys;

    #[test]
    fn gemini_only_once_it_is_marked_paid() {
        let (keys, unpaid) = ai_keys(Some("g".into()), Some("q".into()), None);
        assert_eq!((keys.gemini, keys.groq.as_deref(), unpaid), (None, Some("q"), true));
        let (keys, unpaid) = ai_keys(Some("g".into()), None, Some("Yes"));
        assert_eq!((keys.gemini.as_deref(), unpaid), (Some("g"), false));
        assert!(!ai_keys(None, Some("q".into()), None).1, "no Gemini key, nothing to warn about");
    }
}
