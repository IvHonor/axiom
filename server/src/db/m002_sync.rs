//! Synced data. The server doesn't know what a task or a project is: every
//! row from every device is a JSON object filed under its table and id, so a
//! new feature syncs without any server change.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m002_sync"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        // Each account's change counter. Pushes lock the user's row while
        // they take numbers, so numbers are handed out in commit order.
        m.alter_table(Table::alter().table(Users::Table).add_column(big_integer(Users::SyncSeq).default(0)).to_owned())
            .await?;

        m.create_table(
            Table::create()
                .table(SyncRecords::Table)
                .if_not_exists()
                .col(string(SyncRecords::UserId))
                .col(string(SyncRecords::TableName))
                .col(string(SyncRecords::RecordId))
                .col(text(SyncRecords::Data))
                .col(text(SyncRecords::FieldTimes))
                .col(big_integer(SyncRecords::Seq))
                .primary_key(
                    Index::create()
                        .col(SyncRecords::UserId)
                        .col(SyncRecords::TableName)
                        .col(SyncRecords::RecordId),
                )
                .foreign_key(
                    ForeignKey::create()
                        .from(SyncRecords::Table, SyncRecords::UserId)
                        .to(Users::Table, Users::Id)
                        .on_delete(ForeignKeyAction::Cascade),
                )
                .to_owned(),
        )
        .await?;

        // Pulls read "this account's records after number N".
        m.create_index(
            Index::create()
                .if_not_exists()
                .name("idx_sync_records_user_seq")
                .table(SyncRecords::Table)
                .col(SyncRecords::UserId)
                .col(SyncRecords::Seq)
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
    SyncSeq,
}

#[derive(DeriveIden)]
enum SyncRecords {
    Table,
    UserId,
    TableName,
    RecordId,
    Data,
    FieldTimes,
    Seq,
}
