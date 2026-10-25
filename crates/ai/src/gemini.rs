//! Google's Gemini API (`generateContent`).

use axiom_protocol::ai::{ChatReply, ChatRequest, Message, ToolCall};
use serde_json::{Map, Value, json};

use crate::ProviderError;

/// Google's documented stand-in for a call Gemini didn't make itself (e.g.
/// one Groq made earlier in the conversation), which has no thought signature.
const NO_SIGNATURE: &str = "skip_thought_signature_validator";

pub fn body(request: &ChatRequest) -> Value {
    let mut contents: Vec<Value> = Vec::new();
    for message in &request.messages {
        match message {
            Message::User { text } => contents.push(json!({ "role": "user", "parts": [{ "text": text }] })),
            Message::Assistant { text, tool_calls } => {
                let mut parts = Vec::new();
                if let Some(text) = text.as_deref().filter(|t| !t.is_empty()) {
                    parts.push(json!({ "text": text }));
                }
                // Only the first of several parallel calls carries a signature,
                // so the stand-in goes in only when none of them has one.
                let foreign = tool_calls.iter().all(|call| call.signature.is_none());
                for (i, call) in tool_calls.iter().enumerate() {
                    let mut part = json!({ "functionCall": { "name": call.name, "args": call.arguments } });
                    match &call.signature {
                        Some(signature) => part["thoughtSignature"] = json!(signature),
                        None if foreign && i == 0 => part["thoughtSignature"] = json!(NO_SIGNATURE),
                        None => {}
                    }
                    parts.push(part);
                }
                if !parts.is_empty() {
                    contents.push(json!({ "role": "model", "parts": parts }));
                }
            }
            Message::Tool { name, result, .. } => {
                // The answers to one turn's calls go back together, in one message.
                let part = json!({ "functionResponse": { "name": name, "response": as_object(result) } });
                match contents.last_mut() {
                    Some(last) if last["role"] == "user" && last["parts"][0].get("functionResponse").is_some() => {
                        last["parts"].as_array_mut().expect("parts is a list").push(part);
                    }
                    _ => contents.push(json!({ "role": "user", "parts": [part] })),
                }
            }
        }
    }
    let mut body = json!({
        "systemInstruction": { "parts": [{ "text": request.system }] },
        "contents": contents,
    });
    if !request.tools.is_empty() {
        let declarations: Vec<Value> =
            request.tools.iter().map(|tool| json!({ "name": tool.name, "description": tool.description, "parameters": tool.parameters })).collect();
        body["tools"] = json!([{ "functionDeclarations": declarations }]);
    }
    body
}

/// Gemini wants each tool's answer as an object.
fn as_object(result: &Value) -> Value {
    if result.is_object() { result.clone() } else { json!({ "result": result }) }
}

pub fn reply(body: &Value) -> Result<ChatReply, ProviderError> {
    let Some(candidate) = body["candidates"].get(0) else {
        let why = body["promptFeedback"]["blockReason"].as_str().unwrap_or("no reason given");
        return Err(ProviderError::NoAnswer(format!("wouldn't answer that ({why})")));
    };
    let mut text = String::new();
    let mut tool_calls = Vec::new();
    for part in candidate["content"]["parts"].as_array().into_iter().flatten() {
        if let Some(call) = part.get("functionCall") {
            tool_calls.push(ToolCall {
                id: call["id"].as_str().map_or_else(|| format!("call_{}", tool_calls.len() + 1), String::from),
                name: call["name"].as_str().unwrap_or_default().to_owned(),
                arguments: call.get("args").cloned().unwrap_or_else(|| Value::Object(Map::new())),
                signature: part["thoughtSignature"].as_str().map(String::from),
            });
        } else if let Some(words) = part["text"].as_str() {
            // Its reasoning, when it shows it, isn't part of the answer.
            if part["thought"] != true {
                text.push_str(words);
            }
        }
    }
    if text.is_empty() && tool_calls.is_empty() {
        let why = candidate["finishReason"].as_str().unwrap_or("an empty answer");
        return Err(ProviderError::NoAnswer(format!("gave no answer ({why})")));
    }
    Ok(ChatReply { text: (!text.is_empty()).then_some(text), tool_calls, provider: "Gemini".into() })
}
