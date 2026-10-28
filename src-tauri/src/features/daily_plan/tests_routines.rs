//! Tests for phase 3: routines and insights. Day 22 (TODAY) is a Thursday.

use sea_orm::DatabaseConnection;

use super::service::*;
use super::tests::{day, setup, TODAY};
use super::types::{DayFields, RoutineFields};

const MON: i16 = 1;
const WED: i16 = 1 << 2;
const THU: i16 = 1 << 3;
const FRI: i16 = 1 << 4;

fn gym(weekdays: i16) -> RoutineFields {
    RoutineFields { title: "Gym".into(), start_minute: 7 * 60, duration_minutes: 60, color: "green".into(), weekdays }
}

async fn routine_blocks(db: &DatabaseConnection, on: u32) -> Vec<(String, i32)> {
    let plan = get_day(db, day(on), day(TODAY)).await.unwrap();
    plan.blocks.iter().filter(|b| b.routine_id.is_some()).map(|b| (b.title.clone(), b.start_minute)).collect()
}

#[tokio::test]
async fn routines_appear_on_their_weekdays_once() {
    let db = setup().await;
    create_routine(&db, gym(THU | FRI)).await.unwrap();

    assert_eq!(routine_blocks(&db, TODAY).await, [("Gym".to_owned(), 420)]);
    assert_eq!(routine_blocks(&db, 23).await.len(), 1);
    // Not on other weekdays, and reading a day twice doesn't double it.
    assert!(routine_blocks(&db, 24).await.is_empty());
    assert_eq!(routine_blocks(&db, TODAY).await.len(), 1);
    // Past days are history: nothing is added to them.
    assert!(routine_blocks(&db, 16).await.is_empty());
}

#[tokio::test]
async fn deleting_one_occurrence_skips_just_that_day() {
    let db = setup().await;
    create_routine(&db, gym(THU)).await.unwrap();
    let block = get_day(&db, day(TODAY), day(TODAY)).await.unwrap().blocks.remove(0);

    delete_block(&db, &block.id).await.unwrap();
    assert!(routine_blocks(&db, TODAY).await.is_empty());
    assert_eq!(routine_blocks(&db, 29).await.len(), 1);
}

#[tokio::test]
async fn editing_a_routine_updates_days_ahead_but_not_the_past() {
    let db = setup().await;
    let r = create_routine(&db, gym(MON | THU)).await.unwrap();
    // Laid out on Monday the 19th while that was "today".
    get_day(&db, day(19), day(19)).await.unwrap();
    routine_blocks(&db, TODAY).await;
    routine_blocks(&db, 26).await;

    let mut later = gym(THU | FRI);
    later.start_minute = 8 * 60;
    later.title = "Run".into();
    update_routine(&db, &r.id, later, day(TODAY)).await.unwrap();

    assert_eq!(routine_blocks(&db, TODAY).await, [("Run".to_owned(), 480)]);
    // Monday is no longer chosen, so next Monday loses it...
    assert!(routine_blocks(&db, 26).await.is_empty());
    // ...but last Monday keeps what happened.
    assert_eq!(routine_blocks(&db, 19).await, [("Gym".to_owned(), 420)]);
    // Newly chosen days get it.
    assert_eq!(routine_blocks(&db, 23).await.len(), 1);
}

#[tokio::test]
async fn deleting_a_routine_clears_days_ahead() {
    let db = setup().await;
    let r = create_routine(&db, gym(WED | THU)).await.unwrap();
    get_day(&db, day(21), day(21)).await.unwrap();
    routine_blocks(&db, TODAY).await;

    delete_routine(&db, &r.id, day(TODAY)).await.unwrap();
    assert!(routine_blocks(&db, TODAY).await.is_empty());
    assert!(routine_blocks(&db, 29).await.is_empty());
    assert_eq!(routine_blocks(&db, 21).await.len(), 1);
    assert!(list_routines(&db).await.unwrap().is_empty());
}

#[tokio::test]
async fn routines_are_validated() {
    let db = setup().await;
    assert!(create_routine(&db, gym(0)).await.is_err());
    let mut blank = gym(MON);
    blank.title = "  ".into();
    assert!(create_routine(&db, blank).await.is_err());
    let mut late = gym(MON);
    late.start_minute = 23 * 60 + 30;
    assert!(create_routine(&db, late).await.is_err());
}

/// Makes a task on a day with an estimate and tracked time, optionally done.
async fn timed(db: &DatabaseConnection, on: u32, estimate: i32, actual: i32, done: bool) -> String {
    use super::entities::task;
    use sea_orm::{ActiveModelTrait, EntityTrait, Set};
    let t = create_task(db, "Work", Some(day(on)), Some(estimate)).await.unwrap();
    let mut a: task::ActiveModel = task::Entity::find_by_id(t.id.as_str()).one(db).await.unwrap().unwrap().into();
    a.actual_minutes = Set(actual);
    a.update(db).await.unwrap();
    if done {
        set_done(db, &t.id, true).await.unwrap();
    }
    t.id
}

#[tokio::test]
async fn pace_needs_a_few_timed_tasks() {
    let db = setup().await;
    timed(&db, 20, 60, 90, true).await;
    timed(&db, 21, 30, 45, true).await;
    assert_eq!(insights(&db, day(TODAY)).await.unwrap().pace, None);

    timed(&db, 21, 30, 45, true).await;
    let found = insights(&db, day(TODAY)).await.unwrap();
    assert_eq!((found.pace, found.paced_tasks), (Some(1.5), 3));
    // The day view carries it too, for the capacity bar.
    assert_eq!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().pace, Some(1.5));
}

#[tokio::test]
async fn insights_count_days_weeks_and_priorities() {
    let db = setup().await;
    timed(&db, TODAY, 60, 50, true).await;
    timed(&db, TODAY, 30, 0, false).await;
    timed(&db, 13, 30, 40, true).await;
    let focus = timed(&db, 21, 30, 0, true).await;
    set_focus(&db, &focus, true).await.unwrap();
    let missed = timed(&db, 21, 30, 0, false).await;
    set_focus(&db, &missed, true).await.unwrap();

    let found = insights(&db, day(TODAY)).await.unwrap();
    assert_eq!(found.days.len(), 14);
    let last = found.days.last().unwrap();
    assert_eq!((last.day, last.planned, last.done), (day(TODAY), 2, 1));

    assert_eq!(found.weeks.len(), 8);
    let this_week = found.weeks.last().unwrap();
    assert_eq!((this_week.week_start, this_week.tracked_minutes), (day(19), 50));
    assert_eq!(found.weeks[6].tracked_minutes, 40);

    assert_eq!((found.focus_total, found.focus_done), (2, 1));
}

#[tokio::test]
async fn streaks_run_back_from_yesterday_until_today_is_done() {
    let db = setup().await;
    let planned = DayFields { planned: Some(true), ..Default::default() };
    for d in [18, 20, 21] {
        update_day(&db, day(d), planned.clone()).await.unwrap();
    }
    let found = insights(&db, day(TODAY)).await.unwrap();
    assert_eq!((found.planning_streak, found.shutdown_streak), (2, 0));

    update_day(&db, day(TODAY), planned).await.unwrap();
    assert_eq!(insights(&db, day(TODAY)).await.unwrap().planning_streak, 3);
}

/// A calendar with the given events, as if just read from its link.
async fn calendar_with(db: &DatabaseConnection, events: Vec<super::calendars::ics::DayEvent>) -> String {
    use super::entities::calendar;
    use sea_orm::{ActiveModelTrait, Set};
    let cal = calendar::ActiveModel {
        id: Set("cal".into()),
        name: Set("Work".into()),
        url: Set("https://example.com/private.ics".into()),
        color: Set("gray".into()),
        refreshed_at: Set(Some(chrono::Utc::now())),
        problem: Set(None),
        created_at: Set(chrono::Utc::now()),
        mine: Set(true),
        account_id: Set(None),
        remote_id: Set(None),
        writable: Set(false),
        shown: Set(true),
        publish: Set(false),
        published_hash: Set(None),
        deleted_at: Set(None),
    }
    .insert(db)
    .await
    .unwrap();
    super::calendars::replace_events(db, &cal, events).await.unwrap();
    cal.id
}

fn meeting(title: &str, start_minute: i32, duration_minutes: i32, all_day: bool, busy: bool) -> super::calendars::ics::DayEvent {
    super::calendars::ics::DayEvent { uid: title.into(), title: title.into(), day: day(TODAY), start_minute, duration_minutes, all_day, busy, ..Default::default() }
}

#[tokio::test]
async fn calendar_events_show_count_and_are_worked_around() {
    let db = setup().await;
    calendar_with(
        &db,
        vec![
            meeting("Stand-up", 9 * 60, 30, false, true),
            meeting("Focus time?", 10 * 60, 60, false, false),
            meeting("Holiday", 0, 24 * 60, true, false),
            meeting("Dinner", 19 * 60, 120, false, true),
        ],
    )
    .await;

    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    let titles: Vec<&str> = plan.events.iter().map(|e| e.title.as_str()).collect();
    assert_eq!(titles, ["Holiday", "Stand-up", "Focus time?", "Dinner"]);
    // Only busy time within working hours (9 to 5) counts: the stand-up.
    assert_eq!(planned_minutes(&plan.tasks, &plan.blocks, &plan.events, &plan.settings), 30);

    // Fitting tasks in skips the stand-up but not free time.
    create_task(&db, "Write", Some(day(TODAY)), Some(60)).await.unwrap();
    fit_into_day(&db, day(TODAY), 9 * 60).await.unwrap();
    let block = get_day(&db, day(TODAY), day(TODAY)).await.unwrap().blocks.remove(0);
    assert_eq!(block.start_minute, 9 * 60 + 30);

    // What's next includes meetings.
    let next = summary(&db, day(TODAY), 8 * 60).await.unwrap().next_block.unwrap();
    assert_eq!(next.title, "Stand-up");
}

#[tokio::test]
async fn removing_a_calendar_removes_its_events() {
    let db = setup().await;
    let id = calendar_with(&db, vec![meeting("Stand-up", 540, 30, false, true)]).await;
    super::calendars::remove_calendar(&db, &id).await.unwrap();
    assert!(get_day(&db, day(TODAY), day(TODAY)).await.unwrap().events.is_empty());
    assert!(super::calendars::list_calendars(&db).await.unwrap().is_empty());
}

#[tokio::test]
async fn calendar_links_must_be_secure() {
    let db = setup().await;
    for url in ["", "calendar.google.com/x.ics", "http://example.com/a.ics", "ftp://x/y"] {
        assert!(super::calendars::add_calendar(&db, "Work", url, "gray", day(TODAY)).await.is_err(), "{url}");
    }
}

#[tokio::test]
async fn a_range_shows_routines_ahead_without_writing_them() {
    use super::entities::block;
    use sea_orm::EntityTrait;
    let db = setup().await;
    create_routine(&db, gym(THU)).await.unwrap();
    create_task(&db, "Write", Some(day(23)), Some(60)).await.unwrap();
    // This Thursday's gym is laid out and then skipped.
    let today_block = get_day(&db, day(TODAY), day(TODAY)).await.unwrap().blocks.remove(0);
    delete_block(&db, &today_block.id).await.unwrap();
    let rows_before = block::Entity::find().all(&db).await.unwrap().len();

    let found = range(&db, day(15), day(31), day(TODAY)).await.unwrap();
    assert_eq!(found.days.len(), 17);
    let on = |d: u32| found.days.iter().find(|s| s.day == day(d)).unwrap();
    // Skipped stays skipped; next Thursday shows; last Thursday (the past) doesn't.
    assert!(on(TODAY).blocks.is_empty());
    assert_eq!(on(29).blocks.len(), 1);
    assert_eq!(on(29).planned_minutes, 60);
    assert!(on(15).blocks.is_empty());
    assert_eq!(on(23).tasks[0].title, "Write");
    // Looking ahead didn't write anything.
    assert_eq!(block::Entity::find().all(&db).await.unwrap().len(), rows_before);

    assert!(range(&db, day(19), day(1) + chrono::Days::new(500), day(TODAY)).await.is_err());
}

#[tokio::test]
async fn deadlines_from_quick_add_and_in_the_inbox() {
    use super::parse::DueHint;
    let db = setup().await;
    // Thursday the 22nd: "fri" is tomorrow, "thu" is today, 1 Oct has passed so it's next year's.
    assert_eq!(due_date(DueHint::Weekday(4), day(TODAY)), Some(day(23)));
    assert_eq!(due_date(DueHint::Weekday(3), day(TODAY)), Some(day(TODAY)));
    assert_eq!(due_date(DueHint::MonthDay { month: 10, day: 1 }, day(TODAY)), chrono::NaiveDate::from_ymd_opt(2027, 10, 1));
    assert_eq!(due_date(DueHint::MonthDay { month: 2, day: 30 }, day(TODAY)), None);

    let essay = quick_add(&db, "Essay due fri inbox 3h", day(TODAY), day(TODAY)).await.unwrap().task;
    assert_eq!((essay.title.as_str(), essay.day, essay.due_date), ("Essay", None, Some(day(23))));
    quick_add(&db, "No deadline inbox", day(TODAY), day(TODAY)).await.unwrap();
    quick_add(&db, "Overdue form due 2026-10-20 inbox", day(TODAY), day(TODAY)).await.unwrap();
    quick_add(&db, "Far off due 30 oct inbox", day(TODAY), day(TODAY)).await.unwrap();
    let planned_later = create_task(&db, "Slides", Some(day(24)), None).await.unwrap();
    set_due(&db, &planned_later.id, Some(day(25))).await.unwrap();
    let today_task = create_task(&db, "Already today", Some(day(TODAY)), None).await.unwrap();
    set_due(&db, &today_task.id, Some(day(TODAY))).await.unwrap();

    let plan = get_day(&db, day(TODAY), day(TODAY)).await.unwrap();
    // The inbox: soonest deadline first, then the rest.
    let inbox: Vec<&str> = plan.inbox.iter().map(|t| t.title.as_str()).collect();
    assert_eq!(inbox, ["Overdue form", "Essay", "Far off", "No deadline"]);
    // Due soon: overdue and within three days, unless planned for today already.
    let soon: Vec<&str> = plan.due_soon.iter().map(|t| t.title.as_str()).collect();
    assert_eq!(soon, ["Overdue form", "Essay", "Slides"]);
    // Only on today's plan.
    assert!(get_day(&db, day(23), day(TODAY)).await.unwrap().due_soon.is_empty());

    // Deadlines show on their day in the week, month and year.
    let week = range(&db, day(19), day(25), day(TODAY)).await.unwrap();
    let due_on = |d: u32| week.days.iter().find(|s| s.day == day(d)).unwrap().due.iter().map(|t| t.title.clone()).collect::<Vec<_>>();
    assert_eq!(due_on(23), ["Essay"]);
    assert_eq!(due_on(25), ["Slides"]);
    // A task due on the day it's planned for is listed there already.
    assert!(due_on(TODAY).is_empty());

    assert_eq!(set_due(&db, &essay.id, None).await.unwrap().due_date, None);
}
