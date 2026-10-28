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

#[tokio::test]
async fn allowances_are_counted_in_the_database_so_a_restart_keeps_them() {
    use sea_orm::ConnectionTrait;

    let url = gemini().await;
    let db = axiom_server::db::connect("sqlite::memory:").await.unwrap();
    // A server on this database with everyone's limit at `everyone`; a new one is a restart.
    let start = |everyone: u32| {
        let mut s = axiom_server::Shared::new(db.clone(), SECRET);
        s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
        s.ai_daily_limit = everyone;
        axiom_server::app(axiom_server::AppState::from(s))
    };
    let app = start(3);
    let token = token(&app).await;
    for _ in 0..3 {
        assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await.0, StatusCode::OK);
    }

    // Restarted, it still knows everyone's three are used up, for chatting and for speech.
    let app = start(3);
    let (status, body) = call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["message"].as_str().unwrap().starts_with("Axiom's assistant has had all it can for today"), "{body}");
    let speech = json!({ "audio": "UklGRg==", "mime": "audio/wav" });
    assert_eq!(call(&app, Method::POST, routes::AI_TRANSCRIBE, Some(&token), Some(speech)).await.0, StatusCode::TOO_MANY_REQUESTS);

    // An account at its own allowance is stopped first, and doesn't use up everyone's.
    let app = start(1000);
    db.execute_unprepared("UPDATE ai_usage SET count = 150 WHERE user_id <> ''").await.unwrap();
    let everyone = || async { db.query_one_raw(sea_orm::Statement::from_string(db.get_database_backend(), "SELECT count FROM ai_usage WHERE user_id = ''")).await.unwrap().unwrap().try_get::<i32>("", "count").unwrap() };
    let before = everyone().await;
    let (status, body) = call(&app, Method::POST, routes::AI_CHAT_STREAM, Some(&token), Some(chat())).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["message"].as_str().unwrap().starts_with("You've used today's assistant allowance"), "{body}");
    assert_eq!(everyone().await, before);
}

#[tokio::test]
async fn without_keys_the_server_says_so() {
    let app = server().await;
    let token = token(&app).await;
    let (status, body) = call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert!(body["message"].as_str().unwrap().contains("your own free AI key"));
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
