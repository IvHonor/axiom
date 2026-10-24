//! Shapes sent to and from React. Mirrored in `src/features/notes/api.ts`.

use sea_orm::prelude::DateTimeUtc;
use serde::{Deserialize, Serialize};

use super::entities::note;
pub use crate::features::doc_edits::EditView;

/// A note for lists: everything but the full text, with an excerpt.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteCard {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub tags: Vec<String>,
    pub excerpt: String,
    pub words: i32,
    pub pinned: bool,
    pub sticky: bool,
    pub color: String,
    pub on_overview: bool,
    pub trashed_at: Option<DateTimeUtc>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

/// Another note, by name: a link's target, or a backlink.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLink {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetail {
    pub note: note::Model,
    pub tags: Vec<String>,
    /// Oldest first; applied together in any order they make the same text.
    pub edits: Vec<EditView>,
    /// Notes that link here with [[this note's title]].
    pub backlinks: Vec<NoteLink>,
}

/// A new note or sticky note.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewNote {
    pub folder_id: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub sticky: bool,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub on_overview: bool,
}

/// Changes to a note: only what's given changes. `folder_id: ""` unfiles it.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteChange {
    pub folder_id: Option<String>,
    pub title: Option<String>,
    pub tags: Option<Vec<String>>,
    pub pinned: Option<bool>,
    pub sticky: Option<bool>,
    pub color: Option<String>,
    pub on_overview: Option<bool>,
}

/// Which notes to list.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Shelf {
    /// Every note and sticky note not in the trash.
    #[default]
    All,
    Notes,
    Stickies,
    /// Sticky notes showing on the overview.
    Overview,
    Trash,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFilter {
    #[serde(default)]
    pub shelf: Shelf,
    pub search: Option<String>,
    pub tag: Option<String>,
    /// A folder's notes (and its subfolders'), or "none" for unfiled ones.
    pub folder: Option<String>,
    /// "edited" (the default), "created" or "title". Pinned notes come first.
    pub sort: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderView {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub position: i32,
    /// Notes directly inside.
    pub count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: u32,
}

/// Everything the side panel needs: folders, tags and counts.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesState {
    pub folders: Vec<FolderView>,
    pub tags: Vec<TagCount>,
    pub notes: u32,
    pub stickies: u32,
    pub unfiled: u32,
    pub trash: u32,
}
