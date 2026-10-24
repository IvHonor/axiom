//! SeaORM entities for University's tables. Sync-ready like every feature:
//! UUID ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// A term or semester: when it starts and how many teaching weeks it has.
pub mod term {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "uni_terms")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        /// Week 1 is the week this falls in, Monday to Sunday.
        pub starts_on: Date,
        pub weeks: i32,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// A module (course, unit) taken in a term.
pub mod module {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "uni_modules")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub term_id: String,
        /// The university's code, e.g. "COMP1001". May be empty.
        pub code: String,
        pub name: String,
        /// One of the palette's names, e.g. "blue".
        pub color: String,
        pub credits: Option<i32>,
        /// The module's page on the university's site (Moodle, Blackboard…).
        pub link: Option<String>,
        /// Order within the term.
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

/// One lecture (or seminar, lab, tutorial) and how far you've got with it.
pub mod lecture {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "uni_lectures")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub module_id: String,
        pub title: String,
        /// "lecture", "seminar", "lab" or "tutorial".
        pub kind: String,
        /// Teaching week, from 1.
        pub week: Option<i32>,
        /// When it's on. Once it's passed and you haven't caught up, you're behind.
        pub day: Option<Date>,
        pub topics: String,
        /// Whether there's a recording to catch up from.
        pub recorded: bool,
        pub attended_on: Option<Date>,
        /// When you'd gone through it properly: the lecture's ticked off.
        pub caught_up_on: Option<Date>,
        pub reviewed_on: Option<Date>,
        /// How well you understand it: 1 shaky, 2 okay, 3 solid.
        pub confidence: Option<i16>,
        pub notes: String,
        /// Order within the module.
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
