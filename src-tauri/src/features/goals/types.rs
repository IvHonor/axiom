//! Shapes sent to and from React. Mirrored in `src/features/goals/api.ts`.

use sea_orm::prelude::Date;
use serde::{Deserialize, Serialize};

use super::entities::{goal, log, milestone};

/// Whether a goal with a deadline is where it should be by now.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Pace {
    Ahead,
    OnTrack,
    Behind,
}

impl Pace {
    pub fn as_str(self) -> &'static str {
        match self {
            Pace::Ahead => "ahead",
            Pace::OnTrack => "on_track",
            Pace::Behind => "behind",
        }
    }
}

/// A goal with its progress worked out from today.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalView {
    #[serde(flatten)]
    pub goal: goal::Model,
    /// Where it is now: the number, or milestones done.
    pub current: f64,
    /// What it's aiming for (milestones: how many there are).
    pub target: f64,
    /// 0 to 100.
    pub percent: f64,
    /// Where it should be by today, on a straight line to the deadline.
    pub expected: Option<f64>,
    pub pace: Option<Pace>,
    /// To keep pace from here: how much a week, for targets.
    pub per_week: Option<f64>,
    /// Days to the deadline (negative once it's passed).
    pub days_left: Option<i32>,
    /// The target's been reached (or every milestone's done).
    pub reached: bool,
    /// What the number comes from, in words ("Savings account"), for
    /// goals that follow another extension.
    pub source_name: Option<String>,
    /// The last check-in or milestone ticked.
    pub last_progress: Option<Date>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalDetail {
    pub goal: GoalView,
    /// Newest first.
    pub logs: Vec<log::Model>,
    pub milestones: Vec<milestone::Model>,
}

/// Everything about a goal but its progress, sent whole.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalFields {
    pub title: String,
    #[serde(default)]
    pub icon: String,
    pub area: String,
    pub kind: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub source_id: String,
    #[serde(default)]
    pub start_value: f64,
    #[serde(default)]
    pub target_value: f64,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub measure: String,
    pub start_date: Date,
    pub due_date: Option<Date>,
    #[serde(default)]
    pub why: String,
    #[serde(default)]
    pub obstacle: String,
    #[serde(default)]
    pub plan: String,
}

/// What a goal can follow in the other extensions.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sources {
    pub accounts: Vec<SourceOption>,
    pub projects: Vec<SourceOption>,
    pub modules: Vec<SourceOption>,
    /// Learning sources, "Skill · Title".
    pub learning: Vec<SourceOption>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceOption {
    pub id: String,
    pub name: String,
    /// An account's currency.
    pub unit: String,
}

/// The year in goals, for the top of the page.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalsSummary {
    pub active: u32,
    pub on_track: u32,
    pub behind: u32,
    pub done_this_year: u32,
}
