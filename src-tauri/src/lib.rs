mod account;
mod db;
mod error;
mod features;
mod sync;
mod system;

use account::commands as acct;
use features::project_board::commands as board;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db::Db::default())
        .manage(account::Account::new(account::SERVER_URL, Box::new(account::Keychain)))
        .manage(sync::SyncEngine::default())
        .setup(|app| {
            // The local database lives in the app's data folder, e.g.
            // %APPDATA%\app.axiom.desktop\axiom.db on Windows.
            let file = app.path().app_data_dir()?.join("axiom.db");
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                handle.state::<db::Db>().connect(&file).await;
                sync::start(handle);
            });
            Ok(())
        })
        // Every command React can call. Add new ones here.
        .invoke_handler(tauri::generate_handler![
            system::app_status,
            acct::account_status,
            acct::account_sign_up,
            acct::account_sign_in,
            acct::account_sign_out,
            acct::account_request_reset,
            acct::account_reset_password,
            acct::account_change_password,
            acct::account_devices,
            acct::account_sign_out_device,
            acct::account_delete,
            system::data_export,
            sync::sync_status,
            sync::sync_now,
            sync::sync_link,
            board::board_list_projects,
            board::board_create_project,
            board::board_rename_project,
            board::board_delete_project,
            board::board_get,
            board::board_create_column,
            board::board_update_column,
            board::board_move_column,
            board::board_delete_column,
            board::board_create_task,
            board::board_create_subtask,
            board::board_convert_checklist_item,
            board::board_list_archived,
            board::board_get_task,
            board::board_update_task,
            board::board_move_task,
            board::board_archive_task,
            board::board_delete_task,
            board::board_create_label,
            board::board_update_label,
            board::board_delete_label,
            board::board_set_task_labels,
            board::board_add_checklist_item,
            board::board_update_checklist_item,
            board::board_delete_checklist_item,
            board::board_summary,
            board::board_save_template,
            board::board_delete_template,
            board::board_create_from_template,
            board::board_activity,
            board::board_insights,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
