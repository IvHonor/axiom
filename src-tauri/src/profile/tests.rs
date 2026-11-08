use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection};
use serde_json::json;

use super::*;

async fn db() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

async fn pending(db: &DatabaseConnection) -> i64 {
    let row = db.query_one_raw(Statement::from_string(DbBackend::Sqlite, "SELECT COUNT(*) AS n FROM sync_outbox WHERE table_name = 'profile_settings'")).await.unwrap().unwrap();
    row.try_get("", "n").unwrap()
}

#[tokio::test]
async fn saves_and_reads_settings() {
    let db = db().await;
    set(&db, "theme", &json!({ "fixed": "nord" })).await.unwrap();
    set(&db, "lemma.look", &json!({ "shape": "orb" })).await.unwrap();
    set(&db, "theme", &json!({ "fixed": "gruvbox" })).await.unwrap();

    let saved = all(&db).await.unwrap();
    assert_eq!(saved["theme"], json!({ "fixed": "gruvbox" }));
    assert_eq!(saved["lemma.look"], json!({ "shape": "orb" }));
}

#[tokio::test]
async fn saving_the_same_value_is_not_a_change() {
    let db = db().await;
    set(&db, "overview.hidden", &json!(["reading"])).await.unwrap();
    db.execute_unprepared("DELETE FROM sync_outbox").await.unwrap();

    set(&db, "overview.hidden", &json!(["reading"])).await.unwrap();
    assert_eq!(pending(&db).await, 0);

    set(&db, "overview.hidden", &json!([])).await.unwrap();
    assert_eq!(pending(&db).await, 1);
}

#[tokio::test]
async fn refuses_bad_names_and_huge_values() {
    let db = db().await;
    assert!(set(&db, "no spaces", &json!(1)).await.is_err());
    assert!(set(&db, "big", &json!("x".repeat(40_000))).await.is_err());
}
