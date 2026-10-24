//! The Journal's logic: every query and change, independent of Tauri so it
//! can be tested on its own (see `tests.rs`).
//!
//! "Today" comes from the frontend, so it always matches what the user sees.

use std::collections::{BTreeSet, HashMap};

use chrono::{Datelike, Days, NaiveDate, Utc};
use sea_orm::prelude::{Date, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, Condition, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Select, Set, TransactionTrait};

use super::entities::{edit, entry};
use super::types::{DayMark, EntryCard, EntryDetail, EntryFields, EntryFilter, JournalStats, Memory, PlanDay, TagCount};
use crate::db::new_id;
use crate::error::{Error, Result};
use crate::features::{daily_plan, doc_edits};

#[cfg(test)]
pub use crate::features::doc_edits::CHUNK;
const EXCERPT: usize = 280;
const MAX_TAGS: usize = 20;

fn entries() -> Select<entry::Entity> {
    entry::Entity::find().filter(entry::Column::DeletedAt.is_null())
}

fn edits() -> Select<edit::Entity> {
    edit::Entity::find().filter(edit::Column::DeletedAt.is_null())
}

/// Soft-deletes the matching rows, so the deletion syncs.
macro_rules! bury {
    ($entity:ident, $db:expr, $condition:expr) => {
        $entity::Entity::update_many()
            .col_expr($entity::Column::DeletedAt, Expr::value(Some(Utc::now())))
            .col_expr($entity::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter($entity::Column::DeletedAt.is_null())
            .filter($condition)
            .exec($db)
            .await?
    };
}

async fn find(db: &impl ConnectionTrait, id: &str) -> Result<entry::Model> {
    entries().filter(entry::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Entry"))
}

pub fn split_tags(tags: &str) -> Vec<String> {
    tags.split(',').map(str::trim).filter(|t| !t.is_empty()).map(String::from).collect()
}

/// Tags as kept: lowercase, no #, no repeats, at most `MAX_TAGS`.
fn clean_tags(tags: &[String]) -> String {
    let mut seen = Vec::new();
    for t in tags {
        let t = t.trim().trim_start_matches('#').to_lowercase().replace(',', " ");
        let t = t.split_whitespace().collect::<Vec<_>>().join("-");
        if !t.is_empty() && !seen.contains(&t) {
            seen.push(t);
        }
    }
    seen.truncate(MAX_TAGS);
    seen.join(",")
}

fn check_scale(value: Option<i16>, what: &str) -> Result<()> {
    if value.is_some_and(|v| !(1..=5).contains(&v)) {
        return Err(Error::Invalid(format!("{what} goes from 1 to 5.")));
    }
    Ok(())
}

pub fn card(e: &entry::Model) -> EntryCard {
    let mut excerpt: String = e.text.chars().take(EXCERPT).collect();
    if e.text.chars().count() > EXCERPT {
        excerpt.push('…');
    }
    EntryCard {
        id: e.id.clone(),
        day: e.day,
        title: e.title.clone(),
        mood: e.mood,
        energy: e.energy,
        tags: split_tags(&e.tags),
        prompt: e.prompt.clone(),
        excerpt,
        words: e.words,
        created_at: e.created_at,
        updated_at: e.updated_at,
    }
}

// ---------- Entries ----------

/// Entries matching the filter, newest first.
pub async fn list(db: &DatabaseConnection, filter: EntryFilter) -> Result<Vec<EntryCard>> {
    let mut query = entries();
    if let Some((from, to)) = filter.month.as_deref().and_then(month_span) {
        query = query.filter(entry::Column::Day.gte(from)).filter(entry::Column::Day.lte(to));
    }
    if let Some(m) = filter.mood {
        query = query.filter(entry::Column::Mood.eq(m));
    }
    let words: Vec<String> = filter.search.unwrap_or_default().to_lowercase().split_whitespace().map(String::from).collect();
    let tag = filter.tag.map(|t| t.trim_start_matches('#').to_lowercase());
    Ok(query
        .order_by_desc(entry::Column::Day)
        .order_by_desc(entry::Column::CreatedAt)
        .all(db)
        .await?
        .iter()
        .filter(|e| tag.as_ref().is_none_or(|t| split_tags(&e.tags).contains(t)))
        .filter(|e| {
            let haystack = format!("{} {} {} {}", e.title, e.text, e.tags, e.prompt).to_lowercase();
            words.iter().all(|w| haystack.contains(w.as_str()))
        })
        .map(card)
        .collect())
}

/// The first and last day of "2026-10".
fn month_span(month: &str) -> Option<(Date, Date)> {
    let first = NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d").ok()?;
    let last = first.checked_add_months(chrono::Months::new(1))? - Days::new(1);
    Some((first, last))
}

/// A day's entries, earliest first.
pub async fn on_day(db: &DatabaseConnection, day: Date) -> Result<Vec<EntryCard>> {
    Ok(entries().filter(entry::Column::Day.eq(day)).order_by_asc(entry::Column::CreatedAt).all(db).await?.iter().map(card).collect())
}

/// The entry with its edits, and that day's Daily Plan.
pub async fn get(db: &DatabaseConnection, id: &str) -> Result<EntryDetail> {
    let e = find(db, id).await?;
    let rows = edits().filter(edit::Column::EntryId.eq(id)).order_by_asc(edit::Column::CreatedAt).all(db).await?;
    let whole = doc_edits::assemble(rows.into_iter().map(|r| doc_edits::Row { id: r.id, chunk_of: r.chunk_of, part: r.part, parts: r.parts, data: r.data }));
    let info = daily_plan::service::get_day_info(db, e.day).await?;
    let plan = (!info.intention.is_empty() || !info.went_well.is_empty() || !info.do_better.is_empty())
        .then_some(PlanDay { intention: info.intention, went_well: info.went_well, do_better: info.do_better });
    Ok(EntryDetail { tags: split_tags(&e.tags), entry: e, edits: whole, plan })
}

/// A new, empty entry for a day, answering `prompt` if one was picked.
pub async fn create(db: &DatabaseConnection, day: Date, prompt: &str) -> Result<entry::Model> {
    let now = Utc::now();
    Ok(entry::ActiveModel {
        id: Set(new_id()),
        day: Set(day),
        title: Set(String::new()),
        mood: Set(None),
        energy: Set(None),
        tags: Set(String::new()),
        prompt: Set(prompt.trim().to_owned()),
        text: Set(String::new()),
        words: Set(0),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn update(db: &DatabaseConnection, id: &str, fields: EntryFields) -> Result<entry::Model> {
    check_scale(fields.mood, "Mood")?;
    check_scale(fields.energy, "Energy")?;
    let mut active: entry::ActiveModel = find(db, id).await?.into();
    active.day = Set(fields.day);
    active.title = Set(fields.title.trim().chars().take(200).collect());
    active.mood = Set(fields.mood);
    active.energy = Set(fields.energy);
    active.tags = Set(clean_tags(&fields.tags));
    active.prompt = Set(fields.prompt.trim().to_owned());
    Ok(active.update(db).await?)
}

/// Saves new edits to the text (a Yjs update, base64), and the plain-text
/// copy as it now reads.
pub async fn save(db: &DatabaseConnection, id: &str, update: Option<String>, text: String, words: i32) -> Result<entry::Model> {
    let e = find(db, id).await?;
    let txn = db.begin().await?;
    if let Some(update) = update.filter(|u| !u.is_empty()) {
        insert_update(&txn, id, &update).await?;
    }
    let saved = if e.text != text || e.words != words {
        let mut active: entry::ActiveModel = e.into();
        active.text = Set(text);
        active.words = Set(words.max(0));
        active.update(&txn).await?
    } else {
        e
    };
    txn.commit().await?;
    Ok(saved)
}

/// Stores an update, split into parts if it's big.
async fn insert_update(db: &impl ConnectionTrait, entry_id: &str, data: &str) -> Result<()> {
    let now = Utc::now();
    for row in doc_edits::split(data) {
        edit::ActiveModel {
            id: Set(row.id),
            entry_id: Set(entry_id.into()),
            data: Set(row.data),
            chunk_of: Set(row.chunk_of),
            part: Set(row.part),
            parts: Set(row.parts),
            created_at: Set(now),
            updated_at: Set(now),
            deleted_at: Set(None),
        }
        .insert(db)
        .await?;
    }
    Ok(())
}

/// Replaces some of an entry's edits with one snapshot holding them all (and
/// anything else this computer had). Only rows named are removed, so edits
/// another computer adds meanwhile are kept, and merge in.
pub async fn compact(db: &DatabaseConnection, id: &str, snapshot: &str, replaces: Vec<String>) -> Result<()> {
    find(db, id).await?;
    let txn = db.begin().await?;
    insert_update(&txn, id, snapshot).await?;
    bury!(edit, &txn, Condition::all().add(edit::Column::EntryId.eq(id)).add(edit::Column::Id.is_in(replaces)));
    txn.commit().await?;
    Ok(())
}

pub async fn delete(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    bury!(edit, &txn, edit::Column::EntryId.eq(id));
    bury!(entry, &txn, entry::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Stats ----------

/// Days counted for the streak: something written, or a mood recorded.
fn counts(e: &entry::Model) -> bool {
    e.words > 0 || e.mood.is_some()
}

/// Days in a row with an entry, up to today (or yesterday, if today's still to come).
fn streak(days: &BTreeSet<Date>, today: Date) -> i32 {
    let mut day = if days.contains(&today) { today } else { today - Days::new(1) };
    let mut n = 0;
    while days.contains(&day) {
        n += 1;
        day = day - Days::new(1);
    }
    n
}

fn longest(days: &BTreeSet<Date>) -> i32 {
    let (mut best, mut run, mut last) = (0, 0, None::<Date>);
    for day in days {
        run = if last.is_some_and(|l| *day - l == chrono::Duration::days(1)) { run + 1 } else { 1 };
        best = best.max(run);
        last = Some(*day);
    }
    best
}

pub async fn stats(db: &DatabaseConnection, today: Date) -> Result<JournalStats> {
    let all = entries().order_by_desc(entry::Column::Day).all(db).await?;
    let days: BTreeSet<Date> = all.iter().filter(|e| counts(e)).map(|e| e.day).collect();
    // The calendar shows 53 weeks, so a year ago today is on it.
    let year_ago = today - Days::new(371);

    let mut by_day: HashMap<Date, (u32, i32, Vec<i16>)> = HashMap::new();
    for e in all.iter().filter(|e| e.day > year_ago && counts(e)) {
        let mark = by_day.entry(e.day).or_default();
        mark.0 += 1;
        mark.1 += e.words;
        mark.2.extend(e.mood);
    }
    let mut calendar: Vec<DayMark> = by_day
        .into_iter()
        .map(|(day, (entries, words, moods))| DayMark {
            day,
            entries,
            words,
            mood: (!moods.is_empty()).then(|| (moods.iter().map(|m| *m as f64).sum::<f64>() / moods.len() as f64).round() as i16),
        })
        .collect();
    calendar.sort_by_key(|m| m.day);

    let on_this_day = all
        .iter()
        .filter(|e| e.day.year() < today.year() && e.day.month() == today.month() && e.day.day() == today.day())
        .map(|e| Memory { years_ago: today.year() - e.day.year(), entry: card(e) })
        .collect();

    let month_ago = today - Days::new(30);
    let recent: Vec<&entry::Model> = all.iter().filter(|e| e.day > month_ago && e.day <= today).collect();
    let average = |pick: fn(&entry::Model) -> Option<i16>| {
        let values: Vec<f64> = recent.iter().filter_map(|e| pick(e)).map(|v| v as f64).collect();
        (!values.is_empty()).then(|| values.iter().sum::<f64>() / values.len() as f64)
    };

    let mut tags: HashMap<String, u32> = HashMap::new();
    for e in &all {
        for t in split_tags(&e.tags) {
            *tags.entry(t).or_default() += 1;
        }
    }
    let mut tags: Vec<TagCount> = tags.into_iter().map(|(tag, count)| TagCount { tag, count }).collect();
    tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
    tags.truncate(20);

    Ok(JournalStats {
        streak: streak(&days, today),
        longest_streak: longest(&days),
        written_today: days.contains(&today),
        entries: all.len() as u32,
        words: all.iter().map(|e| e.words as i64).sum(),
        calendar,
        on_this_day,
        average_mood: average(|e| e.mood),
        average_energy: average(|e| e.energy),
        tags,
    })
}

// ---------- Prompts ----------

/// Something to write about, when the page is blank. Grouped loosely:
/// morning, evening, gratitude, looking back and looking ahead.
pub const PROMPTS: &[&str] = &[
    "What would make today a good day?",
    "What's one thing you're looking forward to today?",
    "How do you want to feel by the end of today?",
    "What's on your mind this morning?",
    "What's one small thing you could do today for future you?",
    "What went well today, and why?",
    "What drained your energy today? What gave you some?",
    "What did you learn today?",
    "What would you do differently if you had today again?",
    "Describe today in three words, then explain them.",
    "Who made today better, and how?",
    "What was the best moment of today?",
    "What's something that surprised you today?",
    "What are three things you're grateful for right now?",
    "Who are you grateful for this week, and have you told them?",
    "What's a small comfort you'd miss if it were gone?",
    "What's something you're proud of this week?",
    "What's been weighing on you lately? What would help?",
    "What are you avoiding, and what's one step towards it?",
    "When did you last feel completely yourself?",
    "What's a worry you can let go of tonight?",
    "What does a really good week look like for you right now?",
    "What's one habit you'd like to start, and why?",
    "Where do you want to be a year from now?",
    "What advice would you give yourself a year ago?",
    "What's a goal you've been putting off? What's in the way?",
    "Write about a place that makes you feel calm.",
    "What's something you've changed your mind about?",
    "What made you laugh recently?",
    "What are you curious about at the moment?",
    "What does rest look like for you this week?",
    "What's one kind thing you did, or someone did for you?",
];

/// The prompt for a day: the same one all day, a different one tomorrow.
pub fn prompt_for(day: Date) -> &'static str {
    PROMPTS[day.num_days_from_ce().rem_euclid(PROMPTS.len() as i32) as usize]
}
