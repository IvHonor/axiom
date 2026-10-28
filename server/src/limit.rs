//! Rate limiting, to slow down password guessing and sign-up spam.
//! Counts live in memory, which is right for a single server process.

use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::HeaderMap;
use axum::http::request::Parts;
use sha2::{Digest, Sha256};
use serde_json::{Map, Value, json};

use crate::AppState;
use crate::error::ApiError;

pub struct Limits {
    /// Sign-up and sign-in requests per IP address.
    pub per_ip: Limiter,
    /// Wrong passwords per account. Stops guessing even across many IPs.
    pub failed_sign_ins: Limiter,
    /// Reset emails per address, so nobody can flood someone's inbox.
    pub reset_requests: Limiter,
    /// Board invitations per inviting account, so nobody can use Axiom to send spam.
    pub invites: Limiter,
    /// Emailed codes (confirming an address, unlocking the app) per address or account.
    pub code_requests: Limiter,
    /// Support messages per account, or per network without one.
    pub tickets: Limiter,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            per_ip: Limiter::new(30, Duration::from_secs(10 * 60)),
            failed_sign_ins: Limiter::new(10, Duration::from_secs(15 * 60)),
            reset_requests: Limiter::new(3, Duration::from_secs(60 * 60)),
            invites: Limiter::new(20, Duration::from_secs(60 * 60)),
            code_requests: Limiter::new(5, Duration::from_secs(60 * 60)),
            tickets: Limiter::new(5, Duration::from_secs(60 * 60)),
        }
    }
}

impl Limits {
    pub fn check_ip(&self, ip: &ClientIp) -> Result<(), ApiError> {
        if self.per_ip.hit(&ip.0) {
            Ok(())
        } else {
            Err(ApiError::too_many("Too many attempts from this network. Try again in a few minutes."))
        }
    }
}

/// Allows `max` hits per key in each `window`.
pub struct Limiter {
    max: u32,
    window: Duration,
    hits: Mutex<HashMap<String, (Instant, u32)>>,
}

impl Limiter {
    pub fn new(max: u32, window: Duration) -> Self {
        Self { max, window, hits: Mutex::default() }
    }

    /// Counts a hit. Returns false if `key` has gone over its limit.
    pub fn hit(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut hits = self.hits.lock().unwrap();
        // Forget finished windows now and then, so the map can't grow forever.
        if hits.len() > 10_000 {
            hits.retain(|_, (start, _)| now - *start < self.window);
        }
        let entry = hits.entry(key.to_owned()).or_insert((now, 0));
        if now - entry.0 >= self.window {
            *entry = (now, 0);
        }
        entry.1 += 1;
        entry.1 <= self.max
    }

    /// Whether `key` is over its limit, without counting a hit.
    pub fn is_blocked(&self, key: &str) -> bool {
        let hits = self.hits.lock().unwrap();
        hits.get(key).is_some_and(|(start, count)| start.elapsed() < self.window && *count >= self.max)
    }

    pub fn clear(&self, key: &str) {
        self.hits.lock().unwrap().remove(key);
    }
}

/// The client's IP: from the proxy's header when configured, otherwise the
/// connection's address.
pub struct ClientIp(pub String);

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Infallible> {
        // Proxies append the address they saw, so the last entry is the one
        // our proxy added; earlier entries can be forged by the client.
        let from_header = state
            .client_ip_header
            .as_ref()
            .and_then(|name| parts.headers.get(name))
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.rsplit(',').next())
            .map(|ip| ip.trim().to_owned())
            .filter(|ip| !ip.is_empty());
        if from_header.is_none() && state.client_ip_header.is_some() && !MISSING_TOLD.swap(true, Ordering::Relaxed) {
            tracing::warn!("CLIENT_IP_HEADER is set, but a request came without it: rate limits fall back to the proxy's address. GET /v1/client-ip shows what arrives.");
        }
        let ip = from_website(parts, state)
            .or(from_header)
            .or_else(|| parts.extensions.get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip().to_string()))
            .unwrap_or_else(|| "unknown".into());
        Ok(ClientIp(ip))
    }
}

/// The visitor's address, when the request comes from the website with the shared secret.
fn from_website(parts: &Parts, state: &AppState) -> Option<String> {
    let secret = state.web_proxy_secret.as_deref()?;
    // Compared as hashes, so the time taken says nothing about the secret.
    let sent = parts.headers.get("x-axiom-proxy")?.as_bytes();
    if Sha256::digest(sent) != Sha256::digest(secret.as_bytes()) {
        return None;
    }
    let ip = parts.headers.get("x-axiom-client-ip")?.to_str().ok()?.trim();
    (!ip.is_empty() && ip.len() <= 64).then(|| ip.to_owned())
}

/// Warned once that the configured header was missing.
static MISSING_TOLD: AtomicBool = AtomicBool::new(false);

/// The headers proxies put a client's address in.
const ADDRESS_HEADERS: &[&str] = &["cf-connecting-ip", "true-client-ip", "x-forwarded-for", "x-real-ip", "forwarded"];

/// What the server sees of the caller's own address, and which address the
/// rate limits use, for setting `CLIENT_IP_HEADER` on a new host. Shows
/// nothing that isn't about the caller's own connection.
pub async fn client_ip(ip: ClientIp, headers: HeaderMap) -> Json<Value> {
    let seen: Map<String, Value> = ADDRESS_HEADERS
        .iter()
        .filter_map(|name| Some((name.to_string(), Value::String(headers.get(*name)?.to_str().ok()?.to_owned()))))
        .collect();
    Json(json!({ "rate_limited_as": ip.0, "headers": seen }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_max_per_window() {
        let limiter = Limiter::new(3, Duration::from_secs(60));
        assert!((0..3).all(|_| limiter.hit("a")));
        assert!(!limiter.hit("a"));
        assert!(limiter.is_blocked("a"));
        assert!(limiter.hit("b"), "keys are counted separately");
        limiter.clear("a");
        assert!(limiter.hit("a"));
    }

    #[test]
    fn window_resets() {
        let limiter = Limiter::new(1, Duration::from_millis(20));
        assert!(limiter.hit("a"));
        assert!(!limiter.hit("a"));
        std::thread::sleep(Duration::from_millis(25));
        assert!(limiter.hit("a"));
    }
}
