//! The assistant commands React calls, wrapped by `src/lib/ai.ts`.

use axiom_protocol::ai::Transcript;
use tauri::{AppHandle, Emitter, State};

use super::agent::{self, ChatSummary, ChatView, Persona, Stop, Turn};
use super::Assistant;
use super::quick::QuickReply;
use crate::account::Account;
use crate::db::Db;
use crate::error::Result;
use crate::sync::DATA_CHANGED_EVENT;

/// Sent while Lemma works on a turn (see `agent::Progress`).
const PROGRESS_EVENT: &str = "assistant-progress";

/// Turns under way, by the id the window gave them, so they can be stopped.
#[derive(Default)]
pub struct Turns(std::sync::Mutex<std::collections::HashMap<String, tokio::sync::watch::Sender<bool>>>);

/// What was said in a recording from the microphone (base64 `audio`).
#[tauri::command]
pub async fn ai_transcribe(assistant: State<'_, Assistant>, account: State<'_, Account>, audio: String, mime: String) -> Result<Transcript> {
    assistant.transcribe(&account, &audio, &mime).await
}

/// Wakes Axiom's server (which sleeps when idle, and takes about a minute
/// to start) when the assistant opens, so the first question doesn't wait.
#[tauri::command]
pub async fn assistant_wake(account: State<'_, Account>) -> Result<()> {
    account.wake().await;
    Ok(())
}

#[tauri::command]
pub async fn assistant_chats(db: State<'_, Db>) -> Result<Vec<ChatSummary>> {
    agent::list(&db.conn().await?).await
}

#[tauri::command]
pub async fn assistant_chat(db: State<'_, Db>, id: String) -> Result<ChatView> {
    agent::view(&db.conn().await?, &id).await
}

/// The person's message (None carries on after an error) to a chat (None
/// starts one), with the areas Lemma may use. Returns the chat once Lemma
/// has answered, or been stopped (`assistant_stop` with `turn_id`).
#[tauri::command]
pub async fn assistant_send(
    app: AppHandle,
    db: State<'_, Db>,
    assistant: State<'_, Assistant>,
    account: State<'_, Account>,
    turns: State<'_, Turns>,
    turn_id: String,
    chat_id: Option<String>,
    text: Option<String>,
    areas: Vec<String>,
    name: Option<String>,
    persona: Option<Persona>,
) -> Result<ChatView> {
    let conn = db.conn().await?;
    let (stopper, stop) = Stop::new();
    turns.0.lock().unwrap().insert(turn_id.clone(), stopper);
    let turn = Turn { db: &conn, assistant: &assistant, account: &account, areas, name, persona: persona.unwrap_or_default(), stop };
    let result = agent::send(&turn, chat_id, text, |progress| {
        let _ = app.emit(PROGRESS_EVENT, progress);
    })
    .await;
    turns.0.lock().unwrap().remove(&turn_id);
    result
}

/// Something said to Lemma on the desktop: done straight away when it's
/// small (timing a task, ticking one off), else handed on to a chat. Nothing
/// is kept. The planner and the desktop view hear about anything done.
#[tauri::command]
pub async fn assistant_quick(
    app: AppHandle,
    db: State<'_, Db>,
    assistant: State<'_, Assistant>,
    account: State<'_, Account>,
    text: String,
    areas: Vec<String>,
    name: Option<String>,
    persona: Option<Persona>,
) -> Result<QuickReply> {
    let conn = db.conn().await?;
    let reply = super::quick::ask(&conn, &assistant, &account, &text, &areas, name.as_deref(), &persona.unwrap_or_default()).await?;
    if reply.did.is_some() {
        crate::desk::timer_changed(&app);
        let _ = app.emit(DATA_CHANGED_EVENT, ());
    }
    Ok(reply)
}

/// Something done on the desktop by hand (dropped on Lemma, a check-in,
/// logging a timer): straight away, with an Undo, and no AI.
#[tauri::command]
pub async fn assistant_act(app: AppHandle, db: State<'_, Db>, tool: String, args: serde_json::Value) -> Result<QuickReply> {
    let reply = super::quick::act(&db.conn().await?, &tool, &args).await?;
    crate::desk::timer_changed(&app);
    let _ = app.emit(DATA_CHANGED_EVENT, ());
    Ok(reply)
}

/// Undo, from the speech bubble: puts back what something said on the desktop did.
#[tauri::command]
pub async fn assistant_quick_undo(app: AppHandle, db: State<'_, Db>, undo: Vec<String>) -> Result<()> {
    super::quick::undo_all(&db.conn().await?, &undo).await?;
    crate::desk::timer_changed(&app);
    let _ = app.emit(DATA_CHANGED_EVENT, ());
    Ok(())
}

/// Stops a turn under way: Lemma stops waiting on the AI, or before its next step.
#[tauri::command]
pub fn assistant_stop(turns: State<'_, Turns>, turn_id: String) {
    if let Some(stopper) = turns.0.lock().unwrap().get(&turn_id) {
        let _ = stopper.send(true);
    }
}

/// Makes a change Lemma prepared. The areas' views reload to show it.
#[tauri::command]
pub async fn assistant_confirm(app: AppHandle, db: State<'_, Db>, id: String) -> Result<ChatView> {
    let conn = db.conn().await?;
    let chat_id = agent::confirm(&conn, &id).await?;
    let _ = app.emit(DATA_CHANGED_EVENT, ());
    agent::view(&conn, &chat_id).await
}

/// Makes every change waiting in a chat. The areas' views reload to show them.
#[tauri::command]
pub async fn assistant_confirm_all(app: AppHandle, db: State<'_, Db>, chat_id: String) -> Result<ChatView> {
    let conn = db.conn().await?;
    agent::confirm_all(&conn, &chat_id).await?;
    let _ = app.emit(DATA_CHANGED_EVENT, ());
    agent::view(&conn, &chat_id).await
}

/// Undoes a change that was made. The areas' views reload to show it.
#[tauri::command]
pub async fn assistant_undo(app: AppHandle, db: State<'_, Db>, id: String) -> Result<ChatView> {
    let conn = db.conn().await?;
    let chat_id = agent::undo(&conn, &id).await?;
    let _ = app.emit(DATA_CHANGED_EVENT, ());
    agent::view(&conn, &chat_id).await
}

#[tauri::command]
pub async fn assistant_discard(db: State<'_, Db>, id: String) -> Result<ChatView> {
    let conn = db.conn().await?;
    let chat_id = agent::discard(&conn, &id).await?;
    agent::view(&conn, &chat_id).await
}

#[tauri::command]
pub async fn assistant_rename_chat(db: State<'_, Db>, id: String, title: String) -> Result<()> {
    agent::rename(&db.conn().await?, &id, &title).await
}

#[tauri::command]
pub async fn assistant_delete_chat(db: State<'_, Db>, id: String) -> Result<()> {
    agent::delete(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn assistant_analytics(db: State<'_, Db>, unit: String, day: sea_orm::prelude::Date, today: sea_orm::prelude::Date) -> Result<super::analytics::LemmaAnalytics> {
    super::analytics::report(&db.conn().await?, crate::features::period::Period::new(&unit, day, today)?).await
}
