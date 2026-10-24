//! Notification emails: the ones the app has planned, and the kinds someone
//! unsubscribed from with the link in an email.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m007_notifications"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(PlannedEmails::Table)
                .if_not_exists()
                .col(string(PlannedEmails::UserId))
                .col(string(PlannedEmails::Key))
                .col(string(PlannedEmails::Kind))
                .col(timestamp_with_time_zone(PlannedEmails::SendAt))
                // The digest as JSON (axiom_protocol::notify::Digest).
                .col(text(PlannedEmails::Digest))
                .col(timestamp_with_time_zone_null(PlannedEmails::SentAt))
                .primary_key(Index::create().col(PlannedEmails::UserId).col(PlannedEmails::Key))
                .to_owned(),
        )
        .await?;
        // The sender looks for what's due across every account.
        m.create_index(
            Index::create()
                .if_not_exists()
                .name("idx_planned_emails_due")
                .table(PlannedEmails::Table)
                .col(PlannedEmails::SentAt)
                .col(PlannedEmails::SendAt)
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(EmailOptOuts::Table)
                .if_not_exists()
                .col(string(EmailOptOuts::UserId))
                .col(string(EmailOptOuts::Kind))
                .col(timestamp_with_time_zone(EmailOptOuts::At))
                .primary_key(Index::create().col(EmailOptOuts::UserId).col(EmailOptOuts::Kind))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum PlannedEmails {
    Table,
    UserId,
    Key,
    Kind,
    SendAt,
    Digest,
    SentAt,
}

#[derive(DeriveIden)]
enum EmailOptOuts {
    Table,
    UserId,
    Kind,
    At,
}
