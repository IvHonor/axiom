//! The profile settings table. Never edit or rename a migration that has
//! shipped; add a new one instead.

use sea_orm_migration::{prelude::*, schema::*};

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(Migration)]
}

struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_profile_settings"
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
                .col(text(Settings::Value))
                .col(timestamp_with_time_zone(Settings::UpdatedAt))
                .col(timestamp_with_time_zone_null(Settings::DeletedAt))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Settings {
    #[sea_orm(iden = "profile_settings")]
    Table,
    Id,
    Value,
    UpdatedAt,
    DeletedAt,
}
