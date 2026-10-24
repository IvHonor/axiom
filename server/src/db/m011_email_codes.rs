//! Codes emailed to prove someone reads an address: confirming it at sign-up,
//! and turning off the app lock after a forgotten PIN. Accounts made before
//! confirmation count as confirmed.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m011_email_codes"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Users::Table).add_column(timestamp_with_time_zone_null(Users::EmailConfirmedAt)).to_owned()).await?;
        m.exec_stmt(Query::update().table(Users::Table).value(Users::EmailConfirmedAt, Expr::col(Users::CreatedAt)).to_owned()).await?;
        m.create_table(
            Table::create()
                .table(EmailCodes::Table)
                .if_not_exists()
                .col(string(EmailCodes::Id).primary_key())
                .col(string(EmailCodes::UserId))
                // "confirm_email" or "unlock_app".
                .col(string(EmailCodes::Purpose))
                // Only a hash of the code, like reset codes.
                .col(string(EmailCodes::CodeHash))
                .col(integer(EmailCodes::Attempts).default(0))
                .col(timestamp_with_time_zone(EmailCodes::CreatedAt))
                .col(timestamp_with_time_zone(EmailCodes::ExpiresAt))
                .col(timestamp_with_time_zone_null(EmailCodes::UsedAt))
                .foreign_key(
                    ForeignKey::create()
                        .from(EmailCodes::Table, EmailCodes::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().if_not_exists().name("idx_email_codes_user_id").table(EmailCodes::Table).col(EmailCodes::UserId).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
    CreatedAt,
    EmailConfirmedAt,
}

#[derive(DeriveIden)]
enum EmailCodes {
    Table,
    Id,
    UserId,
    Purpose,
    CodeHash,
    Attempts,
    CreatedAt,
    ExpiresAt,
    UsedAt,
}
