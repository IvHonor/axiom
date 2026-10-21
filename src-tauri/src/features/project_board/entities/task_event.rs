use sea_orm::entity::prelude::*;
use serde::Serialize;

/// One line of a task's history, e.g. kind "moved", detail "To do → Doing".
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "project_board_task_events")]
#[serde(rename_all = "camelCase")]
pub struct Model {
    /// A UUIDv7: unique across devices and sortable by creation time.
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub task_id: String,
    pub kind: String,
    pub detail: String,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
    /// Set when deleted. Rows are kept so the deletion can sync to other devices.
    #[serde(skip)]
    pub deleted_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

super::stamp_updated_at!();
