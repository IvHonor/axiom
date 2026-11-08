//! A week or month of notes for the Analytics view: notes started, notes
//! worked on, and what they were about.
//!
//! Work on a note is read from its edits. Compacting a note buries the edits
//! it replaces but keeps their rows, so they're read here too: each one
//! still says when you wrote.

use std::collections::{BTreeSet, HashMap};

use chrono::Days;
use sea_orm::prelude::{Date, DateTimeUtc};
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QuerySelect};
use serde::Serialize;

use super::entities::{edit, note};
use super::service::{notes, split_tags};
use crate::error::Result;
use crate::features::period::{local_day, Compare, Headline, Period};

/// How many tags the period lists.
const TOP_TAGS: usize = 8;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesAnalytics {
    /// Notes worked on: started or edited.
    pub headline: Headline,
    pub created: Compare,
    pub days: Vec<NotesDay>,
    pub tags: Vec<TagCount>,
    /// Notes now, not counting the trash.
    pub total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesDay {
    pub day: Date,
    pub created: usize,
    /// Notes written in, new ones included.
    pub worked_on: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub name: String,
    pub count: usize,
}

fn midnight_utc(day: Date) -> DateTimeUtc {
    day.and_hms_opt(0, 0, 0).expect("midnight exists").and_utc()
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<NotesAnalytics> {
    let live: HashMap<String, note::Model> = notes().all(db).await?.into_iter().map(|n| (n.id.clone(), n)).collect();
    // A day either side, so every local day of the range is in.
    let edited: Vec<(String, DateTimeUtc)> = edit::Entity::find()
        .select_only()
        .columns([edit::Column::NoteId, edit::Column::CreatedAt])
        .filter(edit::Column::CreatedAt.gte(midnight_utc(period.trend_start() - Days::new(1))))
        .filter(edit::Column::CreatedAt.lt(midnight_utc(period.end + Days::new(1))))
        .into_tuple()
        .all(db)
        .await?;
    // Each note on each day it was worked on, once.
    let worked: BTreeSet<(Date, &str)> = edited
        .iter()
        .filter(|(id, _)| live.contains_key(id))
        .map(|(id, at)| (local_day(*at), id.as_str()))
        .chain(live.values().map(|n| (local_day(n.created_at), n.id.as_str())))
        .collect();
    let worked_within = |from: Date, to: Date| worked.range((from, "")..(to, "")).map(|(_, id)| *id);
    let created_on = |n: &note::Model| local_day(n.created_at);

    let mut tags: HashMap<String, usize> = HashMap::new();
    for id in worked_within(period.start, period.end).collect::<BTreeSet<_>>() {
        for tag in split_tags(&live[id].tags) {
            *tags.entry(tag).or_default() += 1;
        }
    }
    let mut tags: Vec<TagCount> = tags.into_iter().map(|(name, count)| TagCount { name, count }).collect();
    tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    tags.truncate(TOP_TAGS);

    Ok(NotesAnalytics {
        headline: period.headline(|from, to| Some(worked_within(from, to).collect::<BTreeSet<_>>().len() as f64)),
        created: period.compare(|from, to| Some(live.values().filter(|n| (from..to).contains(&created_on(n))).count() as f64)),
        days: period.daily(|d| NotesDay {
            day: d,
            created: live.values().filter(|n| created_on(n) == d).count(),
            worked_on: worked.iter().filter(|(day, _)| *day == d).count(),
        }),
        tags,
        total: live.values().filter(|n| n.trashed_at.is_none()).count(),
    })
}
