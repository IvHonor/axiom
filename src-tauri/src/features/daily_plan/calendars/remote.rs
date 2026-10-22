//! What every calendar provider offers Axiom: its calendars, their events,
//! and a place to publish the plan. Google, Microsoft and CalDAV each
//! implement `Remote`; syncing and publishing are written once against it.

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use rrule::Tz;

use super::ics::{DayEvent, EventChange};
use crate::error::{Error, Result};

#[derive(Clone, Debug, PartialEq)]
pub struct RemoteCalendar {
    /// The provider's id for it (a CalDAV calendar's address).
    pub remote_id: String,
    pub name: String,
    /// One of the planner's colour names, nearest to the provider's colour.
    pub color: String,
    /// Whether Axiom may publish the plan into it.
    pub writable: bool,
    /// The account's main calendar.
    pub primary: bool,
    /// The user's own (not one they subscribe to, like holidays): shown
    /// on the planner from the start.
    pub mine: bool,
}

/// A plan block as an event in a calendar.
#[derive(Clone, Debug, PartialEq)]
pub struct PlanEvent {
    pub block_id: String,
    pub title: String,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

/// An event Axiom published earlier, as the calendar has it now.
#[derive(Clone, Debug, PartialEq)]
pub struct Published {
    /// The provider's id for the event (a CalDAV resource's address).
    pub remote_id: String,
    pub event: PlanEvent,
}

#[async_trait]
pub trait Remote: Send + Sync {
    /// Who the account is, usually an email address.
    async fn account_name(&self) -> Result<String>;
    async fn calendars(&self) -> Result<Vec<RemoteCalendar>>;
    /// Events from `from` to `to` (both included), cut into days in `zone`,
    /// leaving out those Axiom published.
    async fn events(&self, calendar: &str, from: NaiveDate, to: NaiveDate, zone: Tz) -> Result<Vec<DayEvent>>;
    /// Axiom's own events starting in the window.
    async fn published(&self, calendar: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<Published>>;
    async fn create(&self, calendar: &str, event: &PlanEvent) -> Result<()>;
    async fn update(&self, calendar: &str, existing: &Published, event: &PlanEvent) -> Result<()>;
    async fn delete(&self, calendar: &str, existing: &Published) -> Result<()>;
    /// Makes a new calendar for the plan.
    async fn create_calendar(&self, name: &str) -> Result<RemoteCalendar>;

    /// Whether this sign-in may change the user's own events (Google asks
    /// for that separately).
    fn can_edit_events(&self) -> bool {
        true
    }
    /// Whether one occurrence of a repeating event can be changed on its own.
    fn edits_occurrences(&self) -> bool {
        true
    }
    /// Changes one event (or one occurrence), by its `DayEvent::uid`.
    async fn update_event(&self, calendar: &str, event: &str, change: &EventChange) -> Result<()>;
    async fn delete_event(&self, calendar: &str, event: &str) -> Result<()>;
}

/// The planner colour closest to a provider's "#rrggbb".
pub fn nearest_color(hex: &str) -> String {
    const SHADES: [(&str, [i32; 3]); 8] = [
        ("blue", [0x57, 0x9d, 0xff]),
        ("green", [0x4b, 0xce, 0x97]),
        ("purple", [0x9f, 0x8f, 0xef]),
        ("orange", [0xfe, 0xa3, 0x62]),
        ("red", [0xf8, 0x71, 0x68]),
        ("pink", [0xe7, 0x74, 0xbb]),
        ("yellow", [0xe2, 0xb2, 0x03]),
        ("gray", [0x8c, 0x9b, 0xab]),
    ];
    let hex = hex.trim().trim_start_matches('#');
    let channel = |i: usize| hex.get(i..i + 2).and_then(|c| i32::from_str_radix(c, 16).ok());
    let (Some(r), Some(g), Some(b)) = (channel(0), channel(2), channel(4)) else {
        return "gray".into();
    };
    SHADES
        .iter()
        .min_by_key(|(_, [sr, sg, sb])| (r - sr).pow(2) + (g - sg).pow(2) + (b - sb).pow(2))
        .map(|(name, _)| (*name).to_owned())
        .unwrap_or_else(|| "gray".into())
}

/// Turns a provider's reply into an error the user can act on.
pub async fn checked(response: reqwest::Response, provider: &str) -> Result<reqwest::Response> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().await.unwrap_or_default();
    eprintln!("{provider} calendar error {status}: {body}");
    Err(match status.as_u16() {
        401 => Error::Account(format!("{provider} signed Axiom out. Reconnect the account to keep it in sync.")),
        403 => Error::Invalid(format!("{provider} didn't allow that. The calendar may be read-only for you.")),
        404 | 410 => Error::NotFound("Calendar or event"),
        429 | 500..=599 => Error::Invalid(format!("{provider} is busy right now. Axiom will try again shortly.")),
        code => Error::Invalid(format!("{provider} couldn't do that (error {code}).")),
    })
}

pub fn unreachable(provider: &str) -> impl Fn(reqwest::Error) -> Error + '_ {
    move |_| Error::Invalid(format!("Couldn't reach {provider}. Check your connection."))
}
