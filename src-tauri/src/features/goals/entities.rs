//! SeaORM entities for the Goals tables. Sync-ready like every feature:
//! UUID ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// A goal: what, why, how it's measured, and by when.
pub mod goal {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "goals")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub title: String,
        /// An emoji, or empty for the area's.
        pub icon: String,
        /// "health", "career", "money", "learning", "relationships",
        /// "personal", "home" or "fun".
        pub area: String,
        /// "target" (a number), "milestones", or "once" (one thing to do).
        pub kind: String,
        /// Where a target's number comes from: "manual", or another
        /// extension (see `sources.rs`).
        pub source: String,
        /// The account, project or module it follows, for those sources.
        pub source_id: String,
        pub start_value: f64,
        pub target_value: f64,
        /// "km", "£", "books"… Empty for a plain number.
        pub unit: String,
        /// For manual targets: "total" (check-ins add up) or "latest" (the
        /// latest check-in is where you are, like a weight).
        pub measure: String,
        pub start_date: Date,
        pub due_date: Option<Date>,
        /// WOOP: why it matters, what might get in the way, and the
        /// if-then plan for when it does.
        pub why: String,
        pub obstacle: String,
        pub plan: String,
        /// "active", "paused", "done" or "dropped".
        pub status: String,
        pub completed_on: Option<Date>,
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

/// A check-in on a manual target: a number on a day, and a note.
pub mod log {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "goal_logs")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub goal_id: String,
        pub day: Date,
        pub value: f64,
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

/// A step towards a milestones goal.
pub mod milestone {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "goal_milestones")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub goal_id: String,
        pub title: String,
        pub due_date: Option<Date>,
        pub done_on: Option<Date>,
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
