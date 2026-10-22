//! Shared boards ("spaces"): a project shared between accounts, its members
//! and their roles, invitations, and the shared rows themselves. Rows work
//! like `sync_records`, but belong to the space instead of one account.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m004_spaces"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Spaces::Table)
                .if_not_exists()
                // The shared project's id.
                .col(string(Spaces::Id).primary_key())
                .col(string(Spaces::OwnerId))
                // The space's change counter, like users.sync_seq.
                .col(big_integer(Spaces::Seq).default(0))
                .col(timestamp_with_time_zone(Spaces::CreatedAt))
                .foreign_key(ForeignKey::create().from(Spaces::Table, Spaces::OwnerId).to(Users::Table, Users::Id).on_delete(ForeignKeyAction::Cascade))
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(SpaceMembers::Table)
                .if_not_exists()
                .col(string(SpaceMembers::SpaceId))
                .col(string(SpaceMembers::UserId))
                // "owner", "admin", "editor" or "viewer".
                .col(string(SpaceMembers::Role))
                .col(timestamp_with_time_zone(SpaceMembers::JoinedAt))
                .primary_key(Index::create().col(SpaceMembers::SpaceId).col(SpaceMembers::UserId))
                .foreign_key(
                    ForeignKey::create().from(SpaceMembers::Table, SpaceMembers::SpaceId).to(Spaces::Table, Spaces::Id).on_delete(ForeignKeyAction::Cascade),
                )
                .foreign_key(
                    ForeignKey::create().from(SpaceMembers::Table, SpaceMembers::UserId).to(Users::Table, Users::Id).on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        // "Which spaces am I in?"
        m.create_index(Index::create().if_not_exists().name("idx_space_members_user").table(SpaceMembers::Table).col(SpaceMembers::UserId).to_owned())
            .await?;

        m.create_table(
            Table::create()
                .table(SpaceInvites::Table)
                .if_not_exists()
                .col(string(SpaceInvites::Id).primary_key())
                .col(string(SpaceInvites::SpaceId))
                // Normalised, like users.email; the account may not exist yet.
                .col(string(SpaceInvites::Email))
                .col(string(SpaceInvites::Role))
                .col(string(SpaceInvites::InvitedBy))
                .col(timestamp_with_time_zone(SpaceInvites::CreatedAt))
                .col(timestamp_with_time_zone(SpaceInvites::ExpiresAt))
                .col(timestamp_with_time_zone_null(SpaceInvites::AcceptedAt))
                // Declined by them or withdrawn by an admin.
                .col(timestamp_with_time_zone_null(SpaceInvites::ClosedAt))
                .foreign_key(
                    ForeignKey::create().from(SpaceInvites::Table, SpaceInvites::SpaceId).to(Spaces::Table, Spaces::Id).on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().if_not_exists().name("idx_space_invites_email").table(SpaceInvites::Table).col(SpaceInvites::Email).to_owned())
            .await?;

        m.create_table(
            Table::create()
                .table(SpaceRecords::Table)
                .if_not_exists()
                .col(string(SpaceRecords::SpaceId))
                .col(string(SpaceRecords::TableName))
                .col(string(SpaceRecords::RecordId))
                .col(text(SpaceRecords::Data))
                .col(text(SpaceRecords::FieldTimes))
                .col(big_integer(SpaceRecords::Seq))
                .primary_key(Index::create().col(SpaceRecords::SpaceId).col(SpaceRecords::TableName).col(SpaceRecords::RecordId))
                .foreign_key(
                    ForeignKey::create().from(SpaceRecords::Table, SpaceRecords::SpaceId).to(Spaces::Table, Spaces::Id).on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;
        m.create_index(
            Index::create().if_not_exists().name("idx_space_records_seq").table(SpaceRecords::Table).col(SpaceRecords::SpaceId).col(SpaceRecords::Seq).to_owned(),
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
enum Spaces {
    Table,
    Id,
    OwnerId,
    Seq,
    CreatedAt,
}

#[derive(DeriveIden)]
enum SpaceMembers {
    Table,
    SpaceId,
    UserId,
    Role,
    JoinedAt,
}

#[derive(DeriveIden)]
enum SpaceInvites {
    Table,
    Id,
    SpaceId,
    Email,
    Role,
    InvitedBy,
    CreatedAt,
    ExpiresAt,
    AcceptedAt,
    ClosedAt,
}

#[derive(DeriveIden)]
enum SpaceRecords {
    Table,
    SpaceId,
    TableName,
    RecordId,
    Data,
    FieldTimes,
    Seq,
}
