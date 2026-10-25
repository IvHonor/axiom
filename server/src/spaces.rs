//! Shared boards ("spaces"): sharing a project, inviting people, roles, and
//! syncing the shared rows.
//!
//! A space's rows sync like an account's (see `sync.rs`), but every member
//! pulls them and a member's role limits which tables they may push to (see
//! `axiom_protocol::space_table_role`). Every rule is checked here: the app
//! only explains them.

use std::collections::HashMap;

use axiom_protocol::{
    Adopt, Adopted, ChangeRole, CreateSpace, Invite, Member, Members, MyInvite, NewInvite, PullResponse, PushRequest, PushResponse,
    Record, Role, SYNC_BATCH, Space, check_email, is_plain_name, is_record_id, normalize_email, space_table_role,
};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use chrono::{Duration, Utc};
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseTransaction, DbBackend, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set, TransactionTrait,
};
use serde_json::{Map, Value};

use crate::AppState;
use crate::auth::AuthUser;
use crate::entities::{new_id, space, space_invite, space_member, space_record, sync_record, user};
use crate::error::ApiError;
use crate::mail;
use crate::sync::{MAX_RECORD_BYTES, MAX_RECORDS_PER_ACCOUNT, PullQuery, merge, parse};

/// How long an invitation can wait for an answer.
const INVITE_DAYS: i64 = 14;
/// Most members (and pending invitations) one board can have.
const MAX_MEMBERS: u64 = 50;
/// Boards one account may share.
const MAX_OWNED: u64 = 100;

const NOT_SHARED: &str = "That board isn't shared with you, or it's no longer shared.";

fn forbidden(message: &str) -> ApiError {
    ApiError::new(StatusCode::FORBIDDEN, message)
}

/// The space and your role in it; not found unless you're a member.
async fn membership(db: &impl ConnectionTrait, space_id: &str, user_id: &str) -> Result<(space::Model, Role), ApiError> {
    let member = space_member::Entity::find_by_id((space_id.to_owned(), user_id.to_owned())).one(db).await?;
    let found = space::Entity::find_by_id(space_id).one(db).await?;
    match (found, member.and_then(|m| Role::parse(&m.role))) {
        (Some(found), Some(role)) => Ok((found, role)),
        _ => Err(ApiError::new(StatusCode::NOT_FOUND, NOT_SHARED)),
    }
}

/// The board's name, from its shared project row.
async fn space_name(db: &impl ConnectionTrait, space_id: &str) -> Result<String, ApiError> {
    let row = space_record::Entity::find_by_id((space_id.to_owned(), "project_board_projects".to_owned(), space_id.to_owned())).one(db).await?;
    Ok(row
        .and_then(|r| parse(&r.data).get("name").and_then(Value::as_str).map(str::to_owned))
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| "Shared board".into()))
}

async fn email_of(db: &impl ConnectionTrait, user_id: &str) -> Result<String, ApiError> {
    Ok(user::Entity::find_by_id(user_id).one(db).await?.map(|u| u.email).unwrap_or_default())
}

// ---------- Spaces ----------

/// The shared boards you're in.
pub async fn list(State(s): State<AppState>, auth: AuthUser) -> Result<Json<Vec<Space>>, ApiError> {
    let memberships = space_member::Entity::find().filter(space_member::Column::UserId.eq(&auth.user_id)).all(&s.db).await?;
    let mut out = Vec::new();
    for m in memberships {
        let (Some(found), Some(role)) = (space::Entity::find_by_id(&m.space_id).one(&s.db).await?, Role::parse(&m.role)) else {
            continue;
        };
        let members = space_member::Entity::find().filter(space_member::Column::SpaceId.eq(&found.id)).count(&s.db).await? as u32;
        out.push(Space {
            name: space_name(&s.db, &found.id).await?,
            owner_email: email_of(&s.db, &found.owner_id).await?,
            id: found.id,
            role,
            members,
        });
    }
    Ok(Json(out))
}

/// Shares one of your projects: you become its owner.
pub async fn create(State(s): State<AppState>, auth: AuthUser, Json(body): Json<CreateSpace>) -> Result<Json<Space>, ApiError> {
    crate::admin::require(&s, &auth.user_id, axiom_protocol::permissions::SHARE).await?;
    if !is_plain_name(&body.id) {
        return Err(ApiError::bad_request("That project can't be shared."));
    }
    let txn = s.db.begin().await?;
    if space::Entity::find_by_id(&body.id).one(&txn).await?.is_some() {
        return Err(ApiError::new(StatusCode::CONFLICT, "That board is already shared."));
    }
    // Each board has its own storage limit, so without this one account
    // could share board after board to get round its own.
    if space::Entity::find().filter(space::Column::OwnerId.eq(&auth.user_id)).count(&txn).await? >= MAX_OWNED {
        return Err(ApiError::bad_request(format!("You can share up to {MAX_OWNED} boards. Stop sharing one you no longer need first.")));
    }
    let now = Utc::now();
    space::ActiveModel { id: Set(body.id.clone()), owner_id: Set(auth.user_id.clone()), seq: Set(0), created_at: Set(now) }.insert(&txn).await?;
    space_member::ActiveModel {
        space_id: Set(body.id.clone()),
        user_id: Set(auth.user_id.clone()),
        role: Set(Role::Owner.as_str().into()),
        joined_at: Set(now),
    }
    .insert(&txn)
    .await?;
    txn.commit().await?;
    Ok(Json(Space {
        name: space_name(&s.db, &body.id).await?,
        owner_email: email_of(&s.db, &auth.user_id).await?,
        id: body.id,
        role: Role::Owner,
        members: 1,
    }))
}

/// Moves rows already synced to your own account into the space, so the
/// board's history comes along. Rows not on the server yet are pushed later.
pub async fn adopt(State(s): State<AppState>, auth: AuthUser, Path(id): Path<String>, Json(body): Json<Adopt>) -> Result<Json<Adopted>, ApiError> {
    if body.records.len() > SYNC_BATCH {
        return Err(ApiError::bad_request(format!("Send at most {SYNC_BATCH} rows at a time.")));
    }
    let txn = s.db.begin().await?;
    let (found, role) = locked_membership(&txn, &id, &auth.user_id).await?;
    if role < Role::Admin {
        return Err(forbidden("Only the board's admins can do that."));
    }
    let mut seq = found.seq;
    let mut moved = 0;
    for r in body.records.iter().filter(|r| space_table_role(&r.table).is_some()) {
        let key = (auth.user_id.clone(), r.table.clone(), r.id.clone());
        let Some(personal) = sync_record::Entity::find_by_id(key).one(&txn).await? else { continue };
        seq += 1;
        upsert_record(&txn, &id, &r.table, &r.id, personal.data.clone(), personal.field_times.clone(), seq).await?;
        sync_record::Entity::delete_many()
            .filter(sync_record::Column::UserId.eq(&auth.user_id))
            .filter(sync_record::Column::TableName.eq(&r.table))
            .filter(sync_record::Column::RecordId.eq(&r.id))
            .exec(&txn)
            .await?;
        moved += 1;
    }
    let mut active: space::ActiveModel = found.into();
    active.seq = Set(seq);
    active.update(&txn).await?;
    txn.commit().await?;
    Ok(Json(Adopted { moved }))
}

/// Stops sharing (owner only): the shared copy, members and invitations go.
/// Members' apps remove the board when they next sync.
pub async fn delete(State(s): State<AppState>, auth: AuthUser, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    let (_, role) = membership(&s.db, &id, &auth.user_id).await?;
    if role != Role::Owner {
        return Err(forbidden("Only the board's owner can stop sharing it."));
    }
    let txn = s.db.begin().await?;
    delete_space(&txn, &id).await?;
    txn.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Deletes a space and everything in it. Explicit rather than relying on
/// ON DELETE CASCADE, which SQLite only honours with foreign keys on.
pub async fn delete_space(txn: &DatabaseTransaction, id: &str) -> Result<(), ApiError> {
    space_record::Entity::delete_many().filter(space_record::Column::SpaceId.eq(id)).exec(txn).await?;
    space_invite::Entity::delete_many().filter(space_invite::Column::SpaceId.eq(id)).exec(txn).await?;
    space_member::Entity::delete_many().filter(space_member::Column::SpaceId.eq(id)).exec(txn).await?;
    space::Entity::delete_by_id(id).exec(txn).await?;
    Ok(())
}

// ---------- Sync ----------

/// Locks the space's row, so concurrent pushes take sequence numbers in turn.
async fn locked_membership(txn: &DatabaseTransaction, space_id: &str, user_id: &str) -> Result<(space::Model, Role), ApiError> {
    let (_, role) = membership(txn, space_id, user_id).await?;
    let mut find = space::Entity::find_by_id(space_id);
    if txn.get_database_backend() == DbBackend::Postgres {
        find = find.lock_exclusive();
    }
    let found = find.one(txn).await?.ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, NOT_SHARED))?;
    Ok((found, role))
}

async fn upsert_record(txn: &DatabaseTransaction, space_id: &str, table: &str, id: &str, data: String, field_times: String, seq: i64) -> Result<(), ApiError> {
    let row = space_record::ActiveModel {
        space_id: Set(space_id.to_owned()),
        table_name: Set(table.to_owned()),
        record_id: Set(id.to_owned()),
        data: Set(data),
        field_times: Set(field_times),
        seq: Set(seq),
    };
    space_record::Entity::insert(row)
        .on_conflict(
            OnConflict::columns([space_record::Column::SpaceId, space_record::Column::TableName, space_record::Column::RecordId])
                .update_columns([space_record::Column::Data, space_record::Column::FieldTimes, space_record::Column::Seq])
                .to_owned(),
        )
        .exec(txn)
        .await?;
    Ok(())
}

/// Like `sync::push`, for a shared board, within the pusher's role.
pub async fn push(State(s): State<AppState>, auth: AuthUser, Path(id): Path<String>, Json(body): Json<PushRequest>) -> Result<Json<PushResponse>, ApiError> {
    crate::admin::require(&s, &auth.user_id, axiom_protocol::permissions::SYNC).await?;
    if body.changes.len() > SYNC_BATCH {
        return Err(ApiError::bad_request(format!("Send at most {SYNC_BATCH} changes at a time.")));
    }
    if let Some(bad) = body.changes.iter().find(|c| !is_record_id(&c.id) || !c.id_matches() || space_table_role(&c.table).is_none()) {
        return Err(ApiError::bad_request(format!("A shared board can't hold {}/{}.", bad.table, bad.id)));
    }
    if body.changes.iter().any(|c| Value::Object(c.fields.clone()).to_string().len() > MAX_RECORD_BYTES) {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "One of your items is too large to sync."));
    }

    let txn = s.db.begin().await?;
    let (found, role) = locked_membership(&txn, &id, &auth.user_id).await?;
    if let Some(denied) = body.changes.iter().find(|c| space_table_role(&c.table).is_some_and(|needed| role < needed)) {
        let what = if space_table_role(&denied.table) == Some(Role::Admin) { "the board itself" } else { "cards" };
        return Err(forbidden(&format!("Your role on this board ({}) can't change {what}.", role.as_str())));
    }
    let mut seq = found.seq;

    let ids: Vec<&str> = body.changes.iter().map(|c| c.id.as_str()).collect();
    let mut merged: HashMap<(String, String), (Map<String, Value>, Map<String, Value>)> = space_record::Entity::find()
        .filter(space_record::Column::SpaceId.eq(&id))
        .filter(space_record::Column::RecordId.is_in(ids))
        .all(&txn)
        .await?
        .into_iter()
        .map(|r| ((r.table_name, r.record_id), (parse(&r.data), parse(&r.field_times))))
        .collect();

    let new_rows = body.changes.iter().filter(|c| !merged.contains_key(&(c.table.clone(), c.id.clone()))).count() as u64;
    if new_rows > 0 {
        let stored = space_record::Entity::find().filter(space_record::Column::SpaceId.eq(&id)).count(&txn).await?;
        if stored + new_rows > MAX_RECORDS_PER_ACCOUNT {
            return Err(ApiError::new(StatusCode::INSUFFICIENT_STORAGE, "This shared board has reached its storage limit."));
        }
    }

    let mut touched = Vec::new();
    for change in body.changes {
        let key = (change.table, change.id);
        let (data, times) = merged.entry(key.clone()).or_default();
        merge(data, times, change.fields, change.changed_at);
        if !touched.contains(&key) {
            touched.push(key);
        }
    }
    for key in touched {
        let (data, times) = merged.remove(&key).unwrap_or_default();
        seq += 1;
        upsert_record(&txn, &id, &key.0, &key.1, Value::Object(data).to_string(), Value::Object(times).to_string(), seq).await?;
    }
    let mut active: space::ActiveModel = found.into();
    active.seq = Set(seq);
    active.update(&txn).await?;
    txn.commit().await?;
    Ok(Json(PushResponse { seq }))
}

/// Like `sync::pull`, for a shared board. Any member may pull.
pub async fn pull(State(s): State<AppState>, auth: AuthUser, Path(id): Path<String>, Query(query): Query<PullQuery>) -> Result<Json<PullResponse>, ApiError> {
    crate::admin::require(&s, &auth.user_id, axiom_protocol::permissions::SYNC).await?;
    membership(&s.db, &id, &auth.user_id).await?;
    let mut rows = space_record::Entity::find()
        .filter(space_record::Column::SpaceId.eq(&id))
        .filter(space_record::Column::Seq.gt(query.since))
        .order_by_asc(space_record::Column::Seq)
        .limit(SYNC_BATCH as u64 + 1)
        .all(&s.db)
        .await?;
    let more = rows.len() > SYNC_BATCH;
    rows.truncate(SYNC_BATCH);
    let cursor = rows.last().map_or(query.since, |r| r.seq);
    let records = rows.into_iter().map(|r| Record { data: parse(&r.data), table: r.table_name, id: r.record_id, seq: r.seq }).collect();
    Ok(Json(PullResponse { records, cursor, more }))
}

// ---------- Members ----------

fn pending() -> sea_orm::sea_query::Condition {
    sea_orm::sea_query::Condition::all()
        .add(space_invite::Column::AcceptedAt.is_null())
        .add(space_invite::Column::ClosedAt.is_null())
        .add(space_invite::Column::ExpiresAt.gt(Utc::now()))
}

/// Who's on the board; admins also see invitations waiting for an answer.
pub async fn members(State(s): State<AppState>, auth: AuthUser, Path(id): Path<String>) -> Result<Json<Members>, ApiError> {
    let (_, role) = membership(&s.db, &id, &auth.user_id).await?;
    let mut members = Vec::new();
    for m in space_member::Entity::find().filter(space_member::Column::SpaceId.eq(&id)).order_by_asc(space_member::Column::JoinedAt).all(&s.db).await? {
        members.push(Member {
            email: email_of(&s.db, &m.user_id).await?,
            role: Role::parse(&m.role).unwrap_or(Role::Viewer),
            joined_at: m.joined_at,
            you: m.user_id == auth.user_id,
            user_id: m.user_id,
        });
    }
    let mut invites = Vec::new();
    if role >= Role::Admin {
        for i in space_invite::Entity::find().filter(space_invite::Column::SpaceId.eq(&id)).filter(pending()).all(&s.db).await? {
            invites.push(Invite {
                invited_by: email_of(&s.db, &i.invited_by).await?,
                role: Role::parse(&i.role).unwrap_or(Role::Viewer),
                id: i.id,
                email: i.email,
                created_at: i.created_at,
                expires_at: i.expires_at,
            });
        }
    }
    Ok(Json(Members { members, invites }))
}

/// Invites someone by email (admins). Asking again refreshes the invitation.
pub async fn invite(State(s): State<AppState>, auth: AuthUser, Path(id): Path<String>, Json(body): Json<NewInvite>) -> Result<Json<Invite>, ApiError> {
    crate::admin::require(&s, &auth.user_id, axiom_protocol::permissions::SHARE).await?;
    let (_, role) = membership(&s.db, &id, &auth.user_id).await?;
    if role < Role::Admin {
        return Err(forbidden("Only the board's admins can invite people."));
    }
    if body.role == Role::Owner {
        return Err(ApiError::bad_request("A board has one owner. Invite them as an admin instead."));
    }
    if body.role == Role::Admin && role != Role::Owner {
        return Err(forbidden("Only the board's owner can invite admins."));
    }
    let email = normalize_email(&body.email);
    check_email(&email).map_err(ApiError::bad_request)?;
    if !s.limits.invites.hit(&auth.user_id) {
        return Err(ApiError::too_many("You've sent a lot of invitations. Try again in an hour."));
    }
    if let Some(existing) = user::Entity::find().filter(user::Column::Email.eq(&email)).one(&s.db).await? {
        if space_member::Entity::find_by_id((id.clone(), existing.id)).one(&s.db).await?.is_some() {
            return Err(ApiError::new(StatusCode::CONFLICT, "They're already on this board."));
        }
    }
    let crowd = space_member::Entity::find().filter(space_member::Column::SpaceId.eq(&id)).count(&s.db).await?
        + space_invite::Entity::find().filter(space_invite::Column::SpaceId.eq(&id)).filter(pending()).count(&s.db).await?;
    if crowd >= MAX_MEMBERS {
        return Err(ApiError::bad_request(format!("A board can have up to {MAX_MEMBERS} people.")));
    }

    let now = Utc::now();
    let txn = s.db.begin().await?;
    // One open invitation per address: a new one replaces it.
    let earlier = space_invite::Entity::find()
        .filter(space_invite::Column::SpaceId.eq(&id))
        .filter(space_invite::Column::Email.eq(&email))
        .filter(pending())
        .all(&txn)
        .await?;
    for old in earlier {
        let mut old: space_invite::ActiveModel = old.into();
        old.closed_at = Set(Some(now));
        old.update(&txn).await?;
    }
    let made = space_invite::ActiveModel {
        id: Set(new_id()),
        space_id: Set(id.clone()),
        email: Set(email.clone()),
        role: Set(body.role.as_str().into()),
        invited_by: Set(auth.user_id.clone()),
        created_at: Set(now),
        expires_at: Set(now + Duration::days(INVITE_DAYS)),
        accepted_at: Set(None),
        closed_at: Set(None),
    }
    .insert(&txn)
    .await?;
    txn.commit().await?;

    let inviter = email_of(&s.db, &auth.user_id).await?;
    let board = space_name(&s.db, &id).await?;
    // The invitation also waits in the app, so a lost email isn't fatal.
    if let Err(err) = s.mailer.send(mail::board_invite(&email, &inviter, &board, body.role, INVITE_DAYS)).await {
        tracing::error!("Couldn't send an invitation email: {err}");
    }
    Ok(Json(Invite {
        id: made.id,
        email,
        role: body.role,
        invited_by: inviter,
        created_at: made.created_at,
        expires_at: made.expires_at,
    }))
}

/// Withdraws an invitation (admins).
pub async fn withdraw(State(s): State<AppState>, auth: AuthUser, Path((id, invite_id)): Path<(String, String)>) -> Result<StatusCode, ApiError> {
    let (_, role) = membership(&s.db, &id, &auth.user_id).await?;
    if role < Role::Admin {
        return Err(forbidden("Only the board's admins can withdraw invitations."));
    }
    if let Some(found) = space_invite::Entity::find_by_id(&invite_id).filter(space_invite::Column::SpaceId.eq(&id)).one(&s.db).await? {
        let mut found: space_invite::ActiveModel = found.into();
        found.closed_at = Set(Some(Utc::now()));
        found.update(&s.db).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Changes someone's role. Admins manage editors and viewers; only the
/// owner makes or removes admins. The owner's role never changes.
pub async fn change_role(
    State(s): State<AppState>,
    auth: AuthUser,
    Path((id, user_id)): Path<(String, String)>,
    Json(body): Json<ChangeRole>,
) -> Result<StatusCode, ApiError> {
    let (_, role) = membership(&s.db, &id, &auth.user_id).await?;
    let (_, theirs) = membership(&s.db, &id, &user_id).await.map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "They're not on this board any more."))?;
    if role < Role::Admin {
        return Err(forbidden("Only the board's admins can change roles."));
    }
    if theirs == Role::Owner || body.role == Role::Owner {
        return Err(ApiError::bad_request("The owner's role can't change, and a board has one owner."));
    }
    if (theirs == Role::Admin || body.role == Role::Admin) && role != Role::Owner {
        return Err(forbidden("Only the board's owner can make or change admins."));
    }
    let found = space_member::Entity::find_by_id((id, user_id)).one(&s.db).await?.ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, NOT_SHARED))?;
    let mut found: space_member::ActiveModel = found.into();
    found.role = Set(body.role.as_str().into());
    found.update(&s.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Removes someone from the board, or yourself (leaving it). The owner can't
/// leave; they stop sharing instead.
pub async fn remove(State(s): State<AppState>, auth: AuthUser, Path((id, user_id)): Path<(String, String)>) -> Result<StatusCode, ApiError> {
    let (_, role) = membership(&s.db, &id, &auth.user_id).await?;
    let (_, theirs) = membership(&s.db, &id, &user_id).await.map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "They're not on this board any more."))?;
    let leaving = user_id == auth.user_id;
    if theirs == Role::Owner {
        return Err(ApiError::bad_request(if leaving {
            "You own this board. Stop sharing it instead of leaving."
        } else {
            "The owner can't be removed from their board."
        }));
    }
    if !leaving && role < Role::Admin {
        return Err(forbidden("Only the board's admins can remove people."));
    }
    if !leaving && theirs == Role::Admin && role != Role::Owner {
        return Err(forbidden("Only the board's owner can remove an admin."));
    }
    space_member::Entity::delete_by_id((id, user_id)).exec(&s.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------- Your invitations ----------

/// Invitations sent to your email that are still open.
pub async fn my_invites(State(s): State<AppState>, auth: AuthUser) -> Result<Json<Vec<MyInvite>>, ApiError> {
    let email = email_of(&s.db, &auth.user_id).await?;
    let mut out = Vec::new();
    for i in space_invite::Entity::find().filter(space_invite::Column::Email.eq(&email)).filter(pending()).all(&s.db).await? {
        // Already a member (joined another way): nothing to answer.
        if space_member::Entity::find_by_id((i.space_id.clone(), auth.user_id.clone())).one(&s.db).await?.is_some() {
            continue;
        }
        out.push(MyInvite {
            space_name: space_name(&s.db, &i.space_id).await?,
            invited_by: email_of(&s.db, &i.invited_by).await?,
            role: Role::parse(&i.role).unwrap_or(Role::Viewer),
            id: i.id,
            space_id: i.space_id,
            expires_at: i.expires_at,
        });
    }
    Ok(Json(out))
}

async fn open_invite_for(s: &AppState, auth: &AuthUser, invite_id: &str) -> Result<space_invite::Model, ApiError> {
    let email = email_of(&s.db, &auth.user_id).await?;
    space_invite::Entity::find_by_id(invite_id)
        .filter(space_invite::Column::Email.eq(email))
        .filter(pending())
        .one(&s.db)
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "That invitation isn't open any more. It may have expired or been withdrawn."))
}

/// Joins the board with the invitation's role.
pub async fn accept(State(s): State<AppState>, auth: AuthUser, Path(invite_id): Path<String>) -> Result<Json<Space>, ApiError> {
    let found = open_invite_for(&s, &auth, &invite_id).await?;
    let role = Role::parse(&found.role).unwrap_or(Role::Viewer);
    let txn = s.db.begin().await?;
    if space_member::Entity::find_by_id((found.space_id.clone(), auth.user_id.clone())).one(&txn).await?.is_none() {
        space_member::ActiveModel {
            space_id: Set(found.space_id.clone()),
            user_id: Set(auth.user_id.clone()),
            role: Set(role.as_str().into()),
            joined_at: Set(Utc::now()),
        }
        .insert(&txn)
        .await?;
    }
    let space_id = found.space_id.clone();
    let mut found: space_invite::ActiveModel = found.into();
    found.accepted_at = Set(Some(Utc::now()));
    found.update(&txn).await?;
    txn.commit().await?;

    let (shared, role) = membership(&s.db, &space_id, &auth.user_id).await?;
    Ok(Json(Space {
        name: space_name(&s.db, &space_id).await?,
        owner_email: email_of(&s.db, &shared.owner_id).await?,
        members: space_member::Entity::find().filter(space_member::Column::SpaceId.eq(&space_id)).count(&s.db).await? as u32,
        id: space_id,
        role,
    }))
}

pub async fn decline(State(s): State<AppState>, auth: AuthUser, Path(invite_id): Path<String>) -> Result<StatusCode, ApiError> {
    let found = open_invite_for(&s, &auth, &invite_id).await?;
    let mut found: space_invite::ActiveModel = found.into();
    found.closed_at = Set(Some(Utc::now()));
    found.update(&s.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// When an account is deleted: boards it owns go; it leaves the rest.
pub async fn forget_user(txn: &DatabaseTransaction, user_id: &str) -> Result<(), ApiError> {
    for owned in space::Entity::find().filter(space::Column::OwnerId.eq(user_id)).all(txn).await? {
        delete_space(txn, &owned.id).await?;
    }
    space_member::Entity::delete_many().filter(space_member::Column::UserId.eq(user_id)).exec(txn).await?;
    space_invite::Entity::delete_many().filter(space_invite::Column::InvitedBy.eq(user_id)).exec(txn).await?;
    Ok(())
}
