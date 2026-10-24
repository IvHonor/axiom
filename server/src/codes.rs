//! Short codes emailed to an account, to prove someone reads its address:
//! confirming it at sign-up, and turning off the app lock after a forgotten
//! PIN. Like reset codes, only a hash is stored, and a few wrong guesses use
//! a code up.

use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};

use crate::AppState;
use crate::auth::tokens::hash_token;
use crate::auth::{WRONG_CODE, new_reset_code};
use crate::entities::{email_code, new_id, user};
use crate::error::ApiError;
use crate::mail;
use axiom_protocol::normalize_code;

const MINUTES: i64 = 30;
const ATTEMPTS: i32 = 5;

#[derive(Clone, Copy)]
pub enum Purpose {
    ConfirmEmail,
    UnlockApp,
}

impl Purpose {
    fn as_str(self) -> &'static str {
        match self {
            Purpose::ConfirmEmail => "confirm_email",
            Purpose::UnlockApp => "unlock_app",
        }
    }
}

/// Emails `user` a new code, replacing any earlier one for the same purpose.
pub async fn send(s: &AppState, user: &user::Model, purpose: Purpose) -> Result<(), ApiError> {
    let code = new_reset_code();
    let now = Utc::now();
    email_code::Entity::delete_many()
        .filter(email_code::Column::UserId.eq(&user.id))
        .filter(email_code::Column::Purpose.eq(purpose.as_str()))
        .exec(&s.db)
        .await?;
    email_code::ActiveModel {
        id: Set(new_id()),
        user_id: Set(user.id.clone()),
        purpose: Set(purpose.as_str().into()),
        code_hash: Set(hash_token(&code)),
        attempts: Set(0),
        created_at: Set(now),
        expires_at: Set(now + chrono::Duration::minutes(MINUTES)),
        used_at: Set(None),
    }
    .insert(&s.db)
    .await?;

    let email = match purpose {
        Purpose::ConfirmEmail => mail::confirm_code(&user.email, &code, MINUTES),
        Purpose::UnlockApp => mail::unlock_code(&user.email, &code, MINUTES),
    };
    // In the background, so the answer doesn't wait on the email provider.
    let state = s.clone();
    tokio::spawn(async move {
        if let Err(err) = state.mailer.send(email).await {
            tracing::error!("Couldn't send a code email: {err}");
        }
    });
    Ok(())
}

/// Uses up the user's code for `purpose` if `code` is it.
pub async fn check(s: &AppState, user_id: &str, purpose: Purpose, code: &str) -> Result<(), ApiError> {
    let now = Utc::now();
    let found = email_code::Entity::find()
        .filter(email_code::Column::UserId.eq(user_id))
        .filter(email_code::Column::Purpose.eq(purpose.as_str()))
        .filter(email_code::Column::UsedAt.is_null())
        .filter(email_code::Column::ExpiresAt.gt(now))
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::bad_request(WRONG_CODE))?;
    if found.attempts >= ATTEMPTS {
        return Err(ApiError::bad_request("Too many wrong codes. Ask for a new one."));
    }
    let right = found.code_hash == hash_token(&normalize_code(code));
    let attempts = found.attempts + 1;
    let mut found: email_code::ActiveModel = found.into();
    if right {
        found.used_at = Set(Some(now));
    } else {
        found.attempts = Set(attempts);
    }
    found.update(&s.db).await?;
    if right { Ok(()) } else { Err(ApiError::bad_request(WRONG_CODE)) }
}
