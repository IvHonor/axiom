//! Sync end to end: two "devices" signed in to one account push and pull.

mod common;

use axiom_protocol::routes;
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};

/// Signs up and returns an access token, plus a second one for another device.
async fn two_devices(app: &Router) -> (String, String) {
    let (_, a) = post(app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let (_, b) = post(app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;
    (a["access_token"].as_str().unwrap().into(), b["access_token"].as_str().unwrap().into())
}

async fn push(app: &Router, token: &str, changes: Value) -> (StatusCode, Value) {
    call(app, Method::POST, routes::SYNC_PUSH, Some(token), Some(json!({ "changes": changes }))).await
}

async fn pull(app: &Router, token: &str, since: i64) -> Value {
    let (status, body) = call(app, Method::GET, &format!("{}?since={since}", routes::SYNC_PULL), Some(token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

fn change(id: &str, fields: Value, changed_at: i64) -> Value {
    json!({ "table": "project_board_tasks", "id": id, "fields": fields, "changed_at": changed_at })
}

#[tokio::test]
async fn a_change_pushed_by_one_device_reaches_the_other() {
    let app = server().await;
    let (laptop, desktop) = two_devices(&app).await;

    let (status, body) = push(&app, &laptop, json!([change("t1", json!({ "id": "t1", "title": "Write report" }), 1000)])).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["seq"], 1);

    let pulled = pull(&app, &desktop, 0).await;
    assert_eq!(pulled["records"][0]["data"], json!({ "id": "t1", "title": "Write report" }));
    assert_eq!(pulled["cursor"], 1);
    assert_eq!(pulled["more"], false);

    // Nothing new after the cursor.
    assert_eq!(pull(&app, &desktop, 1).await["records"], json!([]));
}

#[tokio::test]
async fn edits_to_different_fields_both_survive() {
    let app = server().await;
    let (laptop, desktop) = two_devices(&app).await;
    push(&app, &laptop, json!([change("t1", json!({ "id": "t1", "title": "Draft", "priority": 0 }), 1000)])).await;

    // Offline at the same time: the laptop renames, the desktop raises priority.
    push(&app, &laptop, json!([change("t1", json!({ "title": "Final" }), 2000)])).await;
    push(&app, &desktop, json!([change("t1", json!({ "priority": 3 }), 1500)])).await;
    // A stale title from long ago loses to the newer one.
    push(&app, &desktop, json!([change("t1", json!({ "title": "Old" }), 1200)])).await;

    let records = pull(&app, &laptop, 0).await["records"].clone();
    assert_eq!(records.as_array().unwrap().len(), 1, "one row, at its latest sequence number");
    assert_eq!(records[0]["data"], json!({ "id": "t1", "title": "Final", "priority": 3 }));
    assert_eq!(records[0]["seq"], 4, "even a push that lost gets a new number, so its device pulls the winner");
}

#[tokio::test]
async fn one_push_can_change_a_row_twice() {
    let app = server().await;
    let (laptop, _) = two_devices(&app).await;
    push(
        &app,
        &laptop,
        json!([change("t1", json!({ "id": "t1", "title": "A" }), 1000), change("t1", json!({ "color": "red" }), 1001)]),
    )
    .await;
    assert_eq!(pull(&app, &laptop, 0).await["records"][0]["data"], json!({ "id": "t1", "title": "A", "color": "red" }));
}

#[tokio::test]
async fn accounts_never_see_each_others_data() {
    let app = server().await;
    let (ada, _) = two_devices(&app).await;
    let (_, bob) = post(&app, routes::SIGN_UP, credentials("bob@example.com", "correct horse")).await;
    let bob = bob["access_token"].as_str().unwrap();

    push(&app, &ada, json!([change("t1", json!({ "title": "Ada's" }), 1000)])).await;
    push(&app, bob, json!([change("t1", json!({ "title": "Bob's" }), 1000)])).await;

    assert_eq!(pull(&app, &ada, 0).await["records"][0]["data"]["title"], "Ada's");
    assert_eq!(pull(&app, bob, 0).await["records"][0]["data"]["title"], "Bob's");
    assert_eq!(pull(&app, bob, 0).await["records"][0]["seq"], 1, "each account counts on its own");
}

#[tokio::test]
async fn pulls_come_in_pages() {
    let app = server().await;
    let (laptop, desktop) = two_devices(&app).await;
    let changes: Vec<Value> = (0..axiom_protocol::SYNC_BATCH + 20).map(|i| change(&format!("t{i}"), json!({ "n": i }), 1000)).collect();
    // Pushes are capped too, so send two batches.
    let (first, rest) = changes.split_at(axiom_protocol::SYNC_BATCH);
    assert_eq!(push(&app, &laptop, json!(first)).await.0, StatusCode::OK);
    assert_eq!(push(&app, &laptop, json!(rest)).await.0, StatusCode::OK);

    let page = pull(&app, &desktop, 0).await;
    assert_eq!(page["records"].as_array().unwrap().len(), axiom_protocol::SYNC_BATCH);
    assert_eq!(page["more"], true);
    let page = pull(&app, &desktop, page["cursor"].as_i64().unwrap()).await;
    assert_eq!(page["records"].as_array().unwrap().len(), 20);
    assert_eq!(page["more"], false);
}

#[tokio::test]
async fn sync_needs_a_signed_in_device_and_plain_names() {
    let app = server().await;
    let (status, _) = call(&app, Method::GET, routes::SYNC_PULL, None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (laptop, _) = two_devices(&app).await;
    let bad = json!([{ "table": "tasks; DROP TABLE users", "id": "t1", "fields": {}, "changed_at": 1 }]);
    assert_eq!(push(&app, &laptop, bad).await.0, StatusCode::BAD_REQUEST);
    // A row's own id field must name the row it's filed under.
    let mismatched = json!([change("t1", json!({ "id": "t2", "title": "Elsewhere" }), 1)]);
    assert_eq!(push(&app, &laptop, mismatched).await.0, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn oversized_items_are_refused() {
    let app = server().await;
    let (laptop, _) = two_devices(&app).await;
    let huge = "x".repeat(axiom_server::sync::MAX_RECORD_BYTES + 1);
    let (status, body) = push(&app, &laptop, json!([change("t1", json!({ "description": huge }), 1)])).await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(body["message"].as_str().unwrap().contains("too large"));
}
