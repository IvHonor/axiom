//! A week or month with Lemma for the Analytics view: how much you asked,
//! and the changes it offered to make in each area, by what you decided.

use std::collections::BTreeMap;

use chrono::Days;
use sea_orm::prelude::{Date, DateTimeUtc};
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QuerySelect};
use serde::Serialize;

use super::entities::{message, proposal};
use crate::error::Result;
use crate::features::period::{local_day, Compare, Headline, Period};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LemmaAnalytics {
    /// Changes you confirmed.
    pub headline: Headline,
    /// Messages you sent.
    pub asked: Compare,
    pub days: Vec<LemmaDay>,
    /// Changes offered in the period, by area, most first.
    pub areas: Vec<AreaChanges>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LemmaDay {
    pub day: Date,
    pub asked: usize,
    pub confirmed: usize,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AreaChanges {
    pub area: String,
    /// Confirmed (undone ones included: they were made).
    pub confirmed: usize,
    pub discarded: usize,
    /// Still waiting, or failed.
    pub other: usize,
}

fn midnight_utc(day: Date) -> DateTimeUtc {
    day.and_hms_opt(0, 0, 0).expect("midnight exists").and_utc()
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<LemmaAnalytics> {
    // A day either side, so every local day of the range is in.
    let (from, to) = (midnight_utc(period.trend_start() - Days::new(1)), midnight_utc(period.end + Days::new(1)));
    let asked: Vec<Date> = message::Entity::find()
        .select_only()
        .column(message::Column::CreatedAt)
        .filter(message::Column::DeletedAt.is_null())
        .filter(message::Column::Role.eq("user"))
        .filter(message::Column::CreatedAt.gte(from))
        .filter(message::Column::CreatedAt.lt(to))
        .into_tuple::<DateTimeUtc>()
        .all(db)
        .await?
        .into_iter()
        .map(local_day)
        .collect();
    let offered: Vec<(Date, proposal::Model)> = proposal::Entity::find()
        .filter(proposal::Column::DeletedAt.is_null())
        .filter(proposal::Column::CreatedAt.gte(from))
        .filter(proposal::Column::CreatedAt.lt(to))
        .all(db)
        .await?
        .into_iter()
        .map(|p| (local_day(p.created_at), p))
        .collect();
    let made = |p: &proposal::Model| matches!(p.status.as_str(), "confirmed" | "undone");
    let confirmed = |from: Date, to: Date| offered.iter().filter(move |(d, p)| *d >= from && *d < to && made(p)).count();

    let mut areas: BTreeMap<&str, AreaChanges> = BTreeMap::new();
    for (_, p) in offered.iter().filter(|(d, _)| period.contains(*d)) {
        let entry = areas.entry(p.area.as_str()).or_insert_with(|| AreaChanges { area: p.area.clone(), ..Default::default() });
        match p.status.as_str() {
            _ if made(p) => entry.confirmed += 1,
            "discarded" => entry.discarded += 1,
            _ => entry.other += 1,
        }
    }
    let mut areas: Vec<AreaChanges> = areas.into_values().collect();
    areas.sort_by_key(|a| std::cmp::Reverse(a.confirmed + a.discarded + a.other));

    Ok(LemmaAnalytics {
        headline: period.headline(|from, to| Some(confirmed(from, to) as f64)),
        asked: period.compare(|from, to| Some(asked.iter().filter(|d| **d >= from && **d < to).count() as f64)),
        days: period.daily(|d| LemmaDay {
            day: d,
            asked: asked.iter().filter(|x| **x == d).count(),
            confirmed: confirmed(d, d + Days::new(1)),
        }),
        areas,
    })
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use sea_orm::{ActiveModelTrait, ConnectOptions, Database, Set};

    use super::super::entities::{chat, message, proposal};
    use super::*;

    #[tokio::test]
    async fn changes_count_by_what_was_decided() {
        let mut options = ConnectOptions::new("sqlite::memory:");
        options.max_connections(1).sqlx_logging(false);
        let db = Database::connect(options).await.unwrap();
        crate::db::prepare(&db).await.unwrap();
        let now = Utc::now();
        chat::ActiveModel { id: Set("c".into()), title: Set("Hi".into()), created_at: Set(now), updated_at: Set(now), deleted_at: Set(None) }.insert(&db).await.unwrap();
        for (i, role) in ["user", "assistant", "user"].into_iter().enumerate() {
            message::ActiveModel {
                id: Set(format!("m{i}")),
                chat_id: Set("c".into()),
                position: Set(i as i64),
                role: Set(role.into()),
                text: Set(Some("…".into())),
                data: Set(None),
                provider: Set(None),
                created_at: Set(now),
                updated_at: Set(now),
                deleted_at: Set(None),
            }
            .insert(&db)
            .await
            .unwrap();
        }
        for (i, (area, status)) in [("birthdays", "confirmed"), ("birthdays", "discarded"), ("goals", "undone"), ("goals", "pending")].into_iter().enumerate() {
            proposal::ActiveModel {
                id: Set(format!("p{i}")),
                chat_id: Set("c".into()),
                call_id: Set(format!("call{i}")),
                area: Set(area.into()),
                tool: Set("t".into()),
                arguments: Set("{}".into()),
                preview: Set("{}".into()),
                status: Set(status.into()),
                outcome: Set(None),
                created_at: Set(now),
                updated_at: Set(now),
                deleted_at: Set(None),
            }
            .insert(&db)
            .await
            .unwrap();
        }

        let today = local_day(now);
        let r = report(&db, Period::new("week", today, today).unwrap()).await.unwrap();
        assert_eq!((r.headline.now, r.asked.now), (Some(2.0), Some(2.0)), "an undone change was still made");
        let birthdays = r.areas.iter().find(|a| a.area == "birthdays").unwrap();
        assert_eq!((birthdays.confirmed, birthdays.discarded, birthdays.other), (1, 1, 0));
        let goals = r.areas.iter().find(|a| a.area == "goals").unwrap();
        assert_eq!((goals.confirmed, goals.other), (1, 1));
    }
}
