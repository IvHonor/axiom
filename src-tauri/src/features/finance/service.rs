//! Finance's logic: every query and change, independent of Tauri so it can
//! be tested on its own (see `tests.rs`).
//!
//! "Today" comes from the frontend, so it always matches what the user sees.

use std::collections::{HashMap, HashSet};

use chrono::{Datelike, Days, Months, NaiveDate, Utc};
use sea_orm::prelude::{Date, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Select, Set, TransactionTrait};

use super::entities::{account, category, recurring, rule, settings, transaction};
use super::money;
use super::rates;
use super::types::{
    AccountCard, AccountFields, CategoryFields, CategorySpend, Due, FinanceState, MonthSummary, MonthTotals, RecurringFields, TransactionFields,
    TransactionFilter, TransactionRow,
};
use crate::db::new_id;
use crate::error::{Error, Result};

pub const SETTINGS_ID: &str = "settings";
pub const ACCOUNT_KINDS: &[&str] = &["current", "savings", "credit", "cash", "other"];
pub const EVERY: &[&str] = &["week", "month", "year"];
pub const COLORS: &[&str] = &["blue", "teal", "green", "lime", "yellow", "amber", "orange", "red", "pink", "purple", "slate"];
/// Recurring items this far overdue still ask to be confirmed.
const DUE_LOOKBACK_DAYS: u64 = 62;
/// And these come up a few days early.
const DUE_AHEAD_DAYS: u64 = 3;

/// The categories everyone starts with. Fixed ids, so two computers setting
/// up make the same ones (and sync merges them) rather than two sets.
const DEFAULT_CATEGORIES: &[(&str, &str, &str, &str, &str)] = &[
    ("cat-groceries", "Groceries", "expense", "🛒", "green"),
    ("cat-eating-out", "Eating out", "expense", "🍽️", "orange"),
    ("cat-transport", "Transport", "expense", "🚆", "blue"),
    ("cat-housing", "Rent & mortgage", "expense", "🏠", "purple"),
    ("cat-bills", "Bills & utilities", "expense", "💡", "amber"),
    ("cat-subscriptions", "Subscriptions", "expense", "🔁", "pink"),
    ("cat-shopping", "Shopping", "expense", "🛍️", "teal"),
    ("cat-entertainment", "Entertainment", "expense", "🎬", "red"),
    ("cat-health", "Health", "expense", "🩺", "lime"),
    ("cat-travel", "Travel", "expense", "✈️", "blue"),
    ("cat-education", "Education", "expense", "🎓", "purple"),
    ("cat-gifts", "Gifts & donations", "expense", "🎁", "pink"),
    ("cat-personal", "Personal care", "expense", "💇", "teal"),
    ("cat-other", "Other", "expense", "📦", "slate"),
    ("cat-salary", "Salary", "income", "💼", "green"),
    ("cat-freelance", "Freelance", "income", "🧾", "teal"),
    ("cat-interest", "Interest", "income", "🏦", "blue"),
    ("cat-refunds", "Refunds", "income", "↩️", "slate"),
    ("cat-other-income", "Other income", "income", "💰", "amber"),
];

fn accounts() -> Select<account::Entity> {
    account::Entity::find().filter(account::Column::DeletedAt.is_null())
}

fn categories() -> Select<category::Entity> {
    category::Entity::find().filter(category::Column::DeletedAt.is_null())
}

fn transactions() -> Select<transaction::Entity> {
    transaction::Entity::find().filter(transaction::Column::DeletedAt.is_null())
}

fn recurrings() -> Select<recurring::Entity> {
    recurring::Entity::find().filter(recurring::Column::DeletedAt.is_null())
}

fn rules() -> Select<rule::Entity> {
    rule::Entity::find().filter(rule::Column::DeletedAt.is_null())
}

/// Soft-deletes the matching rows, so the deletion syncs.
macro_rules! bury {
    ($entity:ident, $db:expr, $condition:expr) => {
        $entity::Entity::update_many()
            .col_expr($entity::Column::DeletedAt, Expr::value(Some(Utc::now())))
            .col_expr($entity::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter($entity::Column::DeletedAt.is_null())
            .filter($condition)
            .exec($db)
            .await?
    };
}

async fn find_account(db: &impl ConnectionTrait, id: &str) -> Result<account::Model> {
    accounts().filter(account::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Account"))
}

async fn find_transaction(db: &impl ConnectionTrait, id: &str) -> Result<transaction::Model> {
    transactions().filter(transaction::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Transaction"))
}

pub async fn settings(db: &impl ConnectionTrait) -> Result<Option<settings::Model>> {
    Ok(settings::Entity::find_by_id(SETTINGS_ID).filter(settings::Column::DeletedAt.is_null()).one(db).await?)
}

/// The home currency: totals and budgets are in it.
pub async fn home(db: &impl ConnectionTrait) -> Result<String> {
    settings(db).await?.map(|s| s.home_currency).ok_or_else(|| Error::Invalid("Set up Finance first.".into()))
}

fn check_currency(code: &str) -> Result<()> {
    if money::is_currency(code) { Ok(()) } else { Err(Error::Invalid(format!("{code} isn't a currency code (like GBP or EUR)."))) }
}

fn clean(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ---------- Setting up ----------

pub async fn state(db: &DatabaseConnection, today: Date) -> Result<FinanceState> {
    Ok(FinanceState {
        settings: settings(db).await?,
        accounts: cards(db, today).await?,
        categories: categories().order_by_asc(category::Column::Position).all(db).await?,
        recurring: recurrings().order_by_asc(recurring::Column::Name).all(db).await?,
    })
}

/// Chooses the home currency, makes the starting categories and a first account.
pub async fn setup(db: &DatabaseConnection, home_currency: &str, first: AccountFields, today: Date) -> Result<FinanceState> {
    check_currency(home_currency)?;
    let txn = db.begin().await?;
    if settings(&txn).await?.is_none() {
        settings::ActiveModel { id: Set(SETTINGS_ID.into()), home_currency: Set(home_currency.into()), updated_at: Set(Utc::now()), deleted_at: Set(None) }
            .insert(&txn)
            .await?;
    }
    let now = Utc::now();
    for (i, (id, name, kind, icon, color)) in DEFAULT_CATEGORIES.iter().enumerate() {
        if category::Entity::find_by_id(*id).one(&txn).await?.is_none() {
            category::ActiveModel {
                id: Set((*id).into()),
                name: Set((*name).into()),
                kind: Set((*kind).into()),
                color: Set((*color).into()),
                icon: Set((*icon).into()),
                budget: Set(None),
                position: Set(i as f64),
                archived: Set(false),
                created_at: Set(now),
                updated_at: Set(now),
                deleted_at: Set(None),
            }
            .insert(&txn)
            .await?;
        }
    }
    txn.commit().await?;
    if !first.name.trim().is_empty() {
        add_account(db, first).await?;
    }
    state(db, today).await
}

/// Changes the home currency. Totals are worked out again at each day's rate.
pub async fn set_home_currency(db: &DatabaseConnection, code: &str) -> Result<()> {
    check_currency(code)?;
    let mut active: settings::ActiveModel = settings(db).await?.ok_or_else(|| Error::Invalid("Set up Finance first.".into()))?.into();
    active.home_currency = Set(code.into());
    active.update(db).await?;
    let txn = db.begin().await?;
    for a in accounts().all(&txn).await? {
        let home_amount = if a.currency == code { Expr::col(transaction::Column::Amount) } else { Expr::value(Option::<i64>::None) };
        transaction::Entity::update_many()
            .col_expr(transaction::Column::HomeAmount, home_amount)
            .col_expr(transaction::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter(transaction::Column::AccountId.eq(a.id.as_str()))
            .exec(&txn)
            .await?;
    }
    txn.commit().await?;
    Ok(())
}

// ---------- Accounts ----------

fn check_account(fields: &AccountFields) -> Result<String> {
    let name = clean(&fields.name);
    if name.is_empty() {
        return Err(Error::Invalid("Give the account a name.".into()));
    }
    if !ACCOUNT_KINDS.contains(&fields.kind.as_str()) {
        return Err(Error::Invalid(format!("Unknown kind of account: {}", fields.kind)));
    }
    if !COLORS.contains(&fields.color.as_str()) {
        return Err(Error::Invalid(format!("Unknown colour: {}", fields.color)));
    }
    check_currency(&fields.currency)?;
    Ok(name)
}

/// Every account with its balance, in order, archived ones last.
pub async fn cards(db: &DatabaseConnection, today: Date) -> Result<Vec<AccountCard>> {
    let Some(home) = settings(db).await?.map(|s| s.home_currency) else { return Ok(Vec::new()) };
    let mut totals: HashMap<String, (i64, u32)> = HashMap::new();
    for t in transactions().all(db).await? {
        let entry = totals.entry(t.account_id).or_default();
        entry.0 += t.amount;
        entry.1 += 1;
    }
    let mut out = Vec::new();
    let mut list = accounts().order_by_asc(account::Column::Position).all(db).await?;
    list.sort_by_key(|a| a.archived);
    for a in list {
        let (sum, count) = totals.get(&a.id).copied().unwrap_or_default();
        let balance = a.opening_balance + sum;
        let balance_home = rates::to_home(db, balance, &a.currency, &home, today).await?;
        out.push(AccountCard { balance, balance_home, transactions: count, account: a });
    }
    Ok(out)
}

pub async fn add_account(db: &DatabaseConnection, fields: AccountFields) -> Result<account::Model> {
    let name = check_account(&fields)?;
    let last = accounts().order_by_desc(account::Column::Position).one(db).await?;
    let now = Utc::now();
    Ok(account::ActiveModel {
        id: Set(new_id()),
        name: Set(name),
        kind: Set(fields.kind),
        currency: Set(fields.currency),
        opening_balance: Set(fields.opening_balance),
        color: Set(fields.color),
        position: Set(last.map_or(1.0, |a| a.position + 1.0)),
        archived: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

/// Changes an account. Its currency only while it has no transactions.
pub async fn update_account(db: &DatabaseConnection, id: &str, fields: AccountFields) -> Result<account::Model> {
    let name = check_account(&fields)?;
    let a = find_account(db, id).await?;
    if a.currency != fields.currency && transactions().filter(transaction::Column::AccountId.eq(id)).one(db).await?.is_some() {
        return Err(Error::Invalid("The currency can't change once the account has transactions. Make a new account instead.".into()));
    }
    let mut active: account::ActiveModel = a.into();
    active.name = Set(name);
    active.kind = Set(fields.kind);
    active.currency = Set(fields.currency);
    active.opening_balance = Set(fields.opening_balance);
    active.color = Set(fields.color);
    Ok(active.update(db).await?)
}

pub async fn archive_account(db: &DatabaseConnection, id: &str, archived: bool) -> Result<account::Model> {
    let mut active: account::ActiveModel = find_account(db, id).await?.into();
    active.archived = Set(archived);
    Ok(active.update(db).await?)
}

/// Deletes an account and everything in it (and the other half of its transfers).
pub async fn delete_account(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    let pairs: Vec<String> = transactions().filter(transaction::Column::AccountId.eq(id)).all(&txn).await?.into_iter().filter_map(|t| t.transfer_id).collect();
    bury!(transaction, &txn, transaction::Column::Id.is_in(pairs));
    bury!(transaction, &txn, transaction::Column::AccountId.eq(id));
    bury!(recurring, &txn, recurring::Column::AccountId.eq(id));
    bury!(account, &txn, account::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Categories ----------

fn check_category(fields: &CategoryFields) -> Result<String> {
    let name = clean(&fields.name);
    if name.is_empty() {
        return Err(Error::Invalid("Give the category a name.".into()));
    }
    if !matches!(fields.kind.as_str(), "expense" | "income") {
        return Err(Error::Invalid(format!("Unknown kind of category: {}", fields.kind)));
    }
    if fields.budget.is_some_and(|b| b < 0) {
        return Err(Error::Invalid("A budget can't be negative.".into()));
    }
    Ok(name)
}

pub async fn add_category(db: &DatabaseConnection, fields: CategoryFields) -> Result<category::Model> {
    let name = check_category(&fields)?;
    let last = categories().order_by_desc(category::Column::Position).one(db).await?;
    let now = Utc::now();
    Ok(category::ActiveModel {
        id: Set(new_id()),
        name: Set(name),
        kind: Set(fields.kind),
        color: Set(fields.color),
        icon: Set(fields.icon.trim().to_owned()),
        budget: Set(fields.budget),
        position: Set(last.map_or(1.0, |c| c.position + 1.0)),
        archived: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn update_category(db: &DatabaseConnection, id: &str, fields: CategoryFields) -> Result<category::Model> {
    let name = check_category(&fields)?;
    let c = categories().filter(category::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Category"))?;
    let mut active: category::ActiveModel = c.into();
    active.name = Set(name);
    active.kind = Set(fields.kind);
    active.color = Set(fields.color);
    active.icon = Set(fields.icon.trim().to_owned());
    active.budget = Set(fields.budget);
    Ok(active.update(db).await?)
}

/// Deletes a category: its transactions become uncategorised.
pub async fn delete_category(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    transaction::Entity::update_many()
        .col_expr(transaction::Column::CategoryId, Expr::value(Option::<String>::None))
        .col_expr(transaction::Column::UpdatedAt, Expr::value(Utc::now()))
        .filter(transaction::Column::CategoryId.eq(id))
        .exec(&txn)
        .await?;
    bury!(rule, &txn, rule::Column::CategoryId.eq(id));
    bury!(category, &txn, category::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Rules ----------

/// What a payee is known by: its first words, lowercased, without numbers or
/// punctuation. "TESCO STORES 4521 LONDON" and "Tesco Stores 0098" are both
/// "tesco stores london"… so just the first two words: "tesco stores".
pub fn payee_key(payee: &str) -> Option<String> {
    let lowered = payee.to_lowercase();
    let words: Vec<&str> = lowered
        .split(|c: char| !c.is_alphanumeric() && c != '\'' && c != '&')
        .filter(|w| !w.is_empty() && !w.chars().any(|c| c.is_ascii_digit()))
        .filter(|w| !matches!(*w, "card" | "payment" | "purchase" | "pos" | "contactless" | "debit" | "visa" | "mastercard" | "to" | "from" | "ltd" | "the"))
        .take(2)
        .collect();
    (!words.is_empty()).then(|| words.join(" "))
}

/// Remembers that this payee goes in this category.
async fn learn(db: &impl ConnectionTrait, payee: &str, category_id: Option<&str>) -> Result<()> {
    let (Some(key), Some(category_id)) = (payee_key(payee), category_id) else { return Ok(()) };
    let now = Utc::now();
    // Found by pattern: ids are random, because the server can read ids.
    match rules().filter(rule::Column::Pattern.eq(key.as_str())).one(db).await? {
        Some(existing) => {
            let mut active: rule::ActiveModel = existing.into();
            active.category_id = Set(Some(category_id.into()));
            active.update(db).await?;
        }
        None => {
            rule::ActiveModel {
                id: Set(new_id()),
                pattern: Set(key),
                rename: Set(None),
                category_id: Set(Some(category_id.into())),
                created_at: Set(now),
                updated_at: Set(now),
                deleted_at: Set(None),
            }
            .insert(db)
            .await?;
        }
    }
    Ok(())
}

/// The category a payee usually goes in, from what's been learned.
pub async fn suggest(db: &impl ConnectionTrait, payee: &str) -> Result<Option<String>> {
    let Some(key) = payee_key(payee) else { return Ok(None) };
    if let Some(found) = rules().filter(rule::Column::Pattern.eq(key.as_str())).one(db).await? {
        return Ok(found.category_id);
    }
    // "tesco" was learned; "tesco express" is the same shop.
    let first = key.split(' ').next().unwrap_or_default().to_owned();
    Ok(rules().filter(rule::Column::Pattern.eq(first)).one(db).await?.and_then(|r| r.category_id))
}

// ---------- Transactions ----------

/// Transactions matching the filter, newest first.
pub async fn list_transactions(db: &DatabaseConnection, filter: TransactionFilter) -> Result<Vec<TransactionRow>> {
    let mut query = transactions();
    if let Some((from, to)) = filter.month.as_deref().and_then(month_span) {
        query = query.filter(transaction::Column::Day.gte(from)).filter(transaction::Column::Day.lte(to));
    }
    if let Some(a) = &filter.account_id {
        query = query.filter(transaction::Column::AccountId.eq(a.as_str()));
    }
    match filter.category_id.as_deref() {
        Some("none") => query = query.filter(transaction::Column::CategoryId.is_null()).filter(transaction::Column::TransferId.is_null()),
        Some(c) => query = query.filter(transaction::Column::CategoryId.eq(c)),
        None => {}
    }
    let currencies: HashMap<String, String> = account::Entity::find().all(db).await?.into_iter().map(|a| (a.id, a.currency)).collect();
    let words: Vec<String> = filter.search.unwrap_or_default().to_lowercase().split_whitespace().map(String::from).collect();
    Ok(query
        .order_by_desc(transaction::Column::Day)
        .order_by_desc(transaction::Column::CreatedAt)
        .all(db)
        .await?
        .into_iter()
        .filter(|t| words.iter().all(|w| format!("{} {}", t.payee, t.notes).to_lowercase().contains(w.as_str())))
        .map(|t| TransactionRow { currency: currencies.get(&t.account_id).cloned().unwrap_or_default(), transaction: t })
        .collect())
}

fn check_transaction(fields: &TransactionFields) -> Result<()> {
    if fields.amount == 0 {
        return Err(Error::Invalid("Enter an amount.".into()));
    }
    if fields.amount.abs() > 1_000_000_000_000 {
        return Err(Error::Invalid("That amount is too large.".into()));
    }
    if fields.transfer_account_id.as_deref() == Some(fields.account_id.as_str()) {
        return Err(Error::Invalid("A transfer goes to a different account.".into()));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert(
    db: &impl ConnectionTrait,
    a: &account::Model,
    home: &str,
    day: Date,
    amount: i64,
    payee: String,
    category_id: Option<String>,
    notes: String,
    transfer_id: Option<String>,
    recurring_id: Option<String>,
    import_ref: Option<String>,
    id: Option<String>,
) -> Result<transaction::Model> {
    let home_amount = if a.currency == home { Some(amount) } else { None };
    let now = Utc::now();
    Ok(transaction::ActiveModel {
        id: Set(id.unwrap_or_else(new_id)),
        account_id: Set(a.id.clone()),
        day: Set(day),
        amount: Set(amount),
        payee: Set(payee),
        category_id: Set(category_id),
        notes: Set(notes),
        transfer_id: Set(transfer_id),
        recurring_id: Set(recurring_id),
        import_ref: Set(import_ref),
        home_amount: Set(home_amount),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

/// Fills in the home amount from cached rates, where it's not set.
async fn convert_from_cache(db: &DatabaseConnection, saved: Vec<transaction::Model>, home: &str) -> Result<Vec<transaction::Model>> {
    let mut out = Vec::with_capacity(saved.len());
    for t in saved {
        if t.home_amount.is_none() {
            let a = find_account(db, &t.account_id).await?;
            if let Some(converted) = rates::to_home(db, t.amount, &a.currency, home, t.day).await? {
                let mut active: transaction::ActiveModel = t.into();
                active.home_amount = Set(Some(converted));
                out.push(active.update(db).await?);
                continue;
            }
        }
        out.push(t);
    }
    Ok(out)
}

/// Adds a transaction, or both halves of a transfer. A category given for
/// a payee is remembered for next time.
pub async fn add_transaction(db: &DatabaseConnection, fields: TransactionFields) -> Result<Vec<transaction::Model>> {
    check_transaction(&fields)?;
    let home = home(db).await?;
    let a = find_account(db, &fields.account_id).await?;
    let payee = clean(&fields.payee);
    let txn = db.begin().await?;
    let saved = match &fields.transfer_account_id {
        Some(to_id) => {
            let to = find_account(&txn, to_id).await?;
            let out = fields.amount.abs();
            let arrives = if to.currency == a.currency { out } else { fields.transfer_amount.map(i64::abs).ok_or_else(|| Error::Invalid(format!("Enter how much arrives in {}.", to.name)))? };
            let (out_id, in_id) = (new_id(), new_id());
            let out_payee = if payee.is_empty() { format!("To {}", to.name) } else { payee.clone() };
            let in_payee = if payee.is_empty() { format!("From {}", a.name) } else { payee.clone() };
            vec![
                insert(&txn, &a, &home, fields.day, -out, out_payee, None, fields.notes.clone(), Some(in_id.clone()), None, None, Some(out_id.clone())).await?,
                insert(&txn, &to, &home, fields.day, arrives, in_payee, None, fields.notes.clone(), Some(out_id), None, None, Some(in_id)).await?,
            ]
        }
        None => {
            learn(&txn, &payee, fields.category_id.as_deref()).await?;
            vec![insert(&txn, &a, &home, fields.day, fields.amount, payee, fields.category_id.clone(), fields.notes.clone(), None, None, None, None).await?]
        }
    };
    txn.commit().await?;
    convert_from_cache(db, saved, &home).await
}

/// Changes a transaction (a transfer's other half follows its day, amount and notes).
pub async fn update_transaction(db: &DatabaseConnection, id: &str, fields: TransactionFields) -> Result<Vec<transaction::Model>> {
    check_transaction(&fields)?;
    let home = home(db).await?;
    let t = find_transaction(db, id).await?;
    let payee = clean(&fields.payee);
    let txn = db.begin().await?;
    let mut saved = Vec::new();
    let a = find_account(&txn, &fields.account_id).await?;
    let moved = t.account_id != a.id;
    let mut active: transaction::ActiveModel = t.clone().into();
    active.account_id = Set(a.id.clone());
    active.day = Set(fields.day);
    active.payee = Set(payee.clone());
    active.notes = Set(fields.notes.clone());
    if t.amount != fields.amount || moved || t.day != fields.day {
        active.amount = Set(fields.amount);
        active.home_amount = Set(if a.currency == home { Some(fields.amount) } else { None });
    }
    match &t.transfer_id {
        Some(other_id) => {
            saved.push(active.update(&txn).await?);
            if let Ok(other) = find_transaction(&txn, other_id).await {
                let other_account = find_account(&txn, &other.account_id).await?;
                let arrives = if other_account.currency == a.currency { -fields.amount } else { fields.transfer_amount.map_or(other.amount, |v| v.abs() * -fields.amount.signum()) };
                let mut other_active: transaction::ActiveModel = other.into();
                other_active.day = Set(fields.day);
                other_active.notes = Set(fields.notes.clone());
                other_active.amount = Set(arrives);
                other_active.home_amount = Set(if other_account.currency == home { Some(arrives) } else { None });
                saved.push(other_active.update(&txn).await?);
            }
        }
        None => {
            if fields.category_id != t.category_id {
                learn(&txn, &payee, fields.category_id.as_deref()).await?;
            }
            active.category_id = Set(fields.category_id.clone());
            saved.push(active.update(&txn).await?);
        }
    }
    txn.commit().await?;
    convert_from_cache(db, saved, &home).await
}

/// Sets just the category, as from the list. Remembered for the payee.
pub async fn set_category(db: &DatabaseConnection, id: &str, category_id: Option<String>) -> Result<transaction::Model> {
    let t = find_transaction(db, id).await?;
    if t.transfer_id.is_some() {
        return Err(Error::Invalid("Transfers between your accounts don't have a category.".into()));
    }
    learn(db, &t.payee, category_id.as_deref()).await?;
    let mut active: transaction::ActiveModel = t.into();
    active.category_id = Set(category_id);
    Ok(active.update(db).await?)
}

/// Deletes a transaction, and the other half if it's a transfer.
pub async fn delete_transaction(db: &DatabaseConnection, id: &str) -> Result<()> {
    let t = find_transaction(db, id).await?;
    let ids: Vec<String> = std::iter::once(t.id).chain(t.transfer_id).collect();
    bury!(transaction, db, transaction::Column::Id.is_in(ids));
    Ok(())
}

// ---------- Recurring ----------

fn check_recurring(fields: &RecurringFields) -> Result<String> {
    let name = clean(&fields.name);
    if name.is_empty() {
        return Err(Error::Invalid("Give it a name, like Rent or Netflix.".into()));
    }
    if fields.amount == 0 {
        return Err(Error::Invalid("Enter an amount.".into()));
    }
    if !EVERY.contains(&fields.every.as_str()) {
        return Err(Error::Invalid(format!("Unknown repeat: {}", fields.every)));
    }
    if fields.ends_on.is_some_and(|end| end < fields.starts_on) {
        return Err(Error::Invalid("It can't end before it starts.".into()));
    }
    Ok(name)
}

pub async fn add_recurring(db: &DatabaseConnection, fields: RecurringFields) -> Result<recurring::Model> {
    let name = check_recurring(&fields)?;
    find_account(db, &fields.account_id).await?;
    let now = Utc::now();
    Ok(recurring::ActiveModel {
        id: Set(new_id()),
        name: Set(name),
        amount: Set(fields.amount),
        account_id: Set(fields.account_id),
        category_id: Set(fields.category_id),
        every: Set(fields.every),
        starts_on: Set(fields.starts_on),
        ends_on: Set(fields.ends_on),
        skipped: Set(String::new()),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn update_recurring(db: &DatabaseConnection, id: &str, fields: RecurringFields) -> Result<recurring::Model> {
    let name = check_recurring(&fields)?;
    find_account(db, &fields.account_id).await?;
    let r = recurrings().filter(recurring::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Recurring item"))?;
    let mut active: recurring::ActiveModel = r.into();
    active.name = Set(name);
    active.amount = Set(fields.amount);
    active.account_id = Set(fields.account_id);
    active.category_id = Set(fields.category_id);
    active.every = Set(fields.every);
    active.starts_on = Set(fields.starts_on);
    active.ends_on = Set(fields.ends_on);
    Ok(active.update(db).await?)
}

pub async fn delete_recurring(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(recurring, db, recurring::Column::Id.eq(id));
    Ok(())
}

/// When it comes round between `from` and `to`, inclusive.
pub fn occurrences(r: &recurring::Model, from: Date, to: Date) -> Vec<Date> {
    let mut out = Vec::new();
    for n in 0..2000u32 {
        let day = match r.every.as_str() {
            "week" => r.starts_on.checked_add_days(Days::new(7 * n as u64)),
            "year" => r.starts_on.checked_add_months(Months::new(12 * n)),
            // The same day each month; the 31st falls on the last day of shorter months.
            _ => r.starts_on.checked_add_months(Months::new(n)),
        };
        let Some(day) = day else { break };
        if day > to || r.ends_on.is_some_and(|end| day > end) {
            break;
        }
        if day >= from {
            out.push(day);
        }
    }
    out
}

/// Recurring items that have come round (or will in the next few days) and
/// haven't been confirmed or skipped, soonest first.
pub async fn due(db: &DatabaseConnection, today: Date) -> Result<Vec<Due>> {
    let from = today - Days::new(DUE_LOOKBACK_DAYS);
    let to = today + Days::new(DUE_AHEAD_DAYS);
    let currencies: HashMap<String, String> = accounts().all(db).await?.into_iter().map(|a| (a.id, a.currency)).collect();
    let recorded: HashSet<(String, Date)> = transactions()
        .filter(transaction::Column::RecurringId.is_not_null())
        .filter(transaction::Column::Day.gte(from))
        .all(db)
        .await?
        .into_iter()
        .filter_map(|t| Some((t.recurring_id?, t.day)))
        .collect();
    let mut out = Vec::new();
    for r in recurrings().all(db).await? {
        let Some(currency) = currencies.get(&r.account_id) else { continue };
        let skipped: HashSet<&str> = r.skipped.split(',').filter(|s| !s.is_empty()).collect();
        for day in occurrences(&r, from.max(r.starts_on), to) {
            if recorded.contains(&(r.id.clone(), day)) || skipped.contains(day.to_string().as_str()) {
                continue;
            }
            out.push(Due {
                recurring_id: r.id.clone(),
                name: r.name.clone(),
                day,
                amount: r.amount,
                currency: currency.clone(),
                account_id: r.account_id.clone(),
                category_id: r.category_id.clone(),
            });
        }
    }
    out.sort_by_key(|d| d.day);
    Ok(out)
}

/// Records a recurring item for one of its days (with a different amount, if it varied).
pub async fn confirm(db: &DatabaseConnection, id: &str, day: Date, amount: Option<i64>) -> Result<transaction::Model> {
    let r = recurrings().filter(recurring::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Recurring item"))?;
    let home = home(db).await?;
    let a = find_account(db, &r.account_id).await?;
    let amount = amount.filter(|a| *a != 0).unwrap_or(r.amount);
    let saved = insert(db, &a, &home, day, amount, r.name.clone(), r.category_id.clone(), String::new(), None, Some(r.id.clone()), None, None).await?;
    Ok(convert_from_cache(db, vec![saved], &home).await?.remove(0))
}

/// Skips a recurring item for one of its days.
pub async fn skip(db: &DatabaseConnection, id: &str, day: Date) -> Result<()> {
    let r = recurrings().filter(recurring::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Recurring item"))?;
    let mut skipped: Vec<String> = r.skipped.split(',').filter(|s| !s.is_empty()).map(String::from).collect();
    skipped.push(day.to_string());
    // Only the last couple of years matter.
    skipped.sort();
    let keep = skipped.len().saturating_sub(120);
    let mut active: recurring::ActiveModel = r.into();
    active.skipped = Set(skipped[keep..].join(","));
    active.update(db).await?;
    Ok(())
}

// ---------- Months ----------

/// The first and last day of "2026-10".
pub fn month_span(month: &str) -> Option<(Date, Date)> {
    let first = NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d").ok()?;
    let last = first.checked_add_months(Months::new(1))? - Days::new(1);
    Some((first, last))
}

fn month_of(day: Date) -> String {
    format!("{:04}-{:02}", day.year(), day.month())
}

/// A month's income and spending in the home currency, by category, with
/// budgets, what's due, the year's trend and net worth.
pub async fn month_summary(db: &DatabaseConnection, month: &str, today: Date) -> Result<MonthSummary> {
    let home = home(db).await?;
    let (first, last) = month_span(month).ok_or_else(|| Error::Invalid(format!("Not a month: {month}")))?;
    let trend_from = first.checked_sub_months(Months::new(11)).unwrap_or(first);
    let kinds: HashMap<String, (String, Option<i64>)> = categories().all(db).await?.into_iter().map(|c| (c.id, (c.kind, c.budget))).collect();
    let in_range = transactions()
        .filter(transaction::Column::Day.gte(trend_from))
        .filter(transaction::Column::Day.lte(last))
        .filter(transaction::Column::TransferId.is_null())
        .all(db)
        .await?;

    let mut trend: Vec<MonthTotals> = (0..12)
        .filter_map(|n| trend_from.checked_add_months(Months::new(n)))
        .map(|d| MonthTotals { month: month_of(d), ..Default::default() })
        .collect();
    let mut spending: HashMap<Option<String>, (i64, u32)> = HashMap::new();
    let mut income: HashMap<Option<String>, (i64, u32)> = HashMap::new();
    let (mut total_in, mut total_out, mut uncategorised, mut unconverted) = (0i64, 0i64, 0u32, 0u32);
    for t in in_range {
        let in_month = t.day >= first;
        let Some(value) = t.home_amount else {
            if in_month {
                unconverted += 1;
            }
            continue;
        };
        // An expense category's money in (a refund) takes from its spending.
        let is_income = match t.category_id.as_ref().and_then(|c| kinds.get(c)) {
            Some((kind, _)) => kind == "income",
            None => value > 0,
        };
        let totals = trend.iter_mut().find(|m| m.month == month_of(t.day));
        if is_income {
            if let Some(m) = totals {
                m.income += value;
            }
        } else if let Some(m) = totals {
            m.spending -= value;
        }
        if !in_month {
            continue;
        }
        if t.category_id.is_none() {
            uncategorised += 1;
        }
        if is_income {
            total_in += value;
            let entry = income.entry(t.category_id.clone()).or_default();
            entry.0 += value;
            entry.1 += 1;
        } else {
            total_out -= value;
            let entry = spending.entry(t.category_id.clone()).or_default();
            entry.0 -= value;
            entry.1 += 1;
        }
    }
    // Every budgeted category shows, spent on or not.
    for (id, (kind, budget)) in &kinds {
        if kind == "expense" && budget.is_some() {
            spending.entry(Some(id.clone())).or_default();
        }
    }
    let to_list = |map: HashMap<Option<String>, (i64, u32)>| {
        let mut list: Vec<CategorySpend> = map
            .into_iter()
            .map(|(category_id, (total, count))| CategorySpend { budget: category_id.as_ref().and_then(|c| kinds.get(c)).and_then(|(_, b)| *b), category_id, total, count })
            .collect();
        list.sort_by_key(|c| std::cmp::Reverse(c.total));
        list
    };
    let budgets: Vec<i64> = kinds.values().filter(|(kind, _)| kind == "expense").filter_map(|(_, b)| *b).collect();
    let net_worth = {
        let cards = cards(db, today).await?;
        (!cards.is_empty()).then(|| cards.iter().filter_map(|c| c.balance_home).sum())
    };
    Ok(MonthSummary {
        month: month.into(),
        home_currency: home,
        income: total_in,
        spending: total_out,
        budgeted: (!budgets.is_empty()).then(|| budgets.iter().sum()),
        spending_by_category: to_list(spending),
        income_by_category: to_list(income),
        uncategorised,
        unconverted,
        due: due(db, today).await?.into_iter().filter(|d| d.day <= last).collect(),
        trend,
        net_worth,
    })
}

/// Saves imported transactions into an account. Rows matching one already
/// entered by hand are linked to it (so it isn't added twice) instead.
pub async fn add_imported(db: &DatabaseConnection, account_id: &str, rows: Vec<super::import::CommitRow>) -> Result<(u32, u32)> {
    let home = home(db).await?;
    let a = find_account(db, account_id).await?;
    let txn = db.begin().await?;
    let (mut added, mut linked) = (0, 0);
    let mut saved = Vec::new();
    for row in rows {
        match row.matches {
            Some(existing) => {
                if let Ok(t) = find_transaction(&txn, &existing).await {
                    let mut active: transaction::ActiveModel = t.into();
                    active.import_ref = Set(Some(row.import_ref));
                    active.update(&txn).await?;
                    linked += 1;
                }
            }
            None => {
                learn(&txn, &row.payee, row.category_id.as_deref()).await?;
                saved.push(
                    insert(&txn, &a, &home, row.day, row.amount, clean(&row.payee), row.category_id, row.notes, None, None, Some(row.import_ref), None).await?,
                );
                added += 1;
            }
        }
    }
    txn.commit().await?;
    convert_from_cache(db, saved, &home).await?;
    Ok((added, linked))
}
