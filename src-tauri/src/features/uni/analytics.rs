//! A week or month of lectures for the Analytics view: what was on, how
//! much of it you went to and caught up on, by module, and how sure you
//! felt. A lecture belongs to the period its due day falls in (see `due`).

use std::collections::HashMap;

use sea_orm::prelude::Date;
use sea_orm::DatabaseConnection;
use serde::Serialize;

use super::entities::{lecture, module, term};
use super::service::{due, is_behind, lectures, modules, terms};
use crate::error::Result;
use crate::features::period::{percent, Compare, Headline, Period};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UniAnalytics {
    /// Of the lectures due, the share caught up on, 0 to 100.
    pub headline: Headline,
    pub due: Compare,
    /// Of the lectures due, the share gone to.
    pub attendance: Compare,
    /// Reviews done in the period (whenever the lecture was).
    pub reviewed: Compare,
    /// Behind now, across every term.
    pub behind: usize,
    pub days: Vec<UniDay>,
    pub modules: Vec<ModuleDue>,
    /// How many lectures due were rated shaky, okay and solid (1 to 3).
    pub confidence: [usize; 3],
}

/// The lectures due on a day, by where each one stands.
#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UniDay {
    pub day: Date,
    pub caught_up: usize,
    /// Gone to, not caught up on yet.
    pub attended: usize,
    pub behind: usize,
    pub upcoming: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDue {
    pub id: String,
    pub code: String,
    pub name: String,
    pub color: String,
    pub due: usize,
    pub caught_up: usize,
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<UniAnalytics> {
    let all_terms: HashMap<String, term::Model> = terms().all(db).await?.into_iter().map(|t| (t.id.clone(), t)).collect();
    let all_modules: Vec<module::Model> = modules().all(db).await?;
    let term_of: HashMap<&str, &term::Model> = all_modules.iter().filter_map(|m| Some((m.id.as_str(), all_terms.get(&m.term_id)?))).collect();
    // Each lecture with its term and due day; those of deleted modules go.
    let dated: Vec<(lecture::Model, &term::Model, Option<Date>)> = lectures()
        .all(db)
        .await?
        .into_iter()
        .filter_map(|l| {
            let t = *term_of.get(l.module_id.as_str())?;
            let d = due(&l, t);
            Some((l, t, d))
        })
        .collect();
    let today = period.today;
    let due_within = |from: Date, to: Date| dated.iter().filter(move |(_, _, d)| d.is_some_and(|d| d >= from && d < to)).map(|(l, _, _)| l);

    let mut days: Vec<UniDay> = period.daily(|day| UniDay { day, ..Default::default() });
    let mut by_module: HashMap<&str, (usize, usize)> = HashMap::new();
    let mut confidence = [0; 3];
    for (l, t, d) in &dated {
        let Some(d) = d.filter(|d| period.contains(*d)) else { continue };
        let slot = &mut days[(d - period.start).num_days() as usize];
        if l.caught_up_on.is_some() {
            slot.caught_up += 1;
        } else if l.attended_on.is_some() {
            slot.attended += 1;
        } else if is_behind(l, t, today) {
            slot.behind += 1;
        } else {
            slot.upcoming += 1;
        }
        let counts = by_module.entry(l.module_id.as_str()).or_default();
        counts.0 += 1;
        counts.1 += usize::from(l.caught_up_on.is_some());
        if let Some(c) = l.confidence.filter(|c| (1..=3).contains(c)) {
            confidence[c as usize - 1] += 1;
        }
    }
    let modules_due = all_modules
        .iter()
        .filter_map(|m| {
            let (due, caught_up) = *by_module.get(m.id.as_str())?;
            Some(ModuleDue { id: m.id.clone(), code: m.code.clone(), name: m.name.clone(), color: m.color.clone(), due, caught_up })
        })
        .collect();

    Ok(UniAnalytics {
        headline: period.headline(|from, to| {
            let list: Vec<_> = due_within(from, to).collect();
            percent(list.iter().filter(|l| l.caught_up_on.is_some()).count(), list.len())
        }),
        due: period.compare(|from, to| Some(due_within(from, to).count() as f64)),
        attendance: period.compare(|from, to| {
            let list: Vec<_> = due_within(from, to).collect();
            percent(list.iter().filter(|l| l.attended_on.is_some()).count(), list.len())
        }),
        reviewed: period.compare(|from, to| Some(dated.iter().filter(|(l, _, _)| l.reviewed_on.is_some_and(|d| d >= from && d < to)).count() as f64)),
        behind: dated.iter().filter(|(l, t, _)| is_behind(l, t, today)).count(),
        days,
        modules: modules_due,
        confidence,
    })
}
