//! Nexus, live: entering needs a handle; you see only who's near you, nearest
//! first; waves and hi's reach who they're aimed at; only known phrases and
//! emotes; quiet people are logged off; peeking doesn't put you in.

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

fn at(x: f32, z: f32) -> Value {
    json!({ "x": x, "z": z })
}

/// The middle of a district.
fn heart(id: &str) -> Value {
    let (_, x, z, _) = axiom_protocol::hub::DISTRICTS.iter().find(|d| d.0 == id).unwrap();
    at(*x, *z)
}

fn count(state: &Value, district: &str) -> u64 {
    state["districts"].as_array().unwrap().iter().find(|d| d["id"] == district).unwrap()["count"].as_u64().unwrap()
}

fn handles(state: &Value) -> Vec<String> {
    let mut h: Vec<String> = state["people"].as_array().unwrap().iter().map(|p| p["player"]["handle"].as_str().unwrap().to_owned()).collect();
    h.sort();
    h
}

#[tokio::test]
async fn people_see_who_is_near_them_and_nobody_else() {
    let app = server().await;
    let nohandle = account(&app, "x@example.com", None).await;
    assert_eq!(hub(&app, &nohandle, routes::HUB_ENTER, heart("nexus")).await.0, StatusCode::NOT_FOUND, "a handle first");

    let ada = account(&app, "ada@example.com", Some("ada")).await;
    let bob = account(&app, "bob@example.com", Some("bob")).await;
    let cyd = account(&app, "cyd@example.com", Some("cyd")).await;
    hub(&app, &ada, routes::HUB_ENTER, at(0.0, 30.0)).await;
    hub(&app, &bob, routes::HUB_ENTER, at(10.0, 20.0)).await;
    // Memory and Computation are 290 m apart: too far to see each other.
    hub(&app, &cyd, routes::HUB_ENTER, at(-145.0, -78.0)).await;
    let (status, state) = hub(&app, &cyd, routes::HUB_SYNC, at(-200.0, -60.0)).await;
    assert_eq!(status, StatusCode::OK, "{state}");
    assert_eq!(state["online"], 3);
    assert!(handles(&state).is_empty(), "nobody near Cyd in the Memory District");
    assert_eq!(count(&state, "memory"), 1);
    assert_eq!(count(&state, "nexus"), 2);

    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, at(0.0, 31.0)).await;
    assert_eq!(handles(&state), ["bob"]);
    assert!((state["people"][0]["z"].as_f64().unwrap() - 20.0).abs() < 1e-4, "where he is");
    assert!(state["people"][0]["player"].get("email").is_none(), "never emails");

    // Bob walks up to the Memory District: Cyd sees him; Ada, at the Nexus, still does (it's next door).
    hub(&app, &bob, routes::HUB_SYNC, at(-120.0, -60.0)).await;
    let (_, state) = hub(&app, &cyd, routes::HUB_SYNC, at(-200.0, -60.0)).await;
    assert_eq!(handles(&state), ["bob"]);
    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, at(0.0, 31.0)).await;
    assert_eq!(handles(&state), ["bob"]);
    // On to the far side of Computation from Memory: Cyd loses him.
    hub(&app, &bob, routes::HUB_SYNC, at(170.0, -78.0)).await;
    let (_, state) = hub(&app, &cyd, routes::HUB_SYNC, at(-200.0, -60.0)).await;
    assert!(handles(&state).is_empty());

    // Leaving is immediate.
    assert_eq!(hub(&app, &bob, routes::HUB_LEAVE, json!({})).await.0, StatusCode::NO_CONTENT);
    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, at(0.0, 31.0)).await;
    assert!(handles(&state).is_empty());
    assert_eq!(hub(&app, &bob, routes::HUB_SYNC, at(0.0, 0.0)).await.0, StatusCode::CONFLICT, "gone until he enters again");
    assert_eq!(hub(&app, &ada, routes::HUB_SYNC, at(5000.0, 0.0)).await.0, StatusCode::BAD_REQUEST, "off the map");
}

#[tokio::test]
async fn a_crowd_sends_only_the_nearest() {
    // Lots of sign-ups from one place: let them through.
    let app = server_with(|s| s.limits.per_ip = axiom_server::limit::Limiter::new(1000, Duration::from_secs(60))).await;
    let me = account(&app, "mia@example.com", Some("mia")).await;
    hub(&app, &me, routes::HUB_ENTER, at(0.0, 0.0)).await;
    let total = axiom_protocol::hub::MAX_SEEN + 5;
    for i in 0..total {
        let token = account(&app, &format!("p{i}@example.com"), Some(&format!("person{i}"))).await;
        hub(&app, &token, routes::HUB_ENTER, at(0.0, 1.0 + i as f32)).await;
    }
    let (_, state) = hub(&app, &me, routes::HUB_SYNC, at(0.0, 0.0)).await;
    let people = state["people"].as_array().unwrap();
    assert_eq!(people.len(), axiom_protocol::hub::MAX_SEEN);
    assert_eq!(people[0]["player"]["handle"], "person0", "nearest first");
    assert_eq!(state["online"].as_u64().unwrap() as usize, total + 1);
}

#[tokio::test]
async fn waves_and_phrases_reach_who_they_are_for() {
    let app = server().await;
    let ada = account(&app, "ada@example.com", Some("ada")).await;
    let bob = account(&app, "bob@example.com", Some("bob")).await;
    hub(&app, &ada, routes::HUB_ENTER, heart("simulation")).await;
    let (_, state) = hub(&app, &bob, routes::HUB_ENTER, heart("simulation")).await;
    let ada_id = state["people"][0]["player"]["userId"].as_str().unwrap().to_owned();

    // Free text isn't a thing: only known phrases and emotes.
    let (status, _) = hub(&app, &bob, routes::HUB_ACT, json!({ "kind": "phrase", "id": "anything I like" })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(hub(&app, &bob, routes::HUB_ACT, json!({ "kind": "emote", "id": "moonwalk" })).await.0, StatusCode::BAD_REQUEST);

    let (status, _) = hub(&app, &bob, routes::HUB_ACT, json!({ "kind": "phrase", "id": "hi", "to": ada_id })).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, heart("simulation")).await;
    assert_eq!(state["events"][0]["from"]["handle"], "bob");
    assert_eq!(state["events"][0]["item"], "hi");
    assert_eq!(state["people"][0]["shown"]["id"], "hi", "everyone near sees him say it");
    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, heart("simulation")).await;
    assert_eq!(state["events"].as_array().unwrap().len(), 0, "told once");

    // Bob's picture is visible to Ada while he's in Nexus, though they aren't friends.
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
    hub(&app, &ada, routes::HUB_ENTER, heart("nexus")).await;
    let (status, peek) = call(&app, Method::GET, routes::HUB_PEEK, Some(&bob), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!((peek["online"].as_u64(), peek["nexus"][0]["player"]["handle"].as_str()), (Some(1), Some("ada")));

    tokio::time::sleep(Duration::from_millis(250)).await;
    let (_, peek) = call(&app, Method::GET, routes::HUB_PEEK, Some(&bob), None).await;
    assert_eq!(peek["online"], 0, "Ada's app went quiet: logged off");
    assert_eq!(hub(&app, &ada, routes::HUB_SYNC, heart("nexus")).await.0, StatusCode::CONFLICT);
}

#[tokio::test]
async fn inside_a_building_you_see_only_who_is_in_there_with_you() {
    let app = server().await;
    let ada = account(&app, "ada@example.com", Some("ada")).await;
    let bob = account(&app, "bob@example.com", Some("bob")).await;
    let cyd = account(&app, "cyd@example.com", Some("cyd")).await;
    // All three by the Great Library's door; then Ada and Bob go in.
    for token in [&ada, &bob, &cyd] {
        hub(&app, token, routes::HUB_ENTER, at(-150.0, -78.0)).await;
    }
    let inside = |x: f32, z: f32| json!({ "x": x, "z": z, "inside": "library" });
    hub(&app, &ada, routes::HUB_SYNC, inside(0.0, 17.0)).await;
    let (status, state) = hub(&app, &bob, routes::HUB_SYNC, inside(-20.0, -10.0)).await;
    assert_eq!(status, StatusCode::OK, "{state}");
    assert_eq!(handles(&state), ["ada"], "only Ada, though Cyd's just outside");
    assert_eq!(count(&state, "memory"), 3, "everyone's in the Memory District, in or out");
    let (_, state) = hub(&app, &cyd, routes::HUB_SYNC, at(-150.0, -78.0)).await;
    assert!(handles(&state).is_empty(), "nobody outside with Cyd");
    // A wave from outside doesn't reach in.
    let ada_id = {
        let (_, state) = hub(&app, &bob, routes::HUB_SYNC, inside(-20.0, -10.0)).await;
        state["people"][0]["player"]["userId"].as_str().unwrap().to_owned()
    };
    hub(&app, &cyd, routes::HUB_ACT, json!({ "kind": "emote", "id": "wave", "to": ada_id })).await;
    let (_, state) = hub(&app, &ada, routes::HUB_SYNC, inside(0.0, 17.0)).await;
    assert_eq!(state["events"].as_array().unwrap().len(), 0);
    // Nowhere that isn't a building, and nowhere outside its walls.
    assert_eq!(hub(&app, &ada, routes::HUB_SYNC, json!({ "x": 0.0, "z": 0.0, "inside": "kitchen" })).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(hub(&app, &ada, routes::HUB_SYNC, inside(100.0, 0.0)).await.0, StatusCode::BAD_REQUEST);
}
