//! A week or month of learning for the Analytics view: time studied, on
//! which skills, and the chapters finished.

use std::collections::{BTreeSet, HashMap};

use sea_orm::prelude::Date;
use sea_orm::{ColumnTrait, DatabaseConnection, QueryFilter};
use serde::Serialize;

use super::entities::{session, unit};
use super::service::{sessions, skills, sources, units};
use crate::error::Result;
use crate::features::period::{Compare, Headline, Period};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningAnalytics {
    /// Minutes studied.
    pub headline: Headline,
    pub units_done: Compare,
    pub study_days: Compare,
    /// Skills studied or progressed in the period, most time first.
    pub skills: Vec<SkillTime>,
    pub days: Vec<LearningDay>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTime {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub minutes: i32,
    pub units_done: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningDay {
    pub day: Date,
    /// Minutes on each skill, in the order of `skills`.
    pub minutes: Vec<i32>,
    pub units_done: usize,
}

pub async fn report(db: &DatabaseConnection, period: Period) -> Result<LearningAnalytics> {
    let skill_of: HashMap<String, String> = sources().all(db).await?.into_iter().map(|s| (s.id, s.skill_id)).collect();
    let studied: Vec<(session::Model, &str)> = sessions()
        .filter(session::Column::Day.gte(period.trend_start()))
        .filter(session::Column::Day.lt(period.end))
        .all(db)
        .await?
        .into_iter()
        .filter_map(|s| {
            let skill = skill_of.get(&s.source_id)?.as_str();
            Some((s, skill))
        })
        .collect();
    let finished: Vec<(unit::Model, &str)> = units()
        .filter(unit::Column::DoneOn.gte(period.trend_start()))
        .filter(unit::Column::DoneOn.lt(period.end))
        .all(db)
        .await?
        .into_iter()
        .filter_map(|u| {
            let skill = skill_of.get(&u.source_id)?.as_str();
            Some((u, skill))
        })
        .collect();
    let studied_within = |from: Date, to: Date| studied.iter().filter(move |(s, _)| s.day >= from && s.day < to);
    let done_within = |from: Date, to: Date| finished.iter().filter(move |(u, _)| u.done_on.is_some_and(|d| d >= from && d < to));

    let mut time: HashMap<&str, (i32, usize)> = HashMap::new();
    for (s, skill) in studied_within(period.start, period.end) {
        time.entry(skill).or_default().0 += s.minutes;
    }
    for (_, skill) in done_within(period.start, period.end) {
        time.entry(skill).or_default().1 += 1;
    }
    let mut by_skill: Vec<SkillTime> = skills()
        .all(db)
        .await?
        .into_iter()
        .filter_map(|sk| {
            let (minutes, units_done) = *time.get(sk.id.as_str())?;
            Some(SkillTime { id: sk.id, name: sk.name, icon: sk.icon, color: sk.color, minutes, units_done })
        })
        .collect();
    by_skill.sort_by(|a, b| b.minutes.cmp(&a.minutes).then(b.units_done.cmp(&a.units_done)).then_with(|| a.name.cmp(&b.name)));

    Ok(LearningAnalytics {
        headline: period.headline(|from, to| Some(studied_within(from, to).map(|(s, _)| s.minutes as f64).sum())),
        units_done: period.compare(|from, to| Some(done_within(from, to).count() as f64)),
        study_days: period.compare(|from, to| Some(studied_within(from, to).map(|(s, _)| s.day).collect::<BTreeSet<_>>().len() as f64)),
        days: period.daily(|d| LearningDay {
            day: d,
            minutes: by_skill.iter().map(|sk| studied.iter().filter(|(s, skill)| s.day == d && *skill == sk.id).map(|(s, _)| s.minutes).sum()).collect(),
            units_done: finished.iter().filter(|(u, _)| u.done_on == Some(d)).count(),
        }),
        skills: by_skill,
    })
}
