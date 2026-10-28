//! Project Board: see projects and their cards; add a card, change one, or
//! move it to another column; give cards labels, and keep their checklists.
//! Shared boards keep their roles: a viewer's assistant can look but not
//! change, and only admins can add labels to the board.

use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, capital, date, day_name, lines, nothing, object, unknown};
use crate::error::{Error, Result};
use crate::features::project_board::access::{self, Need};
use crate::features::project_board::service::{self, LABEL_COLORS};
use crate::features::project_board::types::{Board, TaskFields};

/// Most checklist items in one proposal.
const MAX_CHECKLIST: usize = 30;

const PRIORITIES: [&str; 4] = ["None", "Low", "Medium", "High"];

pub fn specs() -> Vec<Spec> {
    let card = json!({
        "title": { "type": "string" },
        "description": { "type": "string" },
        "due_date": { "type": "string", "description": "YYYY-MM-DD, or \"none\" to clear" },
        "priority": { "type": "integer", "minimum": 0, "maximum": 3, "description": "0 none, 1 low, 2 medium, 3 high" },
    });
    let mut add = card.clone();
    add["project_id"] = json!({ "type": "string" });
    add["column"] = json!({ "type": "string", "description": "The column's name or id; the first column if left out." });
    let mut update = card;
    update["id"] = json!({ "type": "string" });
    vec![
        Spec { area: "project_board", name: "board_projects", description: "The projects (boards), with ids.", parameters: nothing(), change: false },
        Spec {
            area: "project_board",
            name: "board_view",
            description: "One project's board: its columns (and which count as done) and its cards with ids, column, priority, dates and descriptions.",
            parameters: object(json!({ "project_id": { "type": "string" } }), &["project_id"]),
            change: false,
        },
        Spec { area: "project_board", name: "board_add_card", description: "Proposes adding a card to a project's board.", parameters: object(add, &["project_id", "title"]), change: true },
        Spec {
            area: "project_board",
            name: "board_update_card",
            description: "Proposes changing a card by id: title, description, due date or priority. Give only what changes.",
            parameters: object(update, &["id"]),
            change: true,
        },
        Spec {
            area: "project_board",
            name: "board_move_card",
            description: "Proposes moving a card to another column, by the column's name or id (e.g. to Done).",
            parameters: object(json!({ "id": { "type": "string" }, "column": { "type": "string" } }), &["id", "column"]),
            change: true,
        },
        Spec {
            area: "project_board",
            name: "board_card",
            description: "One card in full, by id: its description, labels, checklist items (ids, text, done) and sub-tasks.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: false,
        },
        Spec {
            area: "project_board",
            name: "board_add_label",
            description: "Proposes a new label on a project's board (labels belong to a board), e.g. Bug or Urgent.",
            parameters: object(json!({ "project_id": { "type": "string" }, "name": { "type": "string" }, "color": { "type": "string", "enum": LABEL_COLORS } }), &["project_id", "name"]),
            change: true,
        },
        Spec {
            area: "project_board",
            name: "board_set_labels",
            description: "Proposes a card's labels (by card id): the board's label names or ids it should have, replacing the ones it has. An empty list takes them all off.",
            parameters: object(json!({ "id": { "type": "string" }, "labels": { "type": "array", "items": { "type": "string" } } }), &["id", "labels"]),
            change: true,
        },
        Spec {
            area: "project_board",
            name: "board_add_checklist",
            description: "Proposes adding items to the end of a card's checklist, by card id.",
            parameters: object(json!({ "id": { "type": "string" }, "items": { "type": "array", "maxItems": MAX_CHECKLIST, "items": { "type": "string" } } }), &["id", "items"]),
            change: true,
        },
        Spec {
            area: "project_board",
            name: "board_update_checklist",
            description: "Proposes ticking a checklist item (by its id from board_card) done or not, or changing its text.",
            parameters: object(json!({ "item_id": { "type": "string" }, "done": { "type": "boolean" }, "text": { "type": "string" } }), &["item_id"]),
            change: true,
        },
        Spec {
            area: "project_board",
            name: "board_delete_checklist",
            description: "Proposes removing a checklist item, by its id.",
            parameters: object(json!({ "item_id": { "type": "string" } }), &["item_id"]),
            change: true,
        },
    ]
}

#[derive(Deserialize, Default)]
struct A {
    id: Option<String>,
    project_id: Option<String>,
    column: Option<String>,
    title: Option<String>,
    description: Option<String>,
    due_date: Option<String>,
    priority: Option<i16>,
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    match tool {
        "board_projects" => {
            let projects = service::list_projects(ctx.db).await?;
            Ok(json!(projects.iter().map(|p| json!({ "id": p.id, "name": p.name })).collect::<Vec<_>>()))
        }
        "board_view" => {
            let a: A = args(raw)?;
            let board = service::get_board(ctx.db, a.project_id.as_deref().unwrap_or_default()).await?;
            let column = |id: &str| board.columns.iter().find(|c| c.id == id).map(|c| c.name.clone());
            Ok(json!({
                "project": board.project.name,
                "columns": board.columns.iter().map(|c| json!({ "id": c.id, "name": c.name, "counts_as_done": c.is_done })).collect::<Vec<_>>(),
                "labels": board.labels.iter().map(|l| json!({ "id": l.id, "name": l.name, "color": l.color })).collect::<Vec<_>>(),
                "cards": board.tasks.iter().map(|t| json!({
                    "id": t.task.id, "title": t.task.title, "column": column(&t.task.column_id), "labels": label_names(&board, &t.label_ids),
                    "priority": PRIORITIES.get(t.task.priority as usize), "start_date": t.task.start_date, "due_date": t.task.due_date,
                    "description": t.task.description.chars().take(300).collect::<String>(), "sub_task_of": t.parent_title,
                    "checklist": format!("{}/{}", t.checklist_done, t.checklist_total),
                })).collect::<Vec<_>>(),
            }))
        }
        "board_card" => {
            let a: A = args(raw)?;
            let id = a.id.as_deref().unwrap_or_default();
            let d = service::get_task(ctx.db, id).await?;
            let board = service::get_board(ctx.db, &d.task.project_id).await?;
            Ok(json!({
                "id": d.task.id, "title": d.task.title, "description": d.task.description, "due_date": d.task.due_date,
                "priority": PRIORITIES.get(d.task.priority as usize), "labels": label_names(&board, &d.label_ids),
                "checklist": d.checklist.iter().map(|i| json!({ "id": i.id, "text": i.text, "done": i.done })).collect::<Vec<_>>(),
                "sub_tasks": d.subtasks.iter().map(|s| json!({ "id": s.id, "title": s.title })).collect::<Vec<_>>(),
            }))
        }
        _ => Err(unknown(tool)),
    }
}

fn label_names(board: &Board, ids: &[String]) -> Vec<String> {
    board.labels.iter().filter(|l| ids.contains(&l.id)).map(|l| l.name.clone()).collect()
}

// ---------- Labels and checklists ----------

#[derive(Deserialize, Default)]
struct Extras {
    id: Option<String>,
    project_id: Option<String>,
    name: Option<String>,
    color: Option<String>,
    labels: Option<Vec<String>>,
    items: Option<Vec<String>>,
    item_id: Option<String>,
    done: Option<bool>,
    text: Option<String>,
}

/// The board's labels named (or with those ids), in the board's order.
fn label_ids(board: &Board, wanted: &[String]) -> Result<Vec<String>> {
    let mut ids = Vec::new();
    for w in wanted.iter().map(|w| w.trim()).filter(|w| !w.is_empty()) {
        let found = board.labels.iter().find(|l| l.id == w || l.name.eq_ignore_ascii_case(w)).ok_or_else(|| {
            let names: Vec<&str> = board.labels.iter().map(|l| l.name.as_str()).collect();
            Error::Invalid(if names.is_empty() { format!("That board has no labels yet; add \"{w}\" with board_add_label first.") } else { format!("That board's labels are: {}.", names.join(", ")) })
        })?;
        if !ids.contains(&found.id) {
            ids.push(found.id.clone());
        }
    }
    Ok(ids)
}

/// A card's title and its board, once it's checked the card can be worked on.
async fn card(ctx: &Ctx<'_>, id: &str) -> Result<(String, Vec<String>, Board)> {
    access::task(ctx.db, id, Need::Cards).await?;
    let d = service::get_task(ctx.db, id).await?;
    let board = service::get_board(ctx.db, &d.task.project_id).await?;
    Ok((d.task.title, d.label_ids, board))
}

fn checklist_items(e: &Extras) -> Result<Vec<String>> {
    let items: Vec<String> = e.items.iter().flatten().map(|i| i.trim().to_owned()).filter(|i| !i.is_empty()).collect();
    if items.is_empty() || items.len() > MAX_CHECKLIST {
        return Err(Error::Invalid(format!("Add between 1 and {MAX_CHECKLIST} items at once.")));
    }
    Ok(items)
}

fn label_color(e: &Extras) -> Result<String> {
    let color = e.color.clone().unwrap_or_else(|| "blue".into());
    if LABEL_COLORS.contains(&color.as_str()) { Ok(color) } else { Err(Error::Invalid(format!("Label colours are: {}.", LABEL_COLORS.join(", ")))) }
}

async fn preview_extra(ctx: &Ctx<'_>, tool: &str, e: Extras) -> Result<Preview> {
    match tool {
        "board_add_label" => {
            let project_id = e.project_id.as_deref().unwrap_or_default();
            access::project(ctx.db, project_id, Need::Board).await?;
            let board = service::get_board(ctx.db, project_id).await?;
            let name = e.name.as_deref().map(str::trim).filter(|n| !n.is_empty()).ok_or_else(|| Error::Invalid("Give the label a name.".into()))?;
            if board.labels.iter().any(|l| l.name.eq_ignore_ascii_case(name)) {
                return Err(Error::Invalid(format!("{} already has a label called {name}.", board.project.name)));
            }
            Ok(Preview { title: format!("Add a label to {}", board.project.name), items: vec![Item::new("Label", name), Item::new("Colour", capital(&label_color(&e)?))] })
        }
        "board_set_labels" => {
            let (title, current, board) = card(ctx, e.id.as_deref().unwrap_or_default()).await?;
            let wanted = label_ids(&board, e.labels.as_deref().unwrap_or_default())?;
            let show = |ids: &[String]| label_names(&board, ids).join(", ");
            let items = lines(vec![("Labels", show(&wanted))], Some(vec![("Labels", show(&current))]));
            if items.is_empty() {
                return Err(Error::Invalid("It already has those labels.".into()));
            }
            Ok(Preview { title: format!("Label \"{title}\""), items })
        }
        "board_add_checklist" => {
            let (title, _, _) = card(ctx, e.id.as_deref().unwrap_or_default()).await?;
            let items = checklist_items(&e)?.into_iter().map(|i| Item::new("Item", i)).collect();
            Ok(Preview { title: format!("Add to the checklist on \"{title}\""), items })
        }
        "board_update_checklist" | "board_delete_checklist" => {
            let item = service::find_item(ctx.db, e.item_id.as_deref().unwrap_or_default()).await?;
            let (title, _, _) = card(ctx, &item.task_id).await?;
            if tool == "board_delete_checklist" {
                return Ok(Preview { title: format!("Remove from the checklist on \"{title}\""), items: vec![Item::gone("Item", item.text)] });
            }
            let tick = |done: bool| if done { "Done" } else { "To do" }.to_owned();
            let after = vec![("Item", e.text.as_deref().map_or(item.text.clone(), |t| t.trim().to_owned())), ("Status", tick(e.done.unwrap_or(item.done)))];
            let items = lines(after, Some(vec![("Item", item.text.clone()), ("Status", tick(item.done))]));
            if items.is_empty() {
                return Err(Error::Invalid("That changes nothing.".into()));
            }
            Ok(Preview { title: format!("Checklist on \"{title}\""), items })
        }
        _ => Err(unknown(tool)),
    }
}

async fn apply_extra(ctx: &Ctx<'_>, tool: &str, e: Extras) -> Result<Value> {
    match tool {
        "board_add_label" => {
            let project_id = e.project_id.as_deref().unwrap_or_default();
            access::project(ctx.db, project_id, Need::Board).await?;
            let made = service::create_label(ctx.db, project_id, e.name.as_deref().unwrap_or_default(), &label_color(&e)?).await?;
            Ok(json!({ "label_id": made.id, "name": made.name }))
        }
        "board_set_labels" => {
            let id = e.id.clone().unwrap_or_default();
            let (_, _, board) = card(ctx, &id).await?;
            let set = service::set_task_labels(ctx.db, &id, label_ids(&board, e.labels.as_deref().unwrap_or_default())?).await?;
            Ok(json!({ "labels": label_names(&board, &set) }))
        }
        "board_add_checklist" => {
            let id = e.id.clone().unwrap_or_default();
            card(ctx, &id).await?;
            let items = checklist_items(&e)?;
            for item in &items {
                service::add_checklist_item(ctx.db, &id, item).await?;
            }
            Ok(json!({ "added": items.len() }))
        }
        "board_update_checklist" => {
            let item = service::find_item(ctx.db, e.item_id.as_deref().unwrap_or_default()).await?;
            access::checklist_item(ctx.db, &item.id, Need::Cards).await?;
            let text = e.text.as_deref().map_or(item.text.clone(), |t| t.trim().to_owned());
            let saved = service::update_checklist_item(ctx.db, &item.id, &text, e.done.unwrap_or(item.done)).await?;
            Ok(json!({ "item": saved.text, "done": saved.done }))
        }
        "board_delete_checklist" => {
            let id = e.item_id.clone().unwrap_or_default();
            access::checklist_item(ctx.db, &id, Need::Cards).await?;
            service::delete_checklist_item(ctx.db, &id).await?;
            Ok(json!({ "removed": true }))
        }
        _ => Err(unknown(tool)),
    }
}

/// The new tools for labels and checklists.
fn is_extra(tool: &str) -> bool {
    tool.contains("label") || tool.contains("checklist")
}

/// The column named (or with that id) on the board, or its first.
fn column_of<'a>(board: &'a Board, wanted: Option<&str>) -> Result<(&'a str, &'a str)> {
    let found = match wanted.map(str::trim) {
        None | Some("") => board.columns.first(),
        Some(w) => board.columns.iter().find(|c| c.id == w || c.name.eq_ignore_ascii_case(w)),
    };
    found.map(|c| (c.id.as_str(), c.name.as_str())).ok_or_else(|| {
        let names: Vec<&str> = board.columns.iter().map(|c| c.name.as_str()).collect();
        Error::Invalid(format!("That board's columns are: {}.", names.join(", ")))
    })
}

/// "none" clears a date; otherwise YYYY-MM-DD.
fn due_of(text: &str) -> Result<Option<sea_orm::prelude::Date>> {
    if text.trim().eq_ignore_ascii_case("none") { Ok(None) } else { date(text).map(Some) }
}

fn check_priority(p: Option<i16>) -> Result<()> {
    if p.is_some_and(|p| !(0..=3).contains(&p)) {
        return Err(Error::Invalid("Priority goes from 0 (none) to 3 (high).".into()));
    }
    Ok(())
}

/// The card, its board, and what it would be with the changes.
async fn card_and_fields(ctx: &Ctx<'_>, a: &A) -> Result<(Board, String, TaskFields, TaskFields)> {
    let id = a.id.clone().unwrap_or_default();
    access::task(ctx.db, &id, Need::Cards).await?;
    let detail = service::get_task(ctx.db, &id).await?;
    let board = service::get_board(ctx.db, &detail.task.project_id).await?;
    let before = TaskFields {
        title: detail.task.title.clone(),
        description: detail.task.description.clone(),
        priority: detail.task.priority,
        start_date: detail.task.start_date,
        due_date: detail.task.due_date,
        estimate: detail.task.estimate,
        recurrence: detail.task.recurrence.clone(),
    };
    check_priority(a.priority)?;
    let after = TaskFields {
        title: a.title.as_deref().map_or(before.title.clone(), |t| t.trim().to_owned()),
        description: a.description.clone().unwrap_or(before.description.clone()),
        priority: a.priority.unwrap_or(before.priority),
        due_date: match a.due_date.as_deref() {
            Some(d) => due_of(d)?,
            None => before.due_date,
        },
        ..before.clone()
    };
    Ok((board, detail.task.column_id.clone(), before, after))
}

fn card_items(before: Option<&TaskFields>, after: &TaskFields, today: sea_orm::prelude::Date) -> Vec<Item> {
    let rows = |f: &TaskFields| {
        [
            ("Title", f.title.clone()),
            ("Description", f.description.clone()),
            ("Due", f.due_date.map(|d| day_name(d, today)).unwrap_or_default()),
            ("Priority", if f.priority > 0 { PRIORITIES[f.priority as usize].to_owned() } else { String::new() }),
        ]
    };
    match before {
        None => rows(after).into_iter().filter(|(_, v)| !v.is_empty()).map(|(l, v)| Item::new(l, v)).collect(),
        Some(before) => rows(after)
            .into_iter()
            .zip(rows(before))
            .filter(|((_, a), (_, b))| a != b)
            .map(|((l, a), (_, b))| Item { label: l.into(), before: (!b.is_empty()).then_some(b), after: (!a.is_empty()).then_some(a) })
            .collect(),
    }
}

fn new_card(a: &A) -> Result<TaskFields> {
    let title = a.title.as_deref().map(str::trim).filter(|t| !t.is_empty()).ok_or_else(|| Error::Invalid("Give the card a title.".into()))?;
    check_priority(a.priority)?;
    Ok(TaskFields {
        title: title.into(),
        description: a.description.clone().unwrap_or_default(),
        priority: a.priority.unwrap_or(0),
        start_date: None,
        due_date: a.due_date.as_deref().map(due_of).transpose()?.flatten(),
        estimate: None,
        recurrence: None,
    })
}

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    if is_extra(tool) {
        return preview_extra(ctx, tool, args(raw)?).await;
    }
    let a: A = args(raw)?;
    match tool {
        "board_add_card" => {
            let board = service::get_board(ctx.db, a.project_id.as_deref().unwrap_or_default()).await?;
            let (column_id, column) = column_of(&board, a.column.as_deref())?;
            access::column(ctx.db, column_id, Need::Cards).await?;
            let fields = new_card(&a)?;
            let mut items = card_items(None, &fields, ctx.today);
            items.push(Item::new("Column", column));
            Ok(Preview { title: format!("Add a card to {}", board.project.name), items })
        }
        "board_update_card" => {
            let (_, _, before, after) = card_and_fields(ctx, &a).await?;
            let items = card_items(Some(&before), &after, ctx.today);
            if items.is_empty() {
                return Err(Error::Invalid("That changes nothing.".into()));
            }
            Ok(Preview { title: format!("Change \"{}\"", before.title), items })
        }
        "board_move_card" => {
            let (board, from, before, _) = card_and_fields(ctx, &A { id: a.id.clone(), ..Default::default() }).await?;
            let (to_id, to) = column_of(&board, a.column.as_deref())?;
            if to_id == from {
                return Err(Error::Invalid("It's already in that column.".into()));
            }
            let from = board.columns.iter().find(|c| c.id == from).map_or(String::new(), |c| c.name.clone());
            Ok(Preview { title: format!("Move \"{}\"", before.title), items: vec![Item::change("Column", from, to)] })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    if is_extra(tool) {
        return apply_extra(ctx, tool, args(raw)?).await;
    }
    let a: A = args(raw)?;
    match tool {
        "board_add_card" => {
            let board = service::get_board(ctx.db, a.project_id.as_deref().unwrap_or_default()).await?;
            let (column_id, _) = column_of(&board, a.column.as_deref())?;
            access::column(ctx.db, column_id, Need::Cards).await?;
            let fields = new_card(&a)?;
            let made = service::create_task(ctx.db, column_id, &fields.title).await?;
            service::update_task(ctx.db, &made.task.id, fields).await?;
            Ok(json!({ "card_id": made.task.id }))
        }
        "board_update_card" => {
            let (_, _, _, after) = card_and_fields(ctx, &a).await?;
            let saved = service::update_task(ctx.db, a.id.as_deref().unwrap_or_default(), after).await?;
            Ok(json!({ "card_id": saved.task.id, "title": saved.task.title }))
        }
        "board_move_card" => {
            let (board, _, _, _) = card_and_fields(ctx, &A { id: a.id.clone(), ..Default::default() }).await?;
            let (to_id, to) = column_of(&board, a.column.as_deref())?;
            service::move_task(ctx.db, a.id.as_deref().unwrap_or_default(), to_id, None).await?;
            Ok(json!({ "moved_to": to }))
        }
        _ => Err(unknown(tool)),
    }
}
