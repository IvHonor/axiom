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

/// The macOS menu bar: the usual app, edit and window menus, without the
/// default ⌘W "Close Window", because ⌘W closes a tab in Axiom (see
/// `src/App.tsx`). The Edit menu is what makes ⌘C, ⌘V and the rest work in
/// text fields. Built on every platform so it's always type-checked, but only
/// installed on macOS.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn mac_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
    let app_menu = Submenu::with_items(
        app,
        "Axiom",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[&PredefinedMenuItem::minimize(app, None)?, &PredefinedMenuItem::maximize(app, None)?, &PredefinedMenuItem::fullscreen(app, None)?],
    )?;
    Menu::with_items(app, &[&app_menu, &edit, &window])
}
