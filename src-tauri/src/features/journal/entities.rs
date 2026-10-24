//! SeaORM entities for the Journal's tables. Sync-ready like every feature:
//! UUID ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// A journal entry: its day, how you felt, and a plain-text copy of what
/// you wrote (the text itself is the sum of its edits).
pub mod entry {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "journal_entries")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub day: Date,
        /// May be empty: the first line then serves.
        pub title: String,
        /// 1 (awful) to 5 (great).
        pub mood: Option<i16>,
        /// 1 (drained) to 5 (buzzing).
        pub energy: Option<i16>,
        /// Comma-separated, lowercase.
        pub tags: String,
        /// The prompt it answers, if one was picked.
        pub prompt: String,
        /// What's written, as plain text, for search and previews.
        pub text: String,
        pub words: i32,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// Some edits to an entry's text: a Yjs update, base64. A big one (a
/// snapshot) is split into parts that share `chunk_of`, so no row outgrows
/// what sync carries.
pub mod edit {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "journal_edits")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub entry_id: String,
        pub data: String,
        /// The first part's id, when split; None for a whole update.
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
