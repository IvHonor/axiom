//! Finance's tables. Sync-ready like every feature (text ids, `updated_at`,
//! soft deletes), and end-to-end encrypted when synced (see `crate::vault`).
//! Amounts are whole numbers in the currency's smallest unit (pence, cents).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_finance_schema"
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
                .col(string(Accounts::Name))
                .col(string(Accounts::Kind))
                .col(string(Accounts::Currency))
                .col(big_integer(Accounts::OpeningBalance))
                .col(string(Accounts::Color))
                .col(double(Accounts::Position))
                .col(boolean(Accounts::Archived))
                .col(timestamp_with_time_zone(Accounts::CreatedAt))
                .col(timestamp_with_time_zone(Accounts::UpdatedAt))
                .col(timestamp_with_time_zone_null(Accounts::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Categories::Table)
                .if_not_exists()
                .col(string(Categories::Id).primary_key())
                .col(string(Categories::Name))
                .col(string(Categories::Kind))
                .col(string(Categories::Color))
                .col(string(Categories::Icon))
                .col(big_integer_null(Categories::Budget))
                .col(double(Categories::Position))
                .col(boolean(Categories::Archived))
                .col(timestamp_with_time_zone(Categories::CreatedAt))
                .col(timestamp_with_time_zone(Categories::UpdatedAt))
                .col(timestamp_with_time_zone_null(Categories::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Transactions::Table)
                .if_not_exists()
                .col(string(Transactions::Id).primary_key())
                .col(string(Transactions::AccountId))
                .col(date(Transactions::Day))
                .col(big_integer(Transactions::Amount))
                .col(string(Transactions::Payee))
                .col(string_null(Transactions::CategoryId))
                .col(text(Transactions::Notes))
                .col(string_null(Transactions::TransferId))
                .col(string_null(Transactions::RecurringId))
                .col(string_null(Transactions::ImportRef))
                .col(big_integer_null(Transactions::HomeAmount))
                .col(timestamp_with_time_zone(Transactions::CreatedAt))
                .col(timestamp_with_time_zone(Transactions::UpdatedAt))
                .col(timestamp_with_time_zone_null(Transactions::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_finance_tx_account_day").table(Transactions::Table).col(Transactions::AccountId).col(Transactions::Day).to_owned())
            .await?;
        m.create_index(Index::create().name("idx_finance_tx_day").table(Transactions::Table).col(Transactions::Day).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(Recurring::Table)
                .if_not_exists()
                .col(string(Recurring::Id).primary_key())
                .col(string(Recurring::Name))
                .col(big_integer(Recurring::Amount))
                .col(string(Recurring::AccountId))
                .col(string_null(Recurring::CategoryId))
                .col(string(Recurring::Every))
                .col(date(Recurring::StartsOn))
                .col(date_null(Recurring::EndsOn))
                .col(text(Recurring::Skipped))
                .col(timestamp_with_time_zone(Recurring::CreatedAt))
                .col(timestamp_with_time_zone(Recurring::UpdatedAt))
                .col(timestamp_with_time_zone_null(Recurring::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Rules::Table)
                .if_not_exists()
                .col(string(Rules::Id).primary_key())
                .col(string(Rules::Pattern))
                .col(string_null(Rules::Rename))
                .col(string_null(Rules::CategoryId))
                .col(timestamp_with_time_zone(Rules::CreatedAt))
                .col(timestamp_with_time_zone(Rules::UpdatedAt))
                .col(timestamp_with_time_zone_null(Rules::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Profiles::Table)
                .if_not_exists()
                .col(string(Profiles::Id).primary_key())
                .col(string(Profiles::Name))
                .col(text(Profiles::Mapping))
                .col(timestamp_with_time_zone(Profiles::CreatedAt))
                .col(timestamp_with_time_zone(Profiles::UpdatedAt))
                .col(timestamp_with_time_zone_null(Profiles::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Settings::Table)
                .if_not_exists()
                .col(string(Settings::Id).primary_key())
                .col(string(Settings::HomeCurrency))
                .col(timestamp_with_time_zone(Settings::UpdatedAt))
                .col(timestamp_with_time_zone_null(Settings::DeletedAt))
                .to_owned(),
        )
        .await?;

        // Exchange rates from Frankfurter, cached. Public data: not synced.
        m.create_table(
            Table::create()
                .table(Rates::Table)
                .if_not_exists()
                .col(date(Rates::Day))
                .col(string(Rates::Base))
                .col(string(Rates::Quote))
                .col(double(Rates::Rate))
                .primary_key(Index::create().col(Rates::Day).col(Rates::Base).col(Rates::Quote))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Accounts {
    #[sea_orm(iden = "finance_accounts")]
    Table,
    Id,
    Name,
    Kind,
    Currency,
    OpeningBalance,
    Color,
    Position,
    Archived,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Categories {
    #[sea_orm(iden = "finance_categories")]
    Table,
    Id,
    Name,
    Kind,
    Color,
    Icon,
    Budget,
    Position,
    Archived,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Transactions {
    #[sea_orm(iden = "finance_transactions")]
    Table,
    Id,
    AccountId,
    Day,
    Amount,
    Payee,
    CategoryId,
    Notes,
    TransferId,
    RecurringId,
    ImportRef,
    HomeAmount,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Recurring {
    #[sea_orm(iden = "finance_recurring")]
    Table,
    Id,
    Name,
    Amount,
    AccountId,
    CategoryId,
    Every,
    StartsOn,
    EndsOn,
    Skipped,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Rules {
    #[sea_orm(iden = "finance_rules")]
    Table,
    Id,
    Pattern,
    Rename,
    CategoryId,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Profiles {
    #[sea_orm(iden = "finance_import_profiles")]
    Table,
    Id,
    Name,
    Mapping,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Settings {
    #[sea_orm(iden = "finance_settings")]
    Table,
    Id,
    HomeCurrency,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Rates {
    #[sea_orm(iden = "finance_rates")]
    Table,
    Day,
    Base,
    Quote,
    Rate,
}
