//! University: the modules you take each term, their lectures, and how far
//! you've got through each one (attended, caught up, reviewed).
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `commands.rs` exposes the logic to React

pub mod commands;
pub(crate) mod entities;
pub mod migrations;
pub(crate) mod service;
pub(crate) mod types;

#[cfg(test)]
mod tests;

/// Every table this feature keeps, so sync copies them to the user's other
/// devices. A new table must be added here to sync.
pub const SYNCED_TABLES: &[&str] = &["uni_terms", "uni_modules", "uni_lectures"];
