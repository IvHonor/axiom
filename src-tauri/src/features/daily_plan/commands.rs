//! Tauri commands for the Daily Plan, wrapped by
//! `src/features/daily_plan/api.ts`. Days arrive as "YYYY-MM-DD" in the
//! user's own time zone.

use sea_orm::prelude::Date;
use tauri::State;

use super::entities::{block, task};
use super::service;
use super::types::{
    BlockFields, CarryTo, DayFields, DayInfo, DayPlan, QuickAdded, ScheduleResult, Settings, TaskFields, TodaySummary,
};
use crate::db::Db;
use crate::error::Result;

#[tauri::command]
pub async fn plan_get_day(db: State<'_, Db>, day: Date, today: Date) -> Result<DayPlan> {
    service::get_day(&db.conn().await?, day, today).await
}

#[tauri::command]
pub async fn plan_summary(db: State<'_, Db>, today: Date, now_minute: i32) -> Result<TodaySummary> {
    service::summary(&db.conn().await?, today, now_minute).await
}

#[tauri::command]
pub async fn plan_quick_add(db: State<'_, Db>, text: String, day: Date, today: Date) -> Result<QuickAdded> {
    service::quick_add(&db.conn().await?, &text, day, today).await
}

#[tauri::command]
pub async fn plan_create_task(db: State<'_, Db>, title: String, day: Option<Date>, estimate_minutes: Option<i32>) -> Result<task::Model> {
    service::create_task(&db.conn().await?, &title, day, estimate_minutes).await
}

#[tauri::command]
pub async fn plan_update_task(db: State<'_, Db>, id: String, fields: TaskFields) -> Result<task::Model> {
    service::update_task(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn plan_set_done(db: State<'_, Db>, id: String, done: bool) -> Result<task::Model> {
    service::set_done(&db.conn().await?, &id, done).await
}

#[tauri::command]
pub async fn plan_set_focus(db: State<'_, Db>, id: String, focus: bool) -> Result<task::Model> {
    service::set_focus(&db.conn().await?, &id, focus).await
}

#[tauri::command]
pub async fn plan_move_task(db: State<'_, Db>, id: String, day: Option<Date>, before_id: Option<String>) -> Result<task::Model> {
    service::move_task(&db.conn().await?, &id, day, before_id.as_deref()).await
}

#[tauri::command]
pub async fn plan_carry_over(db: State<'_, Db>, ids: Vec<String>, to: CarryTo, today: Date) -> Result<()> {
    service::carry_over(&db.conn().await?, &ids, to, today).await
}

#[tauri::command]
pub async fn plan_delete_task(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_task(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn plan_create_block(
    db: State<'_, Db>,
    day: Date,
    start_minute: i32,
    duration_minutes: i32,
    title: String,
    task_id: Option<String>,
) -> Result<block::Model> {
    service::create_block(&db.conn().await?, day, start_minute, duration_minutes, &title, task_id.as_deref()).await
}

#[tauri::command]
pub async fn plan_update_block(db: State<'_, Db>, id: String, fields: BlockFields) -> Result<block::Model> {
    service::update_block(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn plan_delete_block(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_block(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn plan_update_settings(db: State<'_, Db>, settings: Settings) -> Result<Settings> {
    service::update_settings(&db.conn().await?, settings).await
}

#[tauri::command]
pub async fn plan_start_timer(db: State<'_, Db>, id: String) -> Result<task::Model> {
    service::start_timer(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn plan_stop_timer(db: State<'_, Db>, id: String) -> Result<task::Model> {
    service::stop_timer(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn plan_card(db: State<'_, Db>, card_id: String, day: Option<Date>) -> Result<task::Model> {
    service::plan_card(&db.conn().await?, &card_id, day).await
}

#[tauri::command]
pub async fn plan_update_day(db: State<'_, Db>, day: Date, fields: DayFields) -> Result<DayInfo> {
    service::update_day(&db.conn().await?, day, fields).await
}

#[tauri::command]
pub async fn plan_replan(db: State<'_, Db>, day: Date, now_minute: i32) -> Result<ScheduleResult> {
    service::replan(&db.conn().await?, day, now_minute).await
}

#[tauri::command]
pub async fn plan_fit_into_day(db: State<'_, Db>, day: Date, from_minute: i32) -> Result<ScheduleResult> {
    service::fit_into_day(&db.conn().await?, day, from_minute).await
}
