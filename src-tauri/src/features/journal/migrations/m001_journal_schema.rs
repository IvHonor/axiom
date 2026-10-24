//! The Journal's tables: entries, and the edits that make up their text.
//! Sync-ready (text ids, `updated_at`, soft deletes) and end-to-end encrypted
//! when synced (see `crate::vault`).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_journal_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Entries::Table)
                .if_not_exists()
                .col(string(Entries::Id).primary_key())
                .col(date(Entries::Day))
                .col(string(Entries::Title))
                .col(small_integer_null(Entries::Mood))
                .col(small_integer_null(Entries::Energy))
                .col(text(Entries::Tags))
                .col(text(Entries::Prompt))
                .col(text(Entries::Text))
                .col(integer(Entries::Words))
                .col(timestamp_with_time_zone(Entries::CreatedAt))
                .col(timestamp_with_time_zone(Entries::UpdatedAt))
                .col(timestamp_with_time_zone_null(Entries::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_journal_entries_day").table(Entries::Table).col(Entries::Day).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(Edits::Table)
                .if_not_exists()
                .col(string(Edits::Id).primary_key())
                .col(string(Edits::EntryId))
                .col(text(Edits::Data))
                .col(string_null(Edits::ChunkOf))
                .col(integer(Edits::Part))
                .col(integer(Edits::Parts))
                .col(timestamp_with_time_zone(Edits::CreatedAt))
                .col(timestamp_with_time_zone(Edits::UpdatedAt))
                .col(timestamp_with_time_zone_null(Edits::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_journal_edits_entry").table(Edits::Table).col(Edits::EntryId).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Entries {
    #[sea_orm(iden = "journal_entries")]
    Table,
    Id,
    Day,
    Title,
    Mood,
    Energy,
    Tags,
    Prompt,
    Text,
    Words,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Edits {
    #[sea_orm(iden = "journal_edits")]
    Table,
    Id,
    EntryId,
    Data,
    ChunkOf,
    Part,
    Parts,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
