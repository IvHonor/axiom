//! The Birthdays logic: every query and change, independent of Tauri so it
//! can be tested on its own (see `tests.rs`).
//!
//! "Today" comes from the frontend, so it always matches what the user sees.

use std::collections::HashMap;

use chrono::{Datelike, NaiveDate, Utc};
use sea_orm::prelude::{Date, Expr};
use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, Select, Set, TransactionTrait};

use super::entities::{gift, person};
use super::types::{GiftFields, ImportReport, PersonDetail, PersonFields, PersonView};
use super::vcard;
use crate::db::new_id;
use crate::error::{Error, Result};

pub const OCCASIONS: &[&str] = &["birthday", "anniversary"];
pub const RELATIONS: &[&str] = &["family", "friend", "partner", "work", "other"];
/// How far ahead a reminder can come, in days.
pub const REMIND_DAYS: &[i32] = &[0, 1, 2, 3, 7, 14, 30];
pub const STATUSES: &[&str] = &["idea", "bought", "given"];

fn people() -> Select<person::Entity> {
    person::Entity::find().filter(person::Column::DeletedAt.is_null())
}

fn gifts() -> Select<gift::Entity> {
    gift::Entity::find().filter(gift::Column::DeletedAt.is_null())
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

async fn find(db: &impl ConnectionTrait, id: &str) -> Result<person::Model> {
    people().filter(person::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Person"))
}

async fn find_gift(db: &impl ConnectionTrait, id: &str) -> Result<gift::Model> {
    gifts().filter(gift::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Gift"))
}

// ---------- Dates ----------

/// The day in `year`: 29 February is the 28th when there isn't one.
pub fn in_year(month: i16, day: i16, year: i32) -> Date {
    NaiveDate::from_ymd_opt(year, month as u32, day as u32)
        .or_else(|| NaiveDate::from_ymd_opt(year, 2, 28))
        .expect("checked when saved")
}

/// The next time it comes round, from today (today counts).
pub fn next_from(month: i16, day: i16, today: Date) -> Date {
    let this_year = in_year(month, day, today.year());
    if this_year >= today { this_year } else { in_year(month, day, today.year() + 1) }
}

pub fn view(p: &person::Model, ideas: u32, today: Date) -> PersonView {
    let next = next_from(p.month, p.day, today);
    let turning = p.year.map(|y| next.year() - y).filter(|t| *t >= 0);
    let age = p.year.map(|y| today.year() - y - i32::from(in_year(p.month, p.day, today.year()) > today)).filter(|a| *a >= 0);
    PersonView {
        id: p.id.clone(),
        name: p.name.clone(),
        occasion: p.occasion.clone(),
        month: p.month,
        day: p.day,
        year: p.year,
        relation: p.relation.clone(),
        notes: p.notes.clone(),
        remind_days: p.remind_days,
        next,
        days: (next - today).num_days() as i32,
        age,
        turning,
        ideas,
        created_at: p.created_at,
        updated_at: p.updated_at,
    }
}

fn check(fields: &PersonFields, today: Date) -> Result<String> {
    let name: String = fields.name.trim().chars().take(120).collect();
    if name.is_empty() {
        return Err(Error::Invalid("Give them a name.".into()));
    }
    if !OCCASIONS.contains(&fields.occasion.as_str()) {
        return Err(Error::Invalid("It's a birthday or an anniversary.".into()));
    }
    if !RELATIONS.contains(&fields.relation.as_str()) {
        return Err(Error::Invalid(format!("Pick one of: {}.", RELATIONS.join(", "))));
    }
    if !REMIND_DAYS.contains(&fields.remind_days) {
        return Err(Error::Invalid("Remind on the day, or 1, 2, 3, 7, 14 or 30 days before.".into()));
    }
    // 2024 is a leap year, so 29 February passes here.
    if NaiveDate::from_ymd_opt(2024, fields.month as u32, fields.day as u32).is_none() {
        return Err(Error::Invalid("That date doesn't exist.".into()));
    }
    if let Some(y) = fields.year {
        if y < 1900 || y > today.year() {
            return Err(Error::Invalid(format!("The year goes from 1900 to {}.", today.year())));
        }
        if NaiveDate::from_ymd_opt(y, fields.month as u32, fields.day as u32).is_none() {
            return Err(Error::Invalid(format!("{y} didn't have a 29 February.")));
        }
    }
    Ok(name)
}

// ---------- People ----------

/// Gift ideas not given yet, per person.
async fn idea_counts(db: &impl ConnectionTrait) -> Result<HashMap<String, u32>> {
    let mut counts = HashMap::new();
    for g in gifts().filter(gift::Column::Status.ne("given")).all(db).await? {
        *counts.entry(g.person_id).or_default() += 1;
    }
    Ok(counts)
}

/// Everyone, soonest first (then by name).
pub async fn list(db: &DatabaseConnection, today: Date) -> Result<Vec<PersonView>> {
    let ideas = idea_counts(db).await?;
    let mut all: Vec<PersonView> = people().all(db).await?.iter().map(|p| view(p, ideas.get(&p.id).copied().unwrap_or(0), today)).collect();
    all.sort_by(|a, b| a.days.cmp(&b.days).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(all)
}

pub async fn get(db: &DatabaseConnection, id: &str, today: Date) -> Result<PersonDetail> {
    let p = find(db, id).await?;
    let mut list = gifts().filter(gift::Column::PersonId.eq(id)).all(db).await?;
    let rank = |s: &str| STATUSES.iter().position(|x| *x == s).unwrap_or(0);
    list.sort_by(|a, b| rank(&a.status).cmp(&rank(&b.status)).then_with(|| b.year.cmp(&a.year)).then_with(|| a.created_at.cmp(&b.created_at)));
    let ideas = list.iter().filter(|g| g.status != "given").count() as u32;
    Ok(PersonDetail { person: view(&p, ideas, today), gifts: list })
}

pub async fn create(db: &DatabaseConnection, fields: PersonFields, today: Date) -> Result<PersonView> {
    let name = check(&fields, today)?;
    let now = Utc::now();
    let p = person::ActiveModel {
        id: Set(new_id()),
        name: Set(name),
        occasion: Set(fields.occasion),
        month: Set(fields.month),
        day: Set(fields.day),
        year: Set(fields.year),
        relation: Set(fields.relation),
        notes: Set(fields.notes.trim().to_owned()),
        remind_days: Set(fields.remind_days),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?;
    Ok(view(&p, 0, today))
}

pub async fn update(db: &DatabaseConnection, id: &str, fields: PersonFields, today: Date) -> Result<PersonView> {
    let name = check(&fields, today)?;
    let mut active: person::ActiveModel = find(db, id).await?.into();
    active.name = Set(name);
    active.occasion = Set(fields.occasion);
    active.month = Set(fields.month);
    active.day = Set(fields.day);
    active.year = Set(fields.year);
    active.relation = Set(fields.relation);
    active.notes = Set(fields.notes.trim().to_owned());
    active.remind_days = Set(fields.remind_days);
    let p = active.update(db).await?;
    let ideas = idea_counts(db).await?.get(id).copied().unwrap_or(0);
    Ok(view(&p, ideas, today))
}

pub async fn delete(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    bury!(gift, &txn, gift::Column::PersonId.eq(id));
    bury!(person, &txn, person::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

/// What's today, and what's coming up that someone asked to hear about now:
/// for the reminder.
pub async fn due(db: &DatabaseConnection, today: Date) -> Result<(Vec<PersonView>, Vec<PersonView>)> {
    let all = list(db, today).await?;
    let (on, ahead): (Vec<PersonView>, Vec<PersonView>) = all.into_iter().filter(|p| p.days == 0 || (p.remind_days > 0 && p.days == p.remind_days)).partition(|p| p.days == 0);
    Ok((on, ahead))
}

// ---------- Gifts ----------

fn check_gift(fields: &GiftFields) -> Result<(String, String)> {
    let idea: String = fields.idea.trim().chars().take(300).collect();
    if idea.is_empty() {
        return Err(Error::Invalid("Write down the idea.".into()));
    }
    if !STATUSES.contains(&fields.status.as_str()) {
        return Err(Error::Invalid("A gift is an idea, bought or given.".into()));
    }
    let url = fields.url.trim();
    if !url.is_empty() && !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(Error::Invalid("Links start with https://".into()));
    }
    Ok((idea, url.chars().take(1000).collect()))
}

pub async fn add_gift(db: &DatabaseConnection, person_id: &str, fields: GiftFields, today: Date) -> Result<gift::Model> {
    find(db, person_id).await?;
    let (idea, url) = check_gift(&fields)?;
    let now = Utc::now();
    Ok(gift::ActiveModel {
        id: Set(new_id()),
        person_id: Set(person_id.into()),
        idea: Set(idea),
        url: Set(url),
        year: Set((fields.status == "given").then_some(today.year())),
        status: Set(fields.status),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

/// Marking one given notes the year; moving it back clears it.
pub async fn update_gift(db: &DatabaseConnection, id: &str, fields: GiftFields, today: Date) -> Result<gift::Model> {
    let g = find_gift(db, id).await?;
    let (idea, url) = check_gift(&fields)?;
    let year = match (fields.status.as_str(), g.year) {
        ("given", Some(y)) => Some(y),
        ("given", None) => Some(today.year()),
        _ => None,
    };
    let mut active: gift::ActiveModel = g.into();
    active.idea = Set(idea);
    active.url = Set(url);
    active.status = Set(fields.status);
    active.year = Set(year);
    Ok(active.update(db).await?)
}

pub async fn delete_gift(db: &DatabaseConnection, id: &str) -> Result<()> {
    bury!(gift, db, gift::Column::Id.eq(id));
    Ok(())
}

// ---------- Contacts and calendars ----------

/// Adds everyone in a contacts file (.vcf) who has a birthday or an
/// anniversary on it, skipping anyone already here.
pub async fn import_vcard(db: &DatabaseConnection, text: &str, today: Date) -> Result<ImportReport> {
    let found = vcard::parse(text);
    let mut report = ImportReport { without_date: found.without_date, ..Default::default() };
    let mut have: Vec<(String, String, i16, i16)> = people().all(db).await?.into_iter().map(|p| (p.name.to_lowercase(), p.occasion, p.month, p.day)).collect();
    let txn = db.begin().await?;
    let now = Utc::now();
    for c in found.dates {
        let key = (c.name.to_lowercase(), c.occasion.to_owned(), c.month, c.day);
        if have.contains(&key) {
            report.already += 1;
            continue;
        }
        let year = c.year.filter(|y| *y >= 1900 && *y <= today.year() && NaiveDate::from_ymd_opt(*y, c.month as u32, c.day as u32).is_some());
        person::ActiveModel {
            id: Set(new_id()),
            name: Set(c.name.chars().take(120).collect()),
            occasion: Set(c.occasion.into()),
            month: Set(c.month),
            day: Set(c.day),
            year: Set(year),
            relation: Set("other".into()),
            notes: Set(String::new()),
            remind_days: Set(7),
            created_at: Set(now),
            updated_at: Set(now),
            deleted_at: Set(None),
        }
        .insert(&txn)
        .await?;
        have.push(key);
        report.added += 1;
    }
    txn.commit().await?;
    Ok(report)
}

/// Everyone as a calendar file (.ics), each coming round every year.
pub async fn calendar(db: &DatabaseConnection, today: Date) -> Result<String> {
    Ok(super::ics::write(&people().all(db).await?, today))
}
