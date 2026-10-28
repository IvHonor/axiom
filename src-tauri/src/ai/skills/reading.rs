//! Reading Tracker: see the shelves; find a book on Open Library and add
//! it (or, if it isn't there and the person says so, add their own); log
//! progress, or move a book to another shelf.

use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, nothing, object, unknown};
use crate::error::{Error, Result};
use crate::features::reading::library::Found;
use crate::features::reading::service::{self, FORMATS, STATUSES};
use crate::features::reading::types::{BookCard, BookFields, NewBook};

const SHELF: [(&str, &str); 4] = [("want", "Want to read"), ("reading", "Reading"), ("finished", "Finished"), ("dnf", "Did not finish")];

fn shelf(status: &str) -> &str {
    SHELF.iter().find(|(id, _)| *id == status).map_or(status, |(_, name)| name)
}

pub fn specs() -> Vec<Spec> {
    vec![
        Spec {
            area: "reading",
            name: "reading_books",
            description: "The books on the shelves (or one shelf): id, title, authors, shelf, progress and what it counts (pages, percent or minutes), total, percent, expected finish, rating.",
            parameters: object(json!({ "shelf": { "type": "string", "enum": STATUSES } }), &[]),
            change: false,
        },
        Spec {
            area: "reading",
            name: "reading_summary",
            description: "The reading goal for the year and how it's going, the reading streak, pages read today, and how many books are on each shelf.",
            parameters: nothing(),
            change: false,
        },
        Spec {
            area: "reading",
            name: "reading_find",
            description: "Searches Open Library for a book by title, author or ISBN, best match first: work_key, title, authors, year first published, pages, editions, and whether it has a cover. Always use this before reading_add.",
            parameters: object(json!({ "query": { "type": "string", "description": "e.g. \"atomic habits james clear\", or an ISBN." } }), &["query"]),
            change: false,
        },
        Spec {
            area: "reading",
            name: "reading_add",
            description: "Proposes adding a book to a shelf, want-to-read unless said otherwise; a finished one can have a review. Find it with reading_find first and give the work_key of the one they mean: its title, authors, cover and pages then come from Open Library. Only leave work_key out when reading_find had nothing that's their book AND they've said to add it themselves; then give the title (and authors, pages). It never sets a rating: for stars, use reading_review afterwards, and only with a number of stars they gave.",
            parameters: object(
                json!({
                    "work_key": { "type": "string", "description": "From reading_find, e.g. /works/OL17930368W." },
                    "title": { "type": "string" },
                    "authors": { "type": "string" },
                    "pages": { "type": "integer" },
                    "format": { "type": "string", "enum": FORMATS },
                    "shelf": { "type": "string", "enum": STATUSES },
                    "review": { "type": "string", "description": "The person's review, in their words, written up briefly." },
                }),
                &["title"],
            ),
            change: true,
        },
        Spec {
            area: "reading",
            name: "reading_review",
            description: "Proposes rating or reviewing a book already on the shelves, by id.",
            parameters: object(
                json!({ "id": { "type": "string" }, "rating": { "type": "number", "minimum": 0.5, "maximum": 5, "description": "Stars out of 5, in halves. Only when the person gives a number of stars; never from words like good or great." }, "review": { "type": "string" } }),
                &["id"],
            ),
            change: true,
        },
        Spec {
            area: "reading",
            name: "reading_log",
            description: "Proposes logging progress in a book being read: where they are now (a page, percent or minutes, in the book's unit), and optionally minutes spent.",
            parameters: object(json!({ "id": { "type": "string" }, "at": { "type": "integer" }, "minutes": { "type": "integer" } }), &["id", "at"]),
            change: true,
        },
        Spec {
            area: "reading",
            name: "reading_move",
            description: "Proposes moving a book to another shelf: starting it, finishing it, or putting it down.",
            parameters: object(json!({ "id": { "type": "string" }, "shelf": { "type": "string", "enum": STATUSES } }), &["id", "shelf"]),
            change: true,
        },
    ]
}

fn brief(b: &BookCard) -> Value {
    json!({
        "id": b.book.id, "title": b.book.title, "authors": b.book.authors, "shelf": b.book.status,
        "at": b.book.progress, "unit": b.book.unit, "total": b.total, "percent": b.percent.map(f64::round),
        "expected_finish": b.finish_estimate, "last_read": b.last_read, "rating_out_of_5": b.book.rating.map(|r| r as f64 / 2.0),
    })
}

#[derive(Deserialize, Default)]
struct A {
    id: Option<String>,
    shelf: Option<String>,
    title: Option<String>,
    authors: Option<String>,
    pages: Option<i32>,
    format: Option<String>,
    at: Option<i32>,
    minutes: Option<i32>,
    rating: Option<f64>,
    review: Option<String>,
    query: Option<String>,
    work_key: Option<String>,
}

/// Most search results Lemma is shown.
const MAX_FOUND: usize = 6;
/// The longest search Lemma may send Open Library, in characters.
const MAX_QUERY: usize = 120;

/// The Open Library book the AI picked, looked up again so its details come
/// from Open Library, not from what the AI wrote. None for a book added by hand.
async fn picked(ctx: &Ctx<'_>, a: &A) -> Result<Option<Found>> {
    let Some(key) = a.work_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) else { return Ok(None) };
    let title = a.title.as_deref().unwrap_or_default();
    // Title and author find it first; the title alone is the fallback.
    for query in [format!("{title} {}", a.authors.as_deref().unwrap_or_default()), title.to_owned()] {
        if let Some(found) = ctx.library.search(&query).await?.into_iter().find(|f| f.work_key == key) {
            return Ok(Some(found));
        }
    }
    Err(Error::Invalid(format!("{key} isn't among Open Library's results for \"{title}\". Use reading_find again and give one of its work_keys with that book's title.")))
}

/// Stars as the Reading Tracker keeps them: half stars, 1 to 10.
fn half_stars(rating: Option<f64>) -> Result<Option<i16>> {
    match rating {
        None => Ok(None),
        Some(r) if (0.5..=5.0).contains(&r) => Ok(Some((r * 2.0).round() as i16)),
        Some(_) => Err(Error::Invalid("A rating is half a star to five stars.".into())),
    }
}

fn stars(half: i16) -> String {
    let full = "★".repeat((half / 2) as usize);
    let half_star = if half % 2 == 1 { "½" } else { "" };
    format!("{full}{half_star} ({}/5)", half as f64 / 2.0)
}

/// Everything about a book as its edit form has it, with a new rating or review.
fn reviewed(b: &BookCard, rating: Option<i16>, review: Option<&str>) -> BookFields {
    BookFields {
        title: b.book.title.clone(),
        authors: b.book.authors.clone(),
        cover_url: b.book.cover_url.clone(),
        pages: b.book.pages,
        format: b.book.format.clone(),
        unit: b.book.unit.clone(),
        audio_minutes: b.book.audio_minutes,
        rating: rating.or(b.book.rating),
        review: review.map_or(b.book.review.clone(), |r| r.trim().to_owned()),
        started_on: b.book.started_on,
        finished_on: b.book.finished_on,
    }
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    match tool {
        "reading_books" => {
            let a: A = args(raw)?;
            let books = service::list_books(ctx.db, ctx.today).await?;
            Ok(json!(books.iter().filter(|b| a.shelf.as_deref().is_none_or(|s| s == b.book.status)).map(brief).collect::<Vec<_>>()))
        }
        "reading_find" => {
            let a: A = args(raw)?;
            // A title and author fit easily; anything longer isn't a book search,
            // and mustn't carry the person's words off to Open Library.
            let query = a.query.as_deref().unwrap_or_default().trim();
            if query.chars().count() > MAX_QUERY {
                return Err(Error::Invalid(format!("Search with just the title and author, in under {MAX_QUERY} characters.")));
            }
            let found = ctx.library.search(query).await?;
            if found.is_empty() {
                return Ok(json!({ "found": [], "note": "Nothing on Open Library. Try another spelling or the author; if it still isn't there, ask whether to add it as their own book." }));
            }
            Ok(json!({ "found": found.iter().take(MAX_FOUND).map(brief_found).collect::<Vec<_>>() }))
        }
        "reading_summary" => {
            let s = service::summary(ctx.db, ctx.today).await?;
            Ok(json!({
                "goal": { "year": s.goal.year, "books": s.goal.books, "finished": s.goal.finished, "expected_by_now": s.goal.expected.round() },
                "streak_days": s.streak, "pages_today": s.pages_today,
                "shelves": { "want": s.shelves.want, "reading": s.shelves.reading, "finished": s.shelves.finished, "dnf": s.shelves.dnf },
                "reading_now": s.reading.iter().map(brief).collect::<Vec<_>>(),
            }))
        }
        _ => Err(unknown(tool)),
    }
}

/// The book to add: Open Library's, as the Add book form fills it in from a
/// search result, or one the person asked to add themselves.
fn new_book(a: &A, found: Option<&Found>) -> Result<NewBook> {
    let format = a.format.clone().unwrap_or_else(|| "print".into());
    let status = a.shelf.clone().unwrap_or_else(|| "want".into());
    if !FORMATS.contains(&format.as_str()) || !STATUSES.contains(&status.as_str()) {
        return Err(Error::Invalid("Format or shelf isn't one of the allowed values.".into()));
    }
    if let Some(f) = found {
        return Ok(NewBook {
            title: f.title.clone(),
            authors: f.authors.clone(),
            cover_url: f.cover_url.clone(),
            work_key: Some(f.work_key.clone()),
            edition_key: f.edition_key.clone(),
            isbn: f.isbn.clone(),
            published_year: f.year,
            api_pages: f.pages,
            format,
            status,
            ..Default::default()
        });
    }
    let title = a.title.as_deref().map(str::trim).filter(|t| !t.is_empty()).ok_or_else(|| Error::Invalid("Give the book's title.".into()))?;
    Ok(NewBook { title: title.into(), authors: a.authors.clone().unwrap_or_default().trim().into(), pages: a.pages.filter(|p| *p > 0), format, status, ..Default::default() })
}

fn brief_found(f: &Found) -> Value {
    json!({ "work_key": f.work_key, "title": f.title, "authors": f.authors, "year": f.year, "pages": f.pages, "editions": f.editions, "cover": f.cover_url.is_some() })
}

async fn book(ctx: &Ctx<'_>, id: &str) -> Result<BookCard> {
    Ok(service::get_book(ctx.db, id, ctx.today).await?.card)
}

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    let a: A = args(raw)?;
    match tool {
        "reading_add" => {
            let found = picked(ctx, &a).await?;
            let b = new_book(&a, found.as_ref())?;
            let mut items = vec![Item::new("Title", &b.title)];
            if !b.authors.is_empty() {
                items.push(Item::new("By", &b.authors));
            }
            if let Some(year) = b.published_year {
                items.push(Item::new("First published", year.to_string()));
            }
            if let Some(pages) = b.pages.or(b.api_pages) {
                items.push(Item::new("Pages", pages.to_string()));
            }
            items.push(Item::new("Shelf", shelf(&b.status)));
            if let Some(review) = a.review.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
                items.push(Item::new("Review", review));
            }
            items.push(Item::new("Details", match &found {
                Some(f) if f.cover_url.is_some() => "From Open Library, with its cover",
                Some(_) => "From Open Library",
                None => "Added by you: not found on Open Library",
            }));
            Ok(Preview { title: if found.is_some() { "Add a book".into() } else { "Add your own book".into() }, items })
        }
        "reading_log" => {
            let b = book(ctx, a.id.as_deref().unwrap_or_default()).await?;
            let at = a.at.ok_or_else(|| Error::Invalid("Give where they are now.".into()))?;
            let unit = |v: i32| match b.book.unit.as_str() {
                "percent" => format!("{v}%"),
                "minutes" => format!("{v} min"),
                _ => format!("page {v}"),
            };
            let mut items = vec![Item::change("Progress", unit(b.book.progress), unit(at))];
            if let Some(minutes) = a.minutes.filter(|m| *m > 0) {
                items.push(Item::new("Time read", format!("{minutes} min")));
            }
            Ok(Preview { title: format!("Log reading in \"{}\"", b.book.title), items })
        }
        "reading_review" => {
            let b = book(ctx, a.id.as_deref().unwrap_or_default()).await?;
            let mut items = Vec::new();
            if let Some(half) = half_stars(a.rating)? {
                items.push(Item { label: "Rating".into(), before: b.book.rating.map(stars), after: Some(stars(half)) });
            }
            if let Some(review) = a.review.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
                items.push(Item { label: "Review".into(), before: (!b.book.review.is_empty()).then(|| b.book.review.clone()), after: Some(review.into()) });
            }
            if items.is_empty() {
                return Err(Error::Invalid("Give a rating or a review.".into()));
            }
            Ok(Preview { title: format!("Review \"{}\"", b.book.title), items })
        }
        "reading_move" => {
            let b = book(ctx, a.id.as_deref().unwrap_or_default()).await?;
            let to = a.shelf.clone().unwrap_or_default();
            if !STATUSES.contains(&to.as_str()) || to == b.book.status {
                return Err(Error::Invalid("Pick a different shelf: want, reading, finished or dnf.".into()));
            }
            Ok(Preview { title: format!("Move \"{}\"", b.book.title), items: vec![Item::change("Shelf", shelf(&b.book.status), shelf(&to))] })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    let id = a.id.clone().unwrap_or_default();
    match tool {
        "reading_add" => {
            // Never a rating here, even if one was sent: words like "very good" turned into stars.
            let found = picked(ctx, &a).await?;
            let added = service::add_book(ctx.db, new_book(&a, found.as_ref())?, ctx.today).await?;
            if a.review.as_deref().is_none_or(|r| r.trim().is_empty()) {
                return Ok(brief(&added));
            }
            Ok(brief(&service::update_book(ctx.db, &added.book.id, reviewed(&added, None, a.review.as_deref()), ctx.today).await?))
        }
        "reading_review" => {
            let b = book(ctx, &id).await?;
            let fields = reviewed(&b, half_stars(a.rating)?, a.review.as_deref());
            Ok(brief(&service::update_book(ctx.db, &id, fields, ctx.today).await?))
        }
        "reading_log" => Ok(brief(&service::log_progress(ctx.db, &id, a.at.unwrap_or_default(), a.minutes, ctx.today).await?)),
        "reading_move" => Ok(brief(&service::set_status(ctx.db, &id, a.shelf.as_deref().unwrap_or_default(), ctx.today).await?)),
        _ => Err(unknown(tool)),
    }
}
