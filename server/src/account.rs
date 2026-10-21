//! Managing a signed-in account: its devices, its password, and deleting it.

use axiom_protocol::{ChangePassword, DeleteAccount, Device, check_password};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, ModelTrait, QueryFilter, QueryOrder, Set, TransactionTrait};

use crate::AppState;
use crate::auth::{AuthUser, confirm_password, password, revoke_sessions};
use crate::entities::{password_reset, session, sync_record, user};
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
    confirm_password(&s, &account, body.current_password).await?;
    check_password(&body.new_password).map_err(ApiError::bad_request)?;

    let password_hash = password::hash(body.new_password).await?;
    let txn = s.db.begin().await?;
    let mut active: user::ActiveModel = account.into();
    active.password_hash = Set(password_hash);
    active.update(&txn).await?;
    revoke_sessions(&txn, &auth.user_id, Some(&auth.session_id)).await?;
    txn.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Deletes the account and everything stored with it: devices, reset codes
/// and every synced row. Copies on the user's computers are left alone.
pub async fn delete_account(State(s): State<AppState>, auth: AuthUser, Json(body): Json<DeleteAccount>) -> Result<StatusCode, ApiError> {
    let account = current_user(&s, &auth).await?;
    confirm_password(&s, &account, body.password).await?;

    // Deleted explicitly rather than relying on ON DELETE CASCADE, which
    // SQLite only honours when foreign keys are switched on.
    let txn = s.db.begin().await?;
    sync_record::Entity::delete_many().filter(sync_record::Column::UserId.eq(&account.id)).exec(&txn).await?;
    password_reset::Entity::delete_many().filter(password_reset::Column::UserId.eq(&account.id)).exec(&txn).await?;
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
