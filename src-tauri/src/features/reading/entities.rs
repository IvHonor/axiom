//! SeaORM entities for the Reading Tracker tables. Sync-ready like every
//! feature: UUID ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// A book in the library, and where you are in it.
pub mod book {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "reading_books")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub title: String,
        /// Comma-separated, as shown.
        pub authors: String,
        pub cover_url: Option<String>,
        /// Open Library's work ("/works/OL…W"), when found there.
        pub work_key: Option<String>,
        /// The edition chosen ("/books/OL…M"), if any.
        pub edition_key: Option<String>,
        pub isbn: Option<String>,
        pub published_year: Option<i32>,
        /// Page count from Open Library.
        pub api_pages: Option<i32>,
        /// Your own page count, when Open Library's is wrong for your copy.
        pub pages: Option<i32>,
        /// "print", "ebook" or "audio".
        pub format: String,
        /// What `progress` counts: "pages", "percent" or "minutes".
        pub unit: String,
        /// An audiobook's length.
        pub audio_minutes: Option<i32>,
        /// "want", "reading", "finished" or "dnf" (did not finish).
        pub status: String,
        pub progress: i32,
        /// Half stars: 1 is half a star, 10 is five stars.
        pub rating: Option<i16>,
        pub review: String,
        pub started_on: Option<Date>,
        /// When it was finished, or put down (did not finish).
        pub finished_on: Option<Date>,
        /// Order on the want-to-read shelf.
        pub position: f64,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// A day's reading of one book: from where to where, and for how long.
pub mod session {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "reading_sessions")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub book_id: String,
        pub day: Date,
        pub start_progress: i32,
        pub end_progress: i32,
        /// The book's unit when this was logged.
        pub unit: String,
        /// Pages read, worked out from the progress (0 for audiobooks).
        pub pages: i32,
        /// Time spent: listened for audiobooks, otherwise as entered.
        pub minutes: i32,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// Something to remember from a book: a note, a quote or a bookmarked page.
pub mod note {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "reading_notes")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub book_id: String,
        /// "note", "quote" or "bookmark".
        pub kind: String,
        pub page: Option<i32>,
        pub text: String,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// An earlier read of a book you've started again.
pub mod read {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "reading_reads")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub book_id: String,
        pub started_on: Option<Date>,
        pub finished_on: Option<Date>,
        /// "finished" or "dnf".
        pub outcome: String,
        pub rating: Option<i16>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// How many books you mean to read in a year. The id is the year, so two
/// devices setting it merge into one goal.
pub mod goal {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "reading_goals")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub year: i32,
        pub books: i32,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}
