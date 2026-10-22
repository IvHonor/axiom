//! Event details for the event panel (location, notes, link, full times),
//! the provider's id so an event can be changed there, and which calendars
//! are the user's own.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m006_daily_plan_event_details"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        // SQLite adds one column per statement.
        let event = |col: &mut ColumnDef| Table::alter().table(Events::Table).add_column(col).to_owned();
        // The provider's id for the event (or its CalDAV address).
        m.alter_table(event(&mut string_null(Events::RemoteId))).await?;
        m.alter_table(event(&mut timestamp_with_time_zone_null(Events::StartAt))).await?;
        m.alter_table(event(&mut timestamp_with_time_zone_null(Events::EndAt))).await?;
        m.alter_table(event(text(Events::Location).default(""))).await?;
        m.alter_table(event(text(Events::Description).default(""))).await?;
        m.alter_table(event(&mut string_null(Events::Link))).await?;
        m.alter_table(event(boolean(Events::Recurring).default(false))).await?;
        m.alter_table(event(boolean(Events::Editable).default(false))).await?;

        // The user's own calendar, not one shared with them read-only.
        m.alter_table(Table::alter().table(Calendars::Table).add_column(boolean(Calendars::Mine).default(false)).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum Events {
    #[sea_orm(iden = "daily_plan_events")]
    Table,
    RemoteId,
    StartAt,
    EndAt,
    Location,
    Description,
    Link,
    Recurring,
    Editable,
}

#[derive(DeriveIden)]
enum Calendars {
    #[sea_orm(iden = "daily_plan_calendars")]
    Table,
    Mine,
}
