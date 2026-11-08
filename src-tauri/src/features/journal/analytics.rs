//! A week or month of writing for the Analytics view: which days you wrote,
//! how much, how you felt, and what about.

use std::collections::{BTreeSet, HashMap};

use sea_orm::prelude::Date;
use sea_orm::{ColumnTrait, DatabaseConnection, QueryFilter};
use serde::Serialize;

use super::entities::entry;
use super::service::{entries, split_tags};
use crate::error::Result;
use crate::features::period::{Compare, Headline, Period};

/// How many tags the period lists.
const TOP_TAGS: usize = 8;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalAnalytics {
    /// Days written on.
    pub headline: Headline,
    pub words: Compare,
    /// Averages on the 1 to 5 scales, from entries that have one.
    pub mood: Compare,
    pub energy: Compare,
    pub days: Vec<JournalDay>,
    /// Most used first.
    pub tags: Vec<TagCount>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalDay {
    pub day: Date,
    pub entries: usize,
    pub words: i32,
    pub mood: Option<f64>,
    pub energy: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub name: String,
    pub count: usize,
}

fn average<'a>(values: impl Iterator<Item = &'a Option<i16>>) -> Option<f64> {
    let known: Vec<f64> = values.flatten().map(|v| f64::from(*v)).collect();
    (!known.is_empty()).then(|| known.iter().sum::<f64>() / known.len() as f64)
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<JournalAnalytics> {
    // An entry counts once something's in it, as in the streak.
    let written: Vec<entry::Model> = entries()
        .filter(entry::Column::Day.gte(period.trend_start()))
        .filter(entry::Column::Day.lt(period.end))
        .all(db)
        .await?
        .into_iter()
        .filter(|e| e.words > 0 || e.mood.is_some())
        .collect();
    let within = |from: Date, to: Date| written.iter().filter(move |e| e.day >= from && e.day < to);

    let mut tags: HashMap<String, usize> = HashMap::new();
    for e in within(period.start, period.end) {
        for tag in split_tags(&e.tags) {
            *tags.entry(tag).or_default() += 1;
        }
    }
    let mut tags: Vec<TagCount> = tags.into_iter().map(|(name, count)| TagCount { name, count }).collect();
    tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    tags.truncate(TOP_TAGS);

    Ok(JournalAnalytics {
        headline: period.headline(|from, to| Some(within(from, to).map(|e| e.day).collect::<BTreeSet<_>>().len() as f64)),
        words: period.compare(|from, to| Some(within(from, to).map(|e| e.words as f64).sum())),
        mood: period.compare(|from, to| average(within(from, to).map(|e| &e.mood))),
        energy: period.compare(|from, to| average(within(from, to).map(|e| &e.energy))),
        days: period.daily(|d| {
            let on_day: Vec<&entry::Model> = written.iter().filter(|e| e.day == d).collect();
            JournalDay {
                day: d,
                entries: on_day.len(),
                words: on_day.iter().map(|e| e.words).sum(),
                mood: average(on_day.iter().map(|e| &e.mood)),
                energy: average(on_day.iter().map(|e| &e.energy)),
            }
        }),
        tags,
    })
}
