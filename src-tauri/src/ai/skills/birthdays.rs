//! Birthdays: look through them, add, change or remove one, and keep each
//! person's gift ideas.

use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, capital, lines, nothing, object, unknown};
use crate::error::{Error, Result};
use crate::features::birthdays::entities::gift;
use crate::features::birthdays::service::{self, OCCASIONS, RELATIONS, REMIND_DAYS, STATUSES};
use crate::features::birthdays::types::{GiftFields, PersonFields, PersonView};

const MONTHS: [&str; 12] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

pub fn specs() -> Vec<Spec> {
    let fields = json!({
        "name": { "type": "string" },
        "month": { "type": "integer", "minimum": 1, "maximum": 12 },
        "day": { "type": "integer", "minimum": 1, "maximum": 31 },
        "year": { "type": "integer", "description": "Year of birth (or of the wedding), if known." },
        "occasion": { "type": "string", "enum": OCCASIONS },
        "relation": { "type": "string", "enum": RELATIONS },
        "notes": { "type": "string" },
        "remind_days": { "type": "integer", "enum": REMIND_DAYS, "description": "Days ahead to remind as well as on the day." },
    });
    let mut changes = fields.clone();
    changes["id"] = json!({ "type": "string" });
    let gift = json!({
        "person_id": { "type": "string" },
        "idea": { "type": "string" },
        "url": { "type": "string", "description": "A shop link (https://), if there is one." },
        "status": { "type": "string", "enum": STATUSES },
    });
    let mut gift_changes = gift.clone();
    gift_changes.as_object_mut().expect("an object").remove("person_id");
    gift_changes["id"] = json!({ "type": "string" });
    vec![
        Spec {
            area: "birthdays",
            name: "birthdays_list",
            description: "Everyone's birthdays and anniversaries, soonest first: id, name, date, relation, notes, days until it's next, the age they're turning and how many gift ideas are saved.",
            parameters: nothing(),
            change: false,
        },
        Spec {
            area: "birthdays",
            name: "birthdays_add",
            description: "Proposes adding someone's birthday or anniversary. Occasion defaults to birthday, relation to other, reminder to 7 days before.",
            parameters: object(fields, &["name", "month", "day"]),
            change: true,
        },
        Spec {
            area: "birthdays",
            name: "birthdays_update",
            description: "Proposes changing someone's entry. Give its id (from birthdays_list) and only the fields that change.",
            parameters: object(changes, &["id"]),
            change: true,
        },
        Spec {
            area: "birthdays",
            name: "birthdays_delete",
            description: "Proposes removing someone's entry, by id.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: true,
        },
        Spec {
            area: "birthdays",
            name: "birthdays_gifts",
            description: "One person's gifts (by person id): id, idea, link, status (idea, bought or given) and the year it was given.",
            parameters: object(json!({ "person_id": { "type": "string" } }), &["person_id"]),
            change: false,
        },
        Spec {
            area: "birthdays",
            name: "birthdays_add_gift",
            description: "Proposes saving a gift idea for someone, by person id. Status defaults to idea.",
            parameters: object(gift, &["person_id", "idea"]),
            change: true,
        },
        Spec {
            area: "birthdays",
            name: "birthdays_update_gift",
            description: "Proposes changing a gift by id (from birthdays_gifts): its idea, link, or status, e.g. bought or given. Give only what changes.",
            parameters: object(gift_changes, &["id"]),
            change: true,
        },
        Spec {
            area: "birthdays",
            name: "birthdays_delete_gift",
            description: "Proposes removing a gift, by id.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: true,
        },
    ]
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    match tool {
        "birthdays_list" => {
            let people = service::list(ctx.db, ctx.today).await?;
            Ok(json!(people.iter().map(brief).collect::<Vec<_>>()))
        }
        "birthdays_gifts" => {
            let GiftChanges { person_id, .. } = args(raw)?;
            let detail = service::get(ctx.db, person_id.as_deref().unwrap_or_default(), ctx.today).await?;
            Ok(json!(detail.gifts.iter().map(gift_brief).collect::<Vec<_>>()))
        }
        _ => Err(unknown(tool)),
    }
}

fn brief(p: &PersonView) -> Value {
    json!({
        "id": p.id, "name": p.name, "occasion": p.occasion, "month": p.month, "day": p.day, "year": p.year,
        "relation": p.relation, "notes": p.notes, "next": p.next, "days_until": p.days, "turning": p.turning, "gift_ideas": p.ideas,
    })
}

fn gift_brief(g: &gift::Model) -> Value {
    json!({ "id": g.id, "idea": g.idea, "url": g.url, "status": g.status, "year": g.year })
}

/// Fields the AI sends; any left out keep their current (or default) value.
#[derive(Deserialize, Default)]
struct Changes {
    id: Option<String>,
    name: Option<String>,
    month: Option<i16>,
    day: Option<i16>,
    year: Option<i32>,
    occasion: Option<String>,
    relation: Option<String>,
    notes: Option<String>,
    remind_days: Option<i32>,
}

impl Changes {
    fn onto(self, base: PersonFields) -> PersonFields {
        PersonFields {
            name: self.name.map_or(base.name, |n| n.trim().to_owned()),
            occasion: self.occasion.unwrap_or(base.occasion),
            month: self.month.unwrap_or(base.month),
            day: self.day.unwrap_or(base.day),
            year: self.year.or(base.year),
            relation: self.relation.unwrap_or(base.relation),
            notes: self.notes.unwrap_or(base.notes),
            remind_days: self.remind_days.unwrap_or(base.remind_days),
        }
    }
}

fn fields_of(p: &PersonView) -> PersonFields {
    PersonFields {
        name: p.name.clone(),
        occasion: p.occasion.clone(),
        month: p.month,
        day: p.day,
        year: p.year,
        relation: p.relation.clone(),
        notes: p.notes.clone(),
        remind_days: p.remind_days,
    }
}

fn blank() -> PersonFields {
    PersonFields {
        name: String::new(),
        occasion: "birthday".into(),
        month: 1,
        day: 1,
        year: None,
        relation: "other".into(),
        notes: String::new(),
        remind_days: 7,
    }
}

fn when(f: &PersonFields) -> String {
    let month = MONTHS.get((f.month - 1).max(0) as usize).copied().unwrap_or("?");
    match f.year {
        Some(year) => format!("{} {month} {year}", f.day),
        None => format!("{} {month}", f.day),
    }
}

fn remind(days: i32) -> String {
    match days {
        0 => "On the day".into(),
        1 => "1 day before".into(),
        n => format!("{n} days before"),
    }
}

/// The lines of a person's entry, compared with `before` when there is one.
fn items(after: &PersonFields, before: Option<&PersonFields>) -> Vec<Item> {
    let rows = |f: &PersonFields| {
        vec![("Name", f.name.clone()), ("Date", when(f)), ("Occasion", capital(&f.occasion)), ("Relation", capital(&f.relation)), ("Reminder", remind(f.remind_days)), ("Notes", f.notes.clone())]
    };
    lines(rows(after), before.map(rows))
}

async fn person(ctx: &Ctx<'_>, id: &str) -> Result<PersonView> {
    Ok(service::get(ctx.db, id, ctx.today).await?.person)
}

// ---------- Gifts ----------

/// A gift's fields as the AI sends them; any left out keep their current value.
#[derive(Deserialize, Default)]
struct GiftChanges {
    id: Option<String>,
    person_id: Option<String>,
    idea: Option<String>,
    url: Option<String>,
    status: Option<String>,
}

impl GiftChanges {
    fn onto(self, base: GiftFields) -> GiftFields {
        GiftFields { idea: self.idea.map_or(base.idea, |i| i.trim().to_owned()), url: self.url.map_or(base.url, |u| u.trim().to_owned()), status: self.status.unwrap_or(base.status) }
    }
}

fn gift_fields_of(g: &gift::Model) -> GiftFields {
    GiftFields { idea: g.idea.clone(), url: g.url.clone(), status: g.status.clone() }
}

fn gift_items(after: &GiftFields, before: Option<&GiftFields>) -> Vec<Item> {
    let rows = |g: &GiftFields| vec![("Idea", g.idea.clone()), ("Link", g.url.clone()), ("Status", capital(&g.status))];
    lines(rows(after), before.map(rows))
}

fn check_status(status: &str) -> Result<()> {
    if STATUSES.contains(&status) { Ok(()) } else { Err(Error::Invalid(format!("A gift's status is one of: {}.", STATUSES.join(", ")))) }
}

/// A gift, and the person it's for.
async fn gift_and_person(ctx: &Ctx<'_>, id: &str) -> Result<(gift::Model, PersonView)> {
    let g = service::find_gift(ctx.db, id).await?;
    let p = person(ctx, &g.person_id).await?;
    Ok((g, p))
}

async fn preview_gift(ctx: &Ctx<'_>, tool: &str, changes: GiftChanges) -> Result<Preview> {
    match tool {
        "birthdays_add_gift" => {
            let p = person(ctx, changes.person_id.as_deref().unwrap_or_default()).await?;
            let fields = changes.onto(GiftFields { idea: String::new(), url: String::new(), status: "idea".into() });
            check_status(&fields.status)?;
            if fields.idea.is_empty() {
                return Err(Error::Invalid("Say what the gift idea is.".into()));
            }
            Ok(Preview { title: format!("Save a gift idea for {}", p.name), items: gift_items(&fields, None) })
        }
        "birthdays_update_gift" => {
            let (g, p) = gift_and_person(ctx, changes.id.as_deref().unwrap_or_default()).await?;
            let before = gift_fields_of(&g);
            let after = changes.onto(gift_fields_of(&g));
            check_status(&after.status)?;
            let items = gift_items(&after, Some(&before));
            if items.is_empty() {
                return Err(Error::Invalid("That changes nothing.".into()));
            }
            Ok(Preview { title: format!("Change a gift for {}", p.name), items })
        }
        "birthdays_delete_gift" => {
            let (g, p) = gift_and_person(ctx, changes.id.as_deref().unwrap_or_default()).await?;
            Ok(Preview { title: format!("Remove a gift for {}", p.name), items: vec![Item::gone("Idea", g.idea)] })
        }
        _ => Err(unknown(tool)),
    }
}

async fn apply_gift(ctx: &Ctx<'_>, tool: &str, changes: GiftChanges) -> Result<Value> {
    match tool {
        "birthdays_add_gift" => {
            let person_id = changes.person_id.clone().unwrap_or_default();
            let fields = changes.onto(GiftFields { idea: String::new(), url: String::new(), status: "idea".into() });
            Ok(gift_brief(&service::add_gift(ctx.db, &person_id, fields, ctx.today).await?))
        }
        "birthdays_update_gift" => {
            let id = changes.id.clone().unwrap_or_default();
            let current = service::find_gift(ctx.db, &id).await?;
            Ok(gift_brief(&service::update_gift(ctx.db, &id, changes.onto(gift_fields_of(&current)), ctx.today).await?))
        }
        "birthdays_delete_gift" => {
            service::delete_gift(ctx.db, changes.id.as_deref().unwrap_or_default()).await?;
            Ok(json!({ "removed": true }))
        }
        _ => Err(unknown(tool)),
    }
}

// ---------- Changes ----------

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    if tool.ends_with("_gift") {
        return preview_gift(ctx, tool, args(raw)?).await;
    }
    let changes: Changes = args(raw)?;
    match tool {
        "birthdays_add" => {
            let fields = Changes { id: None, ..changes }.onto(blank());
            service::check(&fields, ctx.today)?;
            Ok(Preview { title: format!("Add {}'s {}", fields.name, fields.occasion), items: items(&fields, None) })
        }
        "birthdays_update" => {
            let current = person(ctx, changes.id.as_deref().unwrap_or_default()).await?;
            let before = fields_of(&current);
            let after = changes.onto(fields_of(&current));
            service::check(&after, ctx.today)?;
            let items = items(&after, Some(&before));
            if items.is_empty() {
                return Err(Error::Invalid("That changes nothing.".into()));
            }
            Ok(Preview { title: format!("Change {}'s {}", current.name, current.occasion), items })
        }
        "birthdays_delete" => {
            let current = person(ctx, changes.id.as_deref().unwrap_or_default()).await?;
            Ok(Preview {
                title: format!("Remove {}'s {}", current.name, current.occasion),
                items: vec![Item::gone("Date", when(&fields_of(&current)))],
            })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    if tool.ends_with("_gift") {
        return apply_gift(ctx, tool, args(raw)?).await;
    }
    let changes: Changes = args(raw)?;
    match tool {
        "birthdays_add" => {
            let added = service::create(ctx.db, Changes { id: None, ..changes }.onto(blank()), ctx.today).await?;
            Ok(brief(&added))
        }
        "birthdays_update" => {
            let id = changes.id.clone().unwrap_or_default();
            let current = person(ctx, &id).await?;
            let saved = service::update(ctx.db, &id, changes.onto(fields_of(&current)), ctx.today).await?;
            Ok(brief(&saved))
        }
        "birthdays_delete" => {
            service::delete(ctx.db, changes.id.as_deref().unwrap_or_default()).await?;
            Ok(json!({ "removed": true }))
        }
        _ => Err(unknown(tool)),
    }
}
