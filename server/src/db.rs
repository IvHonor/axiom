//! Connects to the database and brings its tables up to date.

mod m001_accounts;
mod m002_sync;
mod m003_password_resets;
mod m004_spaces;

use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};
use sea_orm_migration::prelude::*;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m001_accounts::Migration),
            Box::new(m002_sync::Migration),
            Box::new(m003_password_resets::Migration),
            Box::new(m004_spaces::Migration),
        ]
    }

    /// Its own name, so it never mixes with another app's `seaql_migrations`
    /// table in the same database.
    fn migration_table_name() -> DynIden {
        Alias::new("axiom_server_migrations").into_iden()
    }
}

pub async fn connect(url: &str) -> Result<DatabaseConnection, DbErr> {
    let mut options = ConnectOptions::new(url);
    options.sqlx_logging(false);
    if url.starts_with("sqlite") {
        // An in-memory SQLite database exists per connection, so use exactly one.
        options.max_connections(1);
    } else {
        options.max_connections(10);
    }
    let db = Database::connect(options).await?;
    Migrator::up(&db, None).await?;
    Ok(db)
}
