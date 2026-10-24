//! The Goals logic: every query and change, independent of Tauri so it can
//! be tested on its own (see `tests.rs`).
//!
//! "Today" comes from the frontend, so it always matches what the user sees.

use chrono::{Datelike, Utc};
use sea_orm::prelude::{Date, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Select, Set, TransactionTrait};

use super::entities::{goal, log, milestone};
use super::sources::{self, FOR_MILESTONES, FOR_TARGETS, NEED_ID, Reading};
use super::types::{GoalDetail, GoalFields, GoalView, GoalsSummary, Pace, Sources};
use crate::db::new_id;
use crate::error::{Error, Result};

pub const AREAS: &[&str] = &["health", "career", "money", "learning", "relationships", "personal", "home", "fun"];
pub const KINDS: &[&str] = &["target", "milestones", "once"];
pub const STATUSES: &[&str] = &["active", "paused", "done", "dropped"];

fn goals() -> Select<goal::Entity> {
    goal::Entity::find().filter(goal::Column::DeletedAt.is_null())
}

fn logs() -> Select<log::Entity> {
    log::Entity::find().filter(log::Column::DeletedAt.is_null())
}

fn milestones() -> Select<milestone::Entity> {
    milestone::Entity::find().filter(milestone::Column::DeletedAt.is_null())
}

/// Soft-deletes the matching rows, so the deletion syncs.
macro_rules! bury {
    ($entity:ident, $db:expr, $condition:expr) => {
        $entity::Entity::update_many()
            .col_expr($entity::Column::DeletedAt, Expr::value(Some(Utc::now())))
            .col_expr($entity::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter($entity::Column::DeletedAt.is_null())
            .filter($condition)
            .exec($db)
            .await?
    };
}

async fn find(db: &impl ConnectionTrait, id: &str) -> Result<goal::Model> {
    goals().filter(goal::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Goal"))
}

async fn find_milestone(db: &impl ConnectionTrait, id: &str) -> Result<milestone::Model> {
    milestones().filter(milestone::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Milestone"))
}

// ---------- Progress ----------

/// Where a goal is, from its check-ins, milestones or source.
pub fn view(g: goal::Model, logs: &[log::Model], milestones: &[milestone::Model], reading: Option<Reading>, today: Date) -> GoalView {
    let ticked = milestones.iter().filter(|m| m.done_on.is_some()).count() as f64;
    let (start, current, target) = match g.kind.as_str() {
        "once" => (0.0, if g.status == "done" { 1.0 } else { 0.0 }, 1.0),
        "milestones" => match &reading {
            Some(r) => (0.0, r.current, r.out_of.unwrap_or(0.0)),
            None => (0.0, ticked, milestones.len() as f64),
        },
        _ => {
            let current = match (&reading, g.measure.as_str()) {
                (Some(r), _) => r.current,
                (None, "latest") => logs.iter().max_by(|a, b| a.day.cmp(&b.day).then(a.created_at.cmp(&b.created_at))).map_or(g.start_value, |l| l.value),
                (None, _) => g.start_value + logs.iter().map(|l| l.value).sum::<f64>(),
            };
            (g.start_value, current, g.target_value)
        }
    };
    let fraction = if (target - start).abs() > f64::EPSILON { ((current - start) / (target - start)).clamp(0.0, 1.0) } else { 0.0 };
    let reached = fraction >= 1.0 - 1e-9;

    let days_left = g.due_date.map(|d| (d - today).num_days() as i32);
    let mut expected = None;
    let mut pace = None;
    let mut per_week = None;
    if let (Some(due), true) = (g.due_date, g.status == "active" && g.kind != "once") {
        let span = (due - g.start_date).num_days().max(1) as f64;
        let elapsed = ((today - g.start_date).num_days() as f64).clamp(0.0, span);
        let due_now = elapsed / span;
        expected = Some(start + (target - start) * due_now);
        if !reached {
            pace = Some(if fraction >= due_now + 0.1 {
                Pace::Ahead
            } else if fraction >= due_now - 0.05 {
                Pace::OnTrack
            } else {
                Pace::Behind
            });
            let weeks = (due - today).num_days() as f64 / 7.0;
            if g.kind == "target" && weeks > 0.0 {
                per_week = Some((target - current) / weeks.max(1.0));
            }
        }
    }
    let last_progress = logs.iter().map(|l| l.day).chain(milestones.iter().filter_map(|m| m.done_on)).max();
    GoalView {
        source_name: match (&reading, g.source != "manual") {
            (Some(r), _) => Some(r.name.clone()),
            (None, true) => Some("No longer there".into()),
            (None, false) => None,
        },
        goal: g,
        current,
        target,
        percent: fraction * 100.0,
        expected,
        pace,
        per_week,
        days_left,
        reached,
        last_progress,
    }
}

async fn view_of(db: &DatabaseConnection, g: goal::Model, today: Date) -> Result<(GoalView, Vec<log::Model>, Vec<milestone::Model>)> {
    let l = logs().filter(log::Column::GoalId.eq(&g.id)).order_by_desc(log::Column::Day).order_by_desc(log::Column::CreatedAt).all(db).await?;
    let m = milestones().filter(milestone::Column::GoalId.eq(&g.id)).order_by_asc(milestone::Column::Position).order_by_asc(milestone::Column::CreatedAt).all(db).await?;
    let reading = sources::read(db, &g, today).await?;
    Ok((view(g, &l, &m, reading, today), l, m))
}

/// Every goal: active first (in your order), then paused, done (latest
/// first) and dropped.
pub async fn list(db: &DatabaseConnection, today: Date) -> Result<Vec<GoalView>> {
    let mut out = Vec::new();
    for g in goals().all(db).await? {
        out.push(view_of(db, g, today).await?.0);
    }
    let rank = |s: &str| STATUSES.iter().position(|x| *x == s).unwrap_or(0);
    out.sort_by(|a, b| {
        rank(&a.goal.status)
            .cmp(&rank(&b.goal.status))
            .then_with(|| b.goal.completed_on.cmp(&a.goal.completed_on))
            .then_with(|| a.goal.position.cmp(&b.goal.position))
            .then_with(|| a.goal.created_at.cmp(&b.goal.created_at))
    });
    Ok(out)
}

pub async fn get(db: &DatabaseConnection, id: &str, today: Date) -> Result<GoalDetail> {
    let (goal, logs, milestones) = view_of(db, find(db, id).await?, today).await?;
    Ok(GoalDetail { goal, logs, milestones })
}

pub async fn summary(db: &DatabaseConnection, today: Date) -> Result<GoalsSummary> {
    let all = list(db, today).await?;
    let active: Vec<&GoalView> = all.iter().filter(|g| g.goal.status == "active").collect();
    Ok(GoalsSummary {
        active: active.len() as u32,
        on_track: active.iter().filter(|g| matches!(g.pace, Some(Pace::OnTrack | Pace::Ahead))).count() as u32,
        behind: active.iter().filter(|g| g.pace == Some(Pace::Behind)).count() as u32,
        done_this_year: all.iter().filter(|g| g.goal.status == "done" && g.goal.completed_on.is_some_and(|d| d.year() == today.year())).count() as u32,
    })
}

pub async fn sources(db: &DatabaseConnection, today: Date) -> Result<Sources> {
    sources::options(db, today).await
}

// ---------- Goals ----------

fn clean(fields: &mut GoalFields) -> Result<String> {
    let title: String = fields.title.trim().chars().take(200).collect();
    if title.is_empty() {
        return Err(Error::Invalid("What's the goal?".into()));
    }
    if !AREAS.contains(&fields.area.as_str()) {
        return Err(Error::Invalid(format!("Pick an area: {}.", AREAS.join(", "))));
    }
    if !KINDS.contains(&fields.kind.as_str()) {
        return Err(Error::Invalid("A goal is a number to reach, milestones, or one thing to do.".into()));
    }
    if fields.source.is_empty() {
        fields.source = "manual".into();
    }
    let allowed: &[&str] = match fields.kind.as_str() {
        "target" => FOR_TARGETS,
        "milestones" => FOR_MILESTONES,
        _ => &["manual"],
    };
    if !allowed.contains(&fields.source.as_str()) {
        return Err(Error::Invalid("That can't be followed for this kind of goal.".into()));
    }
    if NEED_ID.contains(&fields.source.as_str()) {
        if fields.source_id.trim().is_empty() {
            return Err(Error::Invalid("Pick what it follows.".into()));
        }
    } else {
        fields.source_id.clear();
    }
    if fields.kind == "target" {
        if !fields.start_value.is_finite() || !fields.target_value.is_finite() {
            return Err(Error::Invalid("Use plain numbers.".into()));
        }
        if (fields.target_value - fields.start_value).abs() < f64::EPSILON {
            return Err(Error::Invalid("The target needs to differ from where you start.".into()));
        }
        if fields.measure != "latest" {
            fields.measure = "total".into();
        }
        // Following a balance, the latest reading is where you are.
        if fields.source == "finance_account" {
            fields.measure = "latest".into();
        }
    } else {
        fields.start_value = 0.0;
        fields.target_value = 0.0;
        fields.measure = "total".into();
    }
    if fields.due_date.is_some_and(|d| d <= fields.start_date) {
        return Err(Error::Invalid("The deadline comes after the start.".into()));
    }
    fields.unit = fields.unit.trim().chars().take(20).collect();
    fields.icon = fields.icon.trim().chars().take(8).collect();
    Ok(title)
}

pub async fn create(db: &DatabaseConnection, mut fields: GoalFields, today: Date) -> Result<GoalView> {
    let title = clean(&mut fields)?;
    let position = goals().all(db).await?.iter().map(|g| g.position + 1).max().unwrap_or(0);
    let now = Utc::now();
    let g = goal::ActiveModel {
        id: Set(new_id()),
        title: Set(title),
        icon: Set(fields.icon),
        area: Set(fields.area),
        kind: Set(fields.kind),
        source: Set(fields.source),
        source_id: Set(fields.source_id),
        start_value: Set(fields.start_value),
        target_value: Set(fields.target_value),
        unit: Set(fields.unit),
        measure: Set(fields.measure),
        start_date: Set(fields.start_date),
        due_date: Set(fields.due_date),
        why: Set(fields.why.trim().to_owned()),
        obstacle: Set(fields.obstacle.trim().to_owned()),
        plan: Set(fields.plan.trim().to_owned()),
        status: Set("active".into()),
        completed_on: Set(None),
        position: Set(position),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?;
    Ok(view_of(db, g, today).await?.0)
}

pub async fn update(db: &DatabaseConnection, id: &str, mut fields: GoalFields, today: Date) -> Result<GoalView> {
    let title = clean(&mut fields)?;
    let mut active: goal::ActiveModel = find(db, id).await?.into();
    active.title = Set(title);
    active.icon = Set(fields.icon);
    active.area = Set(fields.area);
    active.kind = Set(fields.kind);
    active.source = Set(fields.source);
    active.source_id = Set(fields.source_id);
    active.start_value = Set(fields.start_value);
    active.target_value = Set(fields.target_value);
    active.unit = Set(fields.unit);
    active.measure = Set(fields.measure);
    active.start_date = Set(fields.start_date);
    active.due_date = Set(fields.due_date);
    active.why = Set(fields.why.trim().to_owned());
    active.obstacle = Set(fields.obstacle.trim().to_owned());
    active.plan = Set(fields.plan.trim().to_owned());
    let g = active.update(db).await?;
    Ok(view_of(db, g, today).await?.0)
}

/// Done records the day; going back to active clears it.
pub async fn set_status(db: &DatabaseConnection, id: &str, status: &str, today: Date) -> Result<GoalView> {
    if !STATUSES.contains(&status) {
        return Err(Error::Invalid(format!("Unknown status: {status}")));
    }
    let g = find(db, id).await?;
    let completed = match status {
        "done" => g.completed_on.or(Some(today)),
        _ => None,
    };
    let mut active: goal::ActiveModel = g.into();
    active.status = Set(status.into());
    active.completed_on = Set(completed);
    let g = active.update(db).await?;
    Ok(view_of(db, g, today).await?.0)
}

/// Puts a goal before another (or last, with None), among the active ones.
pub async fn move_goal(db: &DatabaseConnection, id: &str, before: Option<&str>) -> Result<()> {
    let mut order: Vec<goal::Model> = goals().order_by_asc(goal::Column::Position).order_by_asc(goal::Column::CreatedAt).all(db).await?;
    let at = order.iter().position(|g| g.id == id).ok_or(Error::NotFound("Goal"))?;
    let moving = order.remove(at);
    let to = before.and_then(|b| order.iter().position(|g| g.id == b)).unwrap_or(order.len());
    order.insert(to, moving);
    let txn = db.begin().await?;
    for (i, g) in order.into_iter().enumerate() {
        if g.position != i as i32 {
            let mut active: goal::ActiveModel = g.into();
            active.position = Set(i as i32);
            active.update(&txn).await?;
        }
    }
    txn.commit().await?;
    Ok(())
}

pub async fn delete(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    bury!(log, &txn, log::Column::GoalId.eq(id));
    bury!(milestone, &txn, milestone::Column::GoalId.eq(id));
    bury!(goal, &txn, goal::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Check-ins ----------

/// A check-in on a manual target: an amount done (for totals) or where you
/// are now (for latest).
pub async fn add_log(db: &DatabaseConnection, goal_id: &str, day: Date, value: f64, note: &str, today: Date) -> Result<GoalView> {
    let g = find(db, goal_id).await?;
    if g.kind != "target" || g.source != "manual" {
        return Err(Error::Invalid("This goal keeps track by itself.".into()));
    }
    if !value.is_finite() {
        return Err(Error::Invalid("Use a plain number.".into()));
    }
    if day > today {
        return Err(Error::Invalid("Check in for today or a day gone by.".into()));
    }
    let now = Utc::now();
    log::ActiveModel {
        id: Set(new_id()),
        goal_id: Set(goal_id.into()),
        day: Set(day),
        value: Set(value),
        note: Set(note.trim().chars().take(500).collect()),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?;
    Ok(view_of(db, g, today).await?.0)
}

pub async fn delete_log(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(log, db, log::Column::Id.eq(id));
    Ok(())
}

// ---------- Milestones ----------

fn milestone_title(title: &str) -> Result<String> {
    let title: String = title.trim().chars().take(200).collect();
    if title.is_empty() {
        return Err(Error::Invalid("Name the milestone.".into()));
    }
    Ok(title)
}

pub async fn add_milestone(db: &DatabaseConnection, goal_id: &str, title: &str, due_date: Option<Date>) -> Result<milestone::Model> {
    let g = find(db, goal_id).await?;
    if g.kind != "milestones" || g.source != "manual" {
        return Err(Error::Invalid("Milestones are for goals made of steps you list.".into()));
    }
    let position = milestones().filter(milestone::Column::GoalId.eq(goal_id)).all(db).await?.iter().map(|m| m.position + 1).max().unwrap_or(0);
    let now = Utc::now();
    Ok(milestone::ActiveModel {
        id: Set(new_id()),
        goal_id: Set(goal_id.into()),
        title: Set(milestone_title(title)?),
        due_date: Set(due_date),
        done_on: Set(None),
        position: Set(position),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn update_milestone(db: &DatabaseConnection, id: &str, title: &str, due_date: Option<Date>) -> Result<milestone::Model> {
    let mut active: milestone::ActiveModel = find_milestone(db, id).await?.into();
    active.title = Set(milestone_title(title)?);
    active.due_date = Set(due_date);
    Ok(active.update(db).await?)
}

pub async fn tick_milestone(db: &DatabaseConnection, id: &str, done: bool, today: Date) -> Result<milestone::Model> {
    let m = find_milestone(db, id).await?;
    let done_on = if done { m.done_on.or(Some(today)) } else { None };
    let mut active: milestone::ActiveModel = m.into();
    active.done_on = Set(done_on);
    Ok(active.update(db).await?)
}

pub async fn delete_milestone(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(milestone, db, milestone::Column::Id.eq(id));
    Ok(())
}

// ---------- Written out ----------

/// The area's emoji, when the goal has none of its own.
pub fn icon_of(g: &goal::Model) -> String {
    if !g.icon.is_empty() {
        return g.icon.clone();
    }
    match g.area.as_str() {
        "health" => "💪",
        "career" => "💼",
        "money" => "💰",
        "learning" => "📚",
        "relationships" => "❤️",
        "home" => "🏡",
        "fun" => "🎉",
        _ => "🎯",
    }
    .into()
}

/// "£2,300", "12.5 km", "1,200": currency signs and codes go in front.
pub fn amount(value: f64, unit: &str) -> String {
    let rounded = (value * 100.0).round() / 100.0;
    let whole = rounded.trunc().abs() as i64;
    let mut digits = whole.to_string();
    let mut grouped = String::new();
    while digits.len() > 3 {
        let rest = digits.split_off(digits.len() - 3);
        grouped = format!(",{rest}{grouped}");
    }
    let fraction = (rounded.fract().abs() * 100.0).round() as i64;
    let decimals = if fraction > 0 { format!(".{fraction:02}").trim_end_matches('0').to_owned() } else { String::new() };
    let number = format!("{digits}{grouped}{decimals}");
    let minus = if rounded < 0.0 { "-" } else { "" };
    let sign = match unit.trim() {
        "GBP" => "£",
        "USD" => "$",
        "EUR" => "€",
        u => u,
    };
    match sign {
        "" => format!("{minus}{number}"),
        "£" | "$" | "€" | "¥" | "₹" => format!("{minus}{sign}{number}"),
        _ => format!("{minus}{number} {sign}"),
    }
}

/// Where a goal's got to: "£2,300 of £5,000", "3 of 5 milestones".
pub fn progress_text(g: &GoalView) -> String {
    match g.goal.kind.as_str() {
        "once" => if g.goal.status == "done" { "Done".into() } else { "To do".into() },
        "milestones" => {
            let what = match g.goal.source.as_str() {
                "project" => "cards",
                "uni_module" => "lectures",
                _ => "milestones",
            };
            format!("{} of {} {what}", g.current as i64, g.target as i64)
        }
        _ => format!("{} of {}", amount(g.current, &g.goal.unit), amount(g.target, &g.goal.unit)),
    }
}
