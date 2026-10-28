//! Learning: see skills, their sources and what's due for review; log a
//! study session, or tick a unit done; and add skills, sources (courses,
//! books, videos) and their units (chapters, lessons…).

use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, capital, date, day_name, nothing, object, unknown};
use crate::error::{Error, Result};
use crate::features::learning::entities::{skill, source, unit};
use crate::features::learning::service::{self, COLORS, KINDS};
use crate::features::learning::types::{Draft, SessionFields, SkillFields, SourceFields};

/// Most units in one proposal.
const MAX_UNITS: usize = 200;

pub fn specs() -> Vec<Spec> {
    let units = json!({ "type": "array", "maxItems": MAX_UNITS, "items": { "type": "string" }, "description": "Unit titles, in order." });
    vec![
        Spec {
            area: "learning",
            name: "learning_overview",
            description: "Skills being learnt, each with its sources (courses, books, videos: id, progress, next unit, expected finish), units due for review, the study streak and minutes studied today and this week.",
            parameters: nothing(),
            change: false,
        },
        Spec {
            area: "learning",
            name: "learning_source",
            description: "One source's units in order (ids, titles, done or not) and recent study sessions.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: false,
        },
        Spec {
            area: "learning",
            name: "learning_log_session",
            description: "Proposes logging time studied on a source.",
            parameters: object(json!({ "source_id": { "type": "string" }, "minutes": { "type": "integer", "minimum": 1 }, "day": { "type": "string", "description": "YYYY-MM-DD; today if left out" }, "note": { "type": "string" } }), &["source_id", "minutes"]),
            change: true,
        },
        Spec {
            area: "learning",
            name: "learning_unit_done",
            description: "Proposes ticking a unit (chapter, lecture, video…) done, or not done, by its id from learning_source.",
            parameters: object(json!({ "unit_id": { "type": "string" }, "done": { "type": "boolean" } }), &["unit_id"]),
            change: true,
        },
        Spec {
            area: "learning",
            name: "learning_add_skill",
            description: "Proposes a new skill to learn, e.g. Spanish or Statistics.",
            parameters: object(
                json!({ "name": { "type": "string" }, "icon": { "type": "string", "description": "One emoji." }, "color": { "type": "string", "enum": COLORS }, "why": { "type": "string", "description": "Why they're learning it." } }),
                &["name"],
            ),
            change: true,
        },
        Spec {
            area: "learning",
            name: "learning_add_source",
            description: "Proposes a source to learn a skill from (by skill id): a course, book, video or other, optionally with its units (chapters, lessons…) in order.",
            parameters: object(
                json!({
                    "skill_id": { "type": "string" },
                    "kind": { "type": "string", "enum": KINDS },
                    "title": { "type": "string" },
                    "author": { "type": "string" },
                    "link": { "type": "string" },
                    "unit_name": { "type": "string", "description": "What one unit is called, e.g. chapter, lesson, video." },
                    "finish_by": { "type": "string", "description": "YYYY-MM-DD they want to finish by." },
                    "units": units.clone(),
                }),
                &["skill_id", "kind", "title"],
            ),
            change: true,
        },
        Spec {
            area: "learning",
            name: "learning_add_units",
            description: "Proposes adding units (chapters, lessons…) to the end of an existing source, by source id.",
            parameters: object(json!({ "source_id": { "type": "string" }, "units": units }), &["source_id", "units"]),
            change: true,
        },
    ]
}

#[derive(Deserialize, Default)]
struct A {
    id: Option<String>,
    source_id: Option<String>,
    unit_id: Option<String>,
    minutes: Option<i32>,
    day: Option<String>,
    note: Option<String>,
    done: Option<bool>,
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    match tool {
        "learning_overview" => {
            let s = service::summary(ctx.db, ctx.today).await?;
            Ok(json!({
                "skills": s.skills.iter().map(|k| json!({
                    "id": k.skill.id,
                    "name": k.skill.name,
                    "sources": k.sources.iter().map(|c| json!({
                        "id": c.source.id, "title": c.source.title, "kind": c.source.kind, "done": c.tally.done, "of": c.tally.total,
                        "unit": c.source.unit_name, "next": c.next, "last_studied": c.last_studied, "expected_finish": c.expected,
                        "finish_by": c.source.finish_by, "needed_per_week": c.needed_per_week, "finished": c.source.finished_on.is_some(),
                    })).collect::<Vec<_>>(),
                })).collect::<Vec<_>>(),
                "due_for_review": s.reviews.iter().map(|u| json!({ "unit": u.unit.title, "source": u.source_title })).collect::<Vec<_>>(),
                "streak_days": s.streak, "minutes_today": s.today_minutes, "minutes_this_week": s.week_minutes,
            }))
        }
        "learning_source" => {
            let d = service::get_source(ctx.db, a.id.as_deref().unwrap_or_default(), ctx.today).await?;
            Ok(json!({
                "title": d.card.source.title,
                "units": d.units.iter().map(|u| json!({ "id": u.id, "title": u.title, "done": u.done_on.is_some(), "level": u.level })).collect::<Vec<_>>(),
                "recent_sessions": d.sessions.iter().take(10).map(|s| json!({ "day": s.day, "minutes": s.minutes, "note": s.note })).collect::<Vec<_>>(),
            }))
        }
        _ => Err(unknown(tool)),
    }
}

async fn source_title(ctx: &Ctx<'_>, id: &str) -> Result<String> {
    let found = source::Entity::find_by_id(id).filter(source::Column::DeletedAt.is_null()).one(ctx.db).await?;
    found.map(|s| s.title).ok_or(Error::NotFound("Source"))
}

async fn find_unit(ctx: &Ctx<'_>, id: &str) -> Result<unit::Model> {
    unit::Entity::find_by_id(id).filter(unit::Column::DeletedAt.is_null()).one(ctx.db).await?.ok_or(Error::NotFound("Unit"))
}

fn session(a: &A, ctx: &Ctx<'_>) -> Result<SessionFields> {
    let minutes = a.minutes.filter(|m| (1..=24 * 60).contains(m)).ok_or_else(|| Error::Invalid("Log between 1 minute and 24 hours.".into()))?;
    Ok(SessionFields {
        source_id: a.source_id.clone().unwrap_or_default(),
        day: a.day.as_deref().map(date).transpose()?.unwrap_or(ctx.today),
        minutes,
        note: a.note.clone().unwrap_or_default(),
    })
}

// ---------- Adding ----------

#[derive(Deserialize)]
struct NewSkill {
    name: String,
    #[serde(default)]
    icon: String,
    color: Option<String>,
    #[serde(default)]
    why: String,
}

#[derive(Deserialize)]
struct NewSource {
    skill_id: String,
    kind: String,
    title: String,
    #[serde(default)]
    author: String,
    link: Option<String>,
    #[serde(default)]
    unit_name: String,
    finish_by: Option<String>,
    #[serde(default)]
    units: Vec<String>,
}

#[derive(Deserialize)]
struct NewUnits {
    source_id: String,
    units: Vec<String>,
}

fn skill_fields(s: NewSkill) -> Result<SkillFields> {
    let f = SkillFields { name: s.name.trim().to_owned(), icon: s.icon, color: s.color.unwrap_or_else(|| "blue".into()), why: s.why, archived: false };
    service::check_skill(&f)?;
    Ok(f)
}

async fn source_fields(ctx: &Ctx<'_>, s: &NewSource) -> Result<(SourceFields, String)> {
    let skill = skill::Entity::find_by_id(s.skill_id.as_str()).filter(skill::Column::DeletedAt.is_null()).one(ctx.db).await?.ok_or(Error::NotFound("Skill"))?;
    let f = SourceFields {
        skill_id: s.skill_id.clone(),
        kind: s.kind.clone(),
        title: s.title.trim().to_owned(),
        author: s.author.trim().to_owned(),
        link: s.link.clone().filter(|l| !l.trim().is_empty()),
        cover_url: None,
        unit_name: s.unit_name.clone(),
        finish_by: s.finish_by.as_deref().map(date).transpose()?,
        notes: String::new(),
    };
    service::check_source(ctx.db, &f).await?;
    Ok((f, skill.name))
}

fn drafts(units: &[String]) -> Result<Vec<Draft>> {
    if units.len() > MAX_UNITS {
        return Err(Error::Invalid(format!("Add up to {MAX_UNITS} units at once.")));
    }
    Ok(units.iter().map(|t| t.trim()).filter(|t| !t.is_empty()).map(|t| Draft { title: t.to_owned(), level: 0, minutes: None, page: None }).collect())
}

/// The first few units, and how many more.
fn units_text(units: &[Draft]) -> String {
    let shown: Vec<&str> = units.iter().take(5).map(|u| u.title.as_str()).collect();
    match units.len().saturating_sub(5) {
        0 => shown.join(", "),
        more => format!("{}, and {more} more", shown.join(", ")),
    }
}

async fn preview_add(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    match tool {
        "learning_add_skill" => {
            let f = skill_fields(args(raw)?)?;
            let mut items = vec![Item::new("Skill", format!("{} {}", f.icon.trim(), f.name).trim())];
            if !f.why.trim().is_empty() {
                items.push(Item::new("Why", f.why.trim()));
            }
            Ok(Preview { title: format!("Start learning {}", f.name), items })
        }
        "learning_add_source" => {
            let s: NewSource = args(raw)?;
            let (f, skill) = source_fields(ctx, &s).await?;
            let units = drafts(&s.units)?;
            let mut items = vec![Item::new(&capital(&f.kind), &f.title), Item::new("Skill", skill)];
            if !f.author.is_empty() {
                items.push(Item::new("By", &f.author));
            }
            if let Some(day) = f.finish_by {
                items.push(Item::new("Finish by", day_name(day, ctx.today)));
            }
            if !units.is_empty() {
                items.push(Item::new(&format!("{} units", units.len()), units_text(&units)));
            }
            Ok(Preview { title: format!("Add \"{}\"", f.title), items })
        }
        "learning_add_units" => {
            let n: NewUnits = args(raw)?;
            let title = source_title(ctx, &n.source_id).await?;
            let units = drafts(&n.units)?;
            if units.is_empty() {
                return Err(Error::Invalid("There's nothing to add.".into()));
            }
            Ok(Preview { title: format!("Add {} units to \"{title}\"", units.len()), items: vec![Item::new("Units", units_text(&units))] })
        }
        _ => Err(unknown(tool)),
    }
}

async fn apply_add(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    match tool {
        "learning_add_skill" => {
            let s = service::add_skill(ctx.db, skill_fields(args(raw)?)?).await?;
            Ok(json!({ "skill_id": s.id, "name": s.name }))
        }
        "learning_add_source" => {
            let s: NewSource = args(raw)?;
            let (f, _) = source_fields(ctx, &s).await?;
            let units = drafts(&s.units)?;
            let count = units.len();
            let added = service::add_source(ctx.db, f).await?;
            if count > 0 {
                service::add_units(ctx.db, &added.id, units, false, ctx.today).await?;
            }
            Ok(json!({ "source_id": added.id, "title": added.title, "units": count }))
        }
        "learning_add_units" => {
            let n: NewUnits = args(raw)?;
            let added = service::add_units(ctx.db, &n.source_id, drafts(&n.units)?, false, ctx.today).await?;
            Ok(json!({ "added": added.len() }))
        }
        _ => Err(unknown(tool)),
    }
}

// ---------- Studying ----------

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    if tool.starts_with("learning_add_") {
        return preview_add(ctx, tool, raw).await;
    }
    let a: A = args(raw)?;
    match tool {
        "learning_log_session" => {
            let f = session(&a, ctx)?;
            let title = source_title(ctx, &f.source_id).await?;
            let mut items = vec![Item::new("Time", format!("{} min", f.minutes)), Item::new("Day", day_name(f.day, ctx.today))];
            if !f.note.trim().is_empty() {
                items.push(Item::new("Note", f.note.trim()));
            }
            Ok(Preview { title: format!("Log study on \"{title}\""), items })
        }
        "learning_unit_done" => {
            let u = find_unit(ctx, a.unit_id.as_deref().unwrap_or_default()).await?;
            let done = a.done.unwrap_or(true);
            let title = source_title(ctx, &u.source_id).await?;
            Ok(Preview {
                title: format!("{} a unit of \"{title}\"", if done { "Tick" } else { "Untick" }),
                items: vec![Item::change(&u.title, if u.done_on.is_some() { "Done" } else { "To do" }, if done { "Done" } else { "To do" })],
            })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    if tool.starts_with("learning_add_") {
        return apply_add(ctx, tool, raw).await;
    }
    let a: A = args(raw)?;
    match tool {
        "learning_log_session" => {
            let s = service::add_session(ctx.db, session(&a, ctx)?).await?;
            Ok(json!({ "session_id": s.id, "minutes": s.minutes }))
        }
        "learning_unit_done" => {
            let u = service::set_done(ctx.db, a.unit_id.as_deref().unwrap_or_default(), a.done.unwrap_or(true), ctx.today).await?;
            Ok(json!({ "unit": u.title, "done": u.done_on.is_some() }))
        }
        _ => Err(unknown(tool)),
    }
}
