//! One module per life area, mirroring `src/features/` in the frontend.
//!
//! Each feature folder holds its SeaORM entities, migration, logic and Tauri
//! commands. Register a feature's migration in `db/migrations.rs` and its
//! commands in `lib.rs`.

pub mod birthdays;
pub mod daily_plan;
pub(crate) mod doc_edits;
pub mod finance;
pub mod goals;
pub mod journal;
pub mod learning;
pub mod notes;
pub mod project_board;
pub mod reading;
pub mod uni;
