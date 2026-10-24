//! Managing a signed-in account: its devices, its password, and deleting it.

use axiom_protocol::{ChangePassword, CheckCode, DeleteAccount, Device, EncryptionKey, MAX_DISPLAY_NAME_LEN, MAX_WRAPPED_KEY_LEN, Profile, check_avatar, check_password, is_login_key};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, ModelTrait, QueryFilter, QueryOrder, Set, TransactionTrait};

use crate::AppState;
use crate::auth::{AuthUser, confirm_password, password, revoke_sessions};
use crate::codes::{self, Purpose};
use crate::entities::{email_code, password_reset, session, sync_record, user};
use crate::error::ApiError;

/// Every device signed in to the account, most recently active first.
pub async fn devices(State(s): State<AppState>, auth: AuthUser) -> Result<Json<Vec<Device>>, ApiError> {
    let sessions = session::Entity::find()
        .filter(session::Column::UserId.eq(&auth.user_id))
        .filter(session::Column::RevokedAt.is_null())
        .filter(session::Column::ExpiresAt.gt(Utc::now()))
        .order_by_desc(session::Column::LastUsedAt)
        .all(&s.db)
        .await?;
    Ok(Json(
        sessions
            .into_iter()
            .map(|session| Device {
                current: session.id == auth.session_id,
                id: session.id,
                name: session.device_name,
                signed_in_at: session.created_at,
                last_active_at: session.last_used_at,
            })
            .collect(),
    ))
}

/// Signs one of the account's devices out. It finds out on its next sync.
pub async fn sign_out_device(State(s): State<AppState>, auth: AuthUser, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    let found = session::Entity::find_by_id(&id)
        .filter(session::Column::UserId.eq(&auth.user_id))
        .filter(session::Column::RevokedAt.is_null())
        .one(&s.db)
        .await?;
    if let Some(found) = found {
        let mut found: session::ActiveModel = found.into();
        found.revoked_at = Set(Some(Utc::now()));
        found.update(&s.db).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Changes the password and signs every other device out, in case the old
/// password is why it's being changed.
pub async fn change_password(State(s): State<AppState>, auth: AuthUser, Json(body): Json<ChangePassword>) -> Result<StatusCode, ApiError> {
    let account = current_user(&s, &auth).await?;
    confirm_password(&s, &account, body.current_password, None).await?;
    check_password(&body.new_password).map_err(ApiError::bad_request)?;

    let login_key = is_login_key(&body.new_password);
    let password_hash = password::hash(body.new_password).await?;
    let txn = s.db.begin().await?;
    if body.encryption_key.as_ref().is_some_and(|w| w.is_empty() || w.len() > MAX_WRAPPED_KEY_LEN) {
        return Err(ApiError::bad_request("That encryption key isn't valid."));
    }
    let mut active: user::ActiveModel = account.into();
    active.password_hash = Set(password_hash);
    active.login_key = Set(login_key);
    // Wrapped again with the new password on the device, saved together.
    if body.encryption_key.is_some() {
        active.encryption_key = Set(body.encryption_key);
    }
    active.update(&txn).await?;
    revoke_sessions(&txn, &auth.user_id, Some(&auth.session_id)).await?;
    txn.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Deletes the account and everything stored with it: devices, reset codes
/// and every synced row. Copies on the user's computers are left alone.
pub async fn delete_account(State(s): State<AppState>, auth: AuthUser, Json(body): Json<DeleteAccount>) -> Result<StatusCode, ApiError> {
    let account = current_user(&s, &auth).await?;
    confirm_password(&s, &account, body.password, None).await?;

    // Deleted explicitly rather than relying on ON DELETE CASCADE, which
    // SQLite only honours when foreign keys are switched on.
    let txn = s.db.begin().await?;
    // Boards they own are deleted; they leave the rest.
    crate::spaces::forget_user(&txn, &account.id).await?;
    crate::notify::forget_user(&txn, &account.id).await?;
    sync_record::Entity::delete_many().filter(sync_record::Column::UserId.eq(&account.id)).exec(&txn).await?;
    password_reset::Entity::delete_many().filter(password_reset::Column::UserId.eq(&account.id)).exec(&txn).await?;
    email_code::Entity::delete_many().filter(email_code::Column::UserId.eq(&account.id)).exec(&txn).await?;
    session::Entity::delete_many().filter(session::Column::UserId.eq(&account.id)).exec(&txn).await?;
    account.delete(&txn).await?;
    txn.commit().await?;
    tracing::info!("Deleted an account and its data");
    Ok(StatusCode::NO_CONTENT)
}

async fn current_user(s: &AppState, auth: &AuthUser) -> Result<user::Model, ApiError> {
    user::Entity::find_by_id(&auth.user_id)
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::unauthorized("You've been signed out. Sign in again to continue."))
}

pub async fn profile(State(s): State<AppState>, auth: AuthUser) -> Result<Json<Profile>, ApiError> {
    let account = current_user(&s, &auth).await?;
    Ok(Json(Profile { display_name: account.display_name, avatar: account.avatar }))
}

/// Replaces the name and picture. An empty name (or none) shows the email instead.
pub async fn update_profile(State(s): State<AppState>, auth: AuthUser, Json(body): Json<Profile>) -> Result<Json<Profile>, ApiError> {
    let name = body.display_name.map(|n| n.trim().to_owned()).filter(|n| !n.is_empty());
    if name.as_ref().is_some_and(|n| n.chars().count() > MAX_DISPLAY_NAME_LEN) {
        return Err(ApiError::bad_request(format!("Keep your name to {MAX_DISPLAY_NAME_LEN} characters.")));
    }
    if let Some(avatar) = &body.avatar {
        check_avatar(avatar).map_err(ApiError::bad_request)?;
    }
    let mut active: user::ActiveModel = current_user(&s, &auth).await?.into();
    active.display_name = Set(name);
    active.avatar = Set(body.avatar);
    let saved = active.update(&s.db).await?;
    Ok(Json(Profile { display_name: saved.display_name, avatar: saved.avatar }))
}

/// The wrapped encryption key, for a device to unwrap with the password.
pub async fn encryption_key(State(s): State<AppState>, auth: AuthUser) -> Result<Json<EncryptionKey>, ApiError> {
    Ok(Json(EncryptionKey { wrapped: current_user(&s, &auth).await?.encryption_key }))
}

/// Replaces the wrapped encryption key (made, or wrapped again, on a device).
pub async fn set_encryption_key(State(s): State<AppState>, auth: AuthUser, Json(body): Json<EncryptionKey>) -> Result<StatusCode, ApiError> {
    if body.wrapped.as_ref().is_some_and(|w| w.is_empty() || w.len() > MAX_WRAPPED_KEY_LEN) {
        return Err(ApiError::bad_request("That encryption key isn't valid."));
    }
    let mut active: user::ActiveModel = current_user(&s, &auth).await?.into();
    active.encryption_key = Set(body.wrapped);
    active.update(&s.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Emails a code that turns off the app lock on a device, for a forgotten PIN.
pub async fn app_lock_code(State(s): State<AppState>, auth: AuthUser) -> Result<StatusCode, ApiError> {
    let account = current_user(&s, &auth).await?;
    if !s.limits.code_requests.hit(&format!("unlock:{}", account.id)) {
        return Err(ApiError::too_many("You've asked for several codes already. Check your inbox and spam folder, or try again in an hour."));
    }
    codes::send(&s, &account, Purpose::UnlockApp).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Checks (and uses up) that code.
pub async fn app_lock_check(State(s): State<AppState>, auth: AuthUser, Json(body): Json<CheckCode>) -> Result<StatusCode, ApiError> {
    codes::check(&s, &auth.user_id, Purpose::UnlockApp, &body.code).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Checks the password, for a device about to unlock or create encrypted data.
pub async fn verify_password(State(s): State<AppState>, auth: AuthUser, Json(body): Json<axiom_protocol::ConfirmPassword>) -> Result<StatusCode, ApiError> {
    let account = current_user(&s, &auth).await?;
    confirm_password(&s, &account, body.password, body.login_key).await?;
    Ok(StatusCode::NO_CONTENT)
}
