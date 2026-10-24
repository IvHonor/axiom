//! The waiting list: an account can only sign in once an admin approves it.
//! Accounts made before the waiting list existed count as approved.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m005_waitlist"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Users::Table).add_column(timestamp_with_time_zone_null(Users::ApprovedAt)).to_owned())
            .await?;
        m.exec_stmt(Query::update().table(Users::Table).value(Users::ApprovedAt, Expr::col(Users::CreatedAt)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    CreatedAt,
    ApprovedAt,
}
