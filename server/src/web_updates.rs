//! The list of people to tell when Axiom on the web opens, from the website.
//! Always answers the same way, so it can't be used to find out who's on it.

use axiom_protocol::{WebUpdates, check_email, normalize_email};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use chrono::Utc;
use sea_orm::{EntityTrait, Set};

use crate::AppState;
use crate::entities::web_update;
use crate::error::ApiError;
use crate::limit::ClientIp;

pub async fn join(State(s): State<AppState>, ip: ClientIp, Json(body): Json<WebUpdates>) -> Result<StatusCode, ApiError> {
    s.limits.check_ip(&ip)?;
    let email = normalize_email(&body.email);
    check_email(&email).map_err(ApiError::bad_request)?;
    let row = web_update::ActiveModel { email: Set(email), created_at: Set(Utc::now()) };
    web_update::Entity::insert(row)
        .on_conflict_do_nothing()
        .exec(&s.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
