//! What each account's assistant use cost, day by day, for the admin panel:
//! questions asked, tokens read and written, words heard, and what went wrong.
//! Counts only: what was asked and answered is never kept.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m017_ai_usage_detail"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        // One column at a time: SQLite (in tests) alters one per statement.
        for column in [
            integer(AiUsage::Prompts).default(0).to_owned(),
            big_integer(AiUsage::InputTokens).default(0).to_owned(),
            big_integer(AiUsage::CachedTokens).default(0).to_owned(),
            big_integer(AiUsage::OutputTokens).default(0).to_owned(),
            integer(AiUsage::Transcriptions).default(0).to_owned(),
            integer(AiUsage::Failures).default(0).to_owned(),
            text_null(AiUsage::LastError),
            timestamp_with_time_zone_null(AiUsage::LastUsedAt),
        ] {
            m.alter_table(Table::alter().table(AiUsage::Table).add_column(column).to_owned()).await?;
        }
        Ok(())
    }
}

#[derive(DeriveIden)]
enum AiUsage {
    Table,
    Prompts,
    InputTokens,
    CachedTokens,
    OutputTokens,
    Transcriptions,
    Failures,
    LastError,
    LastUsedAt,
}
