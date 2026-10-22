//! Shapes sent to and from React. Mirrored in `src/features/reading/api.ts`.

use sea_orm::prelude::Date;
use serde::{Deserialize, Serialize};

use super::entities::{book, note, read, session};

/// A book with what's worked out from it: where you are and when you'll finish.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookCard {
    #[serde(flatten)]
    pub book: book::Model,
    /// What `progress` runs up to: pages, 100 or minutes. None when unknown.
    pub total: Option<i32>,
    /// 0 to 100, when the total is known.
    pub percent: Option<f64>,
    /// At your recent pace; only while reading.
    pub finish_estimate: Option<Date>,
    pub last_read: Option<Date>,
    pub notes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookDetail {
    pub card: BookCard,
    /// Newest first.
    pub sessions: Vec<session::Model>,
    /// In page order, unpaged ones last.
    pub notes: Vec<note::Model>,
    /// Earlier reads, newest first.
    pub reads: Vec<read::Model>,
}

/// A book to add, usually from a search result.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBook {
    pub title: String,
    #[serde(default)]
    pub authors: String,
    pub cover_url: Option<String>,
    pub work_key: Option<String>,
    pub edition_key: Option<String>,
    pub isbn: Option<String>,
    pub published_year: Option<i32>,
    pub api_pages: Option<i32>,
    pub pages: Option<i32>,
    pub format: String,
    pub unit: Option<String>,
    pub audio_minutes: Option<i32>,
    pub status: String,
}

/// Everything about a book you can edit, sent whole.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookFields {
    pub title: String,
    pub authors: String,
    pub cover_url: Option<String>,
    pub pages: Option<i32>,
    pub format: String,
    pub unit: String,
    pub audio_minutes: Option<i32>,
    pub rating: Option<i16>,
    pub review: String,
    pub started_on: Option<Date>,
    pub finished_on: Option<Date>,
}

/// A different edition picked for a book: its own pages, cover and ISBN.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditionChoice {
    pub edition_key: String,
    pub pages: Option<i32>,
    pub cover_url: Option<String>,
    pub isbn: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFields {
    pub kind: String,
    pub page: Option<i32>,
    pub text: String,
}

/// A note with the book it's from, for searching across books.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteHit {
    #[serde(flatten)]
    pub note: note::Model,
    pub book_title: String,
    pub book_authors: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub year: i32,
    /// None when no goal is set.
    pub books: Option<i32>,
    pub finished: i32,
    /// Where you'd be today reading evenly through the year.
    pub expected: f64,
}

/// For the overview tile and the side panel.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSummary {
    pub reading: Vec<BookCard>,
    pub goal: Goal,
    pub streak: i32,
    pub pages_today: i32,
    /// How many books on each shelf: want, reading, finished, dnf.
    pub shelves: Shelves,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelves {
    pub want: u32,
    pub reading: u32,
    pub finished: u32,
    pub dnf: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishedBook {
    pub book_id: String,
    pub title: String,
    pub authors: String,
    pub cover_url: Option<String>,
    pub finished_on: Date,
    pub rating: Option<i16>,
    pub days: Option<i64>,
    pub outcome: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthStats {
    pub month: u32,
    pub books: i32,
    pub pages: i32,
    pub minutes: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingStats {
    pub goal: Goal,
    pub pages: i32,
    /// Audiobooks listened to.
    pub listened_minutes: i32,
    /// Reading time entered for print and ebooks.
    pub reading_minutes: i32,
    pub months: Vec<MonthStats>,
    /// Finished (and put down) this year, newest first.
    pub finished: Vec<FinishedBook>,
    pub streak: i32,
    pub longest_streak: i32,
    /// Over the last 30 days.
    pub pages_per_day: f64,
    pub average_rating: Option<f64>,
    /// Start to finish, for books finished this year.
    pub average_days: Option<f64>,
    pub reading_days: i32,
}
