//! Shapes sent to and from React. Mirrored in `src/features/birthdays/api.ts`.

use sea_orm::prelude::{Date, DateTimeUtc};
use serde::{Deserialize, Serialize};

use super::entities::gift;

/// A person with what's worked out from today: when it comes next, and ages.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonView {
    pub id: String,
    pub name: String,
    pub occasion: String,
    pub month: i16,
    pub day: i16,
    pub year: Option<i32>,
    pub relation: String,
    pub notes: String,
    pub remind_days: i32,
    /// The next time it comes round: today, if it's today. 29 February falls
    /// on the 28th in other years.
    pub next: Date,
    /// Days until `next`: 0 for today.
    pub days: i32,
    /// How old they are today (or years married), when the year is known.
    pub age: Option<i32>,
    /// What they'll be on `next`.
    pub turning: Option<i32>,
    /// Gift ideas not given yet.
    pub ideas: u32,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonDetail {
    pub person: PersonView,
    /// Ideas first, then bought, then given (newest year first).
    pub gifts: Vec<gift::Model>,
}

/// Everything about a person, sent whole.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonFields {
    pub name: String,
    pub occasion: String,
    pub month: i16,
    pub day: i16,
    pub year: Option<i32>,
    pub relation: String,
    #[serde(default)]
    pub notes: String,
    pub remind_days: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftFields {
    pub idea: String,
    #[serde(default)]
    pub url: String,
    pub status: String,
}

/// What importing a contacts file did.
#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub added: u32,
    /// Already here (same name and date).
    pub already: u32,
    /// Contacts with no birthday or anniversary on them.
    pub without_date: u32,
}
