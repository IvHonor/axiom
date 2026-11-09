//! Security regressions exercise the public API against an isolated database.
mod common;

use axiom_protocol::routes;
use axiom_server::{cache::Cache, mail::{Email, Mailer}};
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};
use std::sync::{Arc, Barrier, Mutex, atomic::{AtomicU64, Ordering}};

type Outbox = Arc<Mutex<Vec<Email>>>;

async fn latest_code(outbox: &Outbox, count: usize) -> String {
    for _ in 0..100 {
        if let Some(email) = outbox.lock().unwrap().get(count - 1) {
            let start = email.text.find("Your code is ").unwrap() + "Your code is ".len();
            return email.text[start..start + 9].to_owned();
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("confirmation email was not sent");
}

#[tokio::test]
async fn only_email_confirmation_can_replace_unconfirmed_credentials() {
    for exhaust_limit in [false, true] {
        let outbox = Outbox::default();
        let app = server_with(|s| {
            s.confirm_emails = true;
            s.waitlist = true;
            s.admins.insert("owner@example.invalid".into());
            s.mailer = Mailer::Memory(outbox.clone());
        }).await;
        let email = "owner@example.invalid";
        assert_eq!(post(&app, routes::SIGN_UP, credentials(email, "owner's password")).await.0, StatusCode::ACCEPTED);
        let count = if exhaust_limit { 5 } else { 2 };
        if exhaust_limit {
            for _ in 0..4 {
                assert_eq!(post(&app, routes::SEND_CONFIRMATION, json!({"email":email})).await.0, StatusCode::NO_CONTENT);
            }
        }
        let (status, _) = post(&app, routes::SIGN_UP, credentials(email, "attacker's password")).await;
        assert_eq!(status, if exhaust_limit { StatusCode::TOO_MANY_REQUESTS } else { StatusCode::ACCEPTED });
        // Even an accepted repeat registration cannot install its password.
        assert_eq!(post(&app, routes::SIGN_IN, credentials(email, "attacker's password")).await.0, StatusCode::UNAUTHORIZED);
        let code = latest_code(&outbox, count).await;
        let confirmed = json!({"email":email,"code":code,"password":"owner's chosen password"});
        assert_eq!(post(&app, routes::CONFIRM_EMAIL, confirmed).await.0, StatusCode::NO_CONTENT);
        let (status, session) = post(&app, routes::SIGN_IN, credentials(email, "owner's chosen password")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(session["user"]["admin"], true);
        assert_eq!(post(&app, routes::SIGN_IN, credentials(email, "attacker's password")).await.0, StatusCode::UNAUTHORIZED);
    }
}

#[tokio::test]
async fn confirmation_requires_the_mailbox_owners_chosen_credentials() {
    let outbox = Outbox::default();
    let app = server_with(|s| {s.confirm_emails = true; s.mailer = Mailer::Memory(outbox.clone());}).await;
    post(&app, routes::SIGN_UP, credentials("ada@example.invalid", "untrusted signup password")).await;
    let code = latest_code(&outbox, 1).await;
    let body = json!({"email":"ada@example.invalid","code":code});
    assert_eq!(post(&app, routes::CONFIRM_EMAIL, body.clone()).await.0, StatusCode::BAD_REQUEST);
    let mut body = body;
    body["password"] = json!("mailbox owner's password");
    assert_eq!(post(&app, routes::CONFIRM_EMAIL, body).await.0, StatusCode::NO_CONTENT);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.invalid", "mailbox owner's password")).await.0, StatusCode::OK);
}

#[tokio::test]
async fn wrong_confirmation_codes_count_towards_the_limit() {
    // Each wrong try must stick, even though confirming runs in a transaction.
    let outbox = Outbox::default();
    let app = server_with(|s| {s.confirm_emails = true; s.mailer = Mailer::Memory(outbox.clone());}).await;
    let email = "guess@example.invalid";
    post(&app, routes::SIGN_UP, credentials(email, "untrusted signup password")).await;
    let code = latest_code(&outbox, 1).await;
    for _ in 0..5 {
        let wrong = json!({"email":email,"code":"AAAA-AAAA","password":"owner's password"});
        assert_eq!(post(&app, routes::CONFIRM_EMAIL, wrong).await.0, StatusCode::BAD_REQUEST);
    }
    let right = json!({"email":email,"code":code,"password":"owner's password"});
    let (status, body) = post(&app, routes::CONFIRM_EMAIL, right).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "five wrong tries use the code up: {body}");
    assert_ne!(post(&app, routes::SIGN_IN, credentials(email, "owner's password")).await.0, StatusCode::OK, "still unconfirmed");
}

#[tokio::test]
async fn a_password_reset_code_cannot_be_consumed_twice_concurrently() {
    let outbox = Outbox::default();
    let app = server_with(|s| s.mailer = Mailer::Memory(outbox.clone())).await;
    let email = "reset@example.invalid";
    post(&app, routes::SIGN_UP, credentials(email, "original password")).await;
    post(&app, routes::FORGOT_PASSWORD, json!({"email":email})).await;
    let code = latest_code(&outbox, 1).await;
    let first = json!({"email":email,"code":code,"new_password":"first new password","device_name":"First"});
    let second = json!({"email":email,"code":code,"new_password":"second new password","device_name":"Second"});
    let (first, second) = tokio::join!(post(&app, routes::RESET_PASSWORD, first), post(&app, routes::RESET_PASSWORD, second));
    assert_eq!([first.0, second.0].iter().filter(|s| **s == StatusCode::OK).count(), 1, "a reset code must grant exactly one reset");
}

#[tokio::test]
async fn concurrent_code_requests_leave_only_one_live_code() {
    for unlock in [false, true] {
        let outbox = Outbox::default();
        let app = server_with(|s| s.mailer = Mailer::Memory(outbox.clone())).await;
        let email = "codes@example.invalid";
        let (_, session) = post(&app, routes::SIGN_UP, credentials(email, "original password")).await;
        let token = session["access_token"].as_str().unwrap();
        if unlock {
            let (a, b) = tokio::join!(call(&app, Method::POST, routes::APP_LOCK_CODE, Some(token), None), call(&app, Method::POST, routes::APP_LOCK_CODE, Some(token), None));
            assert_eq!((a.0, b.0), (StatusCode::NO_CONTENT, StatusCode::NO_CONTENT));
        } else {
            let (a, b) = tokio::join!(post(&app, routes::FORGOT_PASSWORD, json!({"email":email})), post(&app, routes::FORGOT_PASSWORD, json!({"email":email})));
            assert_eq!((a.0, b.0), (StatusCode::NO_CONTENT, StatusCode::NO_CONTENT));
        }
        let mut accepted = 0;
        for index in [1, 2] {
            let code = latest_code(&outbox, index).await;
            let status = if unlock {
                call(&app, Method::POST, routes::APP_LOCK_CHECK, Some(token), Some(json!({"code":code}))).await.0
            } else {
                post(&app, routes::RESET_PASSWORD, json!({"email":email,"code":code,"new_password":"chosen password","device_name":"Test"})).await.0
            };
            accepted += usize::from(status.is_success());
        }
        assert_eq!(accepted, 1, "issuing a new code must invalidate every earlier code");
    }
}

async fn sync_target(shared: bool) -> (axum::Router, String, String, String) {
    let app = server().await;
    let (_, session) = post(&app, routes::SIGN_UP, credentials("storage@example.invalid", "fixture password")).await;
    let token = session["access_token"].as_str().unwrap().to_owned();
    if shared {
        assert_eq!(call(&app, Method::POST, routes::SPACES, Some(&token), Some(json!({"id":"security-board"}))).await.0, StatusCode::OK);
    }
    let push = if shared { routes::SPACE_PUSH.replace("{id}", "security-board") } else { routes::SYNC_PUSH.into() };
    let pull = if shared { routes::SPACE_PULL.replace("{id}", "security-board") } else { routes::SYNC_PULL.into() };
    (app, token, push, pull)
}

fn change(id: &str, fields: Value, at: i64) -> Value {
    json!({"table":"project_board_tasks","id":id,"fields":fields,"changed_at":at})
}

#[tokio::test]
async fn merged_record_limits_apply_across_pushes_and_roll_back_the_batch() {
    for shared in [false, true] {
        let (app, token, push, pull) = sync_target(shared).await;
        let first = json!({"changes":[change("r1",json!({"part_a":"a".repeat(40_000)}),1)]});
        assert_eq!(call(&app, Method::POST, &push, Some(&token), Some(first)).await.0, StatusCode::OK);
        let too_big = json!({"changes":[change("r2",json!({"title":"Must roll back"}),2),change("r1",json!({"part_b":"b".repeat(40_000)}),2)]});
        assert_eq!(call(&app, Method::POST, &push, Some(&token), Some(too_big)).await.0, StatusCode::PAYLOAD_TOO_LARGE);
        let (status, page) = call(&app, Method::GET, &pull, Some(&token), None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(page["records"].as_array().unwrap().len(), 1);
        assert_eq!(page["cursor"], 1);
        assert!(page["records"][0]["data"].get("part_b").is_none());
        let duplicate = json!({"changes":[change("r3",json!({"part_a":"a".repeat(40_000)}),3),change("r3",json!({"part_b":"b".repeat(40_000)}),3)]});
        assert_eq!(call(&app, Method::POST, &push, Some(&token), Some(duplicate)).await.0, StatusCode::PAYLOAD_TOO_LARGE);
    }
}

#[tokio::test]
async fn sync_rejects_timestamps_that_would_permanently_freeze_shared_fields() {
    for shared in [false, true] {
        let (app, token, push, _) = sync_target(shared).await;
        for at in [-1, i64::MAX] {
            let body = json!({"changes":[change("r1",json!({"title":"Cannot be overwritten"}),at)]});
            assert_eq!(call(&app, Method::POST, &push, Some(&token), Some(body)).await.0, StatusCode::BAD_REQUEST);
        }
    }
}

#[test]
fn racing_cache_insertion_never_restores_a_revoked_session() {
    let cache = Cache::default();
    let start = Barrier::new(3);
    let end = Barrier::new(3);
    let generation = AtomicU64::new(0);
    let rounds = 10_000;
    let mut stale = 0;
    std::thread::scope(|scope| {
        scope.spawn(|| {for _ in 0..rounds {start.wait(); cache.keep_session(generation.load(Ordering::SeqCst), "sid", "user"); end.wait();}});
        scope.spawn(|| {for _ in 0..rounds {start.wait(); cache.forget_user("user"); end.wait();}});
        for _ in 0..rounds {
            cache.forget_user("user");
            generation.store(cache.generation(), Ordering::SeqCst);
            start.wait(); end.wait();
            stale += usize::from(cache.session("sid").is_some());
        }
    });
    assert_eq!(stale, 0, "revoked sessions must stay revoked");
}
