//! Calendar sign-ins sync to the person's other computers, end-to-end
//! encrypted, so a calendar connected on one works on all of them. One row
//! per calendar account, with the same id.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m010_daily_plan_calendar_secrets"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(Secrets::Table)
                .if_not_exists()
                .col(string(Secrets::Id).primary_key())
                .col(text(Secrets::Secret))
                .col(timestamp_with_time_zone(Secrets::UpdatedAt))
                .col(timestamp_with_time_zone_null(Secrets::DeletedAt))
                .to_owned(),
        )
        .await
    }
}

#[derive(DeriveIden)]
enum Secrets {
    #[sea_orm(iden = "daily_plan_calendar_secrets")]
    Table,
    Id,
    Secret,
    UpdatedAt,
    DeletedAt,
}
