//! The birthdays and anniversaries in a week or month, for the Analytics
//! view, and how ready the presents were for each.

use chrono::Datelike;
use sea_orm::prelude::Date;
use sea_orm::DatabaseConnection;
use serde::Serialize;

use super::entities::{gift, person};
use super::service::{gifts, in_year, people};
use crate::error::Result;
use crate::features::period::{Compare, Headline, Period};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BirthdaysAnalytics {
    /// Occasions in the period.
    pub headline: Headline,
    /// In date order.
    pub occasions: Vec<Occasion>,
    /// Of the occasions so far, how many had a present bought or given.
    pub ready: Compare,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Occasion {
    pub person_id: String,
    pub name: String,
    pub occasion: String,
    pub day: Date,
    /// The age turned, or years married, when the year is known.
    pub turning: Option<i32>,
    /// The furthest any present got: "given", "bought", "idea", or None.
    pub gift: Option<String>,
}

/// Each person's dates in [from, to), which may cross a new year.
fn occasions_within<'a>(all: &'a [person::Model], from: Date, to: Date) -> impl Iterator<Item = (&'a person::Model, Date)> + 'a {
    (from.year()..=to.year()).flat_map(move |year| {
        all.iter().map(move |p| (p, in_year(p.month, p.day, year))).filter(move |(_, d)| *d >= from && *d < to)
    })
}

/// How far the presents for one occasion got: given that year, bought, or
/// only thought of.
fn furthest(gifts: &[gift::Model], person: &str, year: i32) -> Option<String> {
    let theirs: Vec<&gift::Model> = gifts.iter().filter(|g| g.person_id == person).collect();
    if theirs.iter().any(|g| g.status == "given" && g.year == Some(year)) {
        return Some("given".into());
    }
    ["bought", "idea"].into_iter().find(|s| theirs.iter().any(|g| g.status == *s)).map(String::from)
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<BirthdaysAnalytics> {
    let everyone: Vec<person::Model> = people().all(db).await?;
    let presents: Vec<gift::Model> = gifts().all(db).await?;
    let count = |from, to| Some(occasions_within(&everyone, from, to).count() as f64);

    let mut occasions: Vec<Occasion> = occasions_within(&everyone, period.start, period.end)
        .map(|(p, day)| Occasion {
            person_id: p.id.clone(),
            name: p.name.clone(),
            occasion: p.occasion.clone(),
            day,
            turning: p.year.map(|y| day.year() - y).filter(|t| *t >= 0),
            gift: furthest(&presents, &p.id, day.year()),
        })
        .collect();
    occasions.sort_by(|a, b| a.day.cmp(&b.day).then_with(|| a.name.cmp(&b.name)));

    Ok(BirthdaysAnalytics {
        headline: period.headline(count),
        ready: period.compare(|from, to| {
            Some(occasions_within(&everyone, from, to).filter(|(p, d)| matches!(furthest(&presents, &p.id, d.year()).as_deref(), Some("given" | "bought"))).count() as f64)
        }),
        occasions,
    })
}
