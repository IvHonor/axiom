//! Tests for Goals against a throwaway in-memory database.

use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::service::*;
use super::types::{GoalFields, Pace};

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

/// 1 January to 31 December 2026, a number from `start` to `target`.
fn target(title: &str, start: f64, target: f64, unit: &str, measure: &str) -> GoalFields {
    GoalFields {
        title: title.into(),
        icon: String::new(),
        area: "health".into(),
        kind: "target".into(),
        source: "manual".into(),
        source_id: String::new(),
        start_value: start,
        target_value: target,
        unit: unit.into(),
        measure: measure.into(),
        start_date: day(1, 1),
        due_date: Some(day(12, 31)),
        why: "To feel fitter".into(),
        obstacle: "Rainy evenings".into(),
        plan: "If it's raining after work, I'll use the treadmill".into(),
    }
}

fn steps(title: &str) -> GoalFields {
    GoalFields { kind: "milestones".into(), area: "career".into(), ..target(title, 0.0, 0.0, "", "") }
}

#[tokio::test]
async fn a_total_adds_up_check_ins_and_keeps_pace() {
    let db = setup().await;
    let g = create(&db, target("Run 500 km", 0.0, 500.0, "km", "total"), day(7, 2)).await.unwrap();
    // Half the year gone, nothing run: behind.
    assert_eq!((g.percent, g.pace), (0.0, Some(Pace::Behind)));
    assert!((g.expected.unwrap() - 250.0).abs() < 2.0, "{:?}", g.expected);

    add_log(&db, &g.goal.id, day(6, 1), 200.0, "Spring", day(7, 2)).await.unwrap();
    let g = add_log(&db, &g.goal.id, day(7, 1), 60.0, "", day(7, 2)).await.unwrap();
    assert_eq!((g.current, g.pace), (260.0, Some(Pace::OnTrack)));
    let per_week = g.per_week.unwrap();
    assert!((per_week - 240.0 / 26.0).abs() < 0.5, "about 9 km a week from here: {per_week}");
    assert_eq!(g.last_progress, Some(day(7, 1)));
    assert!(add_log(&db, &g.goal.id, day(7, 3), 5.0, "", day(7, 2)).await.is_err(), "not tomorrow");

    let g = add_log(&db, &g.goal.id, day(7, 2), 250.0, "", day(7, 2)).await.unwrap();
    assert!(g.reached && g.pace.is_none());
    assert_eq!(progress_text(&g), "510 km of 500 km");
}

#[tokio::test]
async fn a_latest_reading_counts_and_can_go_down() {
    let db = setup().await;
    let g = create(&db, target("Get to 72 kg", 80.0, 72.0, "kg", "latest"), day(7, 2)).await.unwrap();
    add_log(&db, &g.goal.id, day(3, 1), 78.0, "", day(7, 2)).await.unwrap();
    let g = add_log(&db, &g.goal.id, day(6, 1), 76.0, "", day(7, 2)).await.unwrap();
    assert_eq!(g.current, 76.0);
    assert!((g.percent - 50.0).abs() < 1e-9, "halfway down");
    assert_eq!(g.pace, Some(Pace::OnTrack));
    let detail = get(&db, &g.goal.id, day(7, 2)).await.unwrap();
    assert_eq!(detail.logs.len(), 2);
    delete_log(&db, &detail.logs[0].id).await.unwrap();
    assert_eq!(get(&db, &g.goal.id, day(7, 2)).await.unwrap().goal.current, 78.0, "back to the one before");
}

#[tokio::test]
async fn milestones_tick_off_and_goals_get_done() {
    let db = setup().await;
    let g = create(&db, steps("Launch the side project"), day(7, 2)).await.unwrap();
    let ids: Vec<String> = {
        let mut ids = Vec::new();
        for t in ["Landing page", "Beta", "Launch"] {
            ids.push(add_milestone(&db, &g.goal.id, t, None).await.unwrap().id);
        }
        ids
    };
    tick_milestone(&db, &ids[0], true, day(3, 1)).await.unwrap();
    tick_milestone(&db, &ids[1], true, day(6, 1)).await.unwrap();
    let g = get(&db, &g.goal.id, day(7, 2)).await.unwrap().goal;
    assert_eq!((g.current, g.target), (2.0, 3.0));
    assert_eq!(g.pace, Some(Pace::Ahead), "two thirds done, half the year gone");
    assert_eq!(progress_text(&g), "2 of 3 milestones");
    assert!(add_log(&db, &g.goal.id, day(7, 2), 1.0, "", day(7, 2)).await.is_err(), "check-ins are for numbers");

    let done = set_status(&db, &g.goal.id, "done", day(7, 2)).await.unwrap();
    assert_eq!(done.goal.completed_on, Some(day(7, 2)));
    let s = summary(&db, day(7, 2)).await.unwrap();
    assert_eq!((s.active, s.done_this_year), (0, 1));
    assert_eq!(set_status(&db, &g.goal.id, "active", day(7, 2)).await.unwrap().goal.completed_on, None);
}

#[tokio::test]
async fn goals_are_checked_before_saving() {
    let db = setup().await;
    let bad = |change: fn(&mut GoalFields)| {
        let mut f = target("Run", 0.0, 10.0, "km", "total");
        change(&mut f);
        f
    };
    for f in [
        bad(|f| f.title = " ".into()),
        bad(|f| f.area = "space".into()),
        bad(|f| f.target_value = 0.0),
        bad(|f| f.due_date = Some(day(1, 1))),
        bad(|f| f.source = "project".into()),
        bad(|f| f.source = "finance_account".into()),
    ] {
        assert!(create(&db, f, day(7, 2)).await.is_err());
    }
    // A one-off goal has no numbers to check.
    let once = create(&db, GoalFields { kind: "once".into(), ..target("Climb Snowdon", 5.0, 5.0, "", "") }, day(7, 2)).await.unwrap();
    assert_eq!((once.target, once.pace), (1.0, None));
    assert_eq!(icon_of(&once.goal), "💪");
}

#[tokio::test]
async fn goals_follow_the_other_extensions() {
    use crate::features::{finance, journal, project_board, reading};
    let db = setup().await;
    let today = day(7, 2);

    // Finance: the account's balance, in pounds.
    let state = finance::service::setup(
        &db,
        "GBP",
        finance::types::AccountFields { name: "Savings".into(), kind: "savings".into(), currency: "GBP".into(), opening_balance: 230_000, color: "blue".into() },
        today,
    )
    .await
    .unwrap();
    let account = state.accounts[0].account.id.clone();
    let saving = create(&db, GoalFields { source: "finance_account".into(), source_id: account.clone(), area: "money".into(), ..target("Save £5,000", 0.0, 5000.0, "£", "total") }, today).await.unwrap();
    assert_eq!((saving.current, saving.goal.measure.as_str(), saving.source_name.as_deref()), (2300.0, "latest", Some("Savings")));
    assert_eq!(progress_text(&saving), "£2,300 of £5,000");
    assert!(add_log(&db, &saving.goal.id, today, 10.0, "", today).await.is_err(), "it keeps track by itself");

    // Reading: books finished since the goal began.
    let book = reading::service::add_book(
        &db,
        reading::types::NewBook {
            title: "Dune".into(),
            authors: "Frank Herbert".into(),
            cover_url: None,
            work_key: None,
            edition_key: None,
            isbn: None,
            published_year: None,
            api_pages: Some(600),
            pages: None,
            format: "print".into(),
            unit: None,
            audio_minutes: None,
            status: "reading".into(),
        },
        today,
    )
    .await
    .unwrap();
    let books = create(&db, GoalFields { source: "reading_books".into(), ..target("Read 24 books", 0.0, 24.0, "books", "total") }, today).await.unwrap();
    assert_eq!(books.current, 0.0);
    reading::service::set_status(&db, &book.book.id, "finished", today).await.unwrap();
    assert_eq!(get(&db, &books.goal.id, today).await.unwrap().goal.current, 1.0);

    // Journal: days written since the start.
    let entries = create(&db, GoalFields { source: "journal_entries".into(), ..target("Journal 100 days", 0.0, 100.0, "days", "total") }, today).await.unwrap();
    let e = journal::service::create(&db, day(6, 30), "").await.unwrap();
    journal::service::save(&db, &e.id, None, "A good day.".into(), 3).await.unwrap();
    assert_eq!(get(&db, &entries.goal.id, today).await.unwrap().goal.current, 1.0);

    // Project Board: cards done out of all of them.
    let project = project_board::service::create_project(&db, "Thesis").await.unwrap();
    let board = project_board::service::get_board(&db, &project.id).await.unwrap();
    let (todo, done) = (board.columns.iter().find(|c| !c.is_done).unwrap().id.clone(), board.columns.iter().find(|c| c.is_done).unwrap().id.clone());
    let a = project_board::service::create_task(&db, &todo, "Literature review").await.unwrap();
    project_board::service::create_task(&db, &todo, "Write up").await.unwrap();
    project_board::service::move_task(&db, &a.task.id, &done, None).await.unwrap();
    let thesis = create(&db, GoalFields { source: "project".into(), source_id: project.id.clone(), ..steps("Finish the thesis") }, today).await.unwrap();
    assert_eq!((thesis.current, thesis.target, thesis.source_name.as_deref()), (1.0, 2.0, Some("Thesis")));
    assert_eq!(progress_text(&thesis), "1 of 2 cards");

    // What there is to follow.
    let s = sources(&db, today).await.unwrap();
    assert_eq!((s.accounts.len(), s.projects.len()), (1, 1));

    // The weekly check-in lists them all.
    let digest = crate::notifications::digests::digest(&db, "goals.weekly", today, false).await.unwrap().unwrap();
    assert!(digest.headline().0.starts_with("Your goals"));

    // Gone from Project Board: it says so.
    project_board::service::delete_project(&db, &project.id).await.unwrap();
    assert_eq!(get(&db, &thesis.goal.id, today).await.unwrap().goal.source_name.as_deref(), Some("No longer there"));
}

#[tokio::test]
async fn goals_follow_learning_chapters_and_hours() {
    use crate::features::learning::service as learning;
    use crate::features::learning::types::{Draft, SessionFields, SkillFields, SourceFields};
    let db = setup().await;
    let today = day(7, 2);
    let skill = learning::add_skill(&db, SkillFields { name: "Rust".into(), icon: "🦀".into(), color: "orange".into(), why: String::new(), archived: false }).await.unwrap();
    let fields = SourceFields {
        skill_id: skill.id,
        kind: "book".into(),
        title: "The Rust Book".into(),
        author: String::new(),
        link: None,
        cover_url: None,
        unit_name: String::new(),
        finish_by: None,
        notes: String::new(),
    };
    let book = learning::add_source(&db, fields).await.unwrap();
    let chapters = (1..=4).map(|n| Draft { title: format!("Chapter {n}"), level: 0, minutes: None, page: None }).collect();
    let units = learning::add_units(&db, &book.id, chapters, false, today).await.unwrap();
    learning::set_done(&db, &units[0].id, true, today).await.unwrap();
    for (d, minutes) in [(day(6, 30), 90), (day(7, 1), 30)] {
        learning::add_session(&db, SessionFields { source_id: book.id.clone(), day: d, minutes, note: String::new() }).await.unwrap();
    }

    let finish = create(&db, GoalFields { source: "learning_source".into(), source_id: book.id.clone(), ..steps("Finish the Rust book") }, today).await.unwrap();
    assert_eq!((finish.current, finish.target, finish.source_name.as_deref()), (1.0, 4.0, Some("The Rust Book")));
    assert_eq!(progress_text(&finish), "1 of 4 done");

    let hours = create(&db, GoalFields { source: "learning_hours".into(), start_date: day(7, 1), ..target("Study 100 hours", 0.0, 100.0, "hours", "total") }, today).await.unwrap();
    assert_eq!(hours.current, 0.5, "only from the start date on");
    assert_eq!(sources(&db, today).await.unwrap().learning.len(), 1);
}

#[tokio::test]
async fn goals_keep_your_order_and_go_with_their_check_ins() {
    let db = setup().await;
    let a = create(&db, target("A", 0.0, 1.0, "", "total"), day(7, 2)).await.unwrap();
    let b = create(&db, target("B", 0.0, 1.0, "", "total"), day(7, 2)).await.unwrap();
    move_goal(&db, &b.goal.id, Some(&a.goal.id)).await.unwrap();
    let order: Vec<String> = list(&db, day(7, 2)).await.unwrap().into_iter().map(|g| g.goal.title).collect();
    assert_eq!(order, ["B", "A"]);
    add_log(&db, &a.goal.id, day(7, 1), 1.0, "", day(7, 2)).await.unwrap();
    delete(&db, &a.goal.id).await.unwrap();
    assert!(get(&db, &a.goal.id, day(7, 2)).await.is_err());
    assert_eq!(list(&db, day(7, 2)).await.unwrap().len(), 1);
    assert_eq!(amount(1234.5, "km"), "1,234.5 km");
    assert_eq!(amount(-20.0, "EUR"), "-€20");
}
