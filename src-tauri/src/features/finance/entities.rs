//! SeaORM entities for Finance's tables. Sync-ready like every feature: UUID
//! ids, `updated_at` stamped on save, soft deletes via `deleted_at`.

/// Somewhere money is kept: a current account, savings, a credit card, cash.
pub mod account {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "finance_accounts")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        /// "current", "savings", "credit", "cash" or "other".
        pub kind: String,
        /// ISO 4217, e.g. "GBP".
        pub currency: String,
        /// What was in it before the first transaction here, in minor units.
        pub opening_balance: i64,
        /// A palette name.
        pub color: String,
        pub position: f64,
        pub archived: bool,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// What money's spent on (or comes from), with an optional monthly budget.
pub mod category {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "finance_categories")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        /// "expense" or "income".
        pub kind: String,
        pub color: String,
        /// An emoji.
        pub icon: String,
        /// A month's budget in the home currency's minor units.
        pub budget: Option<i64>,
        pub position: f64,
        pub archived: bool,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// Money in (positive) or out (negative) of an account on a day.
pub mod transaction {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "finance_transactions")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub account_id: String,
        pub day: Date,
        /// In the account's currency, minor units: negative is money out.
        pub amount: i64,
        pub payee: String,
        pub category_id: Option<String>,
        pub notes: String,
        /// The other half of a transfer between your own accounts. Transfers
        /// are neither income nor spending.
        pub transfer_id: Option<String>,
        /// The recurring item it was confirmed from.
        pub recurring_id: Option<String>,
        /// Identifies it in a statement it was imported from (or matched to),
        /// so importing the statement again doesn't add it twice.
        pub import_ref: Option<String>,
        /// In the home currency at the day's exchange rate; None until known.
        pub home_amount: Option<i64>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// Something that happens regularly (salary, rent, a subscription), to
/// confirm each time it comes round.
pub mod recurring {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "finance_recurring")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        /// Signed, in the account's currency.
        pub amount: i64,
        pub account_id: String,
        pub category_id: Option<String>,
        /// "week", "month" or "year".
        pub every: String,
        /// The first time; later ones fall on the same weekday or day of the month.
        pub starts_on: Date,
        pub ends_on: Option<Date>,
        /// Comma-separated days skipped ("2026-11-01,2026-12-01").
        pub skipped: String,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// Learned from how payees are categorised: "TESCO STORES 4521" → Groceries.
/// Found by its pattern; the id is random, since ids are the one thing the
/// server can read.
pub mod rule {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "finance_rules")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        /// A payee's first words, lowercased and without numbers.
        pub pattern: String,
        /// A tidier payee name to use instead.
        pub rename: Option<String>,
        pub category_id: Option<String>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// How a bank's CSV statements are laid out, remembered after the first
/// import. Found again by the signature of its header row (kept inside the
/// mapping, which is encrypted; the id is random).
pub mod profile {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "finance_import_profiles")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        /// `import::csv::Mapping` as JSON.
        pub mapping: String,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// Finance's settings. One row, id "settings".
pub mod settings {
    use sea_orm::entity::prelude::*;
    use serde::Serialize;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
    #[sea_orm(table_name = "finance_settings")]
    #[serde(rename_all = "camelCase")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        /// Totals, budgets and reports are in this currency.
        pub home_currency: String,
        pub updated_at: DateTimeUtc,
        #[serde(skip)]
        pub deleted_at: Option<DateTimeUtc>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    crate::db::stamp_updated_at!();
}

/// An exchange rate on a day: 1 `base` = `rate` `quote`. Cached here only.
pub mod rate {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "finance_rates")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub day: Date,
        #[sea_orm(primary_key, auto_increment = false)]
        pub base: String,
        #[sea_orm(primary_key, auto_increment = false)]
        pub quote: String,
        pub rate: f64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}

    impl ActiveModelBehavior for ActiveModel {}
}
