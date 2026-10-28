//! Notification emails. The app plans them (it knows the user's data and time
//! zone); the server keeps the plan and sends each email when it's due, so
//! they arrive while the app is closed. See `axiom_protocol::notify`.
//!
//! A free host sleeps when idle, so a scheduled request (see
//! `.github/workflows/wake-server.yml`) wakes it every hour; `run` then sends
//! whatever has come due.

use std::collections::HashSet;
use std::time::Duration;

use axiom_protocol::notify::{Digest, EMAIL_KINDS, MAX_PLANNED, PlanEmails, PlanResult, Unsubscribed};
use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Html;
use chrono::Utc;
use sea_orm::sea_query::OnConflict;
use sea_orm::{ColumnTrait, DbErr, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set, TransactionTrait};
use serde::Deserialize;

use crate::AppState;
use crate::auth::AuthUser;
use crate::digest_mail;
use crate::entities::{email_opt_out, planned_email, user};
use crate::error::ApiError;

/// Plans reach this far ahead (a week, with room for time zones).
const PLAN_DAYS: i64 = 16;
/// An email this late (the server slept through it) isn't worth sending.
const STALE_HOURS: i64 = 6;
/// However many notifications are on, nobody gets more than this a day.
const MAX_PER_DAY: u64 = 12;
const MAX_DIGEST_BYTES: usize = 32 * 1024;
const TICK: Duration = Duration::from_secs(60);

/// Replaces the emails planned for this account. Ones already sent stay sent.
pub async fn plan(State(s): State<AppState>, auth: AuthUser, Json(body): Json<PlanEmails>) -> Result<Json<PlanResult>, ApiError> {
    crate::admin::require(&s, &auth.user_id, axiom_protocol::permissions::EMAIL).await?;
    if body.emails.len() > MAX_PLANNED {
        return Err(ApiError::bad_request(format!("Plan at most {MAX_PLANNED} emails at a time.")));
    }
    let now = Utc::now();
    let mut keys = HashSet::new();
    for email in &body.emails {
        let kind = email.digest.kind();
        if !EMAIL_KINDS.contains(&kind) {
            return Err(ApiError::bad_request(format!("{kind} isn't sent by email.")));
        }
        if email.key.is_empty() || email.key.len() > 100 || !keys.insert(email.key.as_str()) {
            return Err(ApiError::bad_request("Each planned email needs its own key."));
        }
        if email.send_at < now - chrono::Duration::hours(STALE_HOURS) || email.send_at > now + chrono::Duration::days(PLAN_DAYS) {
            return Err(ApiError::bad_request("Plan emails for the next two weeks only."));
        }
    }

    let txn = s.db.begin().await?;
    if !body.resubscribe.is_empty() {
        email_opt_out::Entity::delete_many()
            .filter(email_opt_out::Column::UserId.eq(&auth.user_id))
            .filter(email_opt_out::Column::Kind.is_in(body.resubscribe.iter().map(String::as_str)))
            .exec(&txn)
            .await?;
    }
    // Whatever isn't in the new plan (and hasn't gone) is dropped.
    planned_email::Entity::delete_many()
        .filter(planned_email::Column::UserId.eq(&auth.user_id))
        .filter(planned_email::Column::SentAt.is_null())
        .filter(planned_email::Column::Key.is_not_in(keys.iter().copied()))
        .exec(&txn)
        .await?;
    for email in body.emails {
        let digest = serde_json::to_string(&email.digest).map_err(ApiError::internal)?;
        if digest.len() > MAX_DIGEST_BYTES {
            return Err(ApiError::bad_request("One of the planned emails is too long."));
        }
        let row = planned_email::ActiveModel {
            user_id: Set(auth.user_id.clone()),
            key: Set(email.key),
            kind: Set(email.digest.kind().into()),
            send_at: Set(email.send_at),
            digest: Set(digest),
            sent_at: Set(None),
        };
        // An email already sent keeps its row (and isn't sent again).
        let sent = planned_email::Entity::find_by_id((auth.user_id.clone(), row.key.clone().unwrap()))
            .filter(planned_email::Column::SentAt.is_not_null())
            .one(&txn)
            .await?;
        if sent.is_none() {
            planned_email::Entity::insert(row)
                .on_conflict(
                    OnConflict::columns([planned_email::Column::UserId, planned_email::Column::Key])
                        .update_columns([planned_email::Column::Kind, planned_email::Column::SendAt, planned_email::Column::Digest])
                        .to_owned(),
                )
                .exec(&txn)
                .await?;
        }
    }
    // A week of history is plenty to stop repeats.
    planned_email::Entity::delete_many()
        .filter(planned_email::Column::UserId.eq(&auth.user_id))
        .filter(planned_email::Column::SentAt.lt(now - chrono::Duration::days(8)))
        .exec(&txn)
        .await?;
    let unsubscribed = email_opt_out::Entity::find()
        .filter(email_opt_out::Column::UserId.eq(&auth.user_id))
        .all(&txn)
        .await?
        .into_iter()
        .map(|o| Unsubscribed { kind: o.kind, at: o.at })
        .collect();
    txn.commit().await?;
    Ok(Json(PlanResult { unsubscribed }))
}

#[derive(Deserialize)]
pub struct LinkQuery {
    token: String,
}

/// The page an unsubscribe link opens.
pub async fn unsubscribe_page(State(s): State<AppState>, Query(q): Query<LinkQuery>) -> (StatusCode, Html<String>) {
    match unsubscribe(&s, &q.token).await {
        Ok(kind) => (StatusCode::OK, Html(page("You're unsubscribed", &format!("You won't get these emails any more. To get them again, switch {} emails back on in Axiom under Extensions → Notifications.", what(&kind))))),
        Err(message) => (StatusCode::BAD_REQUEST, Html(page("That link didn't work", &message))),
    }
}

/// One-click unsubscribe from a mail app's button (RFC 8058).
pub async fn unsubscribe_now(State(s): State<AppState>, Query(q): Query<LinkQuery>) -> StatusCode {
    match unsubscribe(&s, &q.token).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::BAD_REQUEST,
    }
}

async fn unsubscribe(s: &AppState, token: &str) -> Result<String, String> {
    let bad = || "The link may be incomplete. You can always switch emails off in Axiom under Extensions → Notifications.".to_owned();
    let (user_id, kind) = s.keys.verify_unsubscribe(token).ok_or_else(bad)?;
    if !EMAIL_KINDS.contains(&kind.as_str()) {
        return Err(bad());
    }
    let failed = |e: DbErr| {
        tracing::error!("Couldn't unsubscribe: {e}");
        "Something went wrong on our side. Try the link again in a minute.".to_owned()
    };
    email_opt_out::Entity::insert(email_opt_out::ActiveModel { user_id: Set(user_id.clone()), kind: Set(kind.clone()), at: Set(Utc::now()) })
        .on_conflict(
            OnConflict::columns([email_opt_out::Column::UserId, email_opt_out::Column::Kind])
                .update_column(email_opt_out::Column::At)
                .to_owned(),
        )
        .exec(&s.db)
        .await
        .map_err(failed)?;
    planned_email::Entity::delete_many()
        .filter(planned_email::Column::UserId.eq(&user_id))
        .filter(planned_email::Column::Kind.eq(&kind))
        .filter(planned_email::Column::SentAt.is_null())
        .exec(&s.db)
        .await
        .map_err(failed)?;
    tracing::info!("Someone unsubscribed from {kind} emails");
    Ok(kind)
}

fn what(kind: &str) -> &'static str {
    match kind {
        "project_board.deadlines" => "Project Board deadline",
        "daily_plan.deadlines" => "Daily Plan deadline",
        "daily_plan.agenda" => "morning agenda",
        "uni.today" => "University lecture",
        "uni.weekly" => "University weekly",
        "journal.reminder" => "Journal reminder",
        _ => "reading recap",
    }
}

fn page(title: &str, message: &str) -> String {
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · Axiom</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f3efe8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1d1a">
<main style="max-width:420px;margin:24px;padding:32px;background:#fff;border:1px solid #ebe6dd;border-radius:16px;text-align:center">
<div style="font-size:13px;letter-spacing:4px;font-weight:700">AXIOM</div>
<h1 style="font-size:22px;margin:18px 0 8px">{title}</h1><p style="margin:0;line-height:1.55;color:#6b665d">{message}</p></main></body></html>"#,
        title = digest_mail::escape(title),
        message = digest_mail::escape(message),
    )
}

/// Sends what's due, every minute while the server is awake.
pub async fn run(s: AppState) {
    let mut every = tokio::time::interval(TICK);
    // After a pause (a computer asleep), one run, not one for every tick missed.
    every.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        every.tick().await;
        match send_due(&s).await {
            Ok(0) => {}
            Ok(n) => tracing::info!("Sent {n} notification email{}", if n == 1 { "" } else { "s" }),
            Err(e) => tracing::error!("Couldn't send notification emails: {e}"),
        }
    }
}

/// Sends every planned email that's come due; returns how many went out.
pub async fn send_due(s: &AppState) -> Result<usize, DbErr> {
    let now = Utc::now();
    let due = planned_email::Entity::find()
        .filter(planned_email::Column::SentAt.is_null())
        .filter(planned_email::Column::SendAt.lte(now))
        .order_by_asc(planned_email::Column::SendAt)
        .limit(100)
        .all(&s.db)
        .await?;
    let mut sent = 0;
    for email in due {
        let (user_id, key) = (email.user_id.clone(), email.key.clone());
        let mark = |at| async move {
            planned_email::Entity::update_many()
                .col_expr(planned_email::Column::SentAt, sea_orm::sea_query::Expr::value(Some(at)))
                .filter(planned_email::Column::UserId.eq(&user_id))
                .filter(planned_email::Column::Key.eq(&key))
                .exec(&s.db)
                .await
        };
        let Some(account) = user::Entity::find_by_id(&email.user_id).one(&s.db).await? else {
            planned_email::Entity::delete_many().filter(planned_email::Column::UserId.eq(&email.user_id)).exec(&s.db).await?;
            continue;
        };
        let opted_out = email_opt_out::Entity::find_by_id((email.user_id.clone(), email.kind.clone())).one(&s.db).await?.is_some();
        let today = planned_email::Entity::find()
            .filter(planned_email::Column::UserId.eq(&email.user_id))
            .filter(planned_email::Column::SentAt.gt(now - chrono::Duration::days(1)))
            .count(&s.db)
            .await?;
        let digest = serde_json::from_str::<Digest>(&email.digest).ok();
        let skip = email.send_at < now - chrono::Duration::hours(STALE_HOURS) || opted_out || today >= MAX_PER_DAY || !s.is_approved(&account) || !s.may(&account, axiom_protocol::permissions::EMAIL);
        match digest {
            Some(digest) if !skip => {
                let link = format!("{}{}?token={}", s.public_url, axiom_protocol::routes::NOTIFY_UNSUBSCRIBE, s.keys.unsubscribe_token(&account.id, &email.kind));
                match s.mailer.send(digest_mail::render(&account.email, &digest, &link)).await {
                    Ok(()) => {
                        mark(now).await?;
                        sent += 1;
                    }
                    // Tried again next minute, until it's stale.
                    Err(e) => tracing::error!("Couldn't send a notification email: {e}"),
                }
            }
            _ => {
                mark(now).await?;
            }
        }
    }
    Ok(sent)
}

/// Forgets a deleted account's plans and opt-outs.
pub async fn forget_user(db: &impl sea_orm::ConnectionTrait, user_id: &str) -> Result<(), DbErr> {
    planned_email::Entity::delete_many().filter(planned_email::Column::UserId.eq(user_id)).exec(db).await?;
    email_opt_out::Entity::delete_many().filter(email_opt_out::Column::UserId.eq(user_id)).exec(db).await?;
    Ok(())
}
