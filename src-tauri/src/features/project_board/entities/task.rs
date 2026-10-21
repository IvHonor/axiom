use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "project_board_tasks")]
#[serde(rename_all = "camelCase")]
pub struct Model {
    /// A UUIDv7: unique across devices and sortable by creation time.
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub project_id: String,
    pub column_id: String,
    /// Set when this task is a sub-task of another.
    pub parent_task_id: Option<String>,
    pub title: String,
    pub description: String,
    /// Order within the column. Fractional so a move only rewrites one row.
    pub position: f64,
    /// 0 none, 1 low, 2 medium, 3 high.
    pub priority: i16,
    pub start_date: Option<Date>,
    pub due_date: Option<Date>,
    /// Hours.
    pub estimate: Option<f64>,
    /// "daily", "weekdays", "weekly", "monthly" or "yearly". Completing the task creates the next one.
    pub recurrence: Option<String>,
    pub created_at: DateTimeUtc,
    /// Set while the task sits in a "done" column.
    pub completed_at: Option<DateTimeUtc>,
    pub archived: bool,
    pub updated_at: DateTimeUtc,
    /// Set when deleted. Rows are kept so the deletion can sync to other devices.
    #[serde(skip)]
    pub deleted_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

super::stamp_updated_at!();
