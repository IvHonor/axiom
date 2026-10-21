use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "project_board_columns")]
#[serde(rename_all = "camelCase")]
pub struct Model {
    /// A UUIDv7: unique across devices and sortable by creation time.
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub position: f64,
    /// Tasks moved here count as completed.
    pub is_done: bool,
    /// Optional cap on how many tasks the column should hold.
    pub wip_limit: Option<i32>,
    pub updated_at: DateTimeUtc,
    /// Set when deleted. Rows are kept so the deletion can sync to other devices.
    #[serde(skip)]
    pub deleted_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

super::stamp_updated_at!();
