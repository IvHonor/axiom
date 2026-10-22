//! The Reading Tracker's logic: every query and change, independent of Tauri
//! so it can be tested on its own (see `tests.rs`).
//!
//! "Today" comes from the frontend, so it always matches what the user sees.

use std::collections::{BTreeSet, HashMap};

use chrono::{Datelike, Days, NaiveDate, Utc};
use sea_orm::prelude::{Date, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Select, Set, TransactionTrait};

use super::entities::{book, goal, note, read, session};
use super::types::{
    BookCard, BookDetail, BookFields, EditionChoice, FinishedBook, Goal, MonthStats, NewBook, NoteFields, NoteHit, ReadingStats,
    ReadingSummary, Shelves,
};
use crate::db::new_id;
use crate::error::{Error, Result};

pub const STATUSES: &[&str] = &["want", "reading", "finished", "dnf"];
pub const FORMATS: &[&str] = &["print", "ebook", "audio"];
pub const KINDS: &[&str] = &["note", "quote", "bookmark"];
/// How far back the pace for a finish date looks.
const PACE_DAYS: u64 = 14;
const MAX_PAGES: i32 = 100_000;

fn books() -> Select<book::Entity> {
    book::Entity::find().filter(book::Column::DeletedAt.is_null())
}

fn sessions() -> Select<session::Entity> {
    session::Entity::find().filter(session::Column::DeletedAt.is_null())
}

fn notes() -> Select<note::Entity> {
    note::Entity::find().filter(note::Column::DeletedAt.is_null())
}

fn reads() -> Select<read::Entity> {
    read::Entity::find().filter(read::Column::DeletedAt.is_null())
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

async fn find(db: &impl sea_orm::ConnectionTrait, id: &str) -> Result<book::Model> {
    books().filter(book::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Book"))
}

// ---------- Units ----------

/// The page count used: yours if you set one, otherwise Open Library's.
pub fn page_count(b: &book::Model) -> Option<i32> {
    b.pages.or(b.api_pages).filter(|p| *p > 0)
}

/// What `progress` runs up to.
pub fn total_of(b: &book::Model) -> Option<i32> {
    match b.unit.as_str() {
        "percent" => Some(100),
        "minutes" => b.audio_minutes.filter(|m| *m > 0),
        _ => page_count(b),
    }
}

/// Pages read going from `start` to `end`, whatever the book counts in.
fn pages_between(b: &book::Model, start: i32, end: i32) -> i32 {
    let gained = (end - start).max(0);
    match b.unit.as_str() {
        "pages" => gained,
        "percent" => page_count(b).map_or(0, |p| (gained as f64 * p as f64 / 100.0).round() as i32),
        _ => 0,
    }
}

/// The unit a format counts in: audiobooks in minutes, print in pages, and
/// ebooks in pages or percent, as chosen.
fn unit_for(format: &str, unit: Option<&str>) -> String {
    match (format, unit) {
        ("audio", _) => "minutes",
        ("ebook", Some("pages")) => "pages",
        ("ebook", _) => "percent",
        _ => "pages",
    }
    .into()
}

/// Where you are, carried across to another unit.
fn convert(progress: i32, from: &str, to: &str, pages: Option<i32>) -> i32 {
    match (from, to, pages) {
        (a, b, _) if a == b => progress,
        ("pages", "percent", Some(p)) => ((progress as f64 / p as f64) * 100.0).round().min(100.0) as i32,
        ("percent", "pages", Some(p)) => (progress as f64 * p as f64 / 100.0).round() as i32,
        _ => 0,
    }
}

fn check_format(format: &str) -> Result<()> {
    if FORMATS.contains(&format) { Ok(()) } else { Err(Error::Invalid(format!("Unknown format: {format}"))) }
}

fn check_count(value: Option<i32>, what: &str) -> Result<Option<i32>> {
    match value {
        Some(n) if !(1..=MAX_PAGES).contains(&n) => Err(Error::Invalid(format!("The {what} has to be between 1 and {MAX_PAGES}."))),
        other => Ok(other),
    }
}

fn clean(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_owned()).filter(|t| !t.is_empty())
}

// ---------- Cards ----------

/// When you'll finish at your pace over the last two weeks.
fn estimate(b: &book::Model, logged: &[&session::Model], today: Date) -> Option<Date> {
    if b.status != "reading" {
        return None;
    }
    let remaining = total_of(b)? - b.progress;
    if remaining <= 0 {
        return None;
    }
    let since = today - Days::new(PACE_DAYS - 1);
    let recent: Vec<_> = logged.iter().filter(|s| s.day >= since && s.day <= today && s.unit == b.unit).collect();
    let gained: i32 = recent.iter().map(|s| (s.end_progress - s.start_progress).max(0)).sum();
    let first = recent.iter().map(|s| s.day).min()?;
    if gained <= 0 {
        return None;
    }
    let span = ((today - first).num_days() + 1).max(1) as f64;
    let days = (remaining as f64 / (gained as f64 / span)).ceil() as u64;
    today.checked_add_days(Days::new(days.min(3650)))
}

async fn cards(db: &impl sea_orm::ConnectionTrait, list: Vec<book::Model>, today: Date) -> Result<Vec<BookCard>> {
    let ids: Vec<String> = list.iter().map(|b| b.id.clone()).collect();
    let logged = sessions().filter(session::Column::BookId.is_in(ids.clone())).all(db).await?;
    let mut by_book: HashMap<&str, Vec<&session::Model>> = HashMap::new();
    for s in &logged {
        by_book.entry(s.book_id.as_str()).or_default().push(s);
    }
    let mut note_counts: HashMap<String, u64> = HashMap::new();
    for n in notes().filter(note::Column::BookId.is_in(ids)).all(db).await? {
        *note_counts.entry(n.book_id).or_default() += 1;
    }
    Ok(list
        .into_iter()
        .map(|b| {
            let mine = by_book.get(b.id.as_str()).map(Vec::as_slice).unwrap_or_default();
            let total = total_of(&b);
            BookCard {
                total,
                percent: total.map(|t| (b.progress as f64 / t as f64 * 100.0).clamp(0.0, 100.0)),
                finish_estimate: estimate(&b, mine, today),
                last_read: mine.iter().map(|s| s.day).max(),
                notes: note_counts.get(&b.id).copied().unwrap_or(0),
                book: b,
            }
        })
        .collect())
}

async fn card(db: &impl sea_orm::ConnectionTrait, b: book::Model, today: Date) -> Result<BookCard> {
    Ok(cards(db, vec![b], today).await?.remove(0))
}

/// Shelf order: reading (most recently read first), want to read (your
/// order), then finished and put down (most recent first).
fn shelf_order(a: &BookCard, b: &BookCard) -> std::cmp::Ordering {
    let rank = |c: &BookCard| STATUSES.iter().position(|s| *s == c.book.status).unwrap_or(9).min(2);
    rank(a).cmp(&rank(b)).then_with(|| match a.book.status.as_str() {
        "reading" => b.last_read.cmp(&a.last_read).then(b.book.updated_at.cmp(&a.book.updated_at)),
        "want" => a.book.position.total_cmp(&b.book.position),
        _ => b.book.finished_on.cmp(&a.book.finished_on).then(b.book.updated_at.cmp(&a.book.updated_at)),
    })
}

pub async fn list_books(db: &DatabaseConnection, today: Date) -> Result<Vec<BookCard>> {
    let mut all = cards(db, books().all(db).await?, today).await?;
    all.sort_by(shelf_order);
    Ok(all)
}

pub async fn get_book(db: &DatabaseConnection, id: &str, today: Date) -> Result<BookDetail> {
    let b = find(db, id).await?;
    let logged = sessions()
        .filter(session::Column::BookId.eq(id))
        .order_by_desc(session::Column::Day)
        .order_by_desc(session::Column::CreatedAt)
        .all(db)
        .await?;
    let mut book_notes = notes().filter(note::Column::BookId.eq(id)).order_by_asc(note::Column::CreatedAt).all(db).await?;
    book_notes.sort_by_key(|n| n.page.unwrap_or(i32::MAX));
    let earlier = reads().filter(read::Column::BookId.eq(id)).order_by_desc(read::Column::FinishedOn).all(db).await?;
    Ok(BookDetail { card: card(db, b, today).await?, sessions: logged, notes: book_notes, reads: earlier })
}

// ---------- Changing books ----------

async fn next_position(db: &impl sea_orm::ConnectionTrait) -> Result<f64> {
    let last = books().order_by_desc(book::Column::Position).one(db).await?;
    Ok(last.map_or(1.0, |b| b.position + 1.0))
}

pub async fn add_book(db: &DatabaseConnection, new: NewBook, today: Date) -> Result<BookCard> {
    let title = new.title.trim().to_owned();
    if title.is_empty() {
        return Err(Error::Invalid("Give the book a title.".into()));
    }
    check_format(&new.format)?;
    if !STATUSES.contains(&new.status.as_str()) {
        return Err(Error::Invalid(format!("Unknown shelf: {}", new.status)));
    }
    let work_key = clean(new.work_key);
    if let Some(key) = &work_key {
        if let Some(found) = books().filter(book::Column::WorkKey.eq(key.as_str())).one(db).await? {
            return Err(Error::Invalid(format!("“{}” is already in your library.", found.title)));
        }
    }
    let unit = unit_for(&new.format, new.unit.as_deref());
    let started = (new.status != "want").then_some(today);
    let finished = matches!(new.status.as_str(), "finished" | "dnf").then_some(today);
    let now = Utc::now();
    let mut added = book::ActiveModel {
        id: Set(new_id()),
        title: Set(title),
        authors: Set(new.authors.trim().to_owned()),
        cover_url: Set(clean(new.cover_url)),
        work_key: Set(work_key),
        edition_key: Set(clean(new.edition_key)),
        isbn: Set(clean(new.isbn)),
        published_year: Set(new.published_year),
        api_pages: Set(new.api_pages.filter(|p| (1..=MAX_PAGES).contains(p))),
        pages: Set(check_count(new.pages, "page count")?),
        format: Set(new.format),
        unit: Set(unit),
        audio_minutes: Set(check_count(new.audio_minutes, "length")?),
        status: Set(new.status.clone()),
        progress: Set(0),
        rating: Set(None),
        review: Set(String::new()),
        started_on: Set(started),
        finished_on: Set(finished),
        position: Set(next_position(db).await?),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?;
    if new.status == "finished" {
        if let Some(total) = total_of(&added) {
            let mut active: book::ActiveModel = added.into();
            active.progress = Set(total);
            added = active.update(db).await?;
        }
    }
    card(db, added, today).await
}

pub async fn update_book(db: &DatabaseConnection, id: &str, fields: BookFields, today: Date) -> Result<BookCard> {
    let title = fields.title.trim().to_owned();
    if title.is_empty() {
        return Err(Error::Invalid("Give the book a title.".into()));
    }
    check_format(&fields.format)?;
    if fields.rating.is_some_and(|r| !(1..=10).contains(&r)) {
        return Err(Error::Invalid("Ratings go from half a star to five stars.".into()));
    }
    if let (Some(start), Some(end)) = (fields.started_on, fields.finished_on) {
        if end < start {
            return Err(Error::Invalid("The finish date is before the start date.".into()));
        }
    }
    let b = find(db, id).await?;
    let unit = unit_for(&fields.format, Some(&fields.unit));
    let pages = check_count(fields.pages, "page count")?;
    let progress = convert(b.progress, &b.unit, &unit, pages.or(b.api_pages));
    let mut active: book::ActiveModel = b.into();
    active.title = Set(title);
    active.authors = Set(fields.authors.trim().to_owned());
    active.cover_url = Set(clean(fields.cover_url));
    active.pages = Set(pages);
    active.format = Set(fields.format);
    active.unit = Set(unit);
    active.audio_minutes = Set(check_count(fields.audio_minutes, "length")?);
    active.rating = Set(fields.rating);
    active.review = Set(fields.review);
    active.started_on = Set(fields.started_on);
    active.finished_on = Set(fields.finished_on);
    active.progress = Set(progress);
    let mut updated = active.update(db).await?;
    // A shorter page count can't leave you past the end.
    if let Some(total) = total_of(&updated).filter(|t| updated.progress > *t) {
        let mut active: book::ActiveModel = updated.into();
        active.progress = Set(total);
        updated = active.update(db).await?;
    }
    card(db, updated, today).await
}

/// Uses another edition's page count, cover and ISBN.
pub async fn choose_edition(db: &DatabaseConnection, id: &str, choice: EditionChoice, today: Date) -> Result<BookCard> {
    let b = find(db, id).await?;
    let mut active: book::ActiveModel = b.into();
    active.edition_key = Set(Some(choice.edition_key));
    if let Some(pages) = choice.pages.filter(|p| (1..=MAX_PAGES).contains(p)) {
        active.api_pages = Set(Some(pages));
    }
    if let Some(cover) = clean(choice.cover_url) {
        active.cover_url = Set(Some(cover));
    }
    if let Some(isbn) = clean(choice.isbn) {
        active.isbn = Set(Some(isbn));
    }
    card(db, active.update(db).await?, today).await
}

/// Moves a book to another shelf, keeping its dates sensible.
pub async fn set_status(db: &DatabaseConnection, id: &str, status: &str, today: Date) -> Result<BookCard> {
    if !STATUSES.contains(&status) {
        return Err(Error::Invalid(format!("Unknown shelf: {status}")));
    }
    let b = find(db, id).await?;
    if b.status == status {
        return card(db, b, today).await;
    }
    let total = total_of(&b);
    let started = b.started_on.unwrap_or(today);
    let position = if status == "want" { next_position(db).await? } else { b.position };
    let mut active: book::ActiveModel = b.into();
    active.status = Set(status.into());
    active.position = Set(position);
    match status {
        "want" => {
            active.started_on = Set(None);
            active.finished_on = Set(None);
        }
        "reading" => {
            active.started_on = Set(Some(started));
            active.finished_on = Set(None);
        }
        "finished" => {
            active.started_on = Set(Some(started));
            active.finished_on = Set(Some(today));
            if let Some(total) = total {
                active.progress = Set(total);
            }
        }
        _ => {
            active.started_on = Set(Some(started));
            active.finished_on = Set(Some(today));
        }
    }
    card(db, active.update(db).await?, today).await
}

/// Records where you are now. The day's reading of the book adds up in one
/// entry in the log; starting a book from "want to read" moves it to
/// reading, and reaching the end finishes it.
pub async fn log_progress(db: &DatabaseConnection, id: &str, value: i32, minutes: Option<i32>, today: Date) -> Result<BookCard> {
    let b = find(db, id).await?;
    let total = total_of(&b);
    let value = total.map_or(value.max(0), |t| value.clamp(0, t));
    let minutes = minutes.unwrap_or(0).clamp(0, 24 * 60);
    if value == b.progress && minutes == 0 {
        return card(db, b, today).await;
    }

    let txn = db.begin().await?;
    let audio = b.unit == "minutes";
    let same_day = sessions()
        .filter(session::Column::BookId.eq(id))
        .filter(session::Column::Day.eq(today))
        .filter(session::Column::Unit.eq(b.unit.as_str()))
        .one(&txn)
        .await?;
    match same_day {
        Some(s) => {
            let start = s.start_progress;
            let spent = if audio { (value - start).max(0) } else { s.minutes + minutes };
            let mut active: session::ActiveModel = s.into();
            active.end_progress = Set(value);
            active.pages = Set(pages_between(&b, start, value));
            active.minutes = Set(spent);
            active.update(&txn).await?;
        }
        None => {
            let now = Utc::now();
            session::ActiveModel {
                id: Set(new_id()),
                book_id: Set(id.into()),
                day: Set(today),
                start_progress: Set(b.progress),
                end_progress: Set(value),
                unit: Set(b.unit.clone()),
                pages: Set(pages_between(&b, b.progress, value)),
                minutes: Set(if audio { (value - b.progress).max(0) } else { minutes }),
                created_at: Set(now),
                updated_at: Set(now),
                deleted_at: Set(None),
            }
            .insert(&txn)
            .await?;
        }
    }

    let reached_end = total.is_some_and(|t| value >= t);
    let status = match b.status.as_str() {
        "want" | "reading" if reached_end => "finished",
        "want" => "reading",
        other => other,
    }
    .to_owned();
    let started = b.started_on.or((status != "want").then_some(today));
    let finished = if status == "finished" && b.status != "finished" { Some(today) } else { b.finished_on };
    let mut active: book::ActiveModel = b.into();
    active.progress = Set(value);
    active.status = Set(status);
    active.started_on = Set(started);
    active.finished_on = Set(finished);
    let updated = active.update(&txn).await?;
    txn.commit().await?;
    card(db, updated, today).await
}

/// Starts a finished (or put-down) book again; the earlier read is kept.
pub async fn read_again(db: &DatabaseConnection, id: &str, today: Date) -> Result<BookCard> {
    let b = find(db, id).await?;
    if !matches!(b.status.as_str(), "finished" | "dnf") {
        return Err(Error::Invalid("Only a finished book can be read again.".into()));
    }
    let txn = db.begin().await?;
    let now = Utc::now();
    read::ActiveModel {
        id: Set(new_id()),
        book_id: Set(b.id.clone()),
        started_on: Set(b.started_on),
        finished_on: Set(b.finished_on),
        outcome: Set(b.status.clone()),
        rating: Set(b.rating),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(&txn)
    .await?;
    let mut active: book::ActiveModel = b.into();
    active.status = Set("reading".into());
    active.progress = Set(0);
    active.started_on = Set(Some(today));
    active.finished_on = Set(None);
    let updated = active.update(&txn).await?;
    txn.commit().await?;
    card(db, updated, today).await
}

/// Moves a book on the want-to-read shelf to just before another (or to the end).
pub async fn move_book(db: &DatabaseConnection, id: &str, before_id: Option<&str>, today: Date) -> Result<BookCard> {
    let b = find(db, id).await?;
    let shelf: Vec<book::Model> = books()
        .filter(book::Column::Status.eq("want"))
        .filter(book::Column::Id.ne(id))
        .order_by_asc(book::Column::Position)
        .all(db)
        .await?;
    let at = before_id.and_then(|before| shelf.iter().position(|o| o.id == before));
    let position = match at {
        Some(0) => shelf[0].position - 1.0,
        Some(i) => (shelf[i - 1].position + shelf[i].position) / 2.0,
        None => shelf.last().map_or(1.0, |o| o.position + 1.0),
    };
    let mut active: book::ActiveModel = b.into();
    active.position = Set(position);
    card(db, active.update(db).await?, today).await
}

pub async fn delete_book(db: &DatabaseConnection, id: &str) -> Result<()> {
    find(db, id).await?;
    let txn = db.begin().await?;
    bury!(session, &txn, session::Column::BookId.eq(id));
    bury!(note, &txn, note::Column::BookId.eq(id));
    bury!(read, &txn, read::Column::BookId.eq(id));
    bury!(book, &txn, book::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

/// Takes an entry out of the log. Where you are in the book stays.
pub async fn delete_session(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(session, db, session::Column::Id.eq(id));
    Ok(())
}

// ---------- Notes ----------

fn check_note(fields: &NoteFields) -> Result<(String, Option<i32>)> {
    if !KINDS.contains(&fields.kind.as_str()) {
        return Err(Error::Invalid(format!("Unknown kind of note: {}", fields.kind)));
    }
    let text = fields.text.trim().to_owned();
    let page = fields.page.filter(|p| *p > 0);
    if fields.kind == "bookmark" && page.is_none() {
        return Err(Error::Invalid("Say which page to bookmark.".into()));
    }
    if fields.kind != "bookmark" && text.is_empty() {
        return Err(Error::Invalid(if fields.kind == "quote" { "Type the quote first." } else { "Write the note first." }.into()));
    }
    Ok((text, page))
}

pub async fn add_note(db: &DatabaseConnection, book_id: &str, fields: NoteFields) -> Result<note::Model> {
    find(db, book_id).await?;
    let (text, page) = check_note(&fields)?;
    let now = Utc::now();
    Ok(note::ActiveModel {
        id: Set(new_id()),
        book_id: Set(book_id.into()),
        kind: Set(fields.kind),
        page: Set(page),
        text: Set(text),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn update_note(db: &DatabaseConnection, id: &str, fields: NoteFields) -> Result<note::Model> {
    let (text, page) = check_note(&fields)?;
    let found = notes().filter(note::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Note"))?;
    let mut active: note::ActiveModel = found.into();
    active.kind = Set(fields.kind);
    active.page = Set(page);
    active.text = Set(text);
    Ok(active.update(db).await?)
}

pub async fn delete_note(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(note, db, note::Column::Id.eq(id));
    Ok(())
}

/// Notes from every book whose text, or book, matches `query`; all of them
/// when it's empty. Newest first.
pub async fn search_notes(db: &DatabaseConnection, query: &str) -> Result<Vec<NoteHit>> {
    let library: HashMap<String, book::Model> = books().all(db).await?.into_iter().map(|b| (b.id.clone(), b)).collect();
    let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    Ok(notes()
        .order_by_desc(note::Column::CreatedAt)
        .all(db)
        .await?
        .into_iter()
        .filter_map(|n| {
            let b = library.get(&n.book_id)?;
            let haystack = format!("{} {} {}", n.text, b.title, b.authors).to_lowercase();
            words.iter().all(|w| haystack.contains(w)).then(|| NoteHit { book_title: b.title.clone(), book_authors: b.authors.clone(), note: n })
        })
        .take(500)
        .collect())
}

// ---------- Goals, streaks and stats ----------

pub async fn set_goal(db: &DatabaseConnection, year: i32, target: i32) -> Result<()> {
    let id = year.to_string();
    let found = goal::Entity::find_by_id(id.as_str()).one(db).await?;
    if target <= 0 {
        bury!(goal, db, goal::Column::Id.eq(id));
        return Ok(());
    }
    let target = target.min(1000);
    match found {
        Some(g) => {
            let mut active: goal::ActiveModel = g.into();
            active.books = Set(target);
            active.deleted_at = Set(None);
            active.update(db).await?;
        }
        None => {
            let now = Utc::now();
            goal::ActiveModel { id: Set(id), year: Set(year), books: Set(target), created_at: Set(now), updated_at: Set(now), deleted_at: Set(None) }
                .insert(db)
                .await?;
        }
    }
    Ok(())
}

fn year_span(year: i32) -> (Date, Date) {
    (NaiveDate::from_ymd_opt(year, 1, 1).unwrap_or_default(), NaiveDate::from_ymd_opt(year, 12, 31).unwrap_or_default())
}

/// Books finished (and put down) in a year: current reads and earlier ones.
async fn finished_in(db: &DatabaseConnection, year: i32) -> Result<Vec<FinishedBook>> {
    let (from, to) = year_span(year);
    let library: HashMap<String, book::Model> = books().all(db).await?.into_iter().map(|b| (b.id.clone(), b)).collect();
    let in_year = |d: Option<Date>| d.filter(|d| *d >= from && *d <= to);
    let days = |start: Option<Date>, end: Date| start.map(|s| (end - s).num_days().max(0) + 1);
    let mut done: Vec<FinishedBook> = library
        .values()
        .filter(|b| matches!(b.status.as_str(), "finished" | "dnf"))
        .filter_map(|b| {
            let on = in_year(b.finished_on)?;
            Some(FinishedBook {
                book_id: b.id.clone(),
                title: b.title.clone(),
                authors: b.authors.clone(),
                cover_url: b.cover_url.clone(),
                finished_on: on,
                rating: b.rating,
                days: days(b.started_on, on),
                outcome: b.status.clone(),
            })
        })
        .collect();
    for r in reads().all(db).await? {
        let (Some(b), Some(on)) = (library.get(&r.book_id), in_year(r.finished_on)) else { continue };
        done.push(FinishedBook {
            book_id: b.id.clone(),
            title: b.title.clone(),
            authors: b.authors.clone(),
            cover_url: b.cover_url.clone(),
            finished_on: on,
            rating: r.rating,
            days: days(r.started_on, on),
            outcome: r.outcome,
        });
    }
    done.sort_by(|a, b| b.finished_on.cmp(&a.finished_on));
    Ok(done)
}

async fn goal_for(db: &DatabaseConnection, year: i32, finished: i32, today: Date) -> Result<Goal> {
    let target = goal::Entity::find_by_id(year.to_string()).filter(goal::Column::DeletedAt.is_null()).one(db).await?.map(|g| g.books);
    let (from, to) = year_span(year);
    let length = (to - from).num_days() + 1;
    let elapsed = if today < from { 0 } else if today > to { length } else { (today - from).num_days() + 1 };
    let expected = target.map_or(0.0, |t| t as f64 * elapsed as f64 / length as f64);
    Ok(Goal { year, books: target, finished, expected })
}

/// Days you read on, from the log.
async fn reading_days(db: &DatabaseConnection) -> Result<BTreeSet<Date>> {
    Ok(sessions()
        .all(db)
        .await?
        .into_iter()
        .filter(|s| s.pages > 0 || s.minutes > 0 || s.end_progress > s.start_progress)
        .map(|s| s.day)
        .collect())
}

/// Days in a row you read, up to today (or yesterday, if today's still to come).
fn current_streak(days: &BTreeSet<Date>, today: Date) -> i32 {
    let mut day = if days.contains(&today) { today } else { today - Days::new(1) };
    let mut streak = 0;
    while days.contains(&day) {
        streak += 1;
        day = day - Days::new(1);
    }
    streak
}

fn longest_streak(days: &BTreeSet<Date>) -> i32 {
    let (mut best, mut run, mut last) = (0, 0, None::<Date>);
    for day in days {
        run = if last.is_some_and(|l| *day - l == chrono::Duration::days(1)) { run + 1 } else { 1 };
        best = best.max(run);
        last = Some(*day);
    }
    best
}

pub async fn summary(db: &DatabaseConnection, today: Date) -> Result<ReadingSummary> {
    let all = list_books(db, today).await?;
    let mut shelves = Shelves::default();
    for c in &all {
        match c.book.status.as_str() {
            "want" => shelves.want += 1,
            "reading" => shelves.reading += 1,
            "finished" => shelves.finished += 1,
            _ => shelves.dnf += 1,
        }
    }
    let finished = finished_in(db, today.year()).await?.iter().filter(|f| f.outcome == "finished").count() as i32;
    let pages_today = sessions().filter(session::Column::Day.eq(today)).all(db).await?.iter().map(|s| s.pages).sum();
    Ok(ReadingSummary {
        reading: all.into_iter().filter(|c| c.book.status == "reading").collect(),
        goal: goal_for(db, today.year(), finished, today).await?,
        streak: current_streak(&reading_days(db).await?, today),
        pages_today,
        shelves,
    })
}

pub async fn stats(db: &DatabaseConnection, year: i32, today: Date) -> Result<ReadingStats> {
    let (from, to) = year_span(year);
    let logged = sessions().filter(session::Column::Day.gte(from)).filter(session::Column::Day.lte(to)).all(db).await?;
    let finished = finished_in(db, year).await?;
    let completed: Vec<&FinishedBook> = finished.iter().filter(|f| f.outcome == "finished").collect();

    let mut months: Vec<MonthStats> = (1..=12).map(|month| MonthStats { month, ..Default::default() }).collect();
    for s in &logged {
        let m = &mut months[s.day.month0() as usize];
        m.pages += s.pages;
        m.minutes += s.minutes;
    }
    for f in &completed {
        months[f.finished_on.month0() as usize].books += 1;
    }

    let days = reading_days(db).await?;
    let month_ago = today - Days::new(29);
    let recent_pages: i32 = sessions().filter(session::Column::Day.gte(month_ago)).filter(session::Column::Day.lte(today)).all(db).await?.iter().map(|s| s.pages).sum();
    let rated: Vec<f64> = completed.iter().filter_map(|f| f.rating).map(|r| r as f64 / 2.0).collect();
    let timed: Vec<f64> = completed.iter().filter_map(|f| f.days).map(|d| d as f64).collect();
    let average = |v: &[f64]| (!v.is_empty()).then(|| v.iter().sum::<f64>() / v.len() as f64);

    Ok(ReadingStats {
        goal: goal_for(db, year, completed.len() as i32, today).await?,
        pages: logged.iter().map(|s| s.pages).sum(),
        listened_minutes: logged.iter().filter(|s| s.unit == "minutes").map(|s| s.minutes).sum(),
        reading_minutes: logged.iter().filter(|s| s.unit != "minutes").map(|s| s.minutes).sum(),
        months,
        streak: current_streak(&days, today),
        longest_streak: longest_streak(&days),
        pages_per_day: recent_pages as f64 / 30.0,
        average_rating: average(&rated),
        average_days: average(&timed),
        reading_days: days.iter().filter(|d| **d >= from && **d <= to).count() as i32,
        finished,
    })
}
