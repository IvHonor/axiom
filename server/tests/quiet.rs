//! Apps check in every minute, and the server answers what it can from
//! memory (see `src/cache.rs`) so the database can sleep. These make sure a
//! remembered answer never hides a change: each warms the memory first, then
//! changes something, then checks the change is seen at once.

mod common;

use axiom_protocol::routes;
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};

async fn token_of(app: &Router, path: &str, email: &str) -> String {
    let (status, body) = post(app, path, credentials(email, "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["access_token"].as_str().unwrap().into()
}

async fn pull(app: &Router, token: &str, since: i64) -> (StatusCode, Value) {
    call(app, Method::GET, &format!("{}?since={since}", routes::SYNC_PULL), Some(token), None).await
}

#[tokio::test]
async fn a_device_that_is_up_to_date_still_sees_the_next_change() {
    let app = server().await;
    let laptop = token_of(&app, routes::SIGN_UP, "ada@example.com").await;
    let desktop = token_of(&app, routes::SIGN_IN, "ada@example.com").await;

    // The desktop checks in: nothing yet (and that answer is remembered).
    assert_eq!(pull(&app, &desktop, 0).await.1["records"], json!([]));
    assert_eq!(pull(&app, &desktop, 0).await.1["records"], json!([]));

    let change = json!({ "table": "project_board_tasks", "id": "t1", "fields": { "id": "t1", "title": "Write report" }, "changed_at": 1000 });
    let (status, _) = call(&app, Method::POST, routes::SYNC_PUSH, Some(&laptop), Some(json!({ "changes": [change] }))).await;
    assert_eq!(status, StatusCode::OK);

    let (status, pulled) = pull(&app, &desktop, 0).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(pulled["records"][0]["id"], "t1", "{pulled}");
    assert_eq!(pulled["cursor"], 1);
    // Caught up again.
    assert_eq!(pull(&app, &desktop, 1).await.1["records"], json!([]));
}

#[tokio::test]
async fn a_device_signed_out_is_refused_at_once_even_after_checking_in() {
    let app = server().await;
    let laptop = token_of(&app, routes::SIGN_UP, "ada@example.com").await;
    let desktop = token_of(&app, routes::SIGN_IN, "ada@example.com").await;
    // The desktop has been checking in, so its session is remembered.
    assert_eq!(pull(&app, &desktop, 0).await.0, StatusCode::OK);
    assert_eq!(call(&app, Method::GET, routes::ME, Some(&desktop), None).await.0, StatusCode::OK);

    let (_, devices) = call(&app, Method::GET, routes::DEVICES, Some(&laptop), None).await;
    let other = devices.as_array().unwrap().iter().find(|d| d["current"] == false).unwrap().clone();
    let path = routes::DEVICE.replace("{id}", other["id"].as_str().unwrap());
    assert_eq!(call(&app, Method::DELETE, &path, Some(&laptop), None).await.0, StatusCode::NO_CONTENT);

    assert_eq!(pull(&app, &desktop, 0).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(call(&app, Method::GET, routes::ME, Some(&desktop), None).await.0, StatusCode::UNAUTHORIZED);
    // The device that did it carries on.
    assert_eq!(pull(&app, &laptop, 0).await.0, StatusCode::OK);
}

#[tokio::test]
async fn a_new_password_signs_out_devices_that_were_checking_in() {
    let app = server().await;
    let laptop = token_of(&app, routes::SIGN_UP, "ada@example.com").await;
    let desktop = token_of(&app, routes::SIGN_IN, "ada@example.com").await;
    assert_eq!(pull(&app, &desktop, 0).await.0, StatusCode::OK);

    let body = json!({ "current_password": "correct horse", "new_password": "battery staple" });
    let (status, answer) = call(&app, Method::POST, routes::CHANGE_PASSWORD, Some(&laptop), Some(body)).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{answer}");

    assert_eq!(pull(&app, &desktop, 0).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(pull(&app, &laptop, 0).await.0, StatusCode::OK);
}

#[tokio::test]
async fn switching_sync_off_takes_effect_at_once() {
    let app = server_with(|s| {
        s.admins.insert("ada@example.com".into());
    })
    .await;
    let ada = token_of(&app, routes::SIGN_UP, "ada@example.com").await;
    let bob = token_of(&app, routes::SIGN_UP, "bob@example.com").await;
    // Bob's account (with its permissions) is remembered from checking in.
    assert_eq!(pull(&app, &bob, 0).await.0, StatusCode::OK);

    let (_, accounts) = call(&app, Method::GET, routes::ADMIN_ACCOUNTS, Some(&ada), None).await;
    let bob_id = accounts.as_array().unwrap().iter().find(|a| a["email"] == "bob@example.com").unwrap()["id"].as_str().unwrap().to_owned();
    let path = routes::ADMIN_ACCOUNT.replace("{id}", &bob_id);
    let (status, answer) = call(&app, Method::PATCH, &path, Some(&ada), Some(json!({ "permissions": [] }))).await;
    assert_eq!(status, StatusCode::OK, "{answer}");

    assert_eq!(pull(&app, &bob, 0).await.0, StatusCode::FORBIDDEN);
}
