//! Goals: see progress; add a goal, check in on one, add or tick milestones,
//! or change a goal's status.

use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, date, day_name, nothing, object, unknown};
use crate::error::{Error, Result};
use crate::features::goals::service::{self, AREAS, KINDS, STATUSES};
use crate::features::goals::types::{GoalFields, GoalView};

pub fn specs() -> Vec<Spec> {
    vec![
        Spec {
            area: "goals",
            name: "goals_list",
            description: "Every goal with its progress: id, title, area, kind, status, current and target numbers, percent, whether it's on pace, and days left.",
            parameters: nothing(),
            change: false,
        },
        Spec {
            area: "goals",
            name: "goals_get",
            description: "One goal in full, by id: its why, obstacle and plan, recent check-ins and milestones (with ids).",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: false,
        },
        Spec {
            area: "goals",
            name: "goals_add",
            description: "Proposes a new goal. Kind \"target\" is a number to reach (give start_value and target_value, and unit); \"milestones\" is steps to tick off; \"once\" is one thing to do.",
            parameters: object(
                json!({
                    "title": { "type": "string" },
                    "area": { "type": "string", "enum": AREAS },
                    "kind": { "type": "string", "enum": KINDS },
                    "start_value": { "type": "number" },
                    "target_value": { "type": "number" },
                    "unit": { "type": "string", "description": "e.g. km, £, books" },
                    "measure": { "type": "string", "enum": ["total", "latest"], "description": "total: check-ins add up; latest: the latest check-in is where you are (like a weight)." },
                    "due_date": { "type": "string", "description": "YYYY-MM-DD" },
                    "why": { "type": "string" },
                }),
                &["title", "area", "kind"],
            ),
            change: true,
        },
        Spec {
            area: "goals",
            name: "goals_check_in",
            description: "Proposes a check-in on a number goal (kind target): the value for a day, and a note.",
            parameters: object(json!({ "id": { "type": "string" }, "value": { "type": "number" }, "day": { "type": "string", "description": "YYYY-MM-DD; today if left out" }, "note": { "type": "string" } }), &["id", "value"]),
            change: true,
        },
        Spec {
            area: "goals",
            name: "goals_add_milestone",
            description: "Proposes adding a milestone to a goal.",
            parameters: object(json!({ "id": { "type": "string", "description": "The goal's id" }, "title": { "type": "string" }, "due_date": { "type": "string" } }), &["id", "title"]),
            change: true,
        },
        Spec {
            area: "goals",
            name: "goals_tick_milestone",
            description: "Proposes ticking a milestone done (or not), by the milestone's id from goals_get.",
            parameters: object(json!({ "milestone_id": { "type": "string" }, "done": { "type": "boolean" } }), &["milestone_id", "done"]),
            change: true,
        },
        Spec {
            area: "goals",
            name: "goals_set_status",
            description: "Proposes changing a goal's status.",
            parameters: object(json!({ "id": { "type": "string" }, "status": { "type": "string", "enum": STATUSES } }), &["id", "status"]),
            change: true,
        },
    ]
}

fn brief(g: &GoalView) -> Value {
    json!({
        "id": g.goal.id, "title": g.goal.title, "area": g.goal.area, "kind": g.goal.kind, "status": g.goal.status,
        "progress": service::progress_text(g), "current": g.current, "target": g.target, "unit": g.goal.unit,
        "percent": g.percent.round(), "pace": g.pace.map(|p| p.as_str()), "due_date": g.goal.due_date, "days_left": g.days_left,
        "reached": g.reached, "tracks_itself": g.goal.source != "manual",
    })
}

#[derive(Deserialize, Default)]
struct A {
    id: Option<String>,
    milestone_id: Option<String>,
    title: Option<String>,
    area: Option<String>,
    kind: Option<String>,
    start_value: Option<f64>,
    target_value: Option<f64>,
    unit: Option<String>,
    measure: Option<String>,
    due_date: Option<String>,
    why: Option<String>,
    value: Option<f64>,
    day: Option<String>,
    note: Option<String>,
    done: Option<bool>,
    status: Option<String>,
}

impl A {
    fn id(&self) -> &str {
        self.id.as_deref().unwrap_or_default()
    }
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    match tool {
        "goals_list" => Ok(json!(service::list(ctx.db, ctx.today).await?.iter().map(brief).collect::<Vec<_>>())),
        "goals_get" => {
            let a: A = args(raw)?;
            let d = service::get(ctx.db, a.id(), ctx.today).await?;
            let mut out = brief(&d.goal);
            out["why"] = json!(d.goal.goal.why);
            out["obstacle"] = json!(d.goal.goal.obstacle);
            out["plan"] = json!(d.goal.goal.plan);
            out["recent_check_ins"] = json!(d.logs.iter().take(10).map(|l| json!({ "day": l.day, "value": l.value, "note": l.note })).collect::<Vec<_>>());
            out["milestones"] = json!(d.milestones.iter().map(|m| json!({ "id": m.id, "title": m.title, "due_date": m.due_date, "done": m.done_on.is_some() })).collect::<Vec<_>>());
            Ok(out)
        }
        _ => Err(unknown(tool)),
    }
}

fn new_goal(a: &A, ctx: &Ctx<'_>) -> Result<GoalFields> {
    Ok(GoalFields {
        title: a.title.clone().unwrap_or_default(),
        icon: String::new(),
        area: a.area.clone().unwrap_or_else(|| "personal".into()),
        kind: a.kind.clone().unwrap_or_else(|| "once".into()),
        source: "manual".into(),
        source_id: String::new(),
        start_value: a.start_value.unwrap_or(0.0),
        target_value: a.target_value.unwrap_or(0.0),
        unit: a.unit.clone().unwrap_or_default(),
        measure: a.measure.clone().unwrap_or_else(|| "total".into()),
        start_date: ctx.today,
        due_date: a.due_date.as_deref().map(date).transpose()?,
        why: a.why.clone().unwrap_or_default(),
        obstacle: String::new(),
        plan: String::new(),
    })
}

fn number(value: f64, unit: &str) -> String {
    service::amount(value, unit)
}

async fn goal(ctx: &Ctx<'_>, id: &str) -> Result<GoalView> {
    Ok(service::get(ctx.db, id, ctx.today).await?.goal)
}

/// The milestone and the goal it's on.
async fn milestone(ctx: &Ctx<'_>, id: &str) -> Result<(String, GoalView)> {
    for g in service::list(ctx.db, ctx.today).await? {
        let detail = service::get(ctx.db, &g.goal.id, ctx.today).await?;
        if let Some(m) = detail.milestones.iter().find(|m| m.id == id) {
            return Ok((m.title.clone(), detail.goal));
        }
    }
    Err(Error::NotFound("Milestone"))
}

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    let a: A = args(raw)?;
    match tool {
        "goals_add" => {
            let mut fields = new_goal(&a, ctx)?;
            let title = service::clean(&mut fields)?;
            let mut items = vec![Item::new("Goal", &title), Item::new("Area", &fields.area)];
            match fields.kind.as_str() {
                "target" => items.push(Item::new("Target", format!("{} → {}", number(fields.start_value, &fields.unit), number(fields.target_value, &fields.unit)))),
                "milestones" => items.push(Item::new("Kind", "Milestones to tick off")),
                _ => items.push(Item::new("Kind", "One thing to do")),
            }
            if let Some(due) = fields.due_date {
                items.push(Item::new("By", day_name(due, ctx.today)));
            }
            if !fields.why.is_empty() {
                items.push(Item::new("Why", &fields.why));
            }
            Ok(Preview { title: "Add a goal".into(), items })
        }
        "goals_check_in" => {
            let g = goal(ctx, a.id()).await?;
            if g.goal.kind != "target" || g.goal.source != "manual" {
                return Err(Error::Invalid("That goal keeps track by itself or has no number.".into()));
            }
            let day = a.day.as_deref().map(date).transpose()?.unwrap_or(ctx.today);
            if day > ctx.today {
                return Err(Error::Invalid("Check in for today or a day gone by.".into()));
            }
            let value = a.value.ok_or_else(|| Error::Invalid("Give the value.".into()))?;
            let mut items = vec![Item::new("Value", number(value, &g.goal.unit)), Item::new("Day", day_name(day, ctx.today))];
            if let Some(note) = a.note.as_deref().filter(|n| !n.trim().is_empty()) {
                items.push(Item::new("Note", note.trim()));
            }
            Ok(Preview { title: format!("Check in on \"{}\"", g.goal.title), items })
        }
        "goals_add_milestone" => {
            let g = goal(ctx, a.id()).await?;
            let title = a.title.as_deref().map(str::trim).filter(|t| !t.is_empty()).ok_or_else(|| Error::Invalid("Give the milestone a title.".into()))?;
            let mut items = vec![Item::new("Milestone", title)];
            if let Some(due) = a.due_date.as_deref().map(date).transpose()? {
                items.push(Item::new("By", day_name(due, ctx.today)));
            }
            Ok(Preview { title: format!("Add a milestone to \"{}\"", g.goal.title), items })
        }
        "goals_tick_milestone" => {
            let (title, g) = milestone(ctx, a.milestone_id.as_deref().unwrap_or_default()).await?;
            let done = a.done.unwrap_or(true);
            Ok(Preview {
                title: format!("{} a milestone of \"{}\"", if done { "Tick" } else { "Untick" }, g.goal.title),
                items: vec![Item::change(&title, if done { "To do" } else { "Done" }, if done { "Done" } else { "To do" })],
            })
        }
        "goals_set_status" => {
            let g = goal(ctx, a.id()).await?;
            let status = a.status.clone().unwrap_or_default();
            if !STATUSES.contains(&status.as_str()) {
                return Err(Error::Invalid(format!("Status is one of: {}.", STATUSES.join(", "))));
            }
            Ok(Preview { title: format!("Change \"{}\"", g.goal.title), items: vec![Item::change("Status", &g.goal.status, status)] })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    match tool {
        "goals_add" => Ok(brief(&service::create(ctx.db, new_goal(&a, ctx)?, ctx.today).await?)),
        "goals_check_in" => {
            let day = a.day.as_deref().map(date).transpose()?.unwrap_or(ctx.today);
            let g = service::add_log(ctx.db, a.id(), day, a.value.unwrap_or_default(), a.note.as_deref().unwrap_or_default(), ctx.today).await?;
            Ok(brief(&g))
        }
        "goals_add_milestone" => {
            let due = a.due_date.as_deref().map(date).transpose()?;
            let m = service::add_milestone(ctx.db, a.id(), a.title.as_deref().unwrap_or_default().trim(), due).await?;
            Ok(json!({ "milestone_id": m.id, "title": m.title }))
        }
        "goals_tick_milestone" => {
            let m = service::tick_milestone(ctx.db, a.milestone_id.as_deref().unwrap_or_default(), a.done.unwrap_or(true), ctx.today).await?;
            Ok(json!({ "milestone": m.title, "done": m.done_on.is_some() }))
        }
        "goals_set_status" => Ok(brief(&service::set_status(ctx.db, a.id(), a.status.as_deref().unwrap_or_default(), ctx.today).await?)),
        _ => Err(unknown(tool)),
    }
}
