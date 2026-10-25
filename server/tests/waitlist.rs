//! The waiting list: signing up puts you on it, and an admin lets you in.

mod common;

use std::sync::{Arc, Mutex};

use axiom_protocol::{route, routes};
use axiom_server::mail::{Email, Mailer};
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};

type Outbox = Arc<Mutex<Vec<Email>>>;

const ADMIN: &str = "boss@example.com";

/// A server with the waiting list on, run by `ADMIN`, whose emails land in the outbox.
async fn server_with_waitlist() -> (Router, Outbox) {
    let outbox = Outbox::default();
    let app = server_with(|s| {
        s.waitlist = true;
        s.admins = [ADMIN.to_owned()].into();
        s.mailer = Mailer::Memory(outbox.clone());
    })
    .await;
    (app, outbox)
}

async fn admin_token(app: &Router) -> String {
    let (status, session) = post(app, routes::SIGN_UP, credentials(ADMIN, "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "admins skip the waiting list: {session}");
    assert_eq!(session["user"]["admin"], true);
    session["access_token"].as_str().unwrap().to_owned()
}

async fn accounts(app: &Router, token: &str) -> Vec<Value> {
    let (status, list) = call(app, Method::GET, routes::ADMIN_ACCOUNTS, Some(token), None).await;
    assert_eq!(status, StatusCode::OK, "{list}");
    list.as_array().unwrap().clone()
}

async fn wait_for_email(outbox: &Outbox, to: &str) -> Email {
    for _ in 0..100 {
        if let Some(email) = outbox.lock().unwrap().iter().find(|e| e.to == to) {
            return email.clone();
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("no email to {to}");
}

#[tokio::test]
async fn signing_up_joins_the_waiting_list_until_an_admin_approves() {
    let (app, outbox) = server_with_waitlist().await;
    let admin = admin_token(&app).await;

    let (status, body) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(body, json!({ "email": "ada@example.com", "confirm_email": false }), "no session while waiting");
    let told = wait_for_email(&outbox, ADMIN).await;
    assert!(told.subject.contains("ada@example.com"), "the admin hears about it");

    // Waiting: the right password says so, a wrong one says nothing more.
    let (status, body) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(body["message"].as_str().unwrap().contains("waiting list"));
    let (status, body) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "wrong horse")).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(!body["message"].as_str().unwrap().contains("waiting"));

    // Signing up again doesn't make a second request.
    let (status, body) = post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(body["message"].as_str().unwrap().contains("waiting list"));

    let list = accounts(&app, &admin).await;
    assert_eq!(list.len(), 2);
    assert_eq!((list[0]["email"].as_str(), &list[0]["approved_at"]), (Some("ada@example.com"), &Value::Null), "waiting first");
    let id = list[0]["id"].as_str().unwrap();

    let (status, _) = call(&app, Method::POST, &route(routes::ADMIN_APPROVE, &[("id", id)]), Some(&admin), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(wait_for_email(&outbox, "ada@example.com").await.subject.contains("ready"));
    let (status, session) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{session}");
    assert_eq!(session["user"]["admin"], false);
}

#[tokio::test]
async fn only_admins_see_the_waiting_list() {
    let (app, _) = server_with_waitlist().await;
    let admin = admin_token(&app).await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let id = accounts(&app, &admin).await[0]["id"].as_str().unwrap().to_owned();
    call(&app, Method::POST, &route(routes::ADMIN_APPROVE, &[("id", &id)]), Some(&admin), None).await;
    let (_, session) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;
    let ada = session["access_token"].as_str().unwrap();

    let (status, _) = call(&app, Method::GET, routes::ADMIN_ACCOUNTS, Some(ada), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = call(&app, Method::POST, &route(routes::ADMIN_APPROVE, &[("id", &id)]), Some(ada), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = call(&app, Method::GET, routes::ADMIN_ACCOUNTS, None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn turning_someone_down_deletes_their_request() {
    let (app, _) = server_with_waitlist().await;
    let admin = admin_token(&app).await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let id = accounts(&app, &admin).await[0]["id"].as_str().unwrap().to_owned();

    let (status, _) = call(&app, Method::DELETE, &route(routes::ADMIN_ACCOUNT, &[("id", &id)]), Some(&admin), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(accounts(&app, &admin).await.len(), 1);
    assert_eq!(post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await.0, StatusCode::ACCEPTED, "they can ask again");

    // An approved account can't be turned down, only have its access taken away.
    let me = accounts(&app, &admin).await.into_iter().find(|a| a["email"] == ADMIN).unwrap();
    let (status, _) = call(&app, Method::DELETE, &route(routes::ADMIN_ACCOUNT, &[("id", me["id"].as_str().unwrap())]), Some(&admin), None).await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn taking_access_away_signs_them_out_everywhere() {
    let (app, _) = server_with_waitlist().await;
    let admin = admin_token(&app).await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    let id = accounts(&app, &admin).await[0]["id"].as_str().unwrap().to_owned();
    call(&app, Method::POST, &route(routes::ADMIN_APPROVE, &[("id", &id)]), Some(&admin), None).await;
    let (_, session) = post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await;

    let (status, _) = call(&app, Method::POST, &route(routes::ADMIN_REVOKE, &[("id", &id)]), Some(&admin), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(&app, Method::GET, routes::ME, session["access_token"].as_str(), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(post(&app, routes::SIGN_IN, credentials("ada@example.com", "correct horse")).await.0, StatusCode::FORBIDDEN);

    let me = accounts(&app, &admin).await.into_iter().find(|a| a["email"] == ADMIN).unwrap();
    let (status, _) = call(&app, Method::POST, &route(routes::ADMIN_REVOKE, &[("id", me["id"].as_str().unwrap())]), Some(&admin), None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "admins can't lock themselves out");
}

#[tokio::test]
async fn resetting_a_password_while_waiting_doesnt_sign_in() {
    let (app, outbox) = server_with_waitlist().await;
    post(&app, routes::SIGN_UP, credentials("ada@example.com", "correct horse")).await;
    post(&app, routes::FORGOT_PASSWORD, json!({ "email": "ada@example.com" })).await;
    let email = wait_for_email(&outbox, "ada@example.com").await;
    let start = email.text.find("Your code is ").unwrap() + "Your code is ".len();
    let code = &email.text[start..start + 9];

    let body = json!({ "email": "ada@example.com", "code": code, "new_password": "new horse!", "device_name": "PC" });
    let (status, body) = post(&app, routes::RESET_PASSWORD, body).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(body["message"].as_str().unwrap().contains("waiting list"));
}

async fn approved_member(app: &Router, admin: &str, email: &str) -> (String, String) {
    post(app, routes::SIGN_UP, credentials(email, "correct horse")).await;
    let id = accounts(app, admin).await.into_iter().find(|a| a["email"] == email).unwrap()["id"].as_str().unwrap().to_owned();
    call(app, Method::POST, &route(routes::ADMIN_APPROVE, &[("id", &id)]), Some(admin), None).await;
    let (_, session) = post(app, routes::SIGN_IN, credentials(email, "correct horse")).await;
    (id, session["access_token"].as_str().unwrap().to_owned())
}

#[tokio::test]
async fn admins_can_make_other_admins_but_owners_stay_owners() {
    let (app, _) = server_with_waitlist().await;
    let owner = admin_token(&app).await;
    let (ada, ada_token) = approved_member(&app, &owner, "ada@example.com").await;
    let list = accounts(&app, &owner).await;
    let me = list.iter().find(|a| a["email"] == ADMIN).unwrap();
    assert_eq!((me["role"].as_str(), list.iter().find(|a| a["id"] == ada.as_str()).unwrap()["role"].as_str()), (Some("owner"), Some("member")));

    let path = route(routes::ADMIN_ACCOUNT, &[("id", &ada)]);
    let (status, changed) = call(&app, Method::PATCH, &path, Some(&owner), Some(json!({ "role": "admin" }))).await;
    assert_eq!((status, changed["role"].as_str()), (StatusCode::OK, Some("admin")));
    // Ada is an admin now: she sees the panel, and can't demote the owner or herself.
    assert_eq!(call(&app, Method::GET, routes::ADMIN_ACCOUNTS, Some(&ada_token), None).await.0, StatusCode::OK);
    let owner_path = route(routes::ADMIN_ACCOUNT, &[("id", me["id"].as_str().unwrap())]);
    assert_eq!(call(&app, Method::PATCH, &owner_path, Some(&ada_token), Some(json!({ "role": "member" }))).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(call(&app, Method::PATCH, &path, Some(&ada_token), Some(json!({ "role": "member" }))).await.0, StatusCode::BAD_REQUEST);
    let (_, me_again) = call(&app, Method::GET, routes::ME, Some(&ada_token), None).await;
    assert_eq!(me_again["admin"], true, "the app learns she's an admin");
}

#[tokio::test]
async fn permissions_switch_features_off() {
    let (app, _) = server_with_waitlist().await;
    let owner = admin_token(&app).await;
    let (ada, ada_token) = approved_member(&app, &owner, "ada@example.com").await;
    let path = route(routes::ADMIN_ACCOUNT, &[("id", &ada)]);
    let (_, changed) = call(&app, Method::PATCH, &path, Some(&owner), Some(json!({ "permissions": ["share"] }))).await;
    assert_eq!(changed["permissions"], json!(["share"]));

    let (status, body) = call(&app, Method::GET, &format!("{}?since=0", routes::SYNC_PULL), Some(&ada_token), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(body["message"].as_str().unwrap().contains("Syncing is switched off"));
    let (status, _) = call(&app, Method::PUT, routes::NOTIFY_EMAILS, Some(&ada_token), Some(json!({ "emails": [] }))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let bad = json!({ "permissions": ["teleport"] });
    assert_eq!(call(&app, Method::PATCH, &path, Some(&owner), Some(bad)).await.0, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn new_accounts_get_the_default_permissions_and_the_waiting_list_can_be_switched_off() {
    let (app, _) = server_with_waitlist().await;
    let owner = admin_token(&app).await;
    let (status, settings) = call(&app, Method::GET, routes::ADMIN_SETTINGS, Some(&owner), None).await;
    assert_eq!((status, settings), (StatusCode::OK, json!({ "waitlist": true, "default_permissions": ["sync", "share", "email", "ai"] })));

    let saved = json!({ "waitlist": false, "default_permissions": ["sync"] });
    assert_eq!(call(&app, Method::PUT, routes::ADMIN_SETTINGS, Some(&owner), Some(saved.clone())).await.1, saved);
    // No waiting now: signing up signs straight in, with only the defaults.
    let (status, _) = post(&app, routes::SIGN_UP, credentials("bob@example.com", "correct horse")).await;
    assert_eq!(status, StatusCode::OK);
    let bob = accounts(&app, &owner).await.into_iter().find(|a| a["email"] == "bob@example.com").unwrap();
    assert_eq!(bob["permissions"], json!(["sync"]));
}
