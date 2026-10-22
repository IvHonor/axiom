//! Tauri commands for the Daily Plan, wrapped by
//! `src/features/daily_plan/api.ts`. Days arrive as "YYYY-MM-DD" in the
//! user's own time zone.

use sea_orm::prelude::Date;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use super::calendars::accounts::{self, CalendarHub};
use super::entities::{block, calendar as cal, calendar_account as account, routine, task};
use super::{calendars as calendar, service};
use super::types::{
    BlockFields, CarryTo, DayFields, DayInfo, DayPlan, PlanInsights, RangePlan, QuickAdded, RoutineFields, ScheduleResult, Settings,
    TaskFields, TodaySummary,
};
use crate::db::Db;
use crate::error::{Error, Result};

#[tauri::command]
pub async fn plan_get_day(db: State<'_, Db>, day: Date, today: Date) -> Result<DayPlan> {
    service::get_day(&db.conn().await?, day, today).await
}

#[tauri::command]
pub async fn plan_summary(db: State<'_, Db>, today: Date, now_minute: i32) -> Result<TodaySummary> {
    service::summary(&db.conn().await?, today, now_minute).await
}

#[tauri::command]
pub async fn plan_quick_add(db: State<'_, Db>, text: String, day: Date, today: Date) -> Result<QuickAdded> {
    service::quick_add(&db.conn().await?, &text, day, today).await
}

#[tauri::command]
pub async fn plan_create_task(db: State<'_, Db>, title: String, day: Option<Date>, estimate_minutes: Option<i32>) -> Result<task::Model> {
    service::create_task(&db.conn().await?, &title, day, estimate_minutes).await
}

#[tauri::command]
pub async fn plan_update_task(db: State<'_, Db>, id: String, fields: TaskFields) -> Result<task::Model> {
    service::update_task(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn plan_set_done(db: State<'_, Db>, id: String, done: bool) -> Result<task::Model> {
    service::set_done(&db.conn().await?, &id, done).await
}

#[tauri::command]
pub async fn plan_set_focus(db: State<'_, Db>, id: String, focus: bool) -> Result<task::Model> {
    service::set_focus(&db.conn().await?, &id, focus).await
}

#[tauri::command]
pub async fn plan_move_task(db: State<'_, Db>, id: String, day: Option<Date>, before_id: Option<String>) -> Result<task::Model> {
    service::move_task(&db.conn().await?, &id, day, before_id.as_deref()).await
}

#[tauri::command]
pub async fn plan_carry_over(db: State<'_, Db>, ids: Vec<String>, to: CarryTo, today: Date) -> Result<()> {
    service::carry_over(&db.conn().await?, &ids, to, today).await
}

#[tauri::command]
pub async fn plan_delete_task(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_task(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn plan_create_block(
    db: State<'_, Db>,
    day: Date,
    start_minute: i32,
    duration_minutes: i32,
    title: String,
    task_id: Option<String>,
) -> Result<block::Model> {
    service::create_block(&db.conn().await?, day, start_minute, duration_minutes, &title, task_id.as_deref()).await
}

#[tauri::command]
pub async fn plan_update_block(db: State<'_, Db>, id: String, fields: BlockFields) -> Result<block::Model> {
    service::update_block(&db.conn().await?, &id, fields).await
}

#[tauri::command]
pub async fn plan_delete_block(db: State<'_, Db>, id: String) -> Result<()> {
    service::delete_block(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn plan_update_settings(db: State<'_, Db>, settings: Settings) -> Result<Settings> {
    service::update_settings(&db.conn().await?, settings).await
}

#[tauri::command]
pub async fn plan_start_timer(db: State<'_, Db>, id: String) -> Result<task::Model> {
    service::start_timer(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn plan_stop_timer(db: State<'_, Db>, id: String) -> Result<task::Model> {
    service::stop_timer(&db.conn().await?, &id).await
}

#[tauri::command]
pub async fn plan_card(db: State<'_, Db>, card_id: String, day: Option<Date>) -> Result<task::Model> {
    service::plan_card(&db.conn().await?, &card_id, day).await
}

#[tauri::command]
pub async fn plan_update_day(db: State<'_, Db>, day: Date, fields: DayFields) -> Result<DayInfo> {
    service::update_day(&db.conn().await?, day, fields).await
}

#[tauri::command]
pub async fn plan_replan(db: State<'_, Db>, day: Date, now_minute: i32) -> Result<ScheduleResult> {
    service::replan(&db.conn().await?, day, now_minute).await
}

#[tauri::command]
pub async fn plan_fit_into_day(db: State<'_, Db>, day: Date, from_minute: i32) -> Result<ScheduleResult> {
    service::fit_into_day(&db.conn().await?, day, from_minute).await
}

#[tauri::command]
pub async fn plan_list_routines(db: State<'_, Db>) -> Result<Vec<routine::Model>> {
    service::list_routines(&db.conn().await?).await
}

#[tauri::command]
pub async fn plan_create_routine(db: State<'_, Db>, fields: RoutineFields) -> Result<routine::Model> {
    service::create_routine(&db.conn().await?, fields).await
}

#[tauri::command]
pub async fn plan_update_routine(db: State<'_, Db>, id: String, fields: RoutineFields, today: Date) -> Result<routine::Model> {
    service::update_routine(&db.conn().await?, &id, fields, today).await
}

#[tauri::command]
pub async fn plan_delete_routine(db: State<'_, Db>, id: String, today: Date) -> Result<()> {
    service::delete_routine(&db.conn().await?, &id, today).await
}

#[tauri::command]
pub async fn plan_insights(db: State<'_, Db>, today: Date) -> Result<PlanInsights> {
    service::insights(&db.conn().await?, today).await
}

/// The Calendars dialog: accounts, calendars, and which providers this build can connect to.
#[tauri::command]
pub async fn plan_calendar_setup(db: State<'_, Db>, hub: State<'_, CalendarHub>) -> Result<calendar::CalendarSetup> {
    calendar::setup(&db.conn().await?, &hub).await
}

#[tauri::command]
pub async fn plan_add_calendar(db: State<'_, Db>, name: String, url: String, color: String, today: Date) -> Result<cal::Model> {
    calendar::add_calendar(&db.conn().await?, &name, &url, &color, today).await
}

#[tauri::command]
pub async fn plan_remove_calendar(db: State<'_, Db>, id: String) -> Result<()> {
    calendar::remove_calendar(&db.conn().await?, &id).await
}

/// Re-reads calendars that are due (or all, with `force`) and publishes
/// the plan if it changed; true if any calendar was read.
#[tauri::command]
pub async fn plan_refresh_calendars(db: State<'_, Db>, hub: State<'_, CalendarHub>, today: Date, force: bool) -> Result<bool> {
    calendar::refresh_calendars(&db.conn().await?, &hub, today, force).await
}

/// Connects Google or Microsoft ("google", "microsoft"): opens the sign-in
/// page in the browser and waits for it.
#[tauri::command]
pub async fn plan_connect_calendar(
    app: AppHandle,
    db: State<'_, Db>,
    hub: State<'_, CalendarHub>,
    provider: String,
    today: Date,
) -> Result<account::Model> {
    let open = |url: &str| {
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|_| Error::Invalid("Couldn't open your browser to sign in.".into()))
    };
    accounts::connect_oauth(&db.conn().await?, &hub, &provider, today, open).await
}

#[tauri::command]
pub async fn plan_cancel_calendar_sign_in(hub: State<'_, CalendarHub>) -> Result<()> {
    hub.cancel_sign_in().await;
    Ok(())
}

/// Connects iCloud (an empty `server`) or another CalDAV server.
#[tauri::command]
pub async fn plan_connect_caldav(
    db: State<'_, Db>,
    hub: State<'_, CalendarHub>,
    server: String,
    username: String,
    password: String,
    today: Date,
) -> Result<account::Model> {
    accounts::connect_caldav(&db.conn().await?, &hub, &server, &username, &password, today).await
}

#[tauri::command]
pub async fn plan_remove_calendar_account(db: State<'_, Db>, hub: State<'_, CalendarHub>, id: String) -> Result<()> {
    let _one_at_a_time = accounts::exclusive(&hub).await;
    accounts::remove_account(&db.conn().await?, &hub, &id).await
}

#[tauri::command]
pub async fn plan_show_calendar(db: State<'_, Db>, hub: State<'_, CalendarHub>, id: String, shown: bool, today: Date) -> Result<()> {
    let _one_at_a_time = accounts::exclusive(&hub).await;
    accounts::set_shown(&db.conn().await?, &hub, &id, shown, today).await
}

/// Publishes the plan into a calendar, or stops (`calendarId` null).
#[tauri::command]
pub async fn plan_publish_to(db: State<'_, Db>, hub: State<'_, CalendarHub>, calendar_id: Option<String>, today: Date) -> Result<()> {
    let _one_at_a_time = accounts::exclusive(&hub).await;
    accounts::set_publish(&db.conn().await?, &hub, calendar_id.as_deref(), today).await
}

/// Makes an "Axiom" calendar in an account and publishes the plan there.
#[tauri::command]
pub async fn plan_create_plan_calendar(db: State<'_, Db>, hub: State<'_, CalendarHub>, account_id: String, today: Date) -> Result<cal::Model> {
    let _one_at_a_time = accounts::exclusive(&hub).await;
    accounts::create_plan_calendar(&db.conn().await?, &hub, &account_id, today).await
}

/// Many days at once (up to about a year), for the week, month and year views.
#[tauri::command]
pub async fn plan_range(db: State<'_, Db>, from: Date, to: Date, today: Date) -> Result<RangePlan> {
    service::range(&db.conn().await?, from, to, today).await
}

/// Changes a calendar event in its own calendar (title, time, location, notes).
#[tauri::command]
pub async fn plan_update_event(db: State<'_, Db>, hub: State<'_, CalendarHub>, id: String, edit: accounts::EventEdit, today: Date) -> Result<()> {
    let _one_at_a_time = accounts::exclusive(&hub).await;
    accounts::update_event(&db.conn().await?, &hub, &id, edit, today).await
}

/// Deletes a calendar event (or one occurrence) from its calendar.
#[tauri::command]
pub async fn plan_delete_event(db: State<'_, Db>, hub: State<'_, CalendarHub>, id: String, today: Date) -> Result<()> {
    let _one_at_a_time = accounts::exclusive(&hub).await;
    accounts::delete_event(&db.conn().await?, &hub, &id, today).await
}

/// Sets or clears a task's deadline.
#[tauri::command]
pub async fn plan_set_due(db: State<'_, Db>, id: String, due: Option<Date>) -> Result<task::Model> {
    service::set_due(&db.conn().await?, &id, due).await
}
