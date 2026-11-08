//! The assistant, on Axiom's AI keys, for accounts allowed to use it.
//! The server only passes the conversation on to the AI (Groq, or a paid
//! Gemini) and keeps nothing of it: the app runs the tools, on the person's own computer.
//!
//! What each account uses is counted, day by day, for the admin panel:
//! questions, model calls, tokens, recordings and failures (never what was
//! said). There's no allowance per account; `AI_DAILY_LIMIT` is a brake on
//! everyone's calls together, off unless it's set.

use axiom_ai::{AiError, Delta};
use axiom_protocol::ai::{ChatReply, ChatRequest, MAX_AUDIO_BYTES, MAX_MESSAGES, MAX_REQUEST_BYTES, Message, SHOWS_WAITS, Streamed, Transcribe, Transcript};
use std::collections::{HashMap, HashSet};

use axiom_protocol::{AdminAiUsage, AiUsageDay, AiUsagePerson, AiUsageTotals, permissions};
use axum::Json;
use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use chrono::{NaiveDate, Utc};
use sea_orm::sea_query::{Alias, Expr, ExprTrait, OnConflict};
use sea_orm::{ColumnTrait, DbErr, EntityTrait, QueryFilter, QueryOrder, Set};

use crate::AppState;
use crate::auth::AuthUser;
use crate::entities::{ai_usage, user};
use crate::error::ApiError;

/// The `ai_usage` row that counts everyone's calls, for `AI_DAILY_LIMIT`.
pub const EVERYONE: &str = "";

pub async fn chat(State(s): State<AppState>, auth: AuthUser, Json(body): Json<ChatRequest>) -> Result<Json<ChatReply>, ApiError> {
    may_chat(&s, &auth, &body).await?;
    let result = s.ai.chat(&s.ai_keys, &body).await;
    record(&s, &auth.user_id, &result).await;
    match answered(result) {
        Ok(reply) => Ok(Json(reply)),
        Err((status, message)) => Err(ApiError::new(status, message)),
    }
}

/// Like `chat`, but the words go out as they're written: one `Streamed` per
/// line of JSON, ending with the reply (or why there isn't one). Waits for
/// a busy AI are told only to apps that say they can show them.
pub async fn chat_stream(State(s): State<AppState>, auth: AuthUser, headers: HeaderMap, Json(body): Json<ChatRequest>) -> Result<Response, ApiError> {
    may_chat(&s, &auth, &body).await?;
    let shows_waits = headers.contains_key(SHOWS_WAITS);
    let (lines, mut out) = tokio::sync::mpsc::unbounded_channel::<Streamed>();
    tokio::spawn(async move {
        let on = |delta: Delta| {
            let line = match delta {
                Delta::Text(text) => Streamed::Text { text: text.into() },
                Delta::Restart => Streamed::Restart,
                Delta::Waiting(wait) if shows_waits => Streamed::Waiting { seconds: wait.as_secs_f64().ceil() as u32 },
                Delta::Waiting(_) => return,
            };
            let _ = lines.send(line);
        };
        // Nobody listening any more (the app was closed): stop asking.
        let result = tokio::select! {
            result = s.ai.chat_stream(&s.ai_keys, &body, &on) => result,
            () = lines.closed() => return,
        };
        record(&s, &auth.user_id, &result).await;
        let _ = lines.send(match answered(result) {
            Ok(reply) => Streamed::Reply { reply },
            Err((status, message)) => Streamed::Error { status: status.as_u16(), message },
        });
    });
    let stream = futures_util::stream::poll_fn(move |cx| {
        out.poll_recv(cx).map(|line| line.map(|line| Ok::<_, std::convert::Infallible>(format!("{}\n", serde_json::to_string(&line).expect("lines serialize")))))
    });
    Ok(([(header::CONTENT_TYPE, "application/x-ndjson"), (header::CACHE_CONTROL, "no-store")], Body::from_stream(stream)).into_response())
}

/// Whether this account may ask the assistant this now. Counts the call.
async fn may_chat(s: &AppState, auth: &AuthUser, body: &ChatRequest) -> Result<(), ApiError> {
    crate::admin::require(s, &auth.user_id, permissions::AI).await?;
    if !s.ai_keys.any() {
        return Err(ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "The assistant isn't set up on this server yet."));
    }
    if body.messages.len() > MAX_MESSAGES || serde_json::to_vec(body).map_or(true, |bytes| bytes.len() > MAX_REQUEST_BYTES) {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "This conversation has got too long. Start a new one."));
    }
    // The person's own words last: a new question, not a step of one.
    let prompt = matches!(body.messages.last(), Some(Message::User { .. }));
    spend(s, &auth.user_id, Usage { calls: 1, prompts: prompt.into(), ..Usage::default() }).await
}

/// Counts a call (or a recording) for the account and for everyone, once
/// the brake, if there is one, allows it. Counted in the database, so a
/// restart doesn't reset it.
async fn spend(s: &AppState, user_id: &str, used: Usage) -> Result<(), ApiError> {
    let today = Utc::now().date_naive();
    if let Some(limit) = s.ai_daily_limit {
        let everyone = add(s, EVERYONE, today, Usage { calls: 1, ..Usage::default() }).await?;
        if everyone.count > i32::try_from(limit).unwrap_or(i32::MAX) {
            tracing::warn!("assistant: everyone's daily limit ({limit}) reached");
            return Err(ApiError::too_many("Axiom's assistant has had all it can for today. It'll be back tomorrow."));
        }
    }
    add(s, user_id, today, used).await?;
    Ok(())
}

/// What a call cost the account, or why it failed. A failure to count is
/// logged, not passed on: the person still gets their answer.
async fn record(s: &AppState, user_id: &str, result: &Result<ChatReply, AiError>) {
    let used = match result {
        Ok(reply) => {
            let tokens = reply.usage.unwrap_or_default();
            tracing::info!(provider = %reply.provider, input = tokens.input, cached = tokens.cached, output = tokens.output, "assistant call");
            Usage { input: tokens.input.into(), cached: tokens.cached.into(), output: tokens.output.into(), ..Usage::default() }
        }
        Err(err) => Usage { failures: 1, error: Some(err.message()), ..Usage::default() },
    };
    if let Err(err) = add(s, user_id, Utc::now().date_naive(), used).await {
        tracing::warn!("assistant: couldn't count usage: {err}");
    }
}

/// An addition to a day's `ai_usage` row.
#[derive(Default)]
struct Usage {
    calls: i32,
    prompts: i32,
    input: i64,
    cached: i64,
    output: i64,
    transcriptions: i32,
    failures: i32,
    error: Option<String>,
}

/// Adds `used` to `key`'s row for `day` (starting it if it's the first
/// today), and returns the row as it is now.
async fn add(s: &AppState, key: &str, day: NaiveDate, used: Usage) -> Result<ai_usage::Model, DbErr> {
    use ai_usage::Column as C;
    let plus = |column: C| Expr::col((ai_usage::Entity, column)).add(Expr::col((Alias::new("excluded"), column)));
    let row = ai_usage::ActiveModel {
        user_id: Set(key.into()),
        day: Set(day),
        count: Set(used.calls),
        prompts: Set(used.prompts),
        input_tokens: Set(used.input),
        cached_tokens: Set(used.cached),
        output_tokens: Set(used.output),
        transcriptions: Set(used.transcriptions),
        failures: Set(used.failures),
        last_error: Set(used.error),
        last_used_at: Set(Some(Utc::now())),
    };
    ai_usage::Entity::insert(row)
        .on_conflict(
            OnConflict::columns([C::UserId, C::Day])
                .value(C::Count, plus(C::Count))
                .value(C::Prompts, plus(C::Prompts))
                .value(C::InputTokens, plus(C::InputTokens))
                .value(C::CachedTokens, plus(C::CachedTokens))
                .value(C::OutputTokens, plus(C::OutputTokens))
                .value(C::Transcriptions, plus(C::Transcriptions))
                .value(C::Failures, plus(C::Failures))
                // A success keeps the last failure's reason, for the panel.
                .value(C::LastError, Expr::cust("COALESCE(excluded.last_error, ai_usage.last_error)"))
                .update_column(C::LastUsedAt)
                .to_owned(),
        )
        .exec_with_returning(&s.db)
        .await
}

/// The reply, or why there isn't one (and the status to send).
fn answered(result: Result<ChatReply, AiError>) -> Result<ChatReply, (StatusCode, String)> {
    result.map_err(|err| {
        tracing::warn!("assistant: {}", err.message());
        let status = if err.is_busy() { StatusCode::TOO_MANY_REQUESTS } else { StatusCode::BAD_GATEWAY };
        (status, err.message())
    })
}

#[derive(serde::Deserialize)]
pub struct Period {
    days: Option<u32>,
}

/// What each account's assistant used over the last `days` days, for the
/// admin panel.
pub async fn usage(State(s): State<AppState>, _admin: crate::admin::AdminUser, Query(period): Query<Period>) -> Result<Json<AdminAiUsage>, ApiError> {
    // Usage is kept for `AI_USAGE_DAYS` (see `housekeeping`).
    let days = period.days.unwrap_or(30).clamp(1, crate::housekeeping::AI_USAGE_DAYS as u32);
    let today = Utc::now().date_naive();
    let first = today - chrono::Days::new(u64::from(days - 1));
    let rows = ai_usage::Entity::find()
        .filter(ai_usage::Column::Day.gte(first))
        .filter(ai_usage::Column::UserId.ne(EVERYONE))
        .order_by_asc(ai_usage::Column::Day)
        .all(&s.db)
        .await?;
    let ids: Vec<&str> = rows.iter().map(|r| r.user_id.as_str()).collect::<HashSet<_>>().into_iter().collect();
    let accounts: HashMap<String, user::Model> =
        user::Entity::find().filter(user::Column::Id.is_in(ids)).all(&s.db).await?.into_iter().map(|u| (u.id.clone(), u)).collect();

    let mut daily: Vec<AiUsageDay> = first.iter_days().take(days as usize).map(|day| AiUsageDay { day, totals: AiUsageTotals::default() }).collect();
    let mut people: HashMap<&str, AiUsagePerson> = HashMap::new();
    for row in &rows {
        let totals = totals_of(row);
        if let Some(day) = daily.get_mut((row.day - first).num_days() as usize) {
            add_totals(&mut day.totals, &totals);
        }
        // An account deleted since isn't shown, but still counts in the days'.
        let Some(account) = accounts.get(&row.user_id) else { continue };
        let person = people.entry(&row.user_id).or_insert_with(|| AiUsagePerson {
            id: account.id.clone(),
            email: account.email.clone(),
            display_name: account.display_name.clone(),
            totals: AiUsageTotals::default(),
            daily: Vec::new(),
            last_error: None,
            last_used_at: None,
        });
        add_totals(&mut person.totals, &totals);
        person.daily.push(AiUsageDay { day: row.day, totals });
        // Rows come oldest first, so the latest wins.
        if row.last_error.is_some() {
            person.last_error.clone_from(&row.last_error);
        }
        person.last_used_at = std::cmp::max(row.last_used_at, person.last_used_at);
    }
    let mut people: Vec<AiUsagePerson> = people.into_values().collect();
    people.sort_by_key(|p| std::cmp::Reverse(p.totals.input_tokens + p.totals.output_tokens));
    Ok(Json(AdminAiUsage { days, daily, people, daily_limit: s.ai_daily_limit }))
}

fn totals_of(row: &ai_usage::Model) -> AiUsageTotals {
    let n = |v: i64| u64::try_from(v).unwrap_or(0);
    AiUsageTotals {
        prompts: n(row.prompts.into()),
        calls: n(row.count.into()),
        input_tokens: n(row.input_tokens),
        cached_tokens: n(row.cached_tokens),
        output_tokens: n(row.output_tokens),
        transcriptions: n(row.transcriptions.into()),
        failures: n(row.failures.into()),
    }
}

fn add_totals(sum: &mut AiUsageTotals, more: &AiUsageTotals) {
    sum.prompts += more.prompts;
    sum.calls += more.calls;
    sum.input_tokens += more.input_tokens;
    sum.cached_tokens += more.cached_tokens;
    sum.output_tokens += more.output_tokens;
    sum.transcriptions += more.transcriptions;
    sum.failures += more.failures;
}

/// Speech to text for the assistant's microphone, on Axiom's keys.
pub async fn transcribe(State(s): State<AppState>, auth: AuthUser, Json(body): Json<Transcribe>) -> Result<Json<Transcript>, ApiError> {
    crate::admin::require(&s, &auth.user_id, permissions::AI).await?;
    if !s.ai_keys.any() {
        return Err(ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "The assistant isn't set up on this server yet."));
    }
    let audio = base64::engine::general_purpose::STANDARD.decode(body.audio.as_bytes()).map_err(|_| ApiError::bad_request("That recording couldn't be read."))?;
    if audio.is_empty() || audio.len() > MAX_AUDIO_BYTES {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "Keep it to about a minute at a time."));
    }
    if !body.mime.starts_with("audio/") {
        return Err(ApiError::bad_request("That isn't a recording."));
    }
    spend(&s, &auth.user_id, Usage { transcriptions: 1, ..Usage::default() }).await?;
    match s.ai.transcribe(&s.ai_keys, &audio, &body.mime).await {
        Ok(heard) => Ok(Json(heard)),
        Err(err) => {
            tracing::warn!("assistant speech: {}", err.message());
            let failed = Usage { failures: 1, error: Some(err.message()), ..Usage::default() };
            if let Err(db) = add(&s, &auth.user_id, Utc::now().date_naive(), failed).await {
                tracing::warn!("assistant: couldn't count usage: {db}");
            }
            let status = if err.is_busy() { StatusCode::TOO_MANY_REQUESTS } else { StatusCode::BAD_GATEWAY };
            Err(ApiError::new(status, err.message()))
        }
    }
}
