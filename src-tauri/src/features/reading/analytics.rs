//! A week or month of reading for the Analytics view: pages, time, how
//! often, which books it went on, and what was finished.

use std::collections::{BTreeSet, HashMap};

use sea_orm::prelude::Date;
use sea_orm::{ColumnTrait, DatabaseConnection, QueryFilter};
use serde::Serialize;

use super::entities::{book, read, session};
use super::service::{books, notes, page_count, reads, sessions};
use crate::error::Result;
use crate::features::period::{Compare, Headline, Period};
use crate::playground::DayCounts;

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


/// Every day's pages and finished books, for the Playground (`crate::playground`).
pub async fn playground_days(db: &DatabaseConnection) -> Result<Vec<(&'static str, DayCounts)>> {
    let mut pages = DayCounts::new();
    for s in sessions().all(db).await?.into_iter().filter(|s| s.pages > 0) {
        *pages.entry(s.day).or_default() += i64::from(s.pages);
    }
    let mut finished = DayCounts::new();
    for (_, day) in finishes(db, &books().all(db).await?).await? {
        *finished.entry(day).or_default() += 1;
    }
    Ok(vec![("reading.pages", pages), ("reading.books", finished)])
}

/// About how long listening takes to cover a page.
const MINUTES_PER_PAGE: f64 = 1.5;

/// Recognises one particular book without spelling its title out here.
fn is_quiet_book(title: &str) -> bool {
    let mut hash: u32 = 0x811c_9dc5;
    for c in title.chars().filter(char::is_ascii_alphanumeric).map(|c| c.to_ascii_lowercase()).take(18) {
        hash = (hash ^ c as u32).wrapping_mul(0x0100_0193);
    }
    hash == 1_999_055_078
}

/// Every time a book was finished, oldest first, as (book id, day). A book's
/// current finish is on the book; `reads` keeps only its earlier ones.
async fn finishes(db: &DatabaseConnection, library: &[book::Model]) -> Result<Vec<(String, Date)>> {
    let mut all: Vec<(String, Date)> = library.iter().filter(|b| b.status == "finished").filter_map(|b| Some((b.id.clone(), b.finished_on?))).collect();
    all.extend(reads().filter(read::Column::Outcome.eq("finished")).all(db).await?.into_iter().filter_map(|r| Some((r.book_id, r.finished_on?))));
    all.sort_by_key(|(_, day)| *day);
    Ok(all)
}

/// Days counted for achievements alone: not Playground metrics, and they don't
/// make a day "active". Listening counts as reading here.
pub async fn achievement_days(db: &DatabaseConnection) -> Result<Vec<(&'static str, DayCounts)>> {
    let (mut read_pages, mut active, mut listened) = (DayCounts::new(), DayCounts::new(), DayCounts::new());
    for s in sessions().all(db).await? {
        let heard = if s.unit == "minutes" { s.minutes.max(0) } else { 0 };
        if s.pages > 0 {
            *read_pages.entry(s.day).or_default() += i64::from(s.pages);
        }
        if heard > 0 {
            *listened.entry(s.day).or_default() += i64::from(heard);
        }
        if s.pages > 0 || heard > 0 {
            active.insert(s.day, 1);
        }
    }
    for (day, minutes) in listened {
        let pages = (minutes as f64 / MINUTES_PER_PAGE).round() as i64;
        *read_pages.entry(day).or_default() += pages;
    }

    let library = books().all(db).await?;
    let by_id: HashMap<&str, &book::Model> = library.iter().map(|b| (b.id.as_str(), b)).collect();
    let (mut print, mut ebook, mut audio, mut longest, mut rereads) = (DayCounts::new(), DayCounts::new(), DayCounts::new(), DayCounts::new(), DayCounts::new());
    let (mut quiet_started, mut quiet_finished) = (DayCounts::new(), DayCounts::new());
    for b in library.iter().filter(|b| b.status != "want" && is_quiet_book(&b.title)) {
        quiet_started.insert(b.started_on.unwrap_or_else(|| b.updated_at.date_naive()), 1);
    }
    let mut seen = BTreeSet::new();
    for (id, day) in finishes(db, &library).await? {
        if !seen.insert(id.clone()) {
            *rereads.entry(day).or_default() += 1;
        }
        let Some(b) = by_id.get(id.as_str()) else { continue };
        if is_quiet_book(&b.title) {
            quiet_finished.insert(day, 1);
        }
        let formats = match b.format.as_str() {
            "print" => Some(&mut print),
            "ebook" => Some(&mut ebook),
            "audio" => Some(&mut audio),
            _ => None,
        };
        if let Some(days) = formats {
            *days.entry(day).or_default() += 1;
        }
        if let Some(pages) = page_count(b) {
            let most = longest.entry(day).or_default();
            *most = (*most).max(i64::from(pages));
        }
    }

    let mut reviews = DayCounts::new();
    for b in library.iter().filter(|b| b.rating.is_some() && !b.review.trim().is_empty()) {
        *reviews.entry(b.finished_on.unwrap_or_else(|| b.updated_at.date_naive())).or_default() += 1;
    }
    let mut saved = DayCounts::new();
    for n in notes().all(db).await?.into_iter().filter(|n| n.kind == "note" || n.kind == "quote") {
        *saved.entry(n.created_at.date_naive()).or_default() += 1;
    }
    Ok(vec![
        ("reading.read_pages", read_pages),
        ("reading.active_days", active),
        ("reading.finished_print", print),
        ("reading.finished_ebook", ebook),
        ("reading.finished_audio", audio),
        ("reading.longest", longest),
        ("reading.rereads", rereads),
        ("reading.reviews", reviews),
        ("reading.notes", saved),
        ("reading.quiet_started", quiet_started),
        ("reading.quiet_finished", quiet_finished),
    ])
}
