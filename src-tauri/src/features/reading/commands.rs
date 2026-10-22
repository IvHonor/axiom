//! Tauri commands for the Reading Tracker, wrapped by
//! `src/features/reading/api.ts`. Days arrive as "YYYY-MM-DD" in the user's
//! own time zone.

use sea_orm::prelude::Date;
use tauri::State;

use super::entities::note;
use super::library::{Edition, Found, OpenLibrary};
use super::service;
use super::types::{BookCard, BookDetail, BookFields, EditionChoice, NewBook, NoteFields, NoteHit, ReadingStats, ReadingSummary};
use crate::db::Db;
use crate::error::Result;

#[tauri::command]
pub async fn reading_search(library: State<'_, OpenLibrary>, query: String) -> Result<Vec<Found>> {
    library.search(&query).await
}

#[tauri::command]
pub async fn reading_editions(library: State<'_, OpenLibrary>, work_key: String) -> Result<Vec<Edition>> {
    library.editions(&work_key).await
}

#[tauri::command]
pub async fn reading_cover(library: State<'_, OpenLibrary>, url: String) -> Result<String> {
    library.cover_image(&url).await
}

#[tauri::command]
pub async fn reading_list(db: State<'_, Db>, today: Date) -> Result<Vec<BookCard>> {
    service::list_books(&db.conn().await?, today).await
}

#[tauri::command]
pub async fn reading_get(db: State<'_, Db>, id: String, today: Date) -> Result<BookDetail> {
    service::get_book(&db.conn().await?, &id, today).await
}

#[tauri::command]
pub async fn reading_add(db: State<'_, Db>, book: NewBook, today: Date) -> Result<BookCard> {
    service::add_book(&db.conn().await?, book, today).await
}

#[tauri::command]
pub async fn reading_update(db: State<'_, Db>, id: String, fields: BookFields, today: Date) -> Result<BookCard> {
    service::update_book(&db.conn().await?, &id, fields, today).await
}

#[tauri::command]
pub async fn reading_choose_edition(db: State<'_, Db>, id: String, edition: EditionChoice, today: Date) -> Result<BookCard> {
    service::choose_edition(&db.conn().await?, &id, edition, today).await
}

#[tauri::command]
pub async fn reading_set_status(db: State<'_, Db>, id: String, status: String, today: Date) -> Result<BookCard> {
    service::set_status(&db.conn().await?, &id, &status, today).await
}

#[tauri::command]
pub async fn reading_log_progress(db: State<'_, Db>, id: String, progress: i32, minutes: Option<i32>, today: Date) -> Result<BookCard> {
    service::log_progress(&db.conn().await?, &id, progress, minutes, today).await
}

#[tauri::command]
pub async fn reading_read_again(db: State<'_, Db>, id: String, today: Date) -> Result<BookCard> {
    service::read_again(&db.conn().await?, &id, today).await
}

#[tauri::command]
pub async fn reading_move(db: State<'_, Db>, id: String, before_id: Option<String>, today: Date) -> Result<BookCard> {
    service::move_book(&db.conn().await?, &id, before_id.as_deref(), today).await
}

#[tauri::command]
pub async fn reading_delete(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_book(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn reading_delete_session(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_session(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn reading_add_note(db: State<'_, Db>, book_id: String, fields: NoteFields) -> Result<note::Model> {
    service::add_note(&db.conn().await?, &book_id, fields).await
}

#[tauri::command]
pub async fn reading_update_note(db: State<'_, Db>, id: String, fields: NoteFields) -> Result<note::Model> {
    service::update_note(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn reading_delete_note(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_note(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn reading_search_notes(db: State<'_, Db>, query: String) -> Result<Vec<NoteHit>> {
    service::search_notes(&db.conn().await?, &query).await
}

#[tauri::command]
pub async fn reading_set_goal(db: State<'_, Db>, year: i32, books: i32) -> Result<()> {
    service::set_goal(&db.conn().await?, year, books).await
}

#[tauri::command]
pub async fn reading_summary(db: State<'_, Db>, today: Date) -> Result<ReadingSummary> {
    service::summary(&db.conn().await?, today).await
}

#[tauri::command]
pub async fn reading_stats(db: State<'_, Db>, year: i32, today: Date) -> Result<ReadingStats> {
    service::stats(&db.conn().await?, year, today).await
}
