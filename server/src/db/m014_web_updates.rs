//! People who asked to hear when Axiom on the web opens. Just the address
//! and when they asked: nothing else, and no account needed.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m014_web_updates"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(WebUpdates::Table)
                .if_not_exists()
                .col(string(WebUpdates::Email).primary_key())
                .col(timestamp_with_time_zone(WebUpdates::CreatedAt))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum WebUpdates {
    Table,
    Email,
    CreatedAt,
}
