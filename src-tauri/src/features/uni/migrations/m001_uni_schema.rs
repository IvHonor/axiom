//! University's tables: terms, the modules in each, and their lectures.
//! Sync-ready like every feature: text ids, `updated_at`, soft deletes.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_uni_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Terms::Table)
                .if_not_exists()
                .col(string(Terms::Id).primary_key())
                .col(string(Terms::Name))
                .col(date(Terms::StartsOn))
                .col(integer(Terms::Weeks))
                .col(timestamp_with_time_zone(Terms::CreatedAt))
                .col(timestamp_with_time_zone(Terms::UpdatedAt))
                .col(timestamp_with_time_zone_null(Terms::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Modules::Table)
                .if_not_exists()
                .col(string(Modules::Id).primary_key())
                .col(string(Modules::TermId))
                .col(string(Modules::Code))
                .col(string(Modules::Name))
                .col(string(Modules::Color))
                .col(integer_null(Modules::Credits))
                .col(string_null(Modules::Link))
                .col(double(Modules::Position))
                .col(timestamp_with_time_zone(Modules::CreatedAt))
                .col(timestamp_with_time_zone(Modules::UpdatedAt))
                .col(timestamp_with_time_zone_null(Modules::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_uni_modules_term").table(Modules::Table).col(Modules::TermId).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(Lectures::Table)
                .if_not_exists()
                .col(string(Lectures::Id).primary_key())
                .col(string(Lectures::ModuleId))
                .col(string(Lectures::Title))
                .col(string(Lectures::Kind))
                .col(integer_null(Lectures::Week))
                .col(date_null(Lectures::Day))
                .col(text(Lectures::Topics))
                .col(boolean(Lectures::Recorded))
                .col(date_null(Lectures::AttendedOn))
                .col(date_null(Lectures::CaughtUpOn))
                .col(date_null(Lectures::ReviewedOn))
                .col(small_integer_null(Lectures::Confidence))
                .col(text(Lectures::Notes))
                .col(double(Lectures::Position))
                .col(timestamp_with_time_zone(Lectures::CreatedAt))
                .col(timestamp_with_time_zone(Lectures::UpdatedAt))
                .col(timestamp_with_time_zone_null(Lectures::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_uni_lectures_module").table(Lectures::Table).col(Lectures::ModuleId).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum Terms {
    #[sea_orm(iden = "uni_terms")]
    Table,
    Id,
    Name,
    StartsOn,
    Weeks,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Modules {
    #[sea_orm(iden = "uni_modules")]
    Table,
    Id,
    TermId,
    Code,
    Name,
    Color,
    Credits,
    Link,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Lectures {
    #[sea_orm(iden = "uni_lectures")]
    Table,
    Id,
    ModuleId,
    Title,
    Kind,
    Week,
    Day,
    Topics,
    Recorded,
    AttendedOn,
    CaughtUpOn,
    ReviewedOn,
    Confidence,
    Notes,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
