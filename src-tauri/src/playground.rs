//! The Playground's commands, wrapped by `src/features/playground/api.ts`.
//!
//! Two halves. `playground_days` reads this computer's data and returns, for
//! every metric, how much happened on each day; React turns that into weeks,
//! months, totals and streaks (the web does the same from its own copy) and
//! sends only the metrics the person shares. The rest pass calls on to the
//! server, which keeps the boards. See `axiom_protocol::playground`.

use std::collections::{BTreeMap, HashMap};

use axiom_protocol::playground::{BoardQuery, LemmaCard, MetricStats, Period, PublishStats, SavePlayground, Scope, metric};
use axiom_protocol::{is_plain_name, route, routes};
use reqwest::Method;
use sea_orm::prelude::Date;
use serde_json::{Value, json};
use tauri::State;

use crate::account::Account;
use crate::db::Db;
use crate::error::{Error, Result};
use crate::features;

/// How much of one metric happened on each day it happened.
pub type DayCounts = BTreeMap<Date, i64>;

/// Every metric's days, with `active` (a day anything at all happened) worked out from the rest.
#[tauri::command]
pub async fn playground_days(db: State<'_, Db>) -> Result<HashMap<&'static str, DayCounts>> {
    let db = db.conn().await?;
    let mut all: Vec<(&'static str, DayCounts)> = Vec::new();
    all.extend(features::reading::analytics::playground_days(&db).await?);
    all.extend(features::learning::analytics::playground_days(&db).await?);
    all.extend(features::daily_plan::analytics::playground_days(&db).await?);
    all.extend(features::journal::analytics::playground_days(&db).await?);
    all.extend(features::goals::analytics::playground_days(&db).await?);
    all.extend(features::project_board::analytics::playground_days(&db).await?);
    all.extend(features::uni::analytics::playground_days(&db).await?);
    let active: DayCounts = all.iter().flat_map(|(_, days)| days.iter().filter(|(_, n)| **n > 0).map(|(d, _)| (*d, 1))).collect();
    let mut out: HashMap<&'static str, DayCounts> = all.into_iter().collect();
    out.insert("active", active);
    Ok(out)
}

fn user_path(template: &str, user_id: &str) -> Result<String> {
    if !is_plain_name(user_id) {
        return Err(Error::Invalid("That person couldn't be found.".into()));
    }
    Ok(route(template, &[("user_id", user_id)]))
}

#[tauri::command]
pub async fn playground_me(account: State<'_, Account>) -> Result<Value> {
    account.playground(Method::GET, routes::PLAYGROUND_ME, None).await
}

/// Picks a handle, joins the boards (`playground`), or changes how you appear.
#[tauri::command]
pub async fn playground_save(account: State<'_, Account>, playground: bool, handle: String, global: bool, shared: Vec<String>, lemma: LemmaCard) -> Result<Value> {
    let body = serde_json::to_value(SavePlayground { playground, handle, global, shared, lemma }).map_err(|e| Error::Invalid(e.to_string()))?;
    account.playground(Method::PUT, routes::PLAYGROUND_ME, Some(body)).await
}

#[tauri::command]
pub async fn playground_leave(account: State<'_, Account>) -> Result<()> {
    account.playground(Method::DELETE, routes::PLAYGROUND_ME, None).await.map(drop)
}

#[tauri::command]
pub async fn playground_new_code(account: State<'_, Account>) -> Result<Value> {
    account.playground(Method::POST, routes::PLAYGROUND_CODE, None).await
}

#[tauri::command]
pub async fn playground_publish(account: State<'_, Account>, today: Date, stats: Vec<MetricStats>) -> Result<Value> {
    let body = serde_json::to_value(PublishStats { today, stats }).map_err(|e| Error::Invalid(e.to_string()))?;
    account.playground(Method::PUT, routes::PLAYGROUND_STATS, Some(body)).await
}

#[tauri::command]
pub async fn playground_board(account: State<'_, Account>, metric: String, period: Period, scope: Scope, today: Date) -> Result<Value> {
    let known = self::metric(&metric).ok_or_else(|| Error::Invalid("That isn't something the Playground ranks.".into()))?;
    let query = BoardQuery { metric: known.id.into(), period, scope, today };
    let params = serde_json::to_value(&query).map_err(|e| Error::Invalid(e.to_string()))?;
    let text = |key: &str| params[key].as_str().unwrap_or_default().to_owned();
    let path = format!("{}?metric={}&period={}&scope={}&today={}", routes::PLAYGROUND_BOARD, known.id, text("period"), text("scope"), today);
    account.playground(Method::GET, &path, None).await
}

#[tauri::command]
pub async fn playground_friends(account: State<'_, Account>) -> Result<Value> {
    account.playground(Method::GET, routes::PLAYGROUND_FRIENDS, None).await
}

/// By handle (they're asked) or friend code (friends at once).
#[tauri::command]
pub async fn playground_add_friend(account: State<'_, Account>, handle: Option<String>, code: Option<String>) -> Result<Value> {
    account.playground(Method::POST, routes::PLAYGROUND_FRIENDS, Some(json!({ "handle": handle, "code": code }))).await
}

#[tauri::command]
pub async fn playground_accept(account: State<'_, Account>, user_id: String) -> Result<()> {
    account.playground(Method::POST, &user_path(routes::PLAYGROUND_FRIEND_ACCEPT, &user_id)?, None).await.map(drop)
}

/// Unfriends, declines or cancels.
#[tauri::command]
pub async fn playground_remove(account: State<'_, Account>, user_id: String) -> Result<()> {
    account.playground(Method::DELETE, &user_path(routes::PLAYGROUND_FRIEND, &user_id)?, None).await.map(drop)
}

/// Someone's profile picture, if you can see them.
#[tauri::command]
pub async fn playground_avatar(account: State<'_, Account>, user_id: String) -> Result<Value> {
    account.playground(Method::GET, &user_path(routes::PLAYGROUND_AVATAR, &user_id)?, None).await
}

#[tauri::command]
pub async fn playground_cheer(account: State<'_, Account>, user_id: String) -> Result<()> {
    account.playground(Method::POST, &user_path(routes::PLAYGROUND_FRIEND_CHEER, &user_id)?, None).await.map(drop)
}

// ---------- The Hub (see `axiom_protocol::hub`) ----------

fn hub_where(room: String, x: f32, y: f32) -> Value {
    json!({ "room": room, "x": x, "y": y })
}

#[tauri::command]
pub async fn hub_enter(account: State<'_, Account>, room: String, x: f32, y: f32) -> Result<Value> {
    account.playground(Method::POST, routes::HUB_ENTER, Some(hub_where(room, x, y))).await
}

/// Checks in (about once a second while in the Hub): where you are, and your room as it is.
#[tauri::command]
pub async fn hub_sync(account: State<'_, Account>, room: String, x: f32, y: f32) -> Result<Value> {
    account.playground(Method::POST, routes::HUB_SYNC, Some(hub_where(room, x, y))).await
}

/// An emote or phrase (`kind`), maybe aimed at someone.
#[tauri::command]
pub async fn hub_act(account: State<'_, Account>, kind: String, id: String, to: Option<String>) -> Result<()> {
    account.playground(Method::POST, routes::HUB_ACT, Some(json!({ "kind": kind, "id": id, "to": to }))).await.map(drop)
}

#[tauri::command]
pub async fn hub_leave(account: State<'_, Account>) -> Result<()> {
    account.playground(Method::POST, routes::HUB_LEAVE, Some(json!({}))).await.map(drop)
}

#[tauri::command]
pub async fn hub_peek(account: State<'_, Account>) -> Result<Value> {
    account.playground(Method::GET, routes::HUB_PEEK, None).await
}
