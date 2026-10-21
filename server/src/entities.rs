//! The server's tables as Rust types.

pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

pub mod user {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "users")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        /// Always trimmed and lowercased; see `axiom_protocol::normalize_email`.
        #[sea_orm(unique)]
        pub email: String,
        /// An Argon2id PHC string, which carries its own salt and parameters.
        pub password_hash: String,
        pub created_at: DateTimeUtc,
        /// The last sequence number handed to one of this account's records.
        pub sync_seq: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}

    impl From<Model> for axiom_protocol::User {
        fn from(user: Model) -> Self {
            Self { id: user.id, email: user.email, created_at: user.created_at }
        }
    }
}

pub mod sync_record {
    use sea_orm::entity::prelude::*;

    /// One synced row from one of an account's devices.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "sync_records")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub user_id: String,
        #[sea_orm(primary_key, auto_increment = false)]
        pub table_name: String,
        #[sea_orm(primary_key, auto_increment = false)]
        pub record_id: String,
        /// The row as a JSON object, merged from every device's changes.
        pub data: String,
        /// JSON object: field name -> when it last changed (Unix ms).
        pub field_times: String,
        /// Bumped on every push that touches the row.
        pub seq: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod password_reset {
    use sea_orm::entity::prelude::*;

    /// A code emailed to reset a forgotten password. One live code per user.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "password_resets")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub user_id: String,
        pub code_hash: String,
        /// Wrong guesses so far; the code stops working after a few.
        pub attempts: i32,
        pub created_at: DateTimeUtc,
        pub expires_at: DateTimeUtc,
        pub used_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod session {
    use sea_orm::entity::prelude::*;

    /// A signed-in device.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "sessions")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub user_id: String,
        pub device_name: String,
        /// SHA-256 of the current refresh token.
        #[sea_orm(unique)]
        pub refresh_hash: String,
        /// SHA-256 of the token it replaced, to spot a stolen token being reused.
        pub previous_hash: Option<String>,
        pub created_at: DateTimeUtc,
        pub last_used_at: DateTimeUtc,
        /// Pushed forward on every refresh, so a device used weekly stays signed in.
        pub expires_at: DateTimeUtc,
        pub revoked_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}
