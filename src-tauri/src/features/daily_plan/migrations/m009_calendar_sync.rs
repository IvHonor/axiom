//! Calendar accounts and calendars sync to the user's other computers (see
//! `LOCAL_COLUMNS` for what stays on each), so removing one marks it
//! deleted instead, for the others to hear about.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m009_daily_plan_calendar_sync"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Accounts::Table).add_column(timestamp_with_time_zone_null(Accounts::DeletedAt)).to_owned()).await?;
        m.alter_table(Table::alter().table(Calendars::Table).add_column(timestamp_with_time_zone_null(Calendars::DeletedAt)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Accounts {
    #[sea_orm(iden = "daily_plan_calendar_accounts")]
    Table,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Calendars {
    #[sea_orm(iden = "daily_plan_calendars")]
    Table,
    DeletedAt,
}
