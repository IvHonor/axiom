//! A copy of this computer's data, taken just before a sign-in choice (see
//! `local::Link`) changes it, so a wrong choice can be undone for a week.
//!
//! The copy is the whole SQLite file (`VACUUM INTO`). Bringing it back puts
//! its synced rows back over what's here, as edits made just now, so they go
//! up to the account too. Rows made since the copy are kept.

use std::path::{Path, PathBuf};

use chrono::{DateTime, NaiveDateTime, TimeDelta, Utc};
use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbBackend, DbErr, Statement, TransactionTrait};
use serde::Serialize;
use serde_json::Value;

use super::TABLES;

/// How long copies are kept.
const KEEP_FOR: TimeDelta = TimeDelta::days(7);
const PREFIX: &str = "before-sign-in-";
const STAMP: &str = "%Y-%m-%dT%H-%M-%S%.3f";

/// A copy on disk. Mirrored by `SyncBackup` in `src/lib/sync.ts`.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Backup {
    pub at: DateTime<Utc>,
    #[serde(skip)]
    pub path: PathBuf,
}

/// Copies the database into `folder`, and clears out copies older than a week.
pub async fn take(db: &impl ConnectionTrait, folder: &Path) -> Result<Backup, DbErr> {
    std::fs::create_dir_all(folder).map_err(|e| DbErr::Custom(format!("Can't create {}: {e}", folder.display())))?;
    prune(folder);
    let at = Utc::now();
    let path = folder.join(format!("{PREFIX}{}.db", at.format(STAMP)));
    // VACUUM INTO won't overwrite; a leftover with this exact name is stale.
    let _ = std::fs::remove_file(&path);
    let target = path.to_string_lossy().replace('\'', "''");
    db.execute_unprepared(&format!("VACUUM INTO '{target}'")).await?;
    Ok(Backup { at, path })
}

/// The newest copy still kept, if any.
pub fn latest(folder: &Path) -> Option<Backup> {
    all(folder).into_iter().filter(|b| Utc::now() - b.at < KEEP_FOR).max_by_key(|b| b.at)
}

fn all(folder: &Path) -> Vec<Backup> {
    let Ok(entries) = std::fs::read_dir(folder) else { return Vec::new() };
    entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let stamp = name.strip_prefix(PREFIX)?.strip_suffix(".db")?;
            let at = NaiveDateTime::parse_from_str(stamp, STAMP).ok()?.and_utc();
            Some(Backup { at, path: entry.path() })
        })
        .collect()
}

fn prune(folder: &Path) {
    for old in all(folder).into_iter().filter(|b| Utc::now() - b.at >= KEEP_FOR) {
        let _ = std::fs::remove_file(old.path);
    }
}

/// Puts the copy's synced rows back. Returns how many rows it wrote.
pub async fn restore(db: &DatabaseConnection, backup: &Backup) -> Result<usize, DbErr> {
    let url = format!("sqlite://{}?mode=ro", backup.path.to_string_lossy().replace('\\', "/"));
    let mut options = ConnectOptions::new(url);
    options.max_connections(1).sqlx_logging(false);
    let copy = Database::connect(options).await?;

    let txn = db.begin().await?;
    // Parents and children come back in table order; check links at the end.
    txn.execute_unprepared("PRAGMA defer_foreign_keys = ON").await?;
    let mut restored = 0;
    for table in TABLES.iter() {
        // Only columns both have: the copy may be from an older Axiom.
        let here = columns(&txn, table).await?;
        let shared: Vec<String> = columns(&copy, table).await?.into_iter().filter(|c| here.contains(c)).collect();
        if !shared.contains(&"id".to_owned()) {
            continue;
        }
        let pairs: Vec<String> = shared.iter().map(|c| format!(r#"'{c}', "{c}""#)).collect();
        let rows = copy.query_all_raw(sql(&format!(r#"SELECT json_object({}) AS j FROM "{table}""#, pairs.join(", ")))).await?;
        let names: Vec<String> = shared.iter().map(|c| format!(r#""{c}""#)).collect();
        let updates: Vec<String> = names.iter().map(|n| format!("{n} = excluded.{n}")).collect();
        let statement = format!(
            r#"INSERT INTO "{table}" ({}) VALUES ({}) ON CONFLICT (id) DO UPDATE SET {}"#,
            names.join(", "),
            vec!["?"; names.len()].join(", "),
            updates.join(", "),
        );
        for row in rows {
            let Ok(Value::Object(row)) = serde_json::from_str::<Value>(&row.try_get::<String>("", "j")?) else { continue };
            let values = shared.iter().map(|c| super::local::to_sql(row.get(c).unwrap_or(&Value::Null))).collect::<Vec<_>>();
            // The change triggers queue each row, so it syncs as a new edit.
            txn.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite, &statement, values)).await?;
            restored += 1;
        }
    }
    txn.commit().await?;
    copy.close().await?;
    Ok(restored)
}

async fn columns(db: &impl ConnectionTrait, table: &str) -> Result<Vec<String>, DbErr> {
    let rows = db
        .query_all_raw(Statement::from_sql_and_values(DbBackend::Sqlite, "SELECT name FROM pragma_table_info(?)", [table.into()]))
        .await?;
    rows.iter().map(|r| r.try_get::<String>("", "name")).collect()
}

fn sql(query: &str) -> Statement {
    Statement::from_string(DbBackend::Sqlite, query)
}
