//! Sync's side of the local database: noticing changes, turning rows into
//! JSON and back, and remembering what the server has.
//!
//! It works on any table listed in `TABLES`, reading the columns from SQLite
//! itself, so features don't write any sync code beyond listing their tables.

use std::collections::HashMap;

use axiom_protocol::{Change, Record};
use chrono::{DateTime, Utc};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, DbErr, Statement, TransactionTrait, Value as SqlValue};
use serde_json::{Map, Value};

use super::TABLES;

type Row = Map<String, Value>;

/// The current time in Unix milliseconds, as SQLite computes it.
const NOW_MS: &str = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";

/// Adds triggers that note every insert and update in `sync_outbox`. Run at
/// every startup; existing triggers are left alone. (Deletes are soft, so
/// they're updates too.)
pub async fn install_triggers(db: &impl ConnectionTrait) -> Result<(), DbErr> {
    for table in TABLES {
        for event in ["INSERT", "UPDATE"] {
            db.execute_unprepared(&format!(
                r#"CREATE TRIGGER IF NOT EXISTS "sync_{event}_{table}" AFTER {event} ON "{table}" BEGIN
                    INSERT INTO sync_outbox (table_name, row_id, changed_at, version) VALUES ('{table}', NEW.id, {NOW_MS}, 1)
                    ON CONFLICT (table_name, row_id) DO UPDATE SET changed_at = excluded.changed_at, version = sync_outbox.version + 1;
                END;"#
            ))
            .await?;
        }
    }
    Ok(())
}

pub struct State {
    pub user_id: Option<String>,
    pub cursor: i64,
    pub last_synced_at: Option<DateTime<Utc>>,
}

pub async fn state(db: &impl ConnectionTrait) -> Result<State, DbErr> {
    let row = db
        .query_one_raw(sql("SELECT user_id, cursor, last_synced_at FROM sync_state WHERE id = 1", []))
        .await?
        .ok_or_else(|| DbErr::RecordNotFound("sync_state".into()))?;
    let last: Option<String> = row.try_get("", "last_synced_at")?;
    Ok(State {
        user_id: row.try_get("", "user_id")?,
        cursor: row.try_get("", "cursor")?,
        last_synced_at: last.and_then(|t| t.parse().ok()),
    })
}

pub async fn mark_synced(db: &impl ConnectionTrait, at: DateTime<Utc>) -> Result<(), DbErr> {
    db.execute_raw(sql("UPDATE sync_state SET last_synced_at = ? WHERE id = 1", [at.to_rfc3339().into()])).await?;
    Ok(())
}

pub async fn has_pending(db: &impl ConnectionTrait) -> Result<bool, DbErr> {
    Ok(db.query_one_raw(sql("SELECT 1 AS x FROM sync_outbox LIMIT 1", [])).await?.is_some())
}

/// Rows that aren't deleted, across every synced table. Zero means there's
/// nothing here worth asking about before linking an account.
pub async fn live_rows(db: &impl ConnectionTrait) -> Result<i64, DbErr> {
    let mut total = 0;
    for table in TABLES {
        total += count(db, &format!(r#"SELECT COUNT(*) AS n FROM "{table}" WHERE deleted_at IS NULL"#)).await?;
    }
    Ok(total)
}

pub async fn project_count(db: &impl ConnectionTrait) -> Result<i64, DbErr> {
    count(db, "SELECT COUNT(*) AS n FROM project_board_projects WHERE deleted_at IS NULL").await
}

/// How to join this computer's data to an account it isn't linked to yet.
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Link {
    /// Upload everything here and keep it, alongside the account's data.
    Merge,
    /// Delete everything here and download the account's data instead.
    Replace,
}

pub async fn link(db: &DatabaseConnection, user_id: &str, how: Link) -> Result<(), DbErr> {
    let txn = db.begin().await?;
    if how == Link::Replace {
        clear_tables(&txn).await?;
    }
    txn.execute_unprepared("DELETE FROM sync_base; DELETE FROM sync_outbox;").await?;
    if how == Link::Merge {
        for table in TABLES {
            txn.execute_unprepared(&format!(
                r#"INSERT INTO sync_outbox (table_name, row_id, changed_at, version)
                   SELECT '{table}', id, {NOW_MS}, 1 FROM "{table}" WHERE true
                   ON CONFLICT (table_name, row_id) DO UPDATE SET version = sync_outbox.version + 1"#
            ))
            .await?;
        }
    }
    txn.execute_raw(sql(
        "UPDATE sync_state SET user_id = ?, cursor = 0, last_synced_at = NULL WHERE id = 1",
        [user_id.into()],
    ))
    .await?;
    txn.commit().await
}

/// Deletes every synced row from this computer and unlinks the account.
pub async fn wipe(db: &DatabaseConnection) -> Result<(), DbErr> {
    let txn = db.begin().await?;
    clear_tables(&txn).await?;
    txn.execute_unprepared(
        "DELETE FROM sync_base; DELETE FROM sync_outbox;
         UPDATE sync_state SET user_id = NULL, cursor = 0, last_synced_at = NULL WHERE id = 1;",
    )
    .await?;
    txn.commit().await
}

/// Stops syncing this computer's data with any account, keeping the data.
/// Used after the account is deleted.
pub async fn unlink(db: &impl ConnectionTrait) -> Result<(), DbErr> {
    db.execute_unprepared(
        "DELETE FROM sync_base; DELETE FROM sync_outbox;
         UPDATE sync_state SET user_id = NULL, cursor = 0, last_synced_at = NULL WHERE id = 1;",
    )
    .await?;
    Ok(())
}

/// Every row that isn't deleted, table by table, for exporting.
pub async fn export(db: &impl ConnectionTrait) -> Result<Map<String, Value>, DbErr> {
    let mut columns = Columns::default();
    let mut tables = Map::new();
    for table in TABLES {
        let pairs: Vec<String> = columns.of(db, table).await?.iter().map(|c| format!(r#"'{c}', "{c}""#)).collect();
        let query = format!(r#"SELECT json_object({}) AS j FROM "{table}" WHERE deleted_at IS NULL"#, pairs.join(", "));
        let rows = db
            .query_all_raw(sql(&query, []))
            .await?
            .iter()
            .map(|r| r.try_get::<String>("", "j").map(|j| serde_json::from_str(&j).unwrap_or(Value::Null)))
            .collect::<Result<Vec<Value>, _>>()?;
        tables.insert((*table).to_owned(), Value::Array(rows));
    }
    Ok(tables)
}

async fn clear_tables(db: &impl ConnectionTrait) -> Result<(), DbErr> {
    for table in TABLES {
        db.execute_unprepared(&format!(r#"DELETE FROM "{table}""#)).await?;
    }
    Ok(())
}

/// A row waiting to be pushed, with the full row as it is now.
pub struct Outgoing {
    table: String,
    id: String,
    version: i64,
    row: Option<Row>,
    pub change: Option<Change>,
}

/// Up to `limit` changed rows, each reduced to the fields that differ from
/// what the server last saw.
pub async fn outgoing(db: &impl ConnectionTrait, limit: usize) -> Result<Vec<Outgoing>, DbErr> {
    let pending = db
        .query_all_raw(sql(
            "SELECT table_name, row_id, changed_at, version FROM sync_outbox ORDER BY changed_at LIMIT ?",
            [(limit as i64).into()],
        ))
        .await?;
    let mut columns = Columns::default();
    let mut out = Vec::with_capacity(pending.len());
    for p in pending {
        let (table, id): (String, String) = (p.try_get("", "table_name")?, p.try_get("", "row_id")?);
        let (changed_at, version): (i64, i64) = (p.try_get("", "changed_at")?, p.try_get("", "version")?);
        let row = if TABLES.contains(&table.as_str()) { read_row(db, &mut columns, &table, &id).await? } else { None };
        let change = match &row {
            Some(row) => {
                let base = read_base(db, &table, &id).await?;
                let fields: Row = row
                    .iter()
                    .filter(|(name, value)| base.as_ref().and_then(|b| b.get(*name)) != Some(*value))
                    .map(|(name, value)| (name.clone(), value.clone()))
                    .collect();
                (!fields.is_empty()).then(|| Change { table: table.clone(), id: id.clone(), fields, changed_at })
            }
            None => None,
        };
        out.push(Outgoing { table, id, version, row, change });
    }
    Ok(out)
}

/// After a successful push: the server now has these rows as sent. An edit
/// made during the push bumped `version`, so it stays queued.
pub async fn pushed(db: &DatabaseConnection, sent: &[Outgoing]) -> Result<(), DbErr> {
    let txn = db.begin().await?;
    for item in sent {
        txn.execute_raw(sql(
            "DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ? AND version = ?",
            [item.table.as_str().into(), item.id.as_str().into(), item.version.into()],
        ))
        .await?;
        if let Some(row) = &item.row {
            write_base(&txn, &item.table, &item.id, row).await?;
        }
    }
    txn.commit().await
}

/// Writes pulled records into the local tables and moves the cursor.
/// Returns how many rows changed here.
///
/// A row with unpushed edits is skipped: its push will merge those edits on
/// the server and bring it back in a later pull, so nothing is lost.
pub async fn apply(db: &DatabaseConnection, records: &[Record], cursor: i64) -> Result<usize, DbErr> {
    let txn = db.begin().await?;
    let mut columns = Columns::default();
    let mut applied = 0;
    for record in records {
        let table = record.table.as_str();
        if !TABLES.contains(&table) || is_dirty(&txn, table, &record.id).await? {
            continue;
        }
        let known = columns.of(&txn, table).await?;
        // Fields this version of Axiom doesn't know (from a newer one) are
        // left out here, but kept on the server.
        let fields: Vec<(&String, &Value)> = record.data.iter().filter(|(name, _)| known.contains(name)).collect();
        if !fields.iter().any(|(name, _)| *name == "id") {
            continue;
        }
        let names: Vec<String> = fields.iter().map(|(name, _)| format!(r#""{name}""#)).collect();
        let updates: Vec<String> = names.iter().map(|n| format!("{n} = excluded.{n}")).collect();
        let statement = format!(
            r#"INSERT INTO "{table}" ({}) VALUES ({}) ON CONFLICT (id) DO UPDATE SET {}"#,
            names.join(", "),
            vec!["?"; names.len()].join(", "),
            updates.join(", "),
        );
        let values: Vec<SqlValue> = fields.iter().map(|(_, value)| to_sql(value)).collect();
        if let Err(err) = txn.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite, statement, values)).await {
            // Most likely a row from a newer Axiom missing a required column.
            // Skip it rather than stall every other record.
            eprintln!("sync: couldn't apply {table}/{}: {err}", record.id);
            continue;
        }
        // The insert fired the change trigger; this change came from the server.
        txn.execute_raw(sql(
            "DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?",
            [table.into(), record.id.as_str().into()],
        ))
        .await?;
        write_base(&txn, table, &record.id, &record.data).await?;
        applied += 1;
    }
    txn.execute_raw(sql("UPDATE sync_state SET cursor = ? WHERE id = 1", [cursor.into()])).await?;
    txn.commit().await?;
    Ok(applied)
}

/// Column names per table, read from SQLite once per sync.
#[derive(Default)]
struct Columns(HashMap<String, Vec<String>>);

impl Columns {
    async fn of(&mut self, db: &impl ConnectionTrait, table: &str) -> Result<&Vec<String>, DbErr> {
        if !self.0.contains_key(table) {
            let rows = db.query_all_raw(sql("SELECT name FROM pragma_table_info(?)", [table.into()])).await?;
            let names = rows.iter().map(|r| r.try_get::<String>("", "name")).collect::<Result<_, _>>()?;
            self.0.insert(table.to_owned(), names);
        }
        Ok(&self.0[table])
    }
}

/// A row as a JSON object, column by column, exactly as SQLite stores it.
async fn read_row(db: &impl ConnectionTrait, columns: &mut Columns, table: &str, id: &str) -> Result<Option<Row>, DbErr> {
    let pairs: Vec<String> = columns.of(db, table).await?.iter().map(|c| format!(r#"'{c}', "{c}""#)).collect();
    let query = format!(r#"SELECT json_object({}) AS j FROM "{table}" WHERE id = ?"#, pairs.join(", "));
    let Some(row) = db.query_one_raw(sql(&query, [id.into()])).await? else {
        return Ok(None);
    };
    Ok(serde_json::from_str(&row.try_get::<String>("", "j")?).ok())
}

async fn read_base(db: &impl ConnectionTrait, table: &str, id: &str) -> Result<Option<Row>, DbErr> {
    let row = db
        .query_one_raw(sql("SELECT data FROM sync_base WHERE table_name = ? AND row_id = ?", [table.into(), id.into()]))
        .await?;
    Ok(match row {
        Some(row) => serde_json::from_str(&row.try_get::<String>("", "data")?).ok(),
        None => None,
    })
}

async fn write_base(db: &impl ConnectionTrait, table: &str, id: &str, row: &Row) -> Result<(), DbErr> {
    let data = Value::Object(row.clone()).to_string();
    db.execute_raw(sql(
        "INSERT INTO sync_base (table_name, row_id, data) VALUES (?, ?, ?)
         ON CONFLICT (table_name, row_id) DO UPDATE SET data = excluded.data",
        [table.into(), id.into(), data.into()],
    ))
    .await?;
    Ok(())
}

async fn is_dirty(db: &impl ConnectionTrait, table: &str, id: &str) -> Result<bool, DbErr> {
    let row = db
        .query_one_raw(sql("SELECT 1 AS x FROM sync_outbox WHERE table_name = ? AND row_id = ?", [table.into(), id.into()]))
        .await?;
    Ok(row.is_some())
}

async fn count(db: &impl ConnectionTrait, query: &str) -> Result<i64, DbErr> {
    let row = db.query_one_raw(sql(query, [])).await?;
    Ok(match row {
        Some(row) => row.try_get("", "n")?,
        None => 0,
    })
}

/// JSON values go back into SQLite as the same types `json_object` read them as.
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

fn sql<const N: usize>(query: &str, values: [SqlValue; N]) -> Statement {
    Statement::from_sql_and_values(DbBackend::Sqlite, query, values)
}
