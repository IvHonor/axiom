use sea_orm::entity::prelude::*;
use serde::Serialize;

/// A saved card that new cards can be created from.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "project_board_templates")]
#[serde(rename_all = "camelCase")]
pub struct Model {
    /// A UUIDv7: unique across devices and sortable by creation time.
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub project_id: String,
    /// What the template is called in the menu.
    pub name: String,
    /// The title new cards get.
    pub title: String,
    pub description: String,
    pub priority: i16,
    pub estimate: Option<f64>,
    pub recurrence: Option<String>,
    /// JSON array of label ids.
    #[serde(skip)]
    pub label_ids: String,
    /// JSON array of checklist item texts.
    #[serde(skip)]
    pub checklist: String,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
    /// Set when deleted. Rows are kept so the deletion can sync to other devices.
    #[serde(skip)]
    pub deleted_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

super::stamp_updated_at!();
