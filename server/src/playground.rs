//! The Playground: handles, friends, cheers, and leaderboards of the totals
//! each person's device shares. See `axiom_protocol::playground` for why the
//! numbers come from devices, and which metrics may go on global boards.
//!
//! Every rule is checked here: who sees whom (friends, or people who opted
//! in to global boards), what's believable, and that only shared metrics are
//! kept. A metric someone stops sharing is deleted, not hidden.

use std::collections::{HashMap, HashSet};

use axiom_protocol::playground::{
    AddFriend, AddOutcome, Added, BOARD_SIZE, Board, BoardEntry, BoardQuery, CODE_ALPHABET, CODE_LEN, Friend, FriendRequest, Friends,
    MAX_FRIENDS, MAX_PENDING, METRICS, PeerAvatar, Perks, Period, Player, PlaygroundMe, PublishStats, Published, SavePlayground, Scope, check_handle,
    check_lemma, check_stats, first_light, first_of_month, metric, monday_of, normalize_friend_code, normalize_handle,
};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use chrono::{Days, NaiveDate, Utc};
use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Select, Set,
    TransactionTrait,
};

use crate::AppState;
use crate::auth::AuthUser;
use crate::entities::{playground_cheer as cheer, playground_friendship as friendship, playground_player as player, playground_stat as stat, user};
use crate::error::ApiError;

const NO_HANDLE: &str = "Pick a handle first, so friends can find you.";
const NOT_JOINED: &str = "Join the Playground first.";
/// Streaks still count this many days after their last day: a friend a time
/// zone ahead may already be on tomorrow, and today's not over for anyone yet.
const STREAK_GRACE: u64 = 2;

fn not_found(message: &str) -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, message)
}

fn conflict(message: &str) -> ApiError {
    ApiError::new(StatusCode::CONFLICT, message)
}

fn today_utc() -> NaiveDate {
    Utc::now().date_naive()
}

/// A pair's key: lower id first.
fn pair<'a>(a: &'a str, b: &'a str) -> (&'a str, &'a str) {
    if a < b { (a, b) } else { (b, a) }
}

fn split(shared: &str) -> Vec<String> {
    shared.split(',').filter(|s| !s.is_empty()).map(str::to_owned).collect()
}

/// A device's date must be within a day of the server's (time zones), so
/// nobody can post next week's numbers early.
fn check_today(today: NaiveDate) -> Result<(), ApiError> {
    if (today - today_utc()).num_days().abs() > 1 {
        return Err(ApiError::bad_request("Your computer's date looks wrong. Set it and try again."));
    }
    Ok(())
}

fn new_friend_code() -> String {
    let mut out = String::with_capacity(CODE_LEN);
    while out.len() < CODE_LEN {
        let mut bytes = [0u8; 16];
        rand::fill(&mut bytes);
        // Rejection sampling, so every letter is equally likely.
        let limit = 256 - 256 % CODE_ALPHABET.len();
        out.extend(bytes.iter().filter(|b| (**b as usize) < limit).map(|b| CODE_ALPHABET[*b as usize % CODE_ALPHABET.len()] as char));
    }
    out.truncate(CODE_LEN);
    out
}

async fn find_player(db: &impl ConnectionTrait, user_id: &str) -> Result<Option<player::Model>, ApiError> {
    Ok(player::Entity::find_by_id(user_id).one(db).await?)
}

/// You, with a handle: enough for friends.
async fn with_handle(db: &impl ConnectionTrait, user_id: &str) -> Result<player::Model, ApiError> {
    find_player(db, user_id).await?.ok_or_else(|| not_found(NO_HANDLE))
}

/// You, on the boards.
async fn joined(db: &impl ConnectionTrait, user_id: &str) -> Result<player::Model, ApiError> {
    find_player(db, user_id).await?.filter(|p| p.in_playground).ok_or_else(|| not_found(NOT_JOINED))
}

/// What everyone else sees of the people in `ids` who've joined.
struct People {
    me: String,
    friends: HashSet<String>,
    found: HashMap<String, (player::Model, user::Model)>,
}

impl People {
    async fn load(s: &AppState, me: &str, ids: impl IntoIterator<Item = String>) -> Result<Self, ApiError> {
        let ids: Vec<String> = ids.into_iter().collect::<HashSet<_>>().into_iter().collect();
        let players = player::Entity::find().filter(player::Column::UserId.is_in(ids.clone())).all(&s.db).await?;
        let mut users: HashMap<String, user::Model> =
            user::Entity::find().filter(user::Column::Id.is_in(ids)).all(&s.db).await?.into_iter().map(|u| (u.id.clone(), u)).collect();
        let found = players.into_iter().filter_map(|p| Some((p.user_id.clone(), (users.remove(&p.user_id).map(|u| (p, u))?)))).collect();
        Ok(Self { me: me.to_owned(), friends: friend_ids(&s.db, me).await?.into_iter().collect(), found })
    }

    fn player(&self, s: &AppState, id: &str) -> Option<Player> {
        let (p, u) = self.found.get(id)?;
        Some(player_view(s, p, u, id == self.me, self.friends.contains(id)))
    }
}

fn player_view(s: &AppState, p: &player::Model, u: &user::Model, you: bool, friend: bool) -> Player {
    Player {
        user_id: p.user_id.clone(),
        handle: p.handle.clone(),
        name: u.display_name.clone(),
        lemma: serde_json::from_str(&p.lemma).unwrap_or_default(),
        perks: Perks { admin: s.is_admin(u), first_light: first_light(u.created_at) },
        avatar: u.avatar.as_deref().map(avatar_version),
        you,
        friend,
    }
}

/// A short name for a picture, which changes when the picture does.
fn avatar_version(avatar: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(avatar.as_bytes()).iter().take(8).map(|b| format!("{b:02x}")).collect()
}

/// You as everyone in the Hub sees you (see `crate::hub`): needs a handle.
pub async fn player_for(s: &AppState, user_id: &str) -> Result<Player, ApiError> {
    let me = with_handle(&s.db, user_id).await?;
    let account = crate::admin::account(s, user_id).await?;
    Ok(player_view(s, &me, &account, false, false))
}

/// Someone's profile picture, to those who can already see them: themselves,
/// friends (or a request either way), anyone when they're on the global
/// boards, and anyone while they're in the Hub.
pub async fn avatar(State(s): State<AppState>, auth: AuthUser, Path(user_id): Path<String>) -> Result<Json<PeerAvatar>, ApiError> {
    let hidden = || not_found("That picture isn't available.");
    let them = find_player(&s.db, &user_id).await?.ok_or_else(hidden)?;
    let (low, high) = pair(&auth.user_id, &user_id);
    let linked = user_id == auth.user_id || friendship::Entity::find_by_id((low.to_owned(), high.to_owned())).one(&s.db).await?.is_some();
    if !linked && !(them.global && them.in_playground) && !s.hub.is_present(&user_id) {
        return Err(hidden());
    }
    let account = crate::admin::account(&s, &user_id).await.map_err(|_| hidden())?;
    Ok(Json(PeerAvatar { avatar: account.avatar }))
}

/// Accepted friends' ids.
async fn friend_ids(db: &impl ConnectionTrait, me: &str) -> Result<Vec<String>, ApiError> {
    Ok(friendships(db, me).await?.into_iter().filter(|f| f.accepted_at.is_some()).map(|f| f.other(me).to_owned()).collect())
}

/// Every friendship and request you're in.
async fn friendships(db: &impl ConnectionTrait, me: &str) -> Result<Vec<friendship::Model>, ApiError> {
    Ok(friendship::Entity::find()
        .filter(Condition::any().add(friendship::Column::Low.eq(me)).add(friendship::Column::High.eq(me)))
        .all(db)
        .await?)
}

async fn me_view(s: &AppState, me: &player::Model) -> Result<PlaygroundMe, ApiError> {
    let account = crate::admin::account(s, &me.user_id).await?;
    let week = monday_of(today_utc());
    let cheers_this_week =
        cheer::Entity::find().filter(cheer::Column::ToId.eq(&me.user_id)).filter(cheer::Column::Day.gte(week)).count(&s.db).await? as u32;
    let requests = friendships(&s.db, &me.user_id).await?.iter().filter(|f| f.accepted_at.is_none() && f.requested_by != me.user_id).count() as u32;
    Ok(PlaygroundMe {
        player: player_view(s, me, &account, true, false),
        in_playground: me.in_playground,
        global: me.global,
        shared: split(&me.shared),
        friend_code: me.friend_code.clone(),
        joined_at: me.joined_at,
        cheers_this_week,
        requests,
    })
}

// ---------- You ----------

/// You in the Playground; null until you join.
pub async fn me(State(s): State<AppState>, auth: AuthUser) -> Result<Json<Option<PlaygroundMe>>, ApiError> {
    match find_player(&s.db, &auth.user_id).await? {
        Some(me) => Ok(Json(Some(me_view(&s, &me).await?))),
        None => Ok(Json(None)),
    }
}

/// Picks your handle, joins the boards, or changes your Lemma, what you share
/// and whether you're on global boards. Off the boards, nothing is shared.
pub async fn save(State(s): State<AppState>, auth: AuthUser, Json(mut body): Json<SavePlayground>) -> Result<Json<PlaygroundMe>, ApiError> {
    if !body.playground {
        body.shared.clear();
        body.global = false;
    }
    let handle = normalize_handle(&body.handle);
    check_handle(&handle).map_err(ApiError::bad_request)?;
    check_lemma(&body.lemma).map_err(ApiError::bad_request)?;
    let mut shared: Vec<String> = Vec::new();
    for id in body.shared {
        if metric(&id).is_some() && !shared.contains(&id) {
            shared.push(id);
        }
    }
    let lemma = serde_json::to_string(&body.lemma).map_err(ApiError::internal)?;

    let txn = s.db.begin().await?;
    if let Some(taken) = player::Entity::find().filter(player::Column::Handle.eq(&handle)).one(&txn).await?
        && taken.user_id != auth.user_id
    {
        return Err(conflict("That handle is taken. Try another."));
    }
    let now = Utc::now();
    let saved = match find_player(&txn, &auth.user_id).await? {
        Some(existing) => {
            // Handles are for good: friends know you by it, and nobody else can take it over.
            if existing.handle != handle {
                return Err(ApiError::bad_request(format!("Your handle is @{} and can't be changed.", existing.handle)));
            }
            let mut active: player::ActiveModel = existing.into();
            active.in_playground = Set(body.playground);
            active.handle = Set(handle);
            active.global = Set(body.global);
            active.shared = Set(shared.join(","));
            active.lemma = Set(lemma);
            active.updated_at = Set(now);
            active.update(&txn).await?
        }
        None => {
            let mut code = new_friend_code();
            while player::Entity::find().filter(player::Column::FriendCode.eq(&code)).one(&txn).await?.is_some() {
                code = new_friend_code();
            }
            player::ActiveModel {
                user_id: Set(auth.user_id.clone()),
                in_playground: Set(body.playground),
                handle: Set(handle),
                friend_code: Set(code),
                global: Set(body.global),
                shared: Set(shared.join(",")),
                lemma: Set(lemma),
                joined_at: Set(now),
                updated_at: Set(now),
            }
            .insert(&txn)
            .await?
        }
    };
    // Unshared numbers go; the rest follow the global switch.
    stat::Entity::delete_many()
        .filter(stat::Column::UserId.eq(&auth.user_id))
        .filter(stat::Column::Metric.is_not_in(shared.clone()))
        .exec(&txn)
        .await?;
    let global_metrics: Vec<&str> = METRICS.iter().filter(|m| m.global).map(|m| m.id).collect();
    stat::Entity::update_many()
        .col_expr(stat::Column::Global, Expr::value(false))
        .filter(stat::Column::UserId.eq(&auth.user_id))
        .exec(&txn)
        .await?;
    if saved.global {
        stat::Entity::update_many()
            .col_expr(stat::Column::Global, Expr::value(true))
            .filter(stat::Column::UserId.eq(&auth.user_id))
            .filter(stat::Column::Metric.is_in(global_metrics))
            .exec(&txn)
            .await?;
    }
    txn.commit().await?;
    Ok(Json(me_view(&s, &saved).await?))
}

/// Leaves the Playground's boards: your numbers are deleted and nothing more
/// is shared. Your handle, friends and cheers stay.
pub async fn leave(State(s): State<AppState>, auth: AuthUser) -> Result<StatusCode, ApiError> {
    let Some(me) = find_player(&s.db, &auth.user_id).await? else { return Ok(StatusCode::NO_CONTENT) };
    let txn = s.db.begin().await?;
    stat::Entity::delete_many().filter(stat::Column::UserId.eq(&auth.user_id)).exec(&txn).await?;
    let mut active: player::ActiveModel = me.into();
    active.in_playground = Set(false);
    active.global = Set(false);
    active.shared = Set(String::new());
    active.updated_at = Set(Utc::now());
    active.update(&txn).await?;
    txn.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Everything the Playground keeps about someone, for leaving and for deleting the account.
pub async fn forget_user(db: &impl ConnectionTrait, user_id: &str) -> Result<(), sea_orm::DbErr> {
    stat::Entity::delete_many().filter(stat::Column::UserId.eq(user_id)).exec(db).await?;
    friendship::Entity::delete_many()
        .filter(Condition::any().add(friendship::Column::Low.eq(user_id)).add(friendship::Column::High.eq(user_id)))
        .exec(db)
        .await?;
    cheer::Entity::delete_many().filter(Condition::any().add(cheer::Column::FromId.eq(user_id)).add(cheer::Column::ToId.eq(user_id))).exec(db).await?;
    player::Entity::delete_by_id(user_id).exec(db).await?;
    Ok(())
}

/// A new friend code: the old one stops working.
pub async fn new_code(State(s): State<AppState>, auth: AuthUser) -> Result<Json<PlaygroundMe>, ApiError> {
    let me = with_handle(&s.db, &auth.user_id).await?;
    let mut code = new_friend_code();
    while player::Entity::find().filter(player::Column::FriendCode.eq(&code)).one(&s.db).await?.is_some() {
        code = new_friend_code();
    }
    let mut active: player::ActiveModel = me.into();
    active.friend_code = Set(code);
    active.updated_at = Set(Utc::now());
    let saved = active.update(&s.db).await?;
    Ok(Json(me_view(&s, &saved).await?))
}

// ---------- Stats ----------

/// Keeps the numbers a device worked out, for the metrics you share. Ones
/// that don't add up are left as they were and named in the answer.
pub async fn publish(State(s): State<AppState>, auth: AuthUser, Json(body): Json<PublishStats>) -> Result<Json<Published>, ApiError> {
    if !s.limits.playground_publish.hit(&auth.user_id) {
        return Err(ApiError::too_many("Your numbers were sent a lot just now. They'll go again in a few minutes."));
    }
    check_today(body.today)?;
    let me = joined(&s.db, &auth.user_id).await?;
    let shared = split(&me.shared);
    let now = Utc::now();
    let mut published = Published { saved: 0, refused: Vec::new() };
    let txn = s.db.begin().await?;
    for stats in body.stats.iter().filter(|st| shared.contains(&st.metric)) {
        let m = match check_stats(stats, body.today) {
            Ok(m) => m,
            Err(_) => {
                published.refused.push(stats.metric.clone());
                continue;
            }
        };
        let row = stat::ActiveModel {
            user_id: Set(auth.user_id.clone()),
            metric: Set(m.id.to_owned()),
            global: Set(me.global && m.global),
            week_key: Set(stats.week_key),
            week: Set(stats.week),
            last_week: Set(stats.last_week),
            month_key: Set(stats.month_key),
            month: Set(stats.month),
            last_month: Set(stats.last_month),
            total: Set(stats.total),
            streak: Set(stats.streak as i32),
            best_streak: Set(stats.best_streak as i32),
            streak_through: Set(stats.streak_through.filter(|_| stats.streak > 0)),
            as_of: Set(body.today),
            updated_at: Set(now),
        };
        if stat::Entity::find_by_id((auth.user_id.clone(), m.id.to_owned())).one(&txn).await?.is_some() {
            row.update(&txn).await?;
        } else {
            row.insert(&txn).await?;
        }
        published.saved += 1;
    }
    txn.commit().await?;
    Ok(Json(published))
}

// ---------- Boards ----------

/// A row's number on a board, and the same period before, as of `today`.
fn value_of(row: &stat::Model, period: Period, today: NaiveDate) -> (i64, Option<i64>) {
    match period {
        Period::Week => {
            let key = monday_of(today);
            if row.week_key == key {
                (row.week, Some(row.last_week))
            } else if row.week_key == key - Days::new(7) {
                (0, Some(row.week))
            } else {
                (0, Some(0))
            }
        }
        Period::Month => {
            let key = first_of_month(today);
            if row.month_key == key {
                (row.month, Some(row.last_month))
            } else if row.month_key == first_of_month(key - Days::new(1)) {
                (0, Some(row.month))
            } else {
                (0, Some(0))
            }
        }
        Period::All => (row.total, None),
        Period::Streak => (live_streak(row, today) as i64, None),
    }
}

/// The streak, or 0 if it's run out.
fn live_streak(row: &stat::Model, today: NaiveDate) -> u32 {
    match row.streak_through {
        Some(through) if through >= today - Days::new(STREAK_GRACE) => row.streak.max(0) as u32,
        _ => 0,
    }
}

/// Ranks rows already sorted best first: ties share a rank.
fn ranked(values: &[i64]) -> Vec<u32> {
    let mut ranks = Vec::with_capacity(values.len());
    for (i, v) in values.iter().enumerate() {
        let rank = if i > 0 && values[i - 1] == *v { ranks[i - 1] } else { i as u32 + 1 };
        ranks.push(rank);
    }
    ranks
}

fn entry(people: &People, s: &AppState, row: &stat::Model, rank: u32, period: Period, today: NaiveDate, cheered: &HashSet<String>) -> Option<BoardEntry> {
    let (value, previous) = value_of(row, period, today);
    Some(BoardEntry {
        rank,
        player: people.player(s, &row.user_id)?,
        value,
        previous,
        streak: live_streak(row, today),
        best_streak: row.best_streak.max(0) as u32,
        streak_through: row.streak_through,
        as_of: row.as_of,
        cheered: cheered.contains(&row.user_id),
    })
}

/// Who you've cheered today.
async fn cheered_today(db: &impl ConnectionTrait, me: &str) -> Result<HashSet<String>, ApiError> {
    Ok(cheer::Entity::find()
        .filter(cheer::Column::FromId.eq(me))
        .filter(cheer::Column::Day.eq(today_utc()))
        .all(db)
        .await?
        .into_iter()
        .map(|c| c.to_id)
        .collect())
}

/// A ranked board: your friends and you, or everyone who opted in.
pub async fn board(State(s): State<AppState>, auth: AuthUser, Query(q): Query<BoardQuery>) -> Result<Json<Board>, ApiError> {
    check_today(q.today)?;
    let m = metric(&q.metric).ok_or_else(|| ApiError::bad_request("That isn't something the Playground ranks."))?;
    if q.scope == Scope::Global && !m.global {
        return Err(ApiError::bad_request("That one's just for friends: everyone counts it differently."));
    }
    let me = with_handle(&s.db, &auth.user_id).await?;
    let mine = stat::Entity::find_by_id((auth.user_id.clone(), m.id.to_owned())).one(&s.db).await?;
    let cheered = cheered_today(&s.db, &auth.user_id).await?;
    match q.scope {
        Scope::Friends => friends_board(&s, &me, m.id, q.period, q.today, mine, &cheered).await,
        Scope::Global => global_board(&s, &me, m.id, q.period, q.today, mine, &cheered).await,
    }
    .map(Json)
}

async fn friends_board(
    s: &AppState,
    me: &player::Model,
    metric: &str,
    period: Period,
    today: NaiveDate,
    mine: Option<stat::Model>,
    cheered: &HashSet<String>,
) -> Result<Board, ApiError> {
    let mut ids = friend_ids(&s.db, &me.user_id).await?;
    ids.push(me.user_id.clone());
    let mut rows: Vec<stat::Model> = stat::Entity::find().filter(stat::Column::Metric.eq(metric)).filter(stat::Column::UserId.is_in(ids.clone())).all(&s.db).await?;
    let people = People::load(s, &me.user_id, ids).await?;
    rows.sort_by(|a, b| value_of(b, period, today).0.cmp(&value_of(a, period, today).0).then(a.updated_at.cmp(&b.updated_at)));
    let values: Vec<i64> = rows.iter().map(|r| value_of(r, period, today).0).collect();
    let entries: Vec<BoardEntry> =
        rows.iter().zip(ranked(&values)).filter_map(|(row, rank)| entry(&people, s, row, rank, period, today, cheered)).collect();
    let champion = match period {
        Period::Week | Period::Month => rows
            .iter()
            .map(|r| (r, value_of(r, period, today).1.unwrap_or(0)))
            .filter(|(_, before)| *before > 0)
            .max_by(|a, b| a.1.cmp(&b.1).then(b.0.updated_at.cmp(&a.0.updated_at)))
            .and_then(|(r, before)| {
                let mut e = entry(&people, s, r, 1, period, today, cheered)?;
                e.value = before;
                e.previous = None;
                Some(e)
            }),
        _ => None,
    };
    Ok(Board { metric: metric.into(), period, scope: Scope::Friends, players: entries.len() as u32, entries, you: None, joined: mine.is_some(), champion })
}

/// The rows on a global board for `period`, with their number as a column.
fn global_rows(metric: &str, period: Period, today: NaiveDate) -> (Select<stat::Entity>, stat::Column) {
    let base = stat::Entity::find().filter(stat::Column::Metric.eq(metric)).filter(stat::Column::Global.eq(true));
    match period {
        Period::Week => (base.filter(stat::Column::WeekKey.eq(monday_of(today))).filter(stat::Column::Week.gt(0)), stat::Column::Week),
        Period::Month => (base.filter(stat::Column::MonthKey.eq(first_of_month(today))).filter(stat::Column::Month.gt(0)), stat::Column::Month),
        Period::All => (base.filter(stat::Column::Total.gt(0)), stat::Column::Total),
        Period::Streak => (
            base.filter(stat::Column::Streak.gt(0)).filter(stat::Column::StreakThrough.gte(today - Days::new(STREAK_GRACE))),
            stat::Column::Streak,
        ),
    }
}

async fn global_board(
    s: &AppState,
    me: &player::Model,
    metric: &str,
    period: Period,
    today: NaiveDate,
    mine: Option<stat::Model>,
    cheered: &HashSet<String>,
) -> Result<Board, ApiError> {
    let (rows, column) = global_rows(metric, period, today);
    let players = rows.clone().count(&s.db).await? as u32;
    let top: Vec<stat::Model> = rows.clone().order_by_desc(column).order_by_asc(stat::Column::UpdatedAt).limit(BOARD_SIZE as u64).all(&s.db).await?;

    // Last period's winner, from rows that have moved on to this period and rows that haven't.
    let champion_row = match period {
        Period::Week | Period::Month => {
            let base = stat::Entity::find().filter(stat::Column::Metric.eq(metric)).filter(stat::Column::Global.eq(true));
            let (now_key, before_key, key_col, last_col, this_col) = if period == Period::Week {
                let key = monday_of(today);
                (key, key - Days::new(7), stat::Column::WeekKey, stat::Column::LastWeek, stat::Column::Week)
            } else {
                let key = first_of_month(today);
                (key, first_of_month(key - Days::new(1)), stat::Column::MonthKey, stat::Column::LastMonth, stat::Column::Month)
            };
            let moved_on = base.clone().filter(key_col.eq(now_key)).filter(last_col.gt(0)).order_by_desc(last_col).one(&s.db).await?;
            let stayed = base.filter(key_col.eq(before_key)).filter(this_col.gt(0)).order_by_desc(this_col).one(&s.db).await?;
            let before = |r: &stat::Model| value_of(r, period, today).1.unwrap_or(0);
            match (moved_on, stayed) {
                (Some(a), Some(b)) => Some(if before(&b) > before(&a) { b } else { a }),
                (a, b) => a.or(b),
            }
        }
        _ => None,
    };

    let mut ids: Vec<String> = top.iter().map(|r| r.user_id.clone()).collect();
    ids.push(me.user_id.clone());
    ids.extend(champion_row.iter().map(|r| r.user_id.clone()));
    let people = People::load(s, &me.user_id, ids).await?;
    let values: Vec<i64> = top.iter().map(|r| value_of(r, period, today).0).collect();
    let entries: Vec<BoardEntry> = top.iter().zip(ranked(&values)).filter_map(|(row, rank)| entry(&people, s, row, rank, period, today, cheered)).collect();

    // You: listed already, or below the top, or (not opted in) where you'd be.
    let you = match &mine {
        Some(row) if !entries.iter().any(|e| e.player.you) => {
            let (value, _) = value_of(row, period, today);
            if value > 0 {
                let ahead = rows.filter(column.gt(value)).count(&s.db).await? as u32;
                entry(&people, s, row, ahead + 1, period, today, cheered)
            } else {
                None
            }
        }
        _ => None,
    };
    let champion = champion_row.and_then(|r| {
        let before = value_of(&r, period, today).1.unwrap_or(0);
        let mut e = entry(&people, s, &r, 1, period, today, cheered)?;
        e.value = before;
        e.previous = None;
        Some(e)
    });
    Ok(Board { metric: metric.into(), period, scope: Scope::Global, entries, you, joined: me.global && mine.is_some(), players, champion })
}

// ---------- Friends ----------

/// Your friends (with their streaks), and requests both ways.
pub async fn friends(State(s): State<AppState>, auth: AuthUser) -> Result<Json<Friends>, ApiError> {
    with_handle(&s.db, &auth.user_id).await?;
    let me = &auth.user_id;
    let all = friendships(&s.db, me).await?;
    let others: Vec<String> = all.iter().map(|f| f.other(me).to_owned()).collect();
    let people = People::load(&s, me, others.clone()).await?;
    let streaks: HashMap<String, stat::Model> = stat::Entity::find()
        .filter(stat::Column::Metric.eq("active"))
        .filter(stat::Column::UserId.is_in(others.clone()))
        .all(&s.db)
        .await?
        .into_iter()
        .map(|r| (r.user_id.clone(), r))
        .collect();
    let cheered = cheered_today(&s.db, me).await?;
    let cheered_you: HashSet<String> = cheer::Entity::find()
        .filter(cheer::Column::ToId.eq(me))
        .filter(cheer::Column::Day.eq(today_utc()))
        .all(&s.db)
        .await?
        .into_iter()
        .map(|c| c.from_id)
        .collect();

    let mut out = Friends { friends: Vec::new(), incoming: Vec::new(), outgoing: Vec::new() };
    for f in &all {
        let other = f.other(me);
        let Some(player) = people.player(&s, other) else { continue };
        match f.accepted_at {
            Some(since) => {
                let row = streaks.get(other);
                out.friends.push(Friend {
                    streak: row.map(|r| live_streak(r, today_utc())),
                    streak_through: row.and_then(|r| r.streak_through),
                    as_of: row.map(|r| r.as_of),
                    cheered: cheered.contains(other),
                    cheered_you: cheered_you.contains(other),
                    player,
                    since,
                });
            }
            None if f.requested_by == *me => out.outgoing.push(FriendRequest { player, sent_at: f.created_at }),
            None => out.incoming.push(FriendRequest { player, sent_at: f.created_at }),
        }
    }
    out.friends.sort_by(|a, b| b.streak.unwrap_or(0).cmp(&a.streak.unwrap_or(0)).then_with(|| a.player.handle.cmp(&b.player.handle)));
    out.incoming.sort_by_key(|r| std::cmp::Reverse(r.sent_at));
    out.outgoing.sort_by_key(|r| std::cmp::Reverse(r.sent_at));
    Ok(Json(out))
}

async fn friend_count(db: &impl ConnectionTrait, user_id: &str) -> Result<usize, ApiError> {
    Ok(friend_ids(db, user_id).await?.len())
}

/// Adds someone: by handle it asks them; by friend code (they gave it out)
/// you're friends at once. If they'd already asked you, you're friends too.
pub async fn add_friend(State(s): State<AppState>, auth: AuthUser, Json(body): Json<AddFriend>) -> Result<Json<Added>, ApiError> {
    if !s.limits.friend_adds.hit(&auth.user_id) {
        return Err(ApiError::too_many("You've added a lot of people just now. Try again in a little while."));
    }
    let me = with_handle(&s.db, &auth.user_id).await?;
    let (them, by_code) = match (body.code.as_deref().map(normalize_friend_code).filter(|c| !c.is_empty()), body.handle.as_deref()) {
        (Some(code), _) => {
            let found = player::Entity::find().filter(player::Column::FriendCode.eq(&code)).one(&s.db).await?;
            (found.ok_or_else(|| not_found("That friend code doesn't work. Ask them for their new one."))?, true)
        }
        (None, Some(handle)) => {
            let found = player::Entity::find().filter(player::Column::Handle.eq(normalize_handle(handle))).one(&s.db).await?;
            (found.ok_or_else(|| not_found("Nobody has that handle."))?, false)
        }
        (None, None) => return Err(ApiError::bad_request("Enter a handle or a friend code.")),
    };
    if them.user_id == me.user_id {
        return Err(ApiError::bad_request("That's you! Share your code with a friend instead."));
    }

    let txn = s.db.begin().await?;
    let (low, high) = pair(&me.user_id, &them.user_id);
    let existing = friendship::Entity::find_by_id((low.to_owned(), high.to_owned())).one(&txn).await?;
    let full = |count: usize| count >= MAX_FRIENDS;
    let outcome = match existing {
        Some(f) if f.accepted_at.is_some() => return Err(conflict("You're already friends.")),
        // They asked you, or you're using their code: friends now.
        Some(f) if f.requested_by != me.user_id || by_code => {
            if full(friend_count(&txn, &me.user_id).await?) || full(friend_count(&txn, &them.user_id).await?) {
                return Err(ApiError::bad_request(format!("Friends lists hold up to {MAX_FRIENDS} people.")));
            }
            let mut active: friendship::ActiveModel = f.into();
            active.accepted_at = Set(Some(Utc::now()));
            active.update(&txn).await?;
            AddOutcome::Friends
        }
        Some(_) => return Err(conflict("You've already asked them. It's up to them now.")),
        None => {
            let mine = friendships(&txn, &me.user_id).await?;
            if full(mine.iter().filter(|f| f.accepted_at.is_some()).count()) || (by_code && full(friend_count(&txn, &them.user_id).await?)) {
                return Err(ApiError::bad_request(format!("Friends lists hold up to {MAX_FRIENDS} people.")));
            }
            if !by_code && mine.iter().filter(|f| f.accepted_at.is_none() && f.requested_by == me.user_id).count() >= MAX_PENDING {
                return Err(ApiError::bad_request("You have lots of requests waiting. Give people a chance to answer first."));
            }
            let now = Utc::now();
            friendship::ActiveModel {
                low: Set(low.to_owned()),
                high: Set(high.to_owned()),
                requested_by: Set(me.user_id.clone()),
                created_at: Set(now),
                accepted_at: Set(by_code.then_some(now)),
            }
            .insert(&txn)
            .await?;
            if by_code { AddOutcome::Friends } else { AddOutcome::Requested }
        }
    };
    txn.commit().await?;
    let people = People::load(&s, &me.user_id, [them.user_id.clone()]).await?;
    let player = people.player(&s, &them.user_id).ok_or_else(|| not_found("They've removed their handle."))?;
    Ok(Json(Added { outcome, player }))
}

/// Accepts a request someone sent you.
pub async fn accept(State(s): State<AppState>, auth: AuthUser, Path(user_id): Path<String>) -> Result<StatusCode, ApiError> {
    with_handle(&s.db, &auth.user_id).await?;
    let (low, high) = pair(&auth.user_id, &user_id);
    let txn = s.db.begin().await?;
    let found = friendship::Entity::find_by_id((low.to_owned(), high.to_owned()))
        .one(&txn)
        .await?
        .filter(|f| f.accepted_at.is_none() && f.requested_by != auth.user_id)
        .ok_or_else(|| not_found("That request isn't there any more."))?;
    if friend_count(&txn, &auth.user_id).await? >= MAX_FRIENDS || friend_count(&txn, &user_id).await? >= MAX_FRIENDS {
        return Err(ApiError::bad_request(format!("Friends lists hold up to {MAX_FRIENDS} people.")));
    }
    let mut active: friendship::ActiveModel = found.into();
    active.accepted_at = Set(Some(Utc::now()));
    active.update(&txn).await?;
    txn.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Unfriends, declines a request, or cancels one you sent. Their cheers stay counted.
pub async fn remove(State(s): State<AppState>, auth: AuthUser, Path(user_id): Path<String>) -> Result<StatusCode, ApiError> {
    let (low, high) = pair(&auth.user_id, &user_id);
    friendship::Entity::delete_by_id((low.to_owned(), high.to_owned())).exec(&s.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Cheers a friend on: once a day each.
pub async fn cheer(State(s): State<AppState>, auth: AuthUser, Path(user_id): Path<String>) -> Result<StatusCode, ApiError> {
    let (low, high) = pair(&auth.user_id, &user_id);
    let friends = friendship::Entity::find_by_id((low.to_owned(), high.to_owned())).one(&s.db).await?.is_some_and(|f| f.accepted_at.is_some());
    if !friends {
        return Err(not_found("You can only cheer on your friends."));
    }
    let today = today_utc();
    let key = (auth.user_id.clone(), user_id.clone(), today);
    if cheer::Entity::find_by_id(key).one(&s.db).await?.is_none() {
        cheer::ActiveModel { from_id: Set(auth.user_id), to_id: Set(user_id), day: Set(today), created_at: Set(Utc::now()) }.insert(&s.db).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ties_share_a_rank() {
        assert_eq!(ranked(&[90, 50, 50, 10]), vec![1, 2, 2, 4]);
        assert_eq!(ranked(&[]), Vec::<u32>::new());
    }

    #[test]
    fn friend_codes_use_the_alphabet() {
        let code = new_friend_code();
        assert_eq!(code.len(), CODE_LEN);
        assert!(code.bytes().all(|b| CODE_ALPHABET.contains(&b)));
    }
}
