//! The account API end to end: real routes, real hashing, an in-memory database.

mod common;

use axiom_protocol::routes;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::json;

#[tokio::test]
async fn sign_up_sign_in_and_me() {
    let app = server().await;

    let (status, session) = post(&app, routes::SIGN_UP, credentials(" Ada@Example.com ", "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{session}");
    assert_eq!(session["user"]["email"], "ada@example.com", "emails are normalised");
    assert_eq!(session["expires_in"], 900);

    let (status, me) = call(&app, Method::GET, routes::ME, session["access_token"].as_str(), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["id"], session["user"]["id"]);

    let (status, again) = post(&app, routes::SIGN_IN, credentials("ADA@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{again}");
    assert_eq!(again["user"]["id"], session["user"]["id"]);
    assert_ne!(again["refresh_token"], session["refresh_token"], "each device gets its own session");
}

#[tokio::test]
async fn sign_up_rejects_bad_input_and_taken_emails() {
    let app = server().await;

    let (status, body) = post(&app, routes::SIGN_UP, credentials("not-an-email", "correct horse")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "Enter a valid email address.");

    let (status, body) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "short")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["message"].as_str().unwrap().contains("at least 8"));

    assert_eq!(post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await.0, StatusCode::OK);
    let (status, body) = post(&app, routes::SIGN_UP, credentials("ADA@example.com", "another one")).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(body["message"].as_str().unwrap().contains("already exists"));
}

#[tokio::test]
async fn wrong_password_and_unknown_email_look_the_same() {
    let app = server().await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;

    let wrong = post(&app, routes::SIGN_IN, credentials("ada@example.com", "wrong horse")).await;
    let unknown = post(&app, routes::SIGN_IN, credentials("bob@example.com", "correct horse")).await;
    assert_eq!(wrong.0, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong, unknown);
}

#[tokio::test]
async fn signing_up_needs_the_current_terms_agreed_to() {
    let app = server_with(|s| s.require_terms = true).await;
    let with = |terms: Option<&str>| {
        let mut body = credentials("ada@example.com", "correct horse");
        if let Some(terms) = terms {
            body["accepted_terms"] = json!(terms);
        }
        body
    };
    let (status, body) = post(&app, routes::SIGN_UP, with(None)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["message"].as_str().unwrap().contains("update Axiom"), "older apps are told why");
    assert_eq!(post(&app, routes::SIGN_UP, with(Some("2001-01-01"))).await.0, StatusCode::BAD_REQUEST, "an old version doesn't count");
    assert_eq!(post(&app, routes::SIGN_UP, with(Some(axiom_protocol::TERMS_VERSION))).await.0, StatusCode::OK);
}

#[tokio::test]
async fn a_password_from_before_login_keys_is_swapped_for_one() {
    let app = server().await;
    let key = |c: &str| format!("{}{}", axiom_protocol::LOGIN_KEY_PREFIX, c.repeat(43));
    // Made by an older Axiom, which sent the password itself.
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;

    // A login key can't match that, so the device is asked for the password.
    let (status, _) = post(&app, routes::SIGN_IN, credentials("ada@example.com", &key("a"))).await;
    assert_eq!(status.as_u16(), axiom_protocol::PLAIN_PASSWORD);
    // Unknown emails don't say so.
    assert_eq!(post(&app, routes::SIGN_IN, credentials("bob@example.com", &key("a"))).await.0, StatusCode::UNAUTHORIZED);

    // The password, with the key to replace it.
    let mut both = credentials("ada@example.com", "correct horse");
    both["login_key"] = json!(key("a"));
    assert_eq!(post(&app, routes::SIGN_IN, both).await.0, StatusCode::OK);

    // From then on only the key works, and a wrong key is just wrong.
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", &key("a"))).await.0, StatusCode::OK);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", &key("b"))).await.0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn refresh_rotates_the_token() {
    let app = server().await;
    let (_, first) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;

    let (status, second) = post(&app, routes::REFRESH, json!({ "refresh_token": first["refresh_token"] })).await;
    assert_eq!(status, StatusCode::OK, "{second}");
    assert_ne!(second["refresh_token"], first["refresh_token"]);
    assert_eq!(call(&app, Method::GET, routes::ME, second["access_token"].as_str(), None).await.0, StatusCode::OK);

    // A retry with the old token straight away (a lost response) still works.
    let (status, retry) = post(&app, routes::REFRESH, json!({ "refresh_token": first["refresh_token"] })).await;
    assert_eq!(status, StatusCode::OK, "{retry}");

    let (status, _) = post(&app, routes::REFRESH, json!({ "refresh_token": "made-up" })).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn reusing_an_old_refresh_token_ends_the_session() {
    let app = server_with(|s| s.reuse_grace = chrono::Duration::zero()).await;
    let (_, first) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let (_, second) = post(&app, routes::REFRESH, json!({ "refresh_token": first["refresh_token"] })).await;

    // Someone replays the first token: the whole session ends.
    let (status, _) = post(&app, routes::REFRESH, json!({ "refresh_token": first["refresh_token"] })).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _) = post(&app, routes::REFRESH, json!({ "refresh_token": second["refresh_token"] })).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "the real device is signed out too");
    let (status, _) = call(&app, Method::GET, routes::ME, second["access_token"].as_str(), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn sign_out_ends_only_that_device() {
    let app = server().await;
    let (_, laptop) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let (_, desktop) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;

    let (status, _) = post(&app, routes::SIGN_OUT, json!({ "refresh_token": laptop["refresh_token"] })).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    assert_eq!(call(&app, Method::GET, routes::ME, laptop["access_token"].as_str(), None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(post(&app, routes::REFRESH, json!({ "refresh_token": laptop["refresh_token"] })).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(call(&app, Method::GET, routes::ME, desktop["access_token"].as_str(), None).await.0, StatusCode::OK);

    // Signing out twice is fine.
    assert_eq!(post(&app, routes::SIGN_OUT, json!({ "refresh_token": laptop["refresh_token"] })).await.0, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn me_needs_a_valid_token() {
    let app = server().await;
    assert_eq!(call(&app, Method::GET, routes::ME, None, None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(call(&app, Method::GET, routes::ME, Some("forged"), None).await.0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn too_many_wrong_passwords_locks_the_account_for_a_while() {
    let app = server().await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;

    for _ in 0..10 {
        assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "guess")).await.0, StatusCode::UNAUTHORIZED);
    }
    // Even the right password is refused until the window passes.
    let (status, body) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["message"].as_str().unwrap().contains("Try again"));
}
