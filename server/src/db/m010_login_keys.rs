//! Login keys: whether an account's password hash is of a login key made on
//! the device, or (from before them) of the password itself.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m010_login_keys"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Users::Table).add_column(boolean(Users::LoginKey).default(false)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    LoginKey,
}
