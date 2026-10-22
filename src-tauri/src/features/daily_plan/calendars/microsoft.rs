//! Outlook and Microsoft 365 calendars (Microsoft Graph), for personal
//! (outlook.com, hotmail) and work or school accounts alike.

use async_trait::async_trait;
use chrono::{DateTime, Days, NaiveDate, NaiveDateTime, Utc};
use rrule::Tz;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::json;

use super::ics::{midnight, split_into_days, DayEvent, Details, EventChange, Occurrence};
use super::oauth::OAuthApp;
use super::remote::{checked, nearest_color, unreachable, PlanEvent, Published, Remote, RemoteCalendar};
use super::{AXIOM_CALENDAR, MARKER};
use crate::error::{Error, Result};

const PROVIDER: &str = "Microsoft";

pub const SCOPES: &str = "offline_access Calendars.ReadWrite";

/// Axiom's marker on the events it publishes: a named extended property,
/// in a property set (GUID) of Axiom's own.
fn marker_property() -> String {
    format!("String {{6d2b9c1e-7f3a-4e8b-a5c4-1b9e2d7f0a36}} Name {MARKER}")
}

pub fn app(client_id: &str, auth_url: &str, token_url: &str) -> OAuthApp {
    OAuthApp {
        provider: PROVIDER,
        auth_url: auth_url.into(),
        token_url: token_url.into(),
        client_id: client_id.into(),
        client_secret: None,
        scopes: SCOPES.into(),
        // Registered once as http://localhost; Microsoft ignores the port.
        redirect_host: "localhost",
        extra: vec![("response_mode", "query"), ("prompt", "select_account")],
        scope_on_token: true,
    }
}

pub struct Microsoft {
    http: reqwest::Client,
    api: String,
    token: String,
}

impl Microsoft {
    pub fn new(http: reqwest::Client, api: &str, token: String) -> Self {
        Self { http, api: api.trim_end_matches('/').into(), token }
    }

    fn url(&self, segments: &[&str]) -> reqwest::Url {
        let mut url = reqwest::Url::parse(&self.api).expect("valid API address");
        url.path_segments_mut().expect("API address has a path").pop_if_empty().extend(segments);
        url
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Result<reqwest::Response> {
        let request = request
            .bearer_auth(&self.token)
            // Times come back in UTC, whatever zone the event was made in.
            .header("Prefer", "outlook.timezone=\"UTC\"");
        checked(request.send().await.map_err(unreachable(PROVIDER))?, PROVIDER).await
    }

    async fn json<T: DeserializeOwned>(&self, request: reqwest::RequestBuilder) -> Result<T> {
        self.send(request).await?.json().await.map_err(|_| Error::Invalid("Microsoft sent something Axiom didn't understand.".into()))
    }

    /// Every page of a list (Graph links to the next one).
    async fn all<T: DeserializeOwned>(&self, first: reqwest::RequestBuilder) -> Result<Vec<T>> {
        let mut page: Page<T> = self.json(first).await?;
        let mut items = std::mem::take(&mut page.value);
        while let Some(next) = page.next_link.take() {
            page = self.json(self.http.get(next)).await?;
            items.append(&mut page.value);
        }
        Ok(items)
    }

    /// Occurrences (repeats expanded) overlapping the window.
    async fn view(&self, calendar: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<EventItem>> {
        let expand = format!("singleValueExtendedProperties($filter=id eq '{}')", marker_property());
        let request = self.http.get(self.url(&["me", "calendars", calendar, "calendarView"])).query(&[
            ("startDateTime", from.format("%Y-%m-%dT%H:%M:%SZ").to_string()),
            ("endDateTime", to.format("%Y-%m-%dT%H:%M:%SZ").to_string()),
            ("$top", "500".into()),
            ("$select", "id,subject,start,end,isAllDay,showAs,isCancelled,location,bodyPreview,webLink,type".into()),
            ("$expand", expand),
        ]);
        self.all(request).await
    }

    fn body(event: &PlanEvent) -> serde_json::Value {
        let at = |t: DateTime<Utc>| json!({ "dateTime": t.format("%Y-%m-%dT%H:%M:%S").to_string(), "timeZone": "UTC" });
        json!({
            "subject": event.title,
            "start": at(event.start),
            "end": at(event.end),
            "showAs": "busy",
            // No reminder for every block.
            "isReminderOn": false,
        })
    }
}

#[async_trait]
impl Remote for Microsoft {
    async fn account_name(&self) -> Result<String> {
        let calendars: Vec<CalendarItem> = self.all(self.http.get(self.url(&["me", "calendars"]))).await?;
        Ok(calendars
            .iter()
            .find(|c| c.is_default_calendar)
            .or(calendars.first())
            .and_then(|c| c.owner.as_ref())
            .map(|o| o.address.clone())
            .unwrap_or_else(|| "Microsoft account".into()))
    }

    async fn calendars(&self) -> Result<Vec<RemoteCalendar>> {
        let items: Vec<CalendarItem> = self.all(self.http.get(self.url(&["me", "calendars"])).query(&[("$top", "100")])).await?;
        Ok(items
            .into_iter()
            .map(|c| RemoteCalendar {
                color: nearest_color(c.hex_color.as_deref().unwrap_or("")),
                writable: c.can_edit,
                mine: c.can_edit,
                primary: c.is_default_calendar,
                remote_id: c.id,
                name: c.name,
            })
            .collect())
    }

    async fn events(&self, calendar: &str, from: NaiveDate, to: NaiveDate, zone: Tz) -> Result<Vec<DayEvent>> {
        let start = midnight(from, zone).with_timezone(&Utc);
        let end = midnight(to + Days::new(1), zone).with_timezone(&Utc);
        let mut out = Vec::new();
        for item in self.view(calendar, start, end).await? {
            if item.is_cancelled || item.marker().is_some() {
                continue;
            }
            let (Some(s), Some(e)) = (item.start.utc(), item.end.utc()) else { continue };
            let title = item.subject.clone().filter(|t| !t.trim().is_empty()).unwrap_or_else(|| "Busy".into());
            let (begins, length) = if item.is_all_day {
                // All-day events are whole dates, but come back shifted into
                // UTC; the nearest midnight is the real start.
                let day = (s + chrono::Duration::hours(12)).date_naive();
                let days = ((e - s).num_hours() as f64 / 24.0).round().max(1.0) as i64;
                (midnight(day, zone), chrono::Duration::days(days))
            } else {
                (s.with_timezone(&zone), (e - s).max(chrono::Duration::zero()))
            };
            let details = Details {
                location: item.location.as_ref().map(|l| l.display_name.clone()).unwrap_or_default(),
                description: item.body_preview.clone().unwrap_or_default(),
                link: item.web_link.clone(),
                recurring: matches!(item.kind.as_deref(), Some("occurrence" | "exception")),
            };
            let what = Occurrence {
                uid: &item.id,
                title: &title,
                all_day: item.is_all_day,
                busy: !item.is_all_day && item.show_as.as_deref() != Some("free"),
                details: &details,
            };
            split_into_days(&what, begins, length, zone, from, to, &mut out);
        }
        Ok(out)
    }

    async fn published(&self, calendar: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<Published>> {
        Ok(self
            .view(calendar, from, to)
            .await?
            .into_iter()
            .filter(|item| !item.is_cancelled)
            .filter_map(|item| {
                Some(Published {
                    event: PlanEvent {
                        block_id: item.marker()?.to_owned(),
                        title: item.subject.clone().unwrap_or_default(),
                        start: item.start.utc()?,
                        end: item.end.utc()?,
                    },
                    remote_id: item.id,
                })
            })
            .collect())
    }

    async fn create(&self, calendar: &str, event: &PlanEvent) -> Result<()> {
        let mut body = Self::body(event);
        body["singleValueExtendedProperties"] = json!([{ "id": marker_property(), "value": event.block_id }]);
        self.send(self.http.post(self.url(&["me", "calendars", calendar, "events"])).json(&body)).await?;
        Ok(())
    }

    async fn update(&self, _calendar: &str, existing: &Published, event: &PlanEvent) -> Result<()> {
        self.send(self.http.patch(self.url(&["me", "events", &existing.remote_id])).json(&Self::body(event))).await?;
        Ok(())
    }

    async fn delete(&self, _calendar: &str, existing: &Published) -> Result<()> {
        match self.send(self.http.delete(self.url(&["me", "events", &existing.remote_id]))).await {
            Ok(_) | Err(Error::NotFound(_)) => Ok(()),
            Err(e) => Err(e),
        }
    }

    async fn create_calendar(&self, name: &str) -> Result<RemoteCalendar> {
        // Microsoft refuses two calendars with one name: reuse it if it's there.
        if let Some(found) = self.calendars().await?.into_iter().find(|c| c.name == name && c.writable) {
            return Ok(found);
        }
        let made: CalendarItem = self.json(self.http.post(self.url(&["me", "calendars"])).json(&json!({ "name": name }))).await?;
        Ok(RemoteCalendar {
            remote_id: made.id,
            name: if made.name.is_empty() { AXIOM_CALENDAR.into() } else { made.name },
            color: "purple".into(),
            writable: true,
            primary: false,
            mine: true,
        })
    }

    async fn update_event(&self, _calendar: &str, event: &str, change: &EventChange) -> Result<()> {
        let mut body = serde_json::Map::new();
        if let Some(t) = &change.title {
            body.insert("subject".into(), json!(t));
        }
        if let Some(l) = &change.location {
            body.insert("location".into(), json!({ "displayName": l }));
        }
        // Only when it was changed: Axiom only saw a preview of the notes.
        if let Some(d) = &change.description {
            body.insert("body".into(), json!({ "contentType": "text", "content": d }));
        }
        if let Some((start, end)) = change.times {
            let at = |t: DateTime<Utc>| json!({ "dateTime": t.format("%Y-%m-%dT%H:%M:%S").to_string(), "timeZone": "UTC" });
            body.insert("start".into(), at(start));
            body.insert("end".into(), at(end));
        }
        self.send(self.http.patch(self.url(&["me", "events", event])).json(&body)).await?;
        Ok(())
    }

    async fn delete_event(&self, _calendar: &str, event: &str) -> Result<()> {
        match self.send(self.http.delete(self.url(&["me", "events", event]))).await {
            Ok(_) | Err(Error::NotFound(_)) => Ok(()),
            Err(e) => Err(e),
        }
    }
}

#[derive(Deserialize)]
struct Page<T> {
    #[serde(default = "Vec::new")]
    value: Vec<T>,
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarItem {
    id: String,
    #[serde(default)]
    name: String,
    hex_color: Option<String>,
    #[serde(default)]
    can_edit: bool,
    #[serde(default)]
    is_default_calendar: bool,
    owner: Option<Owner>,
}

#[derive(Deserialize)]
struct Owner {
    #[serde(default)]
    address: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventItem {
    id: String,
    subject: Option<String>,
    start: GraphTime,
    end: GraphTime,
    #[serde(default)]
    is_all_day: bool,
    show_as: Option<String>,
    #[serde(default)]
    is_cancelled: bool,
    #[serde(default)]
    single_value_extended_properties: Vec<Property>,
    location: Option<Location>,
    body_preview: Option<String>,
    web_link: Option<String>,
    /// "singleInstance", "occurrence", "exception" or "seriesMaster".
    #[serde(rename = "type")]
    kind: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Location {
    #[serde(default)]
    display_name: String,
}

impl EventItem {
    fn marker(&self) -> Option<&str> {
        self.single_value_extended_properties.first().map(|p| p.value.as_str())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphTime {
    date_time: String,
}

impl GraphTime {
    /// "2026-10-22T09:00:00.0000000", in UTC (see the Prefer header).
    fn utc(&self) -> Option<DateTime<Utc>> {
        let text = self.date_time.split('.').next()?;
        Some(NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S").ok()?.and_utc())
    }
}

#[derive(Deserialize)]
struct Property {
    value: String,
}
