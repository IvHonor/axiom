//! Journal: a daily journal with mood and energy, prompts, tags, On This Day
//! and streaks. End-to-end encrypted when synced.
//!
//! An entry's text is a Yjs document (a CRDT), so edits made on two computers
//! always merge and nothing is lost. Each save adds this computer's new edits
//! as their own row in `journal_edits`, which sync never has to choose
//! between; now and then they're squashed into one snapshot. The app works
//! the document out (see `src/features/journal/doc.ts`); here the edits are
//! kept as they come, plus a plain-text copy for search and previews.
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `commands.rs` exposes it all to React

pub mod commands;
mod entities;
pub mod migrations;
pub(crate) mod service;
pub(crate) mod types;

#[cfg(test)]
mod tests;

/// Synced, and end-to-end encrypted (see `crate::sync::ENCRYPTED`).
pub const SYNCED_TABLES: &[&str] = &["journal_entries", "journal_edits"];
