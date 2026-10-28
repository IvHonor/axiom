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
    assert_eq!(body["generationConfig"]["maxOutputTokens"], 8192, "what one answer can cost has a ceiling");
}

#[test]
fn gemini_gets_only_the_schema_it_accepts() {
    let mut req = request(vec![Message::User { text: "Hi".into() }]);
    req.tools[0].parameters = json!({
        "type": "object",
        "properties": {
            "remind_days": { "type": "integer", "enum": [0, 1, 7], "description": "Days ahead." },
            "amount": { "type": "number", "exclusiveMinimum": 0 },
            "occasion": { "type": "string", "enum": ["birthday", "anniversary"] },
            "items": { "type": "array", "items": { "type": "object", "properties": { "minutes": { "type": "integer", "enum": [15, 30] } } } },
        },
        "required": [],
    });
    let params = &gemini::body(&req)["tools"][0]["functionDeclarations"][0]["parameters"];
    assert_eq!(params["properties"]["remind_days"], json!({ "type": "integer", "description": "Days ahead. One of: 0, 1, 7." }));
    assert_eq!(params["properties"]["amount"], json!({ "type": "number", "description": "More than 0." }));
    assert_eq!(params["properties"]["occasion"]["enum"], json!(["birthday", "anniversary"]), "string enums stay");
    assert!(params["properties"]["items"]["items"]["properties"]["minutes"].get("enum").is_none(), "nested ones too");
    assert!(params.get("required").is_none(), "an empty list is left out");
    // Groq takes full JSON Schema, so it gets the original.
    assert_eq!(groq::body("m", &req)["tools"][0]["function"]["parameters"]["properties"]["remind_days"]["enum"], json!([0, 1, 7]));
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
    assert_eq!(body["max_completion_tokens"], 8192);

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

/// Stand-ins that stream: Gemini sends `gemini_events` (server-sent events'
/// data), and Groq writes "From Groq" in two pieces with a call in pieces.
async fn streaming(gemini_events: Vec<serde_json::Value>) -> String {
    let sse = |events: Vec<String>| ([("content-type", "text/event-stream")], events.into_iter().map(|e| format!("data: {e}\r\n\r\n")).collect::<String>());
    let gemini = move || {
        let events = gemini_events.iter().map(|e| e.to_string()).collect();
        async move { sse(events) }
    };
    let groq = move |axum::Json(body): axum::Json<serde_json::Value>| async move {
        assert_eq!(body["stream"], true);
        let events = [
            json!({ "choices": [{ "delta": { "content": "From " } }] }),
            json!({ "choices": [{ "delta": { "content": "Groq", "tool_calls": [{ "index": 0, "id": "call_9", "function": { "name": "add_birthday", "arguments": "{\"na" } }] } }] }),
            json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "function": { "arguments": "me\":\"Ada\"}" } }] } }], "x_groq": { "usage": { "prompt_tokens": 7, "completion_tokens": 3 } } }),
        ];
        sse(events.iter().map(|e| e.to_string()).chain(["[DONE]".into()]).collect())
    };
    let app = Router::new().route("/gemini/models/{call}", post(gemini)).route("/groq/chat/completions", post(groq));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });
    url
}

/// What `on` was given, as text: "+words" or "restart".
fn heard() -> (std::sync::Mutex<Vec<String>>, impl Fn(&std::sync::Mutex<Vec<String>>, Delta)) {
    let record = |log: &std::sync::Mutex<Vec<String>>, delta: Delta| {
        log.lock().unwrap().push(match delta {
            Delta::Text(words) => format!("+{words}"),
            Delta::Restart => "restart".into(),
        })
    };
    (std::sync::Mutex::new(Vec::new()), record)
}

#[tokio::test]
async fn words_arrive_as_they_are_written() {
    let url = streaming(vec![
        json!({ "candidates": [{ "content": { "parts": [{ "text": "Hmm", "thought": true }, { "text": "From " }] } }] }),
        json!({ "candidates": [{ "content": { "parts": [{ "text": "Gemini" }, { "functionCall": { "name": "add_birthday", "args": { "name": "Ada" } }, "thoughtSignature": "sig" }] }, "finishReason": "STOP" }], "usageMetadata": { "promptTokenCount": 5, "candidatesTokenCount": 2 } }),
    ])
    .await;
    let ai = Ai::default().with_urls(&format!("{url}/gemini"), &format!("{url}/groq"));
    let (log, record) = heard();
    let reply = ai.chat_stream(&both(), &request(vec![Message::User { text: "Hi".into() }]), &|d| record(&log, d)).await.unwrap();
    assert_eq!(*log.lock().unwrap(), ["+From ", "+Gemini"], "its thinking isn't shown");
    assert_eq!(reply.text.as_deref(), Some("From Gemini"));
    assert_eq!(reply.tool_calls, vec![call("call_1", Some("sig"))]);
    assert_eq!(reply.usage, Some(axiom_protocol::ai::Usage { input: 5, output: 2 }));
}

#[tokio::test]
async fn groq_starts_again_when_gemini_fails_part_way() {
    let url = streaming(vec![
        json!({ "candidates": [{ "content": { "parts": [{ "text": "From Gem" }] } }] }),
        json!({ "error": { "code": 503, "message": "The model is overloaded." } }),
    ])
    .await;
    let ai = Ai::default().with_urls(&format!("{url}/gemini"), &format!("{url}/groq"));
    let (log, record) = heard();
    let reply = ai.chat_stream(&both(), &request(vec![Message::User { text: "Hi".into() }]), &|d| record(&log, d)).await.unwrap();
    assert_eq!(*log.lock().unwrap(), ["+From Gem", "restart", "+From ", "+Groq"]);
    assert_eq!((reply.provider.as_str(), reply.text.as_deref()), ("Groq", Some("From Groq")));
    assert_eq!(reply.tool_calls, vec![call("call_9", None)], "the call's pieces are put together");
    assert_eq!(reply.usage, Some(axiom_protocol::ai::Usage { input: 7, output: 3 }));

    // Without Groq, it's Gemini's failure.
    let err = ai.chat_stream(&Keys { groq: None, ..both() }, &request(vec![]), &|_| {}).await.unwrap_err();
    assert_eq!(err.message(), "The assistant couldn't answer: Gemini is having problems.");
}

#[tokio::test]
async fn no_keys_no_assistant() {
    let err = Ai::default().chat(&Keys::default(), &request(vec![])).await.unwrap_err();
    assert_eq!(err, AiError::NoKeys);
}

#[tokio::test]
async fn speech_goes_to_whisper_then_gemini() {
    let server = {
        let whisper = |body: axum::body::Bytes| async move {
            let text = String::from_utf8_lossy(&body);
            assert!(text.contains("whisper-large-v3-turbo") && text.contains("filename=\"speech.wav\"") && text.contains("RIFF"), "{text}");
            axum::Json(json!({ "text": " Add Ada's birthday " }))
        };
        let app = Router::new().route("/groq/audio/transcriptions", post(whisper));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await });
        url
    };
    let ai = Ai::default().with_urls(&format!("{server}/gemini"), &format!("{server}/groq"));
    let heard = ai.transcribe(&both(), b"RIFF....WAVEfmt ", "audio/wav").await.unwrap();
    assert_eq!((heard.text.as_str(), heard.provider.as_str()), ("Add Ada's birthday", "Groq"));

    // Groq busy: Gemini writes it down instead.
    let url = providers(StatusCode::OK).await;
    let ai = Ai::default().with_urls(&format!("{url}/gemini"), &format!("{url}/groq"));
    let heard = ai.transcribe(&Keys { groq: Some("q".into()), ..both() }, b"RIFF", "audio/wav").await.unwrap();
    assert_eq!(heard.provider, "Gemini");
}
