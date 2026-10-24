//! Shapes sent to and from React. Mirrored in `src/features/learning/api.ts`.

use sea_orm::prelude::Date;
use serde::{Deserialize, Serialize};

use super::entities::{session, skill, source, unit};

/// How far through a source (or a whole skill) you are. Headings, the units
/// with deeper ones under them, don't count: their chapters and sections do.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tally {
    pub done: u32,
    pub total: u32,
    /// Done, 0 to 100. None while there's nothing to do.
    pub percent: Option<f64>,
    /// Due for review today or before.
    pub reviews: u32,
    /// Studied in the last seven days.
    pub week_minutes: i32,
    pub total_minutes: i32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCard {
    #[serde(flatten)]
    pub source: source::Model,
    pub tally: Tally,
    /// The next unit to do, in order.
    pub next: Option<String>,
    pub last_studied: Option<Date>,
    /// When it'll be done at your pace over the last four weeks.
    pub expected: Option<Date>,
    /// Units a week needed to finish by `finish_by`.
    pub needed_per_week: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCard {
    #[serde(flatten)]
    pub skill: skill::Model,
    pub tally: Tally,
    pub sources: Vec<SourceCard>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDetail {
    pub card: SourceCard,
    pub skill: skill::Model,
    /// In order.
    pub units: Vec<unit::Model>,
    /// Newest first.
    pub sessions: Vec<session::Model>,
}

/// A unit with where it's from, for lists across sources.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitHit {
    #[serde(flatten)]
    pub unit: unit::Model,
    pub source_title: String,
    pub skill_name: String,
    pub skill_icon: String,
    pub skill_color: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHit {
    #[serde(flatten)]
    pub session: session::Model,
    pub source_title: String,
    pub skill_icon: String,
}

/// One day of the last fortnight: minutes studied and units done.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub day: Date,
    pub minutes: i32,
    pub units: u32,
}

/// For the main view, the side panel and the overview tile.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningSummary {
    /// Active skills first, then archived ones.
    pub skills: Vec<SkillCard>,
    /// Due for review today or before, longest waiting first.
    pub reviews: Vec<UnitHit>,
    /// The last 14 days, oldest first.
    pub days: Vec<Day>,
    /// Days in a row with some study, up to today (or yesterday).
    pub streak: u32,
    pub today_minutes: i32,
    pub week_minutes: i32,
    pub week_units: u32,
    /// The latest sessions, newest first.
    pub recent: Vec<SessionHit>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFields {
    pub name: String,
    pub icon: String,
    pub color: String,
    pub why: String,
    #[serde(default)]
    pub archived: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFields {
    pub skill_id: String,
    pub kind: String,
    pub title: String,
    pub author: String,
    pub link: Option<String>,
    pub cover_url: Option<String>,
    pub unit_name: String,
    pub finish_by: Option<Date>,
    pub notes: String,
}

/// A unit to add: typed, pasted, or read from a book file or playlist.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub title: String,
    #[serde(default)]
    pub level: i16,
    #[serde(default)]
    pub minutes: Option<i32>,
    #[serde(default)]
    pub page: Option<i32>,
}

/// Everything about a unit you can edit. Done and review are set on their own.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitFields {
    pub title: String,
    pub level: i16,
    pub minutes: Option<i32>,
    pub page: Option<i32>,
    pub notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFields {
    pub source_id: String,
    pub day: Date,
    pub minutes: i32,
    pub note: String,
}

/// What an import found, to check before adding.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    /// The book's or playlist's own title, if it has one.
    pub title: Option<String>,
    pub author: Option<String>,
    pub units: Vec<Draft>,
}
