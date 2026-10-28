//! Learning's logic: every query and change, independent of Tauri so it can
//! be tested on its own (see `tests.rs`).
//!
//! "Today" comes from the frontend, so it always matches what the user sees.

use std::collections::{BTreeSet, HashMap};

use chrono::{Days, Utc};
use sea_orm::prelude::{Date, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Select, Set, TransactionTrait};

use super::entities::{session, skill, source, unit};
use super::types::{
    Day, Draft, LearningSummary, SessionFields, SessionHit, SkillCard, SkillFields, SourceCard, SourceDetail, SourceFields, Tally, UnitFields, UnitHit,
};
use crate::db::new_id;
use crate::error::{Error, Result};

pub const KINDS: &[&str] = &["book", "course", "video", "other"];
pub const COLORS: &[&str] = &["blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "slate"];
/// Days until each review: a few days, a week, a month.
pub const REVIEW_DAYS: [u64; 3] = [3, 7, 30];
/// How far back pace is measured, for when a source will be done.
const PACE_DAYS: u64 = 28;
/// Days of history in the summary.
const HISTORY_DAYS: u64 = 14;
const MAX_UNITS_PER_SOURCE: usize = 3000;
const MAX_TITLE: usize = 300;

fn skills() -> Select<skill::Entity> {
    skill::Entity::find().filter(skill::Column::DeletedAt.is_null())
}

fn sources() -> Select<source::Entity> {
    source::Entity::find().filter(source::Column::DeletedAt.is_null())
}

fn units() -> Select<unit::Entity> {
    unit::Entity::find().filter(unit::Column::DeletedAt.is_null())
}

fn sessions() -> Select<session::Entity> {
    session::Entity::find().filter(session::Column::DeletedAt.is_null())
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

async fn find_skill(db: &impl ConnectionTrait, id: &str) -> Result<skill::Model> {
    skills().filter(skill::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Skill"))
}

async fn find_source(db: &impl ConnectionTrait, id: &str) -> Result<source::Model> {
    sources().filter(source::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Source"))
}

async fn find_unit(db: &impl ConnectionTrait, id: &str) -> Result<unit::Model> {
    units().filter(unit::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Unit"))
}

fn clean(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_owned()).filter(|t| !t.is_empty())
}

fn title(text: &str) -> String {
    text.trim().chars().take(MAX_TITLE).collect()
}

/// What units are called when nothing's chosen.
fn default_unit_name(kind: &str) -> &'static str {
    match kind {
        "book" => "chapter",
        "course" => "lecture",
        "video" => "video",
        _ => "part",
    }
}

// ---------- Progress ----------

/// Which units are headings: those with deeper units right after them.
fn headings(list: &[unit::Model]) -> Vec<bool> {
    list.iter().enumerate().map(|(i, u)| list.get(i + 1).is_some_and(|next| next.level > u.level)).collect()
}

fn by_position(a: &unit::Model, b: &unit::Model) -> std::cmp::Ordering {
    a.position.total_cmp(&b.position)
}

fn week_ago(today: Date) -> Date {
    today - Days::new(6)
}

fn tally(list: &[unit::Model], spent: &[&session::Model], today: Date) -> Tally {
    let heading = headings(list);
    let counted = || list.iter().zip(&heading).filter(|(_, h)| !**h).map(|(u, _)| u);
    let total = counted().count() as u32;
    let done = counted().filter(|u| u.done_on.is_some()).count() as u32;
    Tally {
        done,
        total,
        percent: (total > 0).then(|| f64::from(done) / f64::from(total) * 100.0),
        reviews: list.iter().filter(|u| u.review_on.is_some_and(|d| d <= today)).count() as u32,
        week_minutes: spent.iter().filter(|s| s.day >= week_ago(today) && s.day <= today).map(|s| s.minutes).sum(),
        total_minutes: spent.iter().map(|s| s.minutes).sum(),
    }
}

fn source_card(s: source::Model, list: &[unit::Model], spent: &[&session::Model], today: Date) -> SourceCard {
    let t = tally(list, spent, today);
    let heading = headings(list);
    let next = list.iter().zip(&heading).find(|(u, h)| !**h && u.done_on.is_none()).map(|(u, _)| u.title.clone());
    let last_studied = spent.iter().map(|s| s.day).chain(list.iter().filter_map(|u| u.done_on)).max();
    let remaining = t.total - t.done;
    let since = today - Days::new(PACE_DAYS - 1);
    let recent = list.iter().filter(|u| u.done_on.is_some_and(|d| d >= since)).count() as f64;
    let expected = (remaining > 0 && recent > 0.0).then(|| today + Days::new((f64::from(remaining) / (recent / PACE_DAYS as f64)).ceil() as u64));
    let needed_per_week = s.finish_by.filter(|_| remaining > 0).map(|by| {
        let weeks = ((by - today).num_days().max(1)) as f64 / 7.0;
        f64::from(remaining) / weeks
    });
    SourceCard { source: s, tally: t, next, last_studied, expected, needed_per_week }
}

/// Adds up a skill's sources.
fn skill_tally(cards: &[SourceCard]) -> Tally {
    let mut t = Tally::default();
    for c in cards {
        t.done += c.tally.done;
        t.total += c.tally.total;
        t.reviews += c.tally.reviews;
        t.week_minutes += c.tally.week_minutes;
        t.total_minutes += c.tally.total_minutes;
    }
    t.percent = (t.total > 0).then(|| f64::from(t.done) / f64::from(t.total) * 100.0);
    t
}

/// Everything, read in four queries.
struct All {
    skills: Vec<skill::Model>,
    sources: Vec<source::Model>,
    units: HashMap<String, Vec<unit::Model>>,
    sessions: Vec<session::Model>,
}

async fn everything(db: &impl ConnectionTrait) -> Result<All> {
    let skills = skills().order_by_asc(skill::Column::Position).all(db).await?;
    let sources = sources().order_by_asc(source::Column::Position).all(db).await?;
    let mut by_source: HashMap<String, Vec<unit::Model>> = HashMap::new();
    for u in units().all(db).await? {
        by_source.entry(u.source_id.clone()).or_default().push(u);
    }
    for list in by_source.values_mut() {
        list.sort_by(by_position);
    }
    let sessions = sessions().all(db).await?;
    Ok(All { skills, sources, units: by_source, sessions })
}

impl All {
    fn units_of(&self, source_id: &str) -> &[unit::Model] {
        self.units.get(source_id).map(Vec::as_slice).unwrap_or_default()
    }

    fn sessions_of(&self, source_id: &str) -> Vec<&session::Model> {
        self.sessions.iter().filter(|s| s.source_id == source_id).collect()
    }

    fn card(&self, s: &source::Model, today: Date) -> SourceCard {
        source_card(s.clone(), self.units_of(&s.id), &self.sessions_of(&s.id), today)
    }
}

/// Days with some study: a session logged or a unit done.
fn study_days(all: &All, today: Date) -> BTreeSet<Date> {
    all.sessions.iter().filter(|s| s.minutes > 0).map(|s| s.day).chain(all.units.values().flatten().filter_map(|u| u.done_on)).filter(|d| *d <= today).collect()
}

/// Days in a row with some study, ending today, or yesterday if today's
/// still to come.
fn streak(days: &BTreeSet<Date>, today: Date) -> u32 {
    let mut day = if days.contains(&today) { today } else { today - Days::new(1) };
    let mut n = 0;
    while days.contains(&day) {
        n += 1;
        day = day - Days::new(1);
    }
    n
}

pub async fn summary(db: &DatabaseConnection, today: Date) -> Result<LearningSummary> {
    let all = everything(db).await?;
    let live: HashMap<&str, &skill::Model> = all.skills.iter().map(|s| (s.id.as_str(), s)).collect();

    let mut skills: Vec<SkillCard> = all
        .skills
        .iter()
        .map(|sk| {
            let cards: Vec<SourceCard> = all.sources.iter().filter(|s| s.skill_id == sk.id).map(|s| all.card(s, today)).collect();
            SkillCard { tally: skill_tally(&cards), skill: sk.clone(), sources: cards }
        })
        .collect();
    skills.sort_by(|a, b| a.skill.archived.cmp(&b.skill.archived).then(a.skill.position.total_cmp(&b.skill.position)));

    let source_of: HashMap<&str, &source::Model> = all.sources.iter().filter(|s| live.contains_key(s.skill_id.as_str())).map(|s| (s.id.as_str(), s)).collect();
    let hit = |u: &unit::Model| {
        let s = source_of.get(u.source_id.as_str())?;
        let sk = live.get(s.skill_id.as_str())?;
        Some(UnitHit { unit: u.clone(), source_title: s.title.clone(), skill_name: sk.name.clone(), skill_icon: sk.icon.clone(), skill_color: sk.color.clone() })
    };
    let mut reviews: Vec<UnitHit> = all.units.values().flatten().filter(|u| u.review_on.is_some_and(|d| d <= today)).filter_map(hit).collect();
    reviews.sort_by(|a, b| a.unit.review_on.cmp(&b.unit.review_on).then(by_position(&a.unit, &b.unit)));

    let minutes_on = |day: Date| all.sessions.iter().filter(|s| s.day == day).map(|s| s.minutes).sum::<i32>();
    let units_on = |day: Date| all.units.values().flatten().filter(|u| u.done_on == Some(day)).count() as u32;
    let days: Vec<Day> = (0..HISTORY_DAYS).rev().map(|back| today - Days::new(back)).map(|day| Day { day, minutes: minutes_on(day), units: units_on(day) }).collect();
    let this_week = &days[days.len() - 7..];

    let mut recent: Vec<&session::Model> = all.sessions.iter().filter(|s| source_of.contains_key(s.source_id.as_str())).collect();
    recent.sort_by(|a, b| b.day.cmp(&a.day).then(b.created_at.cmp(&a.created_at)));
    let recent = recent
        .into_iter()
        .take(8)
        .filter_map(|s| {
            let src = source_of.get(s.source_id.as_str())?;
            Some(SessionHit { session: s.clone(), source_title: src.title.clone(), skill_icon: live.get(src.skill_id.as_str())?.icon.clone() })
        })
        .collect();

    Ok(LearningSummary {
        skills,
        reviews,
        streak: streak(&study_days(&all, today), today),
        today_minutes: minutes_on(today),
        week_minutes: this_week.iter().map(|d| d.minutes).sum(),
        week_units: this_week.iter().map(|d| d.units).sum(),
        days,
        recent,
    })
}

pub async fn get_source(db: &DatabaseConnection, id: &str, today: Date) -> Result<SourceDetail> {
    let s = find_source(db, id).await?;
    let skill = find_skill(db, &s.skill_id).await?;
    let list = units().filter(unit::Column::SourceId.eq(id)).order_by_asc(unit::Column::Position).all(db).await?;
    let mut spent = sessions().filter(session::Column::SourceId.eq(id)).all(db).await?;
    spent.sort_by(|a, b| b.day.cmp(&a.day).then(b.created_at.cmp(&a.created_at)));
    let card = source_card(s, &list, &spent.iter().collect::<Vec<_>>(), today);
    Ok(SourceDetail { card, skill, units: list, sessions: spent })
}

// ---------- Skills ----------

pub(crate) fn check_skill(f: &SkillFields) -> Result<()> {
    if f.name.trim().is_empty() {
        return Err(Error::Invalid("Give the skill a name.".into()));
    }
    if !COLORS.contains(&f.color.as_str()) {
        return Err(Error::Invalid("Pick one of the colours.".into()));
    }
    Ok(())
}

fn icon(text: &str) -> String {
    let icon: String = text.trim().chars().take(8).collect();
    if icon.is_empty() { "📘".into() } else { icon }
}

pub async fn add_skill(db: &DatabaseConnection, f: SkillFields) -> Result<skill::Model> {
    check_skill(&f)?;
    let position = skills().all(db).await?.iter().map(|s| s.position).fold(0.0, f64::max) + 1.0;
    let now = Utc::now();
    Ok(skill::ActiveModel {
        id: Set(new_id()),
        name: Set(title(&f.name)),
        icon: Set(icon(&f.icon)),
        color: Set(f.color),
        why: Set(f.why.trim().to_owned()),
        archived: Set(f.archived),
        position: Set(position),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn update_skill(db: &DatabaseConnection, id: &str, f: SkillFields) -> Result<skill::Model> {
    check_skill(&f)?;
    let mut active: skill::ActiveModel = find_skill(db, id).await?.into();
    active.name = Set(title(&f.name));
    active.icon = Set(icon(&f.icon));
    active.color = Set(f.color);
    active.why = Set(f.why.trim().to_owned());
    active.archived = Set(f.archived);
    Ok(active.update(db).await?)
}

/// Deletes a skill with its sources, their units and sessions.
pub async fn delete_skill(db: &DatabaseConnection, id: &str) -> Result<()> {
    find_skill(db, id).await?;
    let txn = db.begin().await?;
    let ids: Vec<String> = sources().filter(source::Column::SkillId.eq(id)).all(&txn).await?.into_iter().map(|s| s.id).collect();
    bury!(unit, &txn, unit::Column::SourceId.is_in(ids.clone()));
    bury!(session, &txn, session::Column::SourceId.is_in(ids.clone()));
    bury!(source, &txn, source::Column::SkillId.eq(id));
    bury!(skill, &txn, skill::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Sources ----------

pub(crate) async fn check_source(db: &impl ConnectionTrait, f: &SourceFields) -> Result<()> {
    find_skill(db, &f.skill_id).await?;
    if !KINDS.contains(&f.kind.as_str()) {
        return Err(Error::Invalid("Pick what kind of source it is.".into()));
    }
    if f.title.trim().is_empty() {
        return Err(Error::Invalid("Give it a title.".into()));
    }
    Ok(())
}

fn unit_name(f: &SourceFields) -> String {
    clean(Some(f.unit_name.to_lowercase())).unwrap_or_else(|| default_unit_name(&f.kind).into()).chars().take(30).collect()
}

pub async fn add_source(db: &DatabaseConnection, f: SourceFields) -> Result<source::Model> {
    check_source(db, &f).await?;
    let position = sources().filter(source::Column::SkillId.eq(&f.skill_id)).all(db).await?.iter().map(|s| s.position).fold(0.0, f64::max) + 1.0;
    let now = Utc::now();
    Ok(source::ActiveModel {
        id: Set(new_id()),
        unit_name: Set(unit_name(&f)),
        skill_id: Set(f.skill_id),
        kind: Set(f.kind),
        title: Set(title(&f.title)),
        author: Set(title(&f.author)),
        link: Set(clean(f.link)),
        cover_url: Set(clean(f.cover_url)),
        finish_by: Set(f.finish_by),
        finished_on: Set(None),
        notes: Set(f.notes.trim().to_owned()),
        position: Set(position),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn update_source(db: &DatabaseConnection, id: &str, f: SourceFields) -> Result<source::Model> {
    check_source(db, &f).await?;
    let mut active: source::ActiveModel = find_source(db, id).await?.into();
    active.unit_name = Set(unit_name(&f));
    active.skill_id = Set(f.skill_id);
    active.kind = Set(f.kind);
    active.title = Set(title(&f.title));
    active.author = Set(title(&f.author));
    active.link = Set(clean(f.link));
    active.cover_url = Set(clean(f.cover_url));
    active.finish_by = Set(f.finish_by);
    active.notes = Set(f.notes.trim().to_owned());
    Ok(active.update(db).await?)
}

pub async fn delete_source(db: &DatabaseConnection, id: &str) -> Result<()> {
    find_source(db, id).await?;
    let txn = db.begin().await?;
    bury!(unit, &txn, unit::Column::SourceId.eq(id));
    bury!(session, &txn, session::Column::SourceId.eq(id));
    bury!(source, &txn, source::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

/// Marks a source finished once every unit's done, and unfinished if one's undone.
async fn settle_finished(db: &impl ConnectionTrait, source_id: &str, today: Date) -> Result<()> {
    let s = find_source(db, source_id).await?;
    let list = units().filter(unit::Column::SourceId.eq(source_id)).order_by_asc(unit::Column::Position).all(db).await?;
    let t = tally(&list, &[], today);
    let finished = t.total > 0 && t.done == t.total;
    if finished != s.finished_on.is_some() {
        let mut active: source::ActiveModel = s.into();
        active.finished_on = Set(finished.then_some(today));
        active.update(db).await?;
    }
    Ok(())
}

// ---------- Units ----------

/// Adds units to the end of a source, or in place of what's there.
pub async fn add_units(db: &DatabaseConnection, source_id: &str, drafts: Vec<Draft>, replace: bool, today: Date) -> Result<Vec<unit::Model>> {
    find_source(db, source_id).await?;
    let drafts: Vec<Draft> = drafts.into_iter().filter(|d| !d.title.trim().is_empty()).collect();
    if drafts.is_empty() {
        return Err(Error::Invalid("There's nothing to add.".into()));
    }
    let txn = db.begin().await?;
    if replace {
        bury!(unit, &txn, unit::Column::SourceId.eq(source_id));
    }
    let existing = units().filter(unit::Column::SourceId.eq(source_id)).all(&txn).await?;
    if existing.len() + drafts.len() > MAX_UNITS_PER_SOURCE {
        return Err(Error::Invalid(format!("A source can have up to {MAX_UNITS_PER_SOURCE} units.")));
    }
    let mut position = existing.iter().map(|u| u.position).fold(0.0, f64::max);
    let now = Utc::now();
    let mut added = Vec::with_capacity(drafts.len());
    for d in drafts {
        position += 1.0;
        added.push(
            unit::ActiveModel {
                id: Set(new_id()),
                source_id: Set(source_id.to_owned()),
                title: Set(title(&d.title)),
                level: Set(d.level.clamp(0, 6)),
                minutes: Set(d.minutes.filter(|m| *m > 0)),
                page: Set(d.page.filter(|p| *p > 0)),
                done_on: Set(None),
                review_stage: Set(0),
                review_on: Set(None),
                notes: Set(String::new()),
                position: Set(position),
                created_at: Set(now),
                updated_at: Set(now),
                deleted_at: Set(None),
            }
            .insert(&txn)
            .await?,
        );
    }
    settle_finished(&txn, source_id, today).await?;
    txn.commit().await?;
    Ok(added)
}

pub async fn update_unit(db: &DatabaseConnection, id: &str, f: UnitFields) -> Result<unit::Model> {
    if f.title.trim().is_empty() {
        return Err(Error::Invalid("Give it a title.".into()));
    }
    let mut active: unit::ActiveModel = find_unit(db, id).await?.into();
    active.title = Set(title(&f.title));
    active.level = Set(f.level.clamp(0, 6));
    active.minutes = Set(f.minutes.filter(|m| *m > 0));
    active.page = Set(f.page.filter(|p| *p > 0));
    active.notes = Set(f.notes.trim().to_owned());
    Ok(active.update(db).await?)
}

pub async fn delete_unit(db: &DatabaseConnection, id: &str, today: Date) -> Result<()> {
    let u = find_unit(db, id).await?;
    bury!(unit, db, unit::Column::Id.eq(id));
    settle_finished(db, &u.source_id, today).await
}

/// Ticks a unit off (or back on).
pub async fn set_done(db: &DatabaseConnection, id: &str, done: bool, today: Date) -> Result<unit::Model> {
    let u = find_unit(db, id).await?;
    let source_id = u.source_id.clone();
    let mut active: unit::ActiveModel = u.into();
    active.done_on = Set(done.then_some(today));
    let saved = active.update(db).await?;
    settle_finished(db, &source_id, today).await?;
    Ok(saved)
}

/// Spaced review: "later" asks for one in a few days; "reviewed" moves on to
/// the next (a week, then a month, then it's learnt); "clear" stops them.
pub async fn review(db: &DatabaseConnection, id: &str, action: &str, today: Date) -> Result<unit::Model> {
    let u = find_unit(db, id).await?;
    let (stage, on) = match action {
        "later" => (1, Some(today + Days::new(REVIEW_DAYS[0]))),
        "reviewed" => match u.review_stage {
            s @ 1..=2 => (s + 1, Some(today + Days::new(REVIEW_DAYS[s as usize]))),
            _ => (0, None),
        },
        "clear" => (0, None),
        _ => return Err(Error::Invalid("Unknown review action.".into())),
    };
    let mut active: unit::ActiveModel = u.into();
    active.review_stage = Set(stage);
    active.review_on = Set(on);
    Ok(active.update(db).await?)
}

// ---------- Sessions ----------

pub async fn add_session(db: &DatabaseConnection, f: SessionFields) -> Result<session::Model> {
    find_source(db, &f.source_id).await?;
    if !(1..=24 * 60).contains(&f.minutes) {
        return Err(Error::Invalid("Log between 1 minute and 24 hours.".into()));
    }
    let now = Utc::now();
    Ok(session::ActiveModel {
        id: Set(new_id()),
        source_id: Set(f.source_id),
        day: Set(f.day),
        minutes: Set(f.minutes),
        note: Set(f.note.trim().to_owned()),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn delete_session(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(session, db, session::Column::Id.eq(id));
    Ok(())
}

// ---------- For other features ----------

/// Units done and in all, for Goals.
pub async fn progress(db: &DatabaseConnection, source_id: &str, today: Date) -> Result<(u32, u32, String)> {
    let detail = get_source(db, source_id, today).await?;
    Ok((detail.card.tally.done, detail.card.tally.total, detail.card.source.title))
}

/// Minutes studied from `since` on, for Goals.
pub async fn minutes_since(db: &DatabaseConnection, since: Date) -> Result<i32> {
    Ok(sessions().filter(session::Column::Day.gte(since)).all(db).await?.iter().map(|s| s.minutes).sum())
}

/// Every source on a skill that's still active, for Goals to follow: (id, "Skill · Title").
pub async fn source_options(db: &DatabaseConnection) -> Result<Vec<(String, String)>> {
    let all = everything(db).await?;
    let active: HashMap<&str, &skill::Model> = all.skills.iter().filter(|s| !s.archived).map(|s| (s.id.as_str(), s)).collect();
    Ok(all.sources.iter().filter_map(|s| active.get(s.skill_id.as_str()).map(|sk| (s.id.clone(), format!("{} · {}", sk.name, s.title)))).collect())
}
