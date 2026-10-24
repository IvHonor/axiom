//! SeaORM entities for Learning's tables. Sync-ready like every feature:
//! UUID ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// Something you're learning: "Rust", "Spanish", "Machine learning".
pub mod skill {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "learning_skills")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        /// An emoji.
        pub icon: String,
        /// One of the palette's names, e.g. "blue".
        pub color: String,
        /// Why it matters to you. May be empty.
        #[sea_orm(column_type = "Text")]
        pub why: String,
        /// Done with, or on hold: kept, but out of the way.
        pub archived: bool,
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

/// What you learn a skill from: a book, a course, a video series, anything.
pub mod source {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "learning_sources")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub skill_id: String,
        /// "book", "course", "video" or "other".
        pub kind: String,
        pub title: String,
        /// Author, instructor or channel. May be empty.
        pub author: String,
        /// Where it lives: the course page, the playlist, the docs.
        pub link: Option<String>,
        /// A book's cover on Open Library.
        pub cover_url: Option<String>,
        /// What its units are called: "chapter", "lecture", "video", "lesson"…
        pub unit_name: String,
        /// When you want to have finished it.
        pub finish_by: Option<Date>,
        /// When every unit was done.
        pub finished_on: Option<Date>,
        #[sea_orm(column_type = "Text")]
        pub notes: String,
        /// Order within the skill.
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

/// One chapter, section, lecture or video, in order. `level` nests it like a
/// table of contents: a unit followed by deeper ones is a heading for them.
pub mod unit {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "learning_units")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub source_id: String,
        pub title: String,
        /// 0 for a top-level unit, 1 for one inside it, and so on.
        pub level: i16,
        /// How long it runs, for lectures and videos.
        pub minutes: Option<i32>,
        /// Where it starts, for books.
        pub page: Option<i32>,
        pub done_on: Option<Date>,
        /// How many reviews in: 0 none asked for, 1–3 waiting on the 1st–3rd.
        pub review_stage: i16,
        /// When it's next due for review.
        pub review_on: Option<Date>,
        #[sea_orm(column_type = "Text")]
        pub notes: String,
        /// Order within the source.
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

/// Time spent studying a source on a day.
pub mod session {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "learning_sessions")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub source_id: String,
        pub day: Date,
        pub minutes: i32,
        #[sea_orm(column_type = "Text")]
        pub note: String,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}
