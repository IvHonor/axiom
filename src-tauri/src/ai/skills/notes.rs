//! Notes: Lemma can search notes and read one, and write when asked: a new
//! note, or more added to the end of one. It never rewrites or removes
//! what's there.

use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, object, unknown};
use crate::error::{Error, Result};
use crate::features::doc_edits;
use crate::features::notes::service;
use crate::features::notes::types::{NewNote, NoteChange, NoteFilter};

/// Longest note text sent, in characters.
const MAX_TEXT: usize = 8000;
const MAX_LISTED: usize = 60;
/// The most of what's written shown on the card, in characters.
const SHOWN: usize = 600;

pub fn specs() -> Vec<Spec> {
    vec![
        Spec {
            area: "notes",
            name: "notes_list",
            description: "Notes and sticky notes, most recently edited first, optionally searched or by tag: id, title, tags and the start of the text.",
            parameters: object(json!({ "search": { "type": "string" }, "tag": { "type": "string" } }), &[]),
            change: false,
        },
        Spec {
            area: "notes",
            name: "notes_read",
            description: "One note's whole text, by id.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: false,
        },
        Spec {
            area: "notes",
            name: "notes_write",
            description: "Proposes a new note, when the person asks you to note something down or write one.",
            parameters: object(
                json!({
                    "title": { "type": "string" },
                    "text": { "type": "string", "description": "Paragraphs (or list items) separated by new lines." },
                    "tags": { "type": "array", "items": { "type": "string" } },
                }),
                &["title", "text"],
            ),
            change: true,
        },
        Spec {
            area: "notes",
            name: "notes_add_to",
            description: "Proposes adding lines to the end of an existing note, by id. What's already there stays as it is.",
            parameters: object(json!({ "id": { "type": "string" }, "text": { "type": "string" } }), &["id", "text"]),
            change: true,
        },
    ]
}

#[derive(Deserialize, Default)]
struct A {
    id: Option<String>,
    search: Option<String>,
    tag: Option<String>,
    title: Option<String>,
    text: Option<String>,
    tags: Option<Vec<String>>,
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    match tool {
        "notes_list" => {
            let notes = service::list(ctx.db, NoteFilter { search: a.search, tag: a.tag, ..Default::default() }).await?;
            Ok(json!(notes
                .iter()
                .take(MAX_LISTED)
                .map(|n| json!({ "id": n.id, "title": n.title, "tags": n.tags, "sticky": n.sticky, "start": n.excerpt, "edited": n.updated_at }))
                .collect::<Vec<_>>()))
        }
        "notes_read" => {
            let d = service::get(ctx.db, a.id.as_deref().unwrap_or_default()).await?;
            Ok(json!({ "title": d.note.title, "tags": d.tags, "text": d.note.text.chars().take(MAX_TEXT).collect::<String>() }))
        }
        _ => Err(unknown(tool)),
    }
}

fn written(a: &A) -> Result<Vec<&str>> {
    let paragraphs = doc_edits::paragraphs(a.text.as_deref().unwrap_or_default());
    if paragraphs.is_empty() {
        return Err(Error::Invalid("There's nothing to write.".into()));
    }
    Ok(paragraphs)
}

fn shown(paragraphs: &[&str]) -> String {
    let text = paragraphs.join("\n");
    if text.chars().count() > SHOWN { format!("{}…", text.chars().take(SHOWN).collect::<String>().trim_end()) } else { text }
}

fn title_of(a: &A) -> Result<String> {
    a.title.as_deref().map(str::trim).filter(|t| !t.is_empty()).map(str::to_owned).ok_or_else(|| Error::Invalid("Give the note a title.".into()))
}

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    let a: A = args(raw)?;
    let paragraphs = written(&a)?;
    match tool {
        "notes_write" => {
            let mut items = vec![Item::new("Title", title_of(&a)?)];
            if let Some(tags) = a.tags.as_ref().filter(|t| !t.is_empty()) {
                items.push(Item::new("Tags", tags.join(", ")));
            }
            items.push(Item::new("Text", shown(&paragraphs)));
            Ok(Preview { title: "Write a note".into(), items })
        }
        "notes_add_to" => {
            let d = service::get(ctx.db, a.id.as_deref().unwrap_or_default()).await?;
            let name = if d.note.title.trim().is_empty() { "a note".to_owned() } else { format!("\"{}\"", d.note.title) };
            Ok(Preview { title: format!("Add to {name}"), items: vec![Item::new("Added at the end", shown(&paragraphs))] })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    let paragraphs = written(&a)?;
    let id = match tool {
        "notes_write" => {
            let made = service::create(ctx.db, NewNote { folder_id: None, title: title_of(&a)?, sticky: false, color: String::new(), on_overview: false }).await?;
            if let Some(tags) = a.tags.clone().filter(|t| !t.is_empty()) {
                service::change(ctx.db, &made.id, NoteChange { folder_id: None, title: None, tags: Some(tags), pinned: None, sticky: None, color: None, on_overview: None }).await?;
            }
            made.id
        }
        "notes_add_to" => a.id.clone().unwrap_or_default(),
        _ => return Err(unknown(tool)),
    };
    let d = service::get(ctx.db, &id).await?;
    let update = doc_edits::append(&d.edits, &paragraphs);
    let (text, words) = doc_edits::plain(&d.note.text, &paragraphs);
    service::save(ctx.db, &id, Some(update), text, words).await?;
    Ok(json!({ "note_id": id, "words": words }))
}
