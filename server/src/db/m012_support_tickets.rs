//! Messages sent to support from the app, for admins to answer by email.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m012_support_tickets"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(SupportTickets::Table)
                .if_not_exists()
                .col(string(SupportTickets::Id).primary_key())
                // Who sent it, if signed in. Kept if the account goes: the
                // email address is enough to answer.
                .col(string_null(SupportTickets::UserId))
                .col(string(SupportTickets::Email))
                .col(string(SupportTickets::Kind))
                .col(string(SupportTickets::Subject))
                .col(text(SupportTickets::Message))
                .col(string(SupportTickets::AppVersion))
                .col(timestamp_with_time_zone(SupportTickets::CreatedAt))
                .col(timestamp_with_time_zone_null(SupportTickets::SolvedAt))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum SupportTickets {
    Table,
    Id,
    UserId,
    Email,
    Kind,
    Subject,
    Message,
    AppVersion,
    CreatedAt,
    SolvedAt,
}
