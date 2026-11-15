//! The Playground: who's joined (with a handle and their Lemma), friendships,
//! each person's shared totals per metric, and the cheers friends send.
//! See `axiom_protocol::playground`.

use sea_orm_migration::{prelude::*, schema::*};

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m018_playground"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.create_table(
            Table::create()
                .table(PlaygroundPlayers::Table)
                .if_not_exists()
                .col(string(PlaygroundPlayers::UserId).primary_key())
                // Lowercased; see `normalize_handle`.
                .col(string_uniq(PlaygroundPlayers::Handle))
                .col(string_uniq(PlaygroundPlayers::FriendCode))
                .col(boolean(PlaygroundPlayers::Global).default(false))
                // Comma-separated metric ids.
                .col(text(PlaygroundPlayers::Shared))
                // `LemmaCard` as JSON.
                .col(text(PlaygroundPlayers::Lemma))
                .col(timestamp_with_time_zone(PlaygroundPlayers::JoinedAt))
                .col(timestamp_with_time_zone(PlaygroundPlayers::UpdatedAt))
                .foreign_key(ForeignKey::create().from(PlaygroundPlayers::Table, PlaygroundPlayers::UserId).to(Users::Table, Users::Id).on_delete(ForeignKeyAction::Cascade))
                .to_owned(),
        )
        .await?;

        // One row per pair, the lower id first, so a pair can't be in twice.
        m.create_table(
            Table::create()
                .table(PlaygroundFriendships::Table)
                .if_not_exists()
                .col(string(PlaygroundFriendships::Low))
                .col(string(PlaygroundFriendships::High))
                .col(string(PlaygroundFriendships::RequestedBy))
                .col(timestamp_with_time_zone(PlaygroundFriendships::CreatedAt))
                // None while waiting for an answer.
                .col(timestamp_with_time_zone_null(PlaygroundFriendships::AcceptedAt))
                .primary_key(Index::create().col(PlaygroundFriendships::Low).col(PlaygroundFriendships::High))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().if_not_exists().name("idx_friendships_high").table(PlaygroundFriendships::Table).col(PlaygroundFriendships::High).to_owned()).await?;

        m.create_table(
            Table::create()
                .table(PlaygroundStats::Table)
                .if_not_exists()
                .col(string(PlaygroundStats::UserId))
                .col(string(PlaygroundStats::Metric))
                // Copied from players.global, so a global board is one indexed query.
                .col(boolean(PlaygroundStats::Global).default(false))
                .col(date(PlaygroundStats::WeekKey))
                .col(big_integer(PlaygroundStats::Week))
                .col(big_integer(PlaygroundStats::LastWeek))
                .col(date(PlaygroundStats::MonthKey))
                .col(big_integer(PlaygroundStats::Month))
                .col(big_integer(PlaygroundStats::LastMonth))
                .col(big_integer(PlaygroundStats::Total))
                .col(integer(PlaygroundStats::Streak))
                .col(integer(PlaygroundStats::BestStreak))
                .col(date_null(PlaygroundStats::StreakThrough))
                .col(date(PlaygroundStats::AsOf))
                .col(timestamp_with_time_zone(PlaygroundStats::UpdatedAt))
                .primary_key(Index::create().col(PlaygroundStats::UserId).col(PlaygroundStats::Metric))
                .to_owned(),
        )
        .await?;
        m.create_index(
            Index::create()
                .if_not_exists()
                .name("idx_player_stats_board")
                .table(PlaygroundStats::Table)
                .col(PlaygroundStats::Metric)
                .col(PlaygroundStats::Global)
                .to_owned(),
        )
        .await?;

        m.create_table(
            Table::create()
                .table(PlaygroundCheers::Table)
                .if_not_exists()
                .col(string(PlaygroundCheers::FromId))
                .col(string(PlaygroundCheers::ToId))
                // UTC.
                .col(date(PlaygroundCheers::Day))
                .col(timestamp_with_time_zone(PlaygroundCheers::CreatedAt))
                .primary_key(Index::create().col(PlaygroundCheers::FromId).col(PlaygroundCheers::ToId).col(PlaygroundCheers::Day))
                .to_owned(),
        )
        .await?;
        m.create_index(Index::create().if_not_exists().name("idx_cheers_to").table(PlaygroundCheers::Table).col(PlaygroundCheers::ToId).col(PlaygroundCheers::Day).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum PlaygroundPlayers {
    Table,
    UserId,
    Handle,
    FriendCode,
    Global,
    Shared,
    Lemma,
    JoinedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum PlaygroundFriendships {
    Table,
    Low,
    High,
    RequestedBy,
    CreatedAt,
    AcceptedAt,
}

#[derive(DeriveIden)]
enum PlaygroundStats {
    Table,
    UserId,
    Metric,
    Global,
    WeekKey,
    Week,
    LastWeek,
    MonthKey,
    Month,
    LastMonth,
    Total,
    Streak,
    BestStreak,
    StreakThrough,
    AsOf,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum PlaygroundCheers {
    Table,
    FromId,
    ToId,
    Day,
    CreatedAt,
}
