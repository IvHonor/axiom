//! Friends for everyone: a handle (and so friends) no longer means taking
//! part in the Playground's boards. Everyone who'd joined before had both.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m019_social"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(PlaygroundPlayers::Table).add_column(boolean(PlaygroundPlayers::InPlayground).default(true)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum PlaygroundPlayers {
    Table,
    InPlayground,
}
