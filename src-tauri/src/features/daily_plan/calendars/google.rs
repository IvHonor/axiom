//! Google Calendar (REST API v3).
//!
//! Axiom asks for narrow permissions: to see the calendar list and events,
//! and to manage only calendars it creates itself. So the plan is published
//! into an "Axiom" calendar, and nothing else is ever changed.

use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, Days, FixedOffset, NaiveDate, Utc};
use rrule::Tz;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::json;

use super::ics::{midnight, split_into_days, DayEvent, Details, EventChange, Occurrence};
use super::oauth::OAuthApp;
use super::remote::{checked, nearest_color, unreachable, PlanEvent, Published, Remote, RemoteCalendar};
use super::{AXIOM_CALENDAR, AXIOM_CALENDAR_ABOUT, MARKER};
use crate::error::{Error, Result};

const PROVIDER: &str = "Google";

/// See https://developers.google.com/workspace/calendar/api/auth
pub const SCOPES: &str = "https://www.googleapis.com/auth/calendar.calendarlist.readonly \
     https://www.googleapis.com/auth/calendar.events.readonly \
     https://www.googleapis.com/auth/calendar.events.owned \
     https://www.googleapis.com/auth/calendar.app.created";

/// The permission to change events on the user's own calendars. Accounts
/// connected before Axiom asked for it can read but not edit until they reconnect.
pub const EDIT_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events.owned";

pub fn app(client_id: &str, client_secret: &str, auth_url: &str, token_url: &str) -> OAuthApp {
    OAuthApp {
        provider: PROVIDER,
        auth_url: auth_url.into(),
        token_url: token_url.into(),
        client_id: client_id.into(),
        client_secret: (!client_secret.is_empty()).then(|| client_secret.into()),
        scopes: SCOPES.into(),
        redirect_host: "127.0.0.1",
        // A refresh token every time, so reconnecting always works.
        extra: vec![("access_type", "offline"), ("prompt", "consent")],
        scope_on_token: false,
    }
}

pub struct Google {
    http: reqwest::Client,
    api: String,
    token: String,
    /// Whether the sign-in includes `EDIT_SCOPE`.
    can_edit: bool,
}

impl Google {
    pub fn new(http: reqwest::Client, api: &str, token: String, can_edit: bool) -> Self {
        Self { http, api: api.into(), token, can_edit }
    }

    /// The API address for some path segments, each escaped (calendar ids
    /// contain "@" and "#").
    fn url(&self, segments: &[&str]) -> reqwest::Url {
        let mut url = reqwest::Url::parse(&self.api).expect("valid API address");
        url.path_segments_mut().expect("API address has a path").pop_if_empty().extend(segments);
        url
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Result<reqwest::Response> {
        checked(request.bearer_auth(&self.token).send().await.map_err(unreachable(PROVIDER))?, PROVIDER).await
    }

    async fn json<T: DeserializeOwned>(&self, request: reqwest::RequestBuilder) -> Result<T> {
        self.send(request).await?.json().await.map_err(|_| Error::Invalid("Google sent something Axiom didn't understand.".into()))
    }

    /// Every page of a list.
    async fn all<T: DeserializeOwned>(&self, url: reqwest::Url, query: &[(&str, String)]) -> Result<Vec<T>> {
        let mut items = Vec::new();
        let mut page_token: Option<String> = None;
        loop {
            let mut request = self.http.get(url.clone()).query(query);
            if let Some(token) = &page_token {
                request = request.query(&[("pageToken", token)]);
            }
            let page: Page<T> = self.json(request).await?;
            items.extend(page.items);
            match page.next_page_token {
                Some(next) => page_token = Some(next),
                None => return Ok(items),
            }
        }
    }

    async fn events_between(&self, calendar: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<EventItem>> {
        let query = [
            ("timeMin", from.to_rfc3339()),
            ("timeMax", to.to_rfc3339()),
            // Repeating events come back as their separate occurrences.
            ("singleEvents", "true".to_owned()),
            ("maxResults", "2500".to_owned()),
        ];
        self.all(self.url(&["calendars", calendar, "events"]), &query).await
    }

    fn body(event: &PlanEvent) -> serde_json::Value {
        json!({
            "id": event_id(&event.block_id),
            "summary": event.title,
            "start": { "dateTime": event.start.to_rfc3339() },
            "end": { "dateTime": event.end.to_rfc3339() },
            "status": "confirmed",
            "transparency": "opaque",
            // No reminder for every block.
            "reminders": { "useDefault": false },
            // MARKER, spelled out: json! keys are literals.
            "extendedProperties": { "private": { "axiomBlock": event.block_id } },
        })
    }
}

/// Google event ids allow 0-9 and a-v: hex fits, and the same block always
/// gets the same id, so two computers publishing it make one event.
pub fn event_id(block_id: &str) -> String {
    block_id.bytes().map(|b| format!("{b:02x}")).collect()
}

#[async_trait]
impl Remote for Google {
    async fn account_name(&self) -> Result<String> {
        let primary: CalendarItem = self.json(self.http.get(self.url(&["users", "me", "calendarList", "primary"]))).await?;
        Ok(primary.id)
    }

    async fn calendars(&self) -> Result<Vec<RemoteCalendar>> {
        let items: Vec<CalendarItem> =
            self.all(self.url(&["users", "me", "calendarList"]), &[("minAccessRole", "reader".to_owned())]).await?;
        Ok(items
            .into_iter()
            .map(|c| {
                let name = c.summary_override.or(c.summary).unwrap_or_else(|| c.id.clone());
                RemoteCalendar {
                    // Axiom may only write to calendars it made, which it names "Axiom".
                    writable: c.access_role == "owner" && name == AXIOM_CALENDAR,
                    color: nearest_color(c.background_color.as_deref().unwrap_or("")),
                    primary: c.primary,
                    mine: matches!(c.access_role.as_str(), "owner" | "writer"),
                    remote_id: c.id,
                    name,
                }
            })
            .collect())
    }

    async fn events(&self, calendar: &str, from: NaiveDate, to: NaiveDate, zone: Tz) -> Result<Vec<DayEvent>> {
        let start = midnight(from, zone).with_timezone(&Utc);
        let end = midnight(to + Days::new(1), zone).with_timezone(&Utc);
        let mut out = Vec::new();
        for item in self.events_between(calendar, start, end).await? {
            if item.status == "cancelled" || item.marker().is_some() {
                continue;
            }
            let (Some(s), Some(e)) = (item.start.as_ref(), item.end.as_ref()) else { continue };
            let title = item.summary.clone().filter(|t| !t.trim().is_empty()).unwrap_or_else(|| "Busy".into());
            let (begins, length, all_day) = match (s, e) {
                (When { date: Some(sd), .. }, When { date: Some(ed), .. }) => {
                    (midnight(*sd, zone), chrono::Duration::days((*ed - *sd).num_days().max(1)), true)
                }
                (When { date_time: Some(sdt), .. }, When { date_time: Some(edt), .. }) => {
                    (sdt.with_timezone(&zone), (*edt - *sdt).max(chrono::Duration::zero()), false)
                }
                _ => continue,
            };
            let details = Details {
                location: item.location.clone().unwrap_or_default(),
                description: item.description.clone().unwrap_or_default(),
                link: item.html_link.clone(),
                recurring: item.recurring_event_id.is_some(),
            };
            let what = Occurrence {
                uid: &item.id,
                title: &title,
                all_day,
                busy: !all_day && item.transparency.as_deref() != Some("transparent"),
                details: &details,
            };
            split_into_days(&what, begins, length, zone, from, to, &mut out);
        }
        Ok(out)
    }

    async fn published(&self, calendar: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<Published>> {
        Ok(self
            .events_between(calendar, from, to)
            .await?
            .into_iter()
            .filter(|item| item.status != "cancelled")
            .filter_map(|item| {
                let block_id = item.marker()?.to_owned();
                Some(Published {
                    event: PlanEvent {
                        block_id,
                        title: item.summary.clone().unwrap_or_default(),
                        start: item.start.as_ref()?.date_time?.with_timezone(&Utc),
                        end: item.end.as_ref()?.date_time?.with_timezone(&Utc),
                    },
                    remote_id: item.id,
                })
            })
            .collect())
    }

    async fn create(&self, calendar: &str, event: &PlanEvent) -> Result<()> {
        let request = self.http.post(self.url(&["calendars", calendar, "events"])).json(&Self::body(event));
        let response = request.bearer_auth(&self.token).send().await.map_err(unreachable(PROVIDER))?;
        // Already there (from another computer, or deleted in Google, which
        // keeps the id): bring it back up to date instead.
        if response.status() == reqwest::StatusCode::CONFLICT {
            let id = event_id(&event.block_id);
            self.send(self.http.put(self.url(&["calendars", calendar, "events", &id])).json(&Self::body(event))).await?;
            return Ok(());
        }
        checked(response, PROVIDER).await.map(|_| ())
    }

    async fn update(&self, calendar: &str, existing: &Published, event: &PlanEvent) -> Result<()> {
        let mut body = Self::body(event);
        body["id"] = json!(existing.remote_id);
        self.send(self.http.put(self.url(&["calendars", calendar, "events", &existing.remote_id])).json(&body)).await?;
        Ok(())
    }

    async fn delete(&self, calendar: &str, existing: &Published) -> Result<()> {
        match self.send(self.http.delete(self.url(&["calendars", calendar, "events", &existing.remote_id]))).await {
            Ok(_) | Err(Error::NotFound(_)) => Ok(()),
            Err(e) => Err(e),
        }
    }

    async fn create_calendar(&self, name: &str) -> Result<RemoteCalendar> {
        let made: CalendarItem = self
            .json(self.http.post(self.url(&["calendars"])).json(&json!({ "summary": name, "description": AXIOM_CALENDAR_ABOUT })))
            .await?;
        Ok(RemoteCalendar { remote_id: made.id, name: name.into(), color: "purple".into(), writable: true, primary: false, mine: true })
    }

    fn can_edit_events(&self) -> bool {
        self.can_edit
    }

    async fn update_event(&self, calendar: &str, event: &str, change: &EventChange) -> Result<()> {
        let mut body = serde_json::Map::new();
        if let Some(t) = &change.title {
            body.insert("summary".into(), json!(t));
        }
        if let Some(l) = &change.location {
            body.insert("location".into(), json!(l));
        }
        if let Some(d) = &change.description {
            body.insert("description".into(), json!(d));
        }
        if let Some((start, end)) = change.times {
            body.insert("start".into(), json!({ "dateTime": start.to_rfc3339() }));
            body.insert("end".into(), json!({ "dateTime": end.to_rfc3339() }));
        }
        let request = self.http.patch(self.url(&["calendars", calendar, "events", event])).json(&body);
        let response = request.bearer_auth(&self.token).send().await.map_err(unreachable(PROVIDER))?;
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(Error::Invalid(
                "Google didn't let Axiom change that event. If it's your own, reconnect Google in Calendars to allow editing.".into(),
            ));
        }
        checked(response, PROVIDER).await.map(|_| ())
    }

    async fn delete_event(&self, calendar: &str, event: &str) -> Result<()> {
        match self.send(self.http.delete(self.url(&["calendars", calendar, "events", event]))).await {
            Ok(_) | Err(Error::NotFound(_)) => Ok(()),
            Err(e) => Err(e),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Page<T> {
    #[serde(default = "Vec::new")]
    items: Vec<T>,
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarItem {
    id: String,
    summary: Option<String>,
    summary_override: Option<String>,
    background_color: Option<String>,
    #[serde(default)]
    access_role: String,
    #[serde(default)]
    primary: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventItem {
    id: String,
    #[serde(default)]
    status: String,
    summary: Option<String>,
    start: Option<When>,
    end: Option<When>,
    transparency: Option<String>,
    extended_properties: Option<Extended>,
    location: Option<String>,
    description: Option<String>,
    html_link: Option<String>,
    recurring_event_id: Option<String>,
}

impl EventItem {
    fn marker(&self) -> Option<&str> {
        self.extended_properties.as_ref()?.private.get(MARKER).map(String::as_str)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct When {
    date: Option<NaiveDate>,
    date_time: Option<DateTime<FixedOffset>>,
}

#[derive(Deserialize)]
struct Extended {
    #[serde(default)]
    private: HashMap<String, String>,
}
