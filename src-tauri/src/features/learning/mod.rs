//! Learning: the skills you're working on, the books, courses and videos you
//! learn them from, how far through each you are, time studied, and what's
//! due for review.
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `outline.rs` reads contents lists, EPUBs and PDFs; `youtube.rs` playlists
//! - `commands.rs` exposes the logic to React

pub mod commands;
pub(crate) mod entities;
pub mod migrations;
mod outline;
pub(crate) mod service;
pub(crate) mod types;
mod youtube;

#[cfg(test)]
mod tests;

/// Every table this feature keeps, so sync copies them to the user's other
/// devices. A new table must be added here to sync.
pub const SYNCED_TABLES: &[&str] = &["learning_skills", "learning_sources", "learning_units", "learning_sessions"];
