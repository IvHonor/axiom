//! A week or month of goals for the Analytics view: the check-ins and
//! milestones that moved them, what was finished, and where each active
//! goal stands against where it should be by now.

use sea_orm::prelude::Date;
use sea_orm::{ColumnTrait, DatabaseConnection, QueryFilter};
use serde::Serialize;

use super::entities::{goal, log, milestone};
use super::service::{goals, list, logs, milestones};
use super::types::Pace;
use crate::error::Result;
use crate::features::period::{Compare, Headline, Period};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalsAnalytics {
    /// Check-ins and milestones ticked.
    pub headline: Headline,
    pub check_ins: Compare,
    pub milestones: Compare,
    /// Goals marked done.
    pub completed: Compare,
    pub days: Vec<GoalsDay>,
    /// Active goals, in your order.
    pub goals: Vec<GoalStanding>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalsDay {
    pub day: Date,
    pub check_ins: usize,
    pub milestones: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalStanding {
    pub id: String,
    pub title: String,
    pub icon: String,
    /// 0 to 100.
    pub percent: f64,
    /// Where it should be by today, 0 to 100; None without a deadline.
    pub expected: Option<f64>,
    pub pace: Option<Pace>,
    pub due_date: Option<Date>,
    /// Check-ins and milestones in the period.
    pub moves: usize,
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<GoalsAnalytics> {
    let check_ins: Vec<log::Model> = logs().filter(log::Column::Day.gte(period.trend_start())).filter(log::Column::Day.lt(period.end)).all(db).await?;
    let ticked: Vec<milestone::Model> = milestones()
        .filter(milestone::Column::DoneOn.gte(period.trend_start()))
        .filter(milestone::Column::DoneOn.lt(period.end))
        .all(db)
        .await?;
    let finished: Vec<goal::Model> = goals().filter(goal::Column::CompletedOn.gte(period.trend_start())).filter(goal::Column::CompletedOn.lt(period.end)).all(db).await?;
    let logs_within = |from: Date, to: Date| check_ins.iter().filter(move |l| l.day >= from && l.day < to);
    let ticked_within = |from: Date, to: Date| ticked.iter().filter(move |m| m.done_on.is_some_and(|d| d >= from && d < to));

    let standings = list(db, period.today)
        .await?
        .into_iter()
        .filter(|g| g.goal.status == "active")
        .map(|g| {
            // As in `view`: targets run from their start value, the rest from nothing.
            let start = if matches!(g.goal.kind.as_str(), "once" | "milestones") { 0.0 } else { g.goal.start_value };
            let span = g.target - start;
            GoalStanding {
                moves: logs_within(period.start, period.end).filter(|l| l.goal_id == g.goal.id).count()
                    + ticked_within(period.start, period.end).filter(|m| m.goal_id == g.goal.id).count(),
                expected: g.expected.filter(|_| span.abs() > f64::EPSILON).map(|e| ((e - start) / span * 100.0).clamp(0.0, 100.0)),
                id: g.goal.id,
                title: g.goal.title,
                icon: g.goal.icon,
                percent: g.percent,
                pace: g.pace,
                due_date: g.goal.due_date,
            }
        })
        .collect();

    Ok(GoalsAnalytics {
        headline: period.headline(|from, to| Some((logs_within(from, to).count() + ticked_within(from, to).count()) as f64)),
        check_ins: period.compare(|from, to| Some(logs_within(from, to).count() as f64)),
        milestones: period.compare(|from, to| Some(ticked_within(from, to).count() as f64)),
        completed: period.compare(|from, to| Some(finished.iter().filter(|g| g.completed_on.is_some_and(|d| d >= from && d < to)).count() as f64)),
        days: period.daily(|d| GoalsDay {
            day: d,
            check_ins: check_ins.iter().filter(|l| l.day == d).count(),
            milestones: ticked.iter().filter(|m| m.done_on == Some(d)).count(),
        }),
        goals: standings,
    })
}
