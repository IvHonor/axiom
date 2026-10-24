//! What the website uses: the web-updates list, and its visitors' addresses for rate limits.

mod common;

use axiom_protocol::routes;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::*;
use serde_json::json;
use tower::ServiceExt;

const PROXY_SECRET: &str = "website-secret-that-is-at-least-32-chars";

#[tokio::test]
async fn joining_the_web_updates_list_answers_the_same_every_time() {
    let app = server().await;
    let body = || Some(json!({ "email": " Ada@Example.com " }));
    let (first, _) = call(&app, Method::POST, routes::WEB_UPDATES, None, body()).await;
    let (again, _) = call(&app, Method::POST, routes::WEB_UPDATES, None, body()).await;
    assert_eq!((first, again), (StatusCode::NO_CONTENT, StatusCode::NO_CONTENT));

    let (bad, error) = call(&app, Method::POST, routes::WEB_UPDATES, None, Some(json!({ "email": "not an email" }))).await;
    assert_eq!(bad, StatusCode::BAD_REQUEST, "{error}");
}

async fn rate_limited_as(app: &axum::Router, headers: &[(&str, &str)]) -> String {
    let mut request = Request::builder().method(Method::GET).uri(routes::CLIENT_IP);
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    let response = app.clone().oneshot(request.header(header::ACCEPT, "application/json").body(Body::empty()).unwrap()).await.unwrap();
    let bytes = http_body_util::BodyExt::collect(response.into_body()).await.unwrap().to_bytes();
    let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    value["rate_limited_as"].as_str().unwrap().to_owned()
}

#[tokio::test]
async fn only_the_website_with_the_secret_can_name_the_visitors_address() {
    let app = server_with(|s| s.web_proxy_secret = Some(PROXY_SECRET.into())).await;

    let trusted = rate_limited_as(&app, &[("x-axiom-proxy", PROXY_SECRET), ("x-axiom-client-ip", "203.0.113.7")]).await;
    assert_eq!(trusted, "203.0.113.7");

    let forged = rate_limited_as(&app, &[("x-axiom-proxy", "a guess"), ("x-axiom-client-ip", "203.0.113.7")]).await;
    assert_ne!(forged, "203.0.113.7");

    // Without a secret configured, the header means nothing.
    let plain = server().await;
    let ignored = rate_limited_as(&plain, &[("x-axiom-proxy", PROXY_SECRET), ("x-axiom-client-ip", "203.0.113.7")]).await;
    assert_ne!(ignored, "203.0.113.7");
}

#[tokio::test]
async fn deleting_an_account_takes_it_off_the_web_updates_list() {
    let app = server().await;
    let (_, session) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let token = session["access_token"].as_str().unwrap().to_owned();
    call(&app, Method::POST, routes::WEB_UPDATES, None, Some(json!({ "email": "ada@example.com" }))).await;

    let (status, body) = call(&app, Method::DELETE, routes::ACCOUNT, Some(&token), Some(json!({ "password": "correct horse" }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
}
