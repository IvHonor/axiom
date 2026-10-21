//! Codes emailed for resetting a forgotten password.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m003_password_resets"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(PasswordResets::Table)
                .if_not_exists()
                .col(string(PasswordResets::Id).primary_key())
                .col(string(PasswordResets::UserId))
                // Only a hash of the code, like refresh tokens.
                .col(string(PasswordResets::CodeHash))
                .col(integer(PasswordResets::Attempts).default(0))
                .col(timestamp_with_time_zone(PasswordResets::CreatedAt))
                .col(timestamp_with_time_zone(PasswordResets::ExpiresAt))
                .col(timestamp_with_time_zone_null(PasswordResets::UsedAt))
                .foreign_key(
                    ForeignKey::create()
                        .from(PasswordResets::Table, PasswordResets::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        m.create_index(
            Index::create()
                .if_not_exists()
                .name("idx_password_resets_user_id")
                .table(PasswordResets::Table)
                .col(PasswordResets::UserId)
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum PasswordResets {
    Table,
    Id,
    UserId,
    CodeHash,
    Attempts,
    CreatedAt,
    ExpiresAt,
    UsedAt,
}
