//! Tauri commands for Goals, wrapped by `src/features/goals/api.ts`.
//! Days arrive as "YYYY-MM-DD" in the user's own time zone.

use sea_orm::prelude::Date;
use tauri::State;

use super::entities::milestone;
use super::service;
use super::types::{GoalDetail, GoalFields, GoalView, GoalsSummary, Sources};
use crate::db::Db;
use crate::error::Result;

#[tauri::command]
pub async fn goals_list(db: State<'_, Db>, today: Date) -> Result<Vec<GoalView>> {
    service::list(&db.conn().await?, today).await
}

#[tauri::command]
pub async fn goals_get(db: State<'_, Db>, id: String, today: Date) -> Result<GoalDetail> {
    service::get(&db.conn().await?, &id, today).await
}

#[tauri::command]
pub async fn goals_summary(db: State<'_, Db>, today: Date) -> Result<GoalsSummary> {
    service::summary(&db.conn().await?, today).await
}

/// What a goal can follow in the other extensions.
#[tauri::command]
pub async fn goals_sources(db: State<'_, Db>, today: Date) -> Result<Sources> {
    service::sources(&db.conn().await?, today).await
}

#[tauri::command]
pub async fn goals_create(db: State<'_, Db>, fields: GoalFields, today: Date) -> Result<GoalView> {
    service::create(&db.conn().await?, fields, today).await
}

#[tauri::command]
pub async fn goals_update(db: State<'_, Db>, id: String, fields: GoalFields, today: Date) -> Result<GoalView> {
    service::update(&db.conn().await?, &id, fields, today).await
}

#[tauri::command]
pub async fn goals_set_status(db: State<'_, Db>, id: String, status: String, today: Date) -> Result<GoalView> {
    service::set_status(&db.conn().await?, &id, &status, today).await
}

#[tauri::command]
pub async fn goals_move(db: State<'_, Db>, id: String, before: Option<String>) -> Result<()> {
    service::move_goal(&db.conn().await?, &id, before.as_deref()).await
}

#[tauri::command]
pub async fn goals_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn goals_log(db: State<'_, Db>, goal_id: String, day: Date, value: f64, note: String, today: Date) -> Result<GoalView> {
    service::add_log(&db.conn().await?, &goal_id, day, value, &note, today).await
}

#[tauri::command]
pub async fn goals_log_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_log(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn goals_milestone_add(db: State<'_, Db>, goal_id: String, title: String, due_date: Option<Date>) -> Result<milestone::Model> {
    service::add_milestone(&db.conn().await?, &goal_id, &title, due_date).await
}

#[tauri::command]
pub async fn goals_milestone_update(db: State<'_, Db>, id: String, title: String, due_date: Option<Date>) -> Result<milestone::Model> {
    service::update_milestone(&db.conn().await?, &id, &title, due_date).await
}

#[tauri::command]
pub async fn goals_milestone_tick(db: State<'_, Db>, id: String, done: bool, today: Date) -> Result<milestone::Model> {
    service::tick_milestone(&db.conn().await?, &id, done, today).await
}

#[tauri::command]
pub async fn goals_milestone_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_milestone(&db.conn().await?, &id).await
}
