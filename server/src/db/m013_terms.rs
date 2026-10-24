//! Which version of the terms each account agreed to at sign-up, and when.
//! Accounts made before there were terms have neither.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m013_terms"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Users::Table).add_column(string_null(Users::TermsVersion)).to_owned()).await?;
        m.alter_table(Table::alter().table(Users::Table).add_column(timestamp_with_time_zone_null(Users::TermsAcceptedAt)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    TermsVersion,
    TermsAcceptedAt,
}
