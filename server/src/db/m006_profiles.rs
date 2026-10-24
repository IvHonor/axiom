//! A profile on each account: the name to show and a profile picture.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m006_profiles"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        // One column per statement: SQLite can't add several at once.
        m.alter_table(Table::alter().table(Users::Table).add_column(string_null(Users::DisplayName)).to_owned()).await?;
        m.alter_table(Table::alter().table(Users::Table).add_column(text_null(Users::Avatar)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    DisplayName,
    Avatar,
}
