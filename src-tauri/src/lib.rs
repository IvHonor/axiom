mod account;
mod app_lock;
mod db;
mod error;
mod features;
mod notifications;
mod vault;
mod sync;
mod system;
#[cfg(target_os = "windows")]
mod window_icons;

use account::commands as acct;
use features::daily_plan::commands as plan;
use features::finance::commands as fin;
use features::journal::commands as journal;
use features::notes::commands as notes;
use features::birthdays::commands as birthdays;
use features::goals::commands as goals;
use features::project_board::commands as board;
use features::reading::commands as reading;
use features::uni::commands as uni;
use features::learning::commands as learning;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(db::Db::default())
        .manage(account::Account::new(account::SERVER_URL, Box::new(account::Keychain)))
        .manage(sync::SyncEngine::default())
        .manage(notifications::runner::Notifier::default())
        .manage(vault::Vault::new(Box::new(vault::Keychain::VAULT)))
        .manage(app_lock::AppLock::new(Box::new(vault::Keychain::APP_LOCK)))
        .manage(features::finance::rates::Rates::new(None))
        .manage(features::daily_plan::calendars::accounts::CalendarHub::new(
            Box::new(features::daily_plan::calendars::secrets::Keychain),
            features::daily_plan::calendars::accounts::Providers::from_build(),
            rrule::Tz::LOCAL,
        ))
        .setup(|app| {
            #[cfg(target_os = "windows")]
            for window in app.webview_windows().into_values() {
                window_icons::apply(&window)?;
                let changed = window.clone();
                window.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::ScaleFactorChanged { .. }) {
                        if let Err(error) = window_icons::apply(&changed) {
                            eprintln!("couldn't resize the native window icons: {error}");
                        }
                    }
                });
            }
            // Checks GitHub Releases for signed updates (see plugins.updater
            // in tauri.conf.json). The frontend decides when to ask.
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            // The local database lives in the app's data folder, e.g.
            // %APPDATA%\app.axiom.desktop\axiom.db on Windows. Development builds
            // keep their own file, so unreleased migrations never reach the
            // database an installed copy of Axiom opens.
            let name = if cfg!(debug_assertions) { "axiom-dev.db" } else { "axiom.db" };
            let file = app.path().app_data_dir()?.join(name);
            // Book covers, downloaded once so the library shows them offline.
            let covers = app.path().app_cache_dir().ok().map(|dir| dir.join("covers"));
            app.manage(features::reading::library::OpenLibrary::new(covers));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                handle.state::<db::Db>().connect(&file).await;
                sync::start(handle.clone());
                notifications::runner::start(handle);
            });
            Ok(())
        })
        // Every command React can call. Add new ones here.
        .invoke_handler(tauri::generate_handler![
            system::app_status,
            acct::account_status,
            acct::account_sign_up,
            acct::account_sign_in,
            acct::account_confirm_email,
            acct::account_send_confirmation,
            acct::account_sign_out,
            acct::account_request_reset,
            acct::account_reset_password,
            acct::account_change_password,
            acct::account_devices,
            acct::account_sign_out_device,
            acct::account_delete,
            acct::account_admin_accounts,
            acct::account_admin_tickets,
            acct::account_admin_ticket_solved,
            acct::support_send,
            acct::account_admin_approve,
            acct::account_admin_decline,
            acct::account_admin_revoke,
            acct::account_admin_update,
            acct::account_admin_settings,
            acct::account_admin_save_settings,
            acct::account_profile,
            acct::account_update_profile,
            system::data_export,
            sync::sync_status,
            sync::sync_now,
            sync::sync_auto,
            sync::sync_set_auto,
            notifications::commands::notifications_kinds,
            notifications::commands::notifications_settings,
            notifications::commands::notifications_set,
            notifications::commands::notifications_list,
            notifications::commands::notifications_set_off,
            notifications::commands::notifications_read,
            notifications::commands::notifications_dismiss,
            vault::commands::vault_status,
            vault::commands::vault_unlock,
            vault::commands::vault_recover,
            vault::commands::vault_start_over,
            vault::commands::vault_recovery_code,
            app_lock::commands::app_lock_status,
            app_lock::commands::app_lock_set,
            app_lock::commands::app_lock_turn_off,
            app_lock::commands::app_lock_unlock,
            app_lock::commands::app_lock_lock,
            app_lock::commands::app_lock_send_code,
            app_lock::commands::app_lock_reset,
            fin::finance_state,
            fin::finance_setup,
            fin::finance_set_home_currency,
            fin::finance_convert,
            fin::finance_add_account,
            fin::finance_update_account,
            fin::finance_archive_account,
            fin::finance_delete_account,
            fin::finance_add_category,
            fin::finance_update_category,
            fin::finance_delete_category,
            fin::finance_transactions,
            fin::finance_add_transaction,
            fin::finance_update_transaction,
            fin::finance_set_category,
            fin::finance_delete_transaction,
            fin::finance_quick,
            fin::finance_add_recurring,
            fin::finance_update_recurring,
            fin::finance_delete_recurring,
            fin::finance_confirm,
            fin::finance_skip,
            fin::finance_month,
            fin::finance_import_preview,
            fin::finance_import_commit,
            journal::journal_list,
            journal::journal_on_day,
            journal::journal_get,
            journal::journal_create,
            journal::journal_update,
            journal::journal_save,
            journal::journal_compact,
            journal::journal_delete,
            journal::journal_stats,
            journal::journal_export,
            journal::journal_prompts,
            notes::notes_state,
            notes::notes_list,
            notes::notes_get,
            notes::notes_titles,
            notes::notes_create,
            notes::notes_change,
            notes::notes_save,
            notes::notes_compact,
            notes::notes_trash,
            notes::notes_restore,
            notes::notes_delete,
            notes::notes_empty_trash,
            notes::notes_folder_create,
            notes::notes_folder_rename,
            notes::notes_folder_move,
            notes::notes_folder_delete,
            notes::notes_export,
            birthdays::birthdays_list,
            birthdays::birthdays_get,
            birthdays::birthdays_create,
            birthdays::birthdays_update,
            birthdays::birthdays_delete,
            birthdays::birthdays_gift_add,
            birthdays::birthdays_gift_update,
            birthdays::birthdays_gift_delete,
            birthdays::birthdays_import,
            birthdays::birthdays_export,
            goals::goals_list,
            goals::goals_get,
            goals::goals_summary,
            goals::goals_sources,
            goals::goals_create,
            goals::goals_update,
            goals::goals_set_status,
            goals::goals_move,
            goals::goals_delete,
            goals::goals_log,
            goals::goals_log_delete,
            goals::goals_milestone_add,
            goals::goals_milestone_update,
            goals::goals_milestone_tick,
            goals::goals_milestone_delete,
            sync::sync_link,
            sync::sharing::board_shared_boards,
            sync::sharing::board_share,
            sync::sharing::board_stop_sharing,
            sync::sharing::board_leave,
            sync::sharing::board_members,
            sync::sharing::board_invite,
            sync::sharing::board_withdraw_invite,
            sync::sharing::board_set_role,
            sync::sharing::board_remove_member,
            sync::sharing::board_invitations,
            sync::sharing::board_accept_invite,
            sync::sharing::board_decline_invite,
            plan::plan_get_day,
            plan::plan_range,
            plan::plan_summary,
            plan::plan_quick_add,
            plan::plan_create_task,
            plan::plan_update_task,
            plan::plan_set_done,
            plan::plan_set_focus,
            plan::plan_set_due,
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
            plan::plan_update_event,
            plan::plan_delete_event,
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
            reading::reading_search,
            reading::reading_editions,
            reading::reading_cover,
            reading::reading_list,
            reading::reading_get,
            reading::reading_add,
            reading::reading_update,
            reading::reading_choose_edition,
            reading::reading_set_status,
            reading::reading_log_progress,
            reading::reading_read_again,
            reading::reading_move,
            reading::reading_delete,
            reading::reading_delete_session,
            reading::reading_add_note,
            reading::reading_update_note,
            reading::reading_delete_note,
            reading::reading_search_notes,
            reading::reading_set_goal,
            reading::reading_summary,
            reading::reading_stats,
            uni::uni_summary,
            uni::uni_modules,
            uni::uni_module,
            uni::uni_add_term,
            uni::uni_update_term,
            uni::uni_delete_term,
            uni::uni_add_module,
            uni::uni_update_module,
            uni::uni_delete_module,
            uni::uni_add_lecture,
            uni::uni_add_schedule,
            uni::uni_update_lecture,
            uni::uni_set_stage,
            uni::uni_delete_lecture,
            learning::learning_summary,
            learning::learning_source,
            learning::learning_add_skill,
            learning::learning_update_skill,
            learning::learning_delete_skill,
            learning::learning_add_source,
            learning::learning_update_source,
            learning::learning_delete_source,
            learning::learning_add_units,
            learning::learning_update_unit,
            learning::learning_delete_unit,
            learning::learning_set_done,
            learning::learning_review,
            learning::learning_add_session,
            learning::learning_delete_session,
            learning::learning_parse_text,
            learning::learning_read_book,
            learning::learning_youtube_available,
            learning::learning_youtube,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
