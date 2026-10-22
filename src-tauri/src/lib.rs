mod account;
mod db;
mod error;
mod features;
mod sync;
mod system;

use account::commands as acct;
use features::daily_plan::commands as plan;
use features::project_board::commands as board;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(db::Db::default())
        .manage(account::Account::new(account::SERVER_URL, Box::new(account::Keychain)))
        .manage(sync::SyncEngine::default())
        .manage(features::daily_plan::calendars::accounts::CalendarHub::new(
            Box::new(features::daily_plan::calendars::secrets::Keychain),
            features::daily_plan::calendars::accounts::Providers::from_build(),
            rrule::Tz::LOCAL,
        ))
        .setup(|app| {
            // Checks GitHub Releases for signed updates (see plugins.updater
            // in tauri.conf.json). The frontend decides when to ask.
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

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
            plan::plan_get_day,
            plan::plan_range,
            plan::plan_summary,
            plan::plan_quick_add,
            plan::plan_create_task,
            plan::plan_update_task,
            plan::plan_set_done,
            plan::plan_set_focus,
            plan::plan_move_task,
            plan::plan_carry_over,
            plan::plan_delete_task,
            plan::plan_create_block,
            plan::plan_update_block,
            plan::plan_delete_block,
            plan::plan_update_settings,
            plan::plan_start_timer,
            plan::plan_stop_timer,
            plan::plan_card,
            plan::plan_update_day,
            plan::plan_replan,
            plan::plan_fit_into_day,
            plan::plan_list_routines,
            plan::plan_create_routine,
            plan::plan_update_routine,
            plan::plan_delete_routine,
            plan::plan_insights,
            plan::plan_calendar_setup,
            plan::plan_add_calendar,
            plan::plan_remove_calendar,
            plan::plan_refresh_calendars,
            plan::plan_connect_calendar,
            plan::plan_cancel_calendar_sign_in,
            plan::plan_connect_caldav,
            plan::plan_remove_calendar_account,
            plan::plan_show_calendar,
            plan::plan_publish_to,
            plan::plan_create_plan_calendar,
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
