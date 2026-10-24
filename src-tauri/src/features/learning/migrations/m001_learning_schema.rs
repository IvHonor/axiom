//! Learning's tables: skills, the sources you learn them from, each source's
//! units (chapters, lectures, videos), and study sessions. Sync-ready like
//! every feature: text ids, `updated_at`, soft deletes.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_learning_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Skills::Table)
                .if_not_exists()
                .col(string(Skills::Id).primary_key())
                .col(string(Skills::Name))
                .col(string(Skills::Icon))
                .col(string(Skills::Color))
                .col(text(Skills::Why))
                .col(boolean(Skills::Archived))
                .col(double(Skills::Position))
                .col(timestamp_with_time_zone(Skills::CreatedAt))
                .col(timestamp_with_time_zone(Skills::UpdatedAt))
                .col(timestamp_with_time_zone_null(Skills::DeletedAt))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(Sources::Table)
                .if_not_exists()
                .col(string(Sources::Id).primary_key())
                .col(string(Sources::SkillId))
                .col(string(Sources::Kind))
                .col(string(Sources::Title))
                .col(string(Sources::Author))
                .col(string_null(Sources::Link))
                .col(string_null(Sources::CoverUrl))
                .col(string(Sources::UnitName))
                .col(date_null(Sources::FinishBy))
                .col(date_null(Sources::FinishedOn))
                .col(text(Sources::Notes))
                .col(double(Sources::Position))
                .col(timestamp_with_time_zone(Sources::CreatedAt))
                .col(timestamp_with_time_zone(Sources::UpdatedAt))
                .col(timestamp_with_time_zone_null(Sources::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_learning_sources_skill").table(Sources::Table).col(Sources::SkillId).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(Units::Table)
                .if_not_exists()
                .col(string(Units::Id).primary_key())
                .col(string(Units::SourceId))
                .col(string(Units::Title))
                .col(small_integer(Units::Level))
                .col(integer_null(Units::Minutes))
                .col(integer_null(Units::Page))
                .col(date_null(Units::DoneOn))
                .col(small_integer(Units::ReviewStage))
                .col(date_null(Units::ReviewOn))
                .col(text(Units::Notes))
                .col(double(Units::Position))
                .col(timestamp_with_time_zone(Units::CreatedAt))
                .col(timestamp_with_time_zone(Units::UpdatedAt))
                .col(timestamp_with_time_zone_null(Units::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_learning_units_source").table(Units::Table).col(Units::SourceId).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(Sessions::Table)
                .if_not_exists()
                .col(string(Sessions::Id).primary_key())
                .col(string(Sessions::SourceId))
                .col(date(Sessions::Day))
                .col(integer(Sessions::Minutes))
                .col(text(Sessions::Note))
                .col(timestamp_with_time_zone(Sessions::CreatedAt))
                .col(timestamp_with_time_zone(Sessions::UpdatedAt))
                .col(timestamp_with_time_zone_null(Sessions::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_learning_sessions_source").table(Sessions::Table).col(Sessions::SourceId).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Skills {
    #[sea_orm(iden = "learning_skills")]
    Table,
    Id,
    Name,
    Icon,
    Color,
    Why,
    Archived,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Sources {
    #[sea_orm(iden = "learning_sources")]
    Table,
    Id,
    SkillId,
    Kind,
    Title,
    Author,
    Link,
    CoverUrl,
    UnitName,
    FinishBy,
    FinishedOn,
    Notes,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Units {
    #[sea_orm(iden = "learning_units")]
    Table,
    Id,
    SourceId,
    Title,
    Level,
    Minutes,
    Page,
    DoneOn,
    ReviewStage,
    ReviewOn,
    Notes,
    Position,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Sessions {
    #[sea_orm(iden = "learning_sessions")]
    Table,
    Id,
    SourceId,
    Day,
    Minutes,
    Note,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
