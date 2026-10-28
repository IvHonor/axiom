//! University's logic: every query and change, independent of Tauri so it can
//! be tested on its own (see `tests.rs`).
//!
//! "Today" comes from the frontend, so it always matches what the user sees.

use std::collections::HashMap;

use chrono::{Datelike, Days, Utc};
use sea_orm::prelude::{Date, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Select, Set, TransactionTrait};

use super::entities::{lecture, module, term};
use super::types::{LectureFields, LectureHit, ModuleCard, ModuleDetail, ModuleFields, Schedule, TermCard, TermFields, UniSummary};
use crate::db::new_id;
use crate::error::{Error, Result};

pub const KINDS: &[&str] = &["lecture", "seminar", "lab", "tutorial"];
pub const COLORS: &[&str] = &["blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "slate"];
pub const STAGES: &[&str] = &["attended", "caught_up", "reviewed"];
const MAX_WEEKS: i32 = 52;
/// How far ahead "coming up" looks.
const UPCOMING_DAYS: i64 = 7;

fn terms() -> Select<term::Entity> {
    term::Entity::find().filter(term::Column::DeletedAt.is_null())
}

fn modules() -> Select<module::Entity> {
    module::Entity::find().filter(module::Column::DeletedAt.is_null())
}

fn lectures() -> Select<lecture::Entity> {
    lecture::Entity::find().filter(lecture::Column::DeletedAt.is_null())
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

async fn find_term(db: &impl ConnectionTrait, id: &str) -> Result<term::Model> {
    terms().filter(term::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Term"))
}

async fn find_module(db: &impl ConnectionTrait, id: &str) -> Result<module::Model> {
    modules().filter(module::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Module"))
}

async fn find_lecture(db: &impl ConnectionTrait, id: &str) -> Result<lecture::Model> {
    lectures().filter(lecture::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Lecture"))
}

fn clean(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_owned()).filter(|t| !t.is_empty())
}

// ---------- Weeks ----------

/// The Monday of week 1.
fn week_one(t: &term::Model) -> Date {
    t.starts_on - Days::new(t.starts_on.weekday().num_days_from_monday() as u64)
}

pub fn ends_on(t: &term::Model) -> Date {
    week_one(t) + Days::new((t.weeks.max(1) * 7 - 1) as u64)
}

/// The teaching week a day is in, if it's within the term.
pub fn week_of(t: &term::Model, day: Date) -> Option<i32> {
    let days = (day - week_one(t)).num_days();
    let week = days.div_euclid(7) as i32 + 1;
    (days >= 0 && week <= t.weeks).then_some(week)
}

/// A weekday (0 is Monday) of a teaching week.
fn day_in_week(t: &term::Model, week: i32, weekday: u32) -> Date {
    week_one(t) + Days::new(((week - 1).max(0) * 7) as u64 + weekday as u64)
}

fn term_card(t: term::Model, today: Date) -> TermCard {
    TermCard { ends_on: ends_on(&t), week: week_of(&t, today), term: t }
}

/// When a lecture should be done by: its day, or failing that the Sunday of
/// its week. None when neither is known.
fn due(l: &lecture::Model, t: &term::Model) -> Option<Date> {
    l.day.or_else(|| l.week.map(|w| day_in_week(t, w, 6)))
}

/// Been and gone without being caught up on.
fn is_behind(l: &lecture::Model, t: &term::Model, today: Date) -> bool {
    l.caught_up_on.is_none() && due(l, t).is_some_and(|d| d < today)
}

/// Teaching order: by week and day, then as added.
fn teaching_order(a: &lecture::Model, b: &lecture::Model) -> std::cmp::Ordering {
    let week = |l: &lecture::Model| l.week.unwrap_or(i32::MAX);
    week(a).cmp(&week(b)).then_with(|| a.day.unwrap_or(Date::MAX).cmp(&b.day.unwrap_or(Date::MAX))).then(a.position.total_cmp(&b.position))
}

/// The term on today; else the latest to have started; else the soonest.
fn current_term(all: &[term::Model], today: Date) -> Option<&term::Model> {
    all.iter()
        .find(|t| week_of(t, today).is_some())
        .or_else(|| all.iter().filter(|t| week_one(t) <= today).max_by_key(|t| t.starts_on))
        .or_else(|| all.iter().min_by_key(|t| t.starts_on))
}

// ---------- Cards ----------

fn module_card(m: module::Model, list: &[&lecture::Model], t: &term::Model, today: Date) -> ModuleCard {
    let count = |f: &dyn Fn(&lecture::Model) -> bool| list.iter().filter(|l| f(l)).count() as u32;
    let caught_up = count(&|l| l.caught_up_on.is_some());
    let total = list.len() as u32;
    let next = list
        .iter()
        .filter(|l| l.day.is_some_and(|d| d >= today))
        .min_by(|a, b| a.day.cmp(&b.day).then(a.position.total_cmp(&b.position)))
        .map(|l| (*l).clone());
    ModuleCard {
        lectures: total,
        attended: count(&|l| l.attended_on.is_some()),
        caught_up,
        reviewed: count(&|l| l.reviewed_on.is_some()),
        behind: count(&|l| is_behind(l, t, today)),
        shaky: count(&|l| l.confidence == Some(1)),
        percent: (total > 0).then(|| caught_up as f64 / total as f64 * 100.0),
        next,
        module: m,
    }
}

async fn module_cards(db: &impl ConnectionTrait, t: &term::Model, today: Date) -> Result<(Vec<ModuleCard>, Vec<lecture::Model>)> {
    let list = modules().filter(module::Column::TermId.eq(t.id.as_str())).order_by_asc(module::Column::Position).all(db).await?;
    let ids: Vec<String> = list.iter().map(|m| m.id.clone()).collect();
    let all = lectures().filter(lecture::Column::ModuleId.is_in(ids)).all(db).await?;
    let mut by_module: HashMap<&str, Vec<&lecture::Model>> = HashMap::new();
    for l in &all {
        by_module.entry(l.module_id.as_str()).or_default().push(l);
    }
    let cards = list
        .into_iter()
        .map(|m| {
            let mine = by_module.remove(m.id.as_str()).unwrap_or_default();
            module_card(m, &mine, t, today)
        })
        .collect();
    Ok((cards, all))
}

fn hit(l: lecture::Model, m: &module::Model, days: i64) -> LectureHit {
    LectureHit { lecture: l, module_code: m.code.clone(), module_name: m.name.clone(), module_color: m.color.clone(), days }
}

pub async fn summary(db: &DatabaseConnection, today: Date) -> Result<UniSummary> {
    let all = terms().order_by_asc(term::Column::StartsOn).all(db).await?;
    let Some(current) = current_term(&all, today).cloned() else {
        return Ok(UniSummary { terms: vec![], current: None, modules: vec![], behind: vec![], upcoming: vec![] });
    };
    let (cards, lectures) = module_cards(db, &current, today).await?;
    let by_id: HashMap<&str, &module::Model> = cards.iter().map(|c| (c.module.id.as_str(), &c.module)).collect();
    let mut behind = Vec::new();
    let mut upcoming = Vec::new();
    for l in lectures {
        let Some(m) = by_id.get(l.module_id.as_str()) else { continue };
        if is_behind(&l, &current, today) {
            let days = (today - due(&l, &current).unwrap_or(today)).num_days();
            behind.push(hit(l, m, days));
        } else if let Some(day) = l.day.filter(|d| *d >= today && l.caught_up_on.is_none()) {
            let days = (day - today).num_days();
            if days < UPCOMING_DAYS {
                upcoming.push(hit(l, m, days));
            }
        }
    }
    behind.sort_by(|a, b| b.days.cmp(&a.days).then_with(|| teaching_order(&a.lecture, &b.lecture)));
    upcoming.sort_by(|a, b| a.days.cmp(&b.days).then_with(|| teaching_order(&a.lecture, &b.lecture)));
    Ok(UniSummary {
        current: Some(current.id.clone()),
        terms: all.into_iter().map(|t| term_card(t, today)).collect(),
        modules: cards,
        behind,
        upcoming,
    })
}

/// A term's modules, for when you look at a term other than the current one.
pub async fn list_modules(db: &DatabaseConnection, term_id: &str, today: Date) -> Result<Vec<ModuleCard>> {
    let t = find_term(db, term_id).await?;
    Ok(module_cards(db, &t, today).await?.0)
}

pub async fn get_module(db: &DatabaseConnection, id: &str, today: Date) -> Result<ModuleDetail> {
    let m = find_module(db, id).await?;
    let t = find_term(db, &m.term_id).await?;
    let mut list = lectures().filter(lecture::Column::ModuleId.eq(id)).all(db).await?;
    list.sort_by(teaching_order);
    let card = module_card(m, &list.iter().collect::<Vec<_>>(), &t, today);
    Ok(ModuleDetail { card, term: term_card(t, today), lectures: list })
}

// ---------- Terms ----------

fn check_term(fields: &TermFields) -> Result<String> {
    let name = fields.name.trim().to_owned();
    if name.is_empty() {
        return Err(Error::Invalid("Give the term a name.".into()));
    }
    if !(1..=MAX_WEEKS).contains(&fields.weeks) {
        return Err(Error::Invalid(format!("A term has between 1 and {MAX_WEEKS} weeks.")));
    }
    Ok(name)
}

pub async fn add_term(db: &DatabaseConnection, fields: TermFields, today: Date) -> Result<TermCard> {
    let name = check_term(&fields)?;
    let now = Utc::now();
    let added = term::ActiveModel {
        id: Set(new_id()),
        name: Set(name),
        starts_on: Set(fields.starts_on),
        weeks: Set(fields.weeks),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?;
    Ok(term_card(added, today))
}

/// Changes a term. Lectures with a date move to the week it now falls in.
pub async fn update_term(db: &DatabaseConnection, id: &str, fields: TermFields, today: Date) -> Result<TermCard> {
    let name = check_term(&fields)?;
    let t = find_term(db, id).await?;
    let txn = db.begin().await?;
    let mut active: term::ActiveModel = t.into();
    active.name = Set(name);
    active.starts_on = Set(fields.starts_on);
    active.weeks = Set(fields.weeks);
    let updated = active.update(&txn).await?;
    let ids: Vec<String> = modules().filter(module::Column::TermId.eq(id)).all(&txn).await?.into_iter().map(|m| m.id).collect();
    for l in lectures().filter(lecture::Column::ModuleId.is_in(ids)).filter(lecture::Column::Day.is_not_null()).all(&txn).await? {
        let week = l.day.and_then(|d| week_of(&updated, d));
        if week != l.week {
            let mut active: lecture::ActiveModel = l.into();
            active.week = Set(week);
            active.update(&txn).await?;
        }
    }
    txn.commit().await?;
    Ok(term_card(updated, today))
}

/// Deletes a term with its modules and their lectures.
pub async fn delete_term(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    let ids: Vec<String> = modules().filter(module::Column::TermId.eq(id)).all(&txn).await?.into_iter().map(|m| m.id).collect();
    bury!(lecture, &txn, lecture::Column::ModuleId.is_in(ids));
    bury!(module, &txn, module::Column::TermId.eq(id));
    bury!(term, &txn, term::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Modules ----------

pub(crate) fn check_module(fields: &ModuleFields) -> Result<()> {
    if fields.name.trim().is_empty() {
        return Err(Error::Invalid("Give the module a name.".into()));
    }
    if !COLORS.contains(&fields.color.as_str()) {
        return Err(Error::Invalid(format!("Unknown colour: {}", fields.color)));
    }
    if fields.credits.is_some_and(|c| !(0..=1000).contains(&c)) {
        return Err(Error::Invalid("Credits have to be between 0 and 1000.".into()));
    }
    Ok(())
}

pub async fn add_module(db: &DatabaseConnection, fields: ModuleFields, today: Date) -> Result<ModuleCard> {
    check_module(&fields)?;
    let t = find_term(db, &fields.term_id).await?;
    let last = modules().filter(module::Column::TermId.eq(t.id.as_str())).order_by_desc(module::Column::Position).one(db).await?;
    let now = Utc::now();
    let added = module::ActiveModel {
        id: Set(new_id()),
        term_id: Set(t.id.clone()),
        code: Set(fields.code.trim().to_owned()),
        name: Set(fields.name.trim().to_owned()),
        color: Set(fields.color),
        credits: Set(fields.credits),
        link: Set(clean(fields.link)),
        position: Set(last.map_or(1.0, |m| m.position + 1.0)),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?;
    Ok(module_card(added, &[], &t, today))
}

/// Changes a module. Moving it to another term keeps its lectures' weeks but
/// not their dates, which belonged to the old term.
pub async fn update_module(db: &DatabaseConnection, id: &str, fields: ModuleFields, today: Date) -> Result<ModuleCard> {
    check_module(&fields)?;
    let m = find_module(db, id).await?;
    let t = find_term(db, &fields.term_id).await?;
    let moved = m.term_id != t.id;
    let txn = db.begin().await?;
    let mut active: module::ActiveModel = m.into();
    active.term_id = Set(t.id.clone());
    active.code = Set(fields.code.trim().to_owned());
    active.name = Set(fields.name.trim().to_owned());
    active.color = Set(fields.color);
    active.credits = Set(fields.credits);
    active.link = Set(clean(fields.link));
    let updated = active.update(&txn).await?;
    if moved {
        lecture::Entity::update_many()
            .col_expr(lecture::Column::Day, Expr::value(Option::<Date>::None))
            .col_expr(lecture::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter(lecture::Column::DeletedAt.is_null())
            .filter(lecture::Column::ModuleId.eq(id))
            .exec(&txn)
            .await?;
    }
    let list = lectures().filter(lecture::Column::ModuleId.eq(id)).all(&txn).await?;
    txn.commit().await?;
    Ok(module_card(updated, &list.iter().collect::<Vec<_>>(), &t, today))
}

pub async fn delete_module(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    bury!(lecture, &txn, lecture::Column::ModuleId.eq(id));
    bury!(module, &txn, module::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Lectures ----------

pub(crate) fn check_kind(kind: &str) -> Result<()> {
    if KINDS.contains(&kind) { Ok(()) } else { Err(Error::Invalid(format!("Unknown kind: {kind}"))) }
}

/// The week to store: the one given, or the one the day falls in.
fn week_for(t: &term::Model, week: Option<i32>, day: Option<Date>) -> Result<Option<i32>> {
    if week.is_some_and(|w| !(1..=t.weeks).contains(&w)) {
        return Err(Error::Invalid(format!("{} has weeks 1 to {}.", t.name, t.weeks)));
    }
    Ok(day.and_then(|d| week_of(t, d)).or(week))
}

pub(crate) fn check_lecture(fields: &LectureFields) -> Result<String> {
    let title = fields.title.trim().to_owned();
    if title.is_empty() {
        return Err(Error::Invalid("Give it a title.".into()));
    }
    check_kind(&fields.kind)?;
    if fields.confidence.is_some_and(|c| !(1..=3).contains(&c)) {
        return Err(Error::Invalid("Confidence is shaky, okay or solid.".into()));
    }
    Ok(title)
}

async fn next_lecture_position(db: &impl ConnectionTrait, module_id: &str) -> Result<f64> {
    let last = lectures().filter(lecture::Column::ModuleId.eq(module_id)).order_by_desc(lecture::Column::Position).one(db).await?;
    Ok(last.map_or(1.0, |l| l.position + 1.0))
}

pub async fn add_lecture(db: &DatabaseConnection, module_id: &str, fields: LectureFields) -> Result<lecture::Model> {
    let title = check_lecture(&fields)?;
    let m = find_module(db, module_id).await?;
    let t = find_term(db, &m.term_id).await?;
    let now = Utc::now();
    Ok(lecture::ActiveModel {
        id: Set(new_id()),
        module_id: Set(m.id),
        title: Set(title),
        kind: Set(fields.kind),
        week: Set(week_for(&t, fields.week, fields.day)?),
        day: Set(fields.day),
        topics: Set(fields.topics.trim().to_owned()),
        recorded: Set(fields.recorded),
        attended_on: Set(None),
        caught_up_on: Set(None),
        reviewed_on: Set(None),
        confidence: Set(fields.confidence),
        notes: Set(fields.notes),
        position: Set(next_lecture_position(db, module_id).await?),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

/// Adds a lecture on each of the schedule's weekdays, every week in its
/// range. Numbering carries on from the module's lectures of that kind.
pub async fn add_schedule(db: &DatabaseConnection, module_id: &str, schedule: Schedule) -> Result<Vec<lecture::Model>> {
    check_kind(&schedule.kind)?;
    let m = find_module(db, module_id).await?;
    let t = find_term(db, &m.term_id).await?;
    if schedule.weekdays.is_empty() || schedule.weekdays.iter().any(|d| *d > 6) {
        return Err(Error::Invalid("Pick the days it's on.".into()));
    }
    if schedule.from_week < 1 || schedule.to_week > t.weeks || schedule.from_week > schedule.to_week {
        return Err(Error::Invalid(format!("Pick weeks between 1 and {}.", t.weeks)));
    }
    let title = match schedule.title.trim() {
        "" => KINDS.iter().find(|k| **k == schedule.kind).map_or("Lecture".to_owned(), |k| capitalise(k)),
        given => given.to_owned(),
    };
    let mut weekdays = schedule.weekdays.clone();
    weekdays.sort_unstable();
    weekdays.dedup();

    let txn = db.begin().await?;
    let mut number = lectures()
        .filter(lecture::Column::ModuleId.eq(module_id))
        .filter(lecture::Column::Kind.eq(schedule.kind.as_str()))
        .all(&txn)
        .await?
        .len();
    let mut position = next_lecture_position(&txn, module_id).await?;
    let mut added = Vec::new();
    for week in (schedule.from_week..=schedule.to_week).filter(|w| !schedule.skip_weeks.contains(w)) {
        for weekday in &weekdays {
            number += 1;
            let now = Utc::now();
            added.push(
                lecture::ActiveModel {
                    id: Set(new_id()),
                    module_id: Set(m.id.clone()),
                    title: Set(format!("{title} {number}")),
                    kind: Set(schedule.kind.clone()),
                    week: Set(Some(week)),
                    day: Set(Some(day_in_week(&t, week, *weekday))),
                    topics: Set(String::new()),
                    recorded: Set(schedule.recorded),
                    attended_on: Set(None),
                    caught_up_on: Set(None),
                    reviewed_on: Set(None),
                    confidence: Set(None),
                    notes: Set(String::new()),
                    position: Set(position),
                    created_at: Set(now),
                    updated_at: Set(now),
                    deleted_at: Set(None),
                }
                .insert(&txn)
                .await?,
            );
            position += 1.0;
        }
    }
    txn.commit().await?;
    Ok(added)
}

fn capitalise(word: &str) -> String {
    let mut chars = word.chars();
    chars.next().map_or(String::new(), |c| c.to_uppercase().chain(chars).collect())
}

pub async fn update_lecture(db: &DatabaseConnection, id: &str, fields: LectureFields) -> Result<lecture::Model> {
    let title = check_lecture(&fields)?;
    let l = find_lecture(db, id).await?;
    let m = find_module(db, &l.module_id).await?;
    let t = find_term(db, &m.term_id).await?;
    let mut active: lecture::ActiveModel = l.into();
    active.title = Set(title);
    active.kind = Set(fields.kind);
    active.week = Set(week_for(&t, fields.week, fields.day)?);
    active.day = Set(fields.day);
    active.topics = Set(fields.topics.trim().to_owned());
    active.recorded = Set(fields.recorded);
    active.confidence = Set(fields.confidence);
    active.notes = Set(fields.notes);
    Ok(active.update(db).await?)
}

/// Ticks a stage on or off. Reviewing something means you've caught up on
/// it, so that's ticked too; un-ticking caught up un-ticks reviewed.
pub async fn set_stage(db: &DatabaseConnection, id: &str, stage: &str, done: bool, today: Date) -> Result<lecture::Model> {
    if !STAGES.contains(&stage) {
        return Err(Error::Invalid(format!("Unknown stage: {stage}")));
    }
    let l = find_lecture(db, id).await?;
    let on = done.then_some(today);
    let caught_up = l.caught_up_on;
    let mut active: lecture::ActiveModel = l.into();
    match stage {
        "attended" => active.attended_on = Set(on),
        "caught_up" => {
            active.caught_up_on = Set(on);
            if !done {
                active.reviewed_on = Set(None);
            }
        }
        _ => {
            active.reviewed_on = Set(on);
            if done && caught_up.is_none() {
                active.caught_up_on = Set(on);
            }
        }
    }
    Ok(active.update(db).await?)
}

pub async fn delete_lecture(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(lecture, db, lecture::Column::Id.eq(id));
    Ok(())
}
