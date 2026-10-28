//! Groq's OpenAI-compatible API (`chat/completions`).

use axiom_protocol::ai::{ChatReply, ChatRequest, Message, ToolCall, Usage};
use serde_json::{Map, Value, json};

use crate::ProviderError;

pub fn body(model: &str, request: &ChatRequest) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": request.system })];
    for message in &request.messages {
        messages.push(match message {
            Message::User { text } => json!({ "role": "user", "content": text }),
            Message::Assistant { text, tool_calls } => {
                let mut message = json!({ "role": "assistant", "content": text });
                if !tool_calls.is_empty() {
                    let calls: Vec<Value> = tool_calls
                        .iter()
                        .map(|call| json!({ "id": call.id, "type": "function", "function": { "name": call.name, "arguments": call.arguments.to_string() } }))
                        .collect();
                    message["tool_calls"] = json!(calls);
                }
                message
            }
            Message::Tool { call_id, result, .. } => json!({ "role": "tool", "tool_call_id": call_id, "content": result.to_string() }),
        });
    }
    let mut body = json!({ "model": model, "messages": messages, "max_completion_tokens": crate::MAX_OUTPUT_TOKENS });
    if !request.tools.is_empty() {
        let tools: Vec<Value> = request
            .tools
            .iter()
            .map(|tool| json!({ "type": "function", "function": { "name": tool.name, "description": tool.description, "parameters": tool.parameters } }))
            .collect();
        body["tools"] = json!(tools);
    }
    body
}

/// A streamed answer (`"stream": true`), gathered into the one Groq would
/// have sent without streaming.
#[derive(Default)]
pub struct Gathered {
    text: String,
    /// Each call's id, name and arguments (a JSON string, sent in pieces).
    calls: Vec<(String, String, String)>,
    usage: Value,
}

impl Gathered {
    /// Adds one event, and returns the words in it for the person.
    pub fn add(&mut self, event: Value) -> String {
        let delta = &event["choices"][0]["delta"];
        let words = delta["content"].as_str().unwrap_or_default().to_owned();
        self.text.push_str(&words);
        for call in delta["tool_calls"].as_array().into_iter().flatten() {
            let index = call["index"].as_u64().map_or(self.calls.len(), |i| i as usize);
            if self.calls.len() <= index {
                self.calls.resize(index + 1, Default::default());
            }
            let (id, name, arguments) = &mut self.calls[index];
            if let Some(given) = call["id"].as_str() {
                *id = given.to_owned();
            }
            name.push_str(call["function"]["name"].as_str().unwrap_or_default());
            arguments.push_str(call["function"]["arguments"].as_str().unwrap_or_default());
        }
        // Groq says what was used in `x_groq` on the last event; OpenAI's way is `usage`.
        for usage in [&event["usage"], &event["x_groq"]["usage"]] {
            if usage.is_object() {
                self.usage = usage.clone();
            }
        }
        words
    }

    pub fn reply(self) -> Result<ChatReply, ProviderError> {
        let calls: Vec<Value> =
            self.calls.into_iter().map(|(id, name, arguments)| json!({ "id": id, "type": "function", "function": { "name": name, "arguments": arguments } })).collect();
        reply(&json!({ "choices": [{ "message": { "content": self.text, "tool_calls": calls } }], "usage": self.usage }))
    }
}

pub fn reply(body: &Value) -> Result<ChatReply, ProviderError> {
    let message = &body["choices"][0]["message"];
    if message.is_null() {
        return Err(ProviderError::NoAnswer("gave no answer".into()));
    }
    let text = message["content"].as_str().filter(|t| !t.is_empty()).map(String::from);
    let tool_calls: Vec<ToolCall> = message["tool_calls"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|call| ToolCall {
            id: call["id"].as_str().unwrap_or_default().to_owned(),
            name: call["function"]["name"].as_str().unwrap_or_default().to_owned(),
            // The arguments come as a JSON string.
            arguments: call["function"]["arguments"]
                .as_str()
                .and_then(|args| serde_json::from_str(args).ok())
                .unwrap_or_else(|| Value::Object(Map::new())),
            signature: None,
        })
        .collect();
    if text.is_none() && tool_calls.is_empty() {
        return Err(ProviderError::NoAnswer("gave no answer".into()));
    }
    let used = &body["usage"];
    let count = |v: &Value| v.as_u64().unwrap_or(0) as u32;
    let usage = used.is_object().then(|| Usage { input: count(&used["prompt_tokens"]), output: count(&used["completion_tokens"]) });
    Ok(ChatReply { text, tool_calls, provider: "Groq".into(), usage })
}
