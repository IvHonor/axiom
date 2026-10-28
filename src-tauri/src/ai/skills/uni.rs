//! University: see the term, modules, and lectures behind or coming up;
//! mark a lecture attended, caught up on or reviewed; and add modules,
//! lectures, or a weekly timetable of them.

use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, capital, date, day_name, nothing, object, unknown};
use crate::error::{Error, Result};
use crate::features::uni::entities::{lecture, module, term};
use crate::features::uni::service::{self, COLORS, KINDS, STAGES};
use crate::features::uni::types::{LectureFields, LectureHit, ModuleFields, Schedule};

/// Most lectures in one proposal.
const MAX_LECTURES: usize = 60;
const WEEKDAYS: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

pub fn specs() -> Vec<Spec> {
    vec![
        Spec {
            area: "uni",
            name: "uni_overview",
            description: "The current term (and teaching week), its modules with progress, lectures that have passed without being caught up on, and lectures in the next seven days.",
            parameters: nothing(),
            change: false,
        },
        Spec {
            area: "uni",
            name: "uni_module",
            description: "One module's lectures in order, with ids, days, topics and whether each was attended, caught up on and reviewed.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: false,
        },
        Spec {
            area: "uni",
            name: "uni_mark_lecture",
            description: "Proposes marking a lecture attended, caught up on (gone through properly) or reviewed, or undoing that.",
            parameters: object(json!({ "lecture_id": { "type": "string" }, "stage": { "type": "string", "enum": STAGES }, "done": { "type": "boolean" } }), &["lecture_id", "stage"]),
            change: true,
        },
        Spec {
            area: "uni",
            name: "uni_add_module",
            description: "Proposes adding a module to a term (the current one if term_id is left out).",
            parameters: object(
                json!({
                    "term_id": { "type": "string" },
                    "code": { "type": "string", "description": "e.g. EC5001; can be empty." },
                    "name": { "type": "string" },
                    "color": { "type": "string", "enum": COLORS },
                    "credits": { "type": "integer" },
                }),
                &["name"],
            ),
            change: true,
        },
        Spec {
            area: "uni",
            name: "uni_add_lectures",
            description: "Proposes adding one-off lectures (or seminars, labs, tutorials) to a module, by module id. Give each a day or a teaching week.",
            parameters: object(
                json!({
                    "module_id": { "type": "string" },
                    "lectures": { "type": "array", "maxItems": MAX_LECTURES, "items": { "type": "object", "required": ["title"], "properties": {
                        "title": { "type": "string" },
                        "kind": { "type": "string", "enum": KINDS },
                        "day": { "type": "string", "description": "YYYY-MM-DD" },
                        "week": { "type": "integer", "description": "Teaching week, if there's no day." },
                        "topics": { "type": "string" },
                        "recorded": { "type": "boolean" },
                    } } },
                }),
                &["module_id", "lectures"],
            ),
            change: true,
        },
        Spec {
            area: "uni",
            name: "uni_add_timetable",
            description: "Proposes a module's weekly timetable: one of a kind (e.g. lecture) on each weekday given, every teaching week from from_week to to_week, skipping some (e.g. reading week). They're numbered on from the module's existing ones: \"Lecture 1\", \"Lecture 2\"…",
            parameters: object(
                json!({
                    "module_id": { "type": "string" },
                    "kind": { "type": "string", "enum": KINDS },
                    "title": { "type": "string", "description": "What to number, e.g. Lecture; the kind if left out." },
                    "days": { "type": "array", "items": { "type": "string", "enum": WEEKDAYS } },
                    "from_week": { "type": "integer" },
                    "to_week": { "type": "integer" },
                    "skip_weeks": { "type": "array", "items": { "type": "integer" } },
                    "recorded": { "type": "boolean" },
                }),
                &["module_id", "kind", "days", "from_week", "to_week"],
            ),
            change: true,
        },
    ]
}

// ---------- Adding ----------

#[derive(Deserialize)]
struct AddModule {
    term_id: Option<String>,
    #[serde(default)]
    code: String,
    name: String,
    color: Option<String>,
    credits: Option<i32>,
}

#[derive(Deserialize)]
struct AddLectures {
    module_id: String,
    lectures: Vec<NewLecture>,
}

#[derive(Deserialize)]
struct NewLecture {
    title: String,
    kind: Option<String>,
    day: Option<String>,
    week: Option<i32>,
    #[serde(default)]
    topics: String,
    #[serde(default)]
    recorded: bool,
}

#[derive(Deserialize)]
struct Timetable {
    module_id: String,
    kind: String,
    #[serde(default)]
    title: String,
    days: Vec<String>,
    from_week: i32,
    to_week: i32,
    #[serde(default)]
    skip_weeks: Vec<i32>,
    #[serde(default)]
    recorded: bool,
}

fn module_label(m: &module::Model) -> String {
    format!("{} {}", m.code, m.name).trim().to_owned()
}

/// A module, and its term.
async fn module_and_term(ctx: &Ctx<'_>, id: &str) -> Result<(module::Model, term::Model)> {
    let m = module::Entity::find_by_id(id).filter(module::Column::DeletedAt.is_null()).one(ctx.db).await?.ok_or(Error::NotFound("Module"))?;
    let t = term::Entity::find_by_id(m.term_id.as_str()).filter(term::Column::DeletedAt.is_null()).one(ctx.db).await?.ok_or(Error::NotFound("Term"))?;
    Ok((m, t))
}

async fn module_fields(ctx: &Ctx<'_>, a: AddModule) -> Result<(ModuleFields, term::Model)> {
    let term_id = match a.term_id {
        Some(id) => id,
        None => service::summary(ctx.db, ctx.today).await?.current.ok_or_else(|| Error::Invalid("There's no current term: give a term_id, or set up a term first.".into()))?,
    };
    let t = term::Entity::find_by_id(term_id.as_str()).filter(term::Column::DeletedAt.is_null()).one(ctx.db).await?.ok_or(Error::NotFound("Term"))?;
    let fields = ModuleFields { term_id, code: a.code.trim().to_owned(), name: a.name.trim().to_owned(), color: a.color.unwrap_or_else(|| "blue".into()), credits: a.credits, link: None };
    service::check_module(&fields)?;
    Ok((fields, t))
}

fn lecture_fields(l: &NewLecture, t: &term::Model) -> Result<LectureFields> {
    let fields = LectureFields {
        title: l.title.trim().to_owned(),
        kind: l.kind.clone().unwrap_or_else(|| "lecture".into()),
        week: l.week,
        day: l.day.as_deref().map(date).transpose()?,
        topics: l.topics.trim().to_owned(),
        recorded: l.recorded,
        confidence: None,
        notes: String::new(),
    };
    service::check_lecture(&fields)?;
    if fields.week.is_some_and(|w| !(1..=t.weeks).contains(&w)) {
        return Err(Error::Invalid(format!("{} has weeks 1 to {}.", t.name, t.weeks)));
    }
    Ok(fields)
}

fn schedule_of(tt: &Timetable, t: &term::Model) -> Result<Schedule> {
    service::check_kind(&tt.kind)?;
    let weekdays = tt
        .days
        .iter()
        .map(|d| WEEKDAYS.iter().position(|w| d.trim().to_lowercase().starts_with(w)).map(|i| i as u32).ok_or_else(|| Error::Invalid(format!("Name days as {}, not {d}.", WEEKDAYS.join(", ")))))
        .collect::<Result<Vec<_>>>()?;
    if weekdays.is_empty() {
        return Err(Error::Invalid("Pick the days it's on.".into()));
    }
    if tt.from_week < 1 || tt.to_week > t.weeks || tt.from_week > tt.to_week {
        return Err(Error::Invalid(format!("{} has weeks 1 to {}.", t.name, t.weeks)));
    }
    let count = (tt.from_week..=tt.to_week).filter(|w| !tt.skip_weeks.contains(w)).count() * weekdays.len();
    if count == 0 || count > MAX_LECTURES {
        return Err(Error::Invalid(format!("That's {count} sessions; add between 1 and {MAX_LECTURES} at once.")));
    }
    Ok(Schedule { kind: tt.kind.clone(), title: tt.title.trim().to_owned(), weekdays, from_week: tt.from_week, to_week: tt.to_week, skip_weeks: tt.skip_weeks.clone(), recorded: tt.recorded })
}

async fn preview_add(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    match tool {
        "uni_add_module" => {
            let (f, t) = module_fields(ctx, args(raw)?).await?;
            let mut items = vec![Item::new("Module", format!("{} {}", f.code, f.name).trim()), Item::new("Term", &t.name)];
            if let Some(c) = f.credits {
                items.push(Item::new("Credits", c.to_string()));
            }
            Ok(Preview { title: format!("Add the module {}", f.name), items })
        }
        "uni_add_lectures" => {
            let a: AddLectures = args(raw)?;
            let (m, t) = module_and_term(ctx, &a.module_id).await?;
            if a.lectures.is_empty() || a.lectures.len() > MAX_LECTURES {
                return Err(Error::Invalid(format!("Add between 1 and {MAX_LECTURES} at once.")));
            }
            let items = a
                .lectures
                .iter()
                .map(|l| {
                    let f = lecture_fields(l, &t)?;
                    let when = f.day.map(|d| day_name(d, ctx.today)).or(f.week.map(|w| format!("Week {w}"))).unwrap_or_else(|| "No date".into());
                    Ok(Item::new(&capital(&f.kind), format!("{} · {when}", f.title)))
                })
                .collect::<Result<Vec<_>>>()?;
            Ok(Preview { title: format!("Add {} to {}", if items.len() == 1 { "1 session".into() } else { format!("{} sessions", items.len()) }, module_label(&m)), items })
        }
        "uni_add_timetable" => {
            let tt: Timetable = args(raw)?;
            let (m, t) = module_and_term(ctx, &tt.module_id).await?;
            let s = schedule_of(&tt, &t)?;
            let days: Vec<&str> = s.weekdays.iter().map(|d| ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][*d as usize]).collect();
            let mut items = vec![Item::new("Each week", format!("{} on {}", capital(if s.title.is_empty() { &s.kind } else { &s.title }), days.join(" and "))), Item::new("Weeks", format!("{} to {}", s.from_week, s.to_week))];
            if !s.skip_weeks.is_empty() {
                items.push(Item::new("Skipping", s.skip_weeks.iter().map(|w| format!("week {w}")).collect::<Vec<_>>().join(", ")));
            }
            let count = (s.from_week..=s.to_week).filter(|w| !s.skip_weeks.contains(w)).count() * s.weekdays.len();
            Ok(Preview { title: format!("Add {count} sessions to {}", module_label(&m)), items })
        }
        _ => Err(unknown(tool)),
    }
}

async fn apply_add(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    match tool {
        "uni_add_module" => {
            let (fields, _) = module_fields(ctx, args(raw)?).await?;
            let card = service::add_module(ctx.db, fields, ctx.today).await?;
            Ok(json!({ "module_id": card.module.id, "name": card.module.name }))
        }
        "uni_add_lectures" => {
            let a: AddLectures = args(raw)?;
            let (_, t) = module_and_term(ctx, &a.module_id).await?;
            let mut added = Vec::new();
            for l in &a.lectures {
                added.push(service::add_lecture(ctx.db, &a.module_id, lecture_fields(l, &t)?).await?.id);
            }
            Ok(json!({ "added": added.len() }))
        }
        "uni_add_timetable" => {
            let tt: Timetable = args(raw)?;
            let (_, t) = module_and_term(ctx, &tt.module_id).await?;
            let added = service::add_schedule(ctx.db, &tt.module_id, schedule_of(&tt, &t)?).await?;
            Ok(json!({ "added": added.len() }))
        }
        _ => Err(unknown(tool)),
    }
}

fn hit(l: &LectureHit) -> Value {
    json!({ "id": l.lecture.id, "module": format!("{} {}", l.module_code, l.module_name).trim(), "title": l.lecture.title, "kind": l.lecture.kind, "day": l.lecture.day, "days": l.days })
}

#[derive(Deserialize, Default)]
struct A {
    id: Option<String>,
    lecture_id: Option<String>,
    stage: Option<String>,
    done: Option<bool>,
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    match tool {
        "uni_overview" => {
            let s = service::summary(ctx.db, ctx.today).await?;
            let term = s.terms.iter().find(|t| Some(&t.term.id) == s.current.as_ref());
            Ok(json!({
                "term": term.map(|t| json!({ "id": t.term.id, "name": t.term.name, "week": t.week, "weeks": t.term.weeks, "starts_on": t.term.starts_on, "ends_on": t.ends_on })),
                "other_terms": s.terms.iter().filter(|t| Some(&t.term.id) != s.current.as_ref()).map(|t| json!({ "id": t.term.id, "name": t.term.name, "starts_on": t.term.starts_on })).collect::<Vec<_>>(),
                "modules": s.modules.iter().map(|m| json!({
                    "id": m.module.id, "code": m.module.code, "name": m.module.name, "lectures": m.lectures, "caught_up": m.caught_up,
                    "behind": m.behind, "shaky": m.shaky, "percent": m.percent.map(f64::round),
                    "next": m.next.as_ref().map(|l| json!({ "title": l.title, "day": l.day })),
                })).collect::<Vec<_>>(),
                "behind": s.behind.iter().map(hit).collect::<Vec<_>>(),
                "coming_up": s.upcoming.iter().map(hit).collect::<Vec<_>>(),
            }))
        }
        "uni_module" => {
            let d = service::get_module(ctx.db, a.id.as_deref().unwrap_or_default(), ctx.today).await?;
            Ok(json!({
                "module": format!("{} {}", d.card.module.code, d.card.module.name).trim(),
                "lectures": d.lectures.iter().map(|l| json!({
                    "id": l.id, "title": l.title, "kind": l.kind, "week": l.week, "day": l.day, "topics": l.topics,
                    "attended": l.attended_on.is_some(), "caught_up": l.caught_up_on.is_some(), "reviewed": l.reviewed_on.is_some(),
                    "confidence": l.confidence.map(|c| ["shaky", "okay", "solid"].get((c - 1).max(0) as usize).copied()),
                })).collect::<Vec<_>>(),
            }))
        }
        _ => Err(unknown(tool)),
    }
}

const STAGE_NAMES: [(&str, &str); 3] = [("attended", "Attended"), ("caught_up", "Caught up"), ("reviewed", "Reviewed")];

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    if tool.starts_with("uni_add_") {
        return preview_add(ctx, tool, raw).await;
    }
    let a: A = args(raw)?;
    match tool {
        "uni_mark_lecture" => {
            let l = lecture::Entity::find_by_id(a.lecture_id.as_deref().unwrap_or_default())
                .filter(lecture::Column::DeletedAt.is_null())
                .one(ctx.db)
                .await?
                .ok_or(Error::NotFound("Lecture"))?;
            let m = module::Entity::find_by_id(l.module_id.as_str()).one(ctx.db).await?.ok_or(Error::NotFound("Module"))?;
            let stage = a.stage.as_deref().unwrap_or_default();
            let (_, name) = STAGE_NAMES.iter().find(|(id, _)| *id == stage).ok_or_else(|| Error::Invalid(format!("Stage is one of: {}.", STAGES.join(", "))))?;
            let was = match stage {
                "attended" => l.attended_on.is_some(),
                "caught_up" => l.caught_up_on.is_some(),
                _ => l.reviewed_on.is_some(),
            };
            let done = a.done.unwrap_or(true);
            let yes_no = |b: bool| if b { "Yes" } else { "No" };
            Ok(Preview {
                title: format!("Mark \"{}\" ({})", l.title, format!("{} {}", m.code, m.name).trim()),
                items: vec![Item::change(name, yes_no(was), yes_no(done))],
            })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    if tool.starts_with("uni_add_") {
        return apply_add(ctx, tool, raw).await;
    }
    let a: A = args(raw)?;
    match tool {
        "uni_mark_lecture" => {
            let l = service::set_stage(ctx.db, a.lecture_id.as_deref().unwrap_or_default(), a.stage.as_deref().unwrap_or_default(), a.done.unwrap_or(true), ctx.today).await?;
            Ok(json!({ "lecture": l.title, "attended": l.attended_on.is_some(), "caught_up": l.caught_up_on.is_some(), "reviewed": l.reviewed_on.is_some() }))
        }
        _ => Err(unknown(tool)),
    }
}
