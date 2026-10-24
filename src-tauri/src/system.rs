//! Commands for the app shell itself, not tied to any feature.

use chrono::Local;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager, State};

use crate::db::{Db, DbStatus};
use crate::error::Error;

/// Mirrored by `AppStatus` in `src/lib/backend.ts`.
#[derive(Serialize)]
pub struct AppStatus {
    /// The app version from package.json (via tauri.conf.json), which
    /// releases and the updater go by.
    version: String,
    db: DbStatus,
    /// The account server's privacy notice and terms; None in a build without a server.
    #[serde(rename = "privacyUrl")]
    privacy_url: Option<String>,
    #[serde(rename = "termsUrl")]
    terms_url: Option<String>,
}

/// A page on the account server, if this build has one.
fn server_page(path: &str) -> Option<String> {
    let server = crate::account::SERVER_URL.trim_end_matches('/');
    (!server.is_empty()).then(|| format!("{server}{path}"))
}

/// Called from React with `invoke("app_status")`.
#[tauri::command]
pub async fn app_status(app: AppHandle, db: State<'_, Db>) -> Result<AppStatus, String> {
    Ok(AppStatus {
        version: app.package_info().version.to_string(),
        db: db.status().await,
        privacy_url: server_page(axiom_protocol::routes::PRIVACY),
        terms_url: server_page(axiom_protocol::routes::TERMS),
    })
}

/// Saves everything on this computer (every feature's data, deleted rows left
/// out) as a JSON file in Downloads, and returns where it went.
#[tauri::command]
pub async fn data_export(app: AppHandle, db: State<'_, Db>) -> Result<String, Error> {
    let tables = crate::sync::local::export(&db.conn().await?).await?;
    let now = Local::now();
    let export = json!({
        "app": "Axiom",
        "version": app.package_info().version.to_string(),
        "exportedAt": now.to_rfc3339(),
        "tables": tables,
    });

    let folder = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| Error::Invalid(format!("Couldn't find your Downloads folder: {e}")))?;
    let file = folder.join(format!("axiom-export-{}.json", now.format("%Y-%m-%d-%H%M%S")));
    let text = serde_json::to_string_pretty(&export).map_err(|e| Error::Invalid(e.to_string()))?;
    std::fs::write(&file, text).map_err(|e| Error::Invalid(format!("Couldn't save {}: {e}", file.display())))?;
    Ok(file.to_string_lossy().into_owned())
}
