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

use super::{LOCAL_COLUMNS, TABLES};
use crate::vault::DataKey;

type Row = Map<String, Value>;

/// The current time in Unix milliseconds, as SQLite computes it.
const NOW_MS: &str = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";

/// Adds triggers that note every insert and update in `sync_outbox`. Run at
/// every startup; existing triggers are left alone. (Deletes are soft, so
/// they're updates too.)
pub async fn install_triggers(db: &impl ConnectionTrait) -> Result<(), DbErr> {
    for table in TABLES.iter() {
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

/// Queues rows the server has never had, on a computer linked to an
/// account: rows of a table that has only just started syncing, made before
/// it did. Run at every startup, after `install_triggers`.
pub async fn backfill(db: &impl ConnectionTrait) -> Result<(), DbErr> {
    if state(db).await?.user_id.is_none() {
        return Ok(());
    }
    for table in TABLES.iter() {
        db.execute_unprepared(&format!(
            r#"INSERT INTO sync_outbox (table_name, row_id, changed_at, version)
               SELECT '{table}', id, {NOW_MS}, 1 FROM "{table}"
               WHERE id NOT IN (SELECT row_id FROM sync_base WHERE table_name = '{table}')
               ON CONFLICT (table_name, row_id) DO NOTHING"#
        ))
        .await?;
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
    // Settings alone aren't worth asking about before linking an account.
    for table in TABLES.iter().filter(|t| !t.ends_with("_settings")) {
        total += count(db, &format!(r#"SELECT COUNT(*) AS n FROM "{table}" WHERE deleted_at IS NULL"#)).await?;
    }
    Ok(total)
}

/// Rows that aren't deleted in one synced table.
pub async fn count_live(db: &impl ConnectionTrait, table: &str) -> Result<i64, DbErr> {
    if !TABLES.contains(&table) {
        return Ok(0);
    }
    count(db, &format!(r#"SELECT COUNT(*) AS n FROM "{table}" WHERE deleted_at IS NULL"#)).await
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
    // Shared boards belong to the account this computer was linked to; they
    // come back if the new account is on them too, and never get merged in.
    for board in super::spaces::list(&txn).await? {
        super::spaces::remove_board(&txn, &board.id).await?;
    }
    if how == Link::Replace {
        clear_tables(&txn).await?;
    }
    txn.execute_unprepared("DELETE FROM sync_base; DELETE FROM sync_outbox; DELETE FROM sync_locked;").await?;
    if how == Link::Merge {
        for table in TABLES.iter() {
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
        "DELETE FROM sync_base; DELETE FROM sync_outbox; DELETE FROM sync_spaces; DELETE FROM sync_locked;
         UPDATE sync_state SET user_id = NULL, cursor = 0, last_synced_at = NULL WHERE id = 1;",
    )
    .await?;
    txn.commit().await
}

/// Stops syncing this computer's data with any account, keeping the data.
/// Used after the account is deleted.
pub async fn unlink(db: &impl ConnectionTrait) -> Result<(), DbErr> {
    db.execute_unprepared(
        "DELETE FROM sync_base; DELETE FROM sync_outbox; DELETE FROM sync_spaces; DELETE FROM sync_locked;
         UPDATE sync_state SET user_id = NULL, cursor = 0, last_synced_at = NULL WHERE id = 1;",
    )
    .await?;
    Ok(())
}

/// Every row that isn't deleted, table by table, for exporting.
pub async fn export(db: &impl ConnectionTrait) -> Result<Map<String, Value>, DbErr> {
    let mut columns = Columns::default();
    let mut tables = Map::new();
    for table in TABLES.iter() {
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
    for table in TABLES.iter() {
        db.execute_unprepared(&format!(r#"DELETE FROM "{table}""#)).await?;
    }
    Ok(())
}

/// A row waiting to be pushed, with the full row as it is now.
pub struct Outgoing {
    pub table: String,
    pub id: String,
    version: i64,
    /// The whole row as it is now (None if it's gone).
    pub row: Option<Row>,
    pub change: Option<Change>,
}

/// Up to `limit` changed rows, each reduced to the fields that differ from
/// what the server last saw.
/// Rows of the `held` tables stay queued (encrypted ones, while locked).
pub async fn outgoing(db: &impl ConnectionTrait, limit: usize, held: &[&str]) -> Result<Vec<Outgoing>, DbErr> {
    // Table names are plain identifiers from TABLES, safe to put in the query.
    let except = match held {
        [] => String::new(),
        _ => format!("WHERE table_name NOT IN ({})", held.iter().map(|t| format!("'{t}'")).collect::<Vec<_>>().join(", ")),
    };
    let query = format!("SELECT table_name, row_id, changed_at, version FROM sync_outbox {except} ORDER BY changed_at LIMIT ?");
    let pending = db.query_all_raw(sql(&query, [(limit as i64).into()])).await?;
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
#[cfg(test)]
pub async fn apply(db: &DatabaseConnection, records: &[Record], cursor: Cursor<'_>) -> Result<usize, DbErr> {
    apply_some(db, records.iter().collect(), cursor).await
}

/// Where a page of pulled records came from, so its cursor moves.
pub enum Cursor<'a> {
    Account(i64),
    Board(&'a str, i64),
}

/// Like `apply`, for records already checked by the caller.
pub async fn apply_some(db: &DatabaseConnection, records: Vec<&Record>, cursor: Cursor<'_>) -> Result<usize, DbErr> {
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
        // Every check above and below is on `record.id`, so the row written
        // must be that one, not whatever `id` its data names.
        if record.data.get("id").and_then(Value::as_str) != Some(record.id.as_str()) {
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
    match cursor {
        Cursor::Account(at) => {
            txn.execute_raw(sql("UPDATE sync_state SET cursor = ? WHERE id = 1", [at.into()])).await?;
        }
        Cursor::Board(id, at) => super::spaces::set_cursor(&txn, id, at).await?,
    }
    txn.commit().await?;
    Ok(applied)
}

/// The synced column names per table (all but its `LOCAL_COLUMNS`), read
/// from SQLite once per sync.
#[derive(Default)]
struct Columns(HashMap<String, Vec<String>>);

impl Columns {
    async fn of(&mut self, db: &impl ConnectionTrait, table: &str) -> Result<&Vec<String>, DbErr> {
        if !self.0.contains_key(table) {
            let local: &[&str] = LOCAL_COLUMNS.iter().find(|(t, _)| *t == table).map_or(&[], |(_, columns)| columns);
            let rows = db.query_all_raw(sql("SELECT name FROM pragma_table_info(?)", [table.into()])).await?;
            let names: Vec<String> = rows.iter().map(|r| r.try_get::<String>("", "name")).collect::<Result<_, _>>()?;
            self.0.insert(table.to_owned(), names.into_iter().filter(|n| !local.contains(&n.as_str())).collect());
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

/// Whether this computer syncs by itself (see `migrations::AutoSync`).
pub async fn auto_sync(db: &impl ConnectionTrait) -> Result<bool, DbErr> {
    let row = db.query_one_raw(sql("SELECT auto FROM sync_state WHERE id = 1", [])).await?;
    Ok(row.map_or(Ok(1), |r| r.try_get::<i32>("", "auto"))? != 0)
}

pub async fn set_auto_sync(db: &impl ConnectionTrait, on: bool) -> Result<(), DbErr> {
    db.execute_raw(sql("UPDATE sync_state SET auto = ? WHERE id = 1", [i32::from(on).into()])).await?;
    Ok(())
}

// ---------- Encrypted tables (see `crate::vault`) ----------

/// Opens pulled records of encrypted tables with the key. Without it they're
/// set aside in `sync_locked` until this computer is unlocked; with it, one
/// that won't open (sealed with an older key, or tampered with) is dropped.
pub async fn open_or_stash(db: &impl ConnectionTrait, key: Option<&DataKey>, records: &[Record]) -> Result<Vec<Record>, DbErr> {
    let mut out = Vec::with_capacity(records.len());
    for record in records {
        if !super::ENCRYPTED.contains(&record.table.as_str()) {
            out.push(record.clone());
            continue;
        }
        match key {
            Some(key) => match key.open_fields(&record.table, &record.id, &record.data) {
                Ok(data) => out.push(Record { data, ..record.clone() }),
                Err(_) => eprintln!("sync: couldn't decrypt {}/{}; it was sealed with another key", record.table, record.id),
            },
            None => {
                db.execute_raw(sql(
                    "INSERT INTO sync_locked (table_name, row_id, data, seq) VALUES (?, ?, ?, ?)
                     ON CONFLICT (table_name, row_id) DO UPDATE SET data = excluded.data, seq = excluded.seq",
                    [record.table.as_str().into(), record.id.as_str().into(), Value::Object(record.data.clone()).to_string().into(), record.seq.into()],
                ))
                .await?;
            }
        }
    }
    Ok(out)
}

/// Applies what arrived while locked, now the key's here. Returns how many rows changed.
pub async fn apply_stash(db: &DatabaseConnection, key: &DataKey) -> Result<usize, DbErr> {
    let rows = db.query_all_raw(sql("SELECT table_name, row_id, data, seq FROM sync_locked ORDER BY seq", [])).await?;
    let mut records = Vec::new();
    for row in rows {
        let data: String = row.try_get("", "data")?;
        let Ok(Value::Object(data)) = serde_json::from_str::<Value>(&data) else { continue };
        records.push(Record { table: row.try_get("", "table_name")?, id: row.try_get("", "row_id")?, data, seq: row.try_get("", "seq")? });
    }
    let opened = open_or_stash(db, Some(key), &records).await?;
    let cursor = state(db).await?.cursor;
    let applied = apply_some(db, opened.iter().collect(), Cursor::Account(cursor)).await?;
    forget_stash(db).await?;
    Ok(applied)
}

pub async fn forget_stash(db: &impl ConnectionTrait) -> Result<(), DbErr> {
    db.execute_unprepared("DELETE FROM sync_locked").await?;
    Ok(())
}

/// Sends every row of these tables again, as if new: after starting over
/// with a new key, the account's copy is replaced with this computer's.
pub async fn requeue(db: &impl ConnectionTrait, tables: &[&str]) -> Result<(), DbErr> {
    for table in tables {
        db.execute_raw(sql("DELETE FROM sync_base WHERE table_name = ?", [(*table).into()])).await?;
        db.execute_unprepared(&format!(
            r#"INSERT INTO sync_outbox (table_name, row_id, changed_at, version)
               SELECT '{table}', id, {NOW_MS}, 1 FROM "{table}" WHERE true
               ON CONFLICT (table_name, row_id) DO UPDATE SET version = sync_outbox.version + 1"#
        ))
        .await?;
    }
    Ok(())
}
