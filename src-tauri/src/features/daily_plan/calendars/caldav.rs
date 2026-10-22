//! CalDAV (RFC 4791): iCloud, and also Fastmail, Nextcloud and other
//! servers. Signs in with a username and an app-specific password; events
//! travel as iCalendar text, read by `ics.rs`.

use async_trait::async_trait;
use chrono::{DateTime, Days, NaiveDate, Utc};
use roxmltree::{Document, Node};
use rrule::Tz;

use super::ics::{self, midnight, DayEvent};
use super::remote::{nearest_color, PlanEvent, Published, Remote, RemoteCalendar};
use super::AXIOM_CALENDAR;
use crate::error::{Error, Result};

pub const ICLOUD: &str = "https://caldav.icloud.com/";

const DAV: &str = "DAV:";
const CALDAV: &str = "urn:ietf:params:xml:ns:caldav";
const APPLE: &str = "http://apple.com/ns/ical/";

pub struct CalDav {
    http: reqwest::Client,
    server: String,
    username: String,
    password: String,
    /// "iCloud", or a general name for other servers, for messages.
    label: &'static str,
}

impl CalDav {
    pub fn new(server: &str, username: &str, password: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent(concat!("Axiom/", env!("CARGO_PKG_VERSION")))
            // Redirects are followed by hand: a client would turn PROPFIND into GET.
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("HTTP client");
        let label = if server.contains("icloud.com") { "iCloud" } else { "The calendar server" };
        Self { http, server: server.into(), username: username.into(), password: password.into(), label }
    }

    /// Sends a WebDAV request, following redirects. Returns where it ended
    /// up and the reply.
    async fn dav(&self, method: &str, url: reqwest::Url, depth: Option<&str>, body: Option<String>, headers: &[(&str, &str)]) -> Result<(reqwest::Url, reqwest::Response)> {
        let method = reqwest::Method::from_bytes(method.as_bytes()).expect("valid method");
        let mut url = url;
        for _ in 0..5 {
            let mut request = self.http.request(method.clone(), url.clone()).basic_auth(&self.username, Some(&self.password));
            if let Some(depth) = depth {
                request = request.header("Depth", depth);
            }
            for (name, value) in headers {
                request = request.header(*name, *value);
            }
            if let Some(body) = &body {
                let kind = if body.starts_with("BEGIN:VCALENDAR") { "text/calendar; charset=utf-8" } else { "application/xml; charset=utf-8" };
                request = request.header("Content-Type", kind).body(body.clone());
            }
            let response = request
                .send()
                .await
                .map_err(|_| {
                    let name = if self.label == "iCloud" { "iCloud" } else { "the calendar server" };
                    Error::Invalid(format!("Couldn't reach {name}. Check your connection."))
                })?;
            let status = response.status();
            if status.is_redirection() {
                let location = response.headers().get("Location").and_then(|l| l.to_str().ok()).map(str::to_owned);
                url = match location.and_then(|l| url.join(&l).ok()) {
                    Some(next) => next,
                    None => break,
                };
                continue;
            }
            if status.as_u16() == 401 {
                return Err(Error::Account(format!(
                    "{} didn't accept the sign-in. Check the email and app-specific password, then reconnect.",
                    self.label
                )));
            }
            return Ok((url, response));
        }
        Err(Error::Invalid(format!("{} sent Axiom round in circles. Check the server address.", self.label)))
    }

    /// PROPFIND or REPORT, expecting a multi-status reply.
    async fn multistatus(&self, method: &str, url: reqwest::Url, depth: &str, body: String) -> Result<(reqwest::Url, String)> {
        let (url, response) = self.dav(method, url, Some(depth), Some(body), &[]).await?;
        let status = response.status();
        if !status.is_success() {
            return Err(match status.as_u16() {
                403 => Error::Invalid(format!("{} didn't allow that.", self.label)),
                404 => Error::NotFound("Calendar"),
                code => Error::Invalid(format!("{} couldn't do that (error {code}).", self.label)),
            });
        }
        let text = response.text().await.map_err(|_| Error::Invalid(format!("{} stopped replying.", self.label)))?;
        Ok((url, text))
    }

    fn base(&self) -> Result<reqwest::Url> {
        reqwest::Url::parse(&self.server).map_err(|_| Error::Invalid("That server address isn't valid.".into()))
    }

    /// Where the account's calendars live: server → principal → calendar home.
    async fn home(&self) -> Result<reqwest::Url> {
        let mut principal = None;
        for start in [self.base()?, self.base()?.join("/.well-known/caldav").expect("valid path")] {
            match self.multistatus("PROPFIND", start, "0", PRINCIPAL.into()).await {
                Ok((at, text)) => {
                    principal = parse(&text)?.iter().find_map(|r| r.href_in(DAV, "current-user-principal")).and_then(|h| at.join(&h).ok());
                    if principal.is_some() {
                        break;
                    }
                }
                // A refused sign-in won't fix itself at the next address.
                Err(e @ Error::Account(_)) => return Err(e),
                Err(_) => {}
            }
        }
        let principal = principal.ok_or_else(|| Error::Invalid("Axiom couldn't find any calendars at that address.".into()))?;
        let (at, text) = self.multistatus("PROPFIND", principal, "0", HOME.into()).await?;
        parse(&text)?
            .iter()
            .find_map(|r| r.href_in(CALDAV, "calendar-home-set"))
            .and_then(|h| at.join(&h).ok())
            .ok_or_else(|| Error::Invalid(format!("{} didn't say where your calendars are.", self.label)))
    }

    async fn query(&self, calendar: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<(reqwest::Url, String)>> {
        let url = reqwest::Url::parse(calendar).map_err(|_| Error::NotFound("Calendar"))?;
        let stamp = |t: DateTime<Utc>| t.format("%Y%m%dT%H%M%SZ").to_string();
        let body = EVENTS.replace("{start}", &stamp(from)).replace("{end}", &stamp(to));
        let (at, text) = self.multistatus("REPORT", url, "1", body).await?;
        Ok(parse(&text)?
            .into_iter()
            .filter_map(|r| Some((at.join(&r.href).ok()?, r.text(CALDAV, "calendar-data")?)))
            .collect())
    }

    async fn put(&self, url: reqwest::Url, event: &PlanEvent, create: bool) -> Result<reqwest::StatusCode> {
        let headers: &[(&str, &str)] = if create { &[("If-None-Match", "*")] } else { &[] };
        let (_, response) = self.dav("PUT", url, None, Some(event_text(event)), headers).await?;
        let status = response.status();
        if status.is_success() || status.as_u16() == 412 {
            return Ok(status);
        }
        Err(Error::Invalid(format!("{} didn't save the plan (error {}).", self.label, status.as_u16())))
    }
}

#[async_trait]
impl Remote for CalDav {
    async fn account_name(&self) -> Result<String> {
        // Checks the sign-in works on the way.
        self.home().await?;
        Ok(self.username.clone())
    }

    async fn calendars(&self) -> Result<Vec<RemoteCalendar>> {
        let home = self.home().await?;
        let (at, text) = self.multistatus("PROPFIND", home, "1", CALENDARS.into()).await?;
        Ok(parse(&text)?
            .into_iter()
            .filter(|r| r.has(CALDAV, "calendar"))
            // Task lists and the like hold no events.
            .filter(|r| r.components.is_empty() || r.components.iter().any(|c| c == "VEVENT"))
            .filter_map(|r| {
                let url = at.join(&r.href).ok()?;
                let name = r
                    .text(DAV, "displayname")
                    .filter(|n| !n.trim().is_empty())
                    .unwrap_or_else(|| url.path_segments().and_then(|s| s.filter(|p| !p.is_empty()).last()).unwrap_or("Calendar").to_owned());
                let writable = r.privileges.is_empty() || r.privileges.iter().any(|p| matches!(p.as_str(), "write" | "write-content" | "all"));
                Some(RemoteCalendar {
                    remote_id: url.to_string(),
                    color: nearest_color(&r.text(APPLE, "calendar-color").unwrap_or_default()),
                    writable,
                    primary: false,
                    mine: writable,
                    name,
                })
            })
            .collect())
    }

    async fn events(&self, calendar: &str, from: NaiveDate, to: NaiveDate, zone: Tz) -> Result<Vec<DayEvent>> {
        let start = midnight(from, zone).with_timezone(&Utc);
        let end = midnight(to + Days::new(1), zone).with_timezone(&Utc);
        let mut out = Vec::new();
        for (_, data) in self.query(calendar, start, end).await? {
            // One unreadable event doesn't hide the rest.
            if let Ok(events) = ics::day_events(&data, from, to, zone) {
                out.extend(events);
            }
        }
        Ok(out)
    }

    async fn published(&self, calendar: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<Published>> {
        Ok(self
            .query(calendar, from, to)
            .await?
            .into_iter()
            .flat_map(|(url, data)| ics::marked(&data).into_iter().map(move |m| (url.clone(), m)))
            .map(|(url, m)| Published {
                remote_id: url.to_string(),
                event: PlanEvent { block_id: m.block_id, title: m.title, start: m.start, end: m.end },
            })
            .collect())
    }

    async fn create(&self, calendar: &str, event: &PlanEvent) -> Result<()> {
        let url = reqwest::Url::parse(calendar)
            .and_then(|c| c.join(&format!("axiom-{}.ics", event.block_id)))
            .map_err(|_| Error::NotFound("Calendar"))?;
        // The address comes from the block, so another computer's copy is
        // the same resource: if it's there already, bring it up to date.
        if self.put(url.clone(), event, true).await?.as_u16() == 412 {
            self.put(url, event, false).await?;
        }
        Ok(())
    }

    async fn update(&self, _calendar: &str, existing: &Published, event: &PlanEvent) -> Result<()> {
        let url = reqwest::Url::parse(&existing.remote_id).map_err(|_| Error::NotFound("Event"))?;
        self.put(url, event, false).await.map(|_| ())
    }

    async fn delete(&self, _calendar: &str, existing: &Published) -> Result<()> {
        let url = reqwest::Url::parse(&existing.remote_id).map_err(|_| Error::NotFound("Event"))?;
        let (_, response) = self.dav("DELETE", url, None, None, &[]).await?;
        if response.status().is_success() || response.status().as_u16() == 404 {
            return Ok(());
        }
        Err(Error::Invalid(format!("{} didn't remove an old plan block (error {}).", self.label, response.status().as_u16())))
    }

    async fn create_calendar(&self, name: &str) -> Result<RemoteCalendar> {
        if let Some(found) = self.calendars().await?.into_iter().find(|c| c.name == name && c.writable) {
            return Ok(found);
        }
        let home = self.home().await?;
        let url = home.join(&format!("{}/", uuid::Uuid::new_v4())).expect("valid path");
        let body = MKCALENDAR.replace("{name}", &xml_escape(name));
        let (at, response) = self.dav("MKCALENDAR", url, None, Some(body), &[]).await?;
        if !response.status().is_success() {
            return Err(Error::Invalid(format!(
                "{} wouldn't create a calendar. Make one called \"{AXIOM_CALENDAR}\" in your calendar app, then choose it here.",
                self.label
            )));
        }
        Ok(RemoteCalendar { remote_id: at.to_string(), name: name.into(), color: "purple".into(), writable: true, primary: false, mine: true })
    }
}

// ---------- Requests ----------

const PRINCIPAL: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>"#;

const HOME: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>"#;

const CALENDARS: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
  <d:prop>
    <d:resourcetype/><d:displayname/><a:calendar-color/>
    <c:supported-calendar-component-set/><d:current-user-privilege-set/>
  </d:prop>
</d:propfind>"#;

const EVENTS: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT"><c:time-range start="{start}" end="{end}"/></c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>"#;

const MKCALENDAR: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:set><d:prop>
    <d:displayname>{name}</d:displayname>
    <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  </d:prop></d:set>
</c:mkcalendar>"#;

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// A plan block as an iCalendar object, marked as Axiom's.
pub fn event_text(event: &PlanEvent) -> String {
    let stamp = |t: DateTime<Utc>| t.format("%Y%m%dT%H%M%SZ").to_string();
    let escape = |t: &str| t.replace('\\', "\\\\").replace(';', "\\;").replace(',', "\\,").replace('\n', "\\n");
    let lines = [
        "BEGIN:VCALENDAR".to_owned(),
        "VERSION:2.0".into(),
        "PRODID:-//Axiom//Daily Plan//EN".into(),
        "BEGIN:VEVENT".into(),
        format!("UID:axiom-{}", event.block_id),
        format!("DTSTAMP:{}", stamp(Utc::now())),
        format!("DTSTART:{}", stamp(event.start)),
        format!("DTEND:{}", stamp(event.end)),
        format!("SUMMARY:{}", escape(&event.title)),
        "TRANSP:OPAQUE".into(),
        format!("X-AXIOM-BLOCK:{}", event.block_id),
        "END:VEVENT".into(),
        "END:VCALENDAR".into(),
    ];
    lines.iter().map(|l| fold(l)).collect::<Vec<_>>().join("\r\n") + "\r\n"
}

/// Splits a line into 75-byte pieces, continuations starting with a space.
fn fold(line: &str) -> String {
    let mut out = String::new();
    let mut width = 0;
    for c in line.chars() {
        if width + c.len_utf8() > 75 {
            out.push_str("\r\n ");
            width = 1;
        }
        out.push(c);
        width += c.len_utf8();
    }
    out
}

// ---------- Replies ----------

/// One <response> of a multi-status reply, its successful properties read out.
struct DavResponse {
    href: String,
    /// (namespace, name, text, hrefs inside, child element names)
    props: Vec<(String, String, String, Vec<String>, Vec<String>)>,
    components: Vec<String>,
    privileges: Vec<String>,
}

impl DavResponse {
    fn find(&self, ns: &str, name: &str) -> Option<&(String, String, String, Vec<String>, Vec<String>)> {
        self.props.iter().find(|p| p.0 == ns && p.1 == name)
    }

    fn text(&self, ns: &str, name: &str) -> Option<String> {
        self.find(ns, name).map(|p| p.2.clone())
    }

    fn href_in(&self, ns: &str, name: &str) -> Option<String> {
        self.find(ns, name)?.3.first().cloned()
    }

    /// Whether `resourcetype` includes this type.
    fn has(&self, ns: &str, name: &str) -> bool {
        self.find(DAV, "resourcetype").is_some_and(|p| p.4.iter().any(|c| c == &format!("{ns}|{name}")))
    }
}

fn parse(xml: &str) -> Result<Vec<DavResponse>> {
    let doc = Document::parse(xml).map_err(|_| Error::Invalid("The calendar server sent a reply Axiom couldn't read.".into()))?;
    let is = |n: &Node, ns: &str, name: &str| n.is_element() && n.tag_name().namespace() == Some(ns) && n.tag_name().name() == name;
    Ok(doc
        .descendants()
        .filter(|n| is(n, DAV, "response"))
        .filter_map(|response| {
            let href = response.children().find(|c| is(c, DAV, "href"))?.text()?.trim().to_owned();
            let mut props = Vec::new();
            for propstat in response.children().filter(|c| is(c, DAV, "propstat")) {
                let ok = propstat.children().find(|c| is(c, DAV, "status")).and_then(|s| s.text()).is_some_and(|s| s.contains(" 200"));
                if !ok {
                    continue;
                }
                for prop in propstat.children().filter(|c| is(c, DAV, "prop")).flat_map(|p| p.children()).filter(Node::is_element) {
                    let text: String = prop.descendants().filter(Node::is_text).filter_map(|t| t.text()).collect::<String>();
                    let hrefs = prop.descendants().filter(|d| is(d, DAV, "href")).filter_map(|d| d.text()).map(|t| t.trim().to_owned()).collect();
                    let children = prop
                        .children()
                        .filter(Node::is_element)
                        .map(|c| format!("{}|{}", c.tag_name().namespace().unwrap_or(""), c.tag_name().name()))
                        .collect();
                    props.push((prop.tag_name().namespace().unwrap_or("").to_owned(), prop.tag_name().name().to_owned(), text.trim().to_owned(), hrefs, children));
                }
            }
            let components = props
                .iter()
                .filter(|p| p.0 == CALDAV && p.1 == "supported-calendar-component-set")
                .flat_map(|_| {
                    response
                        .descendants()
                        .filter(|d| is(d, CALDAV, "comp"))
                        .filter_map(|d| d.attribute("name").map(str::to_owned))
                        .collect::<Vec<_>>()
                })
                .collect();
            let privileges = props
                .iter()
                .filter(|p| p.0 == DAV && p.1 == "current-user-privilege-set")
                .flat_map(|_| {
                    response
                        .descendants()
                        .filter(|d| is(d, DAV, "privilege"))
                        .flat_map(|d| d.children().filter(Node::is_element).map(|c| c.tag_name().name().to_owned()).collect::<Vec<_>>())
                        .collect::<Vec<_>>()
                })
                .collect();
            Some(DavResponse { href, props, components, privileges })
        })
        .collect())
}
