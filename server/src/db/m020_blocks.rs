//! Blocking in the Playground: someone you've blocked can't add you, cheer
//! you or reach you in Nexus, and you don't see each other there.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m020_blocks"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(PlaygroundBlocks::Table)
                .if_not_exists()
                .col(string(PlaygroundBlocks::BlockerId))
                .col(string(PlaygroundBlocks::BlockedId))
                .col(timestamp_with_time_zone(PlaygroundBlocks::CreatedAt))
                .primary_key(Index::create().col(PlaygroundBlocks::BlockerId).col(PlaygroundBlocks::BlockedId))
                .to_owned(),
        )
        .await?;
        // "Who's blocked me?", for hiding people from each other.
        m.create_index(
            Index::create().if_not_exists().name("idx_blocks_blocked").table(PlaygroundBlocks::Table).col(PlaygroundBlocks::BlockedId).to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum PlaygroundBlocks {
    Table,
    BlockerId,
    BlockedId,
    CreatedAt,
}
