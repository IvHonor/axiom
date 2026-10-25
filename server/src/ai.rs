//! The assistant, on Axiom's own AI keys, for accounts allowed to use it.
//! The server only passes the conversation on (Gemini first, then Groq) and
//! keeps nothing: the app runs the tools, on the person's own computer.

use axiom_protocol::ai::{ChatReply, ChatRequest, MAX_MESSAGES, MAX_REQUEST_BYTES};
use axiom_protocol::permissions;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::ApiError;

/// Model calls per account per day. One question can take several (each
/// tool the assistant uses is another), and all accounts share the free
/// tiers' daily limits.
pub const REQUESTS_PER_DAY: u32 = 150;

pub async fn chat(State(s): State<AppState>, auth: AuthUser, Json(body): Json<ChatRequest>) -> Result<Json<ChatReply>, ApiError> {
    crate::admin::require(&s, &auth.user_id, permissions::AI).await?;
    if !s.ai_keys.any() {
        return Err(ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "The assistant isn't set up on this server yet. You can add your own free AI key in Settings."));
    }
    if body.messages.len() > MAX_MESSAGES || serde_json::to_vec(&body).map_or(true, |bytes| bytes.len() > MAX_REQUEST_BYTES) {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "This conversation has got too long. Start a new one."));
    }
    if !s.limits.ai.hit(&auth.user_id) {
        return Err(ApiError::too_many("You've used today's assistant allowance. It resets tomorrow, or you can add your own free AI key in Settings."));
    }
    match s.ai.chat(&s.ai_keys, &body).await {
        Ok(reply) => Ok(Json(reply)),
        Err(err) => {
            tracing::warn!("assistant: {}", err.message());
            let status = if err.is_busy() { StatusCode::TOO_MANY_REQUESTS } else { StatusCode::BAD_GATEWAY };
            Err(ApiError::new(status, err.message()))
        }
    }
}
