//! The Reading Tracker's tables: books, the reading log, notes, past reads
//! and yearly goals. Sync-ready like every feature: text ids, `updated_at`,
//! soft deletes.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_reading_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Books::Table)
                .if_not_exists()
                .col(string(Books::Id).primary_key())
                .col(string(Books::Title))
                .col(string(Books::Authors))
                .col(string_null(Books::CoverUrl))
                .col(string_null(Books::WorkKey))
                .col(string_null(Books::EditionKey))
                .col(string_null(Books::Isbn))
                .col(integer_null(Books::PublishedYear))
                .col(integer_null(Books::ApiPages))
                .col(integer_null(Books::Pages))
                .col(string(Books::Format))
                .col(string(Books::Unit))
                .col(integer_null(Books::AudioMinutes))
                .col(string(Books::Status))
                .col(integer(Books::Progress))
                .col(small_integer_null(Books::Rating))
                .col(text(Books::Review))
                .col(date_null(Books::StartedOn))
                .col(date_null(Books::FinishedOn))
                .col(double(Books::Position))
                .col(timestamp_with_time_zone(Books::CreatedAt))
                .col(timestamp_with_time_zone(Books::UpdatedAt))
                .col(timestamp_with_time_zone_null(Books::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Sessions::Table)
                .if_not_exists()
                .col(string(Sessions::Id).primary_key())
                .col(string(Sessions::BookId))
                .col(date(Sessions::Day))
                .col(integer(Sessions::StartProgress))
                .col(integer(Sessions::EndProgress))
                .col(string(Sessions::Unit))
                .col(integer(Sessions::Pages))
                .col(integer(Sessions::Minutes))
                .col(timestamp_with_time_zone(Sessions::CreatedAt))
                .col(timestamp_with_time_zone(Sessions::UpdatedAt))
                .col(timestamp_with_time_zone_null(Sessions::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_reading_sessions_book").table(Sessions::Table).col(Sessions::BookId).to_owned())
            .await?;

        m.create_table(
            Table::create()
                .table(Notes::Table)
                .if_not_exists()
                .col(string(Notes::Id).primary_key())
                .col(string(Notes::BookId))
                .col(string(Notes::Kind))
                .col(integer_null(Notes::Page))
                .col(text(Notes::Text))
                .col(timestamp_with_time_zone(Notes::CreatedAt))
                .col(timestamp_with_time_zone(Notes::UpdatedAt))
                .col(timestamp_with_time_zone_null(Notes::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_reading_notes_book").table(Notes::Table).col(Notes::BookId).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(Reads::Table)
                .if_not_exists()
                .col(string(Reads::Id).primary_key())
                .col(string(Reads::BookId))
                .col(date_null(Reads::StartedOn))
                .col(date_null(Reads::FinishedOn))
                .col(string(Reads::Outcome))
                .col(small_integer_null(Reads::Rating))
                .col(timestamp_with_time_zone(Reads::CreatedAt))
                .col(timestamp_with_time_zone(Reads::UpdatedAt))
                .col(timestamp_with_time_zone_null(Reads::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Goals::Table)
                .if_not_exists()
                .col(string(Goals::Id).primary_key())
                .col(integer(Goals::Year))
                .col(integer(Goals::Books))
                .col(timestamp_with_time_zone(Goals::CreatedAt))
                .col(timestamp_with_time_zone(Goals::UpdatedAt))
                .col(timestamp_with_time_zone_null(Goals::DeletedAt))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Books {
    #[sea_orm(iden = "reading_books")]
    Table,
    Id,
    Title,
    Authors,
    CoverUrl,
    WorkKey,
    EditionKey,
    Isbn,
    PublishedYear,
    ApiPages,
    Pages,
    Format,
    Unit,
    AudioMinutes,
    Status,
    Progress,
    Rating,
    Review,
    StartedOn,
    FinishedOn,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Sessions {
    #[sea_orm(iden = "reading_sessions")]
    Table,
    Id,
    BookId,
    Day,
    StartProgress,
    EndProgress,
    Unit,
    Pages,
    Minutes,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Notes {
    #[sea_orm(iden = "reading_notes")]
    Table,
    Id,
    BookId,
    Kind,
    Page,
    Text,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Reads {
    #[sea_orm(iden = "reading_reads")]
    Table,
    Id,
    BookId,
    StartedOn,
    FinishedOn,
    Outcome,
    Rating,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Goals {
    #[sea_orm(iden = "reading_goals")]
    Table,
    Id,
    Year,
    Books,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
