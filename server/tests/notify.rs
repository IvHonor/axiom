//! Notification emails: the app plans them, the server sends them when due.

mod common;

use std::sync::{Arc, Mutex};

use axiom_protocol::routes;
use axiom_server::mail::{Email, Mailer};
use axiom_server::{AppState, Shared, app, db, notify};
use axum::Router;
use axum::http::{Method, StatusCode};
use chrono::{Duration, Utc};
use common::*;
use serde_json::{Value, json};

type Outbox = Arc<Mutex<Vec<Email>>>;

async fn setup() -> (Router, AppState, Outbox, String) {
    let outbox = Outbox::default();
    let mut shared = Shared::new(db::connect("sqlite::memory:").await.unwrap(), SECRET);
    shared.mailer = Mailer::Memory(outbox.clone());
    shared.public_url = "https://axiom.example".into();
    let state = AppState::from(shared);
    let app = app(state.clone());
    let (_, session) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    (app, state, outbox, session["access_token"].as_str().unwrap().to_owned())
}

fn lectures(key: &str, send_at: chrono::DateTime<Utc>) -> Value {
    json!({
        "key": key,
        "send_at": send_at,
        "digest": {
            "kind": "uni.today",
            "day": "2026-10-27",
            "lectures": [{ "title": "Lecture 5", "module": "COMP1001", "color": "blue", "day": "2026-10-27", "recorded": true }],
            "behind": 2
        }
    })
}

async fn plan(app: &Router, token: &str, emails: Vec<Value>) -> (StatusCode, Value) {
    call(app, Method::PUT, routes::NOTIFY_EMAILS, Some(token), Some(json!({ "emails": emails }))).await
}

#[tokio::test]
async fn planned_emails_go_out_once_when_due() {
    let (app, state, outbox, token) = setup().await;
    let now = Utc::now();
    let (status, body) = plan(&app, &token, vec![lectures("uni.today:due", now - Duration::minutes(1)), lectures("uni.today:later", now + Duration::hours(3))]).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, json!({ "unsubscribed": [] }));

    assert_eq!(notify::send_due(&state).await.unwrap(), 1, "only the one that's due");
    let sent = outbox.lock().unwrap().clone();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].to, "ada@example.com");
    assert_eq!(sent[0].subject, "1 lecture today");
    assert!(sent[0].html.contains("COMP1001") && sent[0].html.contains("2 lectures</b> to catch up on"));
    assert!(sent[0].unsubscribe.as_deref().unwrap().starts_with("https://axiom.example/v1/notifications/unsubscribe?token="));

    // Planning it again doesn't send it again.
    plan(&app, &token, vec![lectures("uni.today:due", now - Duration::minutes(1))]).await;
    assert_eq!(notify::send_due(&state).await.unwrap(), 0);
}

#[tokio::test]
async fn a_new_plan_replaces_the_old_one() {
    let (app, state, outbox, token) = setup().await;
    let now = Utc::now();
    plan(&app, &token, vec![lectures("a", now - Duration::minutes(1)), lectures("b", now - Duration::minutes(1))]).await;
    plan(&app, &token, vec![lectures("b", now - Duration::minutes(1))]).await;
    assert_eq!(notify::send_due(&state).await.unwrap(), 1, "a was dropped");
    plan(&app, &token, vec![]).await;
    assert_eq!(outbox.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn late_emails_still_go_within_six_hours() {
    let (app, state, outbox, token) = setup().await;
    plan(&app, &token, vec![lectures("late", Utc::now() - Duration::hours(5) - Duration::minutes(59))]).await;
    // The server slept through it until now: still sent, within six hours.
    assert_eq!(notify::send_due(&state).await.unwrap(), 1);
    assert_eq!(outbox.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn plans_are_checked() {
    let (app, _, _, token) = setup().await;
    let now = Utc::now();
    let streak = json!({ "key": "s", "send_at": now, "digest": { "kind": "reading.streak", "day": "2026-10-27", "streak": 3, "book": null } });
    assert_eq!(plan(&app, &token, vec![streak]).await.0, StatusCode::BAD_REQUEST, "streaks aren't emailed");
    assert_eq!(plan(&app, &token, vec![lectures("far", now + Duration::days(30))]).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(plan(&app, &token, vec![lectures("x", now), lectures("x", now)]).await.0, StatusCode::BAD_REQUEST, "keys are unique");
    assert_eq!(call(&app, Method::PUT, routes::NOTIFY_EMAILS, None, Some(json!({ "emails": [] }))).await.0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn the_unsubscribe_link_stops_that_kind_until_switched_back_on() {
    let (app, state, outbox, token) = setup().await;
    let now = Utc::now();
    plan(&app, &token, vec![lectures("one", now - Duration::minutes(1))]).await;
    notify::send_due(&state).await.unwrap();
    let link = outbox.lock().unwrap()[0].unsubscribe.clone().unwrap();
    let path = link.strip_prefix("https://axiom.example").unwrap();

    let (status, _) = call(&app, Method::POST, path, None, None).await;
    assert_eq!(status, StatusCode::OK, "one-click from the mail app");
    let (_, body) = plan(&app, &token, vec![lectures("two", now - Duration::minutes(1))]).await;
    assert_eq!(body["unsubscribed"][0]["kind"], "uni.today", "the app hears about it");
    assert_eq!(notify::send_due(&state).await.unwrap(), 0, "and nothing more is sent");

    let body = json!({ "emails": [lectures("three", now - Duration::minutes(1))], "resubscribe": ["uni.today"] });
    let (_, result) = call(&app, Method::PUT, routes::NOTIFY_EMAILS, Some(&token), Some(body)).await;
    assert_eq!(result, json!({ "unsubscribed": [] }));
    assert_eq!(notify::send_due(&state).await.unwrap(), 1);

    let (status, _) = call(&app, Method::GET, &format!("{}?token=forged", routes::NOTIFY_UNSUBSCRIBE), None, None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
