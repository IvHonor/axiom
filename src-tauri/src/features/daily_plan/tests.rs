//! Tests for the Daily Plan against a throwaway in-memory database, set up
//! exactly as at startup.

use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::service::*;
use super::types::{BlockFields, CarryTo, Settings, TaskFields};

pub(super) async fn setup() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

pub(super) fn day(d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, d).unwrap()
}

pub(super) const TODAY: u32 = 22;

async fn titles(db: &DatabaseConnection, on: u32) -> Vec<String> {
    get_day(db, day(on), day(TODAY)).await.unwrap().tasks.into_iter().map(|t| t.title).collect()
}

#[tokio::test]
async fn quick_add_makes_a_task_and_a_block() {
    let db = setup().await;
    let added = quick_add(&db, "Write report 45m 2pm !", day(TODAY), day(TODAY)).await.unwrap();
    assert_eq!(added.task.title, "Write report");
    assert_eq!(added.task.estimate_minutes, Some(45));
    assert_eq!(added.task.focus_rank, Some(1));
    let block = added.block.expect("a block at 2pm");
    assert_eq!((block.start_minute, block.duration_minutes), (14 * 60, 45));
    assert_eq!(block.task_id.as_deref(), Some(added.task.id.as_str()));

    let later = quick_add(&db, "Gym tomorrow", day(TODAY), day(TODAY)).await.unwrap();
    assert_eq!(later.task.day, Some(day(TODAY + 1)));
    assert!(later.block.is_none());

    assert!(quick_add(&db, "45m 2pm", day(TODAY), day(TODAY)).await.is_err(), "needs a title");
}

#[tokio::test]
async fn a_day_lists_top_priorities_first_then_in_order() {
    let db = setup().await;
    for title in ["A", "B", "C"] {
        create_task(&db, title, Some(day(TODAY)), None).await.unwrap();
    }
    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    let c = plan.tasks.iter().find(|t| t.title == "C").unwrap().id.clone();
    set_focus(&db, &c, true).await.unwrap();
    assert_eq!(titles(&db, TODAY).await, ["C", "A", "B"]);
}

#[tokio::test]
async fn at_most_three_top_priorities_kept_in_rank_order() {
    let db = setup().await;
    let mut ids = Vec::new();
    for title in ["A", "B", "C", "D"] {
        ids.push(create_task(&db, title, Some(day(TODAY)), None).await.unwrap().id);
    }
    for id in &ids[..3] {
        set_focus(&db, id, true).await.unwrap();
    }
    let err = set_focus(&db, &ids[3], true).await.unwrap_err();
    assert!(err.to_string().contains("already have 3"), "{err}");

    // Unstarring the first moves the others up.
    set_focus(&db, &ids[0], false).await.unwrap();
    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    let rank = |title: &str| plan.tasks.iter().find(|t| t.title == title).unwrap().focus_rank;
    assert_eq!((rank("A"), rank("B"), rank("C")), (None, Some(1), Some(2)));

    // Deleting a top priority closes the gap too.
    delete_task(&db, &ids[1]).await.unwrap();
    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    assert_eq!(plan.tasks.iter().find(|t| t.title == "C").unwrap().focus_rank, Some(1));

    let inbox = create_task(&db, "Someday", None, None).await.unwrap();
    assert!(set_focus(&db, &inbox.id, true).await.is_err(), "inbox tasks have no day to prioritise");
}

#[tokio::test]
async fn inbox_and_earlier_days() {
    let db = setup().await;
    create_task(&db, "Idea", None, None).await.unwrap();
    let missed = create_task(&db, "Missed", Some(day(TODAY - 2)), None).await.unwrap();
    let finished = create_task(&db, "Finished", Some(day(TODAY - 1)), None).await.unwrap();
    set_done(&db, &finished.id, true).await.unwrap();

    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    assert_eq!(plan.inbox.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), ["Idea"]);
    assert_eq!(plan.earlier.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), ["Missed"], "only unfinished ones");
    assert!(get_day(&db, day(TODAY + 1), day(TODAY)).await.unwrap().earlier.is_empty(), "only shown on today");

    carry_over(&db, &[missed.id.clone()], CarryTo::Today, day(TODAY)).await.unwrap();
    assert_eq!(titles(&db, TODAY).await, ["Missed"]);
    assert!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().earlier.is_empty());

    carry_over(&db, &[missed.id.clone()], CarryTo::Inbox, day(TODAY)).await.unwrap();
    assert_eq!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().inbox.len(), 2);
    carry_over(&db, &[missed.id], CarryTo::Delete, day(TODAY)).await.unwrap();
    assert_eq!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().inbox.len(), 1);
}

#[tokio::test]
async fn scheduling_an_inbox_task_plans_it_for_that_day() {
    let db = setup().await;
    let task = create_task(&db, "Call bank", None, Some(20)).await.unwrap();
    let block = create_block(&db, day(TODAY), 9 * 60, 20, "", Some(&task.id)).await.unwrap();
    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    assert_eq!(plan.tasks.len(), 1, "moved from the inbox to the day");
    assert_eq!(plan.blocks[0].id, block.id);
    assert!(plan.inbox.is_empty());
}

#[tokio::test]
async fn moving_a_task_to_another_day_drops_its_rank_and_blocks() {
    let db = setup().await;
    let added = quick_add(&db, "Deep work 2h 9am !", day(TODAY), day(TODAY)).await.unwrap();
    move_task(&db, &added.task.id, Some(day(TODAY + 1)), None).await.unwrap();

    let today = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    assert!(today.tasks.is_empty() && today.blocks.is_empty());
    let tomorrow = get_day(&db, day(TODAY + 1), day(TODAY)).await.unwrap();
    assert_eq!(tomorrow.tasks[0].focus_rank, None);
}

#[tokio::test]
async fn tasks_reorder_within_a_day() {
    let db = setup().await;
    let a = create_task(&db, "A", Some(day(TODAY)), None).await.unwrap();
    create_task(&db, "B", Some(day(TODAY)), None).await.unwrap();
    let c = create_task(&db, "C", Some(day(TODAY)), None).await.unwrap();
    move_task(&db, &c.id, Some(day(TODAY)), Some(&a.id)).await.unwrap();
    assert_eq!(titles(&db, TODAY).await, ["C", "A", "B"]);
}

#[tokio::test]
async fn blocks_are_validated_and_editable() {
    let db = setup().await;
    assert!(create_block(&db, day(TODAY), 23 * 60, 90, "Late", None).await.is_err(), "past midnight");
    assert!(create_block(&db, day(TODAY), 600, 2, "Tiny", None).await.is_err(), "too short");
    assert!(create_block(&db, day(TODAY), 600, 30, "  ", None).await.is_err(), "needs a name");

    let lunch = create_block(&db, day(TODAY), 12 * 60, 60, "Lunch", None).await.unwrap();
    let fields = BlockFields { start_minute: 12 * 60 + 30, duration_minutes: 45, title: "Long lunch".into(), color: "green".into() };
    let moved = update_block(&db, &lunch.id, fields).await.unwrap();
    assert_eq!((moved.start_minute, moved.duration_minutes, moved.color.as_str()), (750, 45, "green"));

    let odd = BlockFields { start_minute: 750, duration_minutes: 45, title: "Lunch".into(), color: "not-a-colour".into() };
    assert_eq!(update_block(&db, &lunch.id, odd).await.unwrap().color, "blue");

    delete_block(&db, &lunch.id).await.unwrap();
    assert!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().blocks.is_empty());
}

#[tokio::test]
async fn planned_time_counts_estimates_and_other_blocks() {
    let db = setup().await;
    quick_add(&db, "Report 90m", day(TODAY), day(TODAY)).await.unwrap();
    // No estimate, but scheduled for 30 minutes.
    quick_add(&db, "Emails 10am", day(TODAY), day(TODAY)).await.unwrap();
    create_block(&db, day(TODAY), 13 * 60, 60, "Team meeting", None).await.unwrap();
    // No estimate and not scheduled: counts as nothing yet.
    create_task(&db, "Someday-ish", Some(day(TODAY)), None).await.unwrap();

    let summary = summary(&db, day(TODAY), 9 * 60).await.unwrap();
    assert_eq!(summary.planned_minutes, 90 + 30 + 60);
    assert_eq!(summary.available_minutes, Settings::default().day_end_minute - Settings::default().day_start_minute);
}

#[tokio::test]
async fn summary_shows_progress_priorities_and_whats_next() {
    let db = setup().await;
    let first = quick_add(&db, "Standup 9:00 15m !", day(TODAY), day(TODAY)).await.unwrap();
    quick_add(&db, "Write 11:00 1h", day(TODAY), day(TODAY)).await.unwrap();
    set_done(&db, &first.task.id, true).await.unwrap();

    let at_nine_ten = summary(&db, day(TODAY), 9 * 60 + 10).await.unwrap();
    assert_eq!((at_nine_ten.total, at_nine_ten.done), (2, 1));
    assert_eq!(at_nine_ten.focus.len(), 1);
    let next = at_nine_ten.next_block.unwrap();
    assert_eq!((next.title.as_str(), next.in_progress), ("Standup", true));

    let at_ten = summary(&db, day(TODAY), 10 * 60).await.unwrap().next_block.unwrap();
    assert_eq!((at_ten.title.as_str(), at_ten.in_progress), ("Write", false));
    assert!(summary(&db, day(TODAY), 23 * 60).await.unwrap().next_block.is_none());
}

#[tokio::test]
async fn tasks_can_be_edited_and_ticked_off() {
    let db = setup().await;
    let task = create_task(&db, "Draft", Some(day(TODAY)), None).await.unwrap();
    let fields = TaskFields { title: " Final draft ".into(), notes: "Use the template".into(), estimate_minutes: Some(50) };
    let edited = update_task(&db, &task.id, fields).await.unwrap();
    assert_eq!((edited.title.as_str(), edited.estimate_minutes), ("Final draft", Some(50)));
    assert!(update_task(&db, &task.id, TaskFields { title: "".into(), notes: "".into(), estimate_minutes: None }).await.is_err());
    assert!(update_task(&db, &task.id, TaskFields { title: "X".into(), notes: "".into(), estimate_minutes: Some(0) }).await.is_err());

    assert!(set_done(&db, &task.id, true).await.unwrap().done_at.is_some());
    assert!(set_done(&db, &task.id, false).await.unwrap().done_at.is_none());
}

#[tokio::test]
async fn working_hours_have_sensible_defaults_and_limits() {
    let db = setup().await;
    assert_eq!(get_settings(&db).await.unwrap(), Settings::default());
    let mine = Settings { day_start_minute: 8 * 60, day_end_minute: 16 * 60, buffer_percent: 25 };
    update_settings(&db, mine).await.unwrap();
    assert_eq!(get_settings(&db).await.unwrap(), mine);
    update_settings(&db, Settings { buffer_percent: 10, ..mine }).await.unwrap();
    assert_eq!(get_settings(&db).await.unwrap().buffer_percent, 10, "updates the same row");

    for bad in [
        Settings { day_start_minute: 10 * 60, day_end_minute: 10 * 60 + 30, ..mine },
        Settings { day_start_minute: -5, ..mine },
        Settings { buffer_percent: 80, ..mine },
    ] {
        assert!(update_settings(&db, bad).await.is_err(), "{bad:?}");
    }
}
