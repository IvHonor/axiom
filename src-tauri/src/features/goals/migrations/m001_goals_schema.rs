//! The Goals tables: goals, check-ins and milestones. Sync-ready (text ids,
//! `updated_at`, soft deletes) and end-to-end encrypted when synced (see
//! `crate::vault`).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_goals_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Goals::Table)
                .if_not_exists()
                .col(string(Goals::Id).primary_key())
                .col(string(Goals::Title))
                .col(string(Goals::Icon))
                .col(string(Goals::Area))
                .col(string(Goals::Kind))
                .col(string(Goals::Source))
                .col(string(Goals::SourceId))
                .col(double(Goals::StartValue))
                .col(double(Goals::TargetValue))
                .col(string(Goals::Unit))
                .col(string(Goals::Measure))
                .col(date(Goals::StartDate))
                .col(date_null(Goals::DueDate))
                .col(text(Goals::Why))
                .col(text(Goals::Obstacle))
                .col(text(Goals::Plan))
                .col(string(Goals::Status))
                .col(date_null(Goals::CompletedOn))
                .col(integer(Goals::Position))
                .col(timestamp_with_time_zone(Goals::CreatedAt))
                .col(timestamp_with_time_zone(Goals::UpdatedAt))
                .col(timestamp_with_time_zone_null(Goals::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Logs::Table)
                .if_not_exists()
                .col(string(Logs::Id).primary_key())
                .col(string(Logs::GoalId))
                .col(date(Logs::Day))
                .col(double(Logs::Value))
                .col(text(Logs::Note))
                .col(timestamp_with_time_zone(Logs::CreatedAt))
                .col(timestamp_with_time_zone(Logs::UpdatedAt))
                .col(timestamp_with_time_zone_null(Logs::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_goal_logs_goal").table(Logs::Table).col(Logs::GoalId).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(Milestones::Table)
                .if_not_exists()
                .col(string(Milestones::Id).primary_key())
                .col(string(Milestones::GoalId))
                .col(string(Milestones::Title))
                .col(date_null(Milestones::DueDate))
                .col(date_null(Milestones::DoneOn))
                .col(integer(Milestones::Position))
                .col(timestamp_with_time_zone(Milestones::CreatedAt))
                .col(timestamp_with_time_zone(Milestones::UpdatedAt))
                .col(timestamp_with_time_zone_null(Milestones::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_goal_milestones_goal").table(Milestones::Table).col(Milestones::GoalId).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Goals {
    #[sea_orm(iden = "goals")]
    Table,
    Id,
    Title,
    Icon,
    Area,
    Kind,
    Source,
    SourceId,
    StartValue,
    TargetValue,
    Unit,
    Measure,
    StartDate,
    DueDate,
    Why,
    Obstacle,
    Plan,
    Status,
    CompletedOn,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Logs {
    #[sea_orm(iden = "goal_logs")]
    Table,
    Id,
    GoalId,
    Day,
    Value,
    Note,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Milestones {
    #[sea_orm(iden = "goal_milestones")]
    Table,
    Id,
    GoalId,
    Title,
    DueDate,
    DoneOn,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
