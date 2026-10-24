//! Notification commands for React, wrapped by `src/lib/notifications.ts`.

use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect};
use tauri::{AppHandle, Emitter, State};

use super::entities::note;
use super::kinds::{KINDS, Kind};
use super::runner::{Notifier, sends};
use super::settings::{self, Channels};
use super::CHANGED_EVENT;
use crate::db::Db;
use crate::error::Result;

/// How many notifications the list shows.
const LIST: u64 = 50;

#[tauri::command]
pub fn notifications_kinds() -> Vec<Kind> {
    KINDS.to_vec()
}

#[tauri::command]
pub async fn notifications_settings(db: State<'_, Db>) -> Result<Vec<Channels>> {
    settings::all(&db.conn().await?).await
}

/// Switches one channel ("in_app", "desktop" or "email") of one notification.
#[tauri::command]
pub async fn notifications_set(db: State<'_, Db>, notifier: State<'_, Notifier>, kind: String, channel: String, on: bool) -> Result<Channels> {
    let changed = settings::set(&db.conn().await?, &kind, &channel, on).await?;
    notifier.wake();
    Ok(changed)
}

/// Which extensions are switched off: they send nothing, and what they sent
/// before leaves the list. The app calls this as it opens and whenever one
/// is switched.
#[tauri::command]
pub fn notifications_set_off(app: AppHandle, notifier: State<'_, Notifier>, extensions: Vec<String>) {
    notifier.set_off(extensions.into_iter().collect());
    let _ = app.emit(CHANGED_EVENT, ());
}

/// The notifications listed in the app, newest first, leaving out any from
/// extensions that are switched off.
#[tauri::command]
pub async fn notifications_list(db: State<'_, Db>, notifier: State<'_, Notifier>) -> Result<Vec<note::Model>> {
    let off = notifier.off().unwrap_or_default();
    let mut notes = note::Entity::find().filter(note::Column::InApp.eq(true)).order_by_desc(note::Column::CreatedAt).limit(LIST).all(&db.conn().await?).await?;
    notes.retain(|n| sends(&n.kind, &off));
    Ok(notes)
}

/// Marks one notification as read, or all of them.
#[tauri::command]
pub async fn notifications_read(app: AppHandle, db: State<'_, Db>, id: Option<String>) -> Result<()> {
    let mut update = note::Entity::update_many().col_expr(note::Column::ReadAt, Expr::value(Some(Utc::now()))).filter(note::Column::ReadAt.is_null());
    if let Some(id) = id {
        update = update.filter(note::Column::Id.eq(id));
    }
    update.exec(&db.conn().await?).await?;
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(())
}

/// Clears one notification from the list, or all of them. They don't come
/// back: each comes once a day.
#[tauri::command]
pub async fn notifications_dismiss(app: AppHandle, db: State<'_, Db>, id: Option<String>) -> Result<()> {
    let mut update = note::Entity::update_many().col_expr(note::Column::InApp, Expr::value(false));
    if let Some(id) = id {
        update = update.filter(note::Column::Id.eq(id));
    }
    update.exec(&db.conn().await?).await?;
    let _ = app.emit(CHANGED_EVENT, ());
    Ok(())
}
