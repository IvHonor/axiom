//! Deadlines on tasks: when something has to be done by, apart from the
//! day it's planned for (or none, in the inbox).

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m007_daily_plan_task_deadlines"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.alter_table(Table::alter().table(Tasks::Table).add_column(date_null(Tasks::DueDate)).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Tasks {
    #[sea_orm(iden = "daily_plan_tasks")]
    Table,
    DueDate,
}
