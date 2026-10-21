//! Password reset, devices, changing the password and deleting the account.

mod common;

use std::sync::{Arc, Mutex};

use axiom_protocol::routes;
use axiom_server::mail::{Email, Mailer};
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};

type Outbox = Arc<Mutex<Vec<Email>>>;

async fn server_with_mail() -> (Router, Outbox) {
    let outbox = Outbox::default();
    let app = server_with(|s| s.mailer = Mailer::Memory(outbox.clone())).await;
    (app, outbox)
}

async fn sign_up(app: &Router) -> Value {
    let (status, session) = post(app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::OK);
    session
}

fn token(session: &Value) -> &str {
    session["access_token"].as_str().unwrap()
}

/// The code from the latest email, waiting briefly since emails send in the background.
async fn emailed_code(outbox: &Outbox) -> String {
    for _ in 0..100 {
        if let Some(email) = outbox.lock().unwrap().last() {
            let start = email.text.find("Your code is ").unwrap() + "Your code is ".len();
            return email.text[start..start + 9].to_owned();
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("no email was sent");
}

fn reset(code: &str, new_password: &str) -> Value {
    json!({ "email": "ada@example.com", "code": code, "new_password": new_password, "device_name": "Laptop" })
}

#[tokio::test]
async fn a_forgotten_password_is_reset_with_an_emailed_code() {
    let (app, outbox) = server_with_mail().await;
    let old_device = sign_up(&app).await;

    let (status, _) = post(&app, routes::FORGOT_PASSWORD, json!({ "email": "ADA@example.com" })).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let code = emailed_code(&outbox).await;
    assert_eq!(outbox.lock().unwrap()[0].to, "ada@example.com");
    assert!(code.len() == 9 && code.as_bytes()[4] == b'-', "shown as XXXX-XXXX: {code}");

    // Typed sloppily: lowercase, no dash.
    let (status, session) = post(&app, routes::RESET_PASSWORD, reset(&code.to_lowercase().replace('-', " "), "new horse!")).await;
    assert_eq!(status, StatusCode::OK, "{session}");
    assert_eq!(session["user"]["email"], "ada@example.com", "and this device is signed in");

    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "new horse!")).await.0, StatusCode::OK);
    let (status, _) = call(&app, Method::GET, routes::ME, Some(token(&old_device)), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "every old device is signed out");

    let (status, _) = post(&app, routes::RESET_PASSWORD, reset(&code, "third horse")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "a code works once");
}

#[tokio::test]
async fn unknown_emails_get_the_same_answer_and_no_email() {
    let (app, outbox) = server_with_mail().await;
    let (status, _) = post(&app, routes::FORGOT_PASSWORD, json!({ "email": "nobody@example.com" })).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert!(outbox.lock().unwrap().is_empty());
}

#[tokio::test]
async fn wrong_codes_run_out() {
    let (app, outbox) = server_with_mail().await;
    sign_up(&app).await;
    post(&app, routes::FORGOT_PASSWORD, json!({ "email": "ada@example.com" })).await;
    let code = emailed_code(&outbox).await;

    for _ in 0..5 {
        let (status, body) = post(&app, routes::RESET_PASSWORD, reset("AAAA-AAAA", "new horse!")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["message"].as_str().unwrap().contains("isn't right"));
    }
    let (status, body) = post(&app, routes::RESET_PASSWORD, reset(&code, "new horse!")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "even the right code is refused now");
    assert!(body["message"].as_str().unwrap().contains("Ask for a new one"));
}

#[tokio::test]
async fn reset_emails_are_limited_per_address() {
    let (app, _) = server_with_mail().await;
    sign_up(&app).await;
    for _ in 0..3 {
        assert_eq!(post(&app, routes::FORGOT_PASSWORD, json!({ "email": "ada@example.com" })).await.0, StatusCode::NO_CONTENT);
    }
    assert_eq!(post(&app, routes::FORGOT_PASSWORD, json!({ "email": "ada@example.com" })).await.0, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn devices_are_listed_and_can_be_signed_out() {
    let app = server().await;
    let laptop = sign_up(&app).await;
    let desktop = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await.1;

    let (status, devices) = call(&app, Method::GET, routes::DEVICES, Some(token(&laptop)), None).await;
    assert_eq!(status, StatusCode::OK);
    let devices = devices.as_array().unwrap().clone();
    assert_eq!(devices.len(), 2);
    let me = devices.iter().find(|d| d["current"] == true).unwrap();
    assert_eq!(me["name"], "Test PC (Windows)");
    let other = devices.iter().find(|d| d["current"] == false).unwrap();

    let path = routes::DEVICE.replace("{id}", other["id"].as_str().unwrap());
    let (status, _) = call(&app, Method::DELETE, &path, Some(token(&laptop)), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(call(&app, Method::GET, routes::ME, Some(token(&desktop)), None).await.0, StatusCode::UNAUTHORIZED);
    let (_, devices) = call(&app, Method::GET, routes::DEVICES, Some(token(&laptop)), None).await;
    assert_eq!(devices.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn nobody_can_sign_out_someone_elses_device() {
    let app = server().await;
    let ada = sign_up(&app).await;
    let (_, bob) = post(&app, routes::SIGN_UP, credentials("bob@example.com", "correct horse")).await;
    let (_, ada_devices) = call(&app, Method::GET, routes::DEVICES, Some(token(&ada)), None).await;

    let path = routes::DEVICE.replace("{id}", ada_devices[0]["id"].as_str().unwrap());
    call(&app, Method::DELETE, &path, Some(token(&bob)), None).await;
    assert_eq!(call(&app, Method::GET, routes::ME, Some(token(&ada)), None).await.0, StatusCode::OK);
}

#[tokio::test]
async fn changing_the_password_signs_other_devices_out() {
    let app = server().await;
    let laptop = sign_up(&app).await;
    let desktop = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await.1;
    let change = |current: &str| json!({ "current_password": current, "new_password": "new horse!" });

    let (status, body) = call(&app, Method::POST, routes::CHANGE_PASSWORD, Some(token(&laptop)), Some(change("wrong"))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["message"], "That password isn't right.");

    let (status, _) = call(&app, Method::POST, routes::CHANGE_PASSWORD, Some(token(&laptop)), Some(change("correct horse"))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(call(&app, Method::GET, routes::ME, Some(token(&laptop)), None).await.0, StatusCode::OK, "this device stays in");
    assert_eq!(call(&app, Method::GET, routes::ME, Some(token(&desktop)), None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "new horse!")).await.0, StatusCode::OK);
}

#[tokio::test]
async fn deleting_the_account_removes_it_and_its_synced_data() {
    let app = server().await;
    let ada = sign_up(&app).await;
    let changes = json!({ "changes": [{ "table": "project_board_tasks", "id": "t1", "fields": { "title": "Secret" }, "changed_at": 1 }] });
    call(&app, Method::POST, routes::SYNC_PUSH, Some(token(&ada)), Some(changes)).await;

    let (status, _) = call(&app, Method::DELETE, routes::ACCOUNT, Some(token(&ada)), Some(json!({ "password": "wrong" }))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = call(&app, Method::DELETE, routes::ACCOUNT, Some(token(&ada)), Some(json!({ "password": "correct horse" }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    assert_eq!(call(&app, Method::GET, routes::ME, Some(token(&ada)), None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await.0, StatusCode::UNAUTHORIZED);

    // The email is free again, and a new account starts empty.
    let fresh = sign_up(&app).await;
    let (_, pulled) = call(&app, Method::GET, routes::SYNC_PULL, Some(token(&fresh)), None).await;
    assert_eq!(pulled["records"], json!([]));
}
