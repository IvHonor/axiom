//! Tests for phase 2: time tracking, the Project Board link, the day's
//! rituals, and scheduling.

use sea_orm::DatabaseConnection;

use super::service::*;
use super::tests::{day, setup, TODAY};
use super::types::DayFields;

/// Pretends a task's timer started `minutes` ago.
async fn backdate_timer(db: &DatabaseConnection, id: &str, minutes: i64) {
    use super::entities::task;
    use sea_orm::{ActiveModelTrait, EntityTrait, Set};
    let mut t: task::ActiveModel = task::Entity::find_by_id(id).one(db).await.unwrap().unwrap().into();
    t.timer_started_at = Set(Some(chrono::Utc::now() - chrono::Duration::minutes(minutes)));
    t.update(db).await.unwrap();
}

#[tokio::test]
async fn timers_track_time_one_task_at_a_time() {
    let db = setup().await;
    let a = create_task(&db, "Write", Some(day(TODAY)), Some(60)).await.unwrap();
    let b = create_task(&db, "Read", Some(day(TODAY)), None).await.unwrap();

    start_timer(&db, &a.id).await.unwrap();
    backdate_timer(&db, &a.id, 25).await;
    assert_eq!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().running.unwrap().id, a.id);

    // Starting another stops the first and keeps its time.
    start_timer(&db, &b.id).await.unwrap();
    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    assert_eq!(plan.running.unwrap().id, b.id);
    let a_now = plan.tasks.iter().find(|t| t.id == a.id).unwrap();
    assert_eq!((a_now.actual_minutes, a_now.timer_started_at), (25, None));

    // Ticking a task off stops its timer too.
    backdate_timer(&db, &b.id, 10).await;
    let b_done = set_done(&db, &b.id, true).await.unwrap();
    assert_eq!((b_done.actual_minutes, b_done.timer_started_at.is_none()), (10, true));
    assert!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().running.is_none());

    // Time adds up across sessions.
    start_timer(&db, &a.id).await.unwrap();
    backdate_timer(&db, &a.id, 5).await;
    assert_eq!(stop_timer(&db, &a.id).await.unwrap().actual_minutes, 30);
}

#[tokio::test]
async fn board_cards_are_suggested_planned_and_ticked_off_on_the_board() {
    use crate::features::project_board::service as board;
    use crate::features::project_board::types::TaskFields as CardFields;
    let db = setup().await;
    let project = board::create_project(&db, "Website").await.unwrap();
    let columns = board::get_board(&db, &project.id).await.unwrap().columns;
    let column = |name: &str| columns.iter().find(|c| c.name == name).unwrap().id.clone();

    let due = board::create_task(&db, &column("To do"), "Fix footer").await.unwrap().task;
    let fields = CardFields {
        title: "Fix footer".into(),
        description: String::new(),
        priority: 0,
        start_date: None,
        due_date: Some(day(TODAY)),
        estimate: Some(1.5),
        recurrence: None,
    };
    board::update_task(&db, &due.id, fields).await.unwrap();
    board::create_task(&db, &column("Doing"), "Design hero").await.unwrap();
    board::create_task(&db, &column("Backlog"), "Someday").await.unwrap();

    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    let suggested: Vec<&str> = plan.suggestions.iter().map(|c| c.title.as_str()).collect();
    assert_eq!(suggested, ["Fix footer", "Design hero"], "due first, then in progress; not the backlog");
    assert_eq!(plan.suggestions[0].project_name, "Website");

    let planned = plan_card(&db, &due.id, Some(day(TODAY))).await.unwrap();
    assert_eq!((planned.title.as_str(), planned.estimate_minutes), ("Fix footer", Some(90)));
    let again = plan_card(&db, &due.id, Some(day(TODAY))).await.unwrap();
    assert_eq!(again.id, planned.id, "planning it again finds the same task");
    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    assert!(!plan.suggestions.iter().any(|c| c.id == due.id), "no longer suggested once planned");
    assert_eq!(plan.cards[0].id, due.id);

    let card_now = |db: DatabaseConnection| {
        let (project, due) = (project.id.clone(), due.id.clone());
        async move { board::get_board(&db, &project).await.unwrap().tasks.into_iter().find(|t| t.task.id == due).unwrap().task }
    };
    set_done(&db, &planned.id, true).await.unwrap();
    let card = card_now(db.clone()).await;
    assert_eq!(card.column_id, column("Done"));
    assert!(card.completed_at.is_some());

    set_done(&db, &planned.id, false).await.unwrap();
    assert_eq!(card_now(db.clone()).await.column_id, column("Doing"), "un-ticking puts it back in progress");
}

#[tokio::test]
async fn a_day_keeps_its_intention_and_reflection() {
    let db = setup().await;
    assert!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().info.planned_at.is_none());

    let fields = DayFields { intention: Some("  Ship the report ".into()), planned: Some(true), ..Default::default() };
    let info = update_day(&db, day(TODAY), fields).await.unwrap();
    assert_eq!(info.intention, "Ship the report");
    assert!(info.planned_at.is_some() && info.shutdown_at.is_none());

    let fields = DayFields { went_well: Some("Focused morning".into()), shut_down: Some(true), ..Default::default() };
    let info = update_day(&db, day(TODAY), fields).await.unwrap();
    assert_eq!((info.intention.as_str(), info.went_well.as_str()), ("Ship the report", "Focused morning"), "earlier words kept");
    assert!(info.shutdown_at.is_some());
    assert!(get_day(&db, day(TODAY + 1), day(TODAY)).await.unwrap().info.intention.is_empty(), "days are separate");
}

#[tokio::test]
async fn replan_moves_missed_work_to_the_next_free_time() {
    let db = setup().await;
    let missed = quick_add(&db, "Missed 30m 9:00", day(TODAY), day(TODAY)).await.unwrap();
    let finished = quick_add(&db, "Finished 30m 9:30", day(TODAY), day(TODAY)).await.unwrap();
    set_done(&db, &finished.task.id, true).await.unwrap();
    create_block(&db, day(TODAY), 10 * 60, 60, "Meeting", None).await.unwrap();
    let later = quick_add(&db, "Later 1h 13:00", day(TODAY), day(TODAY)).await.unwrap();
    quick_add(&db, "Too big 6h 9:15", day(TODAY), day(TODAY)).await.unwrap();

    // 10:20: the meeting runs until 11:00, so the missed task goes after it.
    let result = replan(&db, day(TODAY), 10 * 60 + 20).await.unwrap();
    assert_eq!(result.scheduled, ["Missed"]);
    assert_eq!(result.left_over, ["Too big"], "6 hours no longer fit before 17:30");

    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    let start_of = |id: &str| plan.blocks.iter().find(|b| b.task_id.as_deref() == Some(id)).map(|b| b.start_minute);
    assert_eq!(start_of(&missed.task.id), Some(11 * 60));
    assert_eq!(start_of(&finished.task.id), Some(9 * 60 + 30), "finished work stays where it was");
    assert_eq!(start_of(&later.task.id), Some(13 * 60), "future blocks stay");
    assert!(plan.blocks.iter().any(|b| b.title == "Meeting" && b.start_minute == 600), "fixed blocks never move");
    assert_eq!(plan.tasks.iter().filter(|t| t.title == "Too big").count(), 1, "a task that no longer fits stays in the list");
}

#[tokio::test]
async fn fit_into_day_places_top_priorities_first_around_fixed_blocks() {
    let db = setup().await;
    let second = create_task(&db, "Emails", Some(day(TODAY)), Some(30)).await.unwrap();
    let first = create_task(&db, "Deep work", Some(day(TODAY)), Some(60)).await.unwrap();
    set_focus(&db, &first.id, true).await.unwrap();
    let no_estimate = create_task(&db, "Call", Some(day(TODAY)), None).await.unwrap();
    create_task(&db, "Marathon", Some(day(TODAY)), Some(10 * 60)).await.unwrap();
    create_block(&db, day(TODAY), 10 * 60, 60, "Meeting", None).await.unwrap();

    let result = fit_into_day(&db, day(TODAY), 8 * 60 + 50).await.unwrap();
    assert_eq!(result.scheduled, ["Deep work", "Emails", "Call"]);
    assert_eq!(result.left_over, ["Marathon"]);

    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    let span = |id: &str| {
        let b = plan.blocks.iter().find(|b| b.task_id.as_deref() == Some(id)).unwrap();
        (b.start_minute, b.duration_minutes)
    };
    assert_eq!(span(&first.id), (9 * 60, 60), "starts with the working day, top priority first");
    assert_eq!(span(&second.id), (11 * 60, 30), "after the meeting");
    assert_eq!(span(&no_estimate.id), (11 * 60 + 30, 30), "30 minutes without an estimate");

    let again = fit_into_day(&db, day(TODAY), 9 * 60).await.unwrap();
    assert!(again.scheduled.is_empty(), "already scheduled tasks are left alone");
}
