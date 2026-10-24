//! Tauri commands for University, wrapped by `src/features/uni/api.ts`. Days
//! arrive as "YYYY-MM-DD" in the user's own time zone.

use sea_orm::prelude::Date;
use tauri::State;

use super::entities::lecture;
use super::service;
use super::types::{LectureFields, ModuleCard, ModuleDetail, ModuleFields, Schedule, TermCard, TermFields, UniSummary};
use crate::db::Db;
use crate::error::Result;

#[tauri::command]
pub async fn uni_summary(db: State<'_, Db>, today: Date) -> Result<UniSummary> {
    service::summary(&db.conn().await?, today).await
}

#[tauri::command]
pub async fn uni_modules(db: State<'_, Db>, term_id: String, today: Date) -> Result<Vec<ModuleCard>> {
    service::list_modules(&db.conn().await?, &term_id, today).await
}

#[tauri::command]
pub async fn uni_module(db: State<'_, Db>, id: String, today: Date) -> Result<ModuleDetail> {
    service::get_module(&db.conn().await?, &id, today).await
}

#[tauri::command]
pub async fn uni_add_term(db: State<'_, Db>, fields: TermFields, today: Date) -> Result<TermCard> {
    service::add_term(&db.conn().await?, fields, today).await
}

#[tauri::command]
pub async fn uni_update_term(db: State<'_, Db>, id: String, fields: TermFields, today: Date) -> Result<TermCard> {
    service::update_term(&db.conn().await?, &id, fields, today).await
}

#[tauri::command]
pub async fn uni_delete_term(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_term(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn uni_add_module(db: State<'_, Db>, fields: ModuleFields, today: Date) -> Result<ModuleCard> {
    service::add_module(&db.conn().await?, fields, today).await
}

#[tauri::command]
pub async fn uni_update_module(db: State<'_, Db>, id: String, fields: ModuleFields, today: Date) -> Result<ModuleCard> {
    service::update_module(&db.conn().await?, &id, fields, today).await
}

#[tauri::command]
pub async fn uni_delete_module(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_module(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn uni_add_lecture(db: State<'_, Db>, module_id: String, fields: LectureFields) -> Result<lecture::Model> {
    service::add_lecture(&db.conn().await?, &module_id, fields).await
}

#[tauri::command]
pub async fn uni_add_schedule(db: State<'_, Db>, module_id: String, schedule: Schedule) -> Result<Vec<lecture::Model>> {
    service::add_schedule(&db.conn().await?, &module_id, schedule).await
}

#[tauri::command]
pub async fn uni_update_lecture(db: State<'_, Db>, id: String, fields: LectureFields) -> Result<lecture::Model> {
    service::update_lecture(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn uni_set_stage(db: State<'_, Db>, id: String, stage: String, done: bool, today: Date) -> Result<lecture::Model> {
    service::set_stage(&db.conn().await?, &id, &stage, done, today).await
}

#[tauri::command]
pub async fn uni_delete_lecture(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_lecture(&db.conn().await?, &id).await
}
