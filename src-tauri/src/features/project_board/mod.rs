//! Project Board: projects, each with a board of columns and task cards.
//!
//! - `migrations/` creates and updates the tables
//! - `entities/` describes each table to SeaORM
//! - `service.rs` holds the logic (and its tests)
//! - `types.rs` holds the shapes sent to React
//! - `commands.rs` exposes the logic to React

pub mod commands;
mod entities;
pub mod migrations;
pub(crate) mod service;
pub(crate) mod types;

/// Every table this feature keeps, so sync copies them to the user's other
/// devices. A new table must be added here to sync.
pub const SYNCED_TABLES: &[&str] = &[
    "project_board_projects",
    "project_board_columns",
    "project_board_tasks",
    "project_board_labels",
    "project_board_task_labels",
    "project_board_checklist_items",
    "project_board_task_events",
    "project_board_templates",
];

#[cfg(test)]
mod tests;
