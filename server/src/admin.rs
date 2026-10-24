//! The admin panel: everyone with an account, their roles and permissions,
//! the waiting list, and the server's settings.
//!
//! Owners are the emails in `ADMIN_EMAILS`: admins whom the app can't demote,
//! so the server always has one. Admins can make others admins.

use std::collections::HashMap;

use axiom_protocol::{AccountChange, AccountRole, AdminAccount, AdminSettings, permissions};
use axum::Json;
use axum::extract::{FromRequestParts, Path, State};
use axum::http::StatusCode;
use axum::http::request::Parts;
use chrono::Utc;
use sea_orm::sea_query::OnConflict;
use sea_orm::{ActiveModelTrait, ColumnTrait, DbErr, EntityTrait, ModelTrait, QueryFilter, Set, TransactionTrait};

use crate::auth::{AuthUser, revoke_sessions};
use crate::entities::{email_code, password_reset, server_setting, session, user};
use crate::error::ApiError;
use crate::{AppState, Shared, mail};

/// The panel's settings, as the server keeps them in memory.
#[derive(Debug, Clone)]
pub struct Settings {
    /// None follows `WAITLIST` from the environment.
    pub waitlist: Option<bool>,
    pub default_permissions: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self { waitlist: None, default_permissions: permissions::ALL.iter().map(|p| p.to_string()).collect() }
    }
}

/// Reads the saved settings. Call once at startup.
pub async fn load_settings(s: &Shared) -> Result<(), DbErr> {
    if let Some(row) = server_setting::Entity::find_by_id(1).one(&s.db).await? {
        *s.settings.write().unwrap() = Settings { waitlist: row.waitlist, default_permissions: split(&row.default_permissions) };
    }
    Ok(())
}

/// "sync,share" as a list, keeping only permissions that exist.
pub fn split(list: &str) -> Vec<String> {
    list.split(',').map(str::trim).filter(|p| permissions::ALL.contains(p)).map(String::from).collect()
}

fn checked(list: &[String]) -> Result<String, ApiError> {
    if let Some(bad) = list.iter().find(|p| !permissions::ALL.contains(&p.as_str())) {
        return Err(ApiError::bad_request(format!("Unknown permission: {bad}")));
    }
    Ok(permissions::ALL.iter().filter(|p| list.iter().any(|l| l == *p)).copied().collect::<Vec<_>>().join(","))
}

/// A signed-in admin. Add it as a handler argument to make a route admin-only.
pub struct AdminUser {
    pub user_id: String,
}

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, s: &AppState) -> Result<Self, ApiError> {
        let auth = AuthUser::from_request_parts(parts, s).await?;
        let me = user::Entity::find_by_id(&auth.user_id).one(&s.db).await?;
        match me {
            Some(me) if s.is_admin(&me) => Ok(AdminUser { user_id: me.id }),
            _ => Err(ApiError::new(StatusCode::FORBIDDEN, "Only admins can do that.")),
        }
    }
}

/// Every account: the waiting list first (oldest request first), then
/// everyone approved (most recently approved first).
pub async fn accounts(State(s): State<AppState>, _admin: AdminUser) -> Result<Json<Vec<AdminAccount>>, ApiError> {
    let mut active: HashMap<String, chrono::DateTime<Utc>> = HashMap::new();
    for sess in session::Entity::find().all(&s.db).await? {
        let last = active.entry(sess.user_id).or_insert(sess.last_used_at);
        *last = (*last).max(sess.last_used_at);
    }
    // Sign-ups that never confirmed their address aren't anyone yet.
    let users = user::Entity::find().filter(user::Column::EmailConfirmedAt.is_not_null()).all(&s.db).await?;
    let mut all: Vec<AdminAccount> = users.into_iter().map(|u| view(&s, u, &active)).collect();
    all.sort_by(|a, b| match (a.approved_at, b.approved_at) {
        (None, None) => a.created_at.cmp(&b.created_at),
        (None, Some(_)) => std::cmp::Ordering::Less,
        (Some(_), None) => std::cmp::Ordering::Greater,
        (Some(x), Some(y)) => y.cmp(&x),
    });
    Ok(Json(all))
}

fn view(s: &Shared, u: user::Model, active: &HashMap<String, chrono::DateTime<Utc>>) -> AdminAccount {
    AdminAccount {
        role: s.role(&u),
        permissions: s.permissions(&u),
        approved_at: if s.is_approved(&u) { u.approved_at.or(Some(u.created_at)) } else { None },
        last_active_at: active.get(&u.id).copied(),
        display_name: u.display_name.clone(),
        id: u.id,
        email: u.email,
        created_at: u.created_at,
    }
}

/// Changes an account's role or permissions. Owners stay as they are, and
/// nobody changes their own role (so the last admin can't lock themselves out).
pub async fn update(
    State(s): State<AppState>,
    admin: AdminUser,
    Path(id): Path<String>,
    Json(body): Json<AccountChange>,
) -> Result<Json<AdminAccount>, ApiError> {
    let account = find(&s, &id).await?;
    if s.is_owner(&account.email) {
        return Err(ApiError::bad_request("Owners are set on the server (ADMIN_EMAILS), so they can't be changed here."));
    }
    let mut active: user::ActiveModel = account.clone().into();
    if let Some(role) = body.role {
        if account.id == admin.user_id && role != s.role(&account) {
            return Err(ApiError::bad_request("You can't change your own role. Ask another admin."));
        }
        active.role = Set(match role {
            AccountRole::Member => "member".into(),
            AccountRole::Admin => "admin".into(),
            AccountRole::Owner => return Err(ApiError::bad_request("Owners are set on the server (ADMIN_EMAILS).")),
        });
        // An admin never waits.
        if role == AccountRole::Admin && account.approved_at.is_none() {
            active.approved_at = Set(Some(Utc::now()));
        }
    }
    if let Some(list) = &body.permissions {
        active.permissions = Set(checked(list)?);
    }
    let saved = active.update(&s.db).await?;
    tracing::info!("Changed an account's role or permissions");
    Ok(Json(view(&s, saved, &HashMap::new())))
}

/// Lets an account in and emails them to say so.
pub async fn approve(State(s): State<AppState>, _admin: AdminUser, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    let account = find(&s, &id).await?;
    if account.approved_at.is_some() {
        return Ok(StatusCode::NO_CONTENT);
    }
    let email = account.email.clone();
    let mut active: user::ActiveModel = account.into();
    active.approved_at = Set(Some(Utc::now()));
    active.update(&s.db).await?;
    tracing::info!("Approved an account from the waiting list");

    let state = s.clone();
    tokio::spawn(async move {
        if let Err(err) = state.mailer.send(mail::account_approved(&email)).await {
            tracing::error!("Couldn't send an approval email: {err}");
        }
    });
    Ok(StatusCode::NO_CONTENT)
}

/// Turns down an account on the waiting list: it's deleted, so they can ask again later.
pub async fn decline(State(s): State<AppState>, _admin: AdminUser, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    let account = find(&s, &id).await?;
    if s.is_approved(&account) {
        return Err(ApiError::new(StatusCode::CONFLICT, "Only accounts on the waiting list can be turned down."));
    }
    // Waiting accounts never synced or signed in, but may have asked for a reset code.
    let txn = s.db.begin().await?;
    password_reset::Entity::delete_many().filter(password_reset::Column::UserId.eq(&account.id)).exec(&txn).await?;
    email_code::Entity::delete_many().filter(email_code::Column::UserId.eq(&account.id)).exec(&txn).await?;
    session::Entity::delete_many().filter(session::Column::UserId.eq(&account.id)).exec(&txn).await?;
    account.delete(&txn).await?;
    txn.commit().await?;
    tracing::info!("Turned down an account on the waiting list");
    Ok(StatusCode::NO_CONTENT)
}

/// Puts an approved account back on the waiting list and signs it out on
/// every device. Its synced data stays, ready if it's approved again.
pub async fn revoke(State(s): State<AppState>, admin: AdminUser, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    let account = find(&s, &id).await?;
    if account.id == admin.user_id || s.is_admin(&account) {
        return Err(ApiError::bad_request("Admins can't be put on the waiting list. Make them a member first."));
    }
    if !s.waitlist_on() {
        return Err(ApiError::bad_request("The waiting list is switched off, so everyone can sign in. Switch it on first."));
    }
    let txn = s.db.begin().await?;
    let user_id = account.id.clone();
    let mut active: user::ActiveModel = account.into();
    active.approved_at = Set(None);
    active.update(&txn).await?;
    revoke_sessions(&txn, &user_id, None).await?;
    txn.commit().await?;
    tracing::info!("Took an account's access away");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn settings(State(s): State<AppState>, _admin: AdminUser) -> Json<AdminSettings> {
    let saved = s.settings.read().unwrap().clone();
    Json(AdminSettings { waitlist: saved.waitlist.unwrap_or(s.waitlist), default_permissions: saved.default_permissions })
}

/// Saves the settings. Turning the waiting list off lets everyone waiting in
/// (they can sign in straight away), but they aren't emailed.
pub async fn save_settings(State(s): State<AppState>, _admin: AdminUser, Json(body): Json<AdminSettings>) -> Result<Json<AdminSettings>, ApiError> {
    let defaults = checked(&body.default_permissions)?;
    server_setting::Entity::insert(server_setting::ActiveModel { id: Set(1), waitlist: Set(Some(body.waitlist)), default_permissions: Set(defaults.clone()) })
        .on_conflict(
            OnConflict::column(server_setting::Column::Id)
                .update_columns([server_setting::Column::Waitlist, server_setting::Column::DefaultPermissions])
                .to_owned(),
        )
        .exec(&s.db)
        .await?;
    *s.settings.write().unwrap() = Settings { waitlist: Some(body.waitlist), default_permissions: split(&defaults) };
    tracing::info!("Changed the server's settings");
    Ok(Json(AdminSettings { waitlist: body.waitlist, default_permissions: split(&defaults) }))
}

async fn find(s: &AppState, id: &str) -> Result<user::Model, ApiError> {
    user::Entity::find_by_id(id)
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "That account no longer exists."))
}

/// The signed-in account, if it may use `permission`; otherwise a message
/// saying it's switched off and who can switch it on.
pub async fn require(s: &AppState, user_id: &str, permission: &str) -> Result<user::Model, ApiError> {
    let account = user::Entity::find_by_id(user_id)
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::unauthorized("You've been signed out. Sign in again to continue."))?;
    if s.may(&account, permission) {
        return Ok(account);
    }
    let what = match permission {
        permissions::SYNC => "Syncing",
        permissions::SHARE => "Sharing boards",
        _ => "Notification emails",
    };
    Err(ApiError::new(StatusCode::FORBIDDEN, format!("{what} is switched off for your account. Ask an admin to switch it on.")))
}
