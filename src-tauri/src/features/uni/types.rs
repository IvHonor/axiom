//! Shapes sent to and from React. Mirrored in `src/features/uni/api.ts`.

use sea_orm::prelude::Date;
use serde::{Deserialize, Serialize};

use super::entities::{lecture, module, term};

/// A term with where today falls in it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermCard {
    #[serde(flatten)]
    pub term: term::Model,
    /// The Sunday of the last week.
    pub ends_on: Date,
    /// The teaching week today is in; None before or after the term.
    pub week: Option<i32>,
}

/// A module with how far through its lectures you are.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleCard {
    #[serde(flatten)]
    pub module: module::Model,
    pub lectures: u32,
    pub attended: u32,
    pub caught_up: u32,
    pub reviewed: u32,
    /// Lectures that have been and gone without being caught up on.
    pub behind: u32,
    /// Lectures marked shaky.
    pub shaky: u32,
    /// Caught up on, 0 to 100. None while the module has no lectures.
    pub percent: Option<f64>,
    /// The next one on, today or later.
    pub next: Option<lecture::Model>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDetail {
    pub card: ModuleCard,
    pub term: TermCard,
    /// In teaching order: by week and day, then as added.
    pub lectures: Vec<lecture::Model>,
}

/// A lecture with the module it belongs to, for lists across modules.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LectureHit {
    #[serde(flatten)]
    pub lecture: lecture::Model,
    pub module_code: String,
    pub module_name: String,
    pub module_color: String,
    /// How many days since it was on (behind), or until it's on (coming up).
    pub days: i64,
}

/// For the main view, the side panel and the overview tile.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UniSummary {
    pub terms: Vec<TermCard>,
    /// The term on now, or the nearest one.
    pub current: Option<String>,
    /// The current term's modules.
    pub modules: Vec<ModuleCard>,
    /// The current term's lectures you're behind on, longest overdue first.
    pub behind: Vec<LectureHit>,
    /// The current term's lectures in the next seven days, soonest first.
    pub upcoming: Vec<LectureHit>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermFields {
    pub name: String,
    pub starts_on: Date,
    pub weeks: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleFields {
    pub term_id: String,
    pub code: String,
    pub name: String,
    pub color: String,
    pub credits: Option<i32>,
    pub link: Option<String>,
}

/// Everything about a lecture you can edit, sent whole. The stages are set
/// on their own (`set_stage`).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LectureFields {
    pub title: String,
    pub kind: String,
    pub week: Option<i32>,
    pub day: Option<Date>,
    pub topics: String,
    pub recorded: bool,
    pub confidence: Option<i16>,
    pub notes: String,
}

/// A run of lectures to add at once: one on each weekday given, every week
/// in the range except those skipped (reading week).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub kind: String,
    /// Titles are this and a number: "Lecture 1", "Lecture 2"…
    pub title: String,
    /// 0 is Monday, 6 is Sunday.
    pub weekdays: Vec<u32>,
    pub from_week: i32,
    pub to_week: i32,
    #[serde(default)]
    pub skip_weeks: Vec<i32>,
    pub recorded: bool,
}
