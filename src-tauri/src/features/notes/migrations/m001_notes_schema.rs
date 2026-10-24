//! The Notes tables: folders, notes, and the edits that make up their text.
//! Sync-ready (text ids, `updated_at`, soft deletes) and end-to-end encrypted
//! when synced (see `crate::vault`).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_notes_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Folders::Table)
                .if_not_exists()
                .col(string(Folders::Id).primary_key())
                .col(string(Folders::Name))
                .col(string_null(Folders::ParentId))
                .col(integer(Folders::Position))
                .col(timestamp_with_time_zone(Folders::CreatedAt))
                .col(timestamp_with_time_zone(Folders::UpdatedAt))
                .col(timestamp_with_time_zone_null(Folders::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Notes::Table)
                .if_not_exists()
                .col(string(Notes::Id).primary_key())
                .col(string_null(Notes::FolderId))
                .col(string(Notes::Title))
                .col(text(Notes::Tags))
                .col(text(Notes::Text))
                .col(integer(Notes::Words))
                .col(boolean(Notes::Pinned))
                .col(boolean(Notes::Sticky))
                .col(string(Notes::Color))
                .col(boolean(Notes::OnOverview))
                .col(timestamp_with_time_zone_null(Notes::TrashedAt))
                .col(timestamp_with_time_zone(Notes::CreatedAt))
                .col(timestamp_with_time_zone(Notes::UpdatedAt))
                .col(timestamp_with_time_zone_null(Notes::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_notes_folder").table(Notes::Table).col(Notes::FolderId).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(Edits::Table)
                .if_not_exists()
                .col(string(Edits::Id).primary_key())
                .col(string(Edits::NoteId))
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
        m.create_index(Index::create().name("idx_note_edits_note").table(Edits::Table).col(Edits::NoteId).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Folders {
    #[sea_orm(iden = "note_folders")]
    Table,
    Id,
    Name,
    ParentId,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Notes {
    #[sea_orm(iden = "notes")]
    Table,
    Id,
    FolderId,
    Title,
    Tags,
    Text,
    Words,
    Pinned,
    Sticky,
    Color,
    OnOverview,
    TrashedAt,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Edits {
    #[sea_orm(iden = "note_edits")]
    Table,
    Id,
    NoteId,
    Data,
    ChunkOf,
    Part,
    Parts,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
