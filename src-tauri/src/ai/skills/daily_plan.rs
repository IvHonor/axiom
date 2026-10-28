//! Daily Plan: read days and weeks; add tasks (placed on the timeline or
//! not), change, schedule, finish or delete them; and set up routines, the
//! blocks that repeat on chosen weekdays. Blocks reach the person's own
//! calendar (Google, Outlook, iCloud) when they've chosen one to publish
//! the plan into, so that's how Lemma "adds an event".

use chrono::Days;
use sea_orm::prelude::Date;
use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, clock, date, day_name, hhmm, lines, nothing, object, unknown};
use crate::error::{Error, Result};
use crate::features::daily_plan::calendars;
use crate::features::daily_plan::entities::{block, event, routine, task};
use crate::features::daily_plan::service::{self, COLORS};
use crate::features::daily_plan::types::{RoutineFields, TaskFields};

const WEEKDAYS: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/// Most items in one proposal: a day's worth.
const MAX_ITEMS: usize = 20;
/// A block without a length gets this many minutes.
const DEFAULT_MINUTES: i32 = 30;

pub fn specs() -> Vec<Spec> {
    let item = json!({
        "type": "object",
        "properties": {
            "title": { "type": "string" },
            "day": { "type": "string", "description": "YYYY-MM-DD; today if left out." },
            "start": { "type": "string", "description": "HH:MM (24-hour) to place it on the day's timeline; left out, it's just on the day's list." },
            "minutes": { "type": "integer", "description": "How long it takes." },
            "notes": { "type": "string" },
            "due": { "type": "string", "description": "YYYY-MM-DD it has to be done by." },
            "time_only": { "type": "boolean", "description": "A block of time with no task, e.g. lunch or a commute. Needs start." },
        },
        "required": ["title"],
    });
    let routine = json!({
        "title": { "type": "string" },
        "start": { "type": "string", "description": "HH:MM (24-hour)" },
        "minutes": { "type": "integer", "description": "How long it lasts." },
        "days": { "type": "array", "items": { "type": "string", "enum": WEEKDAYS }, "description": "The weekdays it's on." },
        "color": { "type": "string", "enum": COLORS },
    });
    let mut routine_changes = routine.clone();
    routine_changes["id"] = json!({ "type": "string" });
    vec![
        Spec {
            area: "daily_plan",
            name: "plan_day",
            description: "One day's plan: tasks (with ids, done or not, estimates, deadlines, top priorities), time blocks on the timeline, calendar events and the working hours. For today, also unfinished tasks from earlier days, the inbox (tasks without a day) and deadlines coming up.",
            parameters: object(json!({ "day": { "type": "string", "description": "YYYY-MM-DD; today if left out." } }), &[]),
            change: false,
        },
        Spec {
            area: "daily_plan",
            name: "plan_week",
            description: "Several days at a glance (up to 14): each day's tasks, blocks and calendar events.",
            parameters: object(json!({ "from": { "type": "string", "description": "YYYY-MM-DD; today if left out." }, "days": { "type": "integer", "minimum": 1, "maximum": 14 } }), &[]),
            change: false,
        },
        Spec {
            area: "daily_plan",
            name: "plan_add",
            description: "Proposes adding tasks (or blocks of time) to the plan, all at once: use it to plan a day. Each can be placed at a time on the timeline. Check the day first so nothing overlaps calendar events.",
            parameters: object(json!({ "items": { "type": "array", "items": item, "maxItems": MAX_ITEMS } }), &["items"]),
            change: true,
        },
        Spec {
            area: "daily_plan",
            name: "plan_update_task",
            description: "Proposes changing a task by id: its title, notes, estimate, day (\"inbox\" for none), deadline (\"none\" to clear), or marking it done or not done. Give only what changes.",
            parameters: object(
                json!({
                    "id": { "type": "string" },
                    "title": { "type": "string" },
                    "notes": { "type": "string" },
                    "minutes": { "type": "integer" },
                    "day": { "type": "string" },
                    "due": { "type": "string" },
                    "done": { "type": "boolean" },
                }),
                &["id"],
            ),
            change: true,
        },
        Spec {
            area: "daily_plan",
            name: "plan_schedule",
            description: "Proposes placing an existing task (by id) on the timeline at a time, on its day or another.",
            parameters: object(
                json!({ "id": { "type": "string" }, "start": { "type": "string", "description": "HH:MM" }, "minutes": { "type": "integer" }, "day": { "type": "string", "description": "YYYY-MM-DD" } }),
                &["id", "start"],
            ),
            change: true,
        },
        Spec {
            area: "daily_plan",
            name: "plan_delete_task",
            description: "Proposes deleting a task, by id.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: true,
        },
        Spec {
            area: "daily_plan",
            name: "plan_routines",
            description: "The routines: blocks of time that repeat on chosen weekdays (e.g. gym on Mon, Wed, Fri at 07:00), with ids.",
            parameters: nothing(),
            change: false,
        },
        Spec {
            area: "daily_plan",
            name: "plan_add_routine",
            description: "Proposes a routine: a block that repeats on the chosen weekdays from now on.",
            parameters: object(routine.clone(), &["title", "start", "minutes", "days"]),
            change: true,
        },
        Spec {
            area: "daily_plan",
            name: "plan_update_routine",
            description: "Proposes changing a routine by id: its name, time, length, weekdays or colour. Give only what changes. Days already laid out from today on follow it.",
            parameters: object(routine_changes, &["id"]),
            change: true,
        },
        Spec {
            area: "daily_plan",
            name: "plan_delete_routine",
            description: "Proposes stopping a routine, by id. Its blocks from today on go; past days keep theirs.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: true,
        },
    ]
}

// ---------- Looking ----------

#[derive(Deserialize, Default)]
struct DayArgs {
    day: Option<String>,
    from: Option<String>,
    days: Option<u64>,
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: DayArgs = args(raw)?;
    match tool {
        "plan_day" => {
            let day = a.day.as_deref().map(date).transpose()?.unwrap_or(ctx.today);
            let plan = service::get_day(ctx.db, day, ctx.today).await?;
            let mut out = json!({
                "day": day,
                "working_hours": format!("{}-{}", hhmm(plan.settings.day_start_minute), hhmm(plan.settings.day_end_minute)),
                "tasks": plan.tasks.iter().map(brief_task).collect::<Vec<_>>(),
                "blocks": plan.blocks.iter().map(brief_block).collect::<Vec<_>>(),
                "events": plan.events.iter().map(brief_event).collect::<Vec<_>>(),
            });
            // Blocks go out to this calendar too, when there is one.
            let publishing = calendars::list_calendars(ctx.db).await?.into_iter().find(|c| c.publish);
            out["blocks_publish_to"] = json!(publishing.map(|c| c.name));
            if day == ctx.today {
                out["now"] = json!(hhmm(ctx.now_minute));
                out["unfinished_from_earlier"] = json!(plan.earlier.iter().map(brief_task).collect::<Vec<_>>());
                out["inbox"] = json!(plan.inbox.iter().map(brief_task).collect::<Vec<_>>());
                out["due_soon"] = json!(plan.due_soon.iter().map(brief_task).collect::<Vec<_>>());
            }
            Ok(out)
        }
        "plan_week" => {
            let from = a.from.as_deref().map(date).transpose()?.unwrap_or(ctx.today);
            let to = from + Days::new(a.days.unwrap_or(7).clamp(1, 14) - 1);
            let range = service::range(ctx.db, from, to, ctx.today).await?;
            Ok(json!({
                "days": range.days.iter().map(|d| json!({
                    "day": d.day,
                    "tasks": d.tasks.iter().map(brief_task).collect::<Vec<_>>(),
                    "blocks": d.blocks.iter().map(brief_block).collect::<Vec<_>>(),
                    "events": d.events.iter().map(brief_event).collect::<Vec<_>>(),
                    "due": d.due.iter().map(brief_task).collect::<Vec<_>>(),
                })).collect::<Vec<_>>(),
                "inbox": range.inbox.iter().map(brief_task).collect::<Vec<_>>(),
            }))
        }
        "plan_routines" => Ok(json!(service::list_routines(ctx.db).await?.iter().map(brief_routine).collect::<Vec<_>>())),
        _ => Err(unknown(tool)),
    }
}

fn brief_routine(r: &routine::Model) -> Value {
    json!({ "id": r.id, "title": r.title, "start": hhmm(r.start_minute), "minutes": r.duration_minutes, "days": days_of(r.weekdays), "color": r.color })
}

/// Weekday bits (Monday is 1, Sunday 64) as "mon", "tue"…
fn days_of(bits: i16) -> Vec<&'static str> {
    WEEKDAYS.iter().enumerate().filter(|(i, _)| bits & (1 << i) != 0).map(|(_, d)| *d).collect()
}

fn days_text(bits: i16) -> String {
    match bits & 0x7f {
        0x7f => "Every day".into(),
        0x1f => "Weekdays".into(),
        0x60 => "Weekends".into(),
        _ => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].iter().enumerate().filter(|(i, _)| bits & (1 << i) != 0).map(|(_, d)| *d).collect::<Vec<_>>().join(", "),
    }
}

/// Weekday names the AI sent, as bits.
fn bits_of(days: &[String]) -> Result<i16> {
    days.iter().try_fold(0, |bits, d| {
        let i = WEEKDAYS.iter().position(|w| d.trim().to_lowercase().starts_with(w)).ok_or_else(|| Error::Invalid(format!("Name days as {}, not {d}.", WEEKDAYS.join(", "))))?;
        Ok(bits | 1 << i)
    })
}

fn brief_task(t: &task::Model) -> Value {
    json!({
        "id": t.id, "title": t.title, "day": t.day, "done": t.done_at.is_some(), "minutes": t.estimate_minutes,
        "due": t.due_date, "top_priority": t.focus_rank, "notes": t.notes,
    })
}

fn brief_block(b: &block::Model) -> Value {
    json!({ "start": hhmm(b.start_minute), "end": hhmm(b.start_minute + b.duration_minutes), "title": b.title, "task_id": b.task_id })
}

fn brief_event(e: &event::Model) -> Value {
    if e.all_day {
        json!({ "title": e.title, "all_day": true })
    } else {
        json!({ "title": e.title, "start": hhmm(e.start_minute), "end": hhmm(e.start_minute + e.duration_minutes), "busy": e.busy })
    }
}

// ---------- Changing ----------

#[derive(Deserialize)]
struct Add {
    items: Vec<NewItem>,
}

#[derive(Deserialize)]
struct NewItem {
    title: String,
    day: Option<String>,
    start: Option<String>,
    minutes: Option<i32>,
    #[serde(default)]
    notes: String,
    due: Option<String>,
    #[serde(default)]
    time_only: bool,
}

/// A new item, checked: its day, time span and deadline.
struct Checked<'a> {
    item: &'a NewItem,
    day: Date,
    span: Option<(i32, i32)>,
    due: Option<Date>,
}

fn check_item<'a>(item: &'a NewItem, today: Date) -> Result<Checked<'a>> {
    if item.title.trim().is_empty() {
        return Err(Error::Invalid("Every item needs a title.".into()));
    }
    let day = item.day.as_deref().map(date).transpose()?.unwrap_or(today);
    let span = match &item.start {
        Some(start) => {
            let (start, minutes) = (clock(start)?, item.minutes.unwrap_or(DEFAULT_MINUTES));
            service::check_span(start, minutes)?;
            Some((start, minutes))
        }
        None if item.time_only => return Err(Error::Invalid(format!("\"{}\" is a block of time, so it needs a start.", item.title))),
        None => None,
    };
    Ok(Checked { item, day, span, due: item.due.as_deref().map(date).transpose()? })
}

#[derive(Deserialize, Default)]
struct Change {
    id: String,
    title: Option<String>,
    notes: Option<String>,
    minutes: Option<i32>,
    day: Option<String>,
    due: Option<String>,
    done: Option<bool>,
    start: Option<String>,
}

/// "inbox" (or "none") means no day; otherwise a date.
fn day_or_none(text: &str) -> Result<Option<Date>> {
    match text.trim().to_lowercase().as_str() {
        "inbox" | "none" | "" => Ok(None),
        _ => date(text).map(Some),
    }
}

fn when(day: Option<Date>, today: Date) -> String {
    day.map_or_else(|| "Inbox".into(), |d| day_name(d, today))
}

fn span_text(start: i32, minutes: i32) -> String {
    format!("{}–{}", hhmm(start), hhmm(start + minutes))
}

// ---------- Routines ----------

#[derive(Deserialize, Default)]
struct RoutineChange {
    id: Option<String>,
    title: Option<String>,
    start: Option<String>,
    minutes: Option<i32>,
    days: Option<Vec<String>>,
    color: Option<String>,
}

impl RoutineChange {
    fn onto(self, base: RoutineFields) -> Result<RoutineFields> {
        Ok(RoutineFields {
            title: self.title.map_or(base.title, |t| t.trim().to_owned()),
            start_minute: self.start.as_deref().map(clock).transpose()?.unwrap_or(base.start_minute),
            duration_minutes: self.minutes.unwrap_or(base.duration_minutes),
            color: self.color.unwrap_or(base.color),
            weekdays: self.days.as_deref().map(bits_of).transpose()?.unwrap_or(base.weekdays),
        })
    }
}

fn routine_fields(r: &routine::Model) -> RoutineFields {
    RoutineFields { title: r.title.clone(), start_minute: r.start_minute, duration_minutes: r.duration_minutes, color: r.color.clone(), weekdays: r.weekdays }
}

fn routine_items(after: &RoutineFields, before: Option<&RoutineFields>) -> Vec<Item> {
    let rows = |r: &RoutineFields| vec![("Name", r.title.clone()), ("When", span_text(r.start_minute, r.duration_minutes)), ("Days", days_text(r.weekdays))];
    lines(rows(after), before.map(rows))
}

async fn find_routine(ctx: &Ctx<'_>, id: &str) -> Result<routine::Model> {
    service::list_routines(ctx.db).await?.into_iter().find(|r| r.id == id).ok_or(Error::NotFound("Routine"))
}

/// A routine checked as the service will check it, so the card can't promise what saving refuses.
fn check_routine(f: &RoutineFields) -> Result<()> {
    if f.title.is_empty() {
        return Err(Error::Invalid("Give the routine a name.".into()));
    }
    if f.weekdays & 0x7f == 0 {
        return Err(Error::Invalid("Pick at least one day for the routine.".into()));
    }
    service::check_span(f.start_minute, f.duration_minutes)
}

fn new_routine() -> RoutineFields {
    RoutineFields { title: String::new(), start_minute: 0, duration_minutes: DEFAULT_MINUTES, color: "purple".into(), weekdays: 0 }
}

async fn preview_routine(ctx: &Ctx<'_>, tool: &str, change: RoutineChange) -> Result<Preview> {
    match tool {
        "plan_add_routine" => {
            if change.start.is_none() {
                return Err(Error::Invalid("Give the routine a start time, HH:MM.".into()));
            }
            let fields = change.onto(new_routine())?;
            check_routine(&fields)?;
            Ok(Preview { title: format!("Add the routine \"{}\"", fields.title), items: routine_items(&fields, None) })
        }
        "plan_update_routine" => {
            let current = find_routine(ctx, change.id.as_deref().unwrap_or_default()).await?;
            let before = routine_fields(&current);
            let after = change.onto(routine_fields(&current))?;
            check_routine(&after)?;
            let items = routine_items(&after, Some(&before));
            if items.is_empty() {
                return Err(Error::Invalid("That changes nothing.".into()));
            }
            Ok(Preview { title: format!("Change the routine \"{}\"", current.title), items })
        }
        "plan_delete_routine" => {
            let current = find_routine(ctx, change.id.as_deref().unwrap_or_default()).await?;
            let f = routine_fields(&current);
            Ok(Preview { title: format!("Stop the routine \"{}\"", current.title), items: vec![Item::gone("Routine", format!("{} · {}", span_text(f.start_minute, f.duration_minutes), days_text(f.weekdays)))] })
        }
        _ => Err(unknown(tool)),
    }
}

async fn apply_routine(ctx: &Ctx<'_>, tool: &str, change: RoutineChange) -> Result<Value> {
    match tool {
        "plan_add_routine" => Ok(brief_routine(&service::create_routine(ctx.db, change.onto(new_routine())?).await?)),
        "plan_update_routine" => {
            let id = change.id.clone().unwrap_or_default();
            let current = find_routine(ctx, &id).await?;
            Ok(brief_routine(&service::update_routine(ctx.db, &id, change.onto(routine_fields(&current))?, ctx.today).await?))
        }
        "plan_delete_routine" => {
            service::delete_routine(ctx.db, change.id.as_deref().unwrap_or_default(), ctx.today).await?;
            Ok(json!({ "stopped": true }))
        }
        _ => Err(unknown(tool)),
    }
}

// ---------- Tasks and blocks ----------

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    if tool.ends_with("_routine") {
        return preview_routine(ctx, tool, args(raw)?).await;
    }
    match tool {
        "plan_add" => {
            let add: Add = args(raw)?;
            if add.items.is_empty() || add.items.len() > MAX_ITEMS {
                return Err(Error::Invalid(format!("Add between 1 and {MAX_ITEMS} items at once.")));
            }
            let checked = add.items.iter().map(|i| check_item(i, ctx.today)).collect::<Result<Vec<_>>>()?;
            let items = checked
                .iter()
                .map(|c| {
                    let mut parts = vec![when(Some(c.day), ctx.today)];
                    match (c.span, c.item.minutes) {
                        (Some((start, minutes)), _) => parts.push(span_text(start, minutes)),
                        (None, Some(minutes)) => parts.push(format!("{minutes} min")),
                        (None, None) => {}
                    }
                    if let Some(due) = c.due {
                        parts.push(format!("due {}", day_name(due, ctx.today)));
                    }
                    Item::new(if c.item.time_only { "Block" } else { "Task" }, format!("{} · {}", c.item.title.trim(), parts.join(" · ")))
                })
                .collect();
            let title = match checked.len() {
                1 if checked[0].item.time_only => "Add a block to the plan".to_owned(),
                1 => "Add a task to the plan".to_owned(),
                n => format!("Add {n} items to the plan"),
            };
            Ok(Preview { title, items })
        }
        "plan_update_task" => {
            let change: Change = args(raw)?;
            let current = service::find_task(ctx.db, &change.id).await?;
            let mut items = Vec::new();
            if let Some(title) = change.title.as_deref().map(str::trim).filter(|t| *t != current.title) {
                items.push(Item::change("Title", &current.title, title));
            }
            if let Some(notes) = change.notes.as_deref().filter(|n| *n != current.notes) {
                items.push(Item { label: "Notes".into(), before: (!current.notes.is_empty()).then(|| current.notes.clone()), after: Some(notes.into()) });
            }
            if let Some(minutes) = change.minutes.filter(|m| Some(*m) != current.estimate_minutes) {
                items.push(Item { label: "Estimate".into(), before: current.estimate_minutes.map(|m| format!("{m} min")), after: Some(format!("{minutes} min")) });
            }
            if let Some(day) = change.day.as_deref().map(day_or_none).transpose()?.filter(|d| *d != current.day) {
                items.push(Item::change("Day", when(current.day, ctx.today), when(day, ctx.today)));
            }
            if let Some(due) = change.due.as_deref().map(day_or_none).transpose()?.filter(|d| *d != current.due_date) {
                let show = |d: Option<Date>| d.map(|d| day_name(d, ctx.today));
                items.push(Item { label: "Deadline".into(), before: show(current.due_date), after: show(due) });
            }
            if let Some(done) = change.done.filter(|d| *d != current.done_at.is_some()) {
                items.push(Item::change("Status", if done { "To do" } else { "Done" }, if done { "Done" } else { "To do" }));
            }
            if items.is_empty() {
                return Err(Error::Invalid("That changes nothing.".into()));
            }
            Ok(Preview { title: format!("Change \"{}\"", current.title), items })
        }
        "plan_schedule" => {
            let change: Change = args(raw)?;
            let current = service::find_task(ctx.db, &change.id).await?;
            let (day, start, minutes) = schedule_of(&change, &current, ctx.today)?;
            Ok(Preview {
                title: format!("Schedule \"{}\"", current.title),
                items: vec![Item::new("When", format!("{} · {}", day_name(day, ctx.today), span_text(start, minutes)))],
            })
        }
        "plan_delete_task" => {
            let change: Change = args(raw)?;
            let current = service::find_task(ctx.db, &change.id).await?;
            Ok(Preview { title: format!("Delete \"{}\"", current.title), items: vec![Item::gone("Task", format!("{} · {}", current.title, when(current.day, ctx.today)))] })
        }
        _ => Err(unknown(tool)),
    }
}

fn schedule_of(change: &Change, task: &task::Model, today: Date) -> Result<(Date, i32, i32)> {
    let start = clock(change.start.as_deref().ok_or_else(|| Error::Invalid("Give a start time, HH:MM.".into()))?)?;
    let minutes = change.minutes.or(task.estimate_minutes).unwrap_or(DEFAULT_MINUTES);
    service::check_span(start, minutes)?;
    let day = change.day.as_deref().map(date).transpose()?.or(task.day).unwrap_or(today);
    Ok((day, start, minutes))
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    if tool.ends_with("_routine") {
        return apply_routine(ctx, tool, args(raw)?).await;
    }
    match tool {
        "plan_add" => {
            let add: Add = args(raw)?;
            let checked = add.items.iter().map(|i| check_item(i, ctx.today)).collect::<Result<Vec<_>>>()?;
            let mut added = Vec::new();
            for c in checked {
                let title = c.item.title.trim();
                if c.item.time_only {
                    let (start, minutes) = c.span.expect("checked: blocks have a start");
                    service::create_block(ctx.db, c.day, start, minutes, title, None).await?;
                    added.push(json!({ "block": title }));
                    continue;
                }
                let made = service::create_task(ctx.db, title, Some(c.day), c.item.minutes).await?;
                if !c.item.notes.trim().is_empty() {
                    let fields = TaskFields { title: made.title.clone(), notes: c.item.notes.trim().to_owned(), estimate_minutes: made.estimate_minutes };
                    service::update_task(ctx.db, &made.id, fields).await?;
                }
                if c.due.is_some() {
                    service::set_due(ctx.db, &made.id, c.due).await?;
                }
                if let Some((start, minutes)) = c.span {
                    service::create_block(ctx.db, c.day, start, minutes, title, Some(&made.id)).await?;
                }
                added.push(json!({ "task_id": made.id, "title": title }));
            }
            Ok(json!({ "added": added }))
        }
        "plan_update_task" => {
            let change: Change = args(raw)?;
            let current = service::find_task(ctx.db, &change.id).await?;
            if change.title.is_some() || change.notes.is_some() || change.minutes.is_some() {
                let fields = TaskFields {
                    title: change.title.as_deref().map_or(current.title.clone(), |t| t.trim().to_owned()),
                    notes: change.notes.clone().unwrap_or(current.notes.clone()),
                    estimate_minutes: change.minutes.or(current.estimate_minutes),
                };
                service::update_task(ctx.db, &change.id, fields).await?;
            }
            if let Some(day) = change.day.as_deref().map(day_or_none).transpose()?.filter(|d| *d != current.day) {
                service::move_task(ctx.db, &change.id, day, None).await?;
            }
            if let Some(due) = change.due.as_deref().map(day_or_none).transpose()? {
                service::set_due(ctx.db, &change.id, due).await?;
            }
            if let Some(done) = change.done {
                service::set_done(ctx.db, &change.id, done).await?;
            }
            Ok(brief_task(&service::find_task(ctx.db, &change.id).await?))
        }
        "plan_schedule" => {
            let change: Change = args(raw)?;
            let current = service::find_task(ctx.db, &change.id).await?;
            let (day, start, minutes) = schedule_of(&change, &current, ctx.today)?;
            service::create_block(ctx.db, day, start, minutes, &current.title, Some(&current.id)).await?;
            Ok(json!({ "scheduled": current.title, "day": day, "start": hhmm(start) }))
        }
        "plan_delete_task" => {
            let change: Change = args(raw)?;
            service::delete_task(ctx.db, &change.id).await?;
            Ok(json!({ "deleted": true }))
        }
        _ => Err(unknown(tool)),
    }
}
