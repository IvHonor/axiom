use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "project_board_labels")]
#[serde(rename_all = "camelCase")]
pub struct Model {
    /// A UUIDv7: unique across devices and sortable by creation time.
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub project_id: String,
    pub name: String,
    /// A palette name such as "green" or "purple"; the frontend picks the shade.
    pub color: String,
    pub updated_at: DateTimeUtc,
    /// Set when deleted. Rows are kept so the deletion can sync to other devices.
    #[serde(skip)]
    pub deleted_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

super::stamp_updated_at!();
