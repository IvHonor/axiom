//! Calendar accounts (Google, Outlook, iCloud and other CalDAV servers), and
//! the plan published into one of their calendars. Local only, like the
//! calendars themselves; sign-ins are kept in the system keychain.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m005_daily_plan_calendar_accounts"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Accounts::Table)
                .if_not_exists()
                .col(string(Accounts::Id).primary_key())
                // "google", "microsoft" or "caldav".
                .col(string(Accounts::Provider))
                // Who it is, usually an email address.
                .col(string(Accounts::Name))
                // The CalDAV server; empty for Google and Microsoft.
                .col(string(Accounts::Server).default(""))
                .col(string_null(Accounts::Problem))
                .col(timestamp_with_time_zone(Accounts::CreatedAt))
                .to_owned(),
        )
        .await?;

        // SQLite adds one column per statement.
        let add = |col: &mut ColumnDef| Table::alter().table(Calendars::Table).add_column(col).to_owned();
        m.alter_table(add(&mut string_null(Calendars::AccountId))).await?;
        // The calendar's id at the provider (or its CalDAV address).
        m.alter_table(add(&mut string_null(Calendars::RemoteId))).await?;
        m.alter_table(add(boolean(Calendars::Writable).default(false))).await?;
        // Whether its events show on the planner.
        m.alter_table(add(boolean(Calendars::Shown).default(true))).await?;
        // The one calendar the plan is published into.
        m.alter_table(add(boolean(Calendars::Publish).default(false))).await?;
        // What was last published, to skip publishing when nothing changed.
        m.alter_table(add(&mut string_null(Calendars::PublishedHash))).await
    }
}

#[derive(DeriveIden)]
enum Accounts {
    #[sea_orm(iden = "daily_plan_calendar_accounts")]
    Table,
    Id,
    Provider,
    Name,
    Server,
    Problem,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Calendars {
    #[sea_orm(iden = "daily_plan_calendars")]
    Table,
    AccountId,
    RemoteId,
    Writable,
    Shown,
    Publish,
    PublishedHash,
}
