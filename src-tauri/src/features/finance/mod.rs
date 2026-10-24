//! Finance: accounts, income and spending, budgets, recurring bills, and
//! importing bank and credit card statements. Synced end-to-end encrypted.
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `money.rs` handles currencies and amounts (whole minor units, never floats)
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `quick.rs` reads quick entries like "12.50 coffee yesterday"
//! - `import/` reads statements: CSV (any bank's layout), OFX/QFX and QIF
//! - `rates.rs` gets exchange rates from Frankfurter and keeps them
//! - `commands.rs` exposes it all to React

pub mod commands;
mod entities;
pub mod import;
pub mod migrations;
pub(crate) mod money;
pub(crate) mod quick;
pub mod rates;
pub(crate) mod service;
pub(crate) mod types;

#[cfg(test)]
mod tests;

/// Every table this feature syncs, all of them end-to-end encrypted (see
/// `crate::sync::ENCRYPTED`). The rates cache stays on this computer.
pub const SYNCED_TABLES: &[&str] = &[
    "finance_accounts",
    "finance_categories",
    "finance_transactions",
    "finance_recurring",
    "finance_rules",
    "finance_import_profiles",
    "finance_settings",
];
