//! Limits that keep one person (or a stuck app) from spoiling things for
//! others: blocking, the cap on requests waiting for you, the assistant's
//! allowance per account, how often apps may sync, how many devices stay
//! signed in, and how fast anyone moves in Nexus.

mod common;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use axiom_protocol::playground::MAX_INCOMING;
use axiom_protocol::{route, routes};
use axiom_server::limit::Limiter;
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use sea_orm::{ConnectionTrait, DatabaseConnection};
use serde_json::{Value, json};

async fn account(app: &Router, email: &str, handle: &str) -> (String, String) {
    let (status, body) = post(app, routes::SIGN_UP, credentials(email, "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let token = body["access_token"].as_str().unwrap().to_owned();
    let me = json!({ "playground": false, "handle": handle, "global": false, "shared": [], "lemma": { "look": {}, "name": "", "personality": "witty" } });
    let (status, body) = call(app, Method::PUT, routes::PLAYGROUND_ME, Some(&token), Some(me)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    (token, body["player"]["userId"].as_str().unwrap().to_owned())
}

async fn add(app: &Router, token: &str, handle: &str) -> (StatusCode, Value) {
    call(app, Method::POST, routes::PLAYGROUND_FRIENDS, Some(token), Some(json!({ "handle": handle }))).await
}

async fn friends(app: &Router, token: &str) -> Value {
    call(app, Method::GET, routes::PLAYGROUND_FRIENDS, Some(token), None).await.1
}

fn block_path(user_id: &str) -> String {
    route(routes::PLAYGROUND_BLOCK, &[("user_id", user_id)])
}

#[tokio::test]
async fn blocking_drops_requests_and_stops_new_ones_without_telling() {
    let app = server().await;
    let (ada, ada_id) = account(&app, "ada@example.com", "ada").await;
    let (bob, _) = account(&app, "bob@example.com", "bob").await;
    assert_eq!(add(&app, &ada, "bob").await.0, StatusCode::OK);
    assert_eq!(friends(&app, &bob).await["incoming"].as_array().unwrap().len(), 1);

    assert_eq!(call(&app, Method::PUT, &block_path(&ada_id), Some(&bob), None).await.0, StatusCode::NO_CONTENT);
    let theirs = friends(&app, &bob).await;
    assert!(theirs["incoming"].as_array().unwrap().is_empty(), "the request went");
    assert_eq!(theirs["blocked"][0]["handle"], "ada");
    assert!(friends(&app, &ada).await["outgoing"].as_array().unwrap().is_empty());

    let (status, body) = add(&app, &ada, "bob").await;
    assert_eq!(status, StatusCode::NOT_FOUND, "as if bob weren't there");
    assert_eq!(body["message"], "Nobody has that handle.");

    assert_eq!(call(&app, Method::DELETE, &block_path(&ada_id), Some(&bob), None).await.0, StatusCode::NO_CONTENT);
    assert!(friends(&app, &bob).await["blocked"].as_array().unwrap().is_empty());
    assert_eq!(add(&app, &ada, "bob").await.0, StatusCode::OK, "unblocked, ada can ask again");
}

#[tokio::test]
async fn blocked_people_vanish_from_each_other_in_nexus() {
    let app = server().await;
    let (ada, ada_id) = account(&app, "ada@example.com", "ada").await;
    let (bob, bob_id) = account(&app, "bob@example.com", "bob").await;
    let (x, z) = (axiom_protocol::hub::DISTRICTS[0].1, axiom_protocol::hub::DISTRICTS[0].2);
    let here = json!({ "x": x, "z": z });
    call(&app, Method::POST, routes::HUB_ENTER, Some(&ada), Some(here.clone())).await;
    let (_, seen) = call(&app, Method::POST, routes::HUB_ENTER, Some(&bob), Some(here.clone())).await;
    assert_eq!(seen["people"].as_array().unwrap().len(), 1, "bob sees ada");

    call(&app, Method::PUT, &block_path(&bob_id), Some(&ada), None).await;
    let (_, seen) = call(&app, Method::POST, routes::HUB_SYNC, Some(&bob), Some(here.clone())).await;
    assert!(seen["people"].as_array().unwrap().is_empty(), "bob no longer sees ada");
    let (_, seen) = call(&app, Method::POST, routes::HUB_SYNC, Some(&ada), Some(here.clone())).await;
    assert!(seen["people"].as_array().unwrap().is_empty(), "nor ada bob");

    let wave = json!({ "kind": "emote", "id": "wave", "to": ada_id });
    call(&app, Method::POST, routes::HUB_ACT, Some(&bob), Some(wave)).await;
    let (_, seen) = call(&app, Method::POST, routes::HUB_SYNC, Some(&ada), Some(here)).await;
    assert!(seen["events"].as_array().unwrap().is_empty(), "bob's wave doesn't reach ada");
}

#[tokio::test]
async fn the_oldest_waiting_request_goes_past_the_cap() {
    let found = Arc::new(Mutex::new(None::<DatabaseConnection>));
    let keep = found.clone();
    let app = server_with(move |s| *keep.lock().unwrap() = Some(s.db.clone())).await;
    let db = found.lock().unwrap().clone().unwrap();
    let (_, bob_id) = account(&app, "bob@example.com", "bob").await;
    let (ada, _) = account(&app, "ada@example.com", "ada").await;

    // A full list of requests waiting for bob, oldest first.
    for n in 0..MAX_INCOMING {
        let other = format!("fake-{n:04}");
        let (low, high) = if other < bob_id { (other.clone(), bob_id.clone()) } else { (bob_id.clone(), other.clone()) };
        db.execute_unprepared(&format!(
            "INSERT INTO playground_friendships (low, high, requested_by, created_at) VALUES ('{low}', '{high}', '{other}', '2026-01-01T00:{:02}:{:02}+00:00')",
            n / 60,
            n % 60
        ))
        .await
        .unwrap();
    }
    assert_eq!(add(&app, &ada, "bob").await.0, StatusCode::OK);

    let waiting = |filter: &str| format!("SELECT COUNT(*) AS n FROM playground_friendships WHERE (low = '{bob_id}' OR high = '{bob_id}') AND accepted_at IS NULL {filter}");
    let count = |sql: String| {
        let db = db.clone();
        async move { db.query_one_raw(sea_orm::Statement::from_string(db.get_database_backend(), sql)).await.unwrap().unwrap().try_get::<i64>("", "n").unwrap() }
    };
    assert_eq!(count(waiting("")).await, MAX_INCOMING as i64, "still a full list");
    assert_eq!(count(waiting("AND requested_by = 'fake-0000'")).await, 0, "the oldest went");
}

#[tokio::test]
async fn each_account_has_its_own_daily_allowance_on_the_assistant() {
    let answer = || async { axum::Json(json!({ "candidates": [{ "content": { "parts": [{ "text": "Hello!" }] } }] })) };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, Router::new().route("/models/{call}", axum::routing::post(answer))).await });
    let app = server_with(|s| {
        s.ai = axiom_ai::Ai::default().with_urls(&url, "http://127.0.0.1:9");
        s.ai_keys = axiom_ai::Keys { gemini: Some("key".into()), groq: None };
        s.ai_account_daily_limit = Some(2);
    })
    .await;
    let chat = json!({ "system": "You are Axiom's assistant.", "messages": [{ "role": "user", "text": "Hi" }] });
    let (ada, _) = account(&app, "ada@example.com", "ada").await;
    let (bob, _) = account(&app, "bob@example.com", "bob").await;

    for _ in 0..2 {
        assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&ada), Some(chat.clone())).await.0, StatusCode::OK);
    }
    let (status, body) = call(&app, Method::POST, routes::AI_CHAT, Some(&ada), Some(chat.clone())).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS, "{body}");
    assert_eq!(call(&app, Method::POST, routes::AI_CHAT, Some(&bob), Some(chat)).await.0, StatusCode::OK, "bob's allowance is his own");
}

#[tokio::test]
async fn an_app_stuck_syncing_in_a_loop_is_slowed_down() {
    let app = server_with(|s| s.limits.sync_calls = Limiter::new(3, Duration::from_secs(60))).await;
    let (ada, _) = account(&app, "ada@example.com", "ada").await;
    for _ in 0..3 {
        assert_eq!(call(&app, Method::GET, routes::SYNC_PULL, Some(&ada), None).await.0, StatusCode::OK);
    }
    assert_eq!(call(&app, Method::GET, routes::SYNC_PULL, Some(&ada), None).await.0, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn only_the_most_recent_devices_stay_signed_in() {
    let max = axiom_server::auth::MAX_DEVICES;
    let app = server().await;
    let (first, _) = account(&app, "ada@example.com", "ada").await;
    let mut latest = String::new();
    for _ in 0..max {
        let (status, body) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        latest = body["access_token"].as_str().unwrap().to_owned();
    }
    let (_, devices) = call(&app, Method::GET, routes::DEVICES, Some(&latest), None).await;
    assert_eq!(devices.as_array().unwrap().len(), max);
    assert_eq!(call(&app, Method::GET, routes::DEVICES, Some(&first), None).await.0, StatusCode::UNAUTHORIZED, "the oldest was signed out");
}

#[tokio::test]
async fn nobody_moves_faster_than_running_in_nexus() {
    let app = server().await;
    let (ada, _) = account(&app, "ada@example.com", "ada").await;
    let (bob, _) = account(&app, "bob@example.com", "bob").await;
    let (x, z) = (axiom_protocol::hub::DISTRICTS[0].1, axiom_protocol::hub::DISTRICTS[0].2);
    call(&app, Method::POST, routes::HUB_ENTER, Some(&ada), Some(json!({ "x": x, "z": z }))).await;
    call(&app, Method::POST, routes::HUB_ENTER, Some(&bob), Some(json!({ "x": x, "z": z }))).await;

    // Ada claims to cover 100 m at once.
    call(&app, Method::POST, routes::HUB_SYNC, Some(&ada), Some(json!({ "x": x + 100.0, "z": z }))).await;
    let (_, seen) = call(&app, Method::POST, routes::HUB_SYNC, Some(&bob), Some(json!({ "x": x, "z": z }))).await;
    let ada_x = seen["people"][0]["x"].as_f64().unwrap() as f32;
    assert!(ada_x - x < 20.0, "slowed to running pace, at {} m", ada_x - x);
}
