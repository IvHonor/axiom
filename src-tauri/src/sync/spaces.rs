//! Shared boards on this computer: which projects are shared, your role in
//! each, how far each has pulled, and which rows belong to which board.
//!
//! A shared project's rows sync with its space on the server instead of
//! with your account. Rows are matched to a board by `project_id`, or (for
//! a card's checklist, labels and history) through their card's `task_id`.

use std::collections::{HashMap, HashSet};

use axiom_protocol::{Record, RecordRef, Role, Space};
use sea_orm::{ConnectionTrait, DbBackend, DbErr, Statement, Value as SqlValue};
use serde::Serialize;
use serde_json::{Map, Value};

/// A shared board as this computer knows it. Mirrored by `SharedBoard` in
/// `src/features/project_board/api.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSpace {
    pub id: String,
    pub role: Role,
    pub name: String,
    pub owner_email: String,
    pub members: i64,
    #[serde(skip)]
    pub cursor: i64,
}

/// Board tables that hang off a project directly.
const BY_PROJECT: [&str; 4] = ["project_board_columns", "project_board_labels", "project_board_tasks", "project_board_templates"];
/// Board tables that hang off a card.
const BY_TASK: [&str; 3] = ["project_board_task_labels", "project_board_checklist_items", "project_board_task_events"];
const PROJECTS: &str = "project_board_projects";

fn sql<const N: usize>(query: &str, values: [SqlValue; N]) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, query, values)
}

pub async fn list(db: &impl ConnectionTrait) -> Result<Vec<LocalSpace>, DbErr> {
    let rows = db.query_all_raw(sql("SELECT id, role, name, owner_email, members, cursor FROM sync_spaces ORDER BY name", [])).await?;
    rows.iter()
        .map(|r| {
            Ok(LocalSpace {
                id: r.try_get("", "id")?,
                role: Role::parse(&r.try_get::<String>("", "role")?).unwrap_or(Role::Viewer),
                name: r.try_get("", "name")?,
                owner_email: r.try_get("", "owner_email")?,
                members: r.try_get("", "members")?,
                cursor: r.try_get("", "cursor")?,
            })
        })
        .collect()
}

/// Your role on a project, if it's shared.
pub async fn role_of(db: &impl ConnectionTrait, project_id: &str) -> Result<Option<Role>, DbErr> {
    let row = db.query_one_raw(sql("SELECT role FROM sync_spaces WHERE id = ?", [project_id.into()])).await?;
    Ok(row.and_then(|r| r.try_get::<String>("", "role").ok()).and_then(|r| Role::parse(&r)))
}

/// Records what the server says about a board, keeping how far it has pulled.
pub async fn upsert(db: &impl ConnectionTrait, space: &Space) -> Result<(), DbErr> {
    db.execute_raw(sql(
        "INSERT INTO sync_spaces (id, role, name, owner_email, members, cursor) VALUES (?, ?, ?, ?, ?, 0)
         ON CONFLICT (id) DO UPDATE SET role = excluded.role, name = excluded.name,
           owner_email = excluded.owner_email, members = excluded.members",
        [
            space.id.as_str().into(),
            space.role.as_str().into(),
            space.name.as_str().into(),
            space.owner_email.as_str().into(),
            (space.members as i64).into(),
        ],
    ))
    .await?;
    Ok(())
}

pub async fn set_cursor(db: &impl ConnectionTrait, id: &str, cursor: i64) -> Result<(), DbErr> {
    db.execute_raw(sql("UPDATE sync_spaces SET cursor = ? WHERE id = ?", [cursor.into(), id.into()])).await?;
    Ok(())
}

pub async fn project_exists(db: &impl ConnectionTrait, project_id: &str) -> Result<bool, DbErr> {
    let row = db.query_one_raw(sql("SELECT 1 AS x FROM project_board_projects WHERE id = ? AND deleted_at IS NULL", [project_id.into()])).await?;
    Ok(row.is_some())
}

/// Every row of a project on this computer (deleted ones too), table by table.
pub async fn rows_of_project(db: &impl ConnectionTrait, project_id: &str) -> Result<Vec<RecordRef>, DbErr> {
    let mut out = vec![RecordRef { table: PROJECTS.into(), id: project_id.into() }];
    for table in BY_PROJECT {
        let rows = db.query_all_raw(sql(&format!(r#"SELECT id FROM "{table}" WHERE project_id = ?"#), [project_id.into()])).await?;
        out.extend(rows.iter().filter_map(|r| r.try_get::<String>("", "id").ok()).map(|id| RecordRef { table: table.into(), id }));
    }
    for table in BY_TASK {
        let rows = db
            .query_all_raw(sql(
                &format!(r#"SELECT id FROM "{table}" WHERE task_id IN (SELECT id FROM project_board_tasks WHERE project_id = ?)"#),
                [project_id.into()],
            ))
            .await?;
        out.extend(rows.iter().filter_map(|r| r.try_get::<String>("", "id").ok()).map(|id| RecordRef { table: table.into(), id }));
    }
    Ok(out)
}

/// Removes a board's rows from this computer without syncing the removal
/// (the board isn't yours to delete), and forgets the board.
pub async fn remove_board(db: &impl ConnectionTrait, project_id: &str) -> Result<(), DbErr> {
    for r in rows_of_project(db, project_id).await? {
        db.execute_raw(sql(&format!(r#"DELETE FROM "{}" WHERE id = ?"#, r.table), [r.id.as_str().into()])).await?;
        forget_row(db, &r).await?;
    }
    db.execute_raw(sql("DELETE FROM sync_spaces WHERE id = ?", [project_id.into()])).await?;
    Ok(())
}

/// Turns a board back into one of your own projects: every row is sent to
/// your account in full on the next sync.
pub async fn make_personal(db: &impl ConnectionTrait, project_id: &str) -> Result<(), DbErr> {
    for r in rows_of_project(db, project_id).await? {
        db.execute_raw(sql("DELETE FROM sync_base WHERE table_name = ? AND row_id = ?", [r.table.as_str().into(), r.id.as_str().into()])).await?;
    }
    db.execute_raw(sql("DELETE FROM sync_spaces WHERE id = ?", [project_id.into()])).await?;
    queue(db, &rows_of_project(db, project_id).await?).await
}

/// Queues rows to be pushed (only fields the server lacks go).
pub async fn queue(db: &impl ConnectionTrait, rows: &[RecordRef]) -> Result<(), DbErr> {
    for r in rows {
        db.execute_raw(sql(
            "INSERT INTO sync_outbox (table_name, row_id, changed_at, version)
             VALUES (?, ?, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 1)
             ON CONFLICT (table_name, row_id) DO UPDATE SET version = sync_outbox.version + 1",
            [r.table.as_str().into(), r.id.as_str().into()],
        ))
        .await?;
    }
    Ok(())
}

async fn forget_row(db: &impl ConnectionTrait, r: &RecordRef) -> Result<(), DbErr> {
    db.execute_raw(sql("DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?", [r.table.as_str().into(), r.id.as_str().into()])).await?;
    db.execute_raw(sql("DELETE FROM sync_base WHERE table_name = ? AND row_id = ?", [r.table.as_str().into(), r.id.as_str().into()])).await?;
    Ok(())
}

/// Drops unpushed edits to these rows and forgets what the server had, so
/// the next pull puts the server's version back. Used when the server
/// refuses an edit (your role changed).
pub async fn discard_edits(db: &impl ConnectionTrait, rows: &[RecordRef]) -> Result<(), DbErr> {
    for r in rows {
        forget_row(db, r).await?;
    }
    Ok(())
}

async fn project_of_task(db: &impl ConnectionTrait, task_id: &str) -> Result<Option<String>, DbErr> {
    let row = db.query_one_raw(sql("SELECT project_id FROM project_board_tasks WHERE id = ?", [task_id.into()])).await?;
    Ok(row.and_then(|r| r.try_get::<String>("", "project_id").ok()))
}

/// The project a board row belongs to, from its fields. None for rows that
/// aren't part of a board (or whose card isn't here).
pub async fn project_of(db: &impl ConnectionTrait, table: &str, id: &str, fields: &Map<String, Value>) -> Result<Option<String>, DbErr> {
    let text = |name: &str| fields.get(name).and_then(Value::as_str).map(str::to_owned);
    if table == PROJECTS {
        return Ok(Some(id.to_owned()));
    }
    if BY_PROJECT.contains(&table) {
        return Ok(text("project_id"));
    }
    if BY_TASK.contains(&table) {
        return match text("task_id") {
            Some(task) => project_of_task(db, &task).await,
            None => Ok(None),
        };
    }
    Ok(None)
}

/// Whether a record pulled from board `space` really belongs to it. A
/// member's app could send anything, so a row may only touch this board:
/// never one of your own projects, or another board.
pub async fn belongs(db: &impl ConnectionTrait, space: &str, record: &Record, tasks_in_page: &HashMap<String, String>) -> Result<bool, DbErr> {
    let text = |name: &str| record.data.get(name).and_then(Value::as_str);
    if record.table == PROJECTS {
        return Ok(record.id == space);
    }
    if BY_PROJECT.contains(&record.table.as_str()) {
        if text("project_id") != Some(space) {
            return Ok(false);
        }
        // A card that's already here in another project can't be pulled into this one.
        if record.table == "project_board_tasks" {
            if let Some(local) = project_of_task(db, &record.id).await? {
                return Ok(local == space);
            }
        }
        return Ok(true);
    }
    if BY_TASK.contains(&record.table.as_str()) {
        let Some(task) = text("task_id") else { return Ok(false) };
        if let Some(project) = tasks_in_page.get(task) {
            return Ok(project == space);
        }
        // A card not here yet arrives later from this board; one that's here
        // must be in this board.
        return Ok(project_of_task(db, task).await?.is_none_or(|p| p == space));
    }
    Ok(false)
}

/// Personal records for rows that now belong to a shared board (sent by an
/// older Axiom) are left out: the board's copy is the one that counts.
pub async fn shared_rows_in(db: &impl ConnectionTrait, records: &[Record], shared: &HashSet<String>) -> Result<HashSet<(String, String)>, DbErr> {
    let mut out = HashSet::new();
    for r in records {
        if let Some(project) = project_of(db, &r.table, &r.id, &r.data).await? {
            if shared.contains(&project) {
                out.insert((r.table.clone(), r.id.clone()));
            }
        }
    }
    Ok(out)
}
