//! Calendars read from private iCal links, and their events laid out by day.
//! Both stay on this computer: a private calendar link works like a
//! password, so it isn't synced, and events are re-read from the link.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m004_daily_plan_calendars"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Calendars::Table)
                .if_not_exists()
                .col(string(Calendars::Id).primary_key())
                .col(string(Calendars::Name))
                .col(string(Calendars::Url))
                .col(string(Calendars::Color))
                .col(timestamp_with_time_zone_null(Calendars::RefreshedAt))
                .col(string_null(Calendars::Problem))
                .col(timestamp_with_time_zone(Calendars::CreatedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Events::Table)
                .if_not_exists()
                .col(string(Events::Id).primary_key())
                .col(string(Events::CalendarId))
                .col(date(Events::Day))
                .col(integer(Events::StartMinute))
                .col(integer(Events::DurationMinutes))
                .col(boolean(Events::AllDay))
                .col(boolean(Events::Busy))
                .col(string(Events::Title))
                .col(string(Events::Color))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_daily_plan_events_day").table(Events::Table).col(Events::Day).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum Calendars {
    #[sea_orm(iden = "daily_plan_calendars")]
    Table,
    Id,
    Name,
    Url,
    Color,
    RefreshedAt,
    Problem,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Events {
    #[sea_orm(iden = "daily_plan_events")]
    Table,
    Id,
    CalendarId,
    Day,
    StartMinute,
    DurationMinutes,
    AllDay,
    Busy,
    Title,
    Color,
}
