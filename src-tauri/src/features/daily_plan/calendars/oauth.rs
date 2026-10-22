//! Signing in to Google and Microsoft the way desktop apps should (RFC 8252):
//! the system browser opens the provider's sign-in page, and the provider
//! sends the answer back to a one-off address on this computer
//! (http://127.0.0.1:<port>). PKCE proves the answer reaches the app that
//! asked, so no secret is needed in the app.

use std::time::Duration;

use base64::Engine;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::error::{Error, Result};

/// How long the browser has to come back.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// A provider's sign-in, as registered with it.
#[derive(Clone, Debug)]
pub struct OAuthApp {
    pub provider: &'static str,
    pub auth_url: String,
    pub token_url: String,
    pub client_id: String,
    /// Google issues one even to desktop apps; it isn't secret there.
    pub client_secret: Option<String>,
    pub scopes: String,
    /// "127.0.0.1" (Google) or "localhost" (Microsoft, which matches any port on it).
    pub redirect_host: &'static str,
    /// Extra query parameters for the sign-in page.
    pub extra: Vec<(&'static str, &'static str)>,
    /// Microsoft wants the scopes again when trading tokens; Google doesn't.
    pub scope_on_token: bool,
}

impl OAuthApp {
    pub fn configured(&self) -> bool {
        !self.client_id.is_empty()
    }

    pub fn redirect_uri(&self, port: u16) -> String {
        format!("http://{}:{port}", self.redirect_host)
    }

    pub fn sign_in_url(&self, port: u16, state: &str, pkce: &Pkce) -> String {
        let redirect = self.redirect_uri(port);
        let mut params = vec![
            ("client_id", self.client_id.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("response_type", "code"),
            ("scope", self.scopes.as_str()),
            ("state", state),
            ("code_challenge", pkce.challenge.as_str()),
            ("code_challenge_method", "S256"),
        ];
        params.extend(self.extra.iter().copied());
        reqwest::Url::parse_with_params(&self.auth_url, &params).expect("valid sign-in URL").to_string()
    }

    /// Trades the code from the browser for tokens.
    pub async fn exchange(&self, http: &reqwest::Client, code: &str, port: u16, pkce: &Pkce) -> Result<Tokens> {
        let redirect = self.redirect_uri(port);
        let mut form = vec![
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect.as_str()),
            ("client_id", self.client_id.as_str()),
            ("code_verifier", pkce.verifier.as_str()),
        ];
        if let Some(secret) = &self.client_secret {
            form.push(("client_secret", secret));
        }
        if self.scope_on_token {
            form.push(("scope", &self.scopes));
        }
        self.token_request(http, &form).await
    }

    /// A fresh access token from a refresh token.
    pub async fn refresh(&self, http: &reqwest::Client, refresh_token: &str) -> Result<Tokens> {
        let mut form = vec![
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", self.client_id.as_str()),
        ];
        if let Some(secret) = &self.client_secret {
            form.push(("client_secret", secret));
        }
        if self.scope_on_token {
            form.push(("scope", &self.scopes));
        }
        self.token_request(http, &form).await
    }

    async fn token_request(&self, http: &reqwest::Client, form: &[(&str, &str)]) -> Result<Tokens> {
        let provider = self.provider;
        let response = http
            .post(&self.token_url)
            .form(form)
            .send()
            .await
            .map_err(|_| Error::Invalid(format!("Couldn't reach {provider}. Check your connection.")))?;
        if response.status().is_success() {
            return response.json().await.map_err(|_| Error::Invalid(format!("{provider} sent a sign-in Axiom didn't understand.")));
        }
        let failure: TokenError = response.json().await.unwrap_or_default();
        eprintln!("{provider} token error: {} {}", failure.error, failure.error_description);
        Err(match failure.error.as_str() {
            // The sign-in was revoked, expired, or the password changed.
            "invalid_grant" | "interaction_required" | "consent_required" => {
                Error::Account(format!("{provider} signed Axiom out. Reconnect the account to keep it in sync."))
            }
            _ => Error::Invalid(format!("{provider} didn't accept the sign-in ({}).", failure.error)),
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    #[serde(default)]
    pub expires_in: Option<u64>,
    /// Sent on first sign-in, and by Microsoft on every refresh.
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// The permissions granted, space-separated.
    #[serde(default)]
    pub scope: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct TokenError {
    #[serde(default)]
    error: String,
    #[serde(default)]
    error_description: String,
}

/// Proof Key for Code Exchange: the browser's answer is only useful to
/// whoever holds `verifier`.
pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

impl Pkce {
    pub fn new() -> Self {
        Self::from_verifier(random_token())
    }

    pub fn from_verifier(verifier: String) -> Self {
        let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        Self { verifier, challenge }
    }
}

/// 64 random hex characters (two v4 UUIDs, from the OS's secure random source).
pub fn random_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

/// The one-off address the browser comes back to.
pub struct Loopback {
    v4: TcpListener,
    /// Browsers may try "localhost" as ::1 first.
    v6: Option<TcpListener>,
    pub port: u16,
}

impl Loopback {
    pub async fn bind() -> Result<Self> {
        let unavailable = |_| Error::Invalid("Couldn't start the sign-in. Try again.".into());
        let v4 = TcpListener::bind("127.0.0.1:0").await.map_err(unavailable)?;
        let port = v4.local_addr().map_err(unavailable)?.port();
        let v6 = TcpListener::bind(("::1", port)).await.ok();
        Ok(Self { v4, v6, port })
    }

    /// Waits for the browser to come back, and returns the sign-in code.
    pub async fn wait(self, state: &str, provider: &str) -> Result<String> {
        let outcome = tokio::time::timeout(SIGN_IN_TIMEOUT, async {
            loop {
                let accepted = match &self.v6 {
                    Some(v6) => tokio::select! {
                        a = self.v4.accept() => a,
                        a = v6.accept() => a,
                    },
                    None => self.v4.accept().await,
                };
                let Ok((stream, _)) = accepted else { continue };
                if let Some(result) = answer(stream, state, provider).await {
                    return result;
                }
            }
        })
        .await;
        outcome.unwrap_or_else(|_| Err(Error::Invalid("The sign-in took too long. Try again.".into())))
    }
}

/// Reads one request. Returns None for requests that aren't the answer
/// (a browser asking for a favicon), so the wait goes on.
async fn answer(mut stream: TcpStream, state: &str, provider: &str) -> Option<Result<String>> {
    let mut buffer = vec![0u8; 8192];
    let mut read = 0;
    while read < buffer.len() {
        match stream.read(&mut buffer[read..]).await {
            Ok(0) | Err(_) => break,
            Ok(n) => read += n,
        }
        if buffer[..read].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }
    let request = String::from_utf8_lossy(&buffer[..read]);
    let target = request.lines().next()?.split_whitespace().nth(1)?.to_owned();
    let url = reqwest::Url::parse(&format!("http://localhost{target}")).ok()?;
    let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.into_owned());

    let (code, error) = (param("code"), param("error"));
    if code.is_none() && error.is_none() {
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return None;
    }
    let result = if param("state").as_deref() != Some(state) {
        Err(Error::Invalid("That sign-in didn't come from Axiom. Try again.".into()))
    } else if let Some(error) = error {
        Err(Error::Invalid(if error == "access_denied" {
            "The sign-in was cancelled.".into()
        } else {
            format!("{provider} couldn't sign you in ({error}).")
        }))
    } else {
        Ok(code.unwrap_or_default())
    };
    let (title, message) = match &result {
        Ok(_) => ("Connected", "Your calendar is connected. You can close this tab and go back to Axiom."),
        Err(_) => ("Not connected", "The calendar wasn't connected. Go back to Axiom to try again."),
    };
    let page = format!(
        "<!doctype html><meta charset=utf-8><title>Axiom: {title}</title>\
         <body style=\"font-family:system-ui,sans-serif;display:grid;place-items:center;height:90vh;margin:0;background:#1f1f1f;color:#e6e6e6\">\
         <div style=\"text-align:center\"><h1 style=\"font-weight:600\">{title}</h1><p>{message}</p></div>"
    );
    let reply = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}",
        page.len()
    );
    let _ = stream.write_all(reply.as_bytes()).await;
    let _ = stream.shutdown().await;
    Some(result)
}
