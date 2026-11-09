//! Short codes emailed to an account, to prove someone reads its address:
//! confirming it at sign-up, and turning off the app lock after a forgotten
//! PIN. Like reset codes, only a hash is stored, and a few wrong guesses use
//! a code up.

use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set, TransactionTrait};
use sea_orm::sea_query::{Expr, ExprTrait};

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
    let txn = s.db.begin().await?;
    crate::auth::locked_user(&txn, &user.id).await?;
    email_code::Entity::delete_many()
        .filter(email_code::Column::UserId.eq(&user.id))
        .filter(email_code::Column::Purpose.eq(purpose.as_str()))
        .exec(&txn)
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
    .insert(&txn)
    .await?;
    txn.commit().await?;

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
pub async fn check(db: &impl ConnectionTrait, user_id: &str, purpose: Purpose, code: &str) -> Result<(), ApiError> {
    let now = Utc::now();
    let found = email_code::Entity::find()
        .filter(email_code::Column::UserId.eq(user_id))
        .filter(email_code::Column::Purpose.eq(purpose.as_str()))
        .filter(email_code::Column::UsedAt.is_null())
        .filter(email_code::Column::ExpiresAt.gt(now))
        .one(db)
        .await?
        .ok_or_else(|| ApiError::bad_request(WRONG_CODE))?;
    if found.attempts >= ATTEMPTS {
        return Err(ApiError::bad_request("Too many wrong codes. Ask for a new one."));
    }
    let right = found.code_hash == hash_token(&normalize_code(code));
    let mut update = email_code::Entity::update_many()
        .filter(email_code::Column::Id.eq(found.id))
        .filter(email_code::Column::UsedAt.is_null())
        .filter(email_code::Column::ExpiresAt.gt(Utc::now()))
        .filter(email_code::Column::Attempts.lt(ATTEMPTS));
    if right {
        update = update.col_expr(email_code::Column::UsedAt, Expr::value(Some(now)));
    } else {
        update = update.col_expr(email_code::Column::Attempts, Expr::col(email_code::Column::Attempts).add(1));
    }
    let changed = update.exec(db).await?;
    if right && changed.rows_affected == 1 { Ok(()) } else { Err(ApiError::bad_request(WRONG_CODE)) }
}
