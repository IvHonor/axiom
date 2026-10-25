use axiom_protocol::ai::{ChatRequest, Message};
use serde_json::json;
use wiremock::matchers::method;
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::*;
use crate::account::store::Memory as SessionMemory;
use crate::vault::store::Memory;

const KEY: &str = "AIzaSy-a-pretend-key-0123456789";

fn hello() -> ChatRequest {
    ChatRequest { system: "You are Axiom's assistant.".into(), messages: vec![Message::User { text: "Hi".into() }], tools: vec![] }
}

/// A stand-in for Gemini that says hello.
async fn gemini() -> MockServer {
    let server = MockServer::start().await;
    let answer = json!({ "candidates": [{ "content": { "parts": [{ "text": "Hello!" }] } }] });
    Mock::given(method("POST")).respond_with(ResponseTemplate::new(200).set_body_json(answer)).mount(&server).await;
    server
}

#[test]
fn own_keys_are_kept_and_forgotten() {
    let store = Memory::default();
    let assistant = Assistant::new(Ai::default(), Box::new(store.clone()));
    assert_eq!(assistant.key_status(), KeyStatus { gemini: false, groq: false });

    assert_eq!(assistant.set_key(Provider::Gemini, Some(&format!("  {KEY}\n"))).unwrap(), KeyStatus { gemini: true, groq: false });
    assert!(store.load().unwrap().contains(KEY), "trimmed and saved");
    assert!(assistant.set_key(Provider::Groq, Some("not a key")).is_err());

    assistant.set_key(Provider::Gemini, None).unwrap();
    assert!(store.load().is_none(), "nothing left to keep");
}

#[tokio::test]
async fn own_key_answers_without_an_account() {
    let gemini = gemini().await;
    let assistant = Assistant::new(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), Box::new(Memory::default()));
    let account = Account::new("", Box::new(SessionMemory::default()));

    let err = assistant.chat(&account, &hello()).await.unwrap_err();
    assert!(err.to_string().starts_with("Sign in to use Axiom's assistant"), "{err}");

    assistant.set_key(Provider::Gemini, Some(KEY)).unwrap();
    let reply = assistant.chat(&account, &hello()).await.unwrap();
    assert_eq!(reply.reply.text.as_deref(), Some("Hello!"));
    assert!(reply.own_key);
}
