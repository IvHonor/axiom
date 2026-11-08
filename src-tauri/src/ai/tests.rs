use axiom_protocol::ai::{ChatRequest, Message};
use serde_json::json;
use wiremock::matchers::method;
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::*;
use axiom_ai::Ai;
use crate::account::store::Memory as SessionMemory;
use crate::vault::store::Memory;

const KEY: &str = "AIzaSy-a-pretend-key-0123456789";

fn hello() -> ChatRequest {
    ChatRequest { system: "You are Axiom's assistant.".into(), messages: vec![Message::User { text: "Hi".into() }], tools: vec![] }
}

/// Gemini's answer `body`, streamed as one event.
fn streamed(body: serde_json::Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_raw(format!("data: {body}\r\n\r\n"), "text/event-stream")
}

/// A stand-in for Gemini that says hello.
async fn gemini() -> MockServer {
    let server = MockServer::start().await;
    let answer = json!({ "candidates": [{ "content": { "parts": [{ "text": "Hello!" }] } }] });
    Mock::given(method("POST")).respond_with(streamed(answer)).mount(&server).await;
    server
}

#[test]
fn keys_saved_when_people_could_bring_their_own_are_forgotten() {
    let store = Memory::default();
    store.save(&format!(r#"{{"gemini":"{KEY}"}}"#)).unwrap();
    Assistant::forget_own_keys(&store);
    assert!(store.load().is_none());
}

#[tokio::test]
async fn lemma_needs_an_account() {
    let account = Account::new("", Box::new(SessionMemory::default()));
    let err = Assistant::default().chat(&account, &hello()).await.unwrap_err();
    assert_eq!(err.to_string(), "Sign in to use Lemma.");
    let err = Assistant::default().transcribe(&account, "AAAA", "audio/wav").await.unwrap_err();
    assert_eq!(err.to_string(), "Sign in to use Lemma.");
}

#[tokio::test]
async fn answers_through_the_ai() {
    let gemini = gemini().await;
    let assistant = Assistant::direct(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), KEY);
    let account = Account::new("", Box::new(SessionMemory::default()));
    assert_eq!(assistant.chat(&account, &hello()).await.unwrap().text.as_deref(), Some("Hello!"));
}

mod conversation {
    use std::sync::Mutex;

    use sea_orm::{ConnectOptions, Database, DatabaseConnection};
    use serde_json::{Value, json};
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;
    use crate::ai::agent::{self, Entry, Turn};

    async fn db() -> DatabaseConnection {
        let mut options = ConnectOptions::new("sqlite::memory:");
        options.max_connections(1).sqlx_logging(false);
        let db = Database::connect(options).await.unwrap();
        crate::db::prepare(&db).await.unwrap();
        db
    }

    fn gemini_says(parts: Value) -> ResponseTemplate {
        streamed(json!({ "candidates": [{ "content": { "role": "model", "parts": parts } }] }))
    }

    #[tokio::test]
    async fn lemma_looks_prepares_a_change_and_it_happens_once_confirmed() {
        let gemini = MockServer::start().await;
        // Three rounds: look at birthdays, propose one, then answer.
        for parts in [
            json!([{ "functionCall": { "name": "birthdays_list", "args": {} }, "thoughtSignature": "sig-1" }]),
            json!([{ "functionCall": { "name": "birthdays_add", "args": { "name": "Ada Lovelace", "month": 12, "day": 10 } }, "thoughtSignature": "sig-2" }]),
            json!([{ "text": "I've prepared Ada's birthday for you to check." }]),
        ] {
            Mock::given(method("POST")).respond_with(gemini_says(parts)).up_to_n_times(1).mount(&gemini).await;
        }
        let assistant = Assistant::direct(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), KEY);
        let account = Account::new("", Box::new(SessionMemory::default()));
        let db = db().await;
        let turn = Turn { db: &db, assistant: &assistant, account: &account, areas: vec!["birthdays".into()], name: Some("Danial".into()), persona: Default::default(), stop: agent::Stop::never() };

        let (seen, written) = (Mutex::new(Vec::new()), Mutex::new(Vec::new()));
        let chat = agent::send(&turn, None, Some("Add Ada Lovelace's birthday, 10 December".into()), |p| match p.text {
            Some(text) => written.lock().unwrap().push((p.step, text)),
            None => seen.lock().unwrap().push(p.state),
        })
        .await
        .unwrap();
        assert_eq!(chat.title, "Add Ada Lovelace's birthday, 10 December");
        assert_eq!(*seen.lock().unwrap(), ["thinking", "looking", "thinking", "preparing", "thinking", "done"]);
        assert_eq!(*written.lock().unwrap(), [(2, "I've prepared Ada's birthday for you to check.".to_owned())], "the answer shows as it's written");

        let kinds: Vec<&str> = chat.entries.iter().map(kind).collect();
        assert_eq!(kinds, ["user", "looked", "proposal", "assistant"]);
        let Entry::Proposal { id, status, preview, .. } = &chat.entries[2] else { unreachable!() };
        assert_eq!((status.as_str(), preview.title.as_str()), ("pending", "Add Ada Lovelace's birthday"));

        // What the AI was told: its signature back, what it found, and that the change waits.
        let sent: Vec<Value> = gemini.received_requests().await.unwrap().iter().map(|r| r.body_json().unwrap()).collect();
        assert!(sent[0]["systemInstruction"]["parts"][0]["text"].as_str().unwrap().contains("Danial"));
        assert_eq!(sent[0]["tools"][0]["functionDeclarations"].as_array().unwrap().len(), 8, "birthdays' tools only");
        assert_eq!(sent[1]["contents"][1]["parts"][0]["thoughtSignature"], "sig-1");
        assert_eq!(sent[1]["contents"][2]["parts"][0]["functionResponse"]["response"], json!({ "result": [] }));
        assert_eq!(sent[2]["contents"][4]["parts"][0]["functionResponse"]["response"]["status"], "waiting for the person to confirm");

        // Nothing's added until it's confirmed.
        let today = chrono::Local::now().date_naive();
        assert!(crate::features::birthdays::service::list(&db, today).await.unwrap().is_empty());
        agent::confirm(&db, id).await.unwrap();
        assert_eq!(crate::features::birthdays::service::list(&db, today).await.unwrap()[0].name, "Ada Lovelace");
        assert!(agent::confirm(&db, id).await.is_err(), "only once");
        let Entry::Proposal { status, .. } = &agent::view(&db, &chat.id).await.unwrap().entries[2] else { unreachable!() };
        assert_eq!(status, "confirmed");
    }

    fn kind(entry: &Entry) -> &'static str {
        match entry {
            Entry::User { .. } => "user",
            Entry::Looked { .. } => "looked",
            Entry::Proposal { .. } => "proposal",
            Entry::Repeat { .. } => "repeat",
            Entry::Assistant { .. } => "assistant",
        }
    }

    #[tokio::test]
    async fn asking_again_points_to_the_card_still_waiting() {
        let gemini = MockServer::start().await;
        let add = json!([{ "functionCall": { "name": "birthdays_add", "args": { "name": "Ada Lovelace", "month": 12, "day": 10 } } }]);
        for parts in [add.clone(), json!([{ "text": "Ready for you to check." }]), add, json!([{ "text": "It's already waiting above." }])] {
            Mock::given(method("POST")).respond_with(gemini_says(parts)).up_to_n_times(1).mount(&gemini).await;
        }
        let assistant = Assistant::direct(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), KEY);
        let account = Account::new("", Box::new(SessionMemory::default()));
        let db = db().await;
        let turn = Turn { db: &db, assistant: &assistant, account: &account, areas: vec!["birthdays".into()], name: None, persona: Default::default(), stop: agent::Stop::never() };

        let chat = agent::send(&turn, None, Some("Add Ada's birthday, 10 December".into()), |_| {}).await.unwrap();
        let chat = agent::send(&turn, Some(chat.id), Some("Add Ada's birthday please".into()), |_| {}).await.unwrap();
        assert_eq!(chat.entries.iter().map(kind).collect::<Vec<_>>(), ["user", "proposal", "assistant", "user", "repeat", "assistant"]);
        let (Entry::Proposal { id, .. }, Entry::Repeat { proposal, .. }) = (&chat.entries[1], &chat.entries[4]) else { unreachable!() };
        assert_eq!(proposal, id, "it points to the first card");
        let sent: Vec<Value> = gemini.received_requests().await.unwrap().iter().map(|r| r.body_json().unwrap()).collect();
        let told = serde_json::to_string(&sent[3]["contents"]).unwrap();
        assert!(told.contains("already on a card waiting"), "{told}");
    }

    fn with_usage(parts: Value, input: u32, output: u32) -> ResponseTemplate {
        streamed(json!({
            "candidates": [{ "content": { "role": "model", "parts": parts } }],
            "usageMetadata": { "promptTokenCount": input, "candidatesTokenCount": output },
        }))
    }

    fn declared(request: &Value) -> Vec<String> {
        request["tools"][0]["functionDeclarations"].as_array().map_or(vec![], |d| d.iter().map(|t| t["name"].as_str().unwrap().to_owned()).collect())
    }

    #[tokio::test]
    async fn lemma_gets_only_the_tools_it_needs_and_old_lookups_are_dropped() {
        let gemini = MockServer::start().await;
        for parts in [
            // Turn 1: asks for Goals as well, looks at birthdays, answers.
            json!([{ "functionCall": { "name": "use_area", "args": { "areas": ["goals"] } } }]),
            json!([{ "functionCall": { "name": "birthdays_list", "args": {} } }]),
            json!([{ "text": "Nobody's birthday is saved yet." }]),
            // Turn 2: answers straight away.
            json!([{ "text": "You're welcome!" }]),
        ] {
            Mock::given(method("POST")).respond_with(with_usage(parts, 1000, 50)).up_to_n_times(1).mount(&gemini).await;
        }
        let assistant = Assistant::direct(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), KEY);
        let account = Account::new("", Box::new(SessionMemory::default()));
        let db = db().await;
        let everything: Vec<String> = ["birthdays", "daily_plan", "goals", "reading", "finance"].map(String::from).to_vec();
        let turn = Turn { db: &db, assistant: &assistant, account: &account, areas: everything, name: None, persona: Default::default(), stop: agent::Stop::never() };

        let chat = agent::send(&turn, None, Some("Whose birthday is next?".into()), |_| {}).await.unwrap();
        let Some(Entry::Assistant { tokens, .. }) = chat.entries.last() else { panic!("an answer") };
        assert_eq!(*tokens, Some(3 * 1050), "three calls' worth");
        agent::send(&turn, Some(chat.id.clone()), Some("Thanks".into()), |_| {}).await.unwrap();

        let sent: Vec<Value> = gemini.received_requests().await.unwrap().iter().map(|r| r.body_json().unwrap()).collect();
        let first = declared(&sent[0]);
        assert!(first.iter().all(|t| t.starts_with("birthdays_") || t == "use_area"), "{first:?}");
        assert!(declared(&sent[1]).iter().any(|t| t.starts_with("goals_")), "Goals once asked for");
        // Turn 2 doesn't resend turn 1's lookups, only its words.
        let turn2 = serde_json::to_string(&sent[3]["contents"]).unwrap();
        assert!(!turn2.contains("functionResponse") && !turn2.contains("functionCall"), "{turn2}");
        assert!(turn2.contains("Nobody's birthday is saved yet."));
    }

    #[tokio::test]
    async fn stopping_ends_the_turn_without_waiting_for_the_ai() {
        let gemini = MockServer::start().await;
        let slow = gemini_says(json!([{ "text": "Too late." }])).set_delay(std::time::Duration::from_secs(20));
        Mock::given(method("POST")).respond_with(slow).mount(&gemini).await;
        let assistant = Assistant::direct(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), KEY);
        let account = Account::new("", Box::new(SessionMemory::default()));
        let db = db().await;
        let (stopper, stop) = agent::Stop::new();
        let turn = Turn { db: &db, assistant: &assistant, account: &account, areas: vec![], name: None, persona: Default::default(), stop };

        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            let _ = stopper.send(true);
        });
        let started = std::time::Instant::now();
        let chat = agent::send(&turn, None, Some("Plan my week".into()), |_| {}).await.unwrap();
        assert!(started.elapsed() < std::time::Duration::from_secs(5), "stopped at once, not after the AI");
        let kinds: Vec<bool> = chat.entries.iter().map(|e| matches!(e, Entry::User { .. })).collect();
        assert_eq!(kinds, [true], "only the person's message: nothing half-written");
    }

    #[tokio::test]
    async fn an_area_that_is_switched_off_offers_no_tools() {
        let gemini = MockServer::start().await;
        Mock::given(method("POST")).respond_with(gemini_says(json!([{ "functionCall": { "name": "birthdays_add", "args": { "name": "Ada", "month": 1, "day": 1 } } }]))).up_to_n_times(1).mount(&gemini).await;
        Mock::given(method("POST")).respond_with(gemini_says(json!([{ "text": "Birthdays is switched off." }]))).mount(&gemini).await;
        let assistant = Assistant::direct(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), KEY);
        let account = Account::new("", Box::new(SessionMemory::default()));
        let db = db().await;
        let turn = Turn { db: &db, assistant: &assistant, account: &account, areas: vec![], name: None, persona: Default::default(), stop: agent::Stop::never() };

        let chat = agent::send(&turn, None, Some("Add Ada".into()), |_| {}).await.unwrap();
        assert!(chat.entries.iter().all(|e| !matches!(e, Entry::Proposal { .. })), "no change from a switched-off area");
        let sent: Vec<Value> = gemini.received_requests().await.unwrap().iter().map(|r| r.body_json().unwrap()).collect();
        assert!(sent[0].get("tools").is_none());
        assert!(sent[1]["contents"][2]["parts"][0]["functionResponse"]["response"]["error"].as_str().unwrap().contains("switched off"));
    }

    #[tokio::test]
    async fn the_day_is_looked_at_first_the_time_goes_last_and_a_look_isnt_repeated() {
        let gemini = MockServer::start().await;
        // Looks at the day again, though it has it, then answers.
        let again = json!([{ "functionCall": { "name": "plan_day", "args": {} }, "thoughtSignature": "sig-1" }]);
        for parts in [again, json!([{ "text": "Your day is clear." }])] {
            Mock::given(method("POST")).respond_with(gemini_says(parts)).up_to_n_times(1).mount(&gemini).await;
        }
        let assistant = Assistant::direct(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), KEY);
        let account = Account::new("", Box::new(SessionMemory::default()));
        let db = db().await;
        let turn = Turn { db: &db, assistant: &assistant, account: &account, areas: vec!["daily_plan".into()], name: None, persona: Default::default(), stop: agent::Stop::never() };

        let seen = Mutex::new(Vec::new());
        let chat = agent::send(&turn, None, Some("Plan my day please".into()), |p| seen.lock().unwrap().push(p.state)).await.unwrap();
        assert_eq!(chat.entries.iter().map(kind).collect::<Vec<_>>(), ["user", "looked", "assistant"]);
        assert_eq!(seen.lock().unwrap()[0], "looking", "before the AI is asked");

        let sent: Vec<Value> = gemini.received_requests().await.unwrap().iter().map(|r| r.body_json().unwrap()).collect();
        assert_eq!(sent.len(), 2);
        // The first call already has the day.
        assert_eq!(sent[0]["contents"][1]["parts"][0]["functionCall"]["name"], "plan_day");
        assert!(sent[0]["contents"][2]["parts"][0]["functionResponse"]["response"]["working_hours"].is_string());
        // When it is goes with the message, not in the instructions, so they stay the same.
        let instructions = sent[0]["systemInstruction"]["parts"][0]["text"].as_str().unwrap();
        let weekday = chrono::Local::now().format("%A").to_string();
        assert!(!instructions.contains(&weekday), "{instructions}");
        let message = sent[0]["contents"][0]["parts"][0]["text"].as_str().unwrap();
        assert!(message.starts_with(&format!("[{weekday} ")) && message.ends_with("] Plan my day please"), "{message}");
        assert_eq!(sent[1]["contents"][0], sent[0]["contents"][0], "the same all turn");
        // Asked again, it's told it already has it.
        let note = &sent[1]["contents"][4]["parts"][0]["functionResponse"]["response"]["note"];
        assert!(note.as_str().unwrap().contains("already looked this up"), "{note}");
    }

    #[test]
    fn only_a_day_being_planned_is_looked_at_first() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();
        assert_eq!(agent::day_planned("Can you plan my day?", today), Some(json!({})));
        assert_eq!(agent::day_planned("Schedule tomorrow for me", today), Some(json!({ "day": "2026-11-02" })));
        for text in ["Plan the project", "What's on today?", "Add a task"] {
            assert_eq!(agent::day_planned(text, today), None, "{text}");
        }
    }
}

/// Confirming a card the AI prepared: what it does, and what Undo can put back.
mod confirming {
    use chrono::{Duration, Local, Utc};
    use sea_orm::{ActiveModelTrait, ConnectOptions, Database, DatabaseConnection, EntityTrait, Set};
    use serde_json::{Value, json};

    use crate::ai::agent;
    use crate::ai::entities::{chat, proposal};

    async fn db() -> DatabaseConnection {
        let mut options = ConnectOptions::new("sqlite::memory:");
        options.max_connections(1).sqlx_logging(false);
        let db = Database::connect(options).await.unwrap();
        crate::db::prepare(&db).await.unwrap();
        db
    }

    /// A card waiting in a chat, prepared `ago` before now. Returns its id.
    async fn card(db: &DatabaseConnection, area: &str, tool: &str, args: Value, ago: Duration) -> String {
        let at = Utc::now() - ago;
        let id = crate::db::new_id();
        chat::ActiveModel { id: Set("c".into()), title: Set("Chat".into()), created_at: Set(at), updated_at: Set(at), deleted_at: Set(None) }.insert(db).await.ok();
        proposal::ActiveModel {
            id: Set(id.clone()),
            chat_id: Set("c".into()),
            call_id: Set(crate::db::new_id()),
            area: Set(area.into()),
            tool: Set(tool.into()),
            arguments: Set(args.to_string()),
            preview: Set(json!({ "title": tool, "items": [] }).to_string()),
            status: Set("pending".into()),
            outcome: Set(None),
            created_at: Set(at),
            updated_at: Set(at),
            deleted_at: Set(None),
        }
        .insert(db)
        .await
        .unwrap();
        id
    }

    /// Its status, and whether Undo is offered (as the chat works it out).
    async fn card_state(db: &DatabaseConnection, id: &str) -> (String, bool) {
        let status = proposal::Entity::find_by_id(id).one(db).await.unwrap().unwrap().status;
        let undoable = crate::ai::undo::undoable(db, &[id.to_owned()]).await.unwrap().len() == 1;
        let offered = undoable && (status == "confirmed" || status == "failed");
        (status, offered)
    }

    #[tokio::test]
    async fn a_card_confirmed_days_later_does_what_it_said() {
        let db = db().await;
        let id = card(&db, "daily_plan", "plan_add", json!({ "items": [{ "title": "Gym" }] }), Duration::days(2)).await;
        agent::confirm(&db, &id).await.unwrap();
        let prepared = (Local::now() - Duration::days(2)).date_naive();
        let day = crate::features::daily_plan::service::get_day(&db, prepared, prepared).await.unwrap();
        assert_eq!(day.tasks.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), ["Gym"], "on the day the card said, not today");
    }

    #[tokio::test]
    async fn what_a_change_did_before_it_failed_can_be_undone() {
        let db = db().await;
        let term = crate::features::uni::types::TermFields { name: "Autumn".into(), starts_on: Local::now().date_naive(), weeks: 11 };
        crate::features::uni::service::add_term(&db, term, Local::now().date_naive()).await.unwrap();
        let module = crate::features::uni::types::ModuleFields { term_id: crate::features::uni::service::summary(&db, Local::now().date_naive()).await.unwrap().current.unwrap(), code: String::new(), name: "Econometrics".into(), color: "blue".into(), credits: None, link: None };
        let m = crate::features::uni::service::add_module(&db, module, Local::now().date_naive()).await.unwrap().module.id;
        // The second lecture has no title, so saving stops after the first.
        let id = card(&db, "uni", "uni_add_lectures", json!({ "module_id": m, "lectures": [{ "title": "Intro", "week": 1 }, { "title": " ", "week": 2 }] }), Duration::zero()).await;
        agent::confirm(&db, &id).await.unwrap();
        assert_eq!(card_state(&db, &id).await, ("failed".to_owned(), true));
        let lectures = || async { crate::features::uni::service::get_module(&db, &m, Local::now().date_naive()).await.unwrap().lectures.len() };
        assert_eq!(lectures().await, 1, "the first was saved");
        agent::undo(&db, &id).await.unwrap();
        assert_eq!(lectures().await, 0);
        assert_eq!(card_state(&db, &id).await, ("undone".to_owned(), false));
    }

    #[tokio::test]
    async fn confirm_all_makes_every_waiting_change_in_order() {
        let db = db().await;
        let first = card(&db, "birthdays", "birthdays_add", json!({ "name": "Ada", "month": 12, "day": 10 }), Duration::seconds(2)).await;
        let second = card(&db, "birthdays", "birthdays_add", json!({ "name": "Bob", "month": 1, "day": 1 }), Duration::seconds(1)).await;
        agent::confirm_all(&db, "c").await.unwrap();
        assert_eq!(card_state(&db, &first).await, ("confirmed".to_owned(), true));
        assert_eq!(card_state(&db, &second).await, ("confirmed".to_owned(), true));
        let names: Vec<String> = crate::features::birthdays::service::list(&db, Local::now().date_naive()).await.unwrap().into_iter().map(|b| b.name).collect();
        assert_eq!(names.len(), 2, "{names:?}");
        agent::confirm_all(&db, "c").await.unwrap();
        assert_eq!(crate::features::birthdays::service::list(&db, Local::now().date_naive()).await.unwrap().len(), 2, "nothing twice");
    }

    #[tokio::test]
    async fn a_card_confirmed_on_another_computer_says_where_its_undo_is() {
        use crate::ai::agent::Entry;
        use crate::ai::entities::message;

        let db = db().await;
        let here = card(&db, "birthdays", "birthdays_add", json!({ "name": "Ada", "month": 12, "day": 10 }), Duration::zero()).await;
        let there = card(&db, "goals", "goals_add", json!({ "title": "Run" }), Duration::zero()).await;
        let unchanged = card(&db, "goals", "goals_add", json!({}), Duration::zero()).await;
        for (i, id) in [&here, &there, &unchanged].into_iter().enumerate() {
            let data = json!({ "call_id": "x", "name": "t", "area": "birthdays", "result": {}, "proposal_id": id });
            let at = Utc::now();
            message::ActiveModel { id: Set(crate::db::new_id()), chat_id: Set("c".into()), position: Set(i as i64), role: Set("tool".into()), text: Set(None), data: Set(Some(data.to_string())), provider: Set(None), created_at: Set(at), updated_at: Set(at), deleted_at: Set(None) }
                .insert(&db)
                .await
                .unwrap();
        }
        agent::confirm(&db, &here).await.unwrap();
        // Confirming it failed here: still confirmed here, so no word of another computer.
        agent::confirm(&db, &unchanged).await.unwrap();
        // Synced from another computer, confirmed there.
        let mut synced: proposal::ActiveModel = proposal::Entity::find_by_id(&there).one(&db).await.unwrap().unwrap().into();
        synced.status = Set("confirmed".into());
        synced.update(&db).await.unwrap();

        let shown: Vec<(bool, bool)> = agent::view(&db, "c")
            .await
            .unwrap()
            .entries
            .iter()
            .filter_map(|e| match e {
                Entry::Proposal { undoable, elsewhere, .. } => Some((*undoable, *elsewhere)),
                _ => None,
            })
            .collect();
        assert_eq!(shown, [(true, false), (false, true), (false, false)]);
    }

    #[tokio::test]
    async fn writing_in_the_journal_is_undone_without_reading_every_saved_edit() {
        let db = db().await;
        let id = card(&db, "journal", "journal_write", json!({ "text": "A quiet day." }), Duration::zero()).await;
        agent::confirm(&db, &id).await.unwrap();
        assert_eq!(card_state(&db, &id).await, ("confirmed".to_owned(), true));
        let filter = crate::features::journal::types::EntryFilter::default();
        assert_eq!(crate::features::journal::service::list(&db, filter).await.unwrap().len(), 1);
        agent::undo(&db, &id).await.unwrap();
        let filter = crate::features::journal::types::EntryFilter::default();
        assert!(crate::features::journal::service::list(&db, filter).await.unwrap().is_empty());
    }
}

/// A question about everything looks everywhere, but brings in the change
/// tools only of the areas it names: the free plans count every token sent.
#[test]
fn a_broad_question_can_look_everywhere_but_change_only_what_it_names() {
    let allowed: Vec<String> = ["daily_plan", "reading", "finance"].map(String::from).to_vec();
    let names = |tools: Vec<axiom_protocol::ai::Tool>| tools.into_iter().map(|t| t.name).collect::<Vec<_>>();

    let narrow = names(agent::tools_for(&["daily_plan".into()], &allowed, false));
    assert!(narrow.contains(&"plan_add".into()) && narrow.contains(&"use_area".into()));
    assert!(!narrow.iter().any(|n| n.starts_with("reading_") || n.starts_with("finance_")), "nothing of areas it isn't about");

    let broad = names(agent::tools_for(&["daily_plan".into()], &allowed, true));
    assert!(broad.contains(&"plan_add".into()), "the area it names, whole");
    assert!(broad.contains(&"reading_books".into()), "a look at the others");
    assert!(!broad.contains(&"reading_add".into()) && !broad.iter().any(|n| n.starts_with("finance_add")), "but not their changes");
    assert!(broad.contains(&"use_area".into()), "which use_area brings in");
}

mod quick {
    use sea_orm::{ConnectOptions, Database, DatabaseConnection};
    use serde_json::{Value, json};
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer};

    use super::*;
    use crate::ai::quick::{ask, undo_all};

    async fn db() -> DatabaseConnection {
        let mut options = ConnectOptions::new("sqlite::memory:");
        options.max_connections(1).sqlx_logging(false);
        let db = Database::connect(options).await.unwrap();
        crate::db::prepare(&db).await.unwrap();
        db
    }

    /// A stand-in Gemini that answers with each of `turns`' parts, in turn.
    async fn gemini_saying(turns: Vec<Value>) -> MockServer {
        let gemini = MockServer::start().await;
        for parts in turns {
            Mock::given(method("POST")).respond_with(streamed(json!({ "candidates": [{ "content": { "role": "model", "parts": parts } }] }))).up_to_n_times(1).mount(&gemini).await;
        }
        gemini
    }

    fn lemma(gemini: &MockServer) -> (Assistant, Account) {
        (Assistant::direct(Ai::default().with_urls(&gemini.uri(), "http://127.0.0.1:9"), KEY), Account::new("", Box::new(SessionMemory::default())))
    }

    fn tools(sent: &Value) -> Vec<String> {
        sent["tools"][0]["functionDeclarations"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap().to_owned()).collect()
    }

    #[tokio::test]
    async fn a_timer_starts_straight_away_can_be_undone_and_nothing_is_kept() {
        let gemini = gemini_saying(vec![
            json!([{ "functionCall": { "name": "plan_timer", "args": { "action": "start", "title": "Essay", "minutes": 30 } } }]),
            json!([{ "text": "On it: timing your **essay** now." }]),
        ])
        .await;
        let (assistant, account) = lemma(&gemini);
        let db = db().await;
        let today = chrono::Local::now().date_naive();

        let reply = ask(&db, &assistant, &account, "start a timer for my essay", &["daily_plan".into()], Some("Ada"), &Default::default()).await.unwrap();
        assert_eq!(reply.said.as_deref(), Some("On it: timing your essay now."));
        assert_eq!(reply.did.as_deref(), Some("Start a timer on \"Essay\""));
        assert!(!reply.open_chat);
        assert_eq!(reply.undo.len(), 1);
        let plan = crate::features::daily_plan::service::get_day(&db, today, today).await.unwrap();
        assert_eq!(plan.running.map(|t| t.title), Some("Essay".into()));
        assert!(crate::ai::agent::list(&db).await.unwrap().is_empty(), "no chat is kept");

        // Undo, from the bubble: the task it made goes, timer and all.
        undo_all(&db, &reply.undo).await.unwrap();
        let plan = crate::features::daily_plan::service::get_day(&db, today, today).await.unwrap();
        assert!(plan.running.is_none());
        assert!(plan.tasks.is_empty());

        // Told what it can do here, and to be brief.
        let sent: Vec<Value> = gemini.received_requests().await.unwrap().iter().map(|r| r.body_json().unwrap()).collect();
        let prompt = sent[0]["systemInstruction"]["parts"][0]["text"].as_str().unwrap();
        assert!(prompt.contains("speech bubble") && prompt.contains("open_chat") && prompt.contains("Ada"), "{prompt}");
        assert_eq!(tools(&sent[0]), ["plan_day", "plan_add", "plan_update_task", "plan_schedule", "plan_timer", "remind", "open_chat"]);
    }

    #[tokio::test]
    async fn a_reminder_is_handed_back_to_keep() {
        let gemini = gemini_saying(vec![
            json!([{ "functionCall": { "name": "remind", "args": { "text": "Stand up and stretch", "in_minutes": 30 } } }]),
            json!([{ "text": "I'll remind you in 30 minutes." }]),
        ])
        .await;
        let (assistant, account) = lemma(&gemini);
        let db = db().await;
        let reply = ask(&db, &assistant, &account, "remind me to stretch in half an hour", &[], None, &Default::default()).await.unwrap();
        let reminder = reply.reminder.expect("a reminder");
        assert_eq!(reminder.text, "Stand up and stretch");
        let in_minutes = (reminder.at - chrono::Local::now().timestamp_millis()) as f64 / 60_000.0;
        assert!((29.0..=30.5).contains(&in_minutes), "{in_minutes}");
        assert!(reply.undo.is_empty() && reply.did.is_none());
    }

    #[tokio::test]
    async fn a_reminder_can_wait_until_theyre_back() {
        let gemini = gemini_saying(vec![
            json!([{ "functionCall": { "name": "remind", "args": { "text": "Call Sam", "when_back": true } } }]),
            json!([{ "text": "I'll remind you when you're back." }]),
        ])
        .await;
        let (assistant, account) = lemma(&gemini);
        let db = db().await;
        let reply = ask(&db, &assistant, &account, "remind me to call Sam when I'm back", &[], None, &Default::default()).await.unwrap();
        let reminder = reply.reminder.expect("a reminder");
        assert_eq!((reminder.text.as_str(), reminder.on_return), ("Call Sam", true));
    }

    #[tokio::test]
    async fn anything_bigger_goes_on_to_a_chat() {
        let gemini = gemini_saying(vec![json!([{ "text": "Let's plan that in Axiom." }, { "functionCall": { "name": "open_chat", "args": {} } }])]).await;
        let (assistant, account) = lemma(&gemini);
        let db = db().await;
        let reply = ask(&db, &assistant, &account, "plan my whole week", &["daily_plan".into()], None, &Default::default()).await.unwrap();
        assert!(reply.open_chat);
        assert_eq!(reply.did, None);
        assert!(crate::ai::agent::list(&db).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn without_any_areas_it_only_reminds_and_hands_on() {
        let gemini = gemini_saying(vec![json!([{ "text": "Switch an area on in my settings first." }])]).await;
        let (assistant, account) = lemma(&gemini);
        let db = db().await;
        ask(&db, &assistant, &account, "start a timer", &[], None, &Default::default()).await.unwrap();
        let sent: Value = gemini.received_requests().await.unwrap()[0].body_json().unwrap();
        assert_eq!(tools(&sent), ["remind", "open_chat"]);
    }

    #[tokio::test]
    async fn done_by_hand_on_the_desktop_straight_away_with_an_undo() {
        use crate::ai::quick::act;
        let db = db().await;
        let today = chrono::Local::now().date_naive();

        // Text dropped on him: a task for today.
        let reply = act(&db, "plan_add", &json!({ "items": [{ "title": "Call the bank" }] })).await.unwrap();
        assert!(reply.did.is_some() && reply.undo.len() == 1, "{reply:?}");
        let plan = crate::features::daily_plan::service::get_day(&db, today, today).await.unwrap();
        assert_eq!(plan.tasks.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), ["Call the bank"]);
        undo_all(&db, &reply.undo).await.unwrap();
        assert!(crate::features::daily_plan::service::get_day(&db, today, today).await.unwrap().tasks.is_empty());

        // The evening check-in: an entry with the mood.
        let reply = act(&db, "journal_write", &json!({ "title": "Evening check-in", "text": "Today felt good.", "mood": 4 })).await.unwrap();
        let entries = crate::features::journal::service::list(&db, Default::default()).await.unwrap();
        assert_eq!((entries.len(), entries[0].mood, entries[0].title.as_str()), (1, Some(4), "Evening check-in"));
        undo_all(&db, &reply.undo).await.unwrap();
        assert!(crate::features::journal::service::list(&db, Default::default()).await.unwrap().is_empty());

        // Only what the desktop does: nothing else, and nothing that doesn't check out.
        assert!(act(&db, "plan_delete_task", &json!({ "id": "x" })).await.is_err());
        assert!(act(&db, "journal_write", &json!({ "text": "  " })).await.is_err());
        assert!(crate::ai::agent::list(&db).await.unwrap().is_empty(), "no chat is kept");
    }
}
