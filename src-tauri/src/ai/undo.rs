//! Undoing a change Lemma made. Around confirming one, the rows of the area's
//! tables are read just before and just after; the rows that differ (changed,
//! added or removed: removing is only marking `deleted_at`) are kept here,
//! as they were and as they became. Undoing puts them back as they were,
//! unless something has changed one since, so it never overwrites anything
//! done after. It works for every tool alike, because it only looks at rows.
//!
//! What's kept stays on this computer (`assistant_undo` isn't synced): Undo
//! is offered where the change was made. Putting rows back is an ordinary
//! edit, so it syncs like any other. A change confirmed here that can't be
//! undone gets a row with no data, so the chat can still tell a change
//! confirmed here from one confirmed on another computer.

use std::collections::HashMap;

use chrono::Utc;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, TransactionTrait, Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::{Error, Result};
use crate::features;
use crate::sync::LOCAL_COLUMNS;

type Row = Map<String, Value>;

/// What's kept for one change at most; a bigger change can't be undone.
const MAX_KEPT: usize = 2 * 1024 * 1024;
/// Undo is offered for this long after confirming.
pub const KEPT_DAYS: i64 = 30;

/// Tables Lemma's tools only ever add rows to, and that grow big (the
/// Journal's and Notes' saved edits, a board's activity): only their rows'
/// ids and times are read around a change, and then just the new rows.
const ADDED_TO: &[&str] = &["journal_edits", "note_edits", "project_board_task_events"];

/// The tables an area's tools change. Calendar connections aren't among
/// them: Lemma never touches those.
fn tables(area: &str) -> Vec<&'static str> {
    let all = match area {
        "birthdays" => features::birthdays::SYNCED_TABLES,
        "daily_plan" => features::daily_plan::SYNCED_TABLES,
        "finance" => features::finance::SYNCED_TABLES,
        "goals" => features::goals::SYNCED_TABLES,
        "journal" => features::journal::SYNCED_TABLES,
        "learning" => features::learning::SYNCED_TABLES,
        "notes" => features::notes::SYNCED_TABLES,
        "project_board" => features::project_board::SYNCED_TABLES,
        "reading" => features::reading::SYNCED_TABLES,
        "uni" => features::uni::SYNCED_TABLES,
        _ => &[],
    };
    all.iter().copied().filter(|t| !features::daily_plan::ENCRYPTED_TABLES.contains(t)).collect()
}

/// A table's rows: whole, or for the ones only added to, each row's `updated_at`.
enum Rows {
    Whole(HashMap<String, Row>),
    Times(HashMap<String, Value>),
}

/// An area's tables, read.
pub struct Snapshot(Vec<(&'static str, Rows)>);

/// Each row's `updated_at`, by id: enough to see what was added or changed.
async fn times(db: &impl ConnectionTrait, table: &str) -> Result<HashMap<String, Value>> {
    let rows = db.query_all_raw(sql(&format!(r#"SELECT json_object('id', id, 'at', updated_at) AS j FROM "{table}""#), vec![])).await?;
    let mut out = HashMap::new();
    for r in rows {
        if let Ok(mut row) = serde_json::from_str::<Row>(&r.try_get::<String>("", "j")?) {
            if let (Some(Value::String(id)), Some(at)) = (row.remove("id"), row.remove("at")) {
                out.insert(id, at);
            }
        }
    }
    Ok(out)
}

/// One row a change touched: as it was (None when the change added it) and
/// as it became.
#[derive(Serialize, Deserialize)]
struct Touched {
    table: String,
    id: String,
    before: Option<Row>,
    after: Row,
}

/// A table's columns that sync, so this computer's own (when it last
/// fetched something) are left alone.
async fn columns(db: &impl ConnectionTrait, table: &str) -> Result<Vec<String>> {
    let local: &[&str] = LOCAL_COLUMNS.iter().find(|(t, _)| *t == table).map_or(&[], |(_, c)| c);
    let rows = db.query_all_raw(sql("SELECT name FROM pragma_table_info(?)", vec![table.into()])).await?;
    let names: Vec<String> = rows.iter().map(|r| r.try_get::<String>("", "name")).collect::<std::result::Result<_, _>>()?;
    Ok(names.into_iter().filter(|n| !local.contains(&n.as_str())).collect())
}

/// Rows as JSON objects, exactly as SQLite stores them: all of a table's, or one.
async fn rows(db: &impl ConnectionTrait, table: &str, id: Option<&str>) -> Result<HashMap<String, Row>> {
    let pairs: Vec<String> = columns(db, table).await?.iter().map(|c| format!(r#"'{c}', "{c}""#)).collect();
    let mut query = format!(r#"SELECT json_object({}) AS j FROM "{table}""#, pairs.join(", "));
    let mut values = Vec::new();
    if let Some(id) = id {
        query.push_str(" WHERE id = ?");
        values.push(id.into());
    }
    let mut out = HashMap::new();
    for r in db.query_all_raw(sql(&query, values)).await? {
        if let Ok(row) = serde_json::from_str::<Row>(&r.try_get::<String>("", "j")?) {
            if let Some(id) = row.get("id").and_then(Value::as_str) {
                out.insert(id.to_owned(), row);
            }
        }
    }
    Ok(out)
}

pub async fn snapshot(db: &DatabaseConnection, area: &str) -> Result<Snapshot> {
    let mut all = Vec::new();
    for table in tables(area) {
        all.push((table, if ADDED_TO.contains(&table) { Rows::Times(times(db, table).await?) } else { Rows::Whole(rows(db, table, None).await?) }));
    }
    Ok(Snapshot(all))
}

/// What changed between the two snapshots, or None if it can't be put back:
/// a row of a table only read for its times was changed, not added.
async fn touched(db: &DatabaseConnection, before: Snapshot, after: Snapshot) -> Result<Option<Vec<Touched>>> {
    let mut touched = Vec::new();
    for ((table, was), (_, now)) in before.0.into_iter().zip(after.0) {
        match (was, now) {
            (Rows::Whole(mut was), Rows::Whole(now)) => {
                for (id, row) in now {
                    let before = was.remove(&id);
                    if before.as_ref() != Some(&row) {
                        touched.push(Touched { table: table.to_owned(), id, before, after: row });
                    }
                }
            }
            (Rows::Times(was), Rows::Times(now)) => {
                for (id, at) in now {
                    match was.get(&id) {
                        Some(old) if *old == at => {}
                        Some(_) => return Ok(None),
                        None => {
                            if let Some(row) = rows(db, table, Some(&id)).await?.remove(&id) {
                                touched.push(Touched { table: table.to_owned(), id, before: None, after: row });
                            }
                        }
                    }
                }
            }
            _ => return Ok(None),
        }
    }
    Ok(Some(touched))
}

/// Keeps what changed between the two snapshots, so the change can be
/// undone. Returns whether it can be: not when nothing changed, or too much.
pub async fn keep(db: &DatabaseConnection, proposal_id: &str, before: Snapshot, after: Snapshot) -> Result<bool> {
    db.execute_raw(sql(
        "DELETE FROM assistant_undo WHERE created_at < ?",
        vec![(Utc::now() - chrono::Duration::days(KEPT_DAYS)).into()],
    ))
    .await?;
    let Some(touched) = touched(db, before, after).await? else { return mark(db, proposal_id).await.map(|()| false) };
    let data = serde_json::to_string(&touched).unwrap_or_default();
    if touched.is_empty() || data.len() > MAX_KEPT {
        return mark(db, proposal_id).await.map(|()| false);
    }
    db.execute_raw(sql(
        "INSERT INTO assistant_undo (proposal_id, data, created_at) VALUES (?, ?, ?) ON CONFLICT (proposal_id) DO UPDATE SET data = excluded.data",
        vec![proposal_id.into(), data.into(), Utc::now().into()],
    ))
    .await?;
    Ok(true)
}

/// Notes that a change was confirmed here, though it can't be undone.
pub async fn mark(db: &DatabaseConnection, proposal_id: &str) -> Result<()> {
    db.execute_raw(sql(
        "INSERT INTO assistant_undo (proposal_id, data, created_at) VALUES (?, '', ?) ON CONFLICT (proposal_id) DO NOTHING",
        vec![proposal_id.into(), Utc::now().into()],
    ))
    .await?;
    Ok(())
}

/// Which of these changes can still be undone here.
pub async fn undoable(db: &DatabaseConnection, ids: &[String]) -> Result<Vec<String>> {
    kept(db, ids, "data <> ''").await
}

/// Which of these changes were confirmed here lately, undoable or not.
pub async fn confirmed_here(db: &DatabaseConnection, ids: &[String]) -> Result<Vec<String>> {
    kept(db, ids, "1 = 1").await
}

/// Which of these changes have a row here from the last `KEPT_DAYS`, that also matches `also`.
async fn kept(db: &DatabaseConnection, ids: &[String], also: &str) -> Result<Vec<String>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let marks = vec!["?"; ids.len()].join(", ");
    let rows = db
        .query_all_raw(sql(
            &format!("SELECT proposal_id FROM assistant_undo WHERE proposal_id IN ({marks}) AND created_at >= ? AND {also}"),
            ids.iter().map(|id| id.as_str().into()).chain([(Utc::now() - chrono::Duration::days(KEPT_DAYS)).into()]).collect(),
        ))
        .await?;
    Ok(rows.iter().filter_map(|r| r.try_get::<String>("", "proposal_id").ok()).collect())
}

/// Puts back every row the change touched, all or nothing.
pub async fn undo(db: &DatabaseConnection, proposal_id: &str) -> Result<()> {
    let Some(kept) = db.query_one_raw(sql("SELECT data FROM assistant_undo WHERE proposal_id = ?", vec![proposal_id.into()])).await? else {
        return Err(Error::Invalid("This change can't be undone any more.".into()));
    };
    let touched: Vec<Touched> = serde_json::from_str(&kept.try_get::<String>("", "data")?).map_err(|_| Error::Invalid("This change can't be undone any more.".into()))?;
    let txn = db.begin().await?;
    let now: SqlValue = Utc::now().into();
    for t in &touched {
        // Changed again since (here, or synced from elsewhere): leave it all.
        if rows(&txn, &t.table, Some(&t.id)).await?.get(&t.id) != Some(&t.after) {
            return Err(Error::Invalid("Some of this has changed since, so it can't be undone without losing that.".into()));
        }
        match &t.before {
            // Added by the change: removed, as the app removes things.
            None => {
                txn.execute_raw(sql(&format!(r#"UPDATE "{}" SET deleted_at = ?, updated_at = ? WHERE id = ?"#, t.table), vec![now.clone(), now.clone(), t.id.as_str().into()])).await?;
            }
            Some(before) => {
                let fields: Vec<(&String, &Value)> = before.iter().filter(|(name, _)| !matches!(name.as_str(), "id" | "updated_at")).collect();
                let sets: Vec<String> = fields.iter().map(|(name, _)| format!(r#""{name}" = ?"#)).chain(["updated_at = ?".into()]).collect();
                let values = fields.iter().map(|(_, v)| to_sql(v)).chain([now.clone(), t.id.as_str().into()]).collect();
                txn.execute_raw(sql(&format!(r#"UPDATE "{}" SET {} WHERE id = ?"#, t.table, sets.join(", ")), values)).await?;
            }
        }
    }
    txn.execute_raw(sql("DELETE FROM assistant_undo WHERE proposal_id = ?", vec![proposal_id.into()])).await?;
    txn.commit().await?;
    Ok(())
}

/// JSON values go back into SQLite as the types `json_object` read them as.
fn to_sql(value: &Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::String(None),
        Value::Bool(b) => (*b).into(),
        Value::Number(n) => match n.as_i64() {
            Some(i) => i.into(),
            None => n.as_f64().into(),
        },
        Value::String(s) => s.as_str().into(),
        other => other.to_string().into(),
    }
}

fn sql(query: &str, values: Vec<SqlValue>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, query, values)
}
