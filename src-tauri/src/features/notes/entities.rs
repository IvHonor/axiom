//! SeaORM entities for the Notes tables. Sync-ready like every feature:
//! UUID ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// A folder of notes. Folders can sit inside folders.
pub mod folder {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "note_folders")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        pub parent_id: Option<String>,
        pub position: i32,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// A note, or a sticky note: its title, where it's filed, and a plain-text
/// copy of what's written (the text itself is the sum of its edits).
pub mod note {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "notes")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub folder_id: Option<String>,
        /// May be empty: the first line then serves.
        pub title: String,
        /// Comma-separated, lowercase.
        pub tags: String,
        /// What's written, as plain text, for search, previews and links.
        pub text: String,
        pub words: i32,
        pub pinned: bool,
        /// A sticky note: short, coloured, and can sit on the overview.
        pub sticky: bool,
        /// A sticky note's colour ("yellow", "pink"…).
        pub color: String,
        pub on_overview: bool,
        /// In the trash since then; emptied after `TRASH_DAYS`.
        pub trashed_at: Option<DateTimeUtc>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// Some edits to a note's text: a Yjs update, base64 (see `doc_edits`).
pub mod edit {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "note_edits")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub note_id: String,
        pub data: String,
        pub chunk_of: Option<String>,
        pub part: i32,
        pub parts: i32,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}
