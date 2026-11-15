//! The Hub, live: entering needs a handle; you see who's in your room only;
//! waves and hi's reach who they're aimed at; only known phrases and emotes;
//! quiet people are logged off; peeking doesn't put you in.

mod common;

use std::time::Duration;

use axiom_protocol::routes;
use axiom_server::hub::Hub;
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};

async fn account(app: &Router, email: &str, handle: Option<&str>) -> String {
    let (status, body) = post(app, routes::SIGN_UP, credentials(email, "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let token = body["access_token"].as_str().unwrap().to_owned();
    if let Some(handle) = handle {
        let me = json!({ "playground": false, "handle": handle, "global": false, "shared": [], "lemma": { "look": {}, "name": "", "personality": "witty" } });
        let (status, body) = call(app, Method::PUT, routes::PLAYGROUND_ME, Some(&token), Some(me)).await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }
    token
}

async fn hub(app: &Router, token: &str, path: &str, body: Value) -> (StatusCode, Value) {
    call(app, Method::POST, path, Some(token), Some(body)).await
}

fn at(room: &str) -> Value {
    json!({ "room": room, "x": 0.5, "y": 0.5 })
}

fn handles(state: &Value) -> Vec<String> {
    let mut h: Vec<String> = state["people"].as_array().unwrap().iter().map(|p| p["player"]["handle"].as_str().unwrap().to_owned()).collect();
    h.sort();
    h
}

#[tokio::test]
async fn people_see_who_is_in_their_room_and_nobody_else() {
    let app = server().await;
    let nohandle = account(&app, "x@example.com", None).await;
    assert_eq!(hub(&app, &nohandle, routes::HUB_ENTER, at("plaza")).await.0, StatusCode::NOT_FOUND, "a handle first");

    let ada = account(&app, "ada@example.com", Some("ada")).await;
    let bob = account(&app, "bob@example.com", Some("bob")).await;
    let cyd = account(&app, "cyd@example.com", Some("cyd")).await;
    hub(&app, &ada, routes::HUB_ENTER, at("plaza")).await;
    hub(&app, &bob, routes::HUB_ENTER, at("plaza")).await;
    let (status, state) = hub(&app, &cyd, routes::HUB_ENTER, at("library")).await;
    assert_eq!(status, StatusCode::OK, "{state}");
    assert_eq!(state["online"], 3);
    assert!(handles(&state).is_empty(), "alone in the library");

    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, json!({ "room": "plaza", "x": 0.2, "y": 0.8 })).await;
    assert_eq!(handles(&state), ["bob"]);
    let plaza = state["rooms"].as_array().unwrap().iter().find(|r| r["id"] == "plaza").unwrap()["count"].clone();
    assert_eq!(plaza, 2);
    assert!(state["people"][0]["player"].get("email").is_none(), "never emails");

    // Bob walks into the library: Ada no longer sees him, Cyd does, where he is.
    hub(&app, &bob, routes::HUB_SYNC, json!({ "room": "library", "x": 0.9, "y": 0.1 })).await;
    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, at("plaza")).await;
    assert!(handles(&state).is_empty());
    let (_, state) = hub(&app, &cyd, routes::HUB_SYNC, at("library")).await;
    assert_eq!(handles(&state), ["bob"]);
    assert!((state["people"][0]["x"].as_f64().unwrap() - 0.9).abs() < 1e-4);

    // Leaving is immediate.
    assert_eq!(hub(&app, &bob, routes::HUB_LEAVE, json!({})).await.0, StatusCode::NO_CONTENT);
    let (_, state) = hub(&app, &cyd, routes::HUB_SYNC, at("library")).await;
    assert!(handles(&state).is_empty());
    assert_eq!(hub(&app, &bob, routes::HUB_SYNC, at("library")).await.0, StatusCode::CONFLICT, "gone until he enters again");
    assert_eq!(hub(&app, &ada, routes::HUB_SYNC, json!({ "room": "moon", "x": 0.5, "y": 0.5 })).await.0, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn waves_and_phrases_reach_who_they_are_for() {
    let app = server().await;
    let ada = account(&app, "ada@example.com", Some("ada")).await;
    let bob = account(&app, "bob@example.com", Some("bob")).await;
    let (_, state) = hub(&app, &ada, routes::HUB_ENTER, at("arcade")).await;
    assert_eq!(state["room"], "arcade");
    let (_, state) = hub(&app, &bob, routes::HUB_ENTER, at("arcade")).await;
    let ada_id = state["people"][0]["player"]["userId"].as_str().unwrap().to_owned();

    // Free text isn't a thing: only known phrases and emotes.
    let (status, _) = hub(&app, &bob, routes::HUB_ACT, json!({ "kind": "phrase", "id": "anything I like" })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(hub(&app, &bob, routes::HUB_ACT, json!({ "kind": "emote", "id": "moonwalk" })).await.0, StatusCode::BAD_REQUEST);

    let (status, _) = hub(&app, &bob, routes::HUB_ACT, json!({ "kind": "phrase", "id": "hi", "to": ada_id })).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, at("arcade")).await;
    assert_eq!(state["events"][0]["from"]["handle"], "bob");
    assert_eq!(state["events"][0]["item"], "hi");
    assert_eq!(state["people"][0]["shown"]["id"], "hi", "the room sees him say it");
    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, at("arcade")).await;
    assert_eq!(state["events"].as_array().unwrap().len(), 0, "told once");

    // Bob's picture is visible to Ada while he's in the Hub, though they aren't friends.
    let bob_id = state["people"][0]["player"]["userId"].as_str().unwrap().to_owned();
    let path = axiom_protocol::route(routes::PLAYGROUND_AVATAR, &[("user_id", &bob_id)]);
    assert_eq!(call(&app, Method::GET, &path, Some(&ada), None).await.0, StatusCode::OK);
    hub(&app, &bob, routes::HUB_LEAVE, json!({})).await;
    assert_eq!(call(&app, Method::GET, &path, Some(&ada), None).await.0, StatusCode::NOT_FOUND, "not once he's left");
}

#[tokio::test]
async fn quiet_people_are_logged_off_and_peeking_does_not_enter() {
    let app = server_with(|s| s.hub = Hub::with_timeout(Duration::from_millis(150))).await;
    let ada = account(&app, "ada@example.com", Some("ada")).await;
    let bob = account(&app, "bob@example.com", Some("bob")).await;
    hub(&app, &ada, routes::HUB_ENTER, at("plaza")).await;
    let (status, peek) = call(&app, Method::GET, routes::HUB_PEEK, Some(&bob), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!((peek["online"].as_u64(), peek["plaza"][0]["player"]["handle"].as_str()), (Some(1), Some("ada")));

    tokio::time::sleep(Duration::from_millis(250)).await;
    let (_, peek) = call(&app, Method::GET, routes::HUB_PEEK, Some(&bob), None).await;
    assert_eq!(peek["online"], 0, "Ada's app went quiet: logged off");
    assert_eq!(hub(&app, &ada, routes::HUB_SYNC, at("plaza")).await.0, StatusCode::CONFLICT);
}
