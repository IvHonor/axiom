//! The assistant commands React calls, wrapped by `src/lib/ai.ts`.

use axiom_protocol::ai::{ChatRequest, Transcript};
use tauri::{AppHandle, Emitter, State};

use super::agent::{self, ChatSummary, ChatView, Persona, Stop, Turn};
use super::{Assistant, AssistantReply, KeyStatus, Provider};
use crate::account::Account;
use crate::db::Db;
use crate::error::Result;
use crate::sync::DATA_CHANGED_EVENT;

/// Sent while Lemma works on a turn (see `agent::Progress`).
const PROGRESS_EVENT: &str = "assistant-progress";

/// Turns under way, by the id the window gave them, so they can be stopped.
#[derive(Default)]
pub struct Turns(std::sync::Mutex<std::collections::HashMap<String, tokio::sync::watch::Sender<bool>>>);

#[tauri::command]
pub fn ai_key_status(assistant: State<'_, Assistant>) -> KeyStatus {
    assistant.key_status()
}

/// Saves one of the person's own AI keys, or forgets it (`key` null).
#[tauri::command]
pub fn ai_set_key(assistant: State<'_, Assistant>, provider: Provider, key: Option<String>) -> Result<KeyStatus> {
    assistant.set_key(provider, key.as_deref())
}

#[tauri::command]
pub async fn ai_chat(assistant: State<'_, Assistant>, account: State<'_, Account>, request: ChatRequest) -> Result<AssistantReply> {
    assistant.chat(&account, &request).await
}

/// What was said in a recording from the microphone (base64 `audio`).
#[tauri::command]
pub async fn ai_transcribe(assistant: State<'_, Assistant>, account: State<'_, Account>, audio: String, mime: String) -> Result<Transcript> {
    assistant.transcribe(&account, &audio, &mime).await
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
