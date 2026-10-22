//! The shapes the Daily Plan sends to and receives from React. Mirrored in
//! `src/features/daily_plan/api.ts`.

use chrono::{DateTime, Utc};
use sea_orm::prelude::Date;
use serde::{Deserialize, Serialize};

use super::entities::{block, event, task};
use crate::features::project_board::types::PlannableCard;

/// Everything the planner shows for one day.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayPlan {
    pub day: Date,
    /// The day's tasks: top priorities first (by rank), then in list order.
    pub tasks: Vec<task::Model>,
    pub blocks: Vec<block::Model>,
    /// From imported calendars: fixed, read-only.
    pub events: Vec<event::Model>,
    /// Unfinished tasks from earlier days. Only filled in for today.
    pub earlier: Vec<task::Model>,
    /// Tasks without a day.
    pub inbox: Vec<task::Model>,
    pub settings: Settings,
    /// The day's intention and reflection, and whether it's been planned or shut down.
    pub info: DayInfo,
    /// Project Board cards linked to the tasks above.
    pub cards: Vec<PlannableCard>,
    /// Board cards due, overdue or in progress that aren't planned yet.
    pub suggestions: Vec<PlannableCard>,
    /// The task whose timer is running, on any day.
    pub running: Option<task::Model>,
    /// How long tasks really take compared with their estimates (1.3 means
    /// 30% longer), from recent history. None until there's enough of it.
    pub pace: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayInfo {
    pub intention: String,
    pub went_well: String,
    pub do_better: String,
    pub planned_at: Option<DateTime<Utc>>,
    pub shutdown_at: Option<DateTime<Utc>>,
}

/// Changes to a day: fields left out stay as they are.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayFields {
    pub intention: Option<String>,
    pub went_well: Option<String>,
    pub do_better: Option<String>,
    /// Marks the morning planning as done.
    pub planned: Option<bool>,
    /// Marks the evening shutdown as done.
    pub shut_down: Option<bool>,
}

/// What scheduling or replanning did, by task title.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleResult {
    pub scheduled: Vec<String>,
    /// Didn't fit before the end of the working day.
    pub left_over: Vec<String>,
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
    /// The task being timed, if any.
    pub running: Option<task::Model>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextBlock {
    pub start_minute: i32,
    pub duration_minutes: i32,
    pub title: String,
    pub in_progress: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineFields {
    pub title: String,
    pub start_minute: i32,
    pub duration_minutes: i32,
    pub color: String,
    /// Monday is bit 0 (1), Sunday bit 6 (64).
    pub weekdays: i16,
}

/// Patterns over recent weeks, for the Insights view.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanInsights {
    /// Tracked time against estimates over the last 30 days (see `DayPlan::pace`).
    pub pace: Option<f64>,
    /// How many tasks the pace is based on.
    pub paced_tasks: usize,
    /// Time tracked on each of the last 8 weeks, oldest first.
    pub weeks: Vec<WeekFocus>,
    /// Planned and finished tasks on each of the last 14 days, oldest first.
    pub days: Vec<DayDone>,
    /// Days in a row the day was planned (counting today only once it is).
    pub planning_streak: u32,
    pub shutdown_streak: u32,
    /// Top priorities over the last 30 days, and how many got done.
    pub focus_total: usize,
    pub focus_done: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekFocus {
    /// The Monday the week starts on.
    pub week_start: Date,
    pub tracked_minutes: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayDone {
    pub day: Date,
    pub planned: usize,
    pub done: usize,
}
