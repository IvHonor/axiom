//! The assistant on the server's AI keys.

mod common;

use axiom_protocol::routes;
use axum::Router;
use axum::http::{Method, StatusCode};
use axum::routing;
use common::*;
use serde_json::{Value, json};

fn chat() -> Value {
    json!({ "system": "You are Axiom's assistant.", "messages": [{ "role": "user", "text": "Hi" }] })
}

/// A stand-in for Gemini that always says hello.
async fn gemini() -> String {
    let answer = || async { axum::Json(json!({ "candidates": [{ "content": { "parts": [{ "text": "Hello!" }] } }] })) };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, Router::new().route("/models/{call}", routing::post(answer))).await });
    url
}

async fn token(app: &Router) -> String {
    let (_, session) = post(app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    session["access_token"].as_str().unwrap().to_owned()
}

#[tokio::test]
async fn the_assistant_answers_on_the_servers_key() {
    let url = gemini().await;
    let app = server_with(|s| {
        s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
    })
    .await;
    let token = token(&app).await;

    let (status, reply) = call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await;
    assert_eq!(status, StatusCode::OK, "{reply}");
    assert_eq!(reply["text"], "Hello!");
    assert_eq!(reply["provider"], "Gemini");

    assert_eq!(call(&app, Method::POST, routes::AI_CHAT, None, Some(chat())).await.0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn the_answer_can_come_as_it_is_written() {
    use axum::body::Body;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    // A stand-in for Gemini that streams "Hello!" in two pieces.
    let streaming = || async {
        let events = ["Hel", "lo!"].map(|words| format!("data: {}\r\n\r\n", json!({ "candidates": [{ "content": { "parts": [{ "text": words }] } }] })));
        ([("content-type", "text/event-stream")], events.concat())
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, Router::new().route("/models/{call}", routing::post(streaming))).await });
    let app = server_with(|s| {
        s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
    })
    .await;
    let token = token(&app).await;

    let request = axum::http::Request::post(routes::AI_CHAT_STREAM)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(chat().to_string()))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let lines: Vec<Value> = String::from_utf8_lossy(&body).lines().map(|line| serde_json::from_str(line).unwrap()).collect();
    assert_eq!(lines[0], json!({ "kind": "text", "text": "Hel" }));
    assert_eq!(lines[1], json!({ "kind": "text", "text": "lo!" }));
    assert_eq!(lines[2]["kind"], "reply");
    assert_eq!(lines[2]["reply"]["text"], "Hello!");

    // Refusals come before any streaming, as plain errors.
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT_STREAM, None, Some(chat())).await.0, StatusCode::UNAUTHORIZED);
}


/// A stand-in for Gemini that says hello and what it used.
async fn gemini_with_usage() -> String {
    let answer = || async {
        axum::Json(json!({ "candidates": [{ "content": { "parts": [{ "text": "Hello!" }] } }], "usageMetadata": { "promptTokenCount": 100, "cachedContentTokenCount": 40, "candidatesTokenCount": 20 } }))
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, Router::new().route("/models/{call}", routing::post(answer))).await });
    url
}

#[tokio::test]
async fn the_brake_is_counted_in_the_database_so_a_restart_keeps_it() {
    let url = gemini().await;
    let db = axiom_server::db::connect("sqlite::memory:").await.unwrap();
    // A server on this database with everyone's limit at `everyone`; a new one is a restart.
    let start = |everyone: Option<u32>| {
        let mut s = axiom_server::Shared::new(db.clone(), SECRET);
        s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
        s.ai_daily_limit = everyone;
        axiom_server::app(axiom_server::AppState::from(s))
    };
    let app = start(Some(3));
    let token = token(&app).await;
    for _ in 0..3 {
        assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await.0, StatusCode::OK);
    }

    // Restarted, it still knows everyone's three are used up, for chatting and for speech.
    let app = start(Some(3));
    let (status, body) = call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["message"].as_str().unwrap().starts_with("Axiom's assistant has had all it can for today"), "{body}");
    let speech = json!({ "audio": "UklGRg==", "mime": "audio/wav" });
    assert_eq!(call(&app, Method::POST, routes::AI_TRANSCRIBE, Some(&token), Some(speech)).await.0, StatusCode::TOO_MANY_REQUESTS);

    // Without the brake, nothing stops it.
    let app = start(None);
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await.0, StatusCode::OK);
}

#[tokio::test]
async fn there_is_no_allowance_per_account() {
    use sea_orm::ConnectionTrait;

    let url = gemini().await;
    let db = axiom_server::db::connect("sqlite::memory:").await.unwrap();
    let mut s = axiom_server::Shared::new(db.clone(), SECRET);
    s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
    s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
    let app = axiom_server::app(axiom_server::AppState::from(s));
    let token = token(&app).await;
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await.0, StatusCode::OK);
    db.execute_unprepared("UPDATE ai_usage SET count = 100000, prompts = 100000").await.unwrap();
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT_STREAM, Some(&token), Some(chat())).await.0, StatusCode::OK);
}

#[tokio::test]
async fn admins_see_what_each_account_used() {
    let url = gemini_with_usage().await;
    let app = server_with(|s| {
        s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
        s.admins.insert("ada@example.com".into());
    })
    .await;
    let ada = token(&app).await;

    // A question, then a step of it (after a tool's result): one prompt, two calls.
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&ada), Some(chat())).await.0, StatusCode::OK);
    let step = json!({ "system": "s", "messages": [
        { "role": "user", "text": "Hi" },
        { "role": "assistant", "text": null, "tool_calls": [{ "id": "c1", "name": "look", "arguments": {} }] },
        { "role": "tool", "call_id": "c1", "name": "look", "result": [] },
    ] });
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&ada), Some(step)).await.0, StatusCode::OK);

    let (status, usage) = call(&app, Method::GET, &format!("{}?days=7", routes::ADMIN_AI_USAGE), Some(&ada), None).await;
    assert_eq!(status, StatusCode::OK, "{usage}");
    assert_eq!(usage["days"], 7);
    assert_eq!(usage["daily"].as_array().unwrap().len(), 7, "every day, even quiet ones");
    assert_eq!(usage["daily"][6]["prompts"], 1);
    let person = &usage["people"][0];
    assert_eq!(person["email"], "ada@example.com");
    assert_eq!((person["prompts"].as_u64(), person["calls"].as_u64()), (Some(1), Some(2)));
    assert_eq!((person["input_tokens"].as_u64(), person["cached_tokens"].as_u64(), person["output_tokens"].as_u64()), (Some(200), Some(80), Some(40)));
    assert_eq!(person["failures"], 0);
    assert!(person["last_used_at"].is_string());
    assert!(usage["daily_limit"].is_null());

    // Not for everyone.
    let (_, bob) = post(&app, routes::SIGN_UP, credentials("bob@example.com", "correct horse")).await;
    let bob = bob["access_token"].as_str().unwrap();
    assert_eq!(call(&app, Method::GET, routes::ADMIN_AI_USAGE, Some(bob), None).await.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn failures_are_counted_with_their_reason() {
    let refuses = || async { (StatusCode::BAD_REQUEST, axum::Json(json!({ "error": { "message": "API key not valid" } }))) };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, Router::new().route("/models/{call}", routing::post(refuses))).await });
    let app = server_with(|s| {
        s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
        s.admins.insert("ada@example.com".into());
    })
    .await;
    let ada = token(&app).await;
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&ada), Some(chat())).await.0, StatusCode::BAD_GATEWAY);

    let (_, usage) = call(&app, Method::GET, routes::ADMIN_AI_USAGE, Some(&ada), None).await;
    let person = &usage["people"][0];
    assert_eq!((person["prompts"].as_u64(), person["failures"].as_u64()), (Some(1), Some(1)));
    assert_eq!(person["last_error"], "The assistant couldn't answer: Gemini refused the key.");
    assert_eq!(usage["days"], 30);
}

#[tokio::test]
async fn without_keys_the_server_says_so() {
    let app = server().await;
    let token = token(&app).await;
    let (status, body) = call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body["message"], "The assistant isn't set up on this server yet.");
}


#[tokio::test]
async fn only_accounts_allowed_the_assistant_can_use_it() {
    let app = server_with(|s| {
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
        s.settings.write().unwrap().default_permissions = vec!["sync".into()];
    })
    .await;
    let token = token(&app).await;
    let (status, body) = call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(body["message"].as_str().unwrap().starts_with("The assistant on Axiom's AI keys is switched off"), "{body}");
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT_STREAM, Some(&token), Some(chat())).await.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn speech_needs_keys_and_a_recording() {
    let app = server_with(|s| s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None }).await;
    let ada = token(&app).await;
    let not_audio = json!({ "audio": "aGVsbG8=", "mime": "text/plain" });
    assert_eq!(call(&app, Method::POST, routes::AI_TRANSCRIBE, Some(&ada), Some(not_audio)).await.0, StatusCode::BAD_REQUEST);
    let garbled = json!({ "audio": "not base64!", "mime": "audio/wav" });
    assert_eq!(call(&app, Method::POST, routes::AI_TRANSCRIBE, Some(&ada), Some(garbled)).await.0, StatusCode::BAD_REQUEST);

    let keyless = server().await;
    let bob = token(&keyless).await;
    let fine = json!({ "audio": "UklGRg==", "mime": "audio/wav" });
    assert_eq!(call(&keyless, Method::POST, routes::AI_TRANSCRIBE, Some(&bob), Some(fine)).await.0, StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn a_wait_for_a_busy_ai_is_told_only_to_apps_that_show_it() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use axum::body::Body;
    use axum::response::IntoResponse;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    // A stand-in for Gemini that's busy for a moment at the start of each question.
    let calls = Arc::new(AtomicUsize::new(0));
    let gemini = move || {
        let call = calls.fetch_add(1, Ordering::SeqCst);
        async move {
            if call % 2 == 0 {
                (StatusCode::TOO_MANY_REQUESTS, [("retry-after", "0.2")], axum::Json(json!({ "error": { "message": "Resource has been exhausted" } }))).into_response()
            } else {
                let event = json!({ "candidates": [{ "content": { "parts": [{ "text": "Hello!" }] } }] });
                ([("content-type", "text/event-stream")], format!("data: {event}\r\n\r\n")).into_response()
            }
        }
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, Router::new().route("/models/{call}", routing::post(gemini))).await });
    let app = server_with(|s| {
        s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
    })
    .await;
    let token = token(&app).await;

    let kinds = |shows_waits: bool| {
        let app = app.clone();
        let token = token.clone();
        async move {
            let mut request = axum::http::Request::post(routes::AI_CHAT_STREAM)
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json");
            if shows_waits {
                request = request.header(axiom_protocol::ai::SHOWS_WAITS, "1");
            }
            let response = app.oneshot(request.body(Body::from(chat().to_string())).unwrap()).await.unwrap();
            let body = response.into_body().collect().await.unwrap().to_bytes();
            String::from_utf8_lossy(&body).lines().map(|line| serde_json::from_str::<Value>(line).unwrap()).collect::<Vec<_>>()
        }
    };
    let shown = kinds(true).await;
    assert_eq!(shown[0], json!({ "kind": "waiting", "seconds": 1 }), "rounded up to a whole second");
    assert_eq!(shown.last().unwrap()["reply"]["text"], "Hello!");
    let older = kinds(false).await;
    assert!(older.iter().all(|line| line["kind"] != "waiting"), "an older app would fail on a line it doesn't know");
    assert_eq!(older.last().unwrap()["reply"]["text"], "Hello!");
}

#[tokio::test]
async fn groq_answers_on_its_free_plan_and_is_counted() {
    let groq = || async {
        axum::Json(json!({ "choices": [{ "message": { "content": "Hello!" } }], "usage": { "prompt_tokens": 50, "completion_tokens": 5 } }))
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, Router::new().route("/chat/completions", routing::post(groq))).await });
    let app = server_with(|s| {
        s.ai = axiom_ai::Ai::default().with_urls("http://127.0.0.1:9", &url);
        s.ai_keys = axiom_ai::Keys { gemini: None, groq: Some("key".into()) };
        s.admins.insert("ada@example.com".into());
    })
    .await;
    let ada = token(&app).await;

    let (status, reply) = call(&app, Method::POST, routes::AI_CHAT, Some(&ada), Some(chat())).await;
    assert_eq!(status, StatusCode::OK, "{reply}");
    assert_eq!((reply["provider"].as_str(), reply["text"].as_str()), (Some("Groq"), Some("Hello!")));

    let (_, usage) = call(&app, Method::GET, routes::ADMIN_AI_USAGE, Some(&ada), None).await;
    assert_eq!((usage["people"][0]["input_tokens"].as_u64(), usage["people"][0]["output_tokens"].as_u64()), (Some(50), Some(5)));
    assert!(usage.get("price").is_none(), "no costs: nothing is paid for");
}
