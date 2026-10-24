//! Tauri commands for Finance, wrapped by `src/features/finance/api.ts`.
//! Days arrive as "YYYY-MM-DD" in the user's own time zone.

use base64::Engine;
use sea_orm::prelude::Date;
use sea_orm::EntityTrait;
use tauri::State;

use super::entities::{account, category, recurring, transaction};
use super::import::{self, CommitRow, Preview};
use super::rates::{self, Rates};
use super::types::{AccountFields, CategoryFields, FinanceState, MonthSummary, QuickEntry, RecurringFields, TransactionFields, TransactionFilter, TransactionRow};
use super::{quick, service};
use crate::db::Db;
use crate::error::{Error, Result};

#[tauri::command]
pub async fn finance_state(db: State<'_, Db>, today: Date) -> Result<FinanceState> {
    service::state(&db.conn().await?, today).await
}

#[tauri::command]
pub async fn finance_setup(db: State<'_, Db>, home_currency: String, account: AccountFields, today: Date) -> Result<FinanceState> {
    service::setup(&db.conn().await?, &home_currency, account, today).await
}

#[tauri::command]
pub async fn finance_set_home_currency(db: State<'_, Db>, rates: State<'_, Rates>, code: String, today: Date) -> Result<()> {
    let conn = db.conn().await?;
    service::set_home_currency(&conn, &code).await?;
    // Offline is fine: they convert next time.
    let _ = rates::fill(&conn, &rates, today).await;
    Ok(())
}

/// Converts what's waiting to the home currency (needs the internet).
/// Returns how many were converted.
#[tauri::command]
pub async fn finance_convert(db: State<'_, Db>, rates: State<'_, Rates>, today: Date) -> Result<usize> {
    rates::fill(&db.conn().await?, &rates, today).await
}

#[tauri::command]
pub async fn finance_add_account(db: State<'_, Db>, fields: AccountFields) -> Result<account::Model> {
    service::add_account(&db.conn().await?, fields).await
}

#[tauri::command]
pub async fn finance_update_account(db: State<'_, Db>, id: String, fields: AccountFields) -> Result<account::Model> {
    service::update_account(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn finance_archive_account(db: State<'_, Db>, id: String, archived: bool) -> Result<account::Model> {
    service::archive_account(&db.conn().await?, &id, archived).await
}

#[tauri::command]
pub async fn finance_delete_account(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_account(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn finance_add_category(db: State<'_, Db>, fields: CategoryFields) -> Result<category::Model> {
    service::add_category(&db.conn().await?, fields).await
}

#[tauri::command]
pub async fn finance_update_category(db: State<'_, Db>, id: String, fields: CategoryFields) -> Result<category::Model> {
    service::update_category(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn finance_delete_category(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_category(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn finance_transactions(db: State<'_, Db>, filter: TransactionFilter) -> Result<Vec<TransactionRow>> {
    service::list_transactions(&db.conn().await?, filter).await
}

#[tauri::command]
pub async fn finance_add_transaction(db: State<'_, Db>, fields: TransactionFields) -> Result<Vec<transaction::Model>> {
    service::add_transaction(&db.conn().await?, fields).await
}

#[tauri::command]
pub async fn finance_update_transaction(db: State<'_, Db>, id: String, fields: TransactionFields) -> Result<Vec<transaction::Model>> {
    service::update_transaction(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn finance_set_category(db: State<'_, Db>, id: String, category_id: Option<String>) -> Result<transaction::Model> {
    service::set_category(&db.conn().await?, &id, category_id).await
}

#[tauri::command]
pub async fn finance_delete_transaction(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_transaction(&db.conn().await?, &id).await
}

/// Reads a quick entry without saving it, to show what it'll add.
#[tauri::command]
pub async fn finance_quick(db: State<'_, Db>, text: String, today: Date, month_first: bool) -> Result<QuickEntry> {
    let conn = db.conn().await?;
    let home = service::home(&conn).await?;
    let accounts = account::Entity::find().all(&conn).await?.into_iter().filter(|a| a.deleted_at.is_none()).collect::<Vec<_>>();
    let categories = category::Entity::find().all(&conn).await?.into_iter().filter(|c| c.deleted_at.is_none()).collect::<Vec<_>>();
    // What was learned about the payee, worked out from the text without the amount.
    let rough: String = text.split_whitespace().filter(|w| !w.chars().any(|c| c.is_ascii_digit())).collect::<Vec<_>>().join(" ");
    let learned = service::suggest(&conn, &rough).await?;
    Ok(quick::read(&text, today, &home, &accounts, &categories, learned, month_first))
}

#[tauri::command]
pub async fn finance_add_recurring(db: State<'_, Db>, fields: RecurringFields) -> Result<recurring::Model> {
    service::add_recurring(&db.conn().await?, fields).await
}

#[tauri::command]
pub async fn finance_update_recurring(db: State<'_, Db>, id: String, fields: RecurringFields) -> Result<recurring::Model> {
    service::update_recurring(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn finance_delete_recurring(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_recurring(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn finance_confirm(db: State<'_, Db>, id: String, day: Date, amount: Option<i64>) -> Result<transaction::Model> {
    service::confirm(&db.conn().await?, &id, day, amount).await
}

#[tauri::command]
pub async fn finance_skip(db: State<'_, Db>, id: String, day: Date) -> Result<()> {
    service::skip(&db.conn().await?, &id, day).await
}

#[tauri::command]
pub async fn finance_month(db: State<'_, Db>, month: String, today: Date) -> Result<MonthSummary> {
    service::month_summary(&db.conn().await?, &month, today).await
}

fn bytes_of(contents: &str) -> Result<Vec<u8>> {
    base64::engine::general_purpose::STANDARD.decode(contents).map_err(|_| Error::Invalid("That file couldn't be read.".into()))
}

/// Reads a statement (base64) into a preview. Nothing's saved yet.
#[tauri::command]
pub async fn finance_import_preview(db: State<'_, Db>, account_id: String, file_name: String, contents: String, mapping: Option<import::csv::Mapping>) -> Result<Preview> {
    let bytes = bytes_of(&contents)?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err(Error::Invalid("That file's too big for a statement (over 20 MB).".into()));
    }
    import::preview(&db.conn().await?, &account_id, &file_name, &bytes, mapping).await
}

/// Saves the chosen rows. For a CSV, the layout's remembered for that bank.
/// Returns (added, linked to ones entered by hand).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn finance_import_commit(
    db: State<'_, Db>,
    rates: State<'_, Rates>,
    account_id: String,
    rows: Vec<CommitRow>,
    file_name: String,
    contents: Option<String>,
    mapping: Option<import::csv::Mapping>,
    bank: Option<String>,
    today: Date,
) -> Result<(u32, u32)> {
    let conn = db.conn().await?;
    let layout = match (contents, mapping) {
        (Some(contents), Some(mapping)) => {
            let table = import::csv::read(&import::decode(&bytes_of(&contents)?));
            let name = bank.filter(|b| !b.trim().is_empty()).unwrap_or(file_name);
            Some((import::csv::signature(&table, mapping.header_row), mapping, name))
        }
        _ => None,
    };
    let saved = import::commit(&conn, &account_id, rows, layout).await?;
    let _ = rates::fill(&conn, &rates, today).await;
    Ok(saved)
}
