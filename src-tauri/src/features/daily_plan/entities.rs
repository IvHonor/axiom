//! SeaORM entities for the Daily Plan tables. Sync-ready like every feature:
//! UUID ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// A thing to do: on a day, or in the inbox when `day` is empty.
pub mod task {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "daily_plan_tasks")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub title: String,
        pub notes: String,
        pub day: Option<Date>,
        pub position: f64,
        pub estimate_minutes: Option<i32>,
        /// 1, 2 or 3 when it's one of the day's top priorities.
        pub focus_rank: Option<i16>,
        pub done_at: Option<DateTimeUtc>,
        /// The Project Board card this task stands for, if any.
        pub board_task_id: Option<String>,
        pub created_at: DateTimeUtc,
        /// Time tracked on it so far, not counting a timer that's running.
        pub actual_minutes: i32,
        /// When its running timer started; empty when no timer is running.
        pub timer_started_at: Option<DateTimeUtc>,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// A stretch of time on the timeline, optionally for a task.
pub mod block {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "daily_plan_blocks")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub day: Date,
        /// Minutes after midnight, local time.
        pub start_minute: i32,
        pub duration_minutes: i32,
        /// Shown when the block isn't for a task (a meeting, lunch, a gym session).
        pub title: String,
        /// A palette name; the frontend picks the shade.
        pub color: String,
        pub task_id: Option<String>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// The planner's settings: one row, id `settings`.
pub mod settings {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "daily_plan_settings")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub day_start_minute: i32,
        pub day_end_minute: i32,
        pub buffer_percent: i16,
        pub updated_at: DateTimeUtc,
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// One day's rituals: the morning intention and the evening reflection.
/// The id is the date, e.g. "2026-10-22".
pub mod day {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "daily_plan_days")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub intention: String,
        pub went_well: String,
        pub do_better: String,
        pub planned_at: Option<DateTimeUtc>,
        pub shutdown_at: Option<DateTimeUtc>,
        pub updated_at: DateTimeUtc,
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}
