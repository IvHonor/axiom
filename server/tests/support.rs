//! Messages to support: emailed to the inbox and listed for admins.

mod common;

use std::sync::{Arc, Mutex};

use axiom_protocol::{route, routes};
use axiom_server::mail::{Email, Mailer};
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};

type Outbox = Arc<Mutex<Vec<Email>>>;

const ADMIN: &str = "owner@example.com";

async fn support_server() -> (Router, Outbox) {
    let outbox = Outbox::default();
    let app = server_with(|s| {
        s.mailer = Mailer::Memory(outbox.clone());
        s.admins = [ADMIN.to_owned()].into();
        s.contact_email = Some("support@example.com".into());
    })
    .await;
    (app, outbox)
}

async fn token(app: &Router, email: &str) -> String {
    let (_, session) = post(app, routes::SIGN_UP, credentials(email, "correct horse")).await;
    session["access_token"].as_str().unwrap().to_owned()
}

fn ticket(email: Option<&str>) -> Value {
    json!({ "kind": "bug", "subject": "Sync stuck", "message": "It says <b>syncing</b> forever.", "email": email, "app_version": "0.5.1" })
}

async fn emails(outbox: &Outbox, count: usize) -> Vec<Email> {
    for _ in 0..100 {
        if outbox.lock().unwrap().len() >= count {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    outbox.lock().unwrap().clone()
}

#[tokio::test]
async fn a_signed_in_message_reaches_the_inbox_and_gets_a_receipt() {
    let (app, outbox) = support_server().await;
    let ada = token(&app, "ada@example.com").await;

    // Signed in, the account's address is used, whatever's typed.
    let (status, sent) = call(&app, Method::POST, routes::SUPPORT, Some(&ada), Some(ticket(Some("someone@else.com")))).await;
    assert_eq!(status, StatusCode::OK, "{sent}");
    let reference = sent["reference"].as_str().unwrap();
    assert_eq!(reference.len(), 8);

    let sent = emails(&outbox, 2).await;
    let inbox = sent.iter().find(|e| e.to == "support@example.com").unwrap();
    assert_eq!(inbox.reply_to.as_deref(), Some("ada@example.com"), "replying answers them");
    assert!(inbox.subject.contains(reference) && inbox.subject.contains("Sync stuck"));
    assert!(inbox.html.contains("&lt;b&gt;syncing&lt;/b&gt;"), "their text is escaped");
    let receipt = sent.iter().find(|e| e.to == "ada@example.com").unwrap();
    assert!(receipt.text.contains(reference));
}

#[tokio::test]
async fn without_an_account_an_address_is_needed_and_no_receipt_goes_out() {
    let (app, outbox) = support_server().await;
    assert_eq!(post(&app, routes::SUPPORT, ticket(None)).await.0, StatusCode::BAD_REQUEST);
    let (status, _) = post(&app, routes::SUPPORT, ticket(Some("Bob@Example.com"))).await;
    assert_eq!(status, StatusCode::OK);
    let sent = emails(&outbox, 1).await;
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(outbox.lock().unwrap().len(), 1, "only the inbox: no mail to an unconfirmed address");
    assert_eq!(sent[0].reply_to.as_deref(), Some("bob@example.com"));

    let mut bad = ticket(Some("bob@example.com"));
    bad["kind"] = json!("spam");
    assert_eq!(post(&app, routes::SUPPORT, bad).await.0, StatusCode::BAD_REQUEST);
    for _ in 0..4 {
        post(&app, routes::SUPPORT, ticket(Some("bob@example.com"))).await;
    }
    assert_eq!(post(&app, routes::SUPPORT, ticket(Some("bob@example.com"))).await.0, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn admins_see_tickets_and_mark_them_solved() {
    let (app, _) = support_server().await;
    let admin = token(&app, ADMIN).await;
    let ada = token(&app, "ada@example.com").await;
    call(&app, Method::POST, routes::SUPPORT, Some(&ada), Some(ticket(None))).await;

    assert_eq!(call(&app, Method::GET, routes::ADMIN_TICKETS, Some(&ada), None).await.0, StatusCode::FORBIDDEN);
    let (status, list) = call(&app, Method::GET, routes::ADMIN_TICKETS, Some(&admin), None).await;
    assert_eq!(status, StatusCode::OK);
    let first = &list[0];
    assert_eq!((first["email"].as_str(), first["signed_in"].as_bool(), &first["solved_at"]), (Some("ada@example.com"), Some(true), &Value::Null));

    let path = route(routes::ADMIN_TICKET, &[("id", first["id"].as_str().unwrap())]);
    let (status, solved) = call(&app, Method::PATCH, &path, Some(&admin), Some(json!({ "solved": true }))).await;
    assert_eq!(status, StatusCode::OK);
    assert!(solved["solved_at"].is_string());
    let (_, reopened) = call(&app, Method::PATCH, &path, Some(&admin), Some(json!({ "solved": false }))).await;
    assert!(reopened["solved_at"].is_null());
}
