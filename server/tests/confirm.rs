//! Confirming an address with an emailed code, and unlock codes for the app lock.

mod common;

use std::sync::{Arc, Mutex};

use axiom_protocol::routes;
use axiom_server::mail::{Email, Mailer};
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};

type Outbox = Arc<Mutex<Vec<Email>>>;

async fn confirming(waitlist: bool) -> (Router, Outbox) {
    let outbox = Outbox::default();
    let app = server_with(|s| {
        s.mailer = Mailer::Memory(outbox.clone());
        s.confirm_emails = true;
        s.waitlist = waitlist;
        s.admins = ["owner@example.com".to_owned()].into();
    })
    .await;
    (app, outbox)
}

/// The code from the `n`th email (from 1), waiting briefly since emails send in the background.
async fn nth_code(outbox: &Outbox, n: usize) -> (String, String) {
    for _ in 0..100 {
        if let Some(email) = outbox.lock().unwrap().get(n - 1) {
            let start = email.text.find("Your code is ").unwrap() + "Your code is ".len();
            return (email.to.clone(), email.text[start..start + 9].to_owned());
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("email {n} was never sent");
}

fn confirm(email: &str, code: &str) -> Value {
    json!({ "email": email, "code": code })
}

#[tokio::test]
async fn a_new_account_signs_in_only_after_confirming_its_address() {
    let (app, outbox) = confirming(false).await;

    let (status, body) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    assert_eq!(body, json!({ "email": "ada@example.com", "confirm_email": true }));
    assert_eq!(nth_code(&outbox, 1).await.0, "ada@example.com");

    // Not before confirming: signing in asks for the code again (and sends a new one).
    let (status, body) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;
    assert_eq!((status, body["confirm_email"].clone()), (StatusCode::ACCEPTED, json!(true)));
    let (_, code) = nth_code(&outbox, 2).await;

    assert_eq!(post(&app, routes::CONFIRM_EMAIL, confirm("ada@example.com", "AAAA-AAAA")).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(post(&app, routes::CONFIRM_EMAIL, confirm("ada@example.com", &code.to_lowercase())).await.0, StatusCode::NO_CONTENT);
    // A code works once, and a confirmed account answers like a wrong code.
    assert_eq!(post(&app, routes::CONFIRM_EMAIL, confirm("ada@example.com", &code)).await.0, StatusCode::BAD_REQUEST);

    let (status, session) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{session}");
    assert!(session["access_token"].is_string());
}

#[tokio::test]
async fn nobody_can_hold_an_unconfirmed_address() {
    let (app, outbox) = confirming(false).await;
    // Someone signs up with Bob's address, but can't confirm it.
    post(&app, routes::SIGN_UP, credentials("bob@example.com", "eve's password")).await;
    // Bob signs up anyway, gets his own code, and the old password stops working.
    let (status, _) = post(&app, routes::SIGN_UP, credentials("bob@example.com", "bob's password")).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let (_, code) = nth_code(&outbox, 2).await;
    assert_eq!(post(&app, routes::CONFIRM_EMAIL, confirm("bob@example.com", &code)).await.0, StatusCode::NO_CONTENT);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("bob@example.com", "eve's password")).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("bob@example.com", "bob's password")).await.0, StatusCode::OK);
    // Once confirmed, the address is taken.
    assert_eq!(post(&app, routes::SIGN_UP, credentials("bob@example.com", "eve's password")).await.0, StatusCode::CONFLICT);
}

#[tokio::test]
async fn admins_hear_about_a_waiting_account_once_it_is_confirmed() {
    let (app, outbox) = confirming(true).await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let (_, code) = nth_code(&outbox, 1).await;
    assert_eq!(outbox.lock().unwrap().len(), 1, "no admin email yet");
    post(&app, routes::CONFIRM_EMAIL, confirm("ada@example.com", &code)).await;
    for _ in 0..100 {
        if outbox.lock().unwrap().len() > 1 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    assert_eq!(outbox.lock().unwrap()[1].to, "owner@example.com");
    // Confirmed, but still waiting.
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn new_confirmation_codes_answer_alike_and_are_limited() {
    let (app, outbox) = confirming(false).await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let send = |email: &str| json!({ "email": email });
    assert_eq!(post(&app, routes::SEND_CONFIRMATION, send("ada@example.com")).await.0, StatusCode::NO_CONTENT);
    assert_eq!(post(&app, routes::SEND_CONFIRMATION, send("nobody@example.com")).await.0, StatusCode::NO_CONTENT);
    let (_, code) = nth_code(&outbox, 2).await;
    assert_eq!(outbox.lock().unwrap().len(), 2, "nothing sent for an unknown address");
    assert_eq!(post(&app, routes::CONFIRM_EMAIL, confirm("ada@example.com", &code)).await.0, StatusCode::NO_CONTENT);

    for _ in 0..3 {
        post(&app, routes::SEND_CONFIRMATION, send("ada@example.com")).await;
    }
    assert_eq!(post(&app, routes::SEND_CONFIRMATION, send("ada@example.com")).await.0, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn a_password_reset_confirms_the_address() {
    let (app, outbox) = confirming(false).await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    post(&app, routes::FORGOT_PASSWORD, json!({ "email": "ada@example.com" })).await;
    let (_, code) = nth_code(&outbox, 2).await;
    let reset = json!({ "email": "ada@example.com", "code": code, "new_password": "new horse!", "device_name": "Laptop" });
    assert_eq!(post(&app, routes::RESET_PASSWORD, reset).await.0, StatusCode::OK);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "new horse!")).await.0, StatusCode::OK);
}

#[tokio::test]
async fn an_unlock_code_goes_to_the_account_and_works_once() {
    let outbox = Outbox::default();
    let app = server_with(|s| s.mailer = Mailer::Memory(outbox.clone())).await;
    let (_, session) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let token = session["access_token"].as_str().unwrap();

    assert_eq!(call(&app, Method::POST, routes::APP_LOCK_CODE, None, None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(call(&app, Method::POST, routes::APP_LOCK_CODE, Some(token), None).await.0, StatusCode::NO_CONTENT);
    let (to, code) = nth_code(&outbox, 1).await;
    assert_eq!(to, "ada@example.com");

    let check = |code: &str| Some(json!({ "code": code }));
    assert_eq!(call(&app, Method::POST, routes::APP_LOCK_CHECK, Some(token), check("AAAA-AAAA")).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(call(&app, Method::POST, routes::APP_LOCK_CHECK, Some(token), check(&code)).await.0, StatusCode::NO_CONTENT);
    assert_eq!(call(&app, Method::POST, routes::APP_LOCK_CHECK, Some(token), check(&code)).await.0, StatusCode::BAD_REQUEST);
}
