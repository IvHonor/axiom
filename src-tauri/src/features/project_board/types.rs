//! Shapes sent to and received from React. Mirrored in
//! `src/features/project_board/api.ts`; keep the two in step.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::entities::{checklist_item, column, label, project, task, task_event, template};

/// Everything the board view needs for one project.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub project: project::Model,
    pub columns: Vec<column::Model>,
    pub tasks: Vec<TaskCard>,
    pub labels: Vec<label::Model>,
    pub templates: Vec<template::Model>,
}

/// A task as shown on the front of its card.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCard {
    #[serde(flatten)]
    pub task: task::Model,
    pub label_ids: Vec<String>,
    pub checklist_done: usize,
    pub checklist_total: usize,
    pub subtask_done: usize,
    pub subtask_total: usize,
    /// Set when this card is a sub-task.
    pub parent_title: Option<String>,
}

/// A task with everything the detail drawer shows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDetail {
    #[serde(flatten)]
    pub task: task::Model,
    pub label_ids: Vec<String>,
    pub checklist: Vec<checklist_item::Model>,
    pub events: Vec<task_event::Model>,
    pub subtasks: Vec<task::Model>,
    pub parent: Option<TaskRef>,
}

/// Just enough of a task to link to it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRef {
    pub id: String,
    pub title: String,
}

/// The editable fields of a task. The drawer always sends all of them.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskFields {
    pub title: String,
    pub description: String,
    pub priority: i16,
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
    pub estimate: Option<f64>,
    /// See `RECURRENCES` in service.rs; None means it doesn't repeat.
    pub recurrence: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnFields {
    pub name: String,
    pub is_done: bool,
    pub wip_limit: Option<i32>,
}

/// Feeds the overview tile.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub today: NaiveDate,
    pub projects: Vec<ProjectSummary>,
    /// Open tasks that are overdue or due within a week, soonest first.
    pub due_soon: Vec<DueTask>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub color: String,
    pub total: usize,
    pub done: usize,
    pub overdue: usize,
    pub columns: Vec<ColumnCount>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnCount {
    pub name: String,
    pub count: usize,
    pub is_done: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DueTask {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub title: String,
    pub due_date: NaiveDate,
}

/// One line of the project-wide activity feed.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    pub id: String,
    pub task_id: String,
    pub task_title: String,
    pub kind: String,
    pub detail: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Numbers for the Insights view.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Insights {
    /// Last 30 days: how many tasks existed and how many were done, day by day.
    pub burnup: Vec<BurnupPoint>,
    /// Tasks completed in each of the last 8 weeks (weeks start on Monday).
    pub throughput: Vec<WeekCount>,
    pub open_by_column: Vec<NamedCount>,
    pub open_by_priority: Vec<NamedCount>,
    pub open_by_label: Vec<LabelCount>,
    /// Average days from creation to completion.
    pub avg_cycle_days: Option<f64>,
    pub open: usize,
    pub overdue: usize,
    pub created_last_7: usize,
    pub completed_last_7: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BurnupPoint {
    pub date: NaiveDate,
    pub total: usize,
    pub done: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekCount {
    pub week_start: NaiveDate,
    pub done: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedCount {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelCount {
    pub name: String,
    pub color: String,
    pub count: usize,
}

/// A card as the Daily Plan shows it: suggested for the day, or linked to a
/// planner task.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannableCard {
    pub id: String,
    pub title: String,
    pub project_name: String,
    /// A palette name, as for projects.
    pub project_color: String,
    pub column_name: String,
    pub due_date: Option<NaiveDate>,
    /// The card's estimate, converted from hours.
    pub estimate_minutes: Option<i32>,
    /// In the column just before Done (usually "Doing").
    pub in_progress: bool,
    pub done: bool,
}
