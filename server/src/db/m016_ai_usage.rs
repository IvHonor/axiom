//! The assistant's daily allowances, counted in the database so they hold
//! across restarts (the free host sleeps when idle, and every deploy restarts it).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m016_ai_usage"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(AiUsage::Table)
                .if_not_exists()
                .col(string(AiUsage::UserId))
                .col(date(AiUsage::Day))
                .col(integer(AiUsage::Count))
                .primary_key(Index::create().col(AiUsage::UserId).col(AiUsage::Day))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum AiUsage {
    Table,
    UserId,
    Day,
    Count,
}
