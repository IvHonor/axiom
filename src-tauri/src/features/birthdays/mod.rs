//! Birthdays: the people you want to remember, their birthdays and
//! anniversaries, how old they're turning, gift ideas, and reminders on the
//! day and ahead of it. End-to-end encrypted when synced.
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `vcard.rs` reads contacts files, `ics.rs` writes calendar files
//! - `commands.rs` exposes it all to React

pub mod commands;
mod entities;
mod ics;
pub mod migrations;
pub(crate) mod service;
pub(crate) mod types;
mod vcard;

#[cfg(test)]
mod tests;

/// Synced, and end-to-end encrypted (see `crate::sync::ENCRYPTED`).
pub const SYNCED_TABLES: &[&str] = &["birthdays", "birthday_gifts"];
