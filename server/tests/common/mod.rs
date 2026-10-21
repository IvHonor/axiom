//! Helpers shared by the API tests.
#![allow(dead_code)]

use axiom_server::{AppState, Shared, app, db};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

pub const SECRET: &[u8] = b"test-secret-that-is-at-least-32-bytes";

pub async fn server() -> Router {
    server_with(|_| {}).await
}

pub async fn server_with(tweak: impl FnOnce(&mut Shared)) -> Router {
    let db = db::connect("sqlite::memory:").await.expect("database");
    let mut shared = Shared::new(db, SECRET);
    tweak(&mut shared);
    app(AppState::from(shared))
}

pub async fn call(app: &Router, method: Method, path: &str, token: Option<&str>, body: Option<Value>) -> (StatusCode, Value) {
    let mut request = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let request = match body {
        Some(body) => request.header(header::CONTENT_TYPE, "application/json").body(Body::from(body.to_string())),
        None => request.body(Body::empty()),
    }
    .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

pub async fn post(app: &Router, path: &str, body: Value) -> (StatusCode, Value) {
    call(app, Method::POST, path, None, Some(body)).await
}

pub fn credentials(email: &str, password: &str) -> Value {
    json!({ "email": email, "password": password, "device_name": "Test PC (Windows)" })
}

