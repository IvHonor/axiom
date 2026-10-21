//! Every feature's database migrations, applied in order at startup.
//! SeaORM records which ones have run in a `seaql_migrations` table, so each
//! runs exactly once. Add a feature's migrations to the list below.

use sea_orm_migration::prelude::*;

use crate::features::project_board;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        let mut all = Vec::new();
        all.extend(project_board::migrations::all());
        all.extend(crate::sync::migrations::all());
        all
    }
}
