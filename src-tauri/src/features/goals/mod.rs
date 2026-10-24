//! Goals: what you're working towards, how far you've come, and whether
//! you're on pace. A goal is a number to reach (save £5,000, run 500 km),
//! milestones to tick off, or one thing to do. Numbers can follow other
//! extensions by themselves: a Finance account, books or pages read, journal
//! entries, a project's cards or a module's lectures. Each goal can carry a
//! WOOP plan: why it matters, what might get in the way, and if-then plans.
//! End-to-end encrypted when synced.
//!
//! - `migrations/` creates and updates the tables
//! - `entities.rs` describes each table to SeaORM
//! - `service.rs` holds the logic, `types.rs` the shapes sent to React
//! - `sources.rs` reads progress from the other extensions
//! - `commands.rs` exposes it all to React

pub mod commands;
mod entities;
pub mod migrations;
pub(crate) mod service;
mod sources;
pub(crate) mod types;

#[cfg(test)]
mod tests;

/// Synced, and end-to-end encrypted (see `crate::sync::ENCRYPTED`).
pub const SYNCED_TABLES: &[&str] = &["goals", "goal_logs", "goal_milestones"];
