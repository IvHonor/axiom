//! The assistant's connection to its AI. With the person's own free keys it
//! talks to Gemini (then Groq) directly; otherwise it goes through the Axiom
//! server, which uses Axiom's keys for accounts allowed the assistant.
//!
//! The keys live in the system's credential store and never leave this
//! computer except to the AI they belong to. Which areas the assistant may
//! see is chosen in the app (see `src/lib/ai.ts`).

pub mod commands;
#[cfg(test)]
mod tests;

use axiom_ai::{Ai, Keys};
use axiom_protocol::ai::{ChatReply, ChatRequest};
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
        let saved = self.saved();
        let own = Keys { gemini: saved.gemini, groq: saved.groq };
        let signed_in = matches!(account.status().await, AccountStatus::SignedIn { .. });
        let own_error = if own.any() {
            match self.ai.chat(&own, request).await {
                Ok(reply) => return Ok(AssistantReply { reply, own_key: true }),
                Err(err) if signed_in => err.message(),
                Err(err) => return Err(Error::Account(err.message())),
            }
        } else if !signed_in {
            return Err(Error::Account("Sign in to use Axiom's assistant, or add your own free AI key in its settings.".into()));
        } else {
            String::new()
        };
        match account.ai_chat(request).await {
            Ok(reply) => Ok(AssistantReply { reply, own_key: false }),
            // Your own key's problem is the one to fix; Axiom's was only a fallback.
            Err(_) if !own_error.is_empty() => Err(Error::Account(own_error)),
            Err(err) => Err(err.into()),
        }
    }
}
