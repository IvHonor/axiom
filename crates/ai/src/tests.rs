use axiom_protocol::ai::{ChatRequest, Message, Tool, ToolCall};
use axum::Router;
use axum::http::StatusCode;
use axum::routing::post;
use serde_json::json;

use super::*;

fn request(messages: Vec<Message>) -> ChatRequest {
    ChatRequest {
        system: "You are Axiom's assistant.".into(),
        messages,
        tools: vec![Tool {
            name: "add_birthday".into(),
            description: "Adds a birthday.".into(),
            parameters: json!({ "type": "object", "properties": { "name": { "type": "string" } }, "required": ["name"] }),
        }],
    }
}

fn call(id: &str, signature: Option<&str>) -> ToolCall {
    ToolCall { id: id.into(), name: "add_birthday".into(), arguments: json!({ "name": "Ada" }), signature: signature.map(String::from) }
}

#[test]
fn gemini_gets_the_conversation_its_own_way() {
    let body = gemini::body(&request(vec![
        Message::User { text: "Add Ada and Bob".into() },
        Message::Assistant { text: None, tool_calls: vec![call("call_1", Some("sig")), call("call_2", None)] },
        Message::Tool { call_id: "call_1".into(), name: "add_birthday".into(), result: json!({ "proposed": true }) },
        Message::Tool { call_id: "call_2".into(), name: "add_birthday".into(), result: json!("done") },
    ]));
    assert_eq!(body["systemInstruction"]["parts"][0]["text"], "You are Axiom's assistant.");
    let contents = body["contents"].as_array().unwrap();
    assert_eq!(contents.len(), 3, "both answers go back in one message: {contents:?}");
    assert_eq!(contents[1]["role"], "model");
    assert_eq!(contents[1]["parts"][0]["thoughtSignature"], "sig");
    assert!(contents[1]["parts"][1].get("thoughtSignature").is_none(), "only the first parallel call has one");
    assert_eq!(contents[2]["parts"].as_array().unwrap().len(), 2);
    assert_eq!(contents[2]["parts"][1]["functionResponse"]["response"], json!({ "result": "done" }));
    assert_eq!(body["tools"][0]["functionDeclarations"][0]["name"], "add_birthday");
}

#[test]
fn a_call_another_model_made_gets_geminis_stand_in_signature() {
    let body = gemini::body(&request(vec![
        Message::User { text: "Add Ada".into() },
        Message::Assistant { text: None, tool_calls: vec![call("groq-1", None)] },
    ]));
    assert_eq!(body["contents"][1]["parts"][0]["thoughtSignature"], "skip_thought_signature_validator");
}

#[test]
fn geminis_answer_keeps_its_calls_and_signatures_and_drops_its_thinking() {
    let reply = gemini::reply(&json!({ "candidates": [{ "content": { "parts": [
        { "text": "Let me think…", "thought": true },
        { "text": "Adding Ada." },
        { "functionCall": { "name": "add_birthday", "args": { "name": "Ada" } }, "thoughtSignature": "sig" },
    ] } }] }))
    .unwrap();
    assert_eq!(reply.text.as_deref(), Some("Adding Ada."));
    assert_eq!(reply.tool_calls, vec![call("call_1", Some("sig"))]);
    assert_eq!(reply.provider, "Gemini");

    let blocked = gemini::reply(&json!({ "promptFeedback": { "blockReason": "SAFETY" } })).unwrap_err();
    assert_eq!(blocked, ProviderError::NoAnswer("wouldn't answer that (SAFETY)".into()));
}

#[test]
fn groq_gets_openai_style_messages_and_its_arguments_are_read() {
    let body = groq::body("model", &request(vec![
        Message::User { text: "Add Ada".into() },
        Message::Assistant { text: None, tool_calls: vec![call("call_1", Some("sig"))] },
        Message::Tool { call_id: "call_1".into(), name: "add_birthday".into(), result: json!({ "ok": true }) },
    ]));
    let messages = body["messages"].as_array().unwrap();
    assert_eq!(messages[0], json!({ "role": "system", "content": "You are Axiom's assistant." }));
    assert_eq!(messages[2]["tool_calls"][0]["function"]["arguments"], r#"{"name":"Ada"}"#);
    assert_eq!(messages[3], json!({ "role": "tool", "tool_call_id": "call_1", "content": r#"{"ok":true}"# }));
    assert_eq!(body["tools"][0]["function"]["name"], "add_birthday");

    let reply = groq::reply(&json!({ "choices": [{ "message": { "content": null, "tool_calls": [
        { "id": "call_9", "type": "function", "function": { "name": "add_birthday", "arguments": r#"{"name":"Ada"}"# } },
    ] } }] }))
    .unwrap();
    assert_eq!(reply.text, None);
    assert_eq!(reply.tool_calls, vec![call("call_9", None)]);
}

/// Stand-ins for both providers: Gemini answers with `gemini_status`.
async fn providers(gemini_status: StatusCode) -> String {
    let gemini = move || async move {
        if gemini_status.is_success() {
            (StatusCode::OK, axum::Json(json!({ "candidates": [{ "content": { "parts": [{ "text": "From Gemini" }] } }] })))
        } else {
            (gemini_status, axum::Json(json!({ "error": { "message": "Resource has been exhausted" } })))
        }
    };
    let groq = || async { axum::Json(json!({ "choices": [{ "message": { "content": "From Groq" } }] })) };
    let app = Router::new().route("/gemini/models/{call}", post(gemini)).route("/groq/chat/completions", post(groq));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });
    url
}

fn both() -> Keys {
    Keys { gemini: Some("g".into()), groq: Some("q".into()) }
}

#[tokio::test]
async fn gemini_answers_first() {
    let url = providers(StatusCode::OK).await;
    let ai = Ai::default().with_urls(&format!("{url}/gemini"), &format!("{url}/groq"));
    let reply = ai.chat(&both(), &request(vec![Message::User { text: "Hi".into() }])).await.unwrap();
    assert_eq!((reply.provider.as_str(), reply.text.as_deref()), ("Gemini", Some("From Gemini")));
}

#[tokio::test]
async fn groq_answers_when_gemini_has_used_up_its_free_requests() {
    let url = providers(StatusCode::TOO_MANY_REQUESTS).await;
    let ai = Ai::default().with_urls(&format!("{url}/gemini"), &format!("{url}/groq"));
    let reply = ai.chat(&both(), &request(vec![Message::User { text: "Hi".into() }])).await.unwrap();
    assert_eq!((reply.provider.as_str(), reply.text.as_deref()), ("Groq", Some("From Groq")));

    // Without Groq, the reason is Gemini's.
    let err = ai.chat(&Keys { groq: None, ..both() }, &request(vec![])).await.unwrap_err();
    assert!(err.is_busy());
    assert_eq!(err.message(), "The assistant couldn't answer: Gemini is busy or has used up its free requests for now.");
}

#[tokio::test]
async fn no_keys_no_assistant() {
    let err = Ai::default().chat(&Keys::default(), &request(vec![])).await.unwrap_err();
    assert_eq!(err, AiError::NoKeys);
}
