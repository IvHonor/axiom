//! SeaORM entities: one Rust struct per Project Board table. `Model` is a row;
//! `ActiveModel` is a row being inserted or updated. Field names match the
//! columns created in `migrations/`.
//!
//! Every table is sync-ready: UUID ids (so devices never clash), an
//! `updated_at` stamped on every save, and soft deletes via `deleted_at`.
//!
//! The structs also derive `Serialize`, so they can be sent to React as-is
//! (field names become camelCase, e.g. `due_date` -> `dueDate`).

/// Stamps `updated_at` whenever a row is inserted or updated, so sync can
/// tell what changed. (Bulk `update_many` calls set it themselves.)
macro_rules! stamp_updated_at {
    () => {
        #[async_trait::async_trait]
        impl ActiveModelBehavior for ActiveModel {
            async fn before_save<C: ConnectionTrait>(mut self, _db: &C, _insert: bool) -> Result<Self, DbErr> {
                self.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now());
                Ok(self)
            }
        }
    };
}
use stamp_updated_at;

pub mod checklist_item;
pub mod column;
pub mod label;
pub mod project;
pub mod task;
pub mod task_event;
pub mod task_label;
pub mod template;

/// A new id: a UUIDv7, unique across devices and sortable by creation time.
pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}
