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
        /// The routine that laid this block out, if any.
        pub routine_id: Option<String>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// A block that repeats on chosen weekdays.
pub mod routine {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "daily_plan_routines")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub title: String,
        pub start_minute: i32,
        pub duration_minutes: i32,
        pub color: String,
        /// Monday is bit 0 (1), Sunday bit 6 (64).
        pub weekdays: i16,
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

/// A calendar read from a private iCal link. Kept on this computer only.
pub mod calendar {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "daily_plan_calendars")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        /// Works like a password, so it never goes to the window.
        #[serde(skip)]
        pub url: String,
        pub color: String,
        pub refreshed_at: Option<DateTimeUtc>,
        /// Why the last read failed, ready to show.
        pub problem: Option<String>,
        pub created_at: DateTimeUtc,
        /// Set for a calendar from an account; empty for one added by link.
        pub account_id: Option<String>,
        /// Its id at the provider, or its CalDAV address.
        pub remote_id: Option<String>,
        /// Whether Axiom may publish the plan into it.
        pub writable: bool,
        /// Whether its events show on the planner.
        pub shown: bool,
        /// The calendar the plan is published into (at most one).
        pub publish: bool,
        #[serde(skip)]
        pub published_hash: Option<String>,
        /// The user's own, not shared with them read-only.
        pub mine: bool,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

/// One calendar event's share of one day, rebuilt on every read.
pub mod event {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "daily_plan_events")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub calendar_id: String,
        pub day: Date,
        pub start_minute: i32,
        pub duration_minutes: i32,
        pub all_day: bool,
        /// False for events marked as free time.
        pub busy: bool,
        pub title: String,
        pub color: String,
        /// The provider's id for it (an occurrence, for repeats), or its CalDAV address.
        #[serde(skip)]
        pub remote_id: Option<String>,
        /// When the whole event starts and ends, across days.
        pub start_at: Option<DateTimeUtc>,
        pub end_at: Option<DateTimeUtc>,
        pub location: String,
        pub description: String,
        /// The event in the provider's own app or site.
        pub link: Option<String>,
        pub recurring: bool,
        /// Whether Axiom may change it.
        pub editable: bool,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

/// A calendar account: Google, Microsoft (Outlook) or a CalDAV server such
/// as iCloud. Its sign-in lives in the system keychain, not here.
pub mod calendar_account {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "daily_plan_calendar_accounts")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        /// "google", "microsoft" or "caldav".
        pub provider: String,
        /// Who it is, usually an email address.
        pub name: String,
        /// The CalDAV server; empty for Google and Microsoft.
        pub server: String,
        /// Why the last sync failed, ready to show.
        pub problem: Option<String>,
        pub created_at: DateTimeUtc,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}
