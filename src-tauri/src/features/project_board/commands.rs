//! Tauri commands for the Project Board. Each one gets the database
//! connection and hands off to `service.rs`. React calls them by name, e.g.
//! `invoke("board_get", { projectId: 1 })`; Tauri turns the camelCase
//! argument names into these snake_case parameters.

use tauri::State;

use super::entities::{checklist_item, column, label, project, task, template};
use super::service;
use super::types::{ActivityItem, Board, ColumnFields, Insights, Summary, TaskCard, TaskDetail, TaskFields};
use crate::db::Db;
use crate::error::Result;

// ---------- Projects ----------

#[tauri::command]
pub async fn board_list_projects(db: State<'_, Db>) -> Result<Vec<project::Model>> {
    service::list_projects(&db.conn().await?).await
}

#[tauri::command]
pub async fn board_create_project(db: State<'_, Db>, name: String) -> Result<project::Model> {
    service::create_project(&db.conn().await?, &name).await
}

#[tauri::command]
pub async fn board_rename_project(db: State<'_, Db>, id: String, name: String) -> Result<project::Model> {
    service::rename_project(&db.conn().await?, &id, &name).await
}

#[tauri::command]
pub async fn board_delete_project(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_project(&db.conn().await?, &id).await
}

// ---------- Board and columns ----------

#[tauri::command]
pub async fn board_get(db: State<'_, Db>, project_id: String) -> Result<Board> {
    service::get_board(&db.conn().await?, &project_id).await
}

#[tauri::command]
pub async fn board_create_column(db: State<'_, Db>, project_id: String, name: String) -> Result<column::Model> {
    service::create_column(&db.conn().await?, &project_id, &name).await
}

#[tauri::command]
pub async fn board_update_column(db: State<'_, Db>, id: String, fields: ColumnFields) -> Result<column::Model> {
    service::update_column(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn board_move_column(db: State<'_, Db>, id: String, direction: i32) -> Result<Vec<column::Model>> {
    service::move_column(&db.conn().await?, &id, direction).await
}

#[tauri::command]
pub async fn board_delete_column(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_column(&db.conn().await?, &id).await
}

// ---------- Tasks ----------

#[tauri::command]
pub async fn board_create_task(db: State<'_, Db>, column_id: String, title: String) -> Result<TaskCard> {
    service::create_task(&db.conn().await?, &column_id, &title).await
}

#[tauri::command]
pub async fn board_create_subtask(db: State<'_, Db>, parent_id: String, title: String) -> Result<TaskCard> {
    service::create_subtask(&db.conn().await?, &parent_id, &title).await
}

#[tauri::command]
pub async fn board_convert_checklist_item(db: State<'_, Db>, id: String) -> Result<TaskCard> {
    service::convert_checklist_item(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn board_list_archived(db: State<'_, Db>, project_id: String) -> Result<Vec<TaskCard>> {
    service::list_archived(&db.conn().await?, &project_id).await
}

#[tauri::command]
pub async fn board_get_task(db: State<'_, Db>, id: String) -> Result<TaskDetail> {
    service::get_task(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn board_update_task(db: State<'_, Db>, id: String, fields: TaskFields) -> Result<TaskDetail> {
    service::update_task(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn board_move_task(
    db: State<'_, Db>,
    id: String,
    column_id: String,
    before_id: Option<String>,
) -> Result<task::Model> {
    service::move_task(&db.conn().await?, &id, &column_id, before_id.as_deref()).await
}

#[tauri::command]
pub async fn board_archive_task(db: State<'_, Db>, id: String, archived: bool) -> Result<task::Model> {
    service::set_archived(&db.conn().await?, &id, archived).await
}

#[tauri::command]
pub async fn board_delete_task(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_task(&db.conn().await?, &id).await
}

// ---------- Labels ----------

#[tauri::command]
pub async fn board_create_label(db: State<'_, Db>, project_id: String, name: String, color: String) -> Result<label::Model> {
    service::create_label(&db.conn().await?, &project_id, &name, &color).await
}

#[tauri::command]
pub async fn board_update_label(db: State<'_, Db>, id: String, name: String, color: String) -> Result<label::Model> {
    service::update_label(&db.conn().await?, &id, &name, &color).await
}

#[tauri::command]
pub async fn board_delete_label(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_label(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn board_set_task_labels(db: State<'_, Db>, task_id: String, label_ids: Vec<String>) -> Result<Vec<String>> {
    service::set_task_labels(&db.conn().await?, &task_id, label_ids).await
}

// ---------- Checklist ----------

#[tauri::command]
pub async fn board_add_checklist_item(db: State<'_, Db>, task_id: String, text: String) -> Result<checklist_item::Model> {
    service::add_checklist_item(&db.conn().await?, &task_id, &text).await
}

#[tauri::command]
pub async fn board_update_checklist_item(
    db: State<'_, Db>,
    id: String,
    text: String,
    done: bool,
) -> Result<checklist_item::Model> {
    service::update_checklist_item(&db.conn().await?, &id, &text, done).await
}

#[tauri::command]
pub async fn board_delete_checklist_item(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_checklist_item(&db.conn().await?, &id).await
}

// ---------- Overview ----------

#[tauri::command]
pub async fn board_summary(db: State<'_, Db>) -> Result<Summary> {
    service::summary(&db.conn().await?).await
}

// ---------- Templates ----------

#[tauri::command]
pub async fn board_save_template(db: State<'_, Db>, task_id: String, name: String) -> Result<template::Model> {
    service::save_template(&db.conn().await?, &task_id, &name).await
}

#[tauri::command]
pub async fn board_delete_template(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_template(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn board_create_from_template(db: State<'_, Db>, template_id: String, column_id: String) -> Result<TaskCard> {
    service::create_from_template(&db.conn().await?, &template_id, &column_id).await
}

// ---------- Activity and insights ----------

#[tauri::command]
pub async fn board_activity(db: State<'_, Db>, project_id: String) -> Result<Vec<ActivityItem>> {
    service::project_activity(&db.conn().await?, &project_id, 300).await
}

#[tauri::command]
pub async fn board_insights(db: State<'_, Db>, project_id: String) -> Result<Insights> {
    service::insights(&db.conn().await?, &project_id).await
}
