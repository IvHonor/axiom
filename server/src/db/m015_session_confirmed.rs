//! Whether a device has used the tokens from its last refresh, so a refresh
//! whose answer was lost can be retried later without looking like theft.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m015_session_confirmed"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Sessions::Table).add_column(boolean(Sessions::Confirmed).default(true)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Sessions {
    Table,
    Confirmed,
}
