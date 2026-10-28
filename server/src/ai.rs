//! The assistant, on Axiom's own AI keys, for accounts allowed to use it.
//! The server only passes the conversation on (Gemini first, then Groq) and
//! keeps nothing: the app runs the tools, on the person's own computer.

use axiom_ai::{AiError, Delta};
use axiom_protocol::ai::{ChatReply, ChatRequest, MAX_AUDIO_BYTES, MAX_MESSAGES, MAX_REQUEST_BYTES, Streamed, Transcribe, Transcript};
use base64::Engine;
use axiom_protocol::permissions;
use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::{NaiveDate, Utc};
use sea_orm::sea_query::{Expr, ExprTrait, OnConflict};
use sea_orm::{DbErr, EntityTrait, Set};

use crate::AppState;
use crate::entities::ai_usage;
use crate::auth::AuthUser;
use crate::error::ApiError;

/// Model calls per account per day (UTC). One question can take several
/// (each tool the assistant uses is another).
pub const REQUESTS_PER_DAY: u32 = 150;
/// Model calls per day across every account, unless `AI_DAILY_LIMIT` says
/// otherwise: a ceiling on the paid Gemini bill, and about what Groq's free
/// tier allows in a day.
pub const EVERYONE_PER_DAY: u32 = 1000;
/// The `ai_usage` row that counts everyone's calls.
const EVERYONE: &str = "";

pub async fn chat(State(s): State<AppState>, auth: AuthUser, Json(body): Json<ChatRequest>) -> Result<Json<ChatReply>, ApiError> {
    may_chat(&s, &auth, &body).await?;
    match answered(s.ai.chat(&s.ai_keys, &body).await) {
        Ok(reply) => Ok(Json(reply)),
        Err((status, message)) => Err(ApiError::new(status, message)),
    }
}

/// Like `chat`, but the words go out as they're written: one `Streamed` per
/// line of JSON, ending with the reply (or why there isn't one).
pub async fn chat_stream(State(s): State<AppState>, auth: AuthUser, Json(body): Json<ChatRequest>) -> Result<Response, ApiError> {
    may_chat(&s, &auth, &body).await?;
    let (lines, mut out) = tokio::sync::mpsc::unbounded_channel::<Streamed>();
    tokio::spawn(async move {
        let on = |delta: Delta| {
            let _ = lines.send(match delta {
                Delta::Text(text) => Streamed::Text { text: text.into() },
                Delta::Restart => Streamed::Restart,
            });
        };
        // Nobody listening any more (the app was closed): stop asking.
        let result = tokio::select! {
            result = s.ai.chat_stream(&s.ai_keys, &body, &on) => result,
            () = lines.closed() => return,
        };
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

/// Whether this account may ask the assistant this now.
async fn may_chat(s: &AppState, auth: &AuthUser, body: &ChatRequest) -> Result<(), ApiError> {
    crate::admin::require(s, &auth.user_id, permissions::AI).await?;
    if !s.ai_keys.any() {
        return Err(ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "The assistant isn't set up on this server yet. You can add your own free AI key in Settings."));
    }
    if body.messages.len() > MAX_MESSAGES || serde_json::to_vec(body).map_or(true, |bytes| bytes.len() > MAX_REQUEST_BYTES) {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "This conversation has got too long. Start a new one."));
    }
    spend(s, &auth.user_id).await
}

/// Counts one model call against the account's allowance for today, then
/// against everyone's. Counted in the database, so a restart doesn't reset them.
async fn spend(s: &AppState, user_id: &str) -> Result<(), ApiError> {
    let today = Utc::now().date_naive();
    if count(s, user_id, today).await? > REQUESTS_PER_DAY {
        return Err(ApiError::too_many("You've used today's assistant allowance. It resets tomorrow, or you can add your own free AI key in Settings."));
    }
    // Only calls the account was allowed count towards everyone's, so one
    // account going on past its own allowance can't use up the rest.
    if count(s, EVERYONE, today).await? > s.ai_daily_limit {
        tracing::warn!("assistant: everyone's daily limit ({}) reached", s.ai_daily_limit);
        return Err(ApiError::too_many("Axiom's assistant has had all it can for today. It resets tomorrow, or you can add your own free AI key in Settings."));
    }
    Ok(())
}

/// Adds one to `key`'s count for `day`, and returns the new count.
async fn count(s: &AppState, key: &str, day: NaiveDate) -> Result<u32, DbErr> {
    let row = ai_usage::Entity::insert(ai_usage::ActiveModel { user_id: Set(key.into()), day: Set(day), count: Set(1) })
        .on_conflict(
            OnConflict::columns([ai_usage::Column::UserId, ai_usage::Column::Day])
                .value(ai_usage::Column::Count, Expr::col((ai_usage::Entity, ai_usage::Column::Count)).add(1))
                .to_owned(),
        )
        .exec_with_returning(&s.db)
        .await?;
    Ok(u32::try_from(row.count).unwrap_or(0))
}

/// Logs what an answer cost, or why there isn't one (and the status to send).
fn answered(result: Result<ChatReply, AiError>) -> Result<ChatReply, (StatusCode, String)> {
    match result {
        Ok(reply) => {
            if let Some(used) = reply.usage {
                tracing::info!(provider = %reply.provider, input = used.input, output = used.output, "assistant call");
            }
            Ok(reply)
        }
        Err(err) => {
            tracing::warn!("assistant: {}", err.message());
            let status = if err.is_busy() { StatusCode::TOO_MANY_REQUESTS } else { StatusCode::BAD_GATEWAY };
            Err((status, err.message()))
        }
    }
}

/// Speech to text for the assistant's microphone, on Axiom's keys. Counts
/// against the same daily allowance as chatting.
pub async fn transcribe(State(s): State<AppState>, auth: AuthUser, Json(body): Json<Transcribe>) -> Result<Json<Transcript>, ApiError> {
    crate::admin::require(&s, &auth.user_id, permissions::AI).await?;
    if !s.ai_keys.any() {
        return Err(ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "The assistant isn't set up on this server yet. You can add your own free AI key in Settings."));
    }
    let audio = base64::engine::general_purpose::STANDARD.decode(body.audio.as_bytes()).map_err(|_| ApiError::bad_request("That recording couldn't be read."))?;
    if audio.is_empty() || audio.len() > MAX_AUDIO_BYTES {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "Keep it to about a minute at a time."));
    }
    if !body.mime.starts_with("audio/") {
        return Err(ApiError::bad_request("That isn't a recording."));
    }
    spend(&s, &auth.user_id).await?;
    match s.ai.transcribe(&s.ai_keys, &audio, &body.mime).await {
        Ok(heard) => Ok(Json(heard)),
        Err(err) => {
            tracing::warn!("assistant speech: {}", err.message());
            let status = if err.is_busy() { StatusCode::TOO_MANY_REQUESTS } else { StatusCode::BAD_GATEWAY };
            Err(ApiError::new(status, err.message()))
        }
    }
}
