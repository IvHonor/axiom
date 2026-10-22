//! Reading Tracker: the books you're reading, want to read and have read,
//! where you are in each, and what you want to remember from them.
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `library.rs` finds books, editions and covers on Open Library
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `commands.rs` exposes the logic to React

pub mod commands;
mod entities;
pub mod library;
pub mod migrations;
pub(crate) mod service;
pub(crate) mod types;

#[cfg(test)]
mod tests;

/// Every table this feature keeps, so sync copies them to the user's other
/// devices. A new table must be added here to sync.
pub const SYNCED_TABLES: &[&str] = &["reading_books", "reading_sessions", "reading_notes", "reading_reads", "reading_goals"];
