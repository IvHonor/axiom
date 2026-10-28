//! SeaORM entities for the assistant's conversations. Sync-ready like every
//! feature (UUID ids, `updated_at` stamped on save, soft deletes), and
//! end-to-end encrypted when synced: chats are personal.

/// One conversation with Lemma.
pub mod chat {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "assistant_chats")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        /// The start of the first message, until renamed.
        pub title: String,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// One message: the person's, Lemma's (words and tool calls), or what a
/// tool returned.
pub mod message {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "assistant_messages")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub chat_id: String,
        /// Order within the chat.
        pub position: i64,
        /// "user", "assistant" or "tool".
        pub role: String,
        pub text: Option<String>,
        /// JSON: an assistant's tool calls, or a tool's call id, name and result.
        pub data: Option<String>,
        /// Which AI wrote an assistant message, e.g. "Gemini".
        pub provider: Option<String>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// A change Lemma prepared, waiting for the person to confirm or discard it.
pub mod proposal {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "assistant_proposals")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub chat_id: String,
        /// The tool call it answers.
        pub call_id: String,
        /// The area (extension id) and tool, e.g. "birthdays", "birthdays_add".
        pub area: String,
        pub tool: String,
        /// JSON: the tool's arguments, applied as they are on confirming.
        pub arguments: String,
        /// JSON: the preview card (see `skills::Preview`).
        pub preview: String,
        /// "pending", "confirmed", "discarded" or "failed".
        pub status: String,
        /// What confirming did, or why it failed.
        pub outcome: Option<String>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}
