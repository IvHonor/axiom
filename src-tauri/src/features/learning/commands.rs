//! Tauri commands for Learning, wrapped by `src/features/learning/api.ts`.
//! Days arrive as "YYYY-MM-DD" in the user's own time zone.

use sea_orm::prelude::Date;
use tauri::State;
use tauri::ipc::{InvokeBody, Request};

use super::entities::{session, skill, source, unit};
use super::types::{Draft, Found, LearningSummary, SessionFields, SkillFields, SourceDetail, SourceFields, UnitFields};
use super::{outline, service, youtube};
use crate::db::Db;
use crate::error::{Error, Result};

#[tauri::command]
pub async fn learning_summary(db: State<'_, Db>, today: Date) -> Result<LearningSummary> {
    service::summary(&db.conn().await?, today).await
}

#[tauri::command]
pub async fn learning_source(db: State<'_, Db>, id: String, today: Date) -> Result<SourceDetail> {
    service::get_source(&db.conn().await?, &id, today).await
}

#[tauri::command]
pub async fn learning_add_skill(db: State<'_, Db>, fields: SkillFields) -> Result<skill::Model> {
    service::add_skill(&db.conn().await?, fields).await
}

#[tauri::command]
pub async fn learning_update_skill(db: State<'_, Db>, id: String, fields: SkillFields) -> Result<skill::Model> {
    service::update_skill(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn learning_delete_skill(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_skill(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn learning_add_source(db: State<'_, Db>, fields: SourceFields) -> Result<source::Model> {
    service::add_source(&db.conn().await?, fields).await
}

#[tauri::command]
pub async fn learning_update_source(db: State<'_, Db>, id: String, fields: SourceFields) -> Result<source::Model> {
    service::update_source(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn learning_delete_source(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_source(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn learning_add_units(db: State<'_, Db>, source_id: String, units: Vec<Draft>, replace: bool, today: Date) -> Result<Vec<unit::Model>> {
    service::add_units(&db.conn().await?, &source_id, units, replace, today).await
}

#[tauri::command]
pub async fn learning_update_unit(db: State<'_, Db>, id: String, fields: UnitFields) -> Result<unit::Model> {
    service::update_unit(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn learning_delete_unit(db: State<'_, Db>, id: String, today: Date) -> Result<()> {
    service::delete_unit(&db.conn().await?, &id, today).await
}

#[tauri::command]
pub async fn learning_set_done(db: State<'_, Db>, id: String, done: bool, today: Date) -> Result<unit::Model> {
    service::set_done(&db.conn().await?, &id, done, today).await
}

#[tauri::command]
pub async fn learning_review(db: State<'_, Db>, id: String, action: String, today: Date) -> Result<unit::Model> {
    service::review(&db.conn().await?, &id, &action, today).await
}

#[tauri::command]
pub async fn learning_add_session(db: State<'_, Db>, fields: SessionFields) -> Result<session::Model> {
    service::add_session(&db.conn().await?, fields).await
}

#[tauri::command]
pub async fn learning_delete_session(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_session(&db.conn().await?, &id).await
}

/// Units from a pasted contents list or curriculum, to check before adding.
#[tauri::command]
pub fn learning_parse_text(text: String) -> Vec<Draft> {
    outline::from_text(&text)
}

/// The chapters inside an EPUB or PDF, sent as raw bytes with its name in
/// the `x-file-name` header. Read on a worker thread: a textbook PDF is big.
#[tauri::command]
pub async fn learning_read_book(request: Request<'_>) -> Result<Found> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error::Invalid("Choose an EPUB or PDF file.".into()));
    };
    let name = request.headers().get("x-file-name").and_then(|v| v.to_str().ok()).unwrap_or_default().to_owned();
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || outline::from_book(&name, &bytes))
        .await
        .map_err(|_| Error::Invalid("That file couldn't be read.".into()))?
}

#[tauri::command]
pub fn learning_youtube_available() -> bool {
    youtube::available()
}

#[tauri::command]
pub async fn learning_youtube(link: String) -> Result<Found> {
    youtube::playlist(&link).await
}
