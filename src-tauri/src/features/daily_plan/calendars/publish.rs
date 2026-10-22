//! Publishing the plan: the next two weeks of blocks, as events in one
//! calendar. Axiom compares what the calendar has (its own marked events
//! only) with the plan and makes the fewest changes; it never touches
//! anything else in the calendar, or anything that started before today.

use std::collections::HashSet;

use chrono::{DateTime, Days, Duration, Utc};
use rrule::Tz;
use sea_orm::prelude::Date;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder};
use sha2::{Digest, Sha256};

use super::ics::{in_zone, midnight};
use super::remote::{PlanEvent, Published, Remote};
use crate::error::Result;
use crate::features::daily_plan::entities::{block, task};

/// How far ahead the plan is published.
pub const DAYS: u64 = 14;

/// The window published: from the start of today, for two weeks.
pub fn window(today: Date, zone: Tz) -> (DateTime<Utc>, DateTime<Utc>) {
    (midnight(today, zone).with_timezone(&Utc), midnight(today + Days::new(DAYS), zone).with_timezone(&Utc))
}

/// The plan's blocks in the window, as events. Blocks for tasks take the
/// task's name.
pub async fn plan_events(db: &DatabaseConnection, today: Date, zone: Tz) -> Result<Vec<PlanEvent>> {
    let blocks = block::Entity::find()
        .filter(block::Column::DeletedAt.is_null())
        .filter(block::Column::Day.gte(today))
        .filter(block::Column::Day.lt(today + Days::new(DAYS)))
        .order_by_asc(block::Column::Day)
        .order_by_asc(block::Column::StartMinute)
        .all(db)
        .await?;
    let task_ids: Vec<String> = blocks.iter().filter_map(|b| b.task_id.clone()).collect();
    let tasks = task::Entity::find()
        .filter(task::Column::Id.is_in(task_ids))
        .filter(task::Column::DeletedAt.is_null())
        .all(db)
        .await?;
    Ok(blocks
        .into_iter()
        .filter_map(|b| {
            let title = match &b.task_id {
                Some(id) => tasks.iter().find(|t| &t.id == id)?.title.clone(),
                None if b.title.trim().is_empty() => "Focus time".into(),
                None => b.title.clone(),
            };
            let local = b.day.and_hms_opt(0, 0, 0)? + Duration::minutes(b.start_minute as i64);
            let start = in_zone(zone, local)?.with_timezone(&Utc);
            Some(PlanEvent { block_id: b.id, title, start, end: start + Duration::minutes(b.duration_minutes as i64) })
        })
        .collect())
}

/// A fingerprint of the plan, to skip publishing when nothing changed.
pub fn fingerprint(events: &[PlanEvent]) -> String {
    let mut hash = Sha256::new();
    for e in events {
        hash.update(format!("{}|{}|{}|{}\n", e.block_id, e.title, e.start.timestamp(), e.end.timestamp()));
    }
    format!("{:x}", hash.finalize())
}

#[derive(Debug, PartialEq)]
pub enum Action<'a> {
    Create(&'a PlanEvent),
    Update(&'a Published, &'a PlanEvent),
    Delete(&'a Published),
}

/// What to change so the calendar's copy matches the plan. `remote` holds
/// only events from the window's start on.
pub fn diff<'a>(desired: &'a [PlanEvent], remote: &'a [Published]) -> Vec<Action<'a>> {
    let mut kept = HashSet::new();
    let mut actions = Vec::new();
    for existing in remote {
        match desired.iter().find(|d| d.block_id == existing.event.block_id) {
            // The first copy of a block is kept (and corrected)...
            Some(wanted) if kept.insert(existing.event.block_id.as_str()) => {
                if !same(wanted, &existing.event) {
                    actions.push(Action::Update(existing, wanted));
                }
            }
            // ...extra copies and blocks no longer planned go.
            _ => actions.push(Action::Delete(existing)),
        }
    }
    actions.extend(desired.iter().filter(|d| !kept.contains(d.block_id.as_str())).map(Action::Create));
    actions
}

fn same(a: &PlanEvent, b: &PlanEvent) -> bool {
    a.title == b.title && a.start.timestamp() / 60 == b.start.timestamp() / 60 && a.end.timestamp() / 60 == b.end.timestamp() / 60
}

/// Brings a calendar in line with `desired` (empty to clear Axiom's events
/// from it). Returns how many changes it made.
pub async fn publish(remote: &dyn Remote, calendar: &str, desired: &[PlanEvent], from: DateTime<Utc>, to: DateTime<Utc>) -> Result<usize> {
    let existing: Vec<Published> = remote.published(calendar, from, to).await?.into_iter().filter(|p| p.event.start >= from).collect();
    let actions = diff(desired, &existing);
    for action in &actions {
        match action {
            Action::Create(event) => remote.create(calendar, event).await?,
            Action::Update(old, event) => remote.update(calendar, old, event).await?,
            Action::Delete(old) => remote.delete(calendar, old).await?,
        }
    }
    Ok(actions.len())
}
