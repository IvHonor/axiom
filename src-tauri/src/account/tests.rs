//! The desktop side of accounts against a real Axiom server, started on a
//! random local port with an in-memory database.

use axiom_server::{AppState, Shared};

use super::store::Memory;
use super::*;

type Outbox = std::sync::Arc<std::sync::Mutex<Vec<axiom_server::mail::Email>>>;

async fn start_server() -> String {
    start_server_with_mail().await.0
}

/// A server whose emails land in the returned outbox.
async fn start_server_with_mail() -> (String, Outbox) {
    let db = axiom_server::db::connect("sqlite::memory:").await.unwrap();
    let outbox = Outbox::default();
    let mut shared = Shared::new(db, b"test-secret-that-is-at-least-32-bytes");
    shared.mailer = axiom_server::mail::Mailer::Memory(outbox.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(axiom_server::serve(listener, AppState::from(shared)));
    (url, outbox)
}

async fn emailed_code(outbox: &Outbox) -> String {
    for _ in 0..100 {
        if let Some(email) = outbox.lock().unwrap().last() {
            let start = email.text.find("Your code is ").unwrap() + "Your code is ".len();
            return email.text[start..start + 9].to_owned();
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("no email was sent");
}

#[tokio::test]
async fn a_forgotten_password_is_reset_from_the_app() {
    let (server, outbox) = start_server_with_mail().await;
    let account = Account::new(&server, Box::new(Memory::default()));
    account.sign_up("ada@example.com", "correct horse").await.unwrap();
    account.sign_out().await;

    account.request_reset("Ada@example.com").await.unwrap();
    let code = emailed_code(&outbox).await;
    let err = account.reset_password("ada@example.com", "WRONG-CODE", "new horse!").await.unwrap_err();
    assert!(err.to_string().contains("isn't right"), "{err}");
    assert_eq!(account.reset_password("ada@example.com", &code, "new horse!").await.unwrap(), signed_in("ada@example.com"));

    account.sign_out().await;
    assert!(account.sign_in("ada@example.com", "new horse!").await.is_ok());
}

#[tokio::test]
async fn devices_can_be_listed_and_signed_out_remotely() {
    let server = start_server().await;
    let laptop = Account::new(&server, Box::new(Memory::default()));
    let desktop = Account::new(&server, Box::new(Memory::default()));
    laptop.sign_up("ada@example.com", "correct horse").await.unwrap();
    desktop.sign_in("ada@example.com", "correct horse").await.unwrap();

    let devices = laptop.devices().await.unwrap();
    assert_eq!(devices.len(), 2);
    let other = devices.iter().find(|d| !d.current).unwrap();
    laptop.sign_out_device(&other.id).await.unwrap();

    // The desktop finds out the next time it talks to the server.
    assert!(desktop.devices().await.unwrap_err().to_string().contains("signed out"));
    assert_eq!(desktop.status().await, AccountStatus::SignedOut);
    assert_eq!(laptop.devices().await.unwrap().len(), 1);
}

#[tokio::test]
async fn changing_the_password_needs_the_current_one() {
    let server = start_server().await;
    let account = Account::new(&server, Box::new(Memory::default()));
    account.sign_up("ada@example.com", "correct horse").await.unwrap();

    let err = account.change_password("wrong", "new horse!").await.unwrap_err();
    assert_eq!(err.to_string(), "That password isn't right.");
    assert!(account.change_password("correct horse", "short").await.unwrap_err().to_string().contains("at least 8"));
    account.change_password("correct horse", "new horse!").await.unwrap();
    assert_eq!(account.status().await, signed_in("ada@example.com"), "still signed in here");
}

#[tokio::test]
async fn deleting_the_account_signs_out_and_frees_the_email() {
    let server = start_server().await;
    let store = Memory::default();
    let account = Account::new(&server, Box::new(store.clone()));
    account.sign_up("ada@example.com", "correct horse").await.unwrap();

    assert!(account.delete_account("wrong").await.is_err());
    assert_eq!(account.status().await, signed_in("ada@example.com"), "a wrong password changes nothing");

    account.delete_account("correct horse").await.unwrap();
    assert_eq!(account.status().await, AccountStatus::SignedOut);
    assert!(store.load().is_none());
    assert_eq!(account.sign_in("ada@example.com", "correct horse").await.unwrap_err().to_string(), "Email or password is incorrect.");
}

fn signed_in(email: &str) -> AccountStatus {
    AccountStatus::SignedIn { email: email.into() }
}

#[tokio::test]
async fn sign_up_is_remembered_across_launches_until_sign_out() {
    let server = start_server().await;
    let store = Memory::default();

    let account = Account::new(&server, Box::new(store.clone()));
    assert_eq!(account.status().await, AccountStatus::SignedOut);
    assert_eq!(account.sign_up(" Ada@Example.com", "correct horse").await.unwrap(), signed_in("ada@example.com"));

    // Next launch: still signed in, with no network needed to know it.
    let relaunched = Account::new(&server, Box::new(store.clone()));
    assert_eq!(relaunched.status().await, signed_in("ada@example.com"));
    // And the saved refresh token gets a working access token from the server.
    assert!(!relaunched.access_token().await.unwrap().is_empty());

    assert_eq!(relaunched.sign_out().await, AccountStatus::SignedOut);
    assert!(store.load().is_none(), "the credential store is cleared");
    assert_eq!(Account::new(&server, Box::new(store)).status().await, AccountStatus::SignedOut);
}

#[tokio::test]
async fn sign_in_shows_the_servers_reason_when_it_fails() {
    let server = start_server().await;
    let account = Account::new(&server, Box::new(Memory::default()));
    account.sign_up("ada@example.com", "correct horse").await.unwrap();
    account.sign_out().await;

    let err = account.sign_in("ada@example.com", "wrong horse").await.unwrap_err();
    assert_eq!(err.to_string(), "Email or password is incorrect.");
    assert_eq!(account.status().await, AccountStatus::SignedOut);

    assert_eq!(account.sign_in("ada@example.com", "correct horse").await.unwrap(), signed_in("ada@example.com"));
}

#[tokio::test]
async fn bad_input_is_caught_before_going_online() {
    // Nothing listens here, so any request would fail as "offline".
    let account = Account::new("http://127.0.0.1:1", Box::new(Memory::default()));
    assert_eq!(account.sign_up("nope", "correct horse").await.unwrap_err().to_string(), "Enter a valid email address.");
    assert!(account.sign_up("ada@example.com", "short").await.unwrap_err().to_string().contains("at least 8"));
    assert_eq!(account.sign_in("ada@example.com", "").await.unwrap_err().to_string(), "Enter your password.");
}

#[tokio::test]
async fn offline_says_so() {
    let account = Account::new("http://127.0.0.1:1", Box::new(Memory::default()));
    let err = account.sign_in("ada@example.com", "correct horse").await.unwrap_err();
    assert!(err.to_string().starts_with("Can't reach the Axiom server"), "{err}");
}

#[tokio::test]
async fn a_session_ended_elsewhere_signs_out_here() {
    let server = start_server().await;
    let store = Memory::default();
    let account = Account::new(&server, Box::new(store.clone()));
    account.sign_up("ada@example.com", "correct horse").await.unwrap();

    // Another copy of the app (same saved sign-in) signs out on the server.
    let saved = store.load().unwrap();
    let other = Account::new(&server, Box::new(Memory(std::sync::Arc::new(std::sync::Mutex::new(Some(saved))))));
    other.sign_out().await;

    // Force a refresh: the server refuses it, so this device signs out too.
    account.state.lock().await.as_mut().unwrap().access = None;
    assert!(account.access_token().await.is_err());
    assert_eq!(account.status().await, AccountStatus::SignedOut);
    assert!(store.load().is_none());
}

#[tokio::test]
async fn a_build_without_a_server_says_accounts_are_unavailable() {
    let account = Account::new("", Box::new(Memory::default()));
    let err = account.sign_in("ada@example.com", "correct horse").await.unwrap_err();
    assert_eq!(err.to_string(), NO_SERVER);
    assert_eq!(account.request_reset("ada@example.com").await.unwrap_err().to_string(), NO_SERVER);
}
