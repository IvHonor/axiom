//! The assistant's connection to its AI. With the person's own free keys it
//! talks to Gemini (then Groq) directly; otherwise it goes through the Axiom
//! server, which uses Axiom's keys for accounts allowed the assistant.
//!
//! The keys live in the system's credential store and never leave this
//! computer except to the AI they belong to. Which areas the assistant may
//! see is chosen in the app (see `src/lib/ai.ts`).

pub mod agent;
pub mod commands;
mod entities;
pub mod migrations;
mod skills;
mod undo;
#[cfg(test)]
mod tests;

/// The chats sync to the person's other computers, end-to-end encrypted.
pub const SYNCED_TABLES: &[&str] = &["assistant_chats", "assistant_messages", "assistant_proposals"];

use axiom_ai::{Ai, Delta, Keys};
use axiom_protocol::ai::{ChatReply, ChatRequest, MAX_AUDIO_BYTES, Transcribe, Transcript};
use serde::{Deserialize, Serialize};

use crate::account::{Account, AccountStatus};
use crate::error::{Error, Result};
use crate::vault::KeyStore;

/// Kept in Tauri's managed state.
pub struct Assistant {
    ai: Ai,
    store: Box<dyn KeyStore>,
}

#[derive(Default, Serialize, Deserialize)]
struct SavedKeys {
    gemini: Option<String>,
    groq: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gemini,
    Groq,
}

/// Which own keys are saved (never the keys themselves). Mirrored in `src/lib/ai.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct KeyStatus {
    pub gemini: bool,
    pub groq: bool,
}

/// A reply, and whose key it came on. Mirrored in `src/lib/ai.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantReply {
    #[serde(flatten)]
    pub reply: ChatReply,
    /// On the person's own key, rather than Axiom's.
    pub own_key: bool,
}

impl Assistant {
    pub fn new(ai: Ai, store: Box<dyn KeyStore>) -> Self {
        Self { ai, store }
    }

    fn saved(&self) -> SavedKeys {
        self.store.load().and_then(|json| serde_json::from_str(&json).ok()).unwrap_or_default()
    }

    pub fn key_status(&self) -> KeyStatus {
        let saved = self.saved();
        KeyStatus { gemini: saved.gemini.is_some(), groq: saved.groq.is_some() }
    }

    /// Saves one of the person's own keys, or forgets it (`None`).
    pub fn set_key(&self, provider: Provider, key: Option<&str>) -> Result<KeyStatus> {
        let key = match key.map(str::trim).filter(|k| !k.is_empty()) {
            Some(key) if key.len() < 20 || key.len() > 200 || key.chars().any(|c| c.is_whitespace() || c.is_control()) => {
                return Err(Error::Invalid("That doesn't look like an API key. Copy the whole key and paste it again.".into()));
            }
            key => key.map(String::from),
        };
        let mut saved = self.saved();
        match provider {
            Provider::Gemini => saved.gemini = key,
            Provider::Groq => saved.groq = key,
        }
        if saved.gemini.is_none() && saved.groq.is_none() {
            self.store.clear();
        } else {
            let json = serde_json::to_string(&saved).expect("keys serialize");
            self.store.save(&json).map_err(Error::Account)?;
        }
        Ok(self.key_status())
    }

    /// One turn of a conversation: on the person's own keys if they've added
    /// any, falling back to Axiom's (through the server) if those can't answer.
    pub async fn chat(&self, account: &Account, request: &ChatRequest) -> Result<AssistantReply> {
        self.chat_stream(account, request, &|_| {}).await
    }

    /// Like `chat`, but the reply's words go to `on` as they're written.
    pub async fn chat_stream(&self, account: &Account, request: &ChatRequest, on: &(dyn Fn(Delta) + Sync)) -> Result<AssistantReply> {
        let saved = self.saved();
        let own = Keys { gemini: saved.gemini, groq: saved.groq };
        let signed_in = matches!(account.status().await, AccountStatus::SignedIn { .. });
        let own_error = if own.any() {
            match self.ai.chat_stream(&own, request, on).await {
                Ok(reply) => return Ok(AssistantReply { reply, own_key: true }),
                Err(err) if signed_in => {
                    // Axiom's AI answers from the start.
                    on(Delta::Restart);
                    err.message()
                }
                Err(err) => return Err(Error::Account(err.message())),
            }
        } else if !signed_in {
            return Err(Error::Account("Sign in to use Axiom's assistant, or add your own free AI key in its settings.".into()));
        } else {
            String::new()
        };
        match account.ai_chat_stream(request, on).await {
            Ok(reply) => Ok(AssistantReply { reply, own_key: false }),
            // Your own key's problem is the one to fix; Axiom's was only a fallback.
            Err(_) if !own_error.is_empty() => Err(Error::Account(own_error)),
            Err(err) => Err(err.into()),
        }
    }

    /// What was said in a recording (base64 `audio` of type `mime`): on
    /// the person's own keys if they've added any, falling back to Axiom's.
    pub async fn transcribe(&self, account: &Account, audio: &str, mime: &str) -> Result<Transcript> {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD.decode(audio).map_err(|_| Error::Invalid("That recording couldn't be read.".into()))?;
        if bytes.len() > MAX_AUDIO_BYTES {
            return Err(Error::Invalid("Keep it to about a minute at a time.".into()));
        }
        let saved = self.saved();
        let own = Keys { gemini: saved.gemini, groq: saved.groq };
        let signed_in = matches!(account.status().await, AccountStatus::SignedIn { .. });
        let own_error = if own.any() {
            match self.ai.transcribe(&own, &bytes, mime).await {
                Ok(heard) => return Ok(heard),
                Err(err) if signed_in => err.message(),
                Err(err) => return Err(Error::Account(err.message())),
            }
        } else if !signed_in {
            return Err(Error::Account("Sign in to talk to Lemma, or add your own free AI key in its settings.".into()));
        } else {
            String::new()
        };
        match account.ai_transcribe(&Transcribe { audio: audio.into(), mime: mime.into() }).await {
            Ok(heard) => Ok(heard),
            Err(_) if !own_error.is_empty() => Err(Error::Account(own_error)),
            Err(err) => Err(err.into()),
        }
    }
}
