//! Tauri commands for the Journal, wrapped by `src/features/journal/api.ts`.
//! Days arrive as "YYYY-MM-DD" in the user's own time zone.

use chrono::Local;
use sea_orm::prelude::Date;
use tauri::{AppHandle, Manager, State};

use super::entities::entry;
use super::service;
use super::types::{EntryCard, EntryDetail, EntryFields, EntryFilter, JournalStats};
use crate::db::Db;
use crate::error::{Error, Result};

#[tauri::command]
pub async fn journal_list(db: State<'_, Db>, filter: EntryFilter) -> Result<Vec<EntryCard>> {
    service::list(&db.conn().await?, filter).await
}

#[tauri::command]
pub async fn journal_on_day(db: State<'_, Db>, day: Date) -> Result<Vec<EntryCard>> {
    service::on_day(&db.conn().await?, day).await
}

#[tauri::command]
pub async fn journal_get(db: State<'_, Db>, id: String) -> Result<EntryDetail> {
    service::get(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn journal_create(db: State<'_, Db>, day: Date, prompt: String) -> Result<entry::Model> {
    service::create(&db.conn().await?, day, &prompt).await
}

#[tauri::command]
pub async fn journal_update(db: State<'_, Db>, id: String, fields: EntryFields) -> Result<entry::Model> {
    service::update(&db.conn().await?, &id, fields).await
}

/// Saves new edits to an entry's text (a Yjs update, base64) and its plain text.
#[tauri::command]
pub async fn journal_save(db: State<'_, Db>, id: String, update: Option<String>, text: String, words: i32) -> Result<entry::Model> {
    service::save(&db.conn().await?, &id, update, text, words).await
}

#[tauri::command]
pub async fn journal_compact(db: State<'_, Db>, id: String, snapshot: String, replaces: Vec<String>) -> Result<()> {
    service::compact(&db.conn().await?, &id, &snapshot, replaces).await
}

#[tauri::command]
pub async fn journal_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn journal_stats(db: State<'_, Db>, today: Date) -> Result<JournalStats> {
    service::stats(&db.conn().await?, today).await
}

/// Saves the journal, written out as Markdown by the app, to Downloads.
/// Returns where.
#[tauri::command]
pub async fn journal_export(app: AppHandle, markdown: String) -> Result<String> {
    let folder = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| Error::Invalid(format!("Couldn't find your Downloads folder: {e}")))?;
    let file = folder.join(format!("axiom-journal-{}.md", Local::now().format("%Y-%m-%d-%H%M%S")));
    std::fs::write(&file, markdown).map_err(|e| Error::Invalid(format!("Couldn't save {}: {e}", file.display())))?;
    Ok(file.to_string_lossy().into_owned())
}

/// Every prompt, and today's.
#[tauri::command]
pub fn journal_prompts(today: Date) -> (Vec<&'static str>, &'static str) {
    (service::PROMPTS.to_vec(), service::prompt_for(today))
}
