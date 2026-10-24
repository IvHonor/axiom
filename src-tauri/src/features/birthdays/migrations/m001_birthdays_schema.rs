//! The Birthdays tables: people (and their birthdays or anniversaries), and
//! gift ideas. Sync-ready (text ids, `updated_at`, soft deletes) and
//! end-to-end encrypted when synced (see `crate::vault`).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_birthdays_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(People::Table)
                .if_not_exists()
                .col(string(People::Id).primary_key())
                .col(string(People::Name))
                .col(string(People::Occasion))
                .col(small_integer(People::Month))
                .col(small_integer(People::Day))
                .col(integer_null(People::Year))
                .col(string(People::Relation))
                .col(text(People::Notes))
                .col(integer(People::RemindDays))
                .col(timestamp_with_time_zone(People::CreatedAt))
                .col(timestamp_with_time_zone(People::UpdatedAt))
                .col(timestamp_with_time_zone_null(People::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Gifts::Table)
                .if_not_exists()
                .col(string(Gifts::Id).primary_key())
                .col(string(Gifts::PersonId))
                .col(text(Gifts::Idea))
                .col(text(Gifts::Url))
                .col(string(Gifts::Status))
                .col(integer_null(Gifts::Year))
                .col(timestamp_with_time_zone(Gifts::CreatedAt))
                .col(timestamp_with_time_zone(Gifts::UpdatedAt))
                .col(timestamp_with_time_zone_null(Gifts::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_birthday_gifts_person").table(Gifts::Table).col(Gifts::PersonId).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum People {
    #[sea_orm(iden = "birthdays")]
    Table,
    Id,
    Name,
    Occasion,
    Month,
    Day,
    Year,
    Relation,
    Notes,
    RemindDays,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Gifts {
    #[sea_orm(iden = "birthday_gifts")]
    Table,
    Id,
    PersonId,
    Idea,
    Url,
    Status,
    Year,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
