//! Time tracking on tasks, and a row per day for the planning and shutdown
//! rituals.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m002_daily_plan_rituals_and_time"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        // SQLite adds one column per statement.
        m.alter_table(Table::alter().table(Tasks::Table).add_column(integer(Tasks::ActualMinutes).default(0)).to_owned())
            .await?;
        m.alter_table(Table::alter().table(Tasks::Table).add_column(timestamp_with_time_zone_null(Tasks::TimerStartedAt)).to_owned())
            .await?;

        // The id is the date itself ("2026-10-22"), so two devices writing
        // the same day merge instead of making two rows.
        m.create_table(
            Table::create()
                .table(Days::Table)
                .if_not_exists()
                .col(string(Days::Id).primary_key())
                .col(text(Days::Intention))
                .col(text(Days::WentWell))
                .col(text(Days::DoBetter))
                .col(timestamp_with_time_zone_null(Days::PlannedAt))
                .col(timestamp_with_time_zone_null(Days::ShutdownAt))
                .col(timestamp_with_time_zone(Days::UpdatedAt))
                .col(timestamp_with_time_zone_null(Days::DeletedAt))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Tasks {
    #[sea_orm(iden = "daily_plan_tasks")]
    Table,
    ActualMinutes,
    TimerStartedAt,
}

#[derive(DeriveIden)]
enum Days {
    #[sea_orm(iden = "daily_plan_days")]
    Table,
    Id,
    Intention,
    WentWell,
    DoBetter,
    PlannedAt,
    ShutdownAt,
    UpdatedAt,
    DeletedAt,
}
