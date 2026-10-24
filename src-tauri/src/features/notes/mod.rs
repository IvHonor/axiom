//! Notes: notes in folders with tags, pins, [[links]] between them and
//! backlinks, a trash, and sticky notes that can sit on the overview.
//! End-to-end encrypted when synced.
//!
//! Like the Journal, a note's text is a Yjs document kept as edits (see
//! `features::doc_edits`), so edits from two computers merge. Sticky notes
//! are notes too, with a colour.
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
pub const SYNCED_TABLES: &[&str] = &["note_folders", "notes", "note_edits"];
