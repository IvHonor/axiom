//! The assistant's connection to its AI: Axiom's server, which asks the AI
//! (Groq on its free plan, or a paid Gemini) on Axiom's keys for accounts
//! allowed the assistant, and Groq's Whisper for the microphone. Nobody
//! brings their own key, so every question goes through the server and the
//! admin panel sees what each account uses. Which areas the assistant may
//! see is chosen in the app (see `src/lib/ai.ts`).

pub mod agent;
pub(crate) mod analytics;
pub mod commands;
mod entities;
pub mod migrations;
pub mod quick;
mod skills;
mod undo;
#[cfg(test)]
mod tests;

/// The chats sync to the person's other computers, end-to-end encrypted.
pub const SYNCED_TABLES: &[&str] = &["assistant_chats", "assistant_messages", "assistant_proposals"];

use axiom_ai::Delta;
use axiom_protocol::ai::{ChatReply, ChatRequest, MAX_AUDIO_BYTES, Transcribe, Transcript};

use crate::account::{Account, AccountStatus};
use crate::error::{Error, Result};
use crate::vault::KeyStore;

/// Kept in Tauri's managed state.
#[derive(Default)]
pub struct Assistant {
    /// For tests: a stand-in Gemini, asked directly instead of the server.
    #[cfg(test)]
    direct: Option<(axiom_ai::Ai, axiom_ai::Keys)>,
}

impl Assistant {
    /// Forgets any AI keys people saved when they could bring their own.
    pub fn forget_own_keys(store: &dyn KeyStore) {
        if store.load().is_some() {
            store.clear();
        }
    }

    #[cfg(test)]
    pub fn direct(ai: axiom_ai::Ai, gemini_key: &str) -> Self {
        Self { direct: Some((ai, axiom_ai::Keys { gemini: Some(gemini_key.into()), groq: None })) }
    }

    /// One turn of a conversation, all at once (tests; the app streams).
    #[cfg(test)]
    pub async fn chat(&self, account: &Account, request: &ChatRequest) -> Result<ChatReply> {
        self.chat_stream(account, request, &|_| {}).await
    }

    /// Like `chat`, but the reply's words go to `on` as they're written.
    pub async fn chat_stream(&self, account: &Account, request: &ChatRequest, on: &(dyn Fn(Delta) + Sync)) -> Result<ChatReply> {
        #[cfg(test)]
        if let Some((ai, keys)) = &self.direct {
            return ai.chat_stream(keys, request, on).await.map_err(|err| Error::Account(err.message()));
        }
        signed_in(account).await?;
        Ok(account.ai_chat_stream(request, on).await?)
    }

    /// What was said in a recording (base64 `audio` of type `mime`).
    pub async fn transcribe(&self, account: &Account, audio: &str, mime: &str) -> Result<Transcript> {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD.decode(audio).map_err(|_| Error::Invalid("That recording couldn't be read.".into()))?;
        if bytes.len() > MAX_AUDIO_BYTES {
            return Err(Error::Invalid("Keep it to about a minute at a time.".into()));
        }
        signed_in(account).await?;
        Ok(account.ai_transcribe(&Transcribe { audio: audio.into(), mime: mime.into() }).await?)
    }
}

async fn signed_in(account: &Account) -> Result<()> {
    match account.status().await {
        AccountStatus::SignedIn { .. } => Ok(()),
        _ => Err(Error::Account("Sign in to use Lemma.".into())),
    }
}
