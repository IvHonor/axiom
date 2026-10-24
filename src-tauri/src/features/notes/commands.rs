//! Tauri commands for Notes, wrapped by `src/features/notes/api.ts`.

use chrono::Local;
use tauri::{AppHandle, Manager, State};

use super::entities::{folder, note};
use super::service;
use super::types::{NewNote, NoteCard, NoteChange, NoteDetail, NoteFilter, NoteLink, NotesState};
use crate::db::Db;
use crate::error::{Error, Result};

#[tauri::command]
pub async fn notes_state(db: State<'_, Db>) -> Result<NotesState> {
    service::state(&db.conn().await?).await
}

#[tauri::command]
pub async fn notes_list(db: State<'_, Db>, filter: NoteFilter) -> Result<Vec<NoteCard>> {
    service::list(&db.conn().await?, filter).await
}

#[tauri::command]
pub async fn notes_get(db: State<'_, Db>, id: String) -> Result<NoteDetail> {
    service::get(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn notes_titles(db: State<'_, Db>) -> Result<Vec<NoteLink>> {
    service::titles(&db.conn().await?).await
}

#[tauri::command]
pub async fn notes_create(db: State<'_, Db>, note: NewNote) -> Result<note::Model> {
    service::create(&db.conn().await?, note).await
}

#[tauri::command]
pub async fn notes_change(db: State<'_, Db>, id: String, change: NoteChange) -> Result<note::Model> {
    service::change(&db.conn().await?, &id, change).await
}

/// Saves new edits to a note's text (a Yjs update, base64) and its plain text.
#[tauri::command]
pub async fn notes_save(db: State<'_, Db>, id: String, update: Option<String>, text: String, words: i32) -> Result<note::Model> {
    service::save(&db.conn().await?, &id, update, text, words).await
}

#[tauri::command]
pub async fn notes_compact(db: State<'_, Db>, id: String, snapshot: String, replaces: Vec<String>) -> Result<()> {
    service::compact(&db.conn().await?, &id, &snapshot, replaces).await
}

#[tauri::command]
pub async fn notes_trash(db: State<'_, Db>, id: String) -> Result<()> {
    service::trash(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn notes_restore(db: State<'_, Db>, id: String) -> Result<note::Model> {
    service::restore(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn notes_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn notes_empty_trash(db: State<'_, Db>) -> Result<u32> {
    service::empty_trash(&db.conn().await?, None).await
}

#[tauri::command]
pub async fn notes_folder_create(db: State<'_, Db>, name: String, parent_id: Option<String>) -> Result<folder::Model> {
    service::create_folder(&db.conn().await?, &name, parent_id).await
}

#[tauri::command]
pub async fn notes_folder_rename(db: State<'_, Db>, id: String, name: String) -> Result<folder::Model> {
    service::rename_folder(&db.conn().await?, &id, &name).await
}

#[tauri::command]
pub async fn notes_folder_move(db: State<'_, Db>, id: String, parent_id: Option<String>) -> Result<folder::Model> {
    service::move_folder(&db.conn().await?, &id, parent_id).await
}

#[tauri::command]
pub async fn notes_folder_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_folder(&db.conn().await?, &id).await
}

/// Saves notes, written out as Markdown by the app, to Downloads. Returns where.
#[tauri::command]
pub async fn notes_export(app: AppHandle, markdown: String) -> Result<String> {
    let folder = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| Error::Invalid(format!("Couldn't find your Downloads folder: {e}")))?;
    let file = folder.join(format!("axiom-notes-{}.md", Local::now().format("%Y-%m-%d-%H%M%S")));
    std::fs::write(&file, markdown).map_err(|e| Error::Invalid(format!("Couldn't save {}: {e}", file.display())))?;
    Ok(file.to_string_lossy().into_owned())
}
