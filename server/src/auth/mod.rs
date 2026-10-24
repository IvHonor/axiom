//! Signing up, signing in, refreshing, signing out and resetting a password.

pub mod password;
pub mod tokens;

use axiom_protocol::{
    ConfirmEmail, Credentials, ForgotPassword, Pending, PLAIN_PASSWORD, RefreshRequest, ResetPassword, Session, User, check_email, check_password,
    TERMS_VERSION, is_login_key, normalize_code, normalize_email,
};
use axum::Json;
use axum::extract::{FromRequestParts, State};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use sea_orm::sea_query::{Condition, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set, SqlErr, TransactionTrait};

use crate::AppState;
use crate::codes::{self, Purpose};
use crate::entities::{new_id, password_reset, session, user};
use crate::error::ApiError;
use crate::limit::ClientIp;
use crate::mail;
use tokens::{ACCESS_TTL, REFRESH_TTL_DAYS, hash_token, new_refresh_token};

const WRONG_CREDENTIALS: &str = "Email or password is incorrect.";
const SIGNED_OUT: &str = "You've been signed out. Sign in again to continue.";
pub(crate) const WAITING: &str =
    "Your account is on the waiting list. We'll email you as soon as it's approved, and then you can sign in.";

/// Creates an account. It can't sign in until its address is confirmed with
/// an emailed code (202 with `Pending`), and, with the waiting list on, until
/// an admin approves it (202 too, and the admins are emailed).
pub async fn sign_up(State(s): State<AppState>, ip: ClientIp, Json(body): Json<Credentials>) -> Result<Response, ApiError> {
    s.limits.check_ip(&ip)?;
    let email = normalize_email(&body.email);
    check_email(&email).map_err(ApiError::bad_request)?;
    check_password(&body.password).map_err(ApiError::bad_request)?;
    // Older versions of Axiom don't ask, so they're told to update.
    let accepted = body.accepted_terms.as_deref() == Some(TERMS_VERSION);
    if s.require_terms && !accepted {
        return Err(ApiError::bad_request("Agree to the terms of use to create an account. If there's no box to tick, update Axiom first."));
    }

    let taken = || ApiError::new(StatusCode::CONFLICT, "An account with this email already exists. Sign in instead.");
    let now = Utc::now();
    let login_key = is_login_key(&body.password);
    let terms = accepted.then(|| TERMS_VERSION.to_owned());
    if let Some(existing) = find_user(&s, &email).await? {
        // Never confirmed: whoever reads the address can sign up over it, so
        // nobody can hold someone else's email hostage.
        if s.confirm_emails && existing.email_confirmed_at.is_none() {
            let mut active: user::ActiveModel = existing.into();
            active.password_hash = Set(password::hash(body.password).await?);
            active.login_key = Set(login_key);
            active.created_at = Set(now);
            active.terms_version = Set(terms);
            active.terms_accepted_at = Set(accepted.then_some(now));
            let user = active.update(&s.db).await?;
            send_confirmation_code(&s, &user).await?;
            return Ok(pending(user.email, true));
        }
        if !s.is_approved(&existing) {
            return Err(ApiError::new(StatusCode::CONFLICT, WAITING));
        }
        return Err(taken());
    }

    let approved = !s.waitlist_on() || s.is_owner(&email);
    let defaults = s.settings.read().unwrap().default_permissions.join(",");
    let user = user::ActiveModel {
        id: Set(new_id()),
        email: Set(email),
        password_hash: Set(password::hash(body.password).await?),
        created_at: Set(now),
        sync_seq: Set(0),
        approved_at: Set(approved.then_some(now)),
        display_name: Set(None),
        avatar: Set(None),
        role: Set("member".into()),
        permissions: Set(defaults),
        encryption_key: Set(None),
        login_key: Set(login_key),
        email_confirmed_at: Set((!s.confirm_emails).then_some(now)),
        terms_version: Set(terms),
        terms_accepted_at: Set(accepted.then_some(now)),
    }
    .insert(&s.db)
    .await
    // Two sign-ups for one email at the same moment: the second hits the unique index.
    .map_err(|err| match err.sql_err() {
        Some(SqlErr::UniqueConstraintViolation(_)) => taken(),
        _ => err.into(),
    })?;

    if s.confirm_emails {
        send_confirmation_code(&s, &user).await?;
        return Ok(pending(user.email, true));
    }
    if approved {
        return Ok(start_session(&s, user, &body.device_name).await?.into_response());
    }
    tell_admins(&s, &user.email);
    Ok(pending(user.email, false))
}

fn pending(email: String, confirm_email: bool) -> Response {
    (StatusCode::ACCEPTED, Json(Pending { email, confirm_email })).into_response()
}

/// A few confirmation emails per address an hour, however they're asked for.
async fn send_confirmation_code(s: &AppState, user: &user::Model) -> Result<(), ApiError> {
    if !s.limits.code_requests.hit(&user.email) {
        return Err(ApiError::too_many("You've asked for several codes already. Check your inbox and spam folder, or try again in an hour."));
    }
    codes::send(s, user, Purpose::ConfirmEmail).await
}

/// Emails the admins about an account that's joined the waiting list.
fn tell_admins(s: &AppState, email: &str) {
    tracing::info!("A new account joined the waiting list");
    let state = s.clone();
    let email = email.to_owned();
    tokio::spawn(async move {
        for admin in &state.admins {
            if let Err(err) = state.mailer.send(mail::waitlist_request(admin, &email)).await {
                tracing::error!("Couldn't tell an admin about a waiting list request: {err}");
            }
        }
    });
}

/// Confirms an account's address with the code emailed at sign-up. Doesn't
/// sign in: the app signs in with the password next.
pub async fn confirm_email(State(s): State<AppState>, ip: ClientIp, Json(body): Json<ConfirmEmail>) -> Result<StatusCode, ApiError> {
    s.limits.check_ip(&ip)?;
    let email = normalize_email(&body.email);
    // An account that's already confirmed answers like a wrong code, so this
    // can't be used to find out who has one.
    let user = find_user(&s, &email)
        .await?
        .filter(|u| u.email_confirmed_at.is_none())
        .ok_or_else(|| ApiError::bad_request(WRONG_CODE))?;
    codes::check(&s, &user.id, Purpose::ConfirmEmail, &body.code).await?;
    let mut active: user::ActiveModel = user.into();
    active.email_confirmed_at = Set(Some(Utc::now()));
    let user = active.update(&s.db).await?;
    if !s.is_approved(&user) {
        tell_admins(&s, &user.email);
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Emails a new confirmation code to an account that isn't confirmed yet.
/// Always answers the same way, like `forgot_password`.
pub async fn send_confirmation(State(s): State<AppState>, ip: ClientIp, Json(body): Json<ForgotPassword>) -> Result<StatusCode, ApiError> {
    s.limits.check_ip(&ip)?;
    let email = normalize_email(&body.email);
    check_email(&email).map_err(ApiError::bad_request)?;
    match find_user(&s, &email).await? {
        Some(user) if user.email_confirmed_at.is_none() => send_confirmation_code(&s, &user).await?,
        // The same limit either way, so it answers alike.
        _ if !s.limits.code_requests.hit(&email) => {
            return Err(ApiError::too_many("You've asked for several codes already. Check your inbox and spam folder, or try again in an hour."));
        }
        _ => {}
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn sign_in(State(s): State<AppState>, ip: ClientIp, Json(body): Json<Credentials>) -> Result<Response, ApiError> {
    s.limits.check_ip(&ip)?;
    let email = normalize_email(&body.email);
    if s.limits.failed_sign_ins.is_blocked(&email) {
        return Err(ApiError::too_many("Too many wrong passwords for this account. Try again in 15 minutes."));
    }

    let user = find_user(&s, &email).await?;
    let stored = user.as_ref().map(|u| u.password_hash.clone());
    let user = match user {
        Some(user) if password::verify(body.password.clone(), stored).await => user,
        Some(user) if still_plain(&user, &body.password) => return Err(plain_password()),
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
    let user = upgrade(&s, user, body.login_key).await?;
    // The address isn't confirmed: send a fresh code (unless several went
    // out lately) and ask for it.
    if s.confirm_emails && user.email_confirmed_at.is_none() {
        if s.limits.code_requests.hit(&user.email) {
            codes::send(&s, &user, Purpose::ConfirmEmail).await?;
        }
        return Ok(pending(user.email, true));
    }
    // Only someone with the right password learns they're still waiting.
    if !s.is_approved(&user) {
        return Err(ApiError::new(StatusCode::FORBIDDEN, WAITING));
    }
    Ok(start_session(&s, user, &body.device_name).await?.into_response())
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
pub(crate) const WRONG_CODE: &str = "That code isn't right or has expired. Check the email, or ask for a new code.";

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

    let login_key = is_login_key(&body.new_password);
    let password_hash = password::hash(body.new_password).await?;
    let txn = s.db.begin().await?;
    let mut reset: password_reset::ActiveModel = reset.into();
    reset.used_at = Set(Some(now));
    reset.update(&txn).await?;
    // The emailed code proves they read the address, so it's confirmed too.
    let confirmed = user.email_confirmed_at.or(Some(now));
    let mut active: user::ActiveModel = user.into();
    active.password_hash = Set(password_hash);
    active.login_key = Set(login_key);
    active.email_confirmed_at = Set(confirmed);
    let user = active.update(&txn).await?;
    revoke_sessions(&txn, &user.id, None).await?;
    txn.commit().await?;

    s.limits.failed_sign_ins.clear(&email);
    if !s.is_approved(&user) {
        return Err(ApiError::new(StatusCode::FORBIDDEN, format!("Your new password is set. {WAITING}")));
    }
    start_session(&s, user, &body.device_name).await
}

/// Checks a signed-in user's password before a sensitive change. Wrong
/// guesses count towards the same lockout as signing in. `login_key`, sent
/// with a password from before login keys, replaces it.
pub(crate) async fn confirm_password(s: &AppState, user: &user::Model, password: String, login_key: Option<String>) -> Result<(), ApiError> {
    if s.limits.failed_sign_ins.is_blocked(&user.email) {
        return Err(ApiError::too_many("Too many wrong passwords for this account. Try again in 15 minutes."));
    }
    if password::verify(password.clone(), Some(user.password_hash.clone())).await {
        s.limits.failed_sign_ins.clear(&user.email);
        upgrade(s, user.clone(), login_key).await?;
        Ok(())
    } else if still_plain(user, &password) {
        Err(plain_password())
    } else {
        s.limits.failed_sign_ins.hit(&user.email);
        Err(ApiError::new(StatusCode::FORBIDDEN, "That password isn't right."))
    }
}

/// A login key sent to an account that still has the password itself: it
/// can't match, so the device is asked for the password (see `PLAIN_PASSWORD`).
/// Not a wrong guess, so it doesn't count towards the lockout.
fn still_plain(user: &user::Model, sent: &str) -> bool {
    !user.login_key && is_login_key(sent)
}

fn plain_password() -> ApiError {
    let status = StatusCode::from_u16(PLAIN_PASSWORD).expect("a valid status");
    ApiError::new(status, "This account's password is from an older version of Axiom. Sign in again to update it.")
}

/// After the password itself was right: swaps it for the login key sent with
/// it, so the server needn't see the password again.
async fn upgrade(s: &AppState, user: user::Model, login_key: Option<String>) -> Result<user::Model, ApiError> {
    match login_key {
        Some(key) if !user.login_key && is_login_key(&key) => {
            let mut active: user::ActiveModel = user.into();
            active.password_hash = Set(password::hash(key).await?);
            active.login_key = Set(true);
            Ok(active.update(&s.db).await?)
        }
        _ => Ok(user),
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
pub(crate) fn new_reset_code() -> String {
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
    Ok(Json(s.user_view(user)))
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
        signed_in(s, &parts.headers).await?.ok_or_else(|| ApiError::unauthorized("Sign in to continue."))
    }
}

/// The signed-in user, for a route where signing in is optional: None
/// without an `Authorization` header, an error if the one sent is no good.
pub(crate) async fn signed_in(s: &AppState, headers: &HeaderMap) -> Result<Option<AuthUser>, ApiError> {
    let Some(value) = headers.get(AUTHORIZATION) else { return Ok(None) };
    let token = value
        .to_str()
        .ok()
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
    Ok(Some(AuthUser { user_id: claims.sub, session_id: claims.sid }))
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
        user: s.user_view(user),
    }
}

async fn revoke(s: &AppState, session: session::Model) -> Result<(), ApiError> {
    let mut active: session::ActiveModel = session.into();
    active.revoked_at = Set(Some(Utc::now()));
    active.update(&s.db).await?;
    Ok(())
}
