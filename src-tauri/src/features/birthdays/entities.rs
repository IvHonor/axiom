//! SeaORM entities for the Birthdays tables. Sync-ready like every feature:
//! UUID ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// Someone's birthday, or an anniversary.
pub mod person {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "birthdays")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        /// "birthday" or "anniversary".
        pub occasion: String,
        pub month: i16,
        pub day: i16,
        /// When known, for ages ("turns 30").
        pub year: Option<i32>,
        /// "family", "friend", "partner", "work" or "other".
        pub relation: String,
        pub notes: String,
        /// Days ahead to remind, besides on the day (0 for only on the day).
        pub remind_days: i32,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// A gift idea for someone, from idea to given.
pub mod gift {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "birthday_gifts")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub person_id: String,
        pub idea: String,
        /// A shop link, if there is one.
        pub url: String,
        /// "idea", "bought" or "given".
        pub status: String,
        /// The year it was given.
        pub year: Option<i32>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}
