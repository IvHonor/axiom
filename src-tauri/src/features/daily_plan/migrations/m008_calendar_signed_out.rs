//! Remembers when a calendar account's sign-in stopped working, so the
//! Calendars dialog can offer to reconnect it.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m008_daily_plan_calendar_signed_out"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Accounts::Table).add_column(boolean(Accounts::SignedOut).default(false)).to_owned()).await?;
        // Accounts already showing a sign-in problem get the button straight away.
        m.exec_stmt(
            Query::update()
                .table(Accounts::Table)
                .value(Accounts::SignedOut, true)
                .and_where(Expr::col(Accounts::Problem).like("%econnect%"))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Accounts {
    #[sea_orm(iden = "daily_plan_calendar_accounts")]
    Table,
    Problem,
    SignedOut,
}
