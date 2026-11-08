use axiom_protocol::ai::{ChatRequest, Message, Tool, ToolCall};
use axum::Router;
use axum::http::StatusCode;
use axum::response::IntoResponse;
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
}

#[test]
fn a_call_from_before_gemini_answered_everything_gets_geminis_stand_in_signature() {
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
    assert!(body.get("reasoning_effort").is_none(), "only gpt-oss is told how hard to think");
    let oss = groq::body("openai/gpt-oss-120b", &request(vec![]));
    assert_eq!((oss["reasoning_effort"].as_str(), oss["include_reasoning"].as_bool()), (Some("low"), Some(false)));

    let reply = groq::reply(&json!({ "choices": [{ "message": { "content": null, "tool_calls": [
        { "id": "call_9", "type": "function", "function": { "name": "add_birthday", "arguments": r#"{"name":"Ada"}"# } },
    ] } }], "usage": { "prompt_tokens": 7, "completion_tokens": 3, "prompt_tokens_details": { "cached_tokens": 4 } } }))
    .unwrap();
    assert_eq!(reply.text, None);
    assert_eq!(reply.tool_calls, vec![call("call_9", None)]);
    assert_eq!(reply.usage, Some(axiom_protocol::ai::Usage { input: 7, output: 3, cached: 4 }));
}

/// A stand-in Groq that's busy for its first `busy` calls (asking to wait a
/// moment), then streams "From Groq" in pieces with a call and what it used.
/// Returns its URL and the calls made.
async fn groq(busy: usize) -> (String, std::sync::Arc<std::sync::atomic::AtomicUsize>) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let calls = std::sync::Arc::new(AtomicUsize::new(0));
    let counted = calls.clone();
    let groq = move |axum::Json(body): axum::Json<serde_json::Value>| {
        let n = counted.fetch_add(1, Ordering::SeqCst);
        async move {
            if n < busy {
                let error = json!({ "error": { "message": "Rate limit reached on tokens per minute (TPM)" } });
                return (StatusCode::TOO_MANY_REQUESTS, [("retry-after", "0")], axum::Json(error)).into_response();
            }
            if body["stream"] != true {
                return axum::Json(json!({ "choices": [{ "message": { "content": "From Groq" } }] })).into_response();
            }
            let events = [
                json!({ "choices": [{ "delta": { "content": "From " } }] }),
                json!({ "choices": [{ "delta": { "content": "Groq", "tool_calls": [{ "index": 0, "id": "call_9", "function": { "name": "add_birthday", "arguments": "{\"na" } }] } }] }),
                json!({ "choices": [{ "delta": { "tool_calls": [{ "index": 0, "function": { "arguments": "me\":\"Ada\"}" } }] } }], "x_groq": { "usage": { "prompt_tokens": 7, "completion_tokens": 3, "prompt_tokens_details": { "cached_tokens": 4 } } } }),
            ];
            let body: String = events.iter().map(|e| format!("data: {e}\r\n\r\n")).chain(["data: [DONE]\r\n\r\n".into()]).collect();
            ([("content-type", "text/event-stream")], body).into_response()
        }
    };
    let app = Router::new().route("/groq/chat/completions", post(groq));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });
    (url, calls)
}

fn groq_only() -> Keys {
    Keys { gemini: None, groq: Some("q".into()) }
}

#[tokio::test]
async fn groq_answers_on_its_free_plan_without_a_gemini_key() {
    let (url, _) = groq(0).await;
    let reply = ai(&url).chat(&groq_only(), &request(vec![Message::User { text: "Hi".into() }])).await.unwrap();
    assert_eq!((reply.provider.as_str(), reply.text.as_deref()), ("Groq", Some("From Groq")));

    let (log, record) = heard();
    let reply = ai(&url).chat_stream(&groq_only(), &request(vec![]), &|d| record(&log, d)).await.unwrap();
    assert_eq!(*log.lock().unwrap(), ["+From ", "+Groq"]);
    assert_eq!(reply.tool_calls, vec![call("call_9", None)], "the call's pieces are put together");
    assert_eq!(reply.usage, Some(axiom_protocol::ai::Usage { input: 7, output: 3, cached: 4 }));
}

#[tokio::test]
async fn a_paid_gemini_key_answers_instead_of_groq() {
    let (url, groq_calls) = groq(0).await;
    let (gemini_url, _) = gemini(0, StatusCode::OK, None).await;
    let ai = Ai::default().with_urls(&format!("{gemini_url}/gemini"), &format!("{url}/groq"));
    let reply = ai.chat(&keys(), &request(vec![])).await.unwrap();
    assert_eq!(reply.provider, "Gemini");
    assert_eq!(calls(&groq_calls), 0);
}

#[tokio::test]
async fn a_busy_groq_is_asked_again() {
    let (url, counter) = groq(2).await;
    let (log, record) = heard();
    let reply = ai(&url).chat_stream(&groq_only(), &request(vec![]), &|d| record(&log, d)).await.unwrap();
    assert_eq!(reply.text.as_deref(), Some("From Groq"));
    assert_eq!(calls(&counter), 3);
    assert_eq!(log.lock().unwrap()[..2], ["wait", "wait"]);

    let (url, counter) = groq(usize::MAX).await;
    let err = ai(&url).chat(&groq_only(), &request(vec![])).await.unwrap_err();
    assert_eq!(err.message(), "The assistant couldn't answer: Groq is busy right now. Try again in a moment.");
    assert_eq!(calls(&counter), 3, "the first try and two more");
}

/// A stand-in Gemini that fails its first `busy` calls with `status`
/// (asking to wait `retry_after` seconds, if given), then answers; streamed
/// answers write "From " and "Gemini". Returns its URL and the calls made.
async fn gemini(busy: usize, status: StatusCode, retry_after: Option<&'static str>) -> (String, std::sync::Arc<std::sync::atomic::AtomicUsize>) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let calls = std::sync::Arc::new(AtomicUsize::new(0));
    let counted = calls.clone();
    let gemini = move |axum::extract::Path(call): axum::extract::Path<String>| {
        let n = counted.fetch_add(1, Ordering::SeqCst);
        async move {
            if n < busy {
                let error = axum::Json(json!({ "error": { "message": "Resource has been exhausted" } }));
                return match retry_after {
                    Some(wait) => (status, [("retry-after", wait)], error).into_response(),
                    None => (status, error).into_response(),
                };
            }
            if call.contains("stream") {
                let events = [
                    json!({ "candidates": [{ "content": { "parts": [{ "text": "From " }] } }] }),
                    json!({ "candidates": [{ "content": { "parts": [{ "text": "Gemini" }] } }], "usageMetadata": { "promptTokenCount": 5, "candidatesTokenCount": 2 } }),
                ];
                let body: String = events.iter().map(|e| format!("data: {e}\r\n\r\n")).collect();
                ([("content-type", "text/event-stream")], body).into_response()
            } else {
                axum::Json(json!({ "candidates": [{ "content": { "parts": [{ "text": "From Gemini" }] } }] })).into_response()
            }
        }
    };
    let app = Router::new().route("/gemini/models/{call}", post(gemini));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });
    (url, calls)
}

fn keys() -> Keys {
    Keys { gemini: Some("g".into()), groq: Some("q".into()) }
}

fn ai(url: &str) -> Ai {
    Ai::default().with_urls(&format!("{url}/gemini"), &format!("{url}/groq"))
}

fn calls(counter: &std::sync::atomic::AtomicUsize) -> usize {
    counter.load(std::sync::atomic::Ordering::SeqCst)
}

/// What `on` was given, as text: "+words", "restart" or "wait".
fn heard() -> (std::sync::Mutex<Vec<String>>, impl Fn(&std::sync::Mutex<Vec<String>>, Delta)) {
    let record = |log: &std::sync::Mutex<Vec<String>>, delta: Delta| {
        log.lock().unwrap().push(match delta {
            Delta::Text(words) => format!("+{words}"),
            Delta::Restart => "restart".into(),
            Delta::Waiting(_) => "wait".into(),
        })
    };
    (std::sync::Mutex::new(Vec::new()), record)
}

#[tokio::test]
async fn gemini_answers() {
    let (url, _) = gemini(0, StatusCode::OK, None).await;
    let reply = ai(&url).chat(&keys(), &request(vec![Message::User { text: "Hi".into() }])).await.unwrap();
    assert_eq!((reply.provider.as_str(), reply.text.as_deref()), ("Gemini", Some("From Gemini")));
}

#[tokio::test]
async fn words_arrive_as_they_are_written() {
    let (url, _) = gemini(0, StatusCode::OK, None).await;
    let (log, record) = heard();
    let reply = ai(&url).chat_stream(&keys(), &request(vec![Message::User { text: "Hi".into() }]), &|d| record(&log, d)).await.unwrap();
    assert_eq!(*log.lock().unwrap(), ["+From ", "+Gemini"]);
    assert_eq!(reply.text.as_deref(), Some("From Gemini"));
    assert_eq!(reply.usage, Some(axiom_protocol::ai::Usage { input: 5, output: 2, cached: 0 }));
}

#[tokio::test]
async fn thinking_isnt_shown_and_calls_keep_their_signatures() {
    let events = [
        json!({ "candidates": [{ "content": { "parts": [{ "text": "Hmm", "thought": true }, { "text": "Done" }] } }] }),
        json!({ "candidates": [{ "content": { "parts": [{ "functionCall": { "name": "add_birthday", "args": { "name": "Ada" } }, "thoughtSignature": "sig" }] }, "finishReason": "STOP" }] }),
    ];
    let body: String = events.iter().map(|e| format!("data: {e}\r\n\r\n")).collect();
    let app = Router::new().route("/gemini/models/{call}", post(move || async move { ([("content-type", "text/event-stream")], body) }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });

    let (log, record) = heard();
    let reply = ai(&url).chat_stream(&keys(), &request(vec![]), &|d| record(&log, d)).await.unwrap();
    assert_eq!(*log.lock().unwrap(), ["+Done"]);
    assert_eq!(reply.tool_calls, vec![call("call_1", Some("sig"))]);
}

#[tokio::test]
async fn a_busy_gemini_is_asked_again() {
    for status in [StatusCode::TOO_MANY_REQUESTS, StatusCode::SERVICE_UNAVAILABLE] {
        let (url, counter) = gemini(2, status, None).await;
        let (log, record) = heard();
        let reply = ai(&url).chat_stream(&keys(), &request(vec![Message::User { text: "Hi".into() }]), &|d| record(&log, d)).await.unwrap();
        assert_eq!(reply.text.as_deref(), Some("From Gemini"));
        assert_eq!(calls(&counter), 3, "the first try and two more");
        assert_eq!(*log.lock().unwrap(), ["wait", "wait", "+From ", "+Gemini"], "the waits are told, so they can be shown");
    }

    // Asking for a second's wait gets it.
    let (url, counter) = gemini(1, StatusCode::TOO_MANY_REQUESTS, Some("1")).await;
    let started = std::time::Instant::now();
    assert!(ai(&url).chat(&keys(), &request(vec![])).await.is_ok());
    assert!(started.elapsed() >= Duration::from_secs(1));
    assert_eq!(calls(&counter), 2);
}

#[tokio::test]
async fn gemini_isnt_waited_on_for_long_or_for_ever() {
    // Used up for the day: no waiting an hour.
    let (url, counter) = gemini(usize::MAX, StatusCode::TOO_MANY_REQUESTS, Some("3600")).await;
    let err = ai(&url).chat(&keys(), &request(vec![])).await.unwrap_err();
    assert!(err.is_busy());
    assert_eq!(err.message(), "The assistant couldn't answer: Gemini is busy right now. Try again in a moment.");
    assert_eq!(calls(&counter), 1);

    // Still busy after two more tries: it gives up.
    let (url, counter) = gemini(usize::MAX, StatusCode::TOO_MANY_REQUESTS, None).await;
    assert!(ai(&url).chat(&keys(), &request(vec![])).await.unwrap_err().is_busy());
    assert_eq!(calls(&counter), 3);
}

#[tokio::test]
async fn a_refusal_isnt_asked_again() {
    let (url, counter) = gemini(usize::MAX, StatusCode::BAD_REQUEST, None).await;
    let err = ai(&url).chat_stream(&keys(), &request(vec![]), &|_| {}).await.unwrap_err();
    assert!(!err.is_busy());
    assert_eq!(calls(&counter), 1);
}

#[tokio::test]
async fn gemini_starts_again_when_it_fails_part_way() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let tries = std::sync::Arc::new(AtomicUsize::new(0));
    let counted = tries.clone();
    let stream = move || {
        let first = counted.fetch_add(1, Ordering::SeqCst) == 0;
        async move {
            let events = if first {
                vec![json!({ "candidates": [{ "content": { "parts": [{ "text": "From Gem" }] } }] }), json!({ "error": { "code": 503, "message": "The model is overloaded." } })]
            } else {
                vec![json!({ "candidates": [{ "content": { "parts": [{ "text": "From Gemini" }] } }] })]
            };
            ([("content-type", "text/event-stream")], events.iter().map(|e| format!("data: {e}\r\n\r\n")).collect::<String>())
        }
    };
    let app = Router::new().route("/gemini/models/{call}", post(stream));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });

    let (log, record) = heard();
    let reply = ai(&url).chat_stream(&keys(), &request(vec![]), &|d| record(&log, d)).await.unwrap();
    assert_eq!(*log.lock().unwrap(), ["+From Gem", "restart", "wait", "+From Gemini"]);
    assert_eq!(reply.text.as_deref(), Some("From Gemini"));
}

#[tokio::test]
async fn no_keys_no_assistant() {
    assert_eq!(Ai::default().chat(&Keys::default(), &request(vec![])).await.unwrap_err(), AiError::NoKeys);
    assert!(!Keys::default().any());
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
    let heard = ai(&server).transcribe(&keys(), b"RIFF....WAVEfmt ", "audio/wav").await.unwrap();
    assert_eq!((heard.text.as_str(), heard.provider.as_str()), ("Add Ada's birthday", "Groq"));

    // Whisper unreachable: Gemini writes it down instead.
    let (url, _) = gemini(0, StatusCode::OK, None).await;
    let heard = ai(&url).transcribe(&keys(), b"RIFF", "audio/wav").await.unwrap();
    assert_eq!(heard.provider, "Gemini");
}
