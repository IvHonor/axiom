//! Shapes sent to and from React. Mirrored in `src/features/finance/api.ts`.

use sea_orm::prelude::Date;
use serde::{Deserialize, Serialize};

use super::entities::{account, category, recurring, settings, transaction};

/// Everything the views need to start: settings (None until set up), and
/// the accounts, categories and recurring items.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceState {
    pub settings: Option<settings::Model>,
    pub accounts: Vec<AccountCard>,
    pub categories: Vec<category::Model>,
    pub recurring: Vec<recurring::Model>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountCard {
    #[serde(flatten)]
    pub account: account::Model,
    /// Opening balance plus every transaction, in the account's currency.
    pub balance: i64,
    /// The balance in the home currency at the latest known rate.
    pub balance_home: Option<i64>,
    pub transactions: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountFields {
    pub name: String,
    pub kind: String,
    pub currency: String,
    pub opening_balance: i64,
    pub color: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryFields {
    pub name: String,
    pub kind: String,
    pub color: String,
    pub icon: String,
    pub budget: Option<i64>,
}

/// A transaction to add or change. With `transfer_account_id`, it's a
/// transfer: `amount` leaves this account and arrives in the other one
/// (as `transfer_amount` when the currencies differ).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionFields {
    pub account_id: String,
    pub day: Date,
    pub amount: i64,
    pub payee: String,
    pub category_id: Option<String>,
    #[serde(default)]
    pub notes: String,
    pub transfer_account_id: Option<String>,
    pub transfer_amount: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionFilter {
    /// "2026-10".
    pub month: Option<String>,
    pub account_id: Option<String>,
    /// A category's id, or "none" for uncategorised.
    pub category_id: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringFields {
    pub name: String,
    pub amount: i64,
    pub account_id: String,
    pub category_id: Option<String>,
    pub every: String,
    pub starts_on: Date,
    pub ends_on: Option<Date>,
}

/// A recurring item that's come round and hasn't been confirmed or skipped.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Due {
    pub recurring_id: String,
    pub name: String,
    pub day: Date,
    pub amount: i64,
    pub currency: String,
    pub account_id: String,
    pub category_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategorySpend {
    /// None for uncategorised.
    pub category_id: Option<String>,
    /// Spending is positive here; income too, for income categories.
    pub total: i64,
    pub budget: Option<i64>,
    pub count: u32,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthTotals {
    pub month: String,
    pub income: i64,
    pub spending: i64,
}

/// A month at a glance, in the home currency.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthSummary {
    pub month: String,
    pub home_currency: String,
    pub income: i64,
    pub spending: i64,
    /// Budgets across categories, if any are set.
    pub budgeted: Option<i64>,
    pub spending_by_category: Vec<CategorySpend>,
    pub income_by_category: Vec<CategorySpend>,
    pub uncategorised: u32,
    /// Transactions in other currencies whose rate isn't known yet (offline).
    pub unconverted: u32,
    /// Recurring items due this month (or overdue) not yet confirmed.
    pub due: Vec<Due>,
    /// The twelve months up to this one.
    pub trend: Vec<MonthTotals>,
    pub net_worth: Option<i64>,
}

/// What a quick entry ("12.50 coffee yesterday") was read as.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickEntry {
    /// Signed, in `currency`'s minor units. None until there's a number.
    pub amount: Option<i64>,
    pub currency: String,
    pub day: Date,
    pub payee: String,
    pub category_id: Option<String>,
    pub account_id: Option<String>,
}

/// A transaction with where it's from, for lists across accounts.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionRow {
    #[serde(flatten)]
    pub transaction: transaction::Model,
    pub currency: String,
}
