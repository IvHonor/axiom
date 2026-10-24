//! Roles and permissions on accounts, and the server's own settings (the
//! waiting list and what new accounts may use), changed from the admin panel.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m008_roles"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        // Everyone so far is a member who may use everything.
        m.alter_table(Table::alter().table(Users::Table).add_column(string(Users::Role).default("member")).to_owned()).await?;
        m.alter_table(Table::alter().table(Users::Table).add_column(string(Users::Permissions).default("sync,share,email")).to_owned())
            .await?;
        m.create_table(
            Table::create()
                .table(ServerSettings::Table)
                .if_not_exists()
                .col(integer(ServerSettings::Id).primary_key())
                // None follows WAITLIST from the environment.
                .col(boolean_null(ServerSettings::Waitlist))
                .col(string(ServerSettings::DefaultPermissions))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Role,
    Permissions,
}

#[derive(DeriveIden)]
enum ServerSettings {
    Table,
    Id,
    Waitlist,
    DefaultPermissions,
}
