//! The notifications tables. Never edit or rename a migration that has
//! shipped; add a new one instead.

use sea_orm_migration::{prelude::*, schema::*};

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(Migration)]
}

struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_notifications"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Settings::Table)
                .if_not_exists()
                .col(string(Settings::Id).primary_key())
                .col(boolean(Settings::InApp))
                .col(boolean(Settings::Desktop))
                .col(boolean(Settings::Email))
                .col(timestamp_with_time_zone(Settings::UpdatedAt))
                .col(timestamp_with_time_zone_null(Settings::DeletedAt))
                .to_owned(),
        )
        .await?;
        m.create_table(
            Table::create()
                .table(Notes::Table)
                .if_not_exists()
                .col(string(Notes::Id).primary_key())
                .col(string(Notes::Kind))
                .col(string(Notes::Title))
                .col(text(Notes::Body))
                .col(boolean(Notes::InApp))
                .col(timestamp_with_time_zone(Notes::CreatedAt))
                .col(timestamp_with_time_zone_null(Notes::ReadAt))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Settings {
    #[sea_orm(iden = "notification_settings")]
    Table,
    Id,
    InApp,
    Desktop,
    Email,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
enum Notes {
    #[sea_orm(iden = "notifications")]
    Table,
    Id,
    Kind,
    Title,
    Body,
    InApp,
    CreatedAt,
    ReadAt,
}
