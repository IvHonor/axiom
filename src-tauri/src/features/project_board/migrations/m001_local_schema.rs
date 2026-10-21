//! Creates the Project Board tables in the local database.
//!
//! Sync-ready by design: text UUID ids, `updated_at` on every row, and soft
//! deletes (`deleted_at`). There are deliberately no foreign keys: during sync,
//! rows can arrive in any order (a card before its column), so the app's logic
//! keeps references consistent instead of the database.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_project_board_local_schema"
    }
}

/// Every table starts with an id and ends with the sync columns.
fn table<T: IntoIden + 'static>(name: T, id: impl IntoIden) -> TableCreateStatement {
    Table::create().table(name).if_not_exists().col(string(id).primary_key()).to_owned()
}

fn sync_columns(t: &mut TableCreateStatement) -> TableCreateStatement {
    t.col(timestamp_with_time_zone(Alias::new("updated_at")))
        .col(timestamp_with_time_zone_null(Alias::new("deleted_at")))
        .to_owned()
}

fn index(table: impl IntoIden + Clone + 'static, column: impl IntoIden + 'static, name: &str) -> IndexCreateStatement {
    Index::create().if_not_exists().name(name).table(table).col(column).to_owned()
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(sync_columns(
            table(Projects::Table, Projects::Id)
                .col(string(Projects::Name))
                .col(string(Projects::Color))
                .col(double(Projects::Position))
                .col(timestamp_with_time_zone(Projects::CreatedAt)),
        ))
        .await?;

        m.create_table(sync_columns(
            table(Columns::Table, Columns::Id)
                .col(string(Columns::ProjectId))
                .col(string(Columns::Name))
                .col(double(Columns::Position))
                .col(boolean(Columns::IsDone))
                .col(integer_null(Columns::WipLimit)),
        ))
        .await?;

        m.create_table(sync_columns(
            table(Tasks::Table, Tasks::Id)
                .col(string(Tasks::ProjectId))
                .col(string(Tasks::ColumnId))
                .col(string_null(Tasks::ParentTaskId))
                .col(string(Tasks::Title))
                .col(text(Tasks::Description))
                .col(double(Tasks::Position))
                .col(small_integer(Tasks::Priority))
                .col(date_null(Tasks::StartDate))
                .col(date_null(Tasks::DueDate))
                .col(double_null(Tasks::Estimate))
                .col(string_null(Tasks::Recurrence))
                .col(timestamp_with_time_zone(Tasks::CreatedAt))
                .col(timestamp_with_time_zone_null(Tasks::CompletedAt))
                .col(boolean(Tasks::Archived)),
        ))
        .await?;

        m.create_table(sync_columns(
            table(Labels::Table, Labels::Id)
                .col(string(Labels::ProjectId))
                .col(string(Labels::Name))
                .col(string(Labels::Color)),
        ))
        .await?;

        m.create_table(sync_columns(
            table(TaskLabels::Table, TaskLabels::Id)
                .col(string(TaskLabels::TaskId))
                .col(string(TaskLabels::LabelId)),
        ))
        .await?;

        m.create_table(sync_columns(
            table(ChecklistItems::Table, ChecklistItems::Id)
                .col(string(ChecklistItems::TaskId))
                .col(string(ChecklistItems::Text))
                .col(boolean(ChecklistItems::Done))
                .col(double(ChecklistItems::Position)),
        ))
        .await?;

        m.create_table(sync_columns(
            table(TaskEvents::Table, TaskEvents::Id)
                .col(string(TaskEvents::TaskId))
                .col(string(TaskEvents::Kind))
                .col(string(TaskEvents::Detail))
                .col(timestamp_with_time_zone(TaskEvents::CreatedAt)),
        ))
        .await?;

        m.create_table(sync_columns(
            table(Templates::Table, Templates::Id)
                .col(string(Templates::ProjectId))
                .col(string(Templates::Name))
                .col(string(Templates::Title))
                .col(text(Templates::Description))
                .col(small_integer(Templates::Priority))
                .col(double_null(Templates::Estimate))
                .col(string_null(Templates::Recurrence))
                .col(text(Templates::LabelIds))
                .col(text(Templates::Checklist))
                .col(timestamp_with_time_zone(Templates::CreatedAt)),
        ))
        .await?;

        // The lookups the board makes on every load.
        m.create_index(index(Columns::Table, Columns::ProjectId, "idx_pb_columns_project")).await?;
        m.create_index(index(Tasks::Table, Tasks::ProjectId, "idx_pb_tasks_project")).await?;
        m.create_index(index(Labels::Table, Labels::ProjectId, "idx_pb_labels_project")).await?;
        m.create_index(index(TaskLabels::Table, TaskLabels::TaskId, "idx_pb_task_labels_task")).await?;
        m.create_index(index(ChecklistItems::Table, ChecklistItems::TaskId, "idx_pb_checklist_task")).await?;
        m.create_index(index(TaskEvents::Table, TaskEvents::TaskId, "idx_pb_events_task")).await?;
        m.create_index(index(Templates::Table, Templates::ProjectId, "idx_pb_templates_project")).await?;
        Ok(())
    }
}

#[derive(DeriveIden, Clone)]
enum Projects {
    #[sea_orm(iden = "project_board_projects")]
    Table,
    Id,
    Name,
    Color,
    Position,
    CreatedAt,
}

#[derive(DeriveIden, Clone)]
enum Columns {
    #[sea_orm(iden = "project_board_columns")]
    Table,
    Id,
    ProjectId,
    Name,
    Position,
    IsDone,
    WipLimit,
}

#[derive(DeriveIden, Clone)]
enum Tasks {
    #[sea_orm(iden = "project_board_tasks")]
    Table,
    Id,
    ProjectId,
    ColumnId,
    ParentTaskId,
    Title,
    Description,
    Position,
    Priority,
    StartDate,
    DueDate,
    Estimate,
    Recurrence,
    CreatedAt,
    CompletedAt,
    Archived,
}

#[derive(DeriveIden, Clone)]
enum Labels {
    #[sea_orm(iden = "project_board_labels")]
    Table,
    Id,
    ProjectId,
    Name,
    Color,
}

#[derive(DeriveIden, Clone)]
enum TaskLabels {
    #[sea_orm(iden = "project_board_task_labels")]
    Table,
    Id,
    TaskId,
    LabelId,
}

#[derive(DeriveIden, Clone)]
enum ChecklistItems {
    #[sea_orm(iden = "project_board_checklist_items")]
    Table,
    Id,
    TaskId,
    Text,
    Done,
    Position,
}

#[derive(DeriveIden, Clone)]
enum TaskEvents {
    #[sea_orm(iden = "project_board_task_events")]
    Table,
    Id,
    TaskId,
    Kind,
    Detail,
    CreatedAt,
}

#[derive(DeriveIden, Clone)]
enum Templates {
    #[sea_orm(iden = "project_board_templates")]
    Table,
    Id,
    ProjectId,
    Name,
    Title,
    Description,
    Priority,
    Estimate,
    Recurrence,
    LabelIds,
    Checklist,
    CreatedAt,
}
