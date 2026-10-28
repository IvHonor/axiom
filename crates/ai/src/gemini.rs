//! Google's Gemini API (`generateContent`).

use axiom_protocol::ai::{ChatReply, ChatRequest, Message, ToolCall, Usage};
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
        "generationConfig": { "maxOutputTokens": crate::MAX_OUTPUT_TOKENS },
    });
    if !request.tools.is_empty() {
        let declarations: Vec<Value> =
            request.tools.iter().map(|tool| json!({ "name": tool.name, "description": tool.description, "parameters": schema(&tool.parameters) })).collect();
        body["tools"] = json!([{ "functionDeclarations": declarations }]);
    }
    body
}

/// Gemini takes only part of JSON Schema (OpenAPI's): enums of strings, and
/// none of the keywords it doesn't know, or it refuses the whole request.
/// What it can't take goes into the description, so the model still knows.
fn schema(given: &Value) -> Value {
    let Some(fields) = given.as_object() else { return given.clone() };
    let mut out = Map::new();
    let mut notes = Vec::new();
    for (key, value) in fields {
        match key.as_str() {
            "properties" => {
                let properties = value.as_object().map(|p| p.iter().map(|(name, s)| (name.clone(), schema(s))).collect()).unwrap_or_default();
                out.insert(key.clone(), Value::Object(properties));
            }
            "items" => {
                out.insert(key.clone(), schema(value));
            }
            "enum" if value.as_array().is_some_and(|e| e.iter().all(Value::is_string)) => {
                out.insert(key.clone(), value.clone());
            }
            "enum" => {
                let options: Vec<String> = value.as_array().into_iter().flatten().map(|v| v.to_string()).collect();
                notes.push(format!("One of: {}.", options.join(", ")));
            }
            "required" if value.as_array().is_some_and(|r| !r.is_empty()) => {
                out.insert(key.clone(), value.clone());
            }
            "type" | "description" | "minimum" | "maximum" | "minItems" | "maxItems" | "nullable" => {
                out.insert(key.clone(), value.clone());
            }
            "exclusiveMinimum" => notes.push(format!("More than {value}.")),
            "exclusiveMaximum" => notes.push(format!("Less than {value}.")),
            _ => {}
        }
    }
    if !notes.is_empty() {
        let before = out.get("description").and_then(Value::as_str).unwrap_or_default();
        let description = [before, &notes.join(" ")].iter().filter(|t| !t.is_empty()).copied().collect::<Vec<_>>().join(" ");
        out.insert("description".into(), json!(description));
    }
    Value::Object(out)
}

/// Asks Gemini to write down what's said in a recording.
pub fn transcription(audio: &[u8], mime: &str) -> Value {
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD.encode(audio);
    json!({
        "contents": [{ "role": "user", "parts": [
            { "text": "Write down exactly what is said in this recording, in the language it's said in. Reply with only those words. If nothing is said, reply with nothing." },
            { "inlineData": { "mimeType": mime, "data": data } },
        ] }],
    })
}

/// Gemini wants each tool's answer as an object.
fn as_object(result: &Value) -> Value {
    if result.is_object() { result.clone() } else { json!({ "result": result }) }
}

/// A streamed answer (`streamGenerateContent`), gathered into the one
/// `generateContent` would have sent.
#[derive(Default)]
pub struct Gathered {
    answered: bool,
    parts: Vec<Value>,
    finish: Value,
    usage: Value,
    feedback: Value,
}

impl Gathered {
    /// Adds one event, and returns the words in it for the person.
    pub fn add(&mut self, event: Value) -> String {
        let mut words = String::new();
        if let Some(candidate) = event["candidates"].get(0) {
            self.answered = true;
            for part in candidate["content"]["parts"].as_array().into_iter().flatten() {
                if let Some(text) = part["text"].as_str().filter(|_| part["thought"] != true) {
                    words.push_str(text);
                }
                self.parts.push(part.clone());
            }
            if let Some(finish) = candidate.get("finishReason") {
                self.finish = finish.clone();
            }
        }
        // Each event says what was used so far; the last one says it all.
        if let Some(usage) = event.get("usageMetadata") {
            self.usage = usage.clone();
        }
        if let Some(feedback) = event.get("promptFeedback") {
            self.feedback = feedback.clone();
        }
        words
    }

    pub fn reply(self) -> Result<ChatReply, ProviderError> {
        let mut body = json!({ "usageMetadata": self.usage, "promptFeedback": self.feedback });
        if self.answered {
            body["candidates"] = json!([{ "content": { "parts": self.parts }, "finishReason": self.finish }]);
        }
        reply(&body)
    }
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
    let used = &body["usageMetadata"];
    let count = |v: &Value| v.as_u64().unwrap_or(0) as u32;
    let usage = used.is_object().then(|| Usage { input: count(&used["promptTokenCount"]), output: count(&used["candidatesTokenCount"]) + count(&used["thoughtsTokenCount"]) });
    Ok(ChatReply { text: (!text.is_empty()).then_some(text), tool_calls, provider: "Gemini".into(), usage })
}
