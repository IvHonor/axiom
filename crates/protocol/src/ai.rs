//! The assistant's conversations, in one shape whichever AI answers them
//! (see the `axiom-ai` crate). The app sends `AI_CHAT` a `ChatRequest` and
//! gets a `ChatReply`: words for the person, calls to the app's tools, or both.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Most messages in one request: a long conversation keeps only its latest.
pub const MAX_MESSAGES: usize = 100;
/// Largest request, in bytes of JSON: the conversation, tools and what they found.
pub const MAX_REQUEST_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChatRequest {
    /// Who the assistant is and how it behaves.
    pub system: String,
    pub messages: Vec<Message>,
    /// What the assistant may ask the app to do. Empty for plain chat.
    #[serde(default)]
    pub tools: Vec<Tool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "role", rename_all = "snake_case")]
pub enum Message {
    User { text: String },
    /// An earlier `ChatReply`, sent back as it came.
    Assistant {
        #[serde(default)]
        text: Option<String>,
        #[serde(default)]
        tool_calls: Vec<ToolCall>,
    },
    /// What the app's tool returned for one of the assistant's calls.
    Tool { call_id: String, name: String, result: Value },
}

/// A tool the app offers, described for the model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Tool {
    /// e.g. `add_birthday`.
    pub name: String,
    pub description: String,
    /// A JSON Schema object for the arguments.
    pub parameters: Value,
}

/// The assistant asking the app to run a tool.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
    /// Gemini's "thought signature", passed back unchanged with the call so
    /// it can carry on its reasoning. Opaque; None from other models.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChatReply {
    pub text: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCall>,
    /// Which AI answered, e.g. "Gemini", to show the person.
    pub provider: String,
    /// What the call cost, when the AI says.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
}

/// Tokens one AI call used: what it read, and what it wrote (thinking included).
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct Usage {
    pub input: u32,
    pub output: u32,
}

impl ChatReply {
    /// The reply as the conversation's next message.
    pub fn message(&self) -> Message {
        Message::Assistant { text: self.text.clone(), tool_calls: self.tool_calls.clone() }
    }
}

/// One line of `AI_CHAT_STREAM`'s answer: words as they're written, then the
/// whole reply or why there isn't one.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Streamed {
    /// More of the reply's words.
    Text { text: String },
    /// Forget the words so far: one AI failed part-way, and another is
    /// answering from the start.
    Restart,
    /// The finished reply, as `AI_CHAT` would have sent it.
    Reply { reply: ChatReply },
    /// No AI could answer. `status` is the one `AI_CHAT` would have sent.
    Error { status: u16, message: String },
}

/// Longest recording `AI_TRANSCRIBE` takes, in bytes of audio: a minute of
/// 16 kHz mono WAV.
pub const MAX_AUDIO_BYTES: usize = 2 * 1024 * 1024;

/// Speech to turn into text: the recording, base64-encoded, and its type
/// (e.g. "audio/wav").
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transcribe {
    pub audio: String,
    pub mime: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transcript {
    /// What was said. Empty when nothing was.
    pub text: String,
    /// Which AI heard it, e.g. "Groq".
    pub provider: String,
}
