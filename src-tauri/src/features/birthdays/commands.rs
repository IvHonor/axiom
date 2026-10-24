//! Tauri commands for Birthdays, wrapped by `src/features/birthdays/api.ts`.
//! Days arrive as "YYYY-MM-DD" in the user's own time zone.

use sea_orm::prelude::Date;
use tauri::{AppHandle, Manager, State};

use super::entities::gift;
use super::service;
use super::types::{GiftFields, ImportReport, PersonDetail, PersonFields, PersonView};
use crate::db::Db;
use crate::error::{Error, Result};

#[tauri::command]
pub async fn birthdays_list(db: State<'_, Db>, today: Date) -> Result<Vec<PersonView>> {
    service::list(&db.conn().await?, today).await
}

#[tauri::command]
pub async fn birthdays_get(db: State<'_, Db>, id: String, today: Date) -> Result<PersonDetail> {
    service::get(&db.conn().await?, &id, today).await
}

#[tauri::command]
pub async fn birthdays_create(db: State<'_, Db>, fields: PersonFields, today: Date) -> Result<PersonView> {
    service::create(&db.conn().await?, fields, today).await
}

#[tauri::command]
pub async fn birthdays_update(db: State<'_, Db>, id: String, fields: PersonFields, today: Date) -> Result<PersonView> {
    service::update(&db.conn().await?, &id, fields, today).await
}

#[tauri::command]
pub async fn birthdays_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn birthdays_gift_add(db: State<'_, Db>, person_id: String, fields: GiftFields, today: Date) -> Result<gift::Model> {
    service::add_gift(&db.conn().await?, &person_id, fields, today).await
}

#[tauri::command]
pub async fn birthdays_gift_update(db: State<'_, Db>, id: String, fields: GiftFields, today: Date) -> Result<gift::Model> {
    service::update_gift(&db.conn().await?, &id, fields, today).await
}

#[tauri::command]
pub async fn birthdays_gift_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_gift(&db.conn().await?, &id).await
}

/// Adds the birthdays and anniversaries in a contacts file (its text).
#[tauri::command]
pub async fn birthdays_import(db: State<'_, Db>, text: String, today: Date) -> Result<ImportReport> {
    service::import_vcard(&db.conn().await?, &text, today).await
}

/// Saves everyone as a calendar file in Downloads. Returns where.
#[tauri::command]
pub async fn birthdays_export(app: AppHandle, db: State<'_, Db>, today: Date) -> Result<String> {
    let ics = service::calendar(&db.conn().await?, today).await?;
    let folder = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| Error::Invalid(format!("Couldn't find your Downloads folder: {e}")))?;
    let file = folder.join("axiom-birthdays.ics");
    std::fs::write(&file, ics).map_err(|e| Error::Invalid(format!("Couldn't save {}: {e}", file.display())))?;
    Ok(file.to_string_lossy().into_owned())
}
