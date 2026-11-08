//! The AI models behind Axiom's assistant. One answers every question:
//! Groq, on its free plan, unless there's a Gemini key (Axiom's only uses
//! Google's paid service), then Gemini. When the AI is busy for a moment
//! it's asked again after a short wait. Groq's Whisper writes down what's
//! said to the microphone, with Gemini standing in when it can't. Both
//! speak `axiom_protocol::ai`.
//!
//! The server uses this with Axiom's keys.

mod gemini;
mod groq;

use std::time::Duration;

use axiom_protocol::ai::{ChatReply, ChatRequest, Transcript};

/// A good answer takes a few seconds; one that takes longer than this has
/// gone wrong somewhere.
const TIMEOUT: Duration = Duration::from_secs(25);

/// When the AI is busy (overloaded, or over its limit a minute) it's asked
/// again, up to `RETRIES` times: after the wait it asks for, if it says and
/// that's no longer than `MAX_WAIT` (a longer one means a daily limit), or
/// else after `BACKOFF`.
const RETRIES: usize = 2;
const MAX_WAIT: Duration = Duration::from_secs(30);
const BACKOFF: [Duration; RETRIES] = [Duration::from_secs(2), Duration::from_secs(5)];

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
    /// Whether the assistant can answer.
    pub fn any(&self) -> bool {
        self.gemini.is_some() || self.groq.is_some()
    }
}

/// The AI that answers, with its key.
#[derive(Clone, Copy)]
enum Answerer<'a> {
    Gemini(&'a str),
    Groq(&'a str),
}

impl Answerer<'_> {
    fn name(self) -> &'static str {
        match self {
            Answerer::Gemini(_) => "Gemini",
            Answerer::Groq(_) => "Groq",
        }
    }
}

/// A streamed answer being put together, in its provider's way.
enum Gathered {
    Gemini(gemini::Gathered),
    Groq(groq::Gathered),
}

impl Gathered {
    fn add(&mut self, event: serde_json::Value) -> String {
        match self {
            Gathered::Gemini(g) => g.add(event),
            Gathered::Groq(g) => g.add(event),
        }
    }

    fn reply(self) -> Result<ChatReply, ProviderError> {
        match self {
            Gathered::Gemini(g) => g.reply(),
            Gathered::Groq(g) => g.reply(),
        }
    }
}

/// Part of a reply as it's being written, so it can be shown straight away.
#[derive(Debug, Clone, PartialEq)]
pub enum Delta<'a> {
    /// More of its words.
    Text(&'a str),
    /// Forget the words so far: the AI failed part-way, and is answering
    /// again from the start.
    Restart,
    /// The AI is busy for a moment and will be asked again after this long.
    Waiting(Duration),
}

/// Which model each provider runs.
#[derive(Clone)]
pub struct Models {
    /// Google's alias for its newest Flash-Lite model: quick, and cheap
    /// enough to answer everyone. `GEMINI_MODEL` on the server changes it.
    pub gemini: String,
    /// `GROQ_MODEL` on the server changes it.
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
    backoff: [Duration; RETRIES],
}

/// Why no provider answered. The message is ready to show.
#[derive(Debug, Clone, PartialEq)]
pub enum AiError {
    /// No key for the AI.
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
            AiError::NoKeys => "The assistant has no AI to talk to: there's no key for Groq or Gemini.".into(),
            AiError::Failed(failures) => {
                let reasons: Vec<String> = failures.iter().map(|(name, err)| format!("{name} {}", err.reason())).collect();
                format!("The assistant couldn't answer: {}.", reasons.join("; "))
            }
        }
    }

    /// Every provider was busy, so trying again later should work.
    pub fn is_busy(&self) -> bool {
        matches!(self, AiError::Failed(failures) if failures.iter().all(|(_, err)| matches!(err, ProviderError::Rejected { status: 429, .. })))
    }
}

impl ProviderError {
    fn reason(&self) -> String {
        match self {
            ProviderError::Offline => "couldn't be reached".into(),
            ProviderError::Rejected { status, message } => match status {
                429 => "is busy right now. Try again in a moment".into(),
                // Gemini answers a bad key with 400 and says so.
                401 | 403 => "refused the key".into(),
                413 => "can't take a question this big. Try a new chat, or ask about fewer things at once".into(),
                _ if message.contains("API_KEY_INVALID") || message.contains("API key not valid") => "refused the key".into(),
                500.. => "is having problems".into(),
                _ => format!("said no ({status}: {})", short(message)),
            },
            ProviderError::NoAnswer(why) => why.clone(),
        }
    }

    /// Busy for a moment, so worth asking again.
    fn is_passing(&self) -> bool {
        matches!(self, ProviderError::Rejected { status: 429 | 500 | 502 | 503 | 504, .. })
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
            backoff: BACKOFF,
        }
    }

    /// Points at stand-ins for the providers, for tests, which needn't wait
    /// long before asking again.
    pub fn with_urls(mut self, gemini: &str, groq: &str) -> Self {
        self.gemini_url = gemini.trim_end_matches('/').into();
        self.groq_url = groq.trim_end_matches('/').into();
        self.backoff = [Duration::from_millis(10); RETRIES];
        self
    }

    /// How long to wait before asking again after try `tries` (from 0)
    /// failed with `err`, `asked` being the wait the AI asked for. None
    /// gives up.
    fn again(&self, err: &ProviderError, asked: Option<Duration>, tries: usize) -> Option<Duration> {
        if tries >= RETRIES || !err.is_passing() {
            return None;
        }
        match asked {
            Some(wait) if wait > MAX_WAIT => None,
            Some(wait) => Some(wait.max(Duration::from_millis(500))),
            None => Some(self.backoff[tries]),
        }
    }

    /// Gemini when there's a key for it, or else Groq.
    fn answerer<'a>(keys: &'a Keys) -> Result<Answerer<'a>, AiError> {
        match (&keys.gemini, &keys.groq) {
            (Some(key), _) => Ok(Answerer::Gemini(key)),
            (None, Some(key)) => Ok(Answerer::Groq(key)),
            (None, None) => Err(AiError::NoKeys),
        }
    }

    /// Sends `request` to the AI, to answer all at once or (`stream`) as
    /// it's written.
    async fn send(&self, who: Answerer<'_>, request: &ChatRequest, stream: bool) -> reqwest::Result<reqwest::Response> {
        match who {
            Answerer::Gemini(key) => {
                let how = if stream { "streamGenerateContent?alt=sse" } else { "generateContent" };
                let url = format!("{}/models/{}:{how}", self.gemini_url, self.models.gemini);
                self.http.post(url).header("x-goog-api-key", key).json(&gemini::body(request)).send().await
            }
            Answerer::Groq(key) => {
                let mut body = groq::body(&self.models.groq, request);
                if stream {
                    body["stream"] = true.into();
                }
                self.http.post(format!("{}/chat/completions", self.groq_url)).bearer_auth(key).json(&body).send().await
            }
        }
    }

    /// Asks the AI.
    pub async fn chat(&self, keys: &Keys, request: &ChatRequest) -> Result<ChatReply, AiError> {
        let who = Self::answerer(keys)?;
        let mut tries = 0;
        loop {
            let sent = self.send(who, request, false).await;
            let asked = sent.as_ref().ok().and_then(wait_asked);
            let answered = answer(sent).await.and_then(|body| match who {
                Answerer::Gemini(_) => gemini::reply(&body),
                Answerer::Groq(_) => groq::reply(&body),
            });
            match answered {
                Ok(reply) => return Ok(reply),
                Err(err) => match self.again(&err, asked, tries) {
                    Some(wait) => {
                        tries += 1;
                        tokio::time::sleep(wait).await;
                    }
                    None => return Err(AiError::Failed(vec![(who.name(), err)])),
                },
            }
        }
    }

    /// Like `chat`, but the reply's words go to `on` as they're written.
    pub async fn chat_stream(&self, keys: &Keys, request: &ChatRequest, on: &(dyn Fn(Delta) + Sync)) -> Result<ChatReply, AiError> {
        let who = Self::answerer(keys)?;
        let mut tries = 0;
        loop {
            let sent = self.send(who, request, true).await;
            let asked = sent.as_ref().ok().and_then(wait_asked);
            // Words already shown, to take back if it starts again.
            let mut wrote = false;
            let mut gathered = match who {
                Answerer::Gemini(_) => Gathered::Gemini(gemini::Gathered::default()),
                Answerer::Groq(_) => Gathered::Groq(groq::Gathered::default()),
            };
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
                Err(err) => match self.again(&err, asked, tries) {
                    Some(wait) => {
                        tries += 1;
                        if wrote {
                            on(Delta::Restart);
                        }
                        on(Delta::Waiting(wait));
                        tokio::time::sleep(wait).await;
                    }
                    None => return Err(AiError::Failed(vec![(who.name(), err)])),
                },
            }
        }
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

/// Reads a stream of server-sent events, giving each event's data to
/// `each` as it comes.
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

/// How long a busy AI asks to wait (its `retry-after`, in seconds), if it says.
fn wait_asked(response: &reqwest::Response) -> Option<Duration> {
    if !matches!(response.status().as_u16(), 429 | 503) {
        return None;
    }
    let seconds: f64 = response.headers().get("retry-after")?.to_str().ok()?.trim().parse().ok()?;
    Duration::try_from_secs_f64(seconds.max(0.0)).ok()
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
