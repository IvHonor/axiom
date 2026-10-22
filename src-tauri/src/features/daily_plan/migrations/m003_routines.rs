//! Routines: blocks that repeat on chosen weekdays (gym, lunch, a weekly review).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m003_daily_plan_routines"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Routines::Table)
                .if_not_exists()
                .col(string(Routines::Id).primary_key())
                .col(string(Routines::Title))
                .col(integer(Routines::StartMinute))
                .col(integer(Routines::DurationMinutes))
                .col(string(Routines::Color))
                // Monday is bit 0, Sunday bit 6.
                .col(small_integer(Routines::Weekdays))
                .col(timestamp_with_time_zone(Routines::CreatedAt))
                .col(timestamp_with_time_zone(Routines::UpdatedAt))
                .col(timestamp_with_time_zone_null(Routines::DeletedAt))
                .to_owned(),
        )
        .await?;

        // A block made by a routine remembers it, so editing the routine can
        // update the days already laid out.
        m.alter_table(Table::alter().table(Blocks::Table).add_column(string_null(Blocks::RoutineId)).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum Routines {
    #[sea_orm(iden = "daily_plan_routines")]
    Table,
    Id,
    Title,
    StartMinute,
    DurationMinutes,
    Color,
    Weekdays,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Blocks {
    #[sea_orm(iden = "daily_plan_blocks")]
    Table,
    RoutineId,
}
