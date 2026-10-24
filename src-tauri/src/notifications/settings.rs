//! Which channels each notification comes on. Until the user changes one,
//! it shows in the app and on the desktop, and isn't emailed.

use chrono::{DateTime, Utc};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::Serialize;

use super::entities::setting;
use super::kinds::{self, KINDS};
use crate::error::{Error, Result};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Channels {
    pub kind: String,
    pub in_app: bool,
    pub desktop: bool,
    pub email: bool,
    /// When the user last changed it; None while it's on the defaults.
    #[serde(skip)]
    pub changed_at: Option<DateTime<Utc>>,
}

fn defaults(kind: &str) -> Channels {
    Channels { kind: kind.into(), in_app: true, desktop: true, email: false, changed_at: None }
}

/// Every notification's channels, in `KINDS` order.
pub async fn all(db: &DatabaseConnection) -> Result<Vec<Channels>> {
    let saved = setting::Entity::find().filter(setting::Column::DeletedAt.is_null()).all(db).await?;
    Ok(KINDS
        .iter()
        .map(|k| match saved.iter().find(|s| s.id == k.id) {
            Some(s) => Channels { kind: s.id.clone(), in_app: s.in_app, desktop: s.desktop, email: s.email && k.email, changed_at: Some(s.updated_at) },
            None => defaults(k.id),
        })
        .collect())
}

/// Switches one channel ("in_app", "desktop" or "email") of one notification.
pub async fn set(db: &DatabaseConnection, kind: &str, channel: &str, on: bool) -> Result<Channels> {
    let found = kinds::find(kind).ok_or_else(|| Error::Invalid(format!("Unknown notification: {kind}")))?;
    if channel == "email" && on && !found.email {
        return Err(Error::Invalid(format!("{} isn't sent by email.", found.label)));
    }
    let mut current = all(db).await?.into_iter().find(|c| c.kind == kind).unwrap_or_else(|| defaults(kind));
    match channel {
        "in_app" => current.in_app = on,
        "desktop" => current.desktop = on,
        "email" => current.email = on,
        _ => return Err(Error::Invalid(format!("Unknown channel: {channel}"))),
    }
    let row = setting::ActiveModel {
        id: Set(kind.into()),
        in_app: Set(current.in_app),
        desktop: Set(current.desktop),
        email: Set(current.email),
        updated_at: Set(Utc::now()),
        deleted_at: Set(None),
    };
    let saved = match setting::Entity::find_by_id(kind).one(db).await? {
        Some(_) => row.update(db).await?,
        None => row.insert(db).await?,
    };
    current.changed_at = Some(saved.updated_at);
    Ok(current)
}
