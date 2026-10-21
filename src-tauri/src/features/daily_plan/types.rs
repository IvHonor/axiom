//! The shapes the Daily Plan sends to and receives from React. Mirrored in
//! `src/features/daily_plan/api.ts`.

use sea_orm::prelude::Date;
use serde::{Deserialize, Serialize};

use super::entities::{block, task};

/// Everything the planner shows for one day.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayPlan {
    pub day: Date,
    /// The day's tasks: top priorities first (by rank), then in list order.
    pub tasks: Vec<task::Model>,
    pub blocks: Vec<block::Model>,
    /// Unfinished tasks from earlier days. Only filled in for today.
    pub earlier: Vec<task::Model>,
    /// Tasks without a day.
    pub inbox: Vec<task::Model>,
    pub settings: Settings,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// The working day, in minutes after midnight, for the capacity bar.
    pub day_start_minute: i32,
    pub day_end_minute: i32,
    /// Share of the day kept free for the unexpected.
    pub buffer_percent: i16,
}

impl Default for Settings {
    fn default() -> Self {
        Self { day_start_minute: 9 * 60, day_end_minute: 17 * 60 + 30, buffer_percent: 20 }
    }
}

/// What quick add created.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickAdded {
    pub task: task::Model,
    pub block: Option<block::Model>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskFields {
    pub title: String,
    pub notes: String,
    pub estimate_minutes: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockFields {
    pub start_minute: i32,
    pub duration_minutes: i32,
    pub title: String,
    pub color: String,
}

/// Where carried-over tasks go.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CarryTo {
    Today,
    Inbox,
    Delete,
}

/// The overview tile.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodaySummary {
    pub total: usize,
    pub done: usize,
    /// The top priorities, in rank order.
    pub focus: Vec<task::Model>,
    /// The next block starting after `now_minute`, or the one under way.
    pub next_block: Option<NextBlock>,
    pub planned_minutes: i32,
    pub available_minutes: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextBlock {
    pub start_minute: i32,
    pub duration_minutes: i32,
    pub title: String,
    pub in_progress: bool,
}
