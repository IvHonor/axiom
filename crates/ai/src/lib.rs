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

use axiom_protocol::ai::{ChatReply, ChatRequest, Transcript};

/// A good answer takes a few seconds; a provider that's busier than this is
/// overloaded (free tiers often are), so the next one gets asked instead.
const TIMEOUT: Duration = Duration::from_secs(25);

/// The most one answer may write, thinking included: plenty for a reply or a
/// day's plan, and a ceiling on what a call can cost.
const MAX_OUTPUT_TOKENS: u32 = 8192;

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

/// Part of a reply as it's being written, so it can be shown straight away.
#[derive(Debug, Clone, PartialEq)]
pub enum Delta<'a> {
    /// More of its words.
    Text(&'a str),
    /// Forget the words so far: that AI failed part-way, and the next one
    /// is answering from the start.
    Restart,
}

/// Which model each provider runs.
#[derive(Clone)]
pub struct Models {
    /// Google's alias for its newest Flash-Lite model: answers in about a
    /// second, where the full Flash is often overloaded on the free tier
    /// (minutes, or refused). `GEMINI_MODEL` on the server changes it.
    pub gemini: String,
    pub groq: String,
    /// Groq's speech-to-text model.
    pub whisper: String,
}

impl Default for Models {
    fn default() -> Self {
        Self { gemini: "gemini-flash-lite-latest".into(), groq: "openai/gpt-oss-120b".into(), whisper: "whisper-large-v3-turbo".into() }
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

    /// Like `chat`, but the reply's words go to `on` as they're written.
    pub async fn chat_stream(&self, keys: &Keys, request: &ChatRequest, on: &(dyn Fn(Delta) + Sync)) -> Result<ChatReply, AiError> {
        let mut failures = Vec::new();
        // Words already shown, to take back if the next AI starts again.
        let mut wrote = false;
        if let Some(key) = &keys.gemini {
            let url = format!("{}/models/{}:streamGenerateContent?alt=sse", self.gemini_url, self.models.gemini);
            let sent = self.http.post(url).header("x-goog-api-key", key).json(&gemini::body(request)).send().await;
            let mut gathered = gemini::Gathered::default();
            let streamed = events(sent, |event| {
                let words = gathered.add(event);
                if !words.is_empty() {
                    wrote = true;
                    on(Delta::Text(&words));
                }
            })
            .await;
            match streamed.and_then(|()| gathered.reply()) {
                Ok(reply) => return Ok(reply),
                Err(err) => failures.push(("Gemini", err)),
            }
        }
        if let Some(key) = &keys.groq {
            if wrote {
                on(Delta::Restart);
            }
            let url = format!("{}/chat/completions", self.groq_url);
            let mut body = groq::body(&self.models.groq, request);
            body["stream"] = true.into();
            let sent = self.http.post(url).bearer_auth(key).json(&body).send().await;
            let mut gathered = groq::Gathered::default();
            let streamed = events(sent, |event| {
                let words = gathered.add(event);
                if !words.is_empty() {
                    on(Delta::Text(&words));
                }
            })
            .await;
            match streamed.and_then(|()| gathered.reply()) {
                Ok(reply) => return Ok(reply),
                Err(err) => failures.push(("Groq", err)),
            }
        }
        if failures.is_empty() { Err(AiError::NoKeys) } else { Err(AiError::Failed(failures)) }
    }

    /// Turns speech into text: Groq's Whisper (made for it, and fast) first,
    /// then Gemini. `audio` is a recording of type `mime`, e.g. "audio/wav".
    pub async fn transcribe(&self, keys: &Keys, audio: &[u8], mime: &str) -> Result<Transcript, AiError> {
        let mut failures = Vec::new();
        if let Some(key) = &keys.groq {
            let (boundary, body) = speech_form(&self.models.whisper, audio, mime);
            let sent = self
                .http
                .post(format!("{}/audio/transcriptions", self.groq_url))
                .bearer_auth(key)
                .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                .body(body)
                .send()
                .await;
            match answer(sent).await {
                Ok(body) => return Ok(Transcript { text: body["text"].as_str().unwrap_or_default().trim().to_owned(), provider: "Groq".into() }),
                Err(err) => failures.push(("Groq", err)),
            }
        }
        if let Some(key) = &keys.gemini {
            let url = format!("{}/models/{}:generateContent", self.gemini_url, self.models.gemini);
            let sent = self.http.post(url).header("x-goog-api-key", key).json(&gemini::transcription(audio, mime)).send().await;
            match answer(sent).await.and_then(|body| gemini::reply(&body)) {
                Ok(reply) => return Ok(Transcript { text: reply.text.unwrap_or_default().trim().to_owned(), provider: "Gemini".into() }),
                // Silence can come back as no answer at all.
                Err(ProviderError::NoAnswer(_)) => return Ok(Transcript { text: String::new(), provider: "Gemini".into() }),
                Err(err) => failures.push(("Gemini", err)),
            }
        }
        if failures.is_empty() { Err(AiError::NoKeys) } else { Err(AiError::Failed(failures)) }
    }
}

/// A multipart form with the recording and the model, as Groq's (OpenAI's)
/// transcription endpoint takes it. Returns the boundary and the body.
fn speech_form(model: &str, audio: &[u8], mime: &str) -> (String, Vec<u8>) {
    let boundary = "axiom-speech-7d1f0c2e9b4a";
    let extension = match mime.split(';').next().unwrap_or_default() {
        "audio/webm" => "webm",
        "audio/ogg" => "ogg",
        "audio/mp4" | "audio/m4a" => "m4a",
        "audio/mpeg" => "mp3",
        _ => "wav",
    };
    let mut body = Vec::with_capacity(audio.len() + 512);
    for (name, value) in [("model", model), ("response_format", "json")] {
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes());
    }
    body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.{extension}\"\r\nContent-Type: {mime}\r\n\r\n").as_bytes());
    body.extend(audio);
    body.extend(format!("\r\n--{boundary}--\r\n").as_bytes());
    (boundary.into(), body)
}

/// What Gemini is sent for `request`, for checking tools against what it accepts.
pub fn gemini_body(request: &ChatRequest) -> serde_json::Value {
    gemini::body(request)
}

/// The JSON body of a successful response, or why there isn't one.
async fn answer(sent: reqwest::Result<reqwest::Response>) -> Result<serde_json::Value, ProviderError> {
    let response = sent.map_err(|_| ProviderError::Offline)?;
    let status = response.status();
    let text = response.text().await.map_err(|_| ProviderError::Offline)?;
    if !status.is_success() {
        return Err(rejected(status.as_u16(), text));
    }
    serde_json::from_str(&text).map_err(|_| ProviderError::NoAnswer("sent an answer that isn't JSON".into()))
}

/// Reads a stream of server-sent events (both providers stream this way),
/// giving each event's data to `each` as it comes.
async fn events(sent: reqwest::Result<reqwest::Response>, mut each: impl FnMut(serde_json::Value)) -> Result<(), ProviderError> {
    let mut response = sent.map_err(|_| ProviderError::Offline)?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.map_err(|_| ProviderError::Offline)?;
        return Err(rejected(status.as_u16(), text));
    }
    let mut pending: Vec<u8> = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ProviderError::Offline)? {
        pending.extend_from_slice(&chunk);
        while let Some(end) = pending.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = pending.drain(..=end).collect();
            let Some(data) = std::str::from_utf8(&line).ok().and_then(|l| l.trim().strip_prefix("data:")) else { continue };
            let data = data.trim();
            if data == "[DONE]" {
                return Ok(());
            }
            let event: serde_json::Value = serde_json::from_str(data).map_err(|_| ProviderError::NoAnswer("sent an answer that isn't JSON".into()))?;
            // A failure part-way comes as an event of its own.
            if let Some(error) = event.get("error") {
                let status = error["code"].as_u64().map_or(500, |code| code as u16);
                return Err(ProviderError::Rejected { status, message: error["message"].as_str().unwrap_or_default().to_owned() });
            }
            each(event);
        }
    }
    Ok(())
}

/// An error status, with the reason the provider gave.
fn rejected(status: u16, text: String) -> ProviderError {
    // Both providers explain themselves in `error.message`.
    let message = serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v| v["error"]["message"].as_str().map(String::from)).unwrap_or(text);
    ProviderError::Rejected { status, message }
}

fn short(message: &str) -> String {
    let line = message.lines().next().unwrap_or_default();
    if line.chars().count() > 160 { format!("{}…", line.chars().take(160).collect::<String>()) } else { line.to_owned() }
}

#[cfg(test)]
mod tests;
