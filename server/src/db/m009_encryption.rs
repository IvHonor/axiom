//! End-to-end encryption: each account's key, wrapped on a device with the
//! user's password and recovery key. The server can't unwrap it.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m009_encryption"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Users::Table).add_column(text_null(Users::EncryptionKey)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    EncryptionKey,
}
