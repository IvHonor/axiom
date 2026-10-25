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
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&token), Some(chat())).await.0, StatusCode::FORBIDDEN);
}
