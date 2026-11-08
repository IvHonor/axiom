//! The profile: how someone has Axiom set up, as opposed to what they keep
//! in it. Their theme, Overview layout, sidebar order, extensions, Lemma's
//! look and personality, and how each view is arranged.
//!
//! Each setting is one row (its id is the setting's name, e.g. "theme"),
//! holding its value as JSON, so it syncs to the person's other computers
//! like any other row: the newest change to a setting wins. What each
//! computer keeps to itself (open tabs, the microphone) stays in the
//! window's local storage instead. The app decides which is which (see
//! `src/lib/settings.ts`).

pub mod migrations;
#[cfg(test)]
mod tests;

use chrono::Utc;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use serde_json::{Map, Value};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result};

/// Not encrypted: none of it is private, and the window's look shouldn't
/// wait for this computer to be unlocked.
pub const SYNCED_TABLES: &[&str] = &["profile_settings"];

/// Bigger than any layout; stops a mistake filling the account.
const MAX_VALUE_BYTES: usize = 32 * 1024;

/// Every setting saved, by name.
pub async fn all(db: &impl ConnectionTrait) -> Result<Map<String, Value>> {
    let rows = db
        .query_all_raw(Statement::from_string(DbBackend::Sqlite, "SELECT id, value FROM profile_settings WHERE deleted_at IS NULL"))
        .await?;
    let mut settings = Map::new();
    for row in rows {
        let (id, value): (String, String) = (row.try_get("", "id")?, row.try_get("", "value")?);
        // A value this version can't read is left for the app's defaults.
        if let Ok(value) = serde_json::from_str(&value) {
            settings.insert(id, value);
        }
    }
    Ok(settings)
}

/// Saves one setting. Saving what's already there changes nothing, so it
/// isn't synced again.
pub async fn set(db: &impl ConnectionTrait, name: &str, value: &Value) -> Result<()> {
    if !axiom_protocol::is_record_id(name) {
        return Err(Error::Invalid(format!("Not a setting: {name}")));
    }
    let json = value.to_string();
    if json.len() > MAX_VALUE_BYTES {
        return Err(Error::Invalid("That setting is too big to save.".into()));
    }
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO profile_settings (id, value, updated_at, deleted_at) VALUES (?, ?, ?, NULL)
         ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted_at = NULL
         WHERE profile_settings.value IS NOT excluded.value OR profile_settings.deleted_at IS NOT NULL",
        [name.into(), json.into(), Utc::now().into()],
    ))
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn profile_settings(db: State<'_, Db>) -> Result<Map<String, Value>> {
    all(&db.conn().await?).await
}

#[tauri::command]
pub async fn profile_set(db: State<'_, Db>, name: String, value: Value) -> Result<()> {
    let conn: DatabaseConnection = db.conn().await?;
    set(&conn, &name, &value).await
}
