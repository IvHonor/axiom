//! SeaORM entities: one Rust struct per Project Board table. `Model` is a row;
//! `ActiveModel` is a row being inserted or updated. Field names match the
//! columns created in `migrations/`.
//!
//! Every table is sync-ready: UUID ids (so devices never clash), an
//! `updated_at` stamped on every save, and soft deletes via `deleted_at`.
//!
//! The structs also derive `Serialize`, so they can be sent to React as-is
//! (field names become camelCase, e.g. `due_date` -> `dueDate`).

// Shared with every feature; see crate::db.
pub(crate) use crate::db::stamp_updated_at;

pub mod checklist_item;
pub mod column;
pub mod label;
pub mod project;
pub mod task;
pub mod task_event;
pub mod task_label;
pub mod template;

pub use crate::db::new_id;
