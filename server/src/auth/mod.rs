//! Signing up, signing in, refreshing, signing out and resetting a password.

pub mod password;
pub mod tokens;

use axiom_protocol::{
    Credentials, ForgotPassword, RefreshRequest, ResetPassword, Session, User, check_email, check_password, normalize_code,
    normalize_email,
};
use axum::Json;
use axum::extract::{FromRequestParts, State};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::http::StatusCode;
use chrono::Utc;
use sea_orm::sea_query::{Condition, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set, SqlErr, TransactionTrait};

use crate::AppState;
use crate::entities::{new_id, password_reset, session, user};
use crate::error::ApiError;
use crate::limit::ClientIp;
use crate::mail;
use tokens::{ACCESS_TTL, REFRESH_TTL_DAYS, hash_token, new_refresh_token};

const WRONG_CREDENTIALS: &str = "Email or password is incorrect.";
const SIGNED_OUT: &str = "You've been signed out. Sign in again to continue.";

pub async fn sign_up(State(s): State<AppState>, ip: ClientIp, Json(body): Json<Credentials>) -> Result<Json<Session>, ApiError> {
    s.limits.check_ip(&ip)?;
    let email = normalize_email(&body.email);
    check_email(&email).map_err(ApiError::bad_request)?;
    check_password(&body.password).map_err(ApiError::bad_request)?;

    let taken = || ApiError::new(StatusCode::CONFLICT, "An account with this email already exists. Sign in instead.");
    if find_user(&s, &email).await?.is_some() {
        return Err(taken());
    }

    let user = user::ActiveModel {
        id: Set(new_id()),
        email: Set(email),
        password_hash: Set(password::hash(body.password).await?),
        created_at: Set(Utc::now()),
        sync_seq: Set(0),
    }
    .insert(&s.db)
    .await
    // Two sign-ups for one email at the same moment: the second hits the unique index.
    .map_err(|err| match err.sql_err() {
        Some(SqlErr::UniqueConstraintViolation(_)) => taken(),
        _ => err.into(),
    })?;

    start_session(&s, user, &body.device_name).await
}

pub async fn sign_in(State(s): State<AppState>, ip: ClientIp, Json(body): Json<Credentials>) -> Result<Json<Session>, ApiError> {
    s.limits.check_ip(&ip)?;
    let email = normalize_email(&body.email);
    if s.limits.failed_sign_ins.is_blocked(&email) {
        return Err(ApiError::too_many("Too many wrong passwords for this account. Try again in 15 minutes."));
    }

    let user = find_user(&s, &email).await?;
    let stored = user.as_ref().map(|u| u.password_hash.clone());
    let user = match user {
        Some(user) if password::verify(body.password, stored).await => user,
        _ => {
            // Unknown email and wrong password look identical, so the form
            // can't be used to find out who has an account.
            if !s.limits.failed_sign_ins.hit(&email) {
                return Err(ApiError::too_many("Too many wrong passwords for this account. Try again in 15 minutes."));
            }
            return Err(ApiError::unauthorized(WRONG_CREDENTIALS));
        }
    };

    s.limits.failed_sign_ins.clear(&email);
    start_session(&s, user, &body.device_name).await
}

/// Swaps a refresh token for a new pair. The old token stops working.
pub async fn refresh(State(s): State<AppState>, Json(body): Json<RefreshRequest>) -> Result<Json<Session>, ApiError> {
    let presented = hash_token(&body.refresh_token);
    let now = Utc::now();

    let current = session::Entity::find()
        .filter(session::Column::RefreshHash.eq(&presented))
        .filter(session::Column::RevokedAt.is_null())
        .one(&s.db)
        .await?;
    let session = match current {
        Some(session) => session,
        None => {
            let replaced = session::Entity::find()
                .filter(session::Column::PreviousHash.eq(&presented))
                .filter(session::Column::RevokedAt.is_null())
                .one(&s.db)
                .await?;
            match replaced {
                // The app refreshed a moment ago but never got the answer: let it retry.
                Some(session) if now - session.last_used_at < s.reuse_grace => session,
                // An old token used again much later means someone copied it.
                // End the session, so neither copy works any more.
                Some(session) => {
                    revoke(&s, session).await?;
                    return Err(ApiError::unauthorized(SIGNED_OUT));
                }
                None => return Err(ApiError::unauthorized(SIGNED_OUT)),
            }
        }
    };
    if session.expires_at < now {
        return Err(ApiError::unauthorized(SIGNED_OUT));
    }
    let user = user::Entity::find_by_id(&session.user_id)
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::unauthorized(SIGNED_OUT))?;

    let refresh_token = new_refresh_token();
    let mut active: session::ActiveModel = session.into();
    active.refresh_hash = Set(hash_token(&refresh_token));
    active.previous_hash = Set(Some(presented));
    active.last_used_at = Set(now);
    active.expires_at = Set(now + chrono::Duration::days(REFRESH_TTL_DAYS));
    let session = active.update(&s.db).await?;

    Ok(Json(issue(&s, user, &session.id, refresh_token)))
}

/// Ends the session the refresh token belongs to. Always succeeds, so signing
/// out never gets stuck.
pub async fn sign_out(State(s): State<AppState>, Json(body): Json<RefreshRequest>) -> Result<StatusCode, ApiError> {
    let presented = hash_token(&body.refresh_token);
    let found = session::Entity::find()
        .filter(
            Condition::any()
                .add(session::Column::RefreshHash.eq(&presented))
                .add(session::Column::PreviousHash.eq(&presented)),
        )
        .filter(session::Column::RevokedAt.is_null())
        .one(&s.db)
        .await?;
    if let Some(session) = found {
        revoke(&s, session).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

/// How long an emailed reset code works, and how many wrong tries it allows.
const RESET_CODE_MINUTES: i64 = 30;
const RESET_CODE_ATTEMPTS: i32 = 5;
const WRONG_CODE: &str = "That code isn't right or has expired. Check the email, or ask for a new code.";

/// Emails a reset code if there's an account for the address. Always answers
/// the same way, so it can't be used to find out who has an account.
pub async fn forgot_password(State(s): State<AppState>, ip: ClientIp, Json(body): Json<ForgotPassword>) -> Result<StatusCode, ApiError> {
    s.limits.check_ip(&ip)?;
    let email = normalize_email(&body.email);
    check_email(&email).map_err(ApiError::bad_request)?;
    if !s.limits.reset_requests.hit(&email) {
        return Err(ApiError::too_many(
            "You've asked for several codes already. Check your inbox and spam folder, or try again in an hour.",
        ));
    }

    if let Some(user) = find_user(&s, &email).await? {
        let code = new_reset_code();
        let now = Utc::now();
        // A new code replaces any earlier one.
        password_reset::Entity::delete_many().filter(password_reset::Column::UserId.eq(&user.id)).exec(&s.db).await?;
        password_reset::ActiveModel {
            id: Set(new_id()),
            user_id: Set(user.id),
            code_hash: Set(hash_token(&code)),
            attempts: Set(0),
            created_at: Set(now),
            expires_at: Set(now + chrono::Duration::minutes(RESET_CODE_MINUTES)),
            used_at: Set(None),
        }
        .insert(&s.db)
        .await?;

        // Send in the background: waiting on the email provider would make
        // real accounts answer slower than unknown ones.
        let state = s.clone();
        tokio::spawn(async move {
            if let Err(err) = state.mailer.send(mail::reset_code(&user.email, &code, RESET_CODE_MINUTES)).await {
                tracing::error!("Couldn't send a reset email: {err}");
            }
        });
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Sets a new password with an emailed code, signs every device out, and
/// signs this one in.
pub async fn reset_password(State(s): State<AppState>, ip: ClientIp, Json(body): Json<ResetPassword>) -> Result<Json<Session>, ApiError> {
    s.limits.check_ip(&ip)?;
    check_password(&body.new_password).map_err(ApiError::bad_request)?;
    let email = normalize_email(&body.email);
    let user = find_user(&s, &email).await?.ok_or_else(|| ApiError::bad_request(WRONG_CODE))?;
    let now = Utc::now();
    let reset = password_reset::Entity::find()
        .filter(password_reset::Column::UserId.eq(&user.id))
        .filter(password_reset::Column::UsedAt.is_null())
        .filter(password_reset::Column::ExpiresAt.gt(now))
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::bad_request(WRONG_CODE))?;
    if reset.attempts >= RESET_CODE_ATTEMPTS {
        return Err(ApiError::bad_request("Too many wrong codes. Ask for a new one."));
    }
    if reset.code_hash != hash_token(&normalize_code(&body.code)) {
        let attempts = reset.attempts + 1;
        let mut reset: password_reset::ActiveModel = reset.into();
        reset.attempts = Set(attempts);
        reset.update(&s.db).await?;
        return Err(ApiError::bad_request(WRONG_CODE));
    }

    let password_hash = password::hash(body.new_password).await?;
    let txn = s.db.begin().await?;
    let mut reset: password_reset::ActiveModel = reset.into();
    reset.used_at = Set(Some(now));
    reset.update(&txn).await?;
    let mut active: user::ActiveModel = user.into();
    active.password_hash = Set(password_hash);
    let user = active.update(&txn).await?;
    revoke_sessions(&txn, &user.id, None).await?;
    txn.commit().await?;

    s.limits.failed_sign_ins.clear(&email);
    start_session(&s, user, &body.device_name).await
}

/// Checks a signed-in user's password before a sensitive change. Wrong
/// guesses count towards the same lockout as signing in.
pub(crate) async fn confirm_password(s: &AppState, user: &user::Model, password: String) -> Result<(), ApiError> {
    if s.limits.failed_sign_ins.is_blocked(&user.email) {
        return Err(ApiError::too_many("Too many wrong passwords for this account. Try again in 15 minutes."));
    }
    if password::verify(password, Some(user.password_hash.clone())).await {
        s.limits.failed_sign_ins.clear(&user.email);
        Ok(())
    } else {
        s.limits.failed_sign_ins.hit(&user.email);
        Err(ApiError::new(StatusCode::FORBIDDEN, "That password isn't right."))
    }
}

/// Ends every session of a user, except `keep` if given.
pub(crate) async fn revoke_sessions(db: &impl ConnectionTrait, user_id: &str, keep: Option<&str>) -> Result<(), ApiError> {
    let mut update = session::Entity::update_many()
        .col_expr(session::Column::RevokedAt, Expr::value(Some(Utc::now())))
        .filter(session::Column::UserId.eq(user_id))
        .filter(session::Column::RevokedAt.is_null());
    if let Some(keep) = keep {
        update = update.filter(session::Column::Id.ne(keep));
    }
    update.exec(db).await?;
    Ok(())
}

/// 8 characters from an alphabet without look-alikes (no 0/O, 1/I).
/// 32 characters divide 256 evenly, so every character is equally likely,
/// giving 32^8 (about 10^12) possible codes.
fn new_reset_code() -> String {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut bytes = [0u8; 8];
    rand::fill(&mut bytes);
    bytes.iter().map(|b| ALPHABET[(*b % 32) as usize] as char).collect()
}

pub async fn me(State(s): State<AppState>, auth: AuthUser) -> Result<Json<User>, ApiError> {
    let user = user::Entity::find_by_id(&auth.user_id)
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::unauthorized(SIGNED_OUT))?;
    Ok(Json(user.into()))
}

/// The signed-in user, from the `Authorization: Bearer` header. Add it as a
/// handler argument to make a route require signing in.
pub struct AuthUser {
    pub user_id: String,
    pub session_id: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, s: &AppState) -> Result<Self, ApiError> {
        let token = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .ok_or_else(|| ApiError::unauthorized("Sign in to continue."))?;
        let claims = s.keys.verify(token).ok_or_else(|| ApiError::unauthorized("Your session has expired."))?;

        // The token is genuine, but the device may have been signed out since.
        let live = session::Entity::find_by_id(&claims.sid)
            .filter(session::Column::RevokedAt.is_null())
            .one(&s.db)
            .await?
            .is_some();
        if !live {
            return Err(ApiError::unauthorized(SIGNED_OUT));
        }
        Ok(AuthUser { user_id: claims.sub, session_id: claims.sid })
    }
}

async fn find_user(s: &AppState, email: &str) -> Result<Option<user::Model>, ApiError> {
    Ok(user::Entity::find().filter(user::Column::Email.eq(email)).one(&s.db).await?)
}

async fn start_session(s: &AppState, user: user::Model, device_name: &str) -> Result<Json<Session>, ApiError> {
    let refresh_token = new_refresh_token();
    let now = Utc::now();
    let device_name: String = device_name.trim().chars().take(100).collect();
    let session = session::ActiveModel {
        id: Set(new_id()),
        user_id: Set(user.id.clone()),
        device_name: Set(if device_name.is_empty() { "Unknown device".into() } else { device_name }),
        refresh_hash: Set(hash_token(&refresh_token)),
        previous_hash: Set(None),
        created_at: Set(now),
        last_used_at: Set(now),
        expires_at: Set(now + chrono::Duration::days(REFRESH_TTL_DAYS)),
        revoked_at: Set(None),
    }
    .insert(&s.db)
    .await?;
    Ok(Json(issue(s, user, &session.id, refresh_token)))
}

fn issue(s: &AppState, user: user::Model, session_id: &str, refresh_token: String) -> Session {
    Session {
        access_token: s.keys.access_token(&user.id, session_id),
        expires_in: ACCESS_TTL.as_secs(),
        refresh_token,
        user: user.into(),
    }
}

async fn revoke(s: &AppState, session: session::Model) -> Result<(), ApiError> {
    let mut active: session::ActiveModel = session.into();
    active.revoked_at = Set(Some(Utc::now()));
    active.update(&s.db).await?;
    Ok(())
}
