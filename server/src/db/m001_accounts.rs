//! Accounts and their signed-in devices.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_accounts"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Users::Table)
                .if_not_exists()
                .col(string(Users::Id).primary_key())
                .col(string_uniq(Users::Email))
                .col(string(Users::PasswordHash))
                .col(timestamp_with_time_zone(Users::CreatedAt))
                .to_owned(),
        )
        .await?;

        // One row per signed-in device. Only hashes of refresh tokens are
        // stored, so a leaked database can't be used to sign in.
        m.create_table(
            Table::create()
                .table(Sessions::Table)
                .if_not_exists()
                .col(string(Sessions::Id).primary_key())
                .col(string(Sessions::UserId))
                .col(string(Sessions::DeviceName))
                .col(string_uniq(Sessions::RefreshHash))
                .col(string_null(Sessions::PreviousHash))
                .col(timestamp_with_time_zone(Sessions::CreatedAt))
                .col(timestamp_with_time_zone(Sessions::LastUsedAt))
                .col(timestamp_with_time_zone(Sessions::ExpiresAt))
                .col(timestamp_with_time_zone_null(Sessions::RevokedAt))
                .foreign_key(
                    ForeignKey::create()
                        .from(Sessions::Table, Sessions::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;

        for (name, column) in [
            ("idx_sessions_user_id", Sessions::UserId),
            ("idx_sessions_previous_hash", Sessions::PreviousHash),
        ] {
            m.create_index(Index::create().if_not_exists().name(name).table(Sessions::Table).col(column).to_owned())
                .await?;
        }
        Ok(())
    }
}

#[derive(DeriveIden, Clone)]
enum Users {
    Table,
    Id,
    Email,
    PasswordHash,
    CreatedAt,
}

#[derive(DeriveIden, Clone)]
enum Sessions {
    Table,
    Id,
    UserId,
    DeviceName,
    RefreshHash,
    PreviousHash,
    CreatedAt,
    LastUsedAt,
    ExpiresAt,
    RevokedAt,
}
