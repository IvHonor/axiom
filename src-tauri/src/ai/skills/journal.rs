//! Journal: Lemma can look through entries and read one, to answer
//! questions or reflect, and write in it when asked: a new entry, or more
//! added to the end of one. It never rewrites or removes what's there.

use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, date, day_name, object, unknown};
use crate::error::{Error, Result};
use crate::features::doc_edits;
use crate::features::journal::service;
use crate::features::journal::types::{EntryFields, EntryFilter};

/// Longest entry text sent, in characters.
const MAX_TEXT: usize = 8000;
const MAX_LISTED: usize = 60;
/// The most of what's written shown on the card, in characters.
const SHOWN: usize = 600;

pub fn specs() -> Vec<Spec> {
    vec![
        Spec {
            area: "journal",
            name: "journal_entries",
            description: "Journal entries, newest first, by month or a search: id, day, title, mood and energy (1 to 5), tags and the start of the text.",
            parameters: object(json!({ "month": { "type": "string", "description": "YYYY-MM" }, "search": { "type": "string" }, "tag": { "type": "string" } }), &[]),
            change: false,
        },
        Spec {
            area: "journal",
            name: "journal_read",
            description: "One journal entry's whole text, by id.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: false,
        },
        Spec {
            area: "journal",
            name: "journal_write",
            description: "Proposes a new journal entry, only when the person asks you to write one. Write it in their voice from what they told you; don't invent feelings or events. Mood and energy only if they said.",
            parameters: object(
                json!({
                    "text": { "type": "string", "description": "Paragraphs separated by new lines." },
                    "day": { "type": "string", "description": "YYYY-MM-DD; today if left out." },
                    "title": { "type": "string" },
                    "mood": { "type": "integer", "minimum": 1, "maximum": 5 },
                    "energy": { "type": "integer", "minimum": 1, "maximum": 5 },
                    "tags": { "type": "array", "items": { "type": "string" } },
                }),
                &["text"],
            ),
            change: true,
        },
        Spec {
            area: "journal",
            name: "journal_add_to",
            description: "Proposes adding paragraphs to the end of an existing entry, by id, only when the person asks. What's already there stays as it is.",
            parameters: object(json!({ "id": { "type": "string" }, "text": { "type": "string" } }), &["id", "text"]),
            change: true,
        },
    ]
}

#[derive(Deserialize, Default)]
struct A {
    id: Option<String>,
    month: Option<String>,
    search: Option<String>,
    tag: Option<String>,
    text: Option<String>,
    day: Option<String>,
    title: Option<String>,
    mood: Option<i16>,
    energy: Option<i16>,
    tags: Option<Vec<String>>,
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    match tool {
        "journal_entries" => {
            let entries = service::list(ctx.db, EntryFilter { search: a.search, tag: a.tag, mood: None, month: a.month }).await?;
            Ok(json!(entries
                .iter()
                .take(MAX_LISTED)
                .map(|e| json!({ "id": e.id, "day": e.day, "title": e.title, "mood": e.mood, "energy": e.energy, "tags": e.tags, "start": e.excerpt, "words": e.words }))
                .collect::<Vec<_>>()))
        }
        "journal_read" => {
            let d = service::get(ctx.db, a.id.as_deref().unwrap_or_default()).await?;
            Ok(json!({ "day": d.entry.day, "title": d.entry.title, "mood": d.entry.mood, "energy": d.entry.energy, "tags": d.tags, "text": d.entry.text.chars().take(MAX_TEXT).collect::<String>() }))
        }
        _ => Err(unknown(tool)),
    }
}

/// What's written, as paragraphs; there has to be some.
fn written(a: &A) -> Result<Vec<&str>> {
    let paragraphs = doc_edits::paragraphs(a.text.as_deref().unwrap_or_default());
    if paragraphs.is_empty() {
        return Err(Error::Invalid("There's nothing to write.".into()));
    }
    Ok(paragraphs)
}

/// The start of what's written, for the card.
fn shown(paragraphs: &[&str]) -> String {
    let text = paragraphs.join("\n");
    if text.chars().count() > SHOWN { format!("{}…", text.chars().take(SHOWN).collect::<String>().trim_end()) } else { text }
}

fn scale(value: Option<i16>, what: &str) -> Result<()> {
    if value.is_some_and(|v| !(1..=5).contains(&v)) {
        return Err(Error::Invalid(format!("{what} goes from 1 to 5.")));
    }
    Ok(())
}

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    let a: A = args(raw)?;
    let paragraphs = written(&a)?;
    match tool {
        "journal_write" => {
            scale(a.mood, "Mood")?;
            scale(a.energy, "Energy")?;
            let day = a.day.as_deref().map(date).transpose()?.unwrap_or(ctx.today);
            let mut items = vec![Item::new("Day", day_name(day, ctx.today))];
            if let Some(title) = a.title.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
                items.push(Item::new("Title", title));
            }
            for (label, value) in [("Mood", a.mood), ("Energy", a.energy)] {
                if let Some(v) = value {
                    items.push(Item::new(label, format!("{v} of 5")));
                }
            }
            if let Some(tags) = a.tags.as_ref().filter(|t| !t.is_empty()) {
                items.push(Item::new("Tags", tags.join(", ")));
            }
            items.push(Item::new("Text", shown(&paragraphs)));
            Ok(Preview { title: "Write a journal entry".into(), items })
        }
        "journal_add_to" => {
            let d = service::get(ctx.db, a.id.as_deref().unwrap_or_default()).await?;
            let name = if d.entry.title.trim().is_empty() { day_name(d.entry.day, ctx.today) } else { d.entry.title.clone() };
            Ok(Preview { title: format!("Add to \"{name}\""), items: vec![Item::new("Added at the end", shown(&paragraphs))] })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    let paragraphs = written(&a)?;
    let id = match tool {
        "journal_write" => {
            let day = a.day.as_deref().map(date).transpose()?.unwrap_or(ctx.today);
            let made = service::create(ctx.db, day, "").await?;
            let fields = EntryFields { day, title: a.title.clone().unwrap_or_default(), mood: a.mood, energy: a.energy, tags: a.tags.clone().unwrap_or_default(), prompt: String::new() };
            service::update(ctx.db, &made.id, fields).await?;
            made.id
        }
        "journal_add_to" => a.id.clone().unwrap_or_default(),
        _ => return Err(unknown(tool)),
    };
    let d = service::get(ctx.db, &id).await?;
    let update = doc_edits::append(&d.edits, &paragraphs);
    let (text, words) = doc_edits::plain(&d.entry.text, &paragraphs);
    service::save(ctx.db, &id, Some(update), text, words).await?;
    Ok(json!({ "entry_id": id, "words": words }))
}
