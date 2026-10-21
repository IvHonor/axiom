//! Creates the Daily Plan tables in the local database.
//!
//! Sync-ready like every feature: text UUID ids, `updated_at`, soft deletes
//! (`deleted_at`) and no foreign keys (sync can deliver rows in any order).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_daily_plan_schema"
    }
}

fn sync_columns(t: &mut TableCreateStatement) -> TableCreateStatement {
    t.col(timestamp_with_time_zone(Alias::new("updated_at")))
        .col(timestamp_with_time_zone_null(Alias::new("deleted_at")))
        .to_owned()
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(sync_columns(
            Table::create()
                .table(Tasks::Table)
                .if_not_exists()
                .col(string(Tasks::Id).primary_key())
                .col(string(Tasks::Title))
                .col(text(Tasks::Notes))
                // No day: the task waits in the inbox.
                .col(date_null(Tasks::Day))
                .col(double(Tasks::Position))
                .col(integer_null(Tasks::EstimateMinutes))
                // 1-3 for the day's top priorities.
                .col(small_integer_null(Tasks::FocusRank))
                .col(timestamp_with_time_zone_null(Tasks::DoneAt))
                .col(string_null(Tasks::BoardTaskId))
                .col(timestamp_with_time_zone(Tasks::CreatedAt)),
        ))
        .await?;

        m.create_table(sync_columns(
            Table::create()
                .table(Blocks::Table)
                .if_not_exists()
                .col(string(Blocks::Id).primary_key())
                .col(date(Blocks::Day))
                // Minutes after midnight, local time.
                .col(integer(Blocks::StartMinute))
                .col(integer(Blocks::DurationMinutes))
                .col(string(Blocks::Title))
                .col(string(Blocks::Color))
                .col(string_null(Blocks::TaskId))
                .col(timestamp_with_time_zone(Blocks::CreatedAt)),
        ))
        .await?;

        // A single row, id "settings", created the first time they're changed.
        m.create_table(sync_columns(
            Table::create()
                .table(Settings::Table)
                .if_not_exists()
                .col(string(Settings::Id).primary_key())
                .col(integer(Settings::DayStartMinute))
                .col(integer(Settings::DayEndMinute))
                .col(small_integer(Settings::BufferPercent)),
        ))
        .await?;

        m.create_index(Index::create().if_not_exists().name("idx_dp_tasks_day").table(Tasks::Table).col(Tasks::Day).to_owned())
            .await?;
        m.create_index(Index::create().if_not_exists().name("idx_dp_blocks_day").table(Blocks::Table).col(Blocks::Day).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum Tasks {
    #[sea_orm(iden = "daily_plan_tasks")]
    Table,
    Id,
    Title,
    Notes,
    Day,
    Position,
    EstimateMinutes,
    FocusRank,
    DoneAt,
    BoardTaskId,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Blocks {
    #[sea_orm(iden = "daily_plan_blocks")]
    Table,
    Id,
    Day,
    StartMinute,
    DurationMinutes,
    Title,
    Color,
    TaskId,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Settings {
    #[sea_orm(iden = "daily_plan_settings")]
    Table,
    Id,
    DayStartMinute,
    DayEndMinute,
    BufferPercent,
}
