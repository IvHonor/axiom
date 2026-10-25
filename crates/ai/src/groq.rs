//! Groq's OpenAI-compatible API (`chat/completions`).

use axiom_protocol::ai::{ChatReply, ChatRequest, Message, ToolCall};
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
    let mut body = json!({ "model": model, "messages": messages });
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
    Ok(ChatReply { text, tool_calls, provider: "Groq".into() })
}
