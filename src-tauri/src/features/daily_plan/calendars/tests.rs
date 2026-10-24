//! Calendar accounts against stand-in servers that answer like Google,
//! Microsoft and iCloud. The user is in London; day 22 (TODAY) is Thursday
//! 22 October 2026, on British Summer Time (UTC+1).

use rrule::Tz;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use serde_json::json;
use wiremock::matchers::{body_string_contains, header, method, path, path_regex, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::accounts::{self, CalendarHub, Providers};
use super::oauth::{Loopback, Pkce};
use super::publish::{diff, Action};
use super::remote::{PlanEvent, Published};
use super::secrets::{Memory, Secret, SecretStore};
use super::{google, microsoft, refresh_calendars};
use crate::features::daily_plan::entities::{calendar, calendar_account as account, event};
use crate::features::daily_plan::service;
use crate::features::daily_plan::tests::{day, setup, TODAY};

const LONDON: Tz = Tz::Tz(chrono_tz::Europe::London);
/// What the stand-in Google grants: reading, and editing the user's own events.
const G_SCOPES: &str = "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.events.owned";

fn hub(server: &MockServer, secrets: Memory) -> CalendarHub {
    let base = server.uri();
    let providers = Providers {
        google: google::app("google-id", "google-secret", &format!("{base}/google/auth"), &format!("{base}/google/token")),
        google_api: format!("{base}/calendar/v3"),
        google_revoke: format!("{base}/google/revoke"),
        microsoft: microsoft::app("microsoft-id", &format!("{base}/ms/auth"), &format!("{base}/ms/token")),
        graph_api: format!("{base}/graph"),
    };
    CalendarHub::new(Box::new(secrets), providers, LONDON)
}

/// Plays the browser: follows the sign-in page straight back to Axiom.
fn browser(code: &'static str) -> impl FnOnce(&str) -> crate::error::Result<()> {
    move |url: &str| {
        let url = reqwest::Url::parse(url).unwrap();
        let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).unwrap().1.into_owned();
        let (redirect, state) = (param("redirect_uri"), param("state"));
        assert_eq!(param("code_challenge_method"), "S256");
        tokio::spawn(async move {
            reqwest::get(format!("{redirect}/?code={code}&state={state}")).await.unwrap();
        });
        Ok(())
    }
}

fn utc(text: &str) -> chrono::DateTime<chrono::Utc> {
    text.parse().unwrap()
}

async fn titles(db: &DatabaseConnection, on: u32) -> Vec<String> {
    service::get_day(db, day(on), day(TODAY)).await.unwrap().events.into_iter().map(|e| e.title).collect()
}

// ---------- Signing in ----------

#[test]
fn pkce_matches_the_rfc_example() {
    // RFC 7636, appendix B.
    let pkce = Pkce::from_verifier("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".into());
    assert_eq!(pkce.challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
}

#[tokio::test]
async fn the_browser_comes_back_with_the_code() {
    let loopback = Loopback::bind().await.unwrap();
    let port = loopback.port;
    tokio::spawn(async move {
        // A favicon request first, as browsers do; it's ignored.
        let _ = reqwest::get(format!("http://127.0.0.1:{port}/favicon.ico")).await;
        let page = reqwest::get(format!("http://127.0.0.1:{port}/?code=abc&state=xyz")).await.unwrap().text().await.unwrap();
        assert!(page.contains("connected"));
    });
    assert_eq!(loopback.wait("xyz", "Google").await.unwrap(), "abc");
}

#[tokio::test]
async fn an_answer_for_another_sign_in_is_refused() {
    let loopback = Loopback::bind().await.unwrap();
    let port = loopback.port;
    tokio::spawn(async move {
        let _ = reqwest::get(format!("http://127.0.0.1:{port}/?code=abc&state=someone-else")).await;
    });
    assert!(loopback.wait("xyz", "Google").await.is_err());
}

// ---------- Publishing ----------

fn plan(block: &str, title: &str, start: &str, end: &str) -> PlanEvent {
    PlanEvent { block_id: block.into(), title: title.into(), start: utc(start), end: utc(end) }
}

#[test]
fn publishing_changes_only_what_differs() {
    let desired = [
        plan("a", "Write", "2026-10-22T08:00:00Z", "2026-10-22T09:00:00Z"),
        plan("b", "Read", "2026-10-22T10:00:00Z", "2026-10-22T10:30:00Z"),
        plan("c", "New", "2026-10-22T11:00:00Z", "2026-10-22T11:30:00Z"),
    ];
    let remote = [
        Published { remote_id: "1".into(), event: desired[0].clone() },
        Published { remote_id: "2".into(), event: plan("b", "Read", "2026-10-22T10:15:00Z", "2026-10-22T10:45:00Z") },
        // The same block twice (two computers raced): the extra goes.
        Published { remote_id: "3".into(), event: desired[0].clone() },
        // No longer in the plan.
        Published { remote_id: "4".into(), event: plan("gone", "Old", "2026-10-22T12:00:00Z", "2026-10-22T13:00:00Z") },
    ];
    let actions = diff(&desired, &remote);
    assert_eq!(
        actions,
        [Action::Update(&remote[1], &desired[1]), Action::Delete(&remote[2]), Action::Delete(&remote[3]), Action::Create(&desired[2])]
    );
}

// ---------- Google ----------

async fn google_basics(server: &MockServer) {
    Mock::given(method("POST"))
        .and(path("/google/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "access_token": "at-1", "expires_in": 3600, "refresh_token": "rt-1", "scope": "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.events.owned" })))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/calendar/v3/users/me/calendarList/primary"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "me@gmail.com", "accessRole": "owner", "primary": true })))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/calendar/v3/users/me/calendarList"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "items": [
            { "id": "me@gmail.com", "summary": "me@gmail.com", "backgroundColor": "#4986e7", "accessRole": "owner", "primary": true },
            { "id": "holidays", "summary": "Holidays in the UK", "backgroundColor": "#16a765", "accessRole": "reader" },
            { "id": "axiom-cal", "summary": "Axiom", "backgroundColor": "#9a9cff", "accessRole": "owner" }
        ]})))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/calendar/v3/calendars/me@gmail.com/events"))
        .and(query_param("singleEvents", "true"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "items": [
            { "id": "e1", "status": "confirmed", "summary": "Dentist", "location": "High Street Dental",
              "description": "Bring the form", "htmlLink": "https://calendar.google.com/event?eid=e1",
              "start": { "dateTime": "2026-10-22T14:00:00+01:00" }, "end": { "dateTime": "2026-10-22T14:45:00+01:00" } },
            { "id": "e2", "status": "confirmed", "summary": "Offsite",
              "start": { "date": "2026-10-23" }, "end": { "date": "2026-10-24" } },
            { "id": "e3", "status": "cancelled", "summary": "Called off",
              "start": { "dateTime": "2026-10-22T10:00:00Z" }, "end": { "dateTime": "2026-10-22T11:00:00Z" } },
            { "id": "e4", "status": "confirmed", "summary": "Maybe gym", "transparency": "transparent", "recurringEventId": "gym",
              "start": { "dateTime": "2026-10-22T18:00:00+01:00" }, "end": { "dateTime": "2026-10-22T19:00:00+01:00" } },
            { "id": "e5", "status": "confirmed", "summary": "Plan block from Axiom",
              "start": { "dateTime": "2026-10-22T09:00:00+01:00" }, "end": { "dateTime": "2026-10-22T10:00:00+01:00" },
              "extendedProperties": { "private": { "axiomBlock": "b1" } } }
        ]})))
        .mount(server)
        .await;
}

#[tokio::test]
async fn google_connects_and_reads_events() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    google_basics(&server).await;
    let hub = hub(&server, secrets.clone());

    let account = accounts::connect_oauth(&db, &hub, "google", day(TODAY), browser("google-code")).await.unwrap();
    assert_eq!((account.provider.as_str(), account.name.as_str()), ("google", "me@gmail.com"));
    assert_eq!(secrets.load(&account.id), Some(Secret::OAuth { refresh_token: "rt-1".into(), scope: Some(G_SCOPES.into()) }));
    let exchange = server.received_requests().await.unwrap().into_iter().find(|r| r.url.path() == "/google/token").unwrap();
    let form = String::from_utf8(exchange.body).unwrap();
    assert!(form.contains("code=google-code") && form.contains("code_verifier=") && form.contains("client_secret=google-secret"));

    let calendars = calendar::Entity::find().all(&db).await.unwrap();
    let shown = |name: &str| calendars.iter().find(|c| c.name == name).unwrap().shown;
    // Your own calendar shows; subscriptions and Axiom's plan calendar don't.
    assert!(shown("me@gmail.com") && !shown("Holidays in the UK") && !shown("Axiom"));
    let writable: Vec<&str> = calendars.iter().filter(|c| c.writable).map(|c| c.name.as_str()).collect();
    assert_eq!(writable, ["Axiom"]);

    // 2pm in London, the all-day event the next day; nothing cancelled or published by Axiom.
    let today = service::get_day(&db, day(TODAY), day(TODAY)).await.unwrap().events;
    let found: Vec<(&str, i32, bool)> = today.iter().map(|e| (e.title.as_str(), e.start_minute, e.busy)).collect();
    assert_eq!(found, [("Dentist", 14 * 60, true), ("Maybe gym", 18 * 60, false)]);
    assert_eq!(titles(&db, 23).await, ["Offsite"]);
}

#[tokio::test]
async fn google_publishes_the_plan_into_its_own_calendar() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    google_basics(&server).await;
    let hub = hub(&server, secrets);
    accounts::connect_oauth(&db, &hub, "google", day(TODAY), browser("code")).await.unwrap();
    let block = service::create_block(&db, day(TODAY), 9 * 60, 60, "Deep work", None).await.unwrap();

    // Nothing published yet: one event is created, with the block's id.
    Mock::given(method("GET"))
        .and(path("/calendar/v3/calendars/axiom-cal/events"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "items": [] })))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST")).and(path("/calendar/v3/calendars/axiom-cal/events")).respond_with(ResponseTemplate::new(200).set_body_json(json!({}))).mount(&server).await;
    let axiom = calendar::Entity::find().filter(calendar::Column::Name.eq("Axiom")).one(&db).await.unwrap().unwrap();
    accounts::set_publish(&db, &hub, Some(&axiom.id), day(TODAY)).await.unwrap();

    let posted = server.received_requests().await.unwrap().into_iter().find(|r| r.method.as_str() == "POST" && r.url.path().ends_with("/events")).unwrap();
    let body: serde_json::Value = serde_json::from_slice(&posted.body).unwrap();
    assert_eq!(body["summary"], "Deep work");
    assert_eq!(body["start"]["dateTime"], "2026-10-22T08:00:00+00:00");
    assert_eq!(body["id"], google::event_id(&block.id));
    assert_eq!(body["extendedProperties"]["private"]["axiomBlock"], block.id.as_str());
    assert_eq!(body["reminders"]["useDefault"], false);

    // Unchanged plan: nothing is sent.
    let before = server.received_requests().await.unwrap().len();
    refresh_calendars(&db, &hub, day(TODAY), false).await.unwrap();
    assert_eq!(server.received_requests().await.unwrap().len(), before);

    // Moved to 10:00: the calendar's copy is updated in place.
    Mock::given(method("GET"))
        .and(path("/calendar/v3/calendars/axiom-cal/events"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "items": [{
            "id": google::event_id(&block.id), "status": "confirmed", "summary": "Deep work",
            "start": { "dateTime": "2026-10-22T08:00:00Z" }, "end": { "dateTime": "2026-10-22T09:00:00Z" },
            "extendedProperties": { "private": { "axiomBlock": block.id } } }] })))
        .mount(&server)
        .await;
    Mock::given(method("PUT")).and(path_regex("^/calendar/v3/calendars/axiom-cal/events/.+")).respond_with(ResponseTemplate::new(200).set_body_json(json!({}))).mount(&server).await;
    service::update_block(
        &db,
        &block.id,
        crate::features::daily_plan::types::BlockFields { start_minute: 10 * 60, duration_minutes: 60, title: "Deep work".into(), color: "blue".into() },
    )
    .await
    .unwrap();
    refresh_calendars(&db, &hub, day(TODAY), false).await.unwrap();
    let put = server.received_requests().await.unwrap().into_iter().find(|r| r.method.as_str() == "PUT").unwrap();
    let body: serde_json::Value = serde_json::from_slice(&put.body).unwrap();
    assert_eq!(body["start"]["dateTime"], "2026-10-22T09:00:00+00:00");
    let published = calendar::Entity::find_by_id(axiom.id.as_str()).one(&db).await.unwrap().unwrap();
    assert!(published.publish && published.problem.is_none());
}

#[tokio::test]
async fn an_expired_sign_in_shows_on_the_account() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    google_basics(&server).await;
    let hub = hub(&server, secrets);
    let account = accounts::connect_oauth(&db, &hub, "google", day(TODAY), browser("code")).await.unwrap();

    // Later, with no cached token: Google says the sign-in was revoked.
    server.reset().await;
    Mock::given(method("POST"))
        .and(path("/google/token"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({ "error": "invalid_grant" })))
        .mount(&server)
        .await;
    let fresh_hub = self::hub(&server, Memory(std::sync::Arc::new(std::sync::Mutex::new(
        [(account.id.clone(), Secret::OAuth { refresh_token: "rt-1".into(), scope: None })].into_iter().collect(),
    ))));
    refresh_calendars(&db, &fresh_hub, day(TODAY), true).await.unwrap();
    let stored = account::Entity::find_by_id(account.id.as_str()).one(&db).await.unwrap().unwrap();
    assert!(stored.problem.as_deref().unwrap().contains("Reconnect"), "{:?}", stored.problem);
    assert!(stored.signed_out, "so the dialog offers to reconnect");
    // The events read before stay until it's fixed.
    assert_eq!(titles(&db, TODAY).await, ["Dentist", "Maybe gym"]);

    // Reconnecting fixes the same account rather than adding a second.
    server.reset().await;
    google_basics(&server).await;
    let again = accounts::connect_oauth(&db, &fresh_hub, "google", day(TODAY), browser("code")).await.unwrap();
    assert_eq!(again.id, account.id);
    assert!(!again.signed_out && again.problem.is_none());
}

#[tokio::test]
async fn being_offline_isnt_a_sign_in_problem() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    google_basics(&server).await;
    let hub = hub(&server, secrets.clone());
    let account = accounts::connect_oauth(&db, &hub, "google", day(TODAY), browser("code")).await.unwrap();

    // Google's servers fail; the sign-in itself is fine.
    server.reset().await;
    Mock::given(method("POST")).and(path("/google/token")).respond_with(ResponseTemplate::new(503)).mount(&server).await;
    refresh_calendars(&db, &self::hub(&server, secrets), day(TODAY), true).await.unwrap();
    let stored = account::Entity::find_by_id(account.id.as_str()).one(&db).await.unwrap().unwrap();
    assert!(stored.problem.is_some());
    assert!(!stored.signed_out, "reconnecting wouldn't help");
}

#[tokio::test]
async fn removing_an_account_removes_everything_from_it() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    google_basics(&server).await;
    Mock::given(method("POST")).and(path("/google/revoke")).respond_with(ResponseTemplate::new(200)).expect(1).mount(&server).await;
    let hub = hub(&server, secrets.clone());
    let account = accounts::connect_oauth(&db, &hub, "google", day(TODAY), browser("code")).await.unwrap();

    accounts::remove_account(&db, &hub, &account.id).await.unwrap();
    assert!(account::Entity::find().all(&db).await.unwrap().is_empty());
    assert!(calendar::Entity::find().all(&db).await.unwrap().is_empty());
    assert!(event::Entity::find().all(&db).await.unwrap().is_empty());
    assert_eq!(secrets.load(&account.id), None);
}

// ---------- Microsoft ----------

#[tokio::test]
async fn microsoft_reads_pages_and_all_day_events_and_keeps_new_sign_ins() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    let base = server.uri();
    Mock::given(method("POST"))
        .and(path("/ms/token"))
        .and(body_string_contains("grant_type=authorization_code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "access_token": "at-1", "expires_in": 3600, "refresh_token": "rt-1" })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/graph/me/calendars"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "value": [
            { "id": "cal-1", "name": "Calendar", "hexColor": "#e74c3c", "canEdit": true, "isDefaultCalendar": true, "owner": { "address": "me@outlook.com" } },
            { "id": "cal-2", "name": "Holidays", "hexColor": "", "canEdit": false, "isDefaultCalendar": false }
        ]})))
        .mount(&server)
        .await;
    // Two pages of events; times in UTC, as asked for.
    Mock::given(method("GET"))
        .and(path("/graph/me/calendars/cal-1/calendarView"))
        .and(header("Prefer", "outlook.timezone=\"UTC\""))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "value": [{ "id": "m1", "subject": "Standup", "isAllDay": false, "showAs": "busy", "isCancelled": false,
                        "start": { "dateTime": "2026-10-22T08:30:00.0000000", "timeZone": "UTC" },
                        "end": { "dateTime": "2026-10-22T08:45:00.0000000", "timeZone": "UTC" } }],
            "@odata.nextLink": format!("{base}/graph/next-page")
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/graph/next-page"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            // An all-day event, shifted into UTC from British Summer Time.
            "value": [{ "id": "m2", "subject": "Leave", "isAllDay": true, "showAs": "oof", "isCancelled": false,
                        "start": { "dateTime": "2026-10-22T23:00:00.0000000", "timeZone": "UTC" },
                        "end": { "dateTime": "2026-10-23T23:00:00.0000000", "timeZone": "UTC" } }]
        })))
        .mount(&server)
        .await;
    let hub = hub(&server, secrets.clone());
    let account = accounts::connect_oauth(&db, &hub, "microsoft", day(TODAY), browser("ms-code")).await.unwrap();
    assert_eq!(account.name, "me@outlook.com");
    let exchange = server.received_requests().await.unwrap().into_iter().find(|r| r.url.path() == "/ms/token").unwrap();
    let form = String::from_utf8(exchange.body).unwrap();
    assert!(form.contains("scope=offline_access") && !form.contains("client_secret"));

    // 08:30 UTC is 09:30 in London.
    let today = service::get_day(&db, day(TODAY), day(TODAY)).await.unwrap().events;
    assert_eq!(today.iter().map(|e| (e.title.as_str(), e.start_minute)).collect::<Vec<_>>(), [("Standup", 9 * 60 + 30)]);
    assert_eq!(titles(&db, 23).await, ["Leave"]);
    let calendars = calendar::Entity::find().all(&db).await.unwrap();
    assert_eq!(calendars.iter().find(|c| c.name == "Calendar").map(|c| c.color.as_str()), Some("red"));

    // Microsoft hands out a new refresh token with each access token; it's kept.
    Mock::given(method("POST"))
        .and(path("/ms/token"))
        .and(body_string_contains("grant_type=refresh_token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "access_token": "at-2", "expires_in": 3600, "refresh_token": "rt-2" })))
        .mount(&server)
        .await;
    let later = self::hub(&server, secrets.clone());
    refresh_calendars(&db, &later, day(TODAY), true).await.unwrap();
    assert_eq!(secrets.load(&account.id), Some(Secret::OAuth { refresh_token: "rt-2".into(), scope: None }));
}

// ---------- CalDAV (iCloud) ----------

fn multistatus(body: &str) -> ResponseTemplate {
    ResponseTemplate::new(207).insert_header("Content-Type", "application/xml; charset=utf-8").set_body_string(body.to_owned())
}

#[tokio::test]
async fn caldav_finds_calendars_reads_events_and_publishes() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    let base = server.uri();
    // Like iCloud: the first address sends you on to the account's own server.
    Mock::given(method("PROPFIND")).and(path("/")).respond_with(ResponseTemplate::new(301).insert_header("Location", "/dav/")).mount(&server).await;
    Mock::given(method("PROPFIND"))
        .and(path("/dav/"))
        .and(header("Depth", "0"))
        .respond_with(multistatus(r#"<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href><d:propstat>
            <d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop>
            <d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#))
        .mount(&server)
        .await;
    Mock::given(method("PROPFIND"))
        .and(path("/123/principal/"))
        .respond_with(multistatus(&format!(r#"<multistatus xmlns="DAV:"><response><href>/123/principal/</href><propstat>
            <prop><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">{base}/123/calendars/</href></calendar-home-set></prop>
            <status>HTTP/1.1 200 OK</status></propstat></response></multistatus>"#)))
        .mount(&server)
        .await;
    Mock::given(method("PROPFIND"))
        .and(path("/123/calendars/"))
        .and(header("Depth", "1"))
        .respond_with(multistatus(r#"<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
            <d:response><d:href>/123/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            <d:response><d:href>/123/calendars/home/</d:href><d:propstat><d:prop>
              <d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Home</d:displayname><a:calendar-color>#34AADCFF</a:calendar-color>
              <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
              <d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>
            </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            <d:response><d:href>/123/calendars/tasks/</d:href><d:propstat><d:prop>
              <d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Reminders</d:displayname>
              <c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
            </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            <d:response><d:href>/123/calendars/holidays/</d:href><d:propstat><d:prop>
              <d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>UK Holidays</d:displayname>
              <d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>
            </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            </d:multistatus>"#))
        .mount(&server)
        .await;
    let events = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:x1\r\nSUMMARY:Pilates\r\nDTSTART;TZID=Europe/London:20261022T073000\r\nDTEND;TZID=Europe/London:20261022T083000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    let ours = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:axiom-old\r\nSUMMARY:Old block\r\nDTSTART:20261023T090000Z\r\nDTEND:20261023T100000Z\r\nX-AXIOM-BLOCK:old\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    Mock::given(method("REPORT"))
        .and(path("/123/calendars/home/"))
        .and(body_string_contains("time-range"))
        .respond_with(multistatus(&format!(
            r#"<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
            <d:response><d:href>/123/calendars/home/x1.ics</d:href><d:propstat><d:prop><d:getetag>"1"</d:getetag><c:calendar-data>{events}</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            <d:response><d:href>/123/calendars/home/axiom-old.ics</d:href><d:propstat><d:prop><d:getetag>"2"</d:getetag><c:calendar-data>{ours}</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            </d:multistatus>"#
        )))
        .mount(&server)
        .await;
    Mock::given(method("PUT")).and(path_regex("^/123/calendars/home/axiom-.+\\.ics$")).and(header("If-None-Match", "*")).respond_with(ResponseTemplate::new(201)).mount(&server).await;
    Mock::given(method("DELETE")).and(path("/123/calendars/home/axiom-old.ics")).respond_with(ResponseTemplate::new(204)).expect(1).mount(&server).await;

    let hub = hub(&server, secrets.clone());
    let account = accounts::connect_caldav(&db, &hub, &format!("{base}/"), "me@icloud.com", "abcd-efgh-ijkl-mnop", day(TODAY)).await.unwrap();
    assert_eq!(account.name, "me@icloud.com");
    let request = server.received_requests().await.unwrap().into_iter().next().unwrap();
    assert!(request.headers.get("authorization").unwrap().to_str().unwrap().starts_with("Basic "));

    let calendars = calendar::Entity::find().all(&db).await.unwrap();
    let names: Vec<(&str, bool, bool)> = calendars.iter().map(|c| (c.name.as_str(), c.shown, c.writable)).collect();
    // The reminders list holds no events; read-only holidays start hidden.
    assert_eq!(names, [("Home", true, true), ("UK Holidays", false, false)]);
    assert_eq!(calendars[0].color, "blue");
    // Pilates shows; Axiom's own block in the calendar doesn't.
    assert_eq!(titles(&db, TODAY).await, ["Pilates"]);

    // Publish: the plan's block is put in; the old one no longer planned goes.
    let block = service::create_block(&db, day(TODAY), 15 * 60, 30, "Review", None).await.unwrap();
    accounts::set_publish(&db, &hub, Some(&calendars[0].id), day(TODAY)).await.unwrap();
    let put = server.received_requests().await.unwrap().into_iter().find(|r| r.method.as_str() == "PUT").unwrap();
    assert!(put.url.path().ends_with(&format!("axiom-{}.ics", block.id)));
    let text = String::from_utf8(put.body).unwrap();
    assert!(text.contains("SUMMARY:Review") && text.contains("DTSTART:20261022T140000Z") && text.contains(&format!("X-AXIOM-BLOCK:{}", block.id)));
}

#[tokio::test]
async fn caldav_reports_a_wrong_password_plainly() {
    let (db, server) = (setup().await, MockServer::start().await);
    Mock::given(method("PROPFIND")).respond_with(ResponseTemplate::new(401)).mount(&server).await;
    let hub = hub(&server, Memory::default());
    let error = accounts::connect_caldav(&db, &hub, &format!("{}/", server.uri()), "me@icloud.com", "wrong", day(TODAY)).await.unwrap_err();
    assert!(error.to_string().contains("app-specific password"), "{error}");
    assert!(account::Entity::find().all(&db).await.unwrap().is_empty());
}

// ---------- Changing events ----------

async fn event_titled(db: &DatabaseConnection, title: &str) -> event::Model {
    event::Entity::find().filter(event::Column::Title.eq(title)).one(db).await.unwrap().unwrap()
}

fn at_three(title: Option<&str>) -> accounts::EventEdit {
    accounts::EventEdit {
        title: title.map(str::to_owned),
        location: None,
        description: None,
        when: Some(accounts::EventWhen { day: day(TODAY), start_minute: 15 * 60, end_minute: 15 * 60 + 45 }),
    }
}

#[tokio::test]
async fn google_events_keep_their_details_and_can_be_changed() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    google_basics(&server).await;
    let hub = hub(&server, secrets);
    accounts::connect_oauth(&db, &hub, "google", day(TODAY), browser("code")).await.unwrap();

    let dentist = event_titled(&db, "Dentist").await;
    assert_eq!(dentist.location, "High Street Dental");
    assert_eq!(dentist.description, "Bring the form");
    assert_eq!(dentist.link.as_deref(), Some("https://calendar.google.com/event?eid=e1"));
    assert_eq!(dentist.start_at, Some(utc("2026-10-22T13:00:00Z")));
    assert!(dentist.editable && !dentist.recurring);
    let gym = event_titled(&db, "Maybe gym").await;
    // One occurrence of a repeat can still be changed in Google.
    assert!(gym.recurring && gym.editable);

    Mock::given(method("PATCH"))
        .and(path("/calendar/v3/calendars/me@gmail.com/events/e1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({})))
        .expect(1)
        .mount(&server)
        .await;
    // Afterwards Google has it at the new time (and takes priority over the earlier list).
    Mock::given(method("GET"))
        .and(path("/calendar/v3/calendars/me@gmail.com/events"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "items": [
            { "id": "e1", "status": "confirmed", "summary": "Dentist (moved)",
              "start": { "dateTime": "2026-10-22T15:00:00+01:00" }, "end": { "dateTime": "2026-10-22T15:45:00+01:00" } }
        ]})))
        .with_priority(1)
        .mount(&server)
        .await;
    accounts::update_event(&db, &hub, &dentist.id, at_three(Some("Dentist (moved)")), day(TODAY)).await.unwrap();
    let patch = server.received_requests().await.unwrap().into_iter().find(|r| r.method.as_str() == "PATCH").unwrap();
    let body: serde_json::Value = serde_json::from_slice(&patch.body).unwrap();
    // 3pm in London is 2pm UTC; untouched fields aren't sent.
    assert_eq!(body["summary"], "Dentist (moved)");
    assert_eq!(body["start"]["dateTime"], "2026-10-22T14:00:00+00:00");
    assert_eq!(body["end"]["dateTime"], "2026-10-22T14:45:00+00:00");
    assert!(body.get("location").is_none() && body.get("description").is_none());
    // Read again at its new time, the event keeps its id, so it stays open in the panel.
    let moved = event_titled(&db, "Dentist (moved)").await;
    assert_eq!((moved.id.as_str(), moved.start_minute), (dentist.id.as_str(), 15 * 60));

    let mut nameless = at_three(Some("  "));
    nameless.when = None;
    assert!(accounts::update_event(&db, &hub, &dentist.id, nameless, day(TODAY)).await.is_err());
}

#[tokio::test]
async fn google_accounts_connected_without_edit_permission_stay_read_only() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    // Mounted first, so it answers instead of the one in google_basics.
    Mock::given(method("POST"))
        .and(path("/google/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            json!({ "access_token": "at-1", "expires_in": 3600, "refresh_token": "rt-1", "scope": "https://www.googleapis.com/auth/calendar.events.readonly" }),
        ))
        .mount(&server)
        .await;
    google_basics(&server).await;
    let hub = hub(&server, secrets);
    accounts::connect_oauth(&db, &hub, "google", day(TODAY), browser("code")).await.unwrap();

    let dentist = event_titled(&db, "Dentist").await;
    assert!(!dentist.editable);
    let refused = accounts::update_event(&db, &hub, &dentist.id, at_three(None), day(TODAY)).await.unwrap_err();
    assert!(refused.to_string().contains("can't change"), "{refused}");
}

#[tokio::test]
async fn microsoft_sends_only_what_changed() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    Mock::given(method("POST"))
        .and(path("/ms/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "access_token": "at-1", "expires_in": 3600, "refresh_token": "rt-1" })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/graph/me/calendars"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "value": [
            { "id": "cal-1", "name": "Calendar", "canEdit": true, "isDefaultCalendar": true, "owner": { "address": "me@outlook.com" } }
        ]})))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/graph/me/calendars/cal-1/calendarView"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "value": [{
            "id": "m1", "subject": "Standup", "isAllDay": false, "showAs": "busy", "isCancelled": false, "type": "occurrence",
            "location": { "displayName": "Room 4" }, "bodyPreview": "Agenda in the doc", "webLink": "https://outlook.live.com/m1",
            "start": { "dateTime": "2026-10-22T08:30:00.0000000", "timeZone": "UTC" },
            "end": { "dateTime": "2026-10-22T08:45:00.0000000", "timeZone": "UTC" } }] })))
        .mount(&server)
        .await;
    Mock::given(method("PATCH")).and(path("/graph/me/events/m1")).respond_with(ResponseTemplate::new(200).set_body_json(json!({}))).expect(1).mount(&server).await;
    let hub = hub(&server, secrets);
    accounts::connect_oauth(&db, &hub, "microsoft", day(TODAY), browser("code")).await.unwrap();

    let standup = event_titled(&db, "Standup").await;
    assert_eq!((standup.location.as_str(), standup.description.as_str()), ("Room 4", "Agenda in the doc"));
    assert!(standup.recurring && standup.editable);
    let edit = accounts::EventEdit { title: None, location: Some("Room 5".into()), description: None, when: None };
    accounts::update_event(&db, &hub, &standup.id, edit, day(TODAY)).await.unwrap();
    let patch = server.received_requests().await.unwrap().into_iter().find(|r| r.method.as_str() == "PATCH").unwrap();
    let body: serde_json::Value = serde_json::from_slice(&patch.body).unwrap();
    // Notes untouched: Axiom only had a preview of them, so it mustn't send them back.
    assert_eq!(body, json!({ "location": { "displayName": "Room 5" } }));
}

#[tokio::test]
async fn caldav_edits_whole_events_only_if_unchanged_meanwhile() {
    let (db, server, secrets) = (setup().await, MockServer::start().await, Memory::default());
    let base = server.uri();
    Mock::given(method("PROPFIND"))
        .and(path("/"))
        .respond_with(multistatus(r#"<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/p/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#))
        .mount(&server)
        .await;
    Mock::given(method("PROPFIND"))
        .and(path("/p/"))
        .respond_with(multistatus(r#"<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/p/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/cals/</d:href></c:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#))
        .mount(&server)
        .await;
    Mock::given(method("PROPFIND"))
        .and(path("/cals/"))
        .respond_with(multistatus(r#"<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cals/home/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Home</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#))
        .mount(&server)
        .await;
    let single = "BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:s1
SUMMARY:Haircut
LOCATION:Old Town
DTSTART:20261022T100000Z
DTEND:20261022T103000Z
BEGIN:VALARM
TRIGGER:-PT10M
ACTION:DISPLAY
END:VALARM
END:VEVENT
END:VCALENDAR
";
    let weekly = "BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:w1
SUMMARY:Choir
DTSTART:20261001T180000Z
DTEND:20261001T190000Z
RRULE:FREQ=WEEKLY
END:VEVENT
END:VCALENDAR
";
    Mock::given(method("REPORT"))
        .and(path("/cals/home/"))
        .respond_with(multistatus(&format!(
            r#"<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
            <d:response><d:href>/cals/home/s1.ics</d:href><d:propstat><d:prop><c:calendar-data>{single}</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            <d:response><d:href>/cals/home/w1.ics</d:href><d:propstat><d:prop><c:calendar-data>{weekly}</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
            </d:multistatus>"#
        )))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/cals/home/s1.ics"))
        .respond_with(ResponseTemplate::new(200).insert_header("ETag", "\"7\"").set_body_string(single))
        .mount(&server)
        .await;
    Mock::given(method("PUT")).and(path("/cals/home/s1.ics")).and(header("If-Match", "\"7\"")).respond_with(ResponseTemplate::new(204)).expect(1).mount(&server).await;

    let hub = hub(&server, secrets);
    accounts::connect_caldav(&db, &hub, &format!("{base}/"), "me@icloud.com", "pass", day(TODAY)).await.unwrap();
    let haircut = event_titled(&db, "Haircut").await;
    assert!(haircut.editable && haircut.location == "Old Town");
    let choir = event_titled(&db, "Choir").await;
    // A repeat is one object in CalDAV: changing one occurrence isn't possible here.
    assert!(choir.recurring && !choir.editable);

    let edit = accounts::EventEdit { title: Some("Haircut, Ali's".into()), location: Some("New Town".into()), description: None, when: None };
    accounts::update_event(&db, &hub, &haircut.id, edit, day(TODAY)).await.unwrap();
    let put = server.received_requests().await.unwrap().into_iter().find(|r| r.method.as_str() == "PUT").unwrap();
    let text = String::from_utf8(put.body).unwrap();
    assert!(text.contains("SUMMARY:Haircut\\, Ali's") && text.contains("LOCATION:New Town") && text.contains("SEQUENCE:1"), "{text}");
    assert!(!text.contains("Old Town") && text.contains("BEGIN:VALARM") && text.contains("DTSTART:20261022T100000Z"));
}
