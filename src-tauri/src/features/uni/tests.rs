//! Tests for University against a throwaway in-memory database.

use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::service::*;
use super::types::{LectureFields, ModuleFields, Schedule, TermFields};

async fn setup() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn day(m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, m, d).unwrap()
}

/// Wednesday of week 6 of the autumn term below.
fn today() -> NaiveDate {
    day(10, 28)
}

/// An 11-week term starting Wednesday 23 September 2026, so week 1 runs from
/// Monday 21 September.
async fn autumn(db: &DatabaseConnection) -> String {
    add_term(db, TermFields { name: "Autumn".into(), starts_on: day(9, 23), weeks: 11 }, today()).await.unwrap().term.id
}

async fn module(db: &DatabaseConnection, term_id: &str) -> String {
    let fields = ModuleFields {
        term_id: term_id.into(),
        code: "COMP1001".into(),
        name: "Algorithms".into(),
        color: "blue".into(),
        credits: Some(15),
        link: None,
    };
    add_module(db, fields, today()).await.unwrap().module.id
}

fn weekly(weekdays: Vec<u32>, skip: Vec<i32>) -> Schedule {
    Schedule { kind: "lecture".into(), title: String::new(), weekdays, from_week: 1, to_week: 11, skip_weeks: skip, recorded: true }
}

#[tokio::test]
async fn weeks_count_from_the_monday_the_term_starts_in() {
    let db = setup().await;
    let term = autumn(&db).await;
    let summary = summary(&db, today()).await.unwrap();
    let card = &summary.terms[0];
    assert_eq!(summary.current.as_deref(), Some(term.as_str()));
    assert_eq!(card.week, Some(6));
    assert_eq!(card.ends_on, day(12, 6), "the Sunday of week 11");
    let after = super::service::summary(&db, day(12, 7)).await.unwrap();
    assert_eq!(after.terms[0].week, None);
    assert_eq!(after.current.as_deref(), Some(term.as_str()), "still the latest term to have started");
}

#[tokio::test]
async fn a_schedule_adds_numbered_lectures_skipping_reading_week() {
    let db = setup().await;
    let term = autumn(&db).await;
    let m = module(&db, &term).await;
    let added = add_schedule(&db, &m, weekly(vec![1, 3], vec![6])).await.unwrap();
    assert_eq!(added.len(), 20, "two a week for ten weeks");
    assert_eq!((added[0].title.as_str(), added[0].week, added[0].day), ("Lecture 1", Some(1), Some(day(9, 22))));
    assert_eq!((added[1].title.as_str(), added[1].day), ("Lecture 2", Some(day(9, 24))));
    assert!(added.iter().all(|l| l.week != Some(6)));

    let more = add_schedule(&db, &m, Schedule { from_week: 11, to_week: 11, ..weekly(vec![4], vec![]) }).await.unwrap();
    assert_eq!(more[0].title, "Lecture 21", "numbering carries on");
    assert!(add_schedule(&db, &m, Schedule { to_week: 12, ..weekly(vec![0], vec![]) }).await.is_err(), "past the end of the term");
}

#[tokio::test]
async fn lectures_that_have_passed_without_catching_up_are_behind() {
    let db = setup().await;
    let term = autumn(&db).await;
    let m = module(&db, &term).await;
    let added = add_schedule(&db, &m, weekly(vec![1], vec![])).await.unwrap();

    // Weeks 1 to 5 have been and gone; week 6's is yesterday.
    let s = summary(&db, today()).await.unwrap();
    assert_eq!(s.behind.len(), 6);
    assert_eq!(s.behind[0].lecture.title, "Lecture 1", "longest overdue first");
    assert_eq!(s.behind[0].days, 36);
    assert_eq!(s.upcoming.len(), 1, "next Tuesday's");
    assert_eq!(s.modules[0].behind, 6);

    // Attending isn't catching up; catching up is.
    set_stage(&db, &added[0].id, "attended", true, today()).await.unwrap();
    assert_eq!(summary(&db, today()).await.unwrap().behind.len(), 6);
    set_stage(&db, &added[0].id, "caught_up", true, today()).await.unwrap();
    let s = summary(&db, today()).await.unwrap();
    assert_eq!(s.behind.len(), 5);
    assert_eq!((s.modules[0].attended, s.modules[0].caught_up), (1, 1));
    assert_eq!(s.modules[0].percent.map(|p| p.round()), Some(9.0), "1 of 11");
}

#[tokio::test]
async fn reviewing_ticks_caught_up_and_unticking_caught_up_clears_review() {
    let db = setup().await;
    let term = autumn(&db).await;
    let m = module(&db, &term).await;
    let l = add_schedule(&db, &m, Schedule { to_week: 1, ..weekly(vec![0], vec![]) }).await.unwrap().remove(0);

    let reviewed = set_stage(&db, &l.id, "reviewed", true, today()).await.unwrap();
    assert_eq!((reviewed.caught_up_on, reviewed.reviewed_on), (Some(today()), Some(today())));
    let undone = set_stage(&db, &l.id, "caught_up", false, today()).await.unwrap();
    assert_eq!((undone.caught_up_on, undone.reviewed_on), (None, None));
    assert!(set_stage(&db, &l.id, "watched", true, today()).await.is_err());
}

#[tokio::test]
async fn a_lecture_takes_the_week_its_date_falls_in() {
    let db = setup().await;
    let term = autumn(&db).await;
    let m = module(&db, &term).await;
    let fields = |week, day| LectureFields {
        title: "Guest lecture".into(),
        kind: "lecture".into(),
        week,
        day,
        topics: "Graphs".into(),
        recorded: false,
        confidence: None,
        notes: String::new(),
    };
    let l = add_lecture(&db, &m, fields(None, Some(day(10, 14)))).await.unwrap();
    assert_eq!(l.week, Some(4));
    let l = update_lecture(&db, &l.id, fields(Some(2), Some(day(10, 21)))).await.unwrap();
    assert_eq!(l.week, Some(5), "the date wins");
    assert!(add_lecture(&db, &m, fields(Some(12), None)).await.is_err());

    // Moving the term moves dated lectures to their new week.
    update_term(&db, &term, TermFields { name: "Autumn".into(), starts_on: day(9, 30), weeks: 11 }, today()).await.unwrap();
    assert_eq!(get_module(&db, &m, today()).await.unwrap().lectures[0].week, Some(4));
}

#[tokio::test]
async fn deleting_a_term_takes_its_modules_and_lectures() {
    let db = setup().await;
    let term = autumn(&db).await;
    let m = module(&db, &term).await;
    add_schedule(&db, &m, weekly(vec![0], vec![])).await.unwrap();
    delete_term(&db, &term).await.unwrap();
    let s = summary(&db, today()).await.unwrap();
    assert!(s.terms.is_empty() && s.modules.is_empty() && s.behind.is_empty());
    assert!(get_module(&db, &m, today()).await.is_err());
}
