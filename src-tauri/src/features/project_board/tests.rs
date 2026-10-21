//! Tests for the board logic against a throwaway in-memory SQLite database,
//! set up exactly as at startup (migrations and sync triggers). Run with `cargo test`.

use chrono::{Days, Local};
use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection};

use super::service::*;
use super::types::{ColumnFields, TaskFields};

async fn setup() -> DatabaseConnection {
    // One connection: each SQLite in-memory connection is its own database.
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn fields(title: &str) -> TaskFields {
    TaskFields {
        title: title.into(),
        description: String::new(),
        priority: 0,
        start_date: None,
        due_date: None,
        estimate: None,
        recurrence: None,
    }
}

/// Titles of the tasks in a column, top to bottom.
async fn column_titles(db: &DatabaseConnection, project_id: &str, column_id: &str) -> Vec<String> {
    get_board(db, project_id)
        .await
        .unwrap()
        .tasks
        .into_iter()
        .filter(|t| t.task.column_id == column_id)
        .map(|t| t.task.title)
        .collect()
}

/// A project and the ids of its four default columns.
async fn project_with_columns(db: &DatabaseConnection, name: &str) -> (String, [String; 4]) {
    let project = create_project(db, name).await.unwrap();
    let columns = get_board(db, &project.id).await.unwrap().columns;
    let ids: [String; 4] = std::array::from_fn(|i| columns[i].id.clone());
    (project.id, ids)
}

#[tokio::test]
async fn new_project_gets_default_columns() {
    let db = setup().await;
    let project = create_project(&db, "  Axiom  ").await.unwrap();
    assert_eq!(project.name, "Axiom");
    assert_eq!(project.id.len(), 36, "ids are UUIDs");

    let board = get_board(&db, &project.id).await.unwrap();
    let names: Vec<_> = board.columns.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["Backlog", "To do", "Doing", "Done"]);
    assert!(board.columns[3].is_done);
    assert!(create_project(&db, "   ").await.is_err());
}

#[tokio::test]
async fn tasks_append_and_reorder_within_a_column() {
    let db = setup().await;
    let (project, [_, todo, ..]) = project_with_columns(&db, "P").await;

    let a = create_task(&db, &todo, "A").await.unwrap().task;
    create_task(&db, &todo, "B").await.unwrap();
    let c = create_task(&db, &todo, "C").await.unwrap().task;
    assert_eq!(column_titles(&db, &project, &todo).await, ["A", "B", "C"]);

    move_task(&db, &c.id, &todo, Some(&a.id)).await.unwrap();
    assert_eq!(column_titles(&db, &project, &todo).await, ["C", "A", "B"]);

    move_task(&db, &c.id, &todo, None).await.unwrap();
    assert_eq!(column_titles(&db, &project, &todo).await, ["A", "B", "C"]);

    move_task(&db, &a.id, &todo, Some(&c.id)).await.unwrap();
    assert_eq!(column_titles(&db, &project, &todo).await, ["B", "A", "C"]);
}

#[tokio::test]
async fn repeated_moves_into_the_same_gap_stay_ordered() {
    let db = setup().await;
    let (project, [_, todo, ..]) = project_with_columns(&db, "P").await;
    create_task(&db, &todo, "first").await.unwrap();
    let last = create_task(&db, &todo, "last").await.unwrap().task;

    // Each new task goes just before "last", halving the gap every time,
    // until the column has to be renumbered.
    for i in 0..60 {
        let t = create_task(&db, &todo, &format!("t{i}")).await.unwrap().task;
        move_task(&db, &t.id, &todo, Some(&last.id)).await.unwrap();
    }
    let expected: Vec<String> = std::iter::once("first".to_string())
        .chain((0..60).map(|i| format!("t{i}")))
        .chain(std::iter::once("last".to_string()))
        .collect();
    assert_eq!(column_titles(&db, &project, &todo).await, expected);
}

#[tokio::test]
async fn done_column_completes_and_reopens_with_history() {
    let db = setup().await;
    let (_, [_, todo, _, done]) = project_with_columns(&db, "P").await;
    let task = create_task(&db, &todo, "Ship it").await.unwrap().task;

    let moved = move_task(&db, &task.id, &done, None).await.unwrap();
    assert!(moved.completed_at.is_some());

    let moved = move_task(&db, &task.id, &todo, None).await.unwrap();
    assert!(moved.completed_at.is_none());

    let kinds: Vec<_> = get_task(&db, &task.id).await.unwrap().events.into_iter().map(|e| e.kind).collect();
    // Newest first.
    assert_eq!(kinds, ["reopened", "moved", "completed", "moved", "created"]);

    // Created straight into Done counts as completed too.
    let instant = create_task(&db, &done, "Already done").await.unwrap().task;
    assert!(instant.completed_at.is_some());
}

#[tokio::test]
async fn updating_a_task_validates_and_logs_changes() {
    let db = setup().await;
    let (_, [_, todo, ..]) = project_with_columns(&db, "P").await;
    let task = create_task(&db, &todo, "Draft").await.unwrap().task;
    let due = Local::now().date_naive();

    let detail = update_task(
        &db,
        &task.id,
        TaskFields { priority: 3, due_date: Some(due), estimate: Some(1.5), ..fields("Final") },
    )
    .await
    .unwrap();
    assert_eq!(detail.task.title, "Final");
    assert_eq!(detail.task.priority, 3);
    assert!(detail.task.updated_at >= task.updated_at, "saving stamps updated_at");
    let kinds: Vec<_> = detail.events.iter().map(|e| e.kind.as_str()).collect();
    assert_eq!(kinds, ["priority", "due", "renamed", "created"]);

    assert!(update_task(&db, &task.id, fields("")).await.is_err());
    assert!(update_task(&db, &task.id, TaskFields { priority: 9, ..fields("x") }).await.is_err());
    let late_start = TaskFields {
        start_date: due.checked_add_days(Days::new(2)),
        due_date: Some(due),
        ..fields("x")
    };
    assert!(update_task(&db, &task.id, late_start).await.is_err());
}

#[tokio::test]
async fn labels_and_checklists_show_on_cards() {
    let db = setup().await;
    let (project, [_, todo, ..]) = project_with_columns(&db, "P").await;
    let other = create_project(&db, "Other").await.unwrap();
    let task = create_task(&db, &todo, "Card").await.unwrap().task;

    let urgent = create_label(&db, &project, "Urgent", "red").await.unwrap();
    let foreign = create_label(&db, &other.id, "Elsewhere", "blue").await.unwrap();
    assert!(create_label(&db, &project, "Bad", "chartreuse").await.is_err());

    // Labels from another project are ignored.
    let set = set_task_labels(&db, &task.id, vec![urgent.id.clone(), foreign.id.clone()]).await.unwrap();
    assert_eq!(set, [urgent.id.clone()]);
    // Setting them again replaces rather than duplicates.
    set_task_labels(&db, &task.id, vec![urgent.id.clone()]).await.unwrap();

    let one = add_checklist_item(&db, &task.id, "One").await.unwrap();
    add_checklist_item(&db, &task.id, "Two").await.unwrap();
    update_checklist_item(&db, &one.id, "One", true).await.unwrap();

    let card = get_board(&db, &project).await.unwrap().tasks.remove(0);
    assert_eq!(card.label_ids, [urgent.id.clone()]);
    assert_eq!((card.checklist_done, card.checklist_total), (1, 2));

    delete_label(&db, &urgent.id).await.unwrap();
    assert!(get_task(&db, &task.id).await.unwrap().label_ids.is_empty());
}

#[tokio::test]
async fn columns_can_be_edited_moved_and_deleted_when_empty() {
    let db = setup().await;
    let (project, [backlog, todo, ..]) = project_with_columns(&db, "P").await;
    let task = create_task(&db, &todo, "Busy").await.unwrap().task;

    // Marking To do as done completes the task already in it.
    update_column(&db, &todo, ColumnFields { name: "Ready".into(), is_done: true, wip_limit: Some(3) })
        .await
        .unwrap();
    assert!(get_task(&db, &task.id).await.unwrap().task.completed_at.is_some());
    assert!(update_column(&db, &todo, ColumnFields { name: "Ready".into(), is_done: true, wip_limit: Some(0) })
        .await
        .is_err());

    let order = move_column(&db, &todo, -1).await.unwrap();
    assert_eq!(order[0].id, todo);
    assert_eq!(order[1].id, backlog);

    // Not empty, so it can't go; once the only task is archived, it can.
    assert!(delete_column(&db, &todo).await.is_err());
    set_archived(&db, &task.id, true).await.unwrap();
    delete_column(&db, &todo).await.unwrap();
    let after = get_board(&db, &project).await.unwrap();
    assert_eq!(after.columns.len(), 3);
    assert!(after.tasks.is_empty());
}

#[tokio::test]
async fn summary_counts_progress_and_due_dates() {
    let db = setup().await;
    let (_, [_, todo, _, done]) = project_with_columns(&db, "Life").await;
    let today = Local::now().date_naive();

    for (title, due) in [
        ("Late", today.checked_sub_days(Days::new(2))),
        ("Soon", today.checked_add_days(Days::new(3))),
        ("Far", today.checked_add_days(Days::new(30))),
    ] {
        let t = create_task(&db, &todo, title).await.unwrap().task;
        update_task(&db, &t.id, TaskFields { due_date: due, ..fields(title) }).await.unwrap();
    }
    create_task(&db, &done, "Finished").await.unwrap();

    let summary = summary(&db).await.unwrap();
    let life = &summary.projects[0];
    assert_eq!((life.total, life.done, life.overdue), (4, 1, 1));
    assert_eq!(life.columns.iter().map(|c| c.count).collect::<Vec<_>>(), [0, 3, 0, 1]);
    let due: Vec<_> = summary.due_soon.iter().map(|t| t.title.as_str()).collect();
    assert_eq!(due, ["Late", "Soon"]);
}

#[tokio::test]
async fn deleting_a_project_removes_everything() {
    let db = setup().await;
    let (project, [_, todo, ..]) = project_with_columns(&db, "Temp").await;
    let task = create_task(&db, &todo, "Gone").await.unwrap().task;
    add_checklist_item(&db, &task.id, "Gone too").await.unwrap();

    delete_project(&db, &project).await.unwrap();
    assert!(list_projects(&db).await.unwrap().is_empty());
    assert!(get_task(&db, &task.id).await.is_err());
    assert!(summary(&db).await.unwrap().projects.is_empty());
}

#[tokio::test]
async fn subtasks_are_counted_on_their_parent_and_go_one_level_deep() {
    let db = setup().await;
    let (project, [_, _, doing, done]) = project_with_columns(&db, "P").await;
    let parent = create_task(&db, &doing, "Parent").await.unwrap().task;

    let a = create_subtask(&db, &parent.id, "Sub A").await.unwrap().task;
    let b = create_subtask(&db, &parent.id, "Sub B").await.unwrap().task;
    assert_eq!(a.column_id, doing, "sub-tasks start in the parent's column");
    assert_eq!(a.parent_task_id.as_deref(), Some(parent.id.as_str()));
    assert!(create_subtask(&db, &a.id, "Too deep").await.is_err());

    move_task(&db, &b.id, &done, None).await.unwrap();
    let board = get_board(&db, &project).await.unwrap();
    let card = board.tasks.iter().find(|t| t.task.id == parent.id).unwrap();
    assert_eq!((card.subtask_done, card.subtask_total), (1, 2));
    let sub = board.tasks.iter().find(|t| t.task.id == a.id).unwrap();
    assert_eq!(sub.parent_title.as_deref(), Some("Parent"));

    let detail = get_task(&db, &parent.id).await.unwrap();
    assert_eq!(detail.subtasks.len(), 2);
    assert_eq!(get_task(&db, &a.id).await.unwrap().parent.unwrap().title, "Parent");

    // Deleting the parent keeps the sub-tasks as ordinary tasks.
    delete_task(&db, &parent.id).await.unwrap();
    assert_eq!(get_task(&db, &a.id).await.unwrap().task.parent_task_id, None);
}

#[tokio::test]
async fn checklist_items_become_subtasks() {
    let db = setup().await;
    let (_, [_, todo, _, done]) = project_with_columns(&db, "P").await;
    let parent = create_task(&db, &todo, "Parent").await.unwrap().task;
    let open = add_checklist_item(&db, &parent.id, "Open item").await.unwrap();
    let ticked = add_checklist_item(&db, &parent.id, "Ticked item").await.unwrap();
    update_checklist_item(&db, &ticked.id, "Ticked item", true).await.unwrap();

    let from_open = convert_checklist_item(&db, &open.id).await.unwrap().task;
    let from_ticked = convert_checklist_item(&db, &ticked.id).await.unwrap().task;
    assert_eq!((from_open.title.as_str(), from_open.column_id.as_str()), ("Open item", todo.as_str()));
    assert_eq!(from_ticked.column_id, done);
    assert!(from_ticked.completed_at.is_some());

    let detail = get_task(&db, &parent.id).await.unwrap();
    assert!(detail.checklist.is_empty());
    assert_eq!(detail.subtasks.len(), 2);
}

#[tokio::test]
async fn archived_tasks_list_separately_and_can_be_restored() {
    let db = setup().await;
    let (project, [_, todo, ..]) = project_with_columns(&db, "P").await;
    let keep = create_task(&db, &todo, "Keep").await.unwrap().task;
    let old = create_task(&db, &todo, "Old").await.unwrap().task;

    set_archived(&db, &old.id, true).await.unwrap();
    let board = get_board(&db, &project).await.unwrap();
    assert_eq!(board.tasks.iter().map(|t| t.task.id.clone()).collect::<Vec<_>>(), [keep.id]);
    let archived = list_archived(&db, &project).await.unwrap();
    assert_eq!(archived.iter().map(|t| t.task.id.clone()).collect::<Vec<_>>(), [old.id.clone()]);

    set_archived(&db, &old.id, false).await.unwrap();
    assert!(list_archived(&db, &project).await.unwrap().is_empty());
    assert_eq!(get_board(&db, &project).await.unwrap().tasks.len(), 2);
}

#[test]
fn repeat_rules_find_the_next_date() {
    let d = |s: &str| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();
    assert_eq!(next_occurrence(d("2026-10-21"), "daily"), d("2026-10-22"));
    assert_eq!(next_occurrence(d("2026-10-23"), "weekdays"), d("2026-10-26"), "Friday -> Monday");
    assert_eq!(next_occurrence(d("2026-10-24"), "weekdays"), d("2026-10-26"), "Saturday -> Monday");
    assert_eq!(next_occurrence(d("2026-10-21"), "weekly"), d("2026-10-28"));
    assert_eq!(next_occurrence(d("2026-01-31"), "monthly"), d("2026-02-28"), "clamps to month end");
    assert_eq!(next_occurrence(d("2028-02-29"), "yearly"), d("2029-02-28"));
}

#[tokio::test]
async fn completing_a_repeating_task_creates_the_next_one() {
    let db = setup().await;
    let (project, [_, todo, _, done]) = project_with_columns(&db, "Life").await;
    let d = |s: &str| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();

    let bins = create_task(&db, &todo, "Take the bins out").await.unwrap().task;
    let tag = create_label(&db, &project, "Home", "green").await.unwrap();
    set_task_labels(&db, &bins.id, vec![tag.id.clone()]).await.unwrap();
    let item = add_checklist_item(&db, &bins.id, "Recycling").await.unwrap();
    update_checklist_item(&db, &item.id, "Recycling", true).await.unwrap();
    update_task(
        &db,
        &bins.id,
        TaskFields {
            start_date: d("2026-10-20"),
            due_date: d("2026-10-21"),
            recurrence: Some("weekly".into()),
            ..fields("Take the bins out")
        },
    )
    .await
    .unwrap();
    assert!(update_task(&db, &bins.id, TaskFields { recurrence: Some("hourly".into()), ..fields("x") })
        .await
        .is_err());

    let completed = move_task(&db, &bins.id, &done, None).await.unwrap();
    assert_eq!(completed.recurrence, None, "the repeat moves to the new copy");

    let board = get_board(&db, &project).await.unwrap();
    let next = board.tasks.iter().find(|t| t.task.id != bins.id).expect("next occurrence");
    assert_eq!(next.task.column_id, todo);
    assert_eq!(next.task.due_date, d("2026-10-28"));
    assert_eq!(next.task.start_date, d("2026-10-27"));
    assert_eq!(next.task.recurrence.as_deref(), Some("weekly"));
    assert_eq!(next.label_ids, [tag.id.clone()]);
    assert_eq!((next.checklist_done, next.checklist_total), (0, 1), "checklist comes back unticked");

    // Reopening and completing the old one again doesn't make another copy.
    move_task(&db, &bins.id, &todo, None).await.unwrap();
    move_task(&db, &bins.id, &done, None).await.unwrap();
    assert_eq!(get_board(&db, &project).await.unwrap().tasks.len(), 2);
}

#[tokio::test]
async fn templates_copy_details_labels_and_checklists() {
    let db = setup().await;
    let (project, [backlog, todo, ..]) = project_with_columns(&db, "P").await;
    let (_, [other_column, ..]) = project_with_columns(&db, "Other").await;

    let source = create_task(&db, &todo, "Bug: ").await.unwrap().task;
    let bug = create_label(&db, &project, "Bug", "red").await.unwrap();
    set_task_labels(&db, &source.id, vec![bug.id.clone()]).await.unwrap();
    add_checklist_item(&db, &source.id, "Reproduce").await.unwrap();
    add_checklist_item(&db, &source.id, "Fix").await.unwrap();
    update_task(&db, &source.id, TaskFields { priority: 3, description: "Steps:".into(), ..fields("Bug: ") })
        .await
        .unwrap();

    let template = save_template(&db, &source.id, "Bug report").await.unwrap();
    assert_eq!(get_board(&db, &project).await.unwrap().templates.len(), 1);

    let card = create_from_template(&db, &template.id, &backlog).await.unwrap();
    let detail = get_task(&db, &card.task.id).await.unwrap();
    assert_eq!(detail.task.column_id, backlog);
    assert_eq!((detail.task.priority, detail.task.description.as_str()), (3, "Steps:"));
    assert_eq!(detail.label_ids, [bug.id.clone()]);
    assert_eq!(detail.checklist.iter().map(|i| i.text.as_str()).collect::<Vec<_>>(), ["Reproduce", "Fix"]);

    assert!(create_from_template(&db, &template.id, &other_column).await.is_err());
    delete_template(&db, &template.id).await.unwrap();
    assert!(get_board(&db, &project).await.unwrap().templates.is_empty());
}

#[tokio::test]
async fn activity_and_insights_cover_the_whole_project() {
    let db = setup().await;
    let (project, [_, todo, _, done]) = project_with_columns(&db, "P").await;
    let a = create_task(&db, &todo, "A").await.unwrap().task;
    create_task(&db, &todo, "B").await.unwrap();
    move_task(&db, &a.id, &done, None).await.unwrap();

    let feed = project_activity(&db, &project, 10).await.unwrap();
    assert_eq!(feed[0].kind, "completed", "newest first");
    assert_eq!(feed[0].task_title, "A");
    assert_eq!(feed.len(), 4);

    let stats = insights(&db, &project).await.unwrap();
    assert_eq!(stats.burnup.len(), 30);
    let today = stats.burnup.last().unwrap();
    assert_eq!((today.total, today.done), (2, 1));
    assert_eq!(stats.throughput.len(), 8);
    assert_eq!(stats.throughput.last().unwrap().done, 1);
    assert_eq!((stats.open, stats.created_last_7, stats.completed_last_7), (1, 2, 1));
    assert!(stats.avg_cycle_days.is_some());
    assert_eq!(stats.open_by_column.iter().map(|c| c.count).sum::<usize>(), 1);
}

/// Regression test for "the board feels slow": the app used to query a remote
/// database (~225 ms per round trip, 5-12 round trips per action), so every
/// click took 1-3.5 s. It now uses a local SQLite file. Every board action,
/// on a real file with a realistically sized board, must stay well under the
/// ~100 ms where a delay becomes noticeable.
#[tokio::test]
async fn board_actions_are_instant_on_local_storage() {
    let folder = std::env::temp_dir().join(format!("axiom-speed-{}", super::entities::new_id()));
    std::fs::create_dir_all(&folder).unwrap();
    let url = format!("sqlite://{}?mode=rwc", folder.join("axiom.db").to_string_lossy().replace('\\', "/"));
    let mut options = ConnectOptions::new(url);
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    db.execute_unprepared("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;").await.unwrap();
    crate::db::prepare(&db).await.unwrap();

    let (project, [_, todo, doing, _]) = project_with_columns(&db, "Speed").await;
    for i in 0..150 {
        let t = create_task(&db, &todo, &format!("seed {i}")).await.unwrap().task;
        add_checklist_item(&db, &t.id, "step").await.unwrap();
    }

    let budget = std::time::Duration::from_millis(50);
    let time = |label: &'static str, started: std::time::Instant| {
        let took = started.elapsed();
        assert!(took < budget, "{label} took {took:?}, budget {budget:?}");
    };
    for _ in 0..5 {
        let t = std::time::Instant::now();
        let task = create_task(&db, &todo, "probe").await.unwrap().task;
        time("create_task", t);
        let t = std::time::Instant::now();
        move_task(&db, &task.id, &doing, None).await.unwrap();
        time("move_task", t);
        let t = std::time::Instant::now();
        update_task(&db, &task.id, fields("probe 2")).await.unwrap();
        time("update_task", t);
        let t = std::time::Instant::now();
        get_board(&db, &project).await.unwrap();
        time("get_board", t);
    }
    drop(db);
    let _ = std::fs::remove_dir_all(folder);
}
