//! The notifications tables.

/// The user's choice for one notification: which channels it comes on. A
/// notification without a row uses the defaults (see `settings`). Synced.
pub mod setting {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "notification_settings")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        /// The notification's kind, e.g. "uni.today".
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub in_app: bool,
        pub desktop: bool,
        pub email: bool,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// A notification that came due on this computer. Kept here only: each
/// computer shows its own, and its id (kind and day) stops repeats.
pub mod note {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "notifications")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        /// "uni.today:2026-10-27".
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub kind: String,
        pub title: String,
        pub body: String,
        /// Listed in the app (off when only the desktop notification was wanted).
        pub in_app: bool,
        pub created_at: DateTimeUtc,
        pub read_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}
