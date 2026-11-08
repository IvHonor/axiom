//! A week or month of planning for the Analytics view: what was planned,
//! what got done, focus time and the daily rituals.

use sea_orm::prelude::Date;
use sea_orm::{ColumnTrait, DatabaseConnection, QueryFilter};
use serde::Serialize;

use super::entities::{day, task};
use super::service::{days, tasks};
use crate::error::Result;
use crate::features::period::{percent, Compare, Headline, Period};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanAnalytics {
    /// Tasks done.
    pub headline: Headline,
    pub planned: Compare,
    /// Share of planned tasks done, 0 to 100.
    pub completion: Compare,
    pub focus_minutes: Compare,
    /// Share of top priorities done, 0 to 100.
    pub priorities: Compare,
    /// Time taken against estimates, from tasks with both; None with fewer
    /// than three.
    pub pace: Option<f64>,
    pub days: Vec<PlanDay>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDay {
    pub day: Date,
    pub planned: usize,
    pub done: usize,
    pub focus_minutes: i32,
    pub priorities: usize,
    pub priorities_done: usize,
    /// The morning plan and evening shutdown were done.
    pub planned_ritual: bool,
    pub shutdown: bool,
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<PlanAnalytics> {
    let all: Vec<task::Model> = tasks()
        .filter(task::Column::Day.gte(period.trend_start()))
        .filter(task::Column::Day.lt(period.end))
        .all(db)
        .await?;
    let rituals: Vec<day::Model> = days()
        .filter(day::Column::Id.gte(period.start.to_string()))
        .filter(day::Column::Id.lt(period.end.to_string()))
        .all(db)
        .await?;
    let within = |from: Date, to: Date| all.iter().filter(move |t| t.day.is_some_and(|d| d >= from && d < to));
    let done = |from, to| Some(within(from, to).filter(|t| t.done_at.is_some()).count() as f64);

    let timed: Vec<&task::Model> = within(period.start, period.end).filter(|t| t.estimate_minutes.unwrap_or(0) > 0 && t.actual_minutes > 0).collect();
    let estimated: i64 = timed.iter().map(|t| t.estimate_minutes.unwrap_or(0) as i64).sum();
    let actual: i64 = timed.iter().map(|t| t.actual_minutes as i64).sum();

    Ok(PlanAnalytics {
        headline: period.headline(done),
        planned: period.compare(|from, to| Some(within(from, to).count() as f64)),
        completion: period.compare(|from, to| {
            let planned: Vec<_> = within(from, to).collect();
            percent(planned.iter().filter(|t| t.done_at.is_some()).count(), planned.len())
        }),
        focus_minutes: period.compare(|from, to| Some(within(from, to).map(|t| t.actual_minutes as f64).sum())),
        priorities: period.compare(|from, to| {
            let focus: Vec<_> = within(from, to).filter(|t| t.focus_rank.is_some()).collect();
            percent(focus.iter().filter(|t| t.done_at.is_some()).count(), focus.len())
        }),
        pace: (timed.len() >= 3 && estimated > 0).then(|| actual as f64 / estimated as f64),
        days: period.daily(|d| {
            let on_day: Vec<&task::Model> = all.iter().filter(|t| t.day == Some(d)).collect();
            let ritual = rituals.iter().find(|r| r.id == d.to_string());
            PlanDay {
                day: d,
                planned: on_day.len(),
                done: on_day.iter().filter(|t| t.done_at.is_some()).count(),
                focus_minutes: on_day.iter().map(|t| t.actual_minutes).sum(),
                priorities: on_day.iter().filter(|t| t.focus_rank.is_some()).count(),
                priorities_done: on_day.iter().filter(|t| t.focus_rank.is_some() && t.done_at.is_some()).count(),
                planned_ritual: ritual.is_some_and(|r| r.planned_at.is_some()),
                shutdown: ritual.is_some_and(|r| r.shutdown_at.is_some()),
            }
        }),
    })
}
