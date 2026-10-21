//! The database layer. Every query in Axiom goes through this module.
//!
//! Data lives in a local SQLite file in the app's data folder, so everything
//! works offline and every action is instant. Syncing with an account
//! (`crate::sync`) copies changes to and from the server in the background.

pub mod migrations;

use std::path::Path;
use std::time::Duration;

use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbErr};
use sea_orm_migration::MigratorTrait;
use serde::Serialize;
use tokio::sync::RwLock;

use crate::error::{Error, Result};
use migrations::Migrator;

/// Shared database handle, stored in Tauri's managed state.
/// Commands receive it as `db: tauri::State<'_, Db>`.
#[derive(Default)]
pub struct Db {
    state: RwLock<State>,
}

#[derive(Default)]
enum State {
    #[default]
    Connecting,
    Connected(DatabaseConnection),
    Failed(String),
}

/// The connection state as the frontend sees it.
/// Mirrored by `DbStatus` in `src/lib/backend.ts`.
#[derive(Clone, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum DbStatus {
    Connecting,
    Connected,
    Error { message: String },
}

/// How long a command waits for the startup connection before giving up.
const CONNECT_WAIT: Duration = Duration::from_secs(20);

impl Db {
    /// Opens (or creates) the database file and applies pending migrations. Called once at startup.
    pub async fn connect(&self, file: &Path) {
        let next = match open(file).await {
            Ok(conn) => State::Connected(conn),
            Err(err) => State::Failed(err.to_string()),
        };
        *self.state.write().await = next;
    }

    /// The live connection, for feature commands to run queries on.
    /// If the app is still starting up, waits for it rather than failing.
    pub async fn conn(&self) -> Result<DatabaseConnection> {
        let started = tokio::time::Instant::now();
        loop {
            match &*self.state.read().await {
                State::Connected(conn) => return Ok(conn.clone()),
                State::Failed(message) => return Err(Error::Unavailable(message.clone())),
                State::Connecting if started.elapsed() > CONNECT_WAIT => {
                    return Err(Error::Unavailable("Axiom took too long to open your data. Restart the app.".into()));
                }
                State::Connecting => {}
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    pub async fn status(&self) -> DbStatus {
        match &*self.state.read().await {
            State::Connecting => DbStatus::Connecting,
            State::Connected(_) => DbStatus::Connected,
            State::Failed(message) => DbStatus::Error {
                message: message.clone(),
            },
        }
    }
}

async fn open(file: &Path) -> std::result::Result<DatabaseConnection, DbErr> {
    if let Some(folder) = file.parent() {
        std::fs::create_dir_all(folder).map_err(|e| DbErr::Custom(format!("Can't create {}: {e}", folder.display())))?;
    }
    // mode=rwc creates the file on first launch.
    let url = format!("sqlite://{}?mode=rwc", file.to_string_lossy().replace('\\', "/"));
    let mut options = ConnectOptions::new(url);
    // One connection: SQLite allows one writer at a time anyway, and it keeps
    // every command in a strict order.
    options.max_connections(1).sqlx_logging(false);

    let conn = Database::connect(options).await?;
    // Write-ahead logging: faster writes, and reads never wait on them.
    conn.execute_unprepared("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;").await?;
    prepare(&conn).await?;
    Ok(conn)
}

/// Brings a database up to date: migrations, then sync's change triggers.
pub async fn prepare(conn: &DatabaseConnection) -> std::result::Result<(), DbErr> {
    Migrator::up(conn, None).await?;
    crate::sync::local::install_triggers(conn).await
}

/// A new id: a UUIDv7, unique across devices and sortable by creation time.
pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

/// Stamps `updated_at` whenever a row is inserted or updated, so sync can
/// tell what changed. (Bulk `update_many` calls set it themselves.) Call it
/// once in each entity module: `crate::db::stamp_updated_at!();`
macro_rules! stamp_updated_at {
    () => {
        #[async_trait::async_trait]
        impl ActiveModelBehavior for ActiveModel {
            async fn before_save<C: ConnectionTrait>(mut self, _db: &C, _insert: bool) -> Result<Self, DbErr> {
                self.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now());
                Ok(self)
            }
        }
    };
}
pub(crate) use stamp_updated_at;
