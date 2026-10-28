//! What Lemma can do in each area. Every area's tools are of two kinds:
//!
//! - looking: run straight away, their answer goes back to the AI;
//! - changing: only make a preview. Nothing changes until the person
//!   confirms it in the chat; then `apply` makes the change through the
//!   area's own service, as its screens would.
//!
//! An area's tools are offered only when the person has let Lemma use it.

mod birthdays;
mod daily_plan;
mod finance;
mod goals;
mod journal;
mod learning;
mod notes;
mod project_board;
mod reading;
mod uni;

use sea_orm::DatabaseConnection;
use sea_orm::prelude::Date;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::error::{Error, Result};

/// One tool, described for the AI.
#[derive(Clone)]
pub struct Spec {
    /// The extension id it belongs to.
    pub area: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    /// JSON Schema for its arguments.
    pub parameters: Value,
    /// It changes something, so it only makes a preview.
    pub change: bool,
}

/// What a tool runs with.
pub struct Ctx<'a> {
    pub db: &'a DatabaseConnection,
    pub today: Date,
    /// Minutes after midnight, now.
    pub now_minute: i32,
    /// To find books (Reading), as its Add book form does.
    pub library: crate::features::reading::library::OpenLibrary,
}

/// A change, as the person sees it before confirming. Mirrored in `src/lib/ai.ts`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Preview {
    /// e.g. "Add Ada Lovelace's birthday".
    pub title: String,
    pub items: Vec<Item>,
}

/// One line of a preview: a new value, a changed one (before and after), or
/// one going away (before only).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Item {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
}

impl Item {
    pub fn new(label: &str, value: impl Into<String>) -> Self {
        Self { label: label.into(), before: None, after: Some(value.into()) }
    }

    pub fn change(label: &str, before: impl Into<String>, after: impl Into<String>) -> Self {
        Self { label: label.into(), before: Some(before.into()), after: Some(after.into()) }
    }

    pub fn gone(label: &str, value: impl Into<String>) -> Self {
        Self { label: label.into(), before: Some(value.into()), after: None }
    }
}

/// "seminar" -> "Seminar".
fn capital(text: &str) -> String {
    let mut chars = text.chars();
    chars.next().map_or_else(String::new, |c| c.to_uppercase().chain(chars).collect())
}

/// A preview's lines from labelled values: every non-empty one when there's
/// nothing `before` (it's new), otherwise only the ones that change.
fn lines(after: Vec<(&str, String)>, before: Option<Vec<(&str, String)>>) -> Vec<Item> {
    match before {
        None => after.into_iter().filter(|(_, v)| !v.is_empty()).map(|(l, v)| Item::new(l, v)).collect(),
        Some(before) => after
            .into_iter()
            .zip(before)
            .filter(|((_, a), (_, b))| a != b)
            .map(|((label, a), (_, b))| Item { label: label.into(), before: (!b.is_empty()).then_some(b), after: (!a.is_empty()).then_some(a) })
            .collect(),
    }
}

/// The areas Lemma has tools for, and what each holds, for its instructions.
pub const AREAS: &[(&str, &str)] = &[
    ("birthdays", "Birthdays: people's birthdays and anniversaries, with reminders and gift ideas"),
    ("daily_plan", "Daily Plan: tasks for each day, time blocks on the day's timeline (which go out to the person's own calendar when they publish the plan to one), routines, and calendar events"),
    ("goals", "Goals: goals with targets, progress logs and milestones"),
    ("reading", "Reading Tracker: books on the want-to-read, reading and finished shelves, with progress"),
    ("project_board", "Project Board: projects with columns of task cards, labels and checklists"),
    ("finance", "Finance: accounts, balances, transactions, monthly spending and budgets, and recurring bills"),
    ("learning", "Learning: skills, the courses, books and videos used to learn them, and study sessions"),
    ("uni", "University: terms, modules, lectures and coursework deadlines"),
    ("journal", "Journal: the person's private journal entries; write in it only when they ask"),
    ("notes", "Notes: the person's notes"),
];

/// Words that point at an area. A word in a message matches when it starts
/// with one of these ("birthday" matches "birthdays", but "read" doesn't
/// match "already").
const CUES: &[(&str, &[&str])] = &[
    ("birthdays", &["birthday", "bday", "anniversar", "born", "gift", "present", "turning", "turns"]),
    (
        "daily_plan",
        &[
            "plan", "day", "today", "tonight", "tomorrow", "morning", "afternoon", "evening", "schedul", "task", "todo", "agenda", "calendar", "meeting", "busy",
            "free", "week", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "gym", "work", "sleep", "break", "lunch", "dinner",
            "commute", "drive", "remind", "timeline", "block", "hour", "minute", "routine", "event",
        ],
    ),
    ("goals", &["goal", "target", "habit", "milestone", "resolution", "progress", "checkin", "check"]),
    ("reading", &["book", "read", "novel", "author", "page", "shelf", "shelves", "library"]),
    ("project_board", &["project", "board", "card", "kanban", "backlog", "sprint", "ticket", "column", "label", "checklist"]),
    (
        "finance",
        &["spend", "spent", "money", "budget", "bank", "account", "balance", "transaction", "bill", "salary", "income", "expense", "cost", "paid", "pay", "saving", "afford", "subscription", "rent", "bought", "price"],
    ),
    ("learning", &["learn", "course", "study", "studied", "tutorial", "lesson", "skill", "video", "practi", "revis", "chapter"]),
    ("uni", &["uni", "university", "lecture", "module", "seminar", "lab", "coursework", "exam", "term", "semester", "assignment", "deadline", "class"]),
    ("journal", &["journal", "diary", "mood", "feel", "energy", "entry", "entries", "wrote", "reflect"]),
    ("notes", &["note", "jot", "idea", "write"]),
];

/// Questions about everything bring in every area.
const EVERYTHING: &[&str] = &["life", "overall", "everything", "summary", "summarise", "summarize", "overview", "improve", "focus", "priorit", "suggest", "recommend"];

/// The areas a message seems to be about, of those allowed, so Lemma starts
/// with only their tools (each area's add hundreds of tokens to every call).
/// It can ask for the others with `use_area`.
pub fn areas_for(text: &str, allowed: &[String]) -> Vec<String> {
    let text = text.to_lowercase();
    let words: Vec<&str> = text.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).collect();
    let said = |cue: &str| words.iter().any(|w| w.starts_with(cue));
    if EVERYTHING.iter().any(|cue| said(cue)) {
        return allowed.to_vec();
    }
    // A time of day ("at 3pm", "11:30") or an amount of money is a cue too.
    let time = words.iter().any(|w| (w.ends_with("am") || w.ends_with("pm")) && w.chars().next().is_some_and(|c| c.is_ascii_digit())) || text.contains(':');
    let money = text.contains(['£', '$', '€']);
    CUES.iter()
        .filter(|(area, cues)| {
            allowed.iter().any(|a| a == area)
                && (cues.iter().any(|cue| said(cue)) || (*area == "daily_plan" && time) || (*area == "finance" && money))
        })
        .map(|(area, _)| area.to_string())
        .collect()
}

/// Every tool for the allowed areas.
pub fn specs(areas: &[String]) -> Vec<Spec> {
    let mut all = Vec::new();
    for area in areas {
        all.extend(match area.as_str() {
            "birthdays" => birthdays::specs(),
            "daily_plan" => daily_plan::specs(),
            "goals" => goals::specs(),
            "reading" => reading::specs(),
            "project_board" => project_board::specs(),
            "finance" => finance::specs(),
            "learning" => learning::specs(),
            "uni" => uni::specs(),
            "journal" => journal::specs(),
            "notes" => notes::specs(),
            _ => Vec::new(),
        });
    }
    all
}

pub async fn read(ctx: &Ctx<'_>, spec: &Spec, args: &Value) -> Result<Value> {
    match spec.area {
        "birthdays" => birthdays::read(ctx, spec.name, args).await,
        "daily_plan" => daily_plan::read(ctx, spec.name, args).await,
        "goals" => goals::read(ctx, spec.name, args).await,
        "reading" => reading::read(ctx, spec.name, args).await,
        "project_board" => project_board::read(ctx, spec.name, args).await,
        "finance" => finance::read(ctx, spec.name, args).await,
        "learning" => learning::read(ctx, spec.name, args).await,
        "uni" => uni::read(ctx, spec.name, args).await,
        "journal" => journal::read(ctx, spec.name, args).await,
        "notes" => notes::read(ctx, spec.name, args).await,
        _ => Err(unknown(spec.name)),
    }
}

/// Checks a change and describes it, without making it.
pub async fn preview(ctx: &Ctx<'_>, spec: &Spec, args: &Value) -> Result<Preview> {
    match spec.area {
        "birthdays" => birthdays::preview(ctx, spec.name, args).await,
        "daily_plan" => daily_plan::preview(ctx, spec.name, args).await,
        "goals" => goals::preview(ctx, spec.name, args).await,
        "reading" => reading::preview(ctx, spec.name, args).await,
        "project_board" => project_board::preview(ctx, spec.name, args).await,
        "finance" => finance::preview(ctx, spec.name, args).await,
        "learning" => learning::preview(ctx, spec.name, args).await,
        "uni" => uni::preview(ctx, spec.name, args).await,
        "journal" => journal::preview(ctx, spec.name, args).await,
        "notes" => notes::preview(ctx, spec.name, args).await,
        _ => Err(unknown(spec.name)),
    }
}

/// Makes a confirmed change. Returns what was done, for the AI.
pub async fn apply(ctx: &Ctx<'_>, area: &str, tool: &str, args: &Value) -> Result<Value> {
    match area {
        "birthdays" => birthdays::apply(ctx, tool, args).await,
        "daily_plan" => daily_plan::apply(ctx, tool, args).await,
        "goals" => goals::apply(ctx, tool, args).await,
        "reading" => reading::apply(ctx, tool, args).await,
        "project_board" => project_board::apply(ctx, tool, args).await,
        "finance" => finance::apply(ctx, tool, args).await,
        "learning" => learning::apply(ctx, tool, args).await,
        "uni" => uni::apply(ctx, tool, args).await,
        "journal" => journal::apply(ctx, tool, args).await,
        "notes" => notes::apply(ctx, tool, args).await,
        _ => Err(unknown(tool)),
    }
}

// ---------- Helpers for the areas ----------

fn unknown(tool: &str) -> Error {
    Error::Invalid(format!("There's no tool called {tool}."))
}

/// The arguments as `T`, or an error the AI can correct.
fn args<T: DeserializeOwned>(args: &Value) -> Result<T> {
    serde_json::from_value(args.clone()).map_err(|e| Error::Invalid(format!("The arguments don't fit this tool: {e}.")))
}

/// A JSON Schema object with these properties, `required` ones listed.
fn object(properties: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": properties, "required": required })
}

/// The same schema with nothing in it, for tools that take no arguments.
fn nothing() -> Value {
    json!({ "type": "object", "properties": {} })
}

/// A date the AI wrote, "YYYY-MM-DD".
fn date(text: &str) -> Result<Date> {
    Date::parse_from_str(text.trim(), "%Y-%m-%d").map_err(|_| Error::Invalid(format!("Write dates as YYYY-MM-DD, not {text}.")))
}

/// A time of day the AI wrote, "HH:MM", as minutes after midnight.
fn clock(text: &str) -> Result<i32> {
    let bad = || Error::Invalid(format!("Write times as HH:MM (24-hour), not {text}."));
    let (h, m) = text.trim().split_once(':').ok_or_else(bad)?;
    let (h, m): (i32, i32) = (h.parse().map_err(|_| bad())?, m.parse().map_err(|_| bad())?);
    if !(0..24).contains(&h) || !(0..60).contains(&m) {
        return Err(bad());
    }
    Ok(h * 60 + m)
}

/// Minutes after midnight as "HH:MM".
fn hhmm(minute: i32) -> String {
    format!("{:02}:{:02}", minute / 60 % 24, minute % 60)
}

/// "Thu 23 Oct" (with the year when it isn't this one), for previews.
fn day_name(day: Date, today: Date) -> String {
    use chrono::Datelike;
    if day == today {
        return "Today".into();
    }
    if day == today + chrono::Days::new(1) {
        return "Tomorrow".into();
    }
    if day.year() == today.year() { day.format("%a %-d %b").to_string() } else { day.format("%a %-d %b %Y").to_string() }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod routing {
    use super::areas_for;

    fn all() -> Vec<String> {
        super::AREAS.iter().map(|(id, _)| id.to_string()).collect()
    }

    #[test]
    fn a_message_brings_in_only_the_areas_it_is_about() {
        assert_eq!(areas_for("Whose birthday is next?", &all()), ["birthdays"], "not \"day\" too");
        assert_eq!(areas_for("I'm free from 11am to 5pm, then the gym", &all()), ["daily_plan"]);
        assert_eq!(areas_for("I've already finished", &all()), Vec::<String>::new(), "not \"read\"");
        assert_eq!(areas_for("Spent £12 on lunch", &all()), ["daily_plan", "finance"]);
        assert_eq!(areas_for("Add my lecture notes", &all()), ["uni", "notes"]);
    }

    #[test]
    fn only_allowed_areas_and_everything_for_big_questions() {
        assert!(areas_for("Whose birthday is next?", &["daily_plan".into()]).is_empty());
        assert_eq!(areas_for("How can I improve my life?", &all()).len(), all().len());
    }
}
