//! Daily Plan: plan each day as tasks and time blocks.
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `parse.rs` reads quick-add text ("Write report 45m 2pm")
//! - `calendar.rs` and `ics.rs` import events from calendar links
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `commands.rs` exposes the logic to React

pub mod calendar;
pub mod commands;
mod entities;
pub mod migrations;
mod ics;
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
/// devices. A new table must be added here to sync.
pub const SYNCED_TABLES: &[&str] =
    &["daily_plan_tasks", "daily_plan_blocks", "daily_plan_settings", "daily_plan_days", "daily_plan_routines"];
