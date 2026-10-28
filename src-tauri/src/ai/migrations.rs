//! The assistant's tables. Never edit or rename a migration that has
//! shipped; add a new one instead.

use sea_orm_migration::{prelude::*, schema::*};

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(Migration), Box::new(UndoMigration)]
}

/// What confirmed changes touched, so they can be undone (see `undo`). On
/// this computer only: it isn't synced.
struct UndoMigration;

impl MigrationName for UndoMigration {
    fn name(&self) -> &str {
        "m002_assistant_undo"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for UndoMigration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Undo::Table)
                .if_not_exists()
                .col(string(Undo::ProposalId).primary_key())
                .col(text(Undo::Data))
                .col(timestamp_with_time_zone(Undo::CreatedAt))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Undo {
    #[sea_orm(iden = "assistant_undo")]
    Table,
    ProposalId,
    Data,
    CreatedAt,
}

struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_assistant_schema"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Chats::Table)
                .if_not_exists()
                .col(string(Chats::Id).primary_key())
                .col(string(Chats::Title))
                .col(timestamp_with_time_zone(Chats::CreatedAt))
                .col(timestamp_with_time_zone(Chats::UpdatedAt))
                .col(timestamp_with_time_zone_null(Chats::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_table(
            Table::create()
                .table(Messages::Table)
                .if_not_exists()
                .col(string(Messages::Id).primary_key())
                .col(string(Messages::ChatId))
                .col(big_integer(Messages::Position))
                .col(string(Messages::Role))
                .col(text_null(Messages::Text))
                .col(text_null(Messages::Data))
                .col(string_null(Messages::Provider))
                .col(timestamp_with_time_zone(Messages::CreatedAt))
                .col(timestamp_with_time_zone(Messages::UpdatedAt))
                .col(timestamp_with_time_zone_null(Messages::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_assistant_messages_chat").table(Messages::Table).col(Messages::ChatId).to_owned()).await?;
        m.create_table(
            Table::create()
                .table(Proposals::Table)
                .if_not_exists()
                .col(string(Proposals::Id).primary_key())
                .col(string(Proposals::ChatId))
                .col(string(Proposals::CallId))
                .col(string(Proposals::Area))
                .col(string(Proposals::Tool))
                .col(text(Proposals::Arguments))
                .col(text(Proposals::Preview))
                .col(string(Proposals::Status))
                .col(text_null(Proposals::Outcome))
                .col(timestamp_with_time_zone(Proposals::CreatedAt))
                .col(timestamp_with_time_zone(Proposals::UpdatedAt))
                .col(timestamp_with_time_zone_null(Proposals::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().name("idx_assistant_proposals_chat").table(Proposals::Table).col(Proposals::ChatId).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Chats {
    #[sea_orm(iden = "assistant_chats")]
    Table,
    Id,
    Title,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Messages {
    #[sea_orm(iden = "assistant_messages")]
    Table,
    Id,
    ChatId,
    Position,
    Role,
    Text,
    Data,
    Provider,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Proposals {
    #[sea_orm(iden = "assistant_proposals")]
    Table,
    Id,
    ChatId,
    CallId,
    Area,
    Tool,
    Arguments,
    Preview,
    Status,
    Outcome,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}
