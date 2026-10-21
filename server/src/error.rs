//! Errors the API returns. Every one becomes `{ "message": "..." }` with a
//! status code, and the message is written to be shown to the user as is.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use sea_orm::DbErr;

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self { status, message: message.into() }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, message)
    }

    pub fn too_many(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, message)
    }

    /// Logs the real cause; the user only sees a generic message.
    pub fn internal(cause: impl std::fmt::Display) -> Self {
        tracing::error!("{cause}");
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "Something went wrong on the server. Try again shortly.")
    }
}

impl From<DbErr> for ApiError {
    fn from(err: DbErr) -> Self {
        Self::internal(err)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(axiom_protocol::ApiError { message: self.message })).into_response()
    }
}
