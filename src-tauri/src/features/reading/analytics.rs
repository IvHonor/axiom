//! A week or month of reading for the Analytics view: pages, time, how
//! often, which books it went on, and what was finished.

use std::collections::{BTreeSet, HashMap};

use sea_orm::prelude::Date;
use sea_orm::{ColumnTrait, DatabaseConnection, QueryFilter};
use serde::Serialize;

use super::entities::{read, session};
use super::service::{books, reads, sessions};
use crate::error::Result;
use crate::features::period::{Compare, Headline, Period};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingAnalytics {
    /// Pages read.
    pub headline: Headline,
    /// Reading and listening, as logged.
    pub minutes: Compare,
    pub reading_days: Compare,
    pub finished: Compare,
    pub days: Vec<ReadingDay>,
    /// What the pages and minutes went on, most pages first.
    pub books: Vec<BookRead>,
    /// Finished or put down in the period, latest first.
    pub ended: Vec<BookEnded>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingDay {
    pub day: Date,
    pub pages: i32,
    pub minutes: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookRead {
    pub id: String,
    pub title: String,
    pub pages: i32,
    pub minutes: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookEnded {
    pub id: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub day: Date,
    /// "finished" or "dnf".
    pub outcome: String,
    pub rating: Option<i16>,
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<ReadingAnalytics> {
    let logged: Vec<session::Model> = sessions()
        .filter(session::Column::Day.gte(period.trend_start()))
        .filter(session::Column::Day.lt(period.end))
        .all(db)
        .await?;
    let ends: Vec<read::Model> = reads()
        .filter(read::Column::FinishedOn.gte(period.trend_start()))
        .filter(read::Column::FinishedOn.lt(period.end))
        .all(db)
        .await?;
    let titles: HashMap<String, (String, Option<String>)> = books().all(db).await?.into_iter().map(|b| (b.id, (b.title, b.cover_url))).collect();
    let within = |from: Date, to: Date| logged.iter().filter(move |s| s.day >= from && s.day < to);

    let mut per_book: HashMap<&str, (i32, i32)> = HashMap::new();
    for s in within(period.start, period.end) {
        let entry = per_book.entry(s.book_id.as_str()).or_default();
        entry.0 += s.pages;
        entry.1 += s.minutes;
    }
    let mut read_books: Vec<BookRead> = per_book
        .into_iter()
        .filter_map(|(id, (pages, minutes))| Some(BookRead { id: id.into(), title: titles.get(id)?.0.clone(), pages, minutes }))
        .collect();
    read_books.sort_by(|a, b| b.pages.cmp(&a.pages).then(b.minutes.cmp(&a.minutes)).then_with(|| a.title.cmp(&b.title)));

    let mut ended: Vec<BookEnded> = ends
        .iter()
        .filter_map(|r| {
            let day = r.finished_on.filter(|d| period.contains(*d))?;
            let (title, cover_url) = titles.get(&r.book_id)?.clone();
            Some(BookEnded { id: r.book_id.clone(), title, cover_url, day, outcome: r.outcome.clone(), rating: r.rating })
        })
        .collect();
    ended.sort_by(|a, b| b.day.cmp(&a.day));

    Ok(ReadingAnalytics {
        headline: period.headline(|from, to| Some(within(from, to).map(|s| s.pages as f64).sum())),
        minutes: period.compare(|from, to| Some(within(from, to).map(|s| s.minutes as f64).sum())),
        reading_days: period.compare(|from, to| Some(within(from, to).map(|s| s.day).collect::<BTreeSet<_>>().len() as f64)),
        finished: period.compare(|from, to| {
            Some(ends.iter().filter(|r| r.outcome == "finished" && r.finished_on.is_some_and(|d| d >= from && d < to)).count() as f64)
        }),
        days: period.daily(|d| {
            let on_day = logged.iter().filter(|s| s.day == d);
            ReadingDay { day: d, pages: on_day.clone().map(|s| s.pages).sum(), minutes: on_day.map(|s| s.minutes).sum() }
        }),
        books: read_books,
        ended,
    })
}
