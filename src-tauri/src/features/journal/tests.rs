//! Tests for the Journal against a throwaway in-memory database.

use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::service::*;
use super::types::{EntryFields, EntryFilter};
use crate::features::daily_plan::service as plan;
use crate::features::daily_plan::types::DayFields;

async fn setup() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn day(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

fn today() -> NaiveDate {
    day(2026, 10, 24)
}

fn fields(d: NaiveDate, mood: Option<i16>, tags: &[&str]) -> EntryFields {
    EntryFields { day: d, title: String::new(), mood, energy: Some(3), tags: tags.iter().map(|t| t.to_string()).collect(), prompt: String::new() }
}

#[tokio::test]
async fn an_entry_keeps_its_edits_and_a_searchable_copy() {
    let db = setup().await;
    let e = create(&db, today(), "What went well today?").await.unwrap();
    save(&db, &e.id, Some("AQID".into()), "A quiet day at the library.".into(), 6).await.unwrap();
    save(&db, &e.id, Some("BAUG".into()), "A quiet day at the library. Finished chapter 3.".into(), 9).await.unwrap();
    let mut changed = fields(today(), Some(4), &["#Uni", "reading", "uni", "Long Walks"]);
    changed.prompt = "What went well today?".into();
    update(&db, &e.id, changed).await.unwrap();

    let detail = get(&db, &e.id).await.unwrap();
    assert_eq!(detail.edits.iter().map(|x| x.data.as_str()).collect::<Vec<_>>(), ["AQID", "BAUG"]);
    assert_eq!(detail.tags, ["uni", "reading", "long-walks"], "cleaned, no repeats");
    assert_eq!((detail.entry.words, detail.entry.mood, detail.entry.prompt.as_str()), (9, Some(4), "What went well today?"));

    let found = list(&db, EntryFilter { search: Some("chapter library".into()), ..Default::default() }).await.unwrap();
    assert_eq!(found.len(), 1);
    assert!(list(&db, EntryFilter { search: Some("gym".into()), ..Default::default() }).await.unwrap().is_empty());
    assert_eq!(list(&db, EntryFilter { tag: Some("#reading".into()), ..Default::default() }).await.unwrap().len(), 1);
    assert!(update(&db, &e.id, fields(today(), Some(9), &[])).await.is_err(), "mood is 1 to 5");

    delete(&db, &e.id).await.unwrap();
    assert!(list(&db, EntryFilter::default()).await.unwrap().is_empty());
    assert!(get(&db, &e.id).await.is_err());
}

#[tokio::test]
async fn big_updates_are_split_and_put_back_together() {
    let db = setup().await;
    let e = create(&db, today(), "").await.unwrap();
    let big: String = "ABCD".repeat(CHUNK / 2 + 10); // a little over two chunks
    save(&db, &e.id, Some(big.clone()), "…".into(), 1).await.unwrap();
    let detail = get(&db, &e.id).await.unwrap();
    assert_eq!(detail.edits.len(), 1);
    assert_eq!(detail.edits[0].data, big);
    assert_eq!(detail.edits[0].ids.len(), 3, "three rows, read as one");
}

#[tokio::test]
async fn squashing_keeps_edits_it_wasnt_told_about() {
    let db = setup().await;
    let e = create(&db, today(), "").await.unwrap();
    save(&db, &e.id, Some("one".into()), "".into(), 0).await.unwrap();
    save(&db, &e.id, Some("two".into()), "".into(), 0).await.unwrap();
    let seen: Vec<String> = get(&db, &e.id).await.unwrap().edits.into_iter().flat_map(|x| x.ids).collect();
    // Meanwhile another computer's edit arrives.
    save(&db, &e.id, Some("three".into()), "".into(), 0).await.unwrap();
    compact(&db, &e.id, "one+two", seen).await.unwrap();
    let left: Vec<String> = get(&db, &e.id).await.unwrap().edits.into_iter().map(|x| x.data).collect();
    assert_eq!(left.len(), 2);
    assert!(left.contains(&"three".to_owned()) && left.contains(&"one+two".to_owned()));
}

#[tokio::test]
async fn streaks_memories_and_the_calendar() {
    let db = setup().await;
    for d in [day(2026, 10, 21), day(2026, 10, 22), day(2026, 10, 23)] {
        let e = create(&db, d, "").await.unwrap();
        save(&db, &e.id, None, "Wrote something.".into(), 2).await.unwrap();
        update(&db, &e.id, fields(d, Some(4), &["work"])).await.unwrap();
    }
    // A year ago today.
    let old = create(&db, day(2025, 10, 24), "").await.unwrap();
    save(&db, &old.id, None, "Last year's entry.".into(), 3).await.unwrap();
    // An empty entry doesn't count.
    create(&db, day(2026, 10, 18), "").await.unwrap();

    let s = stats(&db, today()).await.unwrap();
    assert_eq!((s.streak, s.written_today, s.longest_streak), (3, false, 3), "up to yesterday counts");
    assert_eq!(s.on_this_day.len(), 1);
    assert_eq!((s.on_this_day[0].years_ago, s.on_this_day[0].entry.excerpt.as_str()), (1, "Last year's entry."));
    assert_eq!(s.calendar.len(), 4);
    assert_eq!(s.average_mood, Some(4.0));
    assert_eq!(s.tags[0].tag, "work");
    assert_eq!(s.words, 9);
}

#[tokio::test]
async fn the_daily_plan_shows_beside_the_entry() {
    let db = setup().await;
    let e = create(&db, today(), "").await.unwrap();
    assert!(get(&db, &e.id).await.unwrap().plan.is_none());
    plan::update_day(&db, today(), DayFields { intention: Some("Finish the essay".into()), went_well: Some("Got it done".into()), ..Default::default() }).await.unwrap();
    let p = get(&db, &e.id).await.unwrap().plan.unwrap();
    assert_eq!((p.intention.as_str(), p.went_well.as_str()), ("Finish the essay", "Got it done"));
}

#[tokio::test]
async fn the_evening_reminder_only_comes_before_writing() {
    let db = setup().await;
    let digest = crate::notifications::digests::digest(&db, "journal.reminder", today(), false).await.unwrap();
    assert!(matches!(digest, Some(axiom_protocol::notify::Digest::JournalReminder { streak: 0, .. })));
    let e = create(&db, today(), "").await.unwrap();
    save(&db, &e.id, None, "Done.".into(), 1).await.unwrap();
    assert!(crate::notifications::digests::digest(&db, "journal.reminder", today(), false).await.unwrap().is_none());
    assert_eq!(prompt_for(today()), prompt_for(today()), "the same all day");
}
