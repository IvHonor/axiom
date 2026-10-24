//! The Notes logic: every query and change, independent of Tauri so it can
//! be tested on its own (see `tests.rs`).

use std::collections::{HashMap, HashSet};

use chrono::{Duration, Utc};
use sea_orm::prelude::Expr;
use sea_orm::{ActiveModelTrait, ColumnTrait, Condition, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Select, Set, TransactionTrait};

use super::entities::{edit, folder, note};
use super::types::{FolderView, NewNote, NoteCard, NoteChange, NoteDetail, NoteFilter, NoteLink, NotesState, Shelf, TagCount};
use crate::db::new_id;
use crate::error::{Error, Result};
use crate::features::doc_edits;

const EXCERPT: usize = 280;
const MAX_TAGS: usize = 20;
/// Notes stay in the trash this long, then go for good.
pub const TRASH_DAYS: i64 = 30;
/// Sticky notes showing on the overview at once.
pub const MAX_ON_OVERVIEW: usize = 24;
/// Sticky note colours, as the app draws them.
pub const COLORS: &[&str] = &["yellow", "orange", "pink", "purple", "blue", "green", "grey"];

fn notes() -> Select<note::Entity> {
    note::Entity::find().filter(note::Column::DeletedAt.is_null())
}

fn folders() -> Select<folder::Entity> {
    folder::Entity::find().filter(folder::Column::DeletedAt.is_null())
}

fn edits() -> Select<edit::Entity> {
    edit::Entity::find().filter(edit::Column::DeletedAt.is_null())
}

/// Soft-deletes the matching rows, so the deletion syncs.
macro_rules! bury {
    ($entity:ident, $db:expr, $condition:expr) => {
        $entity::Entity::update_many()
            .col_expr($entity::Column::DeletedAt, Expr::value(Some(Utc::now())))
            .col_expr($entity::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter($entity::Column::DeletedAt.is_null())
            .filter($condition)
            .exec($db)
            .await?
    };
}

async fn find(db: &impl ConnectionTrait, id: &str) -> Result<note::Model> {
    notes().filter(note::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Note"))
}

async fn find_folder(db: &impl ConnectionTrait, id: &str) -> Result<folder::Model> {
    folders().filter(folder::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Folder"))
}

pub fn split_tags(tags: &str) -> Vec<String> {
    tags.split(',').map(str::trim).filter(|t| !t.is_empty()).map(String::from).collect()
}

/// Tags as kept: lowercase, no #, no repeats, at most `MAX_TAGS`.
fn clean_tags(tags: &[String]) -> String {
    let mut seen = Vec::new();
    for t in tags {
        let t = t.trim().trim_start_matches('#').to_lowercase().replace(',', " ");
        let t = t.split_whitespace().collect::<Vec<_>>().join("-");
        if !t.is_empty() && !seen.contains(&t) {
            seen.push(t);
        }
    }
    seen.truncate(MAX_TAGS);
    seen.join(",")
}

fn clean_color(color: &str, sticky: bool) -> Result<String> {
    let color = color.trim().to_lowercase();
    if color.is_empty() {
        return Ok(if sticky { COLORS[0].into() } else { String::new() });
    }
    if !COLORS.contains(&color.as_str()) {
        return Err(Error::Invalid(format!("Sticky notes come in {}.", COLORS.join(", "))));
    }
    Ok(color)
}

/// What a note is called: its title, or else its first line.
pub fn name_of(n: &note::Model) -> String {
    let title = n.title.trim();
    if !title.is_empty() {
        return title.to_owned();
    }
    n.text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("").chars().take(80).collect()
}

pub fn card(n: &note::Model) -> NoteCard {
    let mut excerpt: String = n.text.chars().take(EXCERPT).collect();
    if n.text.chars().count() > EXCERPT {
        excerpt.push('…');
    }
    NoteCard {
        id: n.id.clone(),
        folder_id: n.folder_id.clone(),
        title: n.title.clone(),
        tags: split_tags(&n.tags),
        excerpt,
        words: n.words,
        pinned: n.pinned,
        sticky: n.sticky,
        color: n.color.clone(),
        on_overview: n.on_overview,
        trashed_at: n.trashed_at,
        created_at: n.created_at,
        updated_at: n.updated_at,
    }
}

// ---------- Notes ----------

/// A folder and every folder inside it.
fn with_subfolders(all: &[folder::Model], id: &str) -> HashSet<String> {
    let mut found = HashSet::from([id.to_owned()]);
    loop {
        let more: Vec<String> = all.iter().filter(|f| f.parent_id.as_ref().is_some_and(|p| found.contains(p)) && !found.contains(&f.id)).map(|f| f.id.clone()).collect();
        if more.is_empty() {
            return found;
        }
        found.extend(more);
    }
}

/// Notes matching the filter: pinned first, then by the chosen order.
pub async fn list(db: &DatabaseConnection, filter: NoteFilter) -> Result<Vec<NoteCard>> {
    let mut query = notes();
    query = match filter.shelf {
        Shelf::Trash => query.filter(note::Column::TrashedAt.is_not_null()),
        shelf => {
            let query = query.filter(note::Column::TrashedAt.is_null());
            match shelf {
                Shelf::Notes => query.filter(note::Column::Sticky.eq(false)),
                Shelf::Stickies => query.filter(note::Column::Sticky.eq(true)),
                Shelf::Overview => query.filter(note::Column::Sticky.eq(true)).filter(note::Column::OnOverview.eq(true)),
                _ => query,
            }
        }
    };
    match filter.folder.as_deref() {
        Some("none") => query = query.filter(note::Column::FolderId.is_null()),
        Some(id) => {
            let all = folders().all(db).await?;
            query = query.filter(note::Column::FolderId.is_in(with_subfolders(&all, id)));
        }
        None => {}
    }
    let words: Vec<String> = filter.search.unwrap_or_default().to_lowercase().split_whitespace().map(String::from).collect();
    let tag = filter.tag.map(|t| t.trim_start_matches('#').to_lowercase());
    let mut found: Vec<note::Model> = query
        .order_by_desc(note::Column::UpdatedAt)
        .all(db)
        .await?
        .into_iter()
        .filter(|n| tag.as_ref().is_none_or(|t| split_tags(&n.tags).contains(t)))
        .filter(|n| {
            let haystack = format!("{} {} {}", n.title, n.text, n.tags).to_lowercase();
            words.iter().all(|w| haystack.contains(w.as_str()))
        })
        .collect();
    match filter.sort.as_deref() {
        Some("created") => found.sort_by_key(|n| std::cmp::Reverse(n.created_at)),
        Some("title") => found.sort_by_key(|n| name_of(n).to_lowercase()),
        _ => {}
    }
    // Stable: the order above holds within pinned and unpinned.
    if filter.shelf != Shelf::Trash {
        found.sort_by_key(|n| !n.pinned);
    }
    Ok(found.iter().map(card).collect())
}

/// The note with its edits, and the notes that link to it.
pub async fn get(db: &DatabaseConnection, id: &str) -> Result<NoteDetail> {
    let n = find(db, id).await?;
    let rows = edits().filter(edit::Column::NoteId.eq(id)).order_by_asc(edit::Column::CreatedAt).all(db).await?;
    let edits = doc_edits::assemble(rows.into_iter().map(|r| doc_edits::Row { id: r.id, chunk_of: r.chunk_of, part: r.part, parts: r.parts, data: r.data }));
    let name = name_of(&n);
    let backlinks = if name.is_empty() {
        Vec::new()
    } else {
        let needle = format!("[[{}]]", name.to_lowercase());
        notes()
            .filter(note::Column::TrashedAt.is_null())
            .filter(note::Column::Id.ne(id))
            .order_by_desc(note::Column::UpdatedAt)
            .all(db)
            .await?
            .iter()
            .filter(|other| other.text.to_lowercase().contains(&needle))
            .map(|other| NoteLink { id: other.id.clone(), title: name_of(other) })
            .collect()
    };
    Ok(NoteDetail { tags: split_tags(&n.tags), note: n, edits, backlinks })
}

/// Every note by name, for [[links]]: what to suggest, and where each goes.
pub async fn titles(db: &DatabaseConnection) -> Result<Vec<NoteLink>> {
    Ok(notes()
        .filter(note::Column::TrashedAt.is_null())
        .order_by_desc(note::Column::UpdatedAt)
        .all(db)
        .await?
        .iter()
        .map(|n| NoteLink { id: n.id.clone(), title: name_of(n) })
        .filter(|l| !l.title.is_empty())
        .collect())
}

async fn overview_count(db: &impl ConnectionTrait) -> Result<usize> {
    Ok(notes()
        .filter(note::Column::TrashedAt.is_null())
        .filter(note::Column::Sticky.eq(true))
        .filter(note::Column::OnOverview.eq(true))
        .all(db)
        .await?
        .len())
}

async fn check_room(db: &impl ConnectionTrait) -> Result<()> {
    if overview_count(db).await? >= MAX_ON_OVERVIEW {
        return Err(Error::Invalid(format!("The overview holds up to {MAX_ON_OVERVIEW} sticky notes. Take one off first.")));
    }
    Ok(())
}

pub async fn create(db: &DatabaseConnection, new: NewNote) -> Result<note::Model> {
    if let Some(f) = &new.folder_id {
        find_folder(db, f).await?;
    }
    let on_overview = new.sticky && new.on_overview;
    if on_overview {
        check_room(db).await?;
    }
    let now = Utc::now();
    Ok(note::ActiveModel {
        id: Set(new_id()),
        folder_id: Set(new.folder_id),
        title: Set(new.title.trim().chars().take(200).collect()),
        tags: Set(String::new()),
        text: Set(String::new()),
        words: Set(0),
        pinned: Set(false),
        sticky: Set(new.sticky),
        color: Set(clean_color(&new.color, new.sticky)?),
        on_overview: Set(on_overview),
        trashed_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

/// Changes only what's given.
pub async fn change(db: &DatabaseConnection, id: &str, change: NoteChange) -> Result<note::Model> {
    let n = find(db, id).await?;
    let sticky = change.sticky.unwrap_or(n.sticky);
    let showing = change.on_overview.unwrap_or(n.on_overview) && sticky;
    if showing && !n.on_overview {
        check_room(db).await?;
    }
    let color = match &change.color {
        Some(c) => clean_color(c, sticky)?,
        None if sticky && n.color.is_empty() => COLORS[0].into(),
        None => n.color.clone(),
    };
    let mut active: note::ActiveModel = n.clone().into();
    if let Some(f) = change.folder_id {
        let folder = (!f.is_empty()).then_some(f);
        if let Some(f) = &folder {
            find_folder(db, f).await?;
        }
        active.folder_id = Set(folder);
    }
    if let Some(t) = change.title {
        active.title = Set(t.trim().chars().take(200).collect());
    }
    if let Some(tags) = change.tags {
        active.tags = Set(clean_tags(&tags));
    }
    if let Some(p) = change.pinned {
        active.pinned = Set(p);
    }
    active.sticky = Set(sticky);
    active.color = Set(color);
    active.on_overview = Set(showing);
    Ok(active.update(db).await?)
}

/// Saves new edits to the text (a Yjs update, base64), and the plain-text
/// copy as it now reads.
pub async fn save(db: &DatabaseConnection, id: &str, update: Option<String>, text: String, words: i32) -> Result<note::Model> {
    let n = find(db, id).await?;
    let txn = db.begin().await?;
    if let Some(update) = update.filter(|u| !u.is_empty()) {
        insert_update(&txn, id, &update).await?;
    }
    let saved = if n.text != text || n.words != words {
        let mut active: note::ActiveModel = n.into();
        active.text = Set(text);
        active.words = Set(words.max(0));
        active.update(&txn).await?
    } else {
        n
    };
    txn.commit().await?;
    Ok(saved)
}

async fn insert_update(db: &impl ConnectionTrait, note_id: &str, data: &str) -> Result<()> {
    let now = Utc::now();
    for row in doc_edits::split(data) {
        edit::ActiveModel {
            id: Set(row.id),
            note_id: Set(note_id.into()),
            data: Set(row.data),
            chunk_of: Set(row.chunk_of),
            part: Set(row.part),
            parts: Set(row.parts),
            created_at: Set(now),
            updated_at: Set(now),
            deleted_at: Set(None),
        }
        .insert(db)
        .await?;
    }
    Ok(())
}

/// Replaces some of a note's edits with one snapshot holding them all. Only
/// rows named are removed, so edits another computer adds meanwhile stay.
pub async fn compact(db: &DatabaseConnection, id: &str, snapshot: &str, replaces: Vec<String>) -> Result<()> {
    find(db, id).await?;
    let txn = db.begin().await?;
    insert_update(&txn, id, snapshot).await?;
    bury!(edit, &txn, Condition::all().add(edit::Column::NoteId.eq(id)).add(edit::Column::Id.is_in(replaces)));
    txn.commit().await?;
    Ok(())
}

/// To the trash: off the overview, and gone for good after `TRASH_DAYS`.
pub async fn trash(db: &DatabaseConnection, id: &str) -> Result<()> {
    let mut active: note::ActiveModel = find(db, id).await?.into();
    active.trashed_at = Set(Some(Utc::now()));
    active.on_overview = Set(false);
    active.pinned = Set(false);
    active.update(db).await?;
    Ok(())
}

pub async fn restore(db: &DatabaseConnection, id: &str) -> Result<note::Model> {
    let n = find(db, id).await?;
    // Its folder may have gone meanwhile.
    let folder = match &n.folder_id {
        Some(f) if find_folder(db, f).await.is_ok() => Some(f.clone()),
        _ => None,
    };
    let mut active: note::ActiveModel = n.into();
    active.trashed_at = Set(None);
    active.folder_id = Set(folder);
    Ok(active.update(db).await?)
}

/// Deletes a note for good.
pub async fn delete(db: &DatabaseConnection, id: &str) -> Result<()> {
    let txn = db.begin().await?;
    bury!(edit, &txn, edit::Column::NoteId.eq(id));
    bury!(note, &txn, note::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

/// Deletes everything in the trash, or only what's been there `older_than`.
pub async fn empty_trash(db: &DatabaseConnection, older_than: Option<Duration>) -> Result<u32> {
    let mut query = notes().filter(note::Column::TrashedAt.is_not_null());
    if let Some(age) = older_than {
        query = query.filter(note::Column::TrashedAt.lt(Utc::now() - age));
    }
    let ids: Vec<String> = query.all(db).await?.into_iter().map(|n| n.id).collect();
    if ids.is_empty() {
        return Ok(0);
    }
    let txn = db.begin().await?;
    bury!(edit, &txn, edit::Column::NoteId.is_in(ids.clone()));
    bury!(note, &txn, note::Column::Id.is_in(ids.clone()));
    txn.commit().await?;
    Ok(ids.len() as u32)
}

// ---------- Folders ----------

pub async fn create_folder(db: &DatabaseConnection, name: &str, parent_id: Option<String>) -> Result<folder::Model> {
    let name = folder_name(name)?;
    if let Some(p) = &parent_id {
        find_folder(db, p).await?;
    }
    let position = folders().all(db).await?.iter().filter(|f| f.parent_id == parent_id).map(|f| f.position + 1).max().unwrap_or(0);
    let now = Utc::now();
    Ok(folder::ActiveModel {
        id: Set(new_id()),
        name: Set(name),
        parent_id: Set(parent_id),
        position: Set(position),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

fn folder_name(name: &str) -> Result<String> {
    let name: String = name.trim().chars().take(80).collect();
    if name.is_empty() {
        return Err(Error::Invalid("Give the folder a name.".into()));
    }
    Ok(name)
}

pub async fn rename_folder(db: &DatabaseConnection, id: &str, name: &str) -> Result<folder::Model> {
    let mut active: folder::ActiveModel = find_folder(db, id).await?.into();
    active.name = Set(folder_name(name)?);
    Ok(active.update(db).await?)
}

/// Puts a folder inside another (or at the top, with None).
pub async fn move_folder(db: &DatabaseConnection, id: &str, parent_id: Option<String>) -> Result<folder::Model> {
    let f = find_folder(db, id).await?;
    if let Some(p) = &parent_id {
        find_folder(db, p).await?;
        if with_subfolders(&folders().all(db).await?, id).contains(p) {
            return Err(Error::Invalid("A folder can't go inside itself.".into()));
        }
    }
    let mut active: folder::ActiveModel = f.into();
    active.parent_id = Set(parent_id);
    Ok(active.update(db).await?)
}

/// Deletes a folder. What was inside moves up to where the folder was.
pub async fn delete_folder(db: &DatabaseConnection, id: &str) -> Result<()> {
    let f = find_folder(db, id).await?;
    let txn = db.begin().await?;
    note::Entity::update_many()
        .col_expr(note::Column::FolderId, Expr::value(f.parent_id.clone()))
        .col_expr(note::Column::UpdatedAt, Expr::value(Utc::now()))
        .filter(note::Column::FolderId.eq(id))
        .filter(note::Column::DeletedAt.is_null())
        .exec(&txn)
        .await?;
    folder::Entity::update_many()
        .col_expr(folder::Column::ParentId, Expr::value(f.parent_id.clone()))
        .col_expr(folder::Column::UpdatedAt, Expr::value(Utc::now()))
        .filter(folder::Column::ParentId.eq(id))
        .filter(folder::Column::DeletedAt.is_null())
        .exec(&txn)
        .await?;
    bury!(folder, &txn, folder::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- The side panel ----------

/// Folders, tags and counts. Empties notes out of the trash once they've
/// been there `TRASH_DAYS`.
pub async fn state(db: &DatabaseConnection) -> Result<NotesState> {
    empty_trash(db, Some(Duration::days(TRASH_DAYS))).await?;
    let all = notes().all(db).await?;
    let live: Vec<&note::Model> = all.iter().filter(|n| n.trashed_at.is_none()).collect();

    let mut per_folder: HashMap<&str, u32> = HashMap::new();
    let mut tags: HashMap<String, u32> = HashMap::new();
    for n in &live {
        if let Some(f) = &n.folder_id {
            *per_folder.entry(f.as_str()).or_default() += 1;
        }
        for t in split_tags(&n.tags) {
            *tags.entry(t).or_default() += 1;
        }
    }
    let mut tags: Vec<TagCount> = tags.into_iter().map(|(tag, count)| TagCount { tag, count }).collect();
    tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));

    let mut folders: Vec<FolderView> = folders()
        .all(db)
        .await?
        .into_iter()
        .map(|f| FolderView { count: per_folder.get(f.id.as_str()).copied().unwrap_or(0), id: f.id, name: f.name, parent_id: f.parent_id, position: f.position })
        .collect();
    folders.sort_by(|a, b| a.position.cmp(&b.position).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));

    Ok(NotesState {
        folders,
        tags,
        notes: live.iter().filter(|n| !n.sticky).count() as u32,
        stickies: live.iter().filter(|n| n.sticky).count() as u32,
        unfiled: live.iter().filter(|n| !n.sticky && n.folder_id.is_none()).count() as u32,
        trash: all.iter().filter(|n| n.trashed_at.is_some()).count() as u32,
    })
}
