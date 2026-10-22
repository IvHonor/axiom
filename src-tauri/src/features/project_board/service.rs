//! The Project Board's logic. Every function takes a database connection: the
//! app's local SQLite file, or an in-memory one in tests. `commands.rs` wraps
//! these for React.
//!
//! Rows are never removed. Deleting sets `deleted_at` (see `bury!`), so the
//! deletion can sync to other devices, and every query reads through the
//! helpers at the bottom that skip deleted rows.

use chrono::{Datelike, Days, Duration, Local, Months, NaiveDate, Utc, Weekday};
use sea_orm::prelude::DateTimeUtc;
use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Select, Set, TransactionTrait,
};

use super::entities::{checklist_item, column, label, new_id, project, task, task_event, task_label, template};
use super::types::{
    ActivityItem, Board, BurnupPoint, ColumnCount, ColumnFields, DueTask, Insights, LabelCount, NamedCount,
    PlannableCard, ProjectSummary, Summary, TaskCard, TaskDetail, TaskFields, TaskRef, WeekCount,
};
use crate::error::{Error, Result};

/// New projects cycle through these colors.
const PROJECT_COLORS: [&str; 6] = ["blue", "green", "purple", "orange", "pink", "sky"];
/// Colors a label can have. The frontend maps each name to a shade.
pub const LABEL_COLORS: [&str; 10] =
    ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "gray"];
/// Every new project starts with these columns. `true` marks the done column.
const DEFAULT_COLUMNS: [(&str, bool); 4] = [("Backlog", false), ("To do", false), ("Doing", false), ("Done", true)];
const PRIORITIES: [&str; 4] = ["None", "Low", "Medium", "High"];

/// Soft-deletes every live row of `$entity` matching `$condition`.
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

// ---------- Projects ----------

pub async fn list_projects(db: &impl ConnectionTrait) -> Result<Vec<project::Model>> {
    Ok(projects().order_by_asc(project::Column::Position).all(db).await?)
}

/// Creates a project with the default columns.
pub async fn create_project(db: &DatabaseConnection, name: &str) -> Result<project::Model> {
    let name = non_empty(name, "Project name")?;
    let txn = db.begin().await?;

    let existing = list_projects(&txn).await?;
    let project = project::ActiveModel {
        id: Set(new_id()),
        name: Set(name),
        color: Set(PROJECT_COLORS[existing.len() % PROJECT_COLORS.len()].into()),
        position: Set(next_position(existing.iter().map(|p| p.position))),
        created_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    for (i, (name, is_done)) in DEFAULT_COLUMNS.iter().enumerate() {
        column::ActiveModel {
            id: Set(new_id()),
            project_id: Set(project.id.clone()),
            name: Set(name.to_string()),
            position: Set(i as f64 + 1.0),
            is_done: Set(*is_done),
            wip_limit: Set(None),
            ..Default::default()
        }
        .insert(&txn)
        .await?;
    }

    txn.commit().await?;
    Ok(project)
}

pub async fn rename_project(db: &DatabaseConnection, id: &str, name: &str) -> Result<project::Model> {
    let mut project: project::ActiveModel = find_project(db, id).await?.into();
    project.name = Set(non_empty(name, "Project name")?);
    Ok(project.update(db).await?)
}

/// Deletes a project and everything in it.
pub async fn delete_project(db: &DatabaseConnection, id: &str) -> Result<()> {
    find_project(db, id).await?;
    let txn = db.begin().await?;
    let task_ids = ids(tasks().filter(task::Column::ProjectId.eq(id)).all(&txn).await?.iter().map(|t| &t.id));
    bury!(task_label, &txn, task_label::Column::TaskId.is_in(task_ids.clone()));
    bury!(checklist_item, &txn, checklist_item::Column::TaskId.is_in(task_ids.clone()));
    bury!(task_event, &txn, task_event::Column::TaskId.is_in(task_ids));
    bury!(task, &txn, task::Column::ProjectId.eq(id));
    bury!(column, &txn, column::Column::ProjectId.eq(id));
    bury!(label, &txn, label::Column::ProjectId.eq(id));
    bury!(template, &txn, template::Column::ProjectId.eq(id));
    bury!(project, &txn, project::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Board ----------

pub async fn get_board(db: &DatabaseConnection, project_id: &str) -> Result<Board> {
    let project = find_project(db, project_id).await?;
    let columns = columns_of(db, project_id).await?;
    let labels = labels().filter(label::Column::ProjectId.eq(project_id)).order_by_asc(label::Column::Id).all(db).await?;
    let tasks = cards(db, project_id, false).await?;
    let templates = templates()
        .filter(template::Column::ProjectId.eq(project_id))
        .order_by_asc(template::Column::Name)
        .all(db)
        .await?;
    Ok(Board { project, columns, tasks, labels, templates })
}

/// Archived tasks, most recently changed first, for the Archive view.
pub async fn list_archived(db: &DatabaseConnection, project_id: &str) -> Result<Vec<TaskCard>> {
    find_project(db, project_id).await?;
    let mut tasks = cards(db, project_id, true).await?;
    tasks.sort_by(|a, b| b.task.updated_at.cmp(&a.task.updated_at));
    Ok(tasks)
}

/// A project's tasks (archived or not) as cards, with label, checklist and sub-task counts.
async fn cards(db: &DatabaseConnection, project_id: &str, archived: bool) -> Result<Vec<TaskCard>> {
    // Load the whole project once: parents and sub-tasks may sit on either side of `archived`.
    let all = tasks().filter(task::Column::ProjectId.eq(project_id)).order_by_asc(task::Column::Position).all(db).await?;
    let shown: Vec<_> = all.iter().filter(|t| t.archived == archived).cloned().collect();

    let shown_ids = ids(shown.iter().map(|t| &t.id));
    let links = links().filter(task_label::Column::TaskId.is_in(shown_ids.clone())).all(db).await?;
    let items = items().filter(checklist_item::Column::TaskId.is_in(shown_ids)).all(db).await?;

    Ok(shown
        .into_iter()
        .map(|task| {
            let label_ids = links.iter().filter(|l| l.task_id == task.id).map(|l| l.label_id.clone()).collect();
            let checklist: Vec<_> = items.iter().filter(|i| i.task_id == task.id).collect();
            let subtasks: Vec<_> = all
                .iter()
                .filter(|t| t.parent_task_id.as_ref() == Some(&task.id) && !t.archived)
                .collect();
            TaskCard {
                label_ids,
                checklist_done: checklist.iter().filter(|i| i.done).count(),
                checklist_total: checklist.len(),
                subtask_done: subtasks.iter().filter(|t| t.completed_at.is_some()).count(),
                subtask_total: subtasks.len(),
                parent_title: task
                    .parent_task_id
                    .as_ref()
                    .and_then(|id| all.iter().find(|t| &t.id == id))
                    .map(|t| t.title.clone()),
                task,
            }
        })
        .collect())
}

// ---------- Columns ----------

pub async fn create_column(db: &DatabaseConnection, project_id: &str, name: &str) -> Result<column::Model> {
    find_project(db, project_id).await?;
    let existing = columns_of(db, project_id).await?;
    Ok(column::ActiveModel {
        id: Set(new_id()),
        project_id: Set(project_id.to_string()),
        name: Set(non_empty(name, "Column name")?),
        position: Set(next_position(existing.iter().map(|c| c.position))),
        is_done: Set(false),
        wip_limit: Set(None),
        ..Default::default()
    }
    .insert(db)
    .await?)
}

/// Renames a column, marks it as done or not, and sets its WIP limit.
pub async fn update_column(db: &DatabaseConnection, id: &str, fields: ColumnFields) -> Result<column::Model> {
    if fields.wip_limit.is_some_and(|limit| limit < 1) {
        return Err(Error::Invalid("A card limit must be at least 1.".into()));
    }
    let txn = db.begin().await?;
    let before = find_column(&txn, id).await?;

    // Turning "done" on or off completes or reopens everything in the column.
    if before.is_done != fields.is_done {
        let completed_at = fields.is_done.then(Utc::now);
        task::Entity::update_many()
            .col_expr(task::Column::CompletedAt, Expr::value(completed_at))
            .col_expr(task::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter(task::Column::ColumnId.eq(id))
            .filter(task::Column::DeletedAt.is_null())
            .exec(&txn)
            .await?;
    }

    let mut column: column::ActiveModel = before.into();
    column.name = Set(non_empty(&fields.name, "Column name")?);
    column.is_done = Set(fields.is_done);
    column.wip_limit = Set(fields.wip_limit);
    let column = column.update(&txn).await?;
    txn.commit().await?;
    Ok(column)
}

/// Swaps a column with its neighbor. `direction` is -1 (left) or 1 (right).
pub async fn move_column(db: &DatabaseConnection, id: &str, direction: i32) -> Result<Vec<column::Model>> {
    let column = find_column(db, id).await?;
    let columns = columns_of(db, &column.project_id).await?;
    let index = columns.iter().position(|c| c.id == id).ok_or(Error::NotFound("Column"))?;
    let Some(other) = index.checked_add_signed(direction as isize).and_then(|i| columns.get(i)) else {
        return Ok(columns); // Already at the edge.
    };

    let txn = db.begin().await?;
    set_column_position(&txn, &column.id, other.position).await?;
    set_column_position(&txn, &other.id, column.position).await?;
    txn.commit().await?;
    columns_of(db, &column.project_id).await
}

/// Deletes an empty column. Archived tasks in it move to the first remaining column.
pub async fn delete_column(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    let column = find_column(&txn, id).await?;

    let active = tasks()
        .filter(task::Column::ColumnId.eq(id))
        .filter(task::Column::Archived.eq(false))
        .count(&txn)
        .await?;
    if active > 0 {
        return Err(Error::Invalid("Move this column's tasks to another column first.".into()));
    }
    let Some(fallback) = columns_of(&txn, &column.project_id).await?.into_iter().find(|c| c.id != id) else {
        return Err(Error::Invalid("A board needs at least one column.".into()));
    };

    task::Entity::update_many()
        .col_expr(task::Column::ColumnId, Expr::value(fallback.id))
        .col_expr(task::Column::UpdatedAt, Expr::value(Utc::now()))
        .filter(task::Column::ColumnId.eq(id))
        .filter(task::Column::DeletedAt.is_null())
        .exec(&txn)
        .await?;
    bury!(column, &txn, column::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Tasks ----------

/// Adds a task to the bottom of a column.
pub async fn create_task(db: &DatabaseConnection, column_id: &str, title: &str) -> Result<TaskCard> {
    let title = non_empty(title, "Task title")?;
    let txn = db.begin().await?;
    let column = find_column(&txn, column_id).await?;
    let task = insert_task(&txn, &column, title, None).await?;
    txn.commit().await?;
    Ok(new_card(task))
}

/// Adds a sub-task under `parent_id`, in the parent's column. Sub-tasks go one level deep.
pub async fn create_subtask(db: &DatabaseConnection, parent_id: &str, title: &str) -> Result<TaskCard> {
    let title = non_empty(title, "Sub-task title")?;
    let txn = db.begin().await?;
    let parent = find_task(&txn, parent_id).await?;
    if parent.parent_task_id.is_some() {
        return Err(Error::Invalid("A sub-task can't have its own sub-tasks.".into()));
    }
    let column = find_column(&txn, &parent.column_id).await?;
    let task = insert_task(&txn, &column, title, Some(&parent)).await?;
    log(&txn, &parent.id, "subtask", format!("Added sub-task \"{}\"", task.title)).await?;
    txn.commit().await?;
    Ok(new_card(task))
}

/// Turns a checklist item into a sub-task of the item's task, keeping its done state.
pub async fn convert_checklist_item(db: &DatabaseConnection, item_id: &str) -> Result<TaskCard> {
    let txn = db.begin().await?;
    let item = find_item(&txn, item_id).await?;
    let parent = find_task(&txn, &item.task_id).await?;
    if parent.parent_task_id.is_some() {
        return Err(Error::Invalid("A sub-task can't have its own sub-tasks.".into()));
    }

    // A ticked item lands in the done column; an open one stays with its parent.
    let columns = columns_of(&txn, &parent.project_id).await?;
    let column = match columns.into_iter().find(|c| item.done && c.is_done) {
        Some(done_column) => done_column,
        None => find_column(&txn, &parent.column_id).await?,
    };

    let task = insert_task(&txn, &column, item.text.clone(), Some(&parent)).await?;
    bury!(checklist_item, &txn, checklist_item::Column::Id.eq(item_id));
    log(&txn, &parent.id, "subtask", format!("Made \"{}\" a sub-task", task.title)).await?;
    txn.commit().await?;
    Ok(new_card(task))
}

fn new_card(task: task::Model) -> TaskCard {
    TaskCard {
        task,
        label_ids: vec![],
        checklist_done: 0,
        checklist_total: 0,
        subtask_done: 0,
        subtask_total: 0,
        parent_title: None,
    }
}

/// Inserts a task at the bottom of `column` and records its creation.
async fn insert_task(
    db: &impl ConnectionTrait,
    column: &column::Model,
    title: String,
    parent: Option<&task::Model>,
) -> Result<task::Model> {
    let siblings = tasks_in(db, &column.id, None).await?;
    let now = Utc::now();

    let task = task::ActiveModel {
        id: Set(new_id()),
        project_id: Set(column.project_id.clone()),
        column_id: Set(column.id.clone()),
        parent_task_id: Set(parent.map(|p| p.id.clone())),
        title: Set(title),
        description: Set(String::new()),
        position: Set(next_position(siblings.iter().map(|t| t.position))),
        priority: Set(0),
        start_date: Set(None),
        due_date: Set(None),
        estimate: Set(None),
        recurrence: Set(None),
        created_at: Set(now),
        completed_at: Set(column.is_done.then_some(now)),
        archived: Set(false),
        ..Default::default()
    }
    .insert(db)
    .await?;
    log(db, &task.id, "created", format!("Created in {}", column.name)).await?;
    Ok(task)
}

pub async fn get_task(db: &DatabaseConnection, id: &str) -> Result<TaskDetail> {
    let task = find_task(db, id).await?;
    let label_ids = label_ids_of(db, id).await?;
    let checklist = items()
        .filter(checklist_item::Column::TaskId.eq(id))
        .order_by_asc(checklist_item::Column::Position)
        .all(db)
        .await?;
    let events = events().filter(task_event::Column::TaskId.eq(id)).order_by_desc(task_event::Column::Id).all(db).await?;
    let subtasks = tasks()
        .filter(task::Column::ParentTaskId.eq(id))
        .filter(task::Column::Archived.eq(false))
        .order_by_asc(task::Column::CreatedAt)
        .all(db)
        .await?;
    let parent = match &task.parent_task_id {
        Some(parent_id) => tasks()
            .filter(task::Column::Id.eq(parent_id.as_str()))
            .one(db)
            .await?
            .map(|p| TaskRef { id: p.id, title: p.title }),
        None => None,
    };
    Ok(TaskDetail { task, label_ids, checklist, events, subtasks, parent })
}

/// Saves the drawer's fields and records notable changes in the task's history.
pub async fn update_task(db: &DatabaseConnection, id: &str, fields: TaskFields) -> Result<TaskDetail> {
    let title = non_empty(&fields.title, "Task title")?;
    if !(0..PRIORITIES.len() as i16).contains(&fields.priority) {
        return Err(Error::Invalid("Priority must be between 0 and 3.".into()));
    }
    if fields.estimate.is_some_and(|e| e < 0.0 || !e.is_finite()) {
        return Err(Error::Invalid("Estimate can't be negative.".into()));
    }
    if let (Some(start), Some(due)) = (fields.start_date, fields.due_date) {
        if start > due {
            return Err(Error::Invalid("Start date must be on or before the due date.".into()));
        }
    }
    let recurrence = recurrence_rule(fields.recurrence.as_deref())?;

    let txn = db.begin().await?;
    let before = find_task(&txn, id).await?;
    let mut events = Vec::new();
    if before.recurrence != recurrence {
        events.push(match &recurrence {
            Some(rule) => ("recurrence", format!("Repeats {rule}")),
            None => ("recurrence", "No longer repeats".to_string()),
        });
    }
    if before.title != title {
        events.push(("renamed", format!("Renamed to \"{title}\"")));
    }
    if before.due_date != fields.due_date {
        events.push(match fields.due_date {
            Some(due) => ("due", format!("Due date set to {due}")),
            None => ("due", "Due date removed".to_string()),
        });
    }
    if before.priority != fields.priority {
        events.push(("priority", format!("Priority set to {}", PRIORITIES[fields.priority as usize])));
    }

    let mut task: task::ActiveModel = before.into();
    task.title = Set(title);
    task.description = Set(fields.description);
    task.priority = Set(fields.priority);
    task.start_date = Set(fields.start_date);
    task.due_date = Set(fields.due_date);
    task.estimate = Set(fields.estimate);
    task.recurrence = Set(recurrence);
    task.update(&txn).await?;
    for (kind, detail) in events {
        log(&txn, id, kind, detail).await?;
    }
    txn.commit().await?;
    get_task(db, id).await
}

/// Moves a task into `column_id`, just before `before_id` (or to the bottom if
/// `None`). Entering a done column completes the task; leaving one reopens it.
pub async fn move_task(db: &DatabaseConnection, id: &str, column_id: &str, before_id: Option<&str>) -> Result<task::Model> {
    let txn = db.begin().await?;
    let task = find_task(&txn, id).await?;
    let to = find_column(&txn, column_id).await?;
    if to.project_id != task.project_id {
        return Err(Error::Invalid("Tasks can only move within their own project.".into()));
    }

    let siblings = tasks_in(&txn, column_id, Some(id)).await?;
    let index = match before_id {
        Some(before) => siblings.iter().position(|t| t.id == before).ok_or(Error::NotFound("Task"))?,
        None => siblings.len(),
    };
    let position = position_at(&txn, &siblings, index).await?;

    let mut completed_at = task.completed_at;
    let mut recurrence = task.recurrence.clone();
    if task.column_id != column_id {
        let from = find_column(&txn, &task.column_id).await?;
        log(&txn, id, "moved", format!("{} → {}", from.name, to.name)).await?;
        if to.is_done && completed_at.is_none() {
            completed_at = Some(Utc::now());
            log(&txn, id, "completed", "Completed".into()).await?;
            if task.recurrence.is_some() {
                // The repeat moves to the next occurrence, so completing this one again won't duplicate it.
                let next = spawn_next_occurrence(&txn, &task, &from).await?;
                let due = next.due_date.map(|d| format!(", due {d}")).unwrap_or_default();
                log(&txn, id, "recurrence", format!("Next occurrence created{due}")).await?;
                recurrence = None;
            }
        } else if !to.is_done && completed_at.is_some() {
            completed_at = None;
            log(&txn, id, "reopened", "Reopened".into()).await?;
        }
    }

    let mut task: task::ActiveModel = task.into();
    task.column_id = Set(column_id.to_string());
    task.position = Set(position);
    task.completed_at = Set(completed_at);
    task.recurrence = Set(recurrence);
    let task = task.update(&txn).await?;
    txn.commit().await?;
    Ok(task)
}

/// How a task can repeat. Each value is also how it reads: "Repeats weekly".
pub const RECURRENCES: [&str; 5] = ["daily", "weekdays", "weekly", "monthly", "yearly"];

fn recurrence_rule(rule: Option<&str>) -> Result<Option<String>> {
    match rule {
        None => Ok(None),
        Some(rule) if RECURRENCES.contains(&rule) => Ok(Some(rule.to_string())),
        Some(rule) => Err(Error::Invalid(format!("Unknown repeat rule \"{rule}\""))),
    }
}

/// The next date after `date` for a repeat rule.
pub fn next_occurrence(date: NaiveDate, rule: &str) -> NaiveDate {
    let next = match rule {
        "daily" => date.checked_add_days(Days::new(1)),
        "weekdays" => {
            let mut next = date.succ_opt();
            while let Some(day) = next.filter(|d| matches!(d.weekday(), Weekday::Sat | Weekday::Sun)) {
                next = day.succ_opt();
            }
            next
        }
        "weekly" => date.checked_add_days(Days::new(7)),
        "monthly" => date.checked_add_months(Months::new(1)),
        _ => date.checked_add_months(Months::new(12)),
    };
    next.unwrap_or(date)
}

/// Creates the next copy of a repeating task: same details and labels, a fresh
/// checklist, and dates moved to the next occurrence. It lands in the column the
/// task was completed from (or the first open column).
async fn spawn_next_occurrence(
    db: &impl ConnectionTrait,
    task: &task::Model,
    from: &column::Model,
) -> Result<task::Model> {
    let rule = task.recurrence.as_deref().unwrap_or("weekly");
    let column = if from.is_done {
        columns_of(db, &task.project_id)
            .await?
            .into_iter()
            .find(|c| !c.is_done)
            .unwrap_or_else(|| from.clone())
    } else {
        from.clone()
    };

    // Keep the gap between start and due dates; tasks without a due date repeat from today.
    let base = task.due_date.or(task.start_date).unwrap_or_else(|| Local::now().date_naive());
    let shift = next_occurrence(base, rule) - base;
    let next = insert_task(db, &column, task.title.clone(), None).await?;

    let mut copy: task::ActiveModel = next.into();
    copy.description = Set(task.description.clone());
    copy.priority = Set(task.priority);
    copy.estimate = Set(task.estimate);
    copy.recurrence = Set(task.recurrence.clone());
    copy.start_date = Set(task.start_date.map(|d| d + shift));
    copy.due_date = Set(Some(task.due_date.unwrap_or(base) + shift));
    let next = copy.update(db).await?;

    let checklist = items()
        .filter(checklist_item::Column::TaskId.eq(task.id.as_str()))
        .order_by_asc(checklist_item::Column::Position)
        .all(db)
        .await?;
    let labels = label_ids_of(db, &task.id).await?;
    add_labels_and_checklist(db, &next.id, labels, checklist.into_iter().map(|i| i.text).collect()).await?;
    log(db, &next.id, "recurrence", format!("Repeats {rule}")).await?;
    Ok(next)
}

/// Gives a task labels and an unticked checklist.
async fn add_labels_and_checklist(
    db: &impl ConnectionTrait,
    task_id: &str,
    label_ids: Vec<String>,
    checklist: Vec<String>,
) -> Result<()> {
    for label_id in label_ids {
        task_label::ActiveModel {
            id: Set(new_id()),
            task_id: Set(task_id.to_string()),
            label_id: Set(label_id),
            ..Default::default()
        }
        .insert(db)
        .await?;
    }
    for (i, text) in checklist.into_iter().enumerate() {
        checklist_item::ActiveModel {
            id: Set(new_id()),
            task_id: Set(task_id.to_string()),
            text: Set(text),
            done: Set(false),
            position: Set(i as f64 + 1.0),
            ..Default::default()
        }
        .insert(db)
        .await?;
    }
    Ok(())
}

/// Archived tasks disappear from the board but keep their history.
pub async fn set_archived(db: &DatabaseConnection, id: &str, archived: bool) -> Result<task::Model> {
    let txn = db.begin().await?;
    let mut task: task::ActiveModel = find_task(&txn, id).await?.into();
    task.archived = Set(archived);
    let task = task.update(&txn).await?;
    log(&txn, id, if archived { "archived" } else { "restored" }, String::new()).await?;
    txn.commit().await?;
    Ok(task)
}

/// Deletes a task. Its sub-tasks stay, as ordinary tasks.
pub async fn delete_task(db: &DatabaseConnection, id: &str) -> Result<()> {
    find_task(db, id).await?;
    let txn = db.begin().await?;
    task::Entity::update_many()
        .col_expr(task::Column::ParentTaskId, Expr::value(Option::<String>::None))
        .col_expr(task::Column::UpdatedAt, Expr::value(Utc::now()))
        .filter(task::Column::ParentTaskId.eq(id))
        .filter(task::Column::DeletedAt.is_null())
        .exec(&txn)
        .await?;
    bury!(task_label, &txn, task_label::Column::TaskId.eq(id));
    bury!(checklist_item, &txn, checklist_item::Column::TaskId.eq(id));
    bury!(task_event, &txn, task_event::Column::TaskId.eq(id));
    bury!(task, &txn, task::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Templates ----------

/// Saves a task's details, labels and checklist as a reusable template.
pub async fn save_template(db: &DatabaseConnection, task_id: &str, name: &str) -> Result<template::Model> {
    let name = non_empty(name, "Template name")?;
    let task = find_task(db, task_id).await?;
    let label_ids = label_ids_of(db, task_id).await?;
    let checklist: Vec<String> = items()
        .filter(checklist_item::Column::TaskId.eq(task_id))
        .order_by_asc(checklist_item::Column::Position)
        .all(db)
        .await?
        .into_iter()
        .map(|i| i.text)
        .collect();

    Ok(template::ActiveModel {
        id: Set(new_id()),
        project_id: Set(task.project_id),
        name: Set(name),
        title: Set(task.title),
        description: Set(task.description),
        priority: Set(task.priority),
        estimate: Set(task.estimate),
        recurrence: Set(task.recurrence),
        label_ids: Set(serde_json::to_string(&label_ids).unwrap_or_else(|_| "[]".into())),
        checklist: Set(serde_json::to_string(&checklist).unwrap_or_else(|_| "[]".into())),
        created_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(db)
    .await?)
}

pub async fn delete_template(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(template, db, template::Column::Id.eq(id));
    Ok(())
}

/// Creates a card from a template at the bottom of `column_id`.
pub async fn create_from_template(db: &DatabaseConnection, template_id: &str, column_id: &str) -> Result<TaskCard> {
    let txn = db.begin().await?;
    let template = templates()
        .filter(template::Column::Id.eq(template_id))
        .one(&txn)
        .await?
        .ok_or(Error::NotFound("Template"))?;
    let column = find_column(&txn, column_id).await?;
    if column.project_id != template.project_id {
        return Err(Error::Invalid("That template belongs to another project.".into()));
    }

    let task = insert_task(&txn, &column, template.title.clone(), None).await?;
    let mut task: task::ActiveModel = task.into();
    task.description = Set(template.description.clone());
    task.priority = Set(template.priority);
    task.estimate = Set(template.estimate);
    task.recurrence = Set(template.recurrence.clone());
    let task = task.update(&txn).await?;

    // Labels deleted since the template was saved are skipped.
    let wanted: Vec<String> = serde_json::from_str(&template.label_ids).unwrap_or_default();
    let label_ids = ids(labels()
        .filter(label::Column::ProjectId.eq(template.project_id.as_str()))
        .filter(label::Column::Id.is_in(wanted))
        .order_by_asc(label::Column::Id)
        .all(&txn)
        .await?
        .iter()
        .map(|l| &l.id));
    let checklist: Vec<String> = serde_json::from_str(&template.checklist).unwrap_or_default();
    let card = TaskCard { label_ids: label_ids.clone(), checklist_total: checklist.len(), ..new_card(task) };
    add_labels_and_checklist(&txn, &card.task.id, label_ids, checklist).await?;
    log(&txn, &card.task.id, "template", format!("Created from template \"{}\"", template.name)).await?;
    txn.commit().await?;
    Ok(card)
}

// ---------- Activity and insights ----------

/// The latest changes across every task in a project, newest first.
pub async fn project_activity(db: &DatabaseConnection, project_id: &str, limit: u64) -> Result<Vec<ActivityItem>> {
    find_project(db, project_id).await?;
    let tasks = tasks().filter(task::Column::ProjectId.eq(project_id)).all(db).await?;
    let events = events()
        .filter(task_event::Column::TaskId.is_in(ids(tasks.iter().map(|t| &t.id))))
        .order_by_desc(task_event::Column::Id)
        .limit(limit)
        .all(db)
        .await?;
    Ok(events
        .into_iter()
        .map(|e| ActivityItem {
            task_title: tasks.iter().find(|t| t.id == e.task_id).map(|t| t.title.clone()).unwrap_or_default(),
            id: e.id,
            task_id: e.task_id,
            kind: e.kind,
            detail: e.detail,
            created_at: e.created_at,
        })
        .collect())
}

/// Progress numbers for the Insights view. Archived tasks count toward history
/// (they were real work) but not toward what's open now.
pub async fn insights(db: &DatabaseConnection, project_id: &str) -> Result<Insights> {
    find_project(db, project_id).await?;
    let today = Local::now().date_naive();
    let columns = columns_of(db, project_id).await?;
    let labels = labels().filter(label::Column::ProjectId.eq(project_id)).all(db).await?;
    let tasks = tasks().filter(task::Column::ProjectId.eq(project_id)).all(db).await?;
    let local = |t: DateTimeUtc| t.with_timezone(&Local).date_naive();
    let created = |t: &task::Model| local(t.created_at);
    let completed = |t: &task::Model| t.completed_at.map(local);

    let burnup = (0..30)
        .rev()
        .map(|back| {
            let date = today - Duration::days(back);
            BurnupPoint {
                date,
                total: tasks.iter().filter(|t| created(t) <= date).count(),
                done: tasks.iter().filter(|t| completed(t).is_some_and(|d| d <= date)).count(),
            }
        })
        .collect();

    let this_monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let throughput = (0..8)
        .rev()
        .map(|back| {
            let week_start = this_monday - Duration::weeks(back);
            let week_end = week_start + Duration::days(7);
            WeekCount {
                week_start,
                done: tasks
                    .iter()
                    .filter(|t| completed(t).is_some_and(|d| d >= week_start && d < week_end))
                    .count(),
            }
        })
        .collect();

    let open: Vec<_> = tasks.iter().filter(|t| !t.archived && t.completed_at.is_none()).collect();
    let cycle_days: Vec<f64> = tasks
        .iter()
        .filter_map(|t| t.completed_at.map(|done| (done - t.created_at).num_minutes() as f64 / 1440.0))
        .collect();
    let week_ago = today - Duration::days(7);
    let open_links = links().filter(task_label::Column::TaskId.is_in(ids(open.iter().map(|t| &t.id)))).all(db).await?;

    Ok(Insights {
        burnup,
        throughput,
        open_by_column: columns
            .iter()
            .filter(|c| !c.is_done)
            .map(|c| NamedCount { name: c.name.clone(), count: open.iter().filter(|t| t.column_id == c.id).count() })
            .collect(),
        open_by_priority: (0..PRIORITIES.len())
            .rev()
            .map(|p| NamedCount {
                name: PRIORITIES[p].to_string(),
                count: open.iter().filter(|t| t.priority as usize == p).count(),
            })
            .collect(),
        open_by_label: labels
            .iter()
            .map(|l| LabelCount {
                name: l.name.clone(),
                color: l.color.clone(),
                count: open_links.iter().filter(|link| link.label_id == l.id).count(),
            })
            .collect(),
        avg_cycle_days: (!cycle_days.is_empty()).then(|| cycle_days.iter().sum::<f64>() / cycle_days.len() as f64),
        open: open.len(),
        overdue: open.iter().filter(|t| t.due_date.is_some_and(|d| d < today)).count(),
        created_last_7: tasks.iter().filter(|t| created(t) > week_ago).count(),
        completed_last_7: tasks.iter().filter(|t| completed(t).is_some_and(|d| d > week_ago)).count(),
    })
}

// ---------- Labels ----------

pub async fn create_label(db: &DatabaseConnection, project_id: &str, name: &str, color: &str) -> Result<label::Model> {
    find_project(db, project_id).await?;
    Ok(label::ActiveModel {
        id: Set(new_id()),
        project_id: Set(project_id.to_string()),
        name: Set(name.trim().to_string()),
        color: Set(label_color(color)?),
        ..Default::default()
    }
    .insert(db)
    .await?)
}

pub async fn update_label(db: &DatabaseConnection, id: &str, name: &str, color: &str) -> Result<label::Model> {
    let label = labels().filter(label::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Label"))?;
    let mut label: label::ActiveModel = label.into();
    label.name = Set(name.trim().to_string());
    label.color = Set(label_color(color)?);
    Ok(label.update(db).await?)
}

pub async fn delete_label(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    bury!(task_label, &txn, task_label::Column::LabelId.eq(id));
    bury!(label, &txn, label::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

/// Replaces a task's labels with `label_ids`.
pub async fn set_task_labels(db: &DatabaseConnection, task_id: &str, label_ids: Vec<String>) -> Result<Vec<String>> {
    let txn = db.begin().await?;
    let task = find_task(&txn, task_id).await?;
    let valid = ids(labels()
        .filter(label::Column::ProjectId.eq(task.project_id.as_str()))
        .filter(label::Column::Id.is_in(label_ids))
        .order_by_asc(label::Column::Id)
        .all(&txn)
        .await?
        .iter()
        .map(|l| &l.id));
    bury!(task_label, &txn, task_label::Column::TaskId.eq(task_id));
    add_labels_and_checklist(&txn, task_id, valid.clone(), vec![]).await?;
    txn.commit().await?;
    Ok(valid)
}

// ---------- Checklist ----------

pub async fn add_checklist_item(db: &DatabaseConnection, task_id: &str, text: &str) -> Result<checklist_item::Model> {
    find_task(db, task_id).await?;
    let existing = items().filter(checklist_item::Column::TaskId.eq(task_id)).all(db).await?;
    Ok(checklist_item::ActiveModel {
        id: Set(new_id()),
        task_id: Set(task_id.to_string()),
        text: Set(non_empty(text, "Checklist item")?),
        done: Set(false),
        position: Set(next_position(existing.iter().map(|i| i.position))),
        ..Default::default()
    }
    .insert(db)
    .await?)
}

pub async fn update_checklist_item(
    db: &DatabaseConnection,
    id: &str,
    text: &str,
    done: bool,
) -> Result<checklist_item::Model> {
    let mut item: checklist_item::ActiveModel = find_item(db, id).await?.into();
    item.text = Set(non_empty(text, "Checklist item")?);
    item.done = Set(done);
    Ok(item.update(db).await?)
}

pub async fn delete_checklist_item(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(checklist_item, db, checklist_item::Column::Id.eq(id));
    Ok(())
}

// ---------- Overview ----------

/// Progress across every project, for the overview tile.
pub async fn summary(db: &DatabaseConnection) -> Result<Summary> {
    let today = Local::now().date_naive();
    let week = today.checked_add_days(Days::new(7)).unwrap_or(today);
    let projects = list_projects(db).await?;
    let columns = columns().order_by_asc(column::Column::Position).all(db).await?;
    let tasks = tasks().filter(task::Column::Archived.eq(false)).all(db).await?;

    let is_open = |t: &task::Model| t.completed_at.is_none();
    let mut due_soon: Vec<DueTask> = tasks
        .iter()
        .filter(|t| is_open(t) && t.due_date.is_some_and(|d| d <= week))
        .map(|t| DueTask {
            id: t.id.clone(),
            project_id: t.project_id.clone(),
            project_name: projects
                .iter()
                .find(|p| p.id == t.project_id)
                .map(|p| p.name.clone())
                .unwrap_or_default(),
            title: t.title.clone(),
            due_date: t.due_date.unwrap_or(today),
        })
        .collect();
    due_soon.sort_by_key(|t| t.due_date);
    due_soon.truncate(8);

    let projects = projects
        .into_iter()
        .map(|p| {
            let own: Vec<_> = tasks.iter().filter(|t| t.project_id == p.id).collect();
            ProjectSummary {
                total: own.len(),
                done: own.iter().filter(|t| !is_open(t)).count(),
                overdue: own.iter().filter(|t| is_open(t) && t.due_date.is_some_and(|d| d < today)).count(),
                columns: columns
                    .iter()
                    .filter(|c| c.project_id == p.id)
                    .map(|c| ColumnCount {
                        name: c.name.clone(),
                        count: own.iter().filter(|t| t.column_id == c.id).count(),
                        is_done: c.is_done,
                    })
                    .collect(),
                id: p.id,
                name: p.name,
                color: p.color,
            }
        })
        .collect();

    Ok(Summary { today, projects, due_soon })
}

// ---------- Queries that skip deleted rows ----------

fn projects() -> Select<project::Entity> {
    project::Entity::find().filter(project::Column::DeletedAt.is_null())
}

fn columns() -> Select<column::Entity> {
    column::Entity::find().filter(column::Column::DeletedAt.is_null())
}

fn tasks() -> Select<task::Entity> {
    task::Entity::find().filter(task::Column::DeletedAt.is_null())
}

fn labels() -> Select<label::Entity> {
    label::Entity::find().filter(label::Column::DeletedAt.is_null())
}

fn links() -> Select<task_label::Entity> {
    task_label::Entity::find().filter(task_label::Column::DeletedAt.is_null())
}

fn items() -> Select<checklist_item::Entity> {
    checklist_item::Entity::find().filter(checklist_item::Column::DeletedAt.is_null())
}

fn events() -> Select<task_event::Entity> {
    task_event::Entity::find().filter(task_event::Column::DeletedAt.is_null())
}

fn templates() -> Select<template::Entity> {
    template::Entity::find().filter(template::Column::DeletedAt.is_null())
}

// ---------- Helpers ----------

async fn find_project(db: &impl ConnectionTrait, id: &str) -> Result<project::Model> {
    projects().filter(project::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Project"))
}

async fn find_column(db: &impl ConnectionTrait, id: &str) -> Result<column::Model> {
    columns().filter(column::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Column"))
}

async fn find_task(db: &impl ConnectionTrait, id: &str) -> Result<task::Model> {
    tasks().filter(task::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Task"))
}

async fn find_item(db: &impl ConnectionTrait, id: &str) -> Result<checklist_item::Model> {
    items().filter(checklist_item::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Checklist item"))
}

async fn columns_of(db: &impl ConnectionTrait, project_id: &str) -> Result<Vec<column::Model>> {
    Ok(columns().filter(column::Column::ProjectId.eq(project_id)).order_by_asc(column::Column::Position).all(db).await?)
}

async fn label_ids_of(db: &impl ConnectionTrait, task_id: &str) -> Result<Vec<String>> {
    Ok(ids(links().filter(task_label::Column::TaskId.eq(task_id)).order_by_asc(task_label::Column::Id).all(db).await?.iter().map(|l| &l.label_id)))
}

/// The visible tasks in a column, in order, optionally leaving one out.
async fn tasks_in(db: &impl ConnectionTrait, column_id: &str, except: Option<&str>) -> Result<Vec<task::Model>> {
    let mut query = tasks().filter(task::Column::ColumnId.eq(column_id)).filter(task::Column::Archived.eq(false));
    if let Some(id) = except {
        query = query.filter(task::Column::Id.ne(id));
    }
    Ok(query.order_by_asc(task::Column::Position).all(db).await?)
}

/// A position that sorts at `index` among `siblings`: halfway between the two
/// neighbors. When repeated moves leave no room between them, the column is
/// renumbered 1, 2, 3... first.
async fn position_at(db: &impl ConnectionTrait, siblings: &[task::Model], index: usize) -> Result<f64> {
    let prev = index.checked_sub(1).map(|i| siblings[i].position);
    let next = siblings.get(index).map(|t| t.position);
    Ok(match (prev, next) {
        (None, None) => 1.0,
        (Some(prev), None) => prev + 1.0,
        (None, Some(next)) => next - 1.0,
        (Some(prev), Some(next)) if next - prev > 1e-6 => (prev + next) / 2.0,
        _ => {
            for (i, sibling) in siblings.iter().enumerate() {
                task::Entity::update_many()
                    .col_expr(task::Column::Position, Expr::value(i as f64 + 1.0))
                    .col_expr(task::Column::UpdatedAt, Expr::value(Utc::now()))
                    .filter(task::Column::Id.eq(sibling.id.as_str()))
                    .exec(db)
                    .await?;
            }
            index as f64 + 0.5
        }
    })
}

async fn set_column_position(db: &impl ConnectionTrait, id: &str, position: f64) -> Result<()> {
    column::Entity::update_many()
        .col_expr(column::Column::Position, Expr::value(position))
        .col_expr(column::Column::UpdatedAt, Expr::value(Utc::now()))
        .filter(column::Column::Id.eq(id))
        .exec(db)
        .await?;
    Ok(())
}

async fn log(db: &impl ConnectionTrait, task_id: &str, kind: &str, detail: String) -> Result<()> {
    task_event::ActiveModel {
        id: Set(new_id()),
        task_id: Set(task_id.to_string()),
        kind: Set(kind.into()),
        detail: Set(detail),
        created_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(db)
    .await?;
    Ok(())
}

/// Owned copies of ids, e.g. for an `IN (...)` filter.
fn ids<'a>(ids: impl Iterator<Item = &'a String>) -> Vec<String> {
    ids.cloned().collect()
}

/// One past the highest position, so a new row goes last.
fn next_position(positions: impl Iterator<Item = f64>) -> f64 {
    positions.fold(0.0, f64::max) + 1.0
}

fn non_empty(text: &str, what: &str) -> Result<String> {
    let text = text.trim();
    if text.is_empty() {
        Err(Error::Invalid(format!("{what} can't be empty.")))
    } else {
        Ok(text.to_string())
    }
}

fn label_color(color: &str) -> Result<String> {
    if LABEL_COLORS.contains(&color) {
        Ok(color.to_string())
    } else {
        Err(Error::Invalid(format!("Unknown label color \"{color}\"")))
    }
}

// ---------- For the Daily Plan ----------

/// Cards worth planning for `today`: overdue, due today, or in progress (in
/// the column just before Done). Most urgent first.
pub async fn plannable_cards(db: &DatabaseConnection, today: NaiveDate) -> Result<Vec<PlannableCard>> {
    let open = tasks()
        .filter(task::Column::CompletedAt.is_null())
        .filter(task::Column::Archived.eq(false))
        .all(db)
        .await?;
    let mut cards = describe_cards(db, open).await?;
    cards.retain(|c| c.in_progress || c.due_date.is_some_and(|d| d <= today));
    cards.sort_by_key(|c| (c.due_date.is_none(), c.due_date, !c.in_progress));
    cards.truncate(30);
    Ok(cards)
}

/// The given cards, for showing next to planner tasks linked to them.
/// Deleted cards are left out.
pub async fn cards_by_id(db: &DatabaseConnection, ids: &[String]) -> Result<Vec<PlannableCard>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let found = tasks().filter(task::Column::Id.is_in(ids.iter().map(String::as_str))).all(db).await?;
    describe_cards(db, found).await
}

/// Ticks a card off from the planner: moves it to its project's Done column,
/// or back to the column before Done when un-ticked. Both are recorded in
/// the card's history, as if dragged on the board.
pub async fn set_card_done(db: &DatabaseConnection, id: &str, done: bool) -> Result<()> {
    let card = find_task(db, id).await?;
    let columns = columns_of(db, &card.project_id).await?;
    let current_is_done = columns.iter().any(|c| c.id == card.column_id && c.is_done);
    if done == current_is_done {
        return Ok(());
    }
    let target = if done {
        columns.iter().find(|c| c.is_done)
    } else {
        columns.iter().rev().find(|c| !c.is_done)
    };
    match target {
        Some(column) => move_task(db, id, &column.id, None).await.map(drop),
        None if done => Err(Error::Invalid("That card's project has no Done column, so it can't be ticked off from here.".into())),
        None => Ok(()),
    }
}

async fn describe_cards(db: &DatabaseConnection, cards: Vec<task::Model>) -> Result<Vec<PlannableCard>> {
    let all_projects = projects().all(db).await?;
    let all_columns = columns().all(db).await?;
    Ok(cards
        .into_iter()
        .filter_map(|card| {
            let project = all_projects.iter().find(|p| p.id == card.project_id)?;
            let mut own: Vec<&column::Model> = all_columns.iter().filter(|c| c.project_id == card.project_id).collect();
            own.sort_by(|a, b| a.position.total_cmp(&b.position));
            let column = own.iter().find(|c| c.id == card.column_id)?;
            // "In progress" is the last column that isn't Done.
            let in_progress = !column.is_done && own.iter().rev().find(|c| !c.is_done).is_some_and(|c| c.id == column.id) && own.len() > 1;
            Some(PlannableCard {
                id: card.id,
                title: card.title,
                project_name: project.name.clone(),
                project_color: project.color.clone(),
                column_name: column.name.clone(),
                due_date: card.due_date,
                estimate_minutes: card.estimate.map(|h| (h * 60.0).round() as i32).filter(|m| *m > 0),
                in_progress,
                done: column.is_done,
            })
        })
        .collect())
}
