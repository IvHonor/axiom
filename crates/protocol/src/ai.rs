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
}

impl ChatReply {
    /// The reply as the conversation's next message.
    pub fn message(&self) -> Message {
        Message::Assistant { text: self.text.clone(), tool_calls: self.tool_calls.clone() }
    }
}
