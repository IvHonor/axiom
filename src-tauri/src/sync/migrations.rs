//! The local bookkeeping sync needs, next to the feature tables.

use sea_orm_migration::prelude::*;

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(Migration), Box::new(SharedBoards)]
}

/// Shared boards this computer syncs, besides the account's own data.
pub struct SharedBoards;

impl MigrationName for SharedBoards {
    fn name(&self) -> &str {
        "m002_sync_shared_boards"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for SharedBoards {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "
                -- One row per shared board you're in (the project's id), with your
                -- role and how far its changes have been pulled.
                CREATE TABLE IF NOT EXISTS sync_spaces (
                    id TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT '',
                    owner_email TEXT NOT NULL DEFAULT '',
                    members INTEGER NOT NULL DEFAULT 1,
                    cursor INTEGER NOT NULL DEFAULT 0
                );
                ",
            )
            .await?;
        Ok(())
    }
}

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m001_sync_bookkeeping"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection()
            .execute_unprepared(
                "
                -- Rows changed on this device and not yet pushed. Filled by triggers
                -- (see local::install_triggers). `version` goes up on every change,
                -- so an edit made during a push isn't mistaken for the pushed one.
                CREATE TABLE IF NOT EXISTS sync_outbox (
                    table_name TEXT NOT NULL,
                    row_id TEXT NOT NULL,
                    changed_at INTEGER NOT NULL,
                    version INTEGER NOT NULL,
                    PRIMARY KEY (table_name, row_id)
                );

                -- Each row as the server last saw it. A push sends only the fields
                -- that differ from this.
                CREATE TABLE IF NOT EXISTS sync_base (
                    table_name TEXT NOT NULL,
                    row_id TEXT NOT NULL,
                    data TEXT NOT NULL,
                    PRIMARY KEY (table_name, row_id)
                );

                -- One row: which account this data belongs to, and how far it has pulled.
                CREATE TABLE IF NOT EXISTS sync_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    user_id TEXT,
                    cursor INTEGER NOT NULL DEFAULT 0,
                    last_synced_at TEXT
                );
                INSERT OR IGNORE INTO sync_state (id) VALUES (1);
                ",
            )
            .await?;
        Ok(())
    }
}
