//! Shapes sent to and from React. Mirrored in `src/features/journal/api.ts`.

use sea_orm::prelude::{Date, DateTimeUtc};
use serde::{Deserialize, Serialize};

use super::entities::entry;

/// An entry for lists: everything but the full text, with an excerpt.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryCard {
    pub id: String,
    pub day: Date,
    pub title: String,
    pub mood: Option<i16>,
    pub energy: Option<i16>,
    pub tags: Vec<String>,
    pub prompt: String,
    pub excerpt: String,
    pub words: i32,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

pub use crate::features::doc_edits::EditView;

/// That day in the Daily Plan, shown beside the entry.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDay {
    pub intention: String,
    pub went_well: String,
    pub do_better: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryDetail {
    pub entry: entry::Model,
    pub tags: Vec<String>,
    /// Oldest first; applied together in any order they make the same text.
    pub edits: Vec<EditView>,
    pub plan: Option<PlanDay>,
}

/// Everything about an entry but its text, sent whole.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryFields {
    pub day: Date,
    pub title: String,
    pub mood: Option<i16>,
    pub energy: Option<i16>,
    pub tags: Vec<String>,
    pub prompt: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryFilter {
    pub search: Option<String>,
    pub tag: Option<String>,
    pub mood: Option<i16>,
    /// "2026-10".
    pub month: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayMark {
    pub day: Date,
    pub entries: u32,
    pub words: i32,
    /// The day's average mood, rounded.
    pub mood: Option<i16>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub years_ago: i32,
    pub entry: EntryCard,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalStats {
    pub streak: i32,
    pub longest_streak: i32,
    pub written_today: bool,
    pub entries: u32,
    pub words: i64,
    /// Every day of the last year with something written.
    pub calendar: Vec<DayMark>,
    /// Entries from this day in earlier years.
    pub on_this_day: Vec<Memory>,
    /// The last 30 days' average mood and energy, where recorded.
    pub average_mood: Option<f64>,
    pub average_energy: Option<f64>,
    pub tags: Vec<TagCount>,
}
