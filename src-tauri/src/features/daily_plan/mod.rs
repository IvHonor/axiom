//! Daily Plan: plan each day as tasks and time blocks.
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `parse.rs` reads quick-add text ("Write report 45m 2pm")
//! - `calendars/` imports events from calendar links and accounts, and publishes the plan
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `commands.rs` exposes the logic to React

pub mod calendars;
pub mod commands;
pub(crate) mod entities;
pub mod migrations;
mod parse;
pub(crate) mod service;
pub(crate) mod types;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_rituals;
#[cfg(test)]
mod tests_routines;
#[cfg(test)]
mod tests_ics;

/// Every table this feature keeps, so sync copies them to the user's other
/// devices. A new table must be added here to sync. Calendar events aren't:
/// each computer reads them from the calendars itself.
pub const SYNCED_TABLES: &[&str] = &[
    "daily_plan_tasks",
    "daily_plan_blocks",
    "daily_plan_settings",
    "daily_plan_days",
    "daily_plan_routines",
    "daily_plan_calendar_accounts",
    "daily_plan_calendars",
];

/// Calendar connections are end-to-end encrypted: they hold account
/// addresses and private iCal links, which work like passwords.
pub const ENCRYPTED_TABLES: &[&str] = &["daily_plan_calendar_accounts", "daily_plan_calendars"];

/// What each computer keeps to itself about its calendars: when it last read
/// them, what went wrong, what it last published, and whether it's signed in
/// (sign-ins never leave the computer's credential store).
pub const LOCAL_COLUMNS: &[(&str, &[&str])] = &[
    ("daily_plan_calendar_accounts", &["problem", "signed_out"]),
    ("daily_plan_calendars", &["refreshed_at", "problem", "published_hash"]),
];
