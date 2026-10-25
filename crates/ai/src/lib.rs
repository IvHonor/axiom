//! The AI models behind Axiom's assistant. Google's Gemini answers first;
//! Groq answers when Gemini can't (its free limit is used up, it's down, or
//! there's no key for it). Both take the same `ChatRequest` and give the same
//! `ChatReply` (see `axiom_protocol::ai`), so a conversation can move between
//! them mid-way.
//!
//! The server uses this with Axiom's keys; the app with someone's own.

mod gemini;
mod groq;

use std::time::Duration;

use axiom_protocol::ai::{ChatReply, ChatRequest};

/// Long enough for a slow answer with several tool calls; short enough that
/// a stuck provider falls back to the next one in reasonable time.
const TIMEOUT: Duration = Duration::from_secs(60);

/// The keys to use. A provider without one is skipped.
#[derive(Clone, Default)]
pub struct Keys {
    pub gemini: Option<String>,
    pub groq: Option<String>,
}

impl Keys {
    pub fn any(&self) -> bool {
        self.gemini.is_some() || self.groq.is_some()
    }
}

/// Which model each provider runs.
#[derive(Clone)]
pub struct Models {
    /// Google's alias for its newest Flash model, the best one on the free tier.
    pub gemini: String,
    pub groq: String,
}

impl Default for Models {
    fn default() -> Self {
        Self { gemini: "gemini-flash-latest".into(), groq: "openai/gpt-oss-120b".into() }
    }
}

pub struct Ai {
    http: reqwest::Client,
    models: Models,
    gemini_url: String,
    groq_url: String,
}

/// Why no provider answered. The message is ready to show.
#[derive(Debug, Clone, PartialEq)]
pub enum AiError {
    /// No key for any provider.
    NoKeys,
    /// Each provider tried, and why it didn't answer.
    Failed(Vec<(&'static str, ProviderError)>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProviderError {
    /// No answer at all.
    Offline,
    /// It answered with an error status.
    Rejected { status: u16, message: String },
    /// It answered, but not with anything usable (blocked, or malformed).
    NoAnswer(String),
}

impl AiError {
    pub fn message(&self) -> String {
        match self {
            AiError::NoKeys => "The assistant has no AI to talk to: there's no key for Gemini or Groq.".into(),
            AiError::Failed(failures) => {
                let reasons: Vec<String> = failures.iter().map(|(name, err)| format!("{name} {}", err.reason())).collect();
                format!("The assistant couldn't answer: {}.", reasons.join("; "))
            }
        }
    }

    /// Every provider was out of free requests (or busy), so trying again later should work.
    pub fn is_busy(&self) -> bool {
        matches!(self, AiError::Failed(failures) if failures.iter().all(|(_, err)| matches!(err, ProviderError::Rejected { status: 429, .. })))
    }
}

impl ProviderError {
    fn reason(&self) -> String {
        match self {
            ProviderError::Offline => "couldn't be reached".into(),
            ProviderError::Rejected { status, message } => match status {
                429 => "is busy or has used up its free requests for now".into(),
                // Gemini answers a bad key with 400 and says so.
                401 | 403 => "refused the key".into(),
                _ if message.contains("API_KEY_INVALID") || message.contains("API key not valid") => "refused the key".into(),
                500.. => "is having problems".into(),
                _ => format!("said no ({status}: {})", short(message)),
            },
            ProviderError::NoAnswer(why) => why.clone(),
        }
    }
}

impl Default for Ai {
    fn default() -> Self {
        Self::new(Models::default())
    }
}

impl Ai {
    pub fn new(models: Models) -> Self {
        let http = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .user_agent(concat!("Axiom/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("HTTP client settings are valid");
        Self {
            http,
            models,
            gemini_url: "https://generativelanguage.googleapis.com/v1beta".into(),
            groq_url: "https://api.groq.com/openai/v1".into(),
        }
    }

    /// Points at stand-ins for the providers, for tests.
    pub fn with_urls(mut self, gemini: &str, groq: &str) -> Self {
        self.gemini_url = gemini.trim_end_matches('/').into();
        self.groq_url = groq.trim_end_matches('/').into();
        self
    }

    /// Asks Gemini, then Groq, and returns the first answer.
    pub async fn chat(&self, keys: &Keys, request: &ChatRequest) -> Result<ChatReply, AiError> {
        let mut failures = Vec::new();
        if let Some(key) = &keys.gemini {
            let url = format!("{}/models/{}:generateContent", self.gemini_url, self.models.gemini);
            let sent = self.http.post(url).header("x-goog-api-key", key).json(&gemini::body(request)).send().await;
            match answer(sent).await.and_then(|body| gemini::reply(&body)) {
                Ok(reply) => return Ok(reply),
                Err(err) => failures.push(("Gemini", err)),
            }
        }
        if let Some(key) = &keys.groq {
            let url = format!("{}/chat/completions", self.groq_url);
            let sent = self.http.post(url).bearer_auth(key).json(&groq::body(&self.models.groq, request)).send().await;
            match answer(sent).await.and_then(|body| groq::reply(&body)) {
                Ok(reply) => return Ok(reply),
                Err(err) => failures.push(("Groq", err)),
            }
        }
        if failures.is_empty() { Err(AiError::NoKeys) } else { Err(AiError::Failed(failures)) }
    }
}

/// The JSON body of a successful response, or why there isn't one.
async fn answer(sent: reqwest::Result<reqwest::Response>) -> Result<serde_json::Value, ProviderError> {
    let response = sent.map_err(|_| ProviderError::Offline)?;
    let status = response.status();
    let text = response.text().await.map_err(|_| ProviderError::Offline)?;
    if !status.is_success() {
        // Both providers explain themselves in `error.message`.
        let message = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(String::from))
            .unwrap_or(text);
        return Err(ProviderError::Rejected { status: status.as_u16(), message });
    }
    serde_json::from_str(&text).map_err(|_| ProviderError::NoAnswer("sent an answer that isn't JSON".into()))
}

fn short(message: &str) -> String {
    let line = message.lines().next().unwrap_or_default();
    if line.chars().count() > 160 { format!("{}…", line.chars().take(160).collect::<String>()) } else { line.to_owned() }
}

#[cfg(test)]
mod tests;
