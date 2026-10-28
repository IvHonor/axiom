//! Deletes what the server no longer needs, every hour, so personal data
//! isn't kept longer than the privacy notice says.

use std::time::Duration;

use chrono::{Duration as Days, Utc};
use sea_orm::{ColumnTrait, Condition, DbErr, EntityTrait, QueryFilter};

use crate::AppState;
use crate::entities::{ai_usage, email_code, password_reset, session, support_ticket, user};

const TICK: Duration = Duration::from_secs(60 * 60);
/// A sign-up that never confirmed its address.
pub const UNCONFIRMED_DAYS: i64 = 7;
/// A device's record after it was signed out or its sign-in ran out.
pub const ENDED_SESSION_DAYS: i64 = 30;
/// A support ticket after it was marked solved.
pub const SOLVED_TICKET_DAYS: i64 = 365;
/// How many times an account used the assistant on a day, after that day.
pub const AI_USAGE_DAYS: i64 = 7;

pub async fn run(s: AppState) {
    let mut every = tokio::time::interval(TICK);
    // After a pause (a computer asleep), one run, not one for every tick missed.
    every.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        every.tick().await;
        match tidy(&s).await {
            Ok(0) => {}
            Ok(n) => tracing::info!("Housekeeping removed {n} old record{}", if n == 1 { "" } else { "s" }),
            Err(e) => tracing::error!("Housekeeping failed: {e}"),
        }
    }
}

/// Removes everything past its time; returns how many rows went.
pub async fn tidy(s: &AppState) -> Result<u64, DbErr> {
    let now = Utc::now();
    let mut removed = 0;

    // Codes and reset codes a day after they stopped working.
    let gone = now - Days::days(1);
    removed += email_code::Entity::delete_many().filter(email_code::Column::ExpiresAt.lt(gone)).exec(&s.db).await?.rows_affected;
    removed += password_reset::Entity::delete_many().filter(password_reset::Column::ExpiresAt.lt(gone)).exec(&s.db).await?.rows_affected;

    // Sign-ups never confirmed. They never signed in, so nothing else is theirs.
    let stale = user::Entity::find()
        .filter(user::Column::EmailConfirmedAt.is_null())
        .filter(user::Column::CreatedAt.lt(now - Days::days(UNCONFIRMED_DAYS)))
        .all(&s.db)
        .await?;
    for account in stale {
        email_code::Entity::delete_many().filter(email_code::Column::UserId.eq(&account.id)).exec(&s.db).await?;
        password_reset::Entity::delete_many().filter(password_reset::Column::UserId.eq(&account.id)).exec(&s.db).await?;
        removed += user::Entity::delete_by_id(&account.id).exec(&s.db).await?.rows_affected;
    }

    let ended = now - Days::days(ENDED_SESSION_DAYS);
    removed += session::Entity::delete_many()
        .filter(Condition::any().add(session::Column::RevokedAt.lt(ended)).add(session::Column::ExpiresAt.lt(ended)))
        .exec(&s.db)
        .await?
        .rows_affected;

    removed += support_ticket::Entity::delete_many()
        .filter(support_ticket::Column::SolvedAt.lt(now - Days::days(SOLVED_TICKET_DAYS)))
        .exec(&s.db)
        .await?
        .rows_affected;

    removed += ai_usage::Entity::delete_many()
        .filter(ai_usage::Column::Day.lt((now - Days::days(AI_USAGE_DAYS)).date_naive()))
        .exec(&s.db)
        .await?
        .rows_affected;
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;
    use sea_orm::{ActiveModelTrait, PaginatorTrait, Set};

    use super::*;
    use crate::Shared;
    use crate::entities::new_id;

    async fn account(s: &AppState, email: &str, created: DateTime<Utc>, confirmed: bool) -> String {
        let id = new_id();
        user::ActiveModel {
            id: Set(id.clone()),
            email: Set(email.into()),
            password_hash: Set("x".into()),
            created_at: Set(created),
            sync_seq: Set(0),
            approved_at: Set(Some(created)),
            display_name: Set(None),
            avatar: Set(None),
            role: Set("member".into()),
            permissions: Set(String::new()),
            encryption_key: Set(None),
            login_key: Set(true),
            email_confirmed_at: Set(confirmed.then_some(created)),
            terms_version: Set(None),
            terms_accepted_at: Set(None),
        }
        .insert(&s.db)
        .await
        .unwrap();
        id
    }

    async fn ticket(s: &AppState, solved: Option<DateTime<Utc>>) {
        support_ticket::ActiveModel {
            id: Set(new_id()),
            user_id: Set(None),
            email: Set("a@example.com".into()),
            kind: Set("bug".into()),
            subject: Set("s".into()),
            message: Set("m".into()),
            app_version: Set("1".into()),
            created_at: Set(Utc::now()),
            solved_at: Set(solved),
        }
        .insert(&s.db)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn only_what_is_past_its_time_goes() {
        let db = crate::db::connect("sqlite::memory:").await.unwrap();
        let s = AppState::from(Shared::new(db, b"test-secret-that-is-at-least-32-bytes"));
        let long_ago = Utc::now() - Days::days(400);
        account(&s, "old-unconfirmed@example.com", long_ago, false).await;
        account(&s, "new-unconfirmed@example.com", Utc::now(), false).await;
        account(&s, "old-confirmed@example.com", long_ago, true).await;
        ticket(&s, Some(long_ago)).await;
        ticket(&s, Some(Utc::now())).await;
        ticket(&s, None).await;
        for days_ago in [AI_USAGE_DAYS + 1, 0] {
            let day = (Utc::now() - Days::days(days_ago)).date_naive();
            ai_usage::ActiveModel { user_id: Set("u".into()), day: Set(day), count: Set(3) }.insert(&s.db).await.unwrap();
        }

        assert_eq!(tidy(&s).await.unwrap(), 3);
        assert_eq!(ai_usage::Entity::find().count(&s.db).await.unwrap(), 1, "today's count stays");
        let left: Vec<String> = user::Entity::find().all(&s.db).await.unwrap().into_iter().map(|u| u.email).collect();
        assert_eq!(left.len(), 2);
        assert!(!left.contains(&"old-unconfirmed@example.com".to_owned()));
        assert_eq!(support_ticket::Entity::find().count(&s.db).await.unwrap(), 2, "open and recently solved stay");
        assert_eq!(tidy(&s).await.unwrap(), 0);
    }
}
