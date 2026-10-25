//! Push and pull: how devices exchange changes through the server.
//!
//! - **Push** sends the fields a device changed. Each field keeps whichever
//!   value was changed most recently (last write wins, per field), so two
//!   devices editing different fields of one task both keep their edit.
//! - Every pushed row gets the account's next sequence number, even when all
//!   its fields lost, so the pushing device pulls back the winning values.
//! - **Pull** returns rows with a sequence number above the device's cursor.

use std::collections::HashMap;

use axiom_protocol::{PullResponse, PushRequest, PushResponse, Record, SYNC_BATCH, is_plain_name, is_record_id};
use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DbBackend, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    TransactionTrait,
};
use serde::Deserialize;
use serde_json::{Map, Value};

use crate::AppState;
use crate::auth::AuthUser;
use crate::entities::{sync_record, user};
use crate::error::ApiError;

/// Generous limits that only abuse would reach: a large, busy account has a
/// few thousand rows, and a long task description is a few kilobytes.
pub const MAX_RECORDS_PER_ACCOUNT: u64 = 100_000;
pub const MAX_RECORD_BYTES: usize = 64 * 1024;

pub async fn push(State(s): State<AppState>, auth: AuthUser, Json(body): Json<PushRequest>) -> Result<Json<PushResponse>, ApiError> {
    crate::admin::require(&s, &auth.user_id, axiom_protocol::permissions::SYNC).await?;
    if body.changes.len() > SYNC_BATCH {
        return Err(ApiError::bad_request(format!("Send at most {SYNC_BATCH} changes at a time.")));
    }
    if let Some(bad) = body.changes.iter().find(|c| !is_plain_name(&c.table) || !is_record_id(&c.id) || !c.id_matches()) {
        return Err(ApiError::bad_request(format!("Invalid table or id: {}/{}", bad.table, bad.id)));
    }
    if body.changes.iter().any(|c| Value::Object(c.fields.clone()).to_string().len() > MAX_RECORD_BYTES) {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "One of your items is too large to sync."));
    }

    let txn = s.db.begin().await?;

    // Lock the user's row so concurrent pushes take sequence numbers one at a
    // time. (SQLite, used in tests, allows one writer anyway.)
    let mut find_user = user::Entity::find_by_id(&auth.user_id);
    if txn.get_database_backend() == DbBackend::Postgres {
        find_user = find_user.lock_exclusive();
    }
    let account = find_user.one(&txn).await?.ok_or_else(|| ApiError::unauthorized("Sign in to continue."))?;
    let mut seq = account.sync_seq;

    let ids: Vec<&str> = body.changes.iter().map(|c| c.id.as_str()).collect();
    let mut merged: HashMap<(String, String), (Map<String, Value>, Map<String, Value>)> = sync_record::Entity::find()
        .filter(sync_record::Column::UserId.eq(&auth.user_id))
        .filter(sync_record::Column::RecordId.is_in(ids))
        .all(&txn)
        .await?
        .into_iter()
        .map(|r| ((r.table_name, r.record_id), (parse(&r.data), parse(&r.field_times))))
        .collect();

    // Cap each account's storage, so one account can't fill the database.
    let new_rows = body.changes.iter().filter(|c| !merged.contains_key(&(c.table.clone(), c.id.clone()))).count() as u64;
    if new_rows > 0 {
        let stored = sync_record::Entity::find().filter(sync_record::Column::UserId.eq(&auth.user_id)).count(&txn).await?;
        if stored + new_rows > MAX_RECORDS_PER_ACCOUNT {
            return Err(ApiError::new(
                StatusCode::INSUFFICIENT_STORAGE,
                "Your account has reached its storage limit, so new items aren't syncing. Delete some old projects to make room.",
            ));
        }
    }

    // Merge everything first, so a row that appears twice in one push is
    // written once with both changes.
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
        let row = sync_record::ActiveModel {
            user_id: Set(auth.user_id.clone()),
            table_name: Set(key.0),
            record_id: Set(key.1),
            data: Set(Value::Object(data).to_string()),
            field_times: Set(Value::Object(times).to_string()),
            seq: Set(seq),
        };
        sync_record::Entity::insert(row)
            .on_conflict(
                OnConflict::columns([sync_record::Column::UserId, sync_record::Column::TableName, sync_record::Column::RecordId])
                    .update_columns([sync_record::Column::Data, sync_record::Column::FieldTimes, sync_record::Column::Seq])
                    .to_owned(),
            )
            .exec(&txn)
            .await?;
    }

    let mut account: user::ActiveModel = account.into();
    account.sync_seq = Set(seq);
    account.update(&txn).await?;
    txn.commit().await?;

    Ok(Json(PushResponse { seq }))
}

#[derive(Deserialize)]
pub struct PullQuery {
    #[serde(default)]
    pub since: i64,
}

pub async fn pull(State(s): State<AppState>, auth: AuthUser, Query(query): Query<PullQuery>) -> Result<Json<PullResponse>, ApiError> {
    crate::admin::require(&s, &auth.user_id, axiom_protocol::permissions::SYNC).await?;
    let mut rows = sync_record::Entity::find()
        .filter(sync_record::Column::UserId.eq(&auth.user_id))
        .filter(sync_record::Column::Seq.gt(query.since))
        .order_by_asc(sync_record::Column::Seq)
        .limit(SYNC_BATCH as u64 + 1)
        .all(&s.db)
        .await?;
    let more = rows.len() > SYNC_BATCH;
    rows.truncate(SYNC_BATCH);

    let cursor = rows.last().map_or(query.since, |r| r.seq);
    let records = rows
        .into_iter()
        .map(|r| Record { data: parse(&r.data), table: r.table_name, id: r.record_id, seq: r.seq })
        .collect();
    Ok(Json(PullResponse { records, cursor, more }))
}

/// Applies `fields` changed at `changed_at` to a record: each field takes the
/// new value unless the record already has a newer one.
pub fn merge(data: &mut Map<String, Value>, times: &mut Map<String, Value>, fields: Map<String, Value>, changed_at: i64) {
    for (name, value) in fields {
        let newer = times.get(&name).and_then(Value::as_i64).is_none_or(|stored| changed_at >= stored);
        if newer {
            data.insert(name.clone(), value);
            times.insert(name, changed_at.into());
        }
    }
}

pub(crate) fn parse(json: &str) -> Map<String, Value> {
    serde_json::from_str(json).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn map(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn newest_change_wins_per_field() {
        let (mut data, mut times) = (Map::new(), Map::new());
        merge(&mut data, &mut times, map(json!({ "title": "A", "color": "red" })), 100);
        // Another device changed the title later, and the color earlier.
        merge(&mut data, &mut times, map(json!({ "title": "B" })), 200);
        merge(&mut data, &mut times, map(json!({ "color": "blue" })), 50);
        assert_eq!(Value::Object(data), json!({ "title": "B", "color": "red" }));
    }
}
