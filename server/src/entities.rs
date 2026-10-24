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
        /// When an admin let them in. None while on the waiting list.
        pub approved_at: Option<DateTimeUtc>,
        /// The name to show; None shows the email instead.
        pub display_name: Option<String>,
        /// The profile picture as a `data:image/...;base64,` URL, small and square.
        pub avatar: Option<String>,
        /// "member" or "admin". Owners (ADMIN_EMAILS) are admins whatever this says.
        pub role: String,
        /// Comma-separated, from `axiom_protocol::permissions::ALL`.
        pub permissions: String,
        /// The end-to-end encryption key, wrapped on a device. Opaque here.
        pub encryption_key: Option<String>,
        /// `password_hash` is of a login key (`axiom_protocol::LOGIN_KEY_PREFIX`),
        /// not of the password itself as before them.
        pub login_key: bool,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
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

pub mod space {
    use sea_orm::entity::prelude::*;

    /// A project shared between accounts. Its id is the project's.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "spaces")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub owner_id: String,
        /// The last sequence number handed to one of its records.
        pub seq: i64,
        pub created_at: DateTimeUtc,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod space_member {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "space_members")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub space_id: String,
        #[sea_orm(primary_key, auto_increment = false)]
        pub user_id: String,
        /// See `axiom_protocol::Role`.
        pub role: String,
        pub joined_at: DateTimeUtc,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod space_invite {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "space_invites")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub space_id: String,
        /// Normalised; the account may not exist yet.
        pub email: String,
        pub role: String,
        /// The inviter's user id.
        pub invited_by: String,
        pub created_at: DateTimeUtc,
        pub expires_at: DateTimeUtc,
        pub accepted_at: Option<DateTimeUtc>,
        /// Declined, or withdrawn by an admin.
        pub closed_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod space_record {
    use sea_orm::entity::prelude::*;

    /// One row of a shared board, merged from every member's changes.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "space_records")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub space_id: String,
        #[sea_orm(primary_key, auto_increment = false)]
        pub table_name: String,
        #[sea_orm(primary_key, auto_increment = false)]
        pub record_id: String,
        pub data: String,
        pub field_times: String,
        pub seq: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod planned_email {
    use sea_orm::entity::prelude::*;

    /// A notification email the app planned, sent at `send_at`.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "planned_emails")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub user_id: String,
        /// Stable per notification, e.g. `uni.today:2026-10-27`.
        #[sea_orm(primary_key, auto_increment = false)]
        pub key: String,
        pub kind: String,
        pub send_at: DateTimeUtc,
        /// `axiom_protocol::notify::Digest` as JSON.
        pub digest: String,
        /// Set once sent (or skipped), so it's never sent twice.
        pub sent_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod email_opt_out {
    use sea_orm::entity::prelude::*;

    /// A kind of notification email someone unsubscribed from by link.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "email_opt_outs")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub user_id: String,
        #[sea_orm(primary_key, auto_increment = false)]
        pub kind: String,
        pub at: DateTimeUtc,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod server_setting {
    use sea_orm::entity::prelude::*;

    /// The server's settings, changed from the admin panel. One row, id 1.
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "server_settings")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: i32,
        /// None follows WAITLIST from the environment.
        pub waitlist: Option<bool>,
        /// Comma-separated.
        pub default_permissions: String,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}
