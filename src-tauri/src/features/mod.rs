//! One module per life area, mirroring `src/features/` in the frontend.
//!
//! Each feature folder holds its SeaORM entities, migration, logic and Tauri
//! commands. Register a feature's migration in `db/migrations.rs` and its
//! commands in `lib.rs`.

pub mod project_board;
