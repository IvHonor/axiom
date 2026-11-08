//! A week or month across every project for the Analytics view: what got
//! finished, what came in, how long it took and whether it was on time.

use std::collections::HashMap;

use sea_orm::prelude::Date;
use sea_orm::DatabaseConnection;
use serde::Serialize;

use super::entities::task;
use super::service::{projects, tasks};
use crate::error::Result;
use crate::features::period::{local_day, percent, Compare, Headline, Period};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardAnalytics {
    /// Tasks completed.
    pub headline: Headline,
    pub created: Compare,
    /// Of the tasks completed that had a due date, the share done by it.
    pub on_time: Compare,
    /// Middle time from adding a task to finishing it, in days.
    pub cycle_days: Compare,
    /// Open now, and how many of those are overdue.
    pub open: usize,
    pub overdue: usize,
    pub days: Vec<BoardDay>,
    /// Completed in the period, most first; projects with none are left out.
    pub projects: Vec<ProjectDone>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardDay {
    pub day: Date,
    pub completed: usize,
    pub created: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDone {
    pub id: String,
    pub name: String,
    pub color: String,
    pub completed: usize,
}

fn median(mut values: Vec<f64>) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let mid = values.len() / 2;
    Some(if values.len() % 2 == 0 { (values[mid - 1] + values[mid]) / 2.0 } else { values[mid] })
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<BoardAnalytics> {
    let all: Vec<task::Model> = tasks().all(db).await?;
    let completed_on = |t: &task::Model| t.completed_at.map(local_day);
    let done_within = |from: Date, to: Date| all.iter().filter(move |t| completed_on(t).is_some_and(|d| d >= from && d < to));

    let mut by_project: HashMap<&str, usize> = HashMap::new();
    for t in done_within(period.start, period.end) {
        *by_project.entry(t.project_id.as_str()).or_default() += 1;
    }
    let mut done_by_project: Vec<ProjectDone> = projects()
        .all(db)
        .await?
        .into_iter()
        .filter_map(|p| {
            let completed = *by_project.get(p.id.as_str())?;
            Some(ProjectDone { id: p.id, name: p.name, color: p.color, completed })
        })
        .collect();
    done_by_project.sort_by(|a, b| b.completed.cmp(&a.completed).then_with(|| a.name.cmp(&b.name)));

    let open: Vec<&task::Model> = all.iter().filter(|t| !t.archived && t.completed_at.is_none()).collect();
    Ok(BoardAnalytics {
        headline: period.headline(|from, to| Some(done_within(from, to).count() as f64)),
        created: period.compare(|from, to| Some(all.iter().filter(|t| (from..to).contains(&local_day(t.created_at))).count() as f64)),
        on_time: period.compare(|from, to| {
            let due: Vec<_> = done_within(from, to).filter(|t| t.due_date.is_some()).collect();
            percent(due.iter().filter(|t| completed_on(t) <= t.due_date).count(), due.len())
        }),
        cycle_days: period.compare(|from, to| {
            median(done_within(from, to).filter_map(|t| t.completed_at.map(|done| (done - t.created_at).num_minutes() as f64 / 1440.0)).collect())
        }),
        open: open.len(),
        overdue: open.iter().filter(|t| t.due_date.is_some_and(|d| d < period.today)).count(),
        days: period.daily(|d| BoardDay {
            day: d,
            completed: all.iter().filter(|t| completed_on(t) == Some(d)).count(),
            created: all.iter().filter(|t| local_day(t.created_at) == d).count(),
        }),
        projects: done_by_project,
    })
}

#[cfg(test)]
mod tests {
    use super::median;

    #[test]
    fn the_middle_of_an_even_list_is_between_its_two_middles() {
        assert_eq!(median(vec![4.0, 1.0, 3.0, 2.0]), Some(2.5));
        assert_eq!(median(vec![5.0, 1.0, 3.0]), Some(3.0));
        assert_eq!(median(vec![]), None);
    }
}
