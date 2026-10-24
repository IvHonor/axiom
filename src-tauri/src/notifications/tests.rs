//! Tests for notifications against a throwaway in-memory database.

use axiom_protocol::notify::{Digest, Unsubscribed};
use chrono::{NaiveDate, NaiveDateTime, TimeZone, Utc};
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::runner::{Off, come_due, plan, reconcile, sends};
use super::settings;
use crate::features::daily_plan::service as plan_service;
use crate::features::uni::service as uni;
use crate::features::uni::types::{ModuleFields, Schedule, TermFields};

async fn setup() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn day(d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, d).unwrap()
}

fn at(d: u32, hour: u32, minute: u32) -> NaiveDateTime {
    day(d).and_hms_opt(hour, minute, 0).unwrap()
}

fn london() -> rrule::Tz {
    rrule::Tz::Tz(chrono_tz::Europe::London)
}

/// An autumn term from Monday 21 September with lectures every Tuesday and
/// Thursday. Tuesday 27 October is week 6.
async fn lectures(db: &DatabaseConnection) {
    let term = uni::add_term(db, TermFields { name: "Autumn".into(), starts_on: day(21) - chrono::Days::new(30), weeks: 11 }, day(27)).await.unwrap();
    let fields = ModuleFields { term_id: term.term.id, code: "COMP1001".into(), name: "Algorithms".into(), color: "blue".into(), credits: None, link: None };
    let module = uni::add_module(db, fields, day(27)).await.unwrap();
    let schedule = Schedule { kind: "lecture".into(), title: String::new(), weekdays: vec![1, 3], from_week: 1, to_week: 11, skip_weeks: vec![], recorded: true };
    uni::add_schedule(db, &module.module.id, schedule).await.unwrap();
}

#[tokio::test]
async fn notifications_start_in_the_app_and_on_the_desktop_but_not_by_email() {
    let db = setup().await;
    let all = settings::all(&db).await.unwrap();
    assert_eq!(all.len(), super::kinds::KINDS.len());
    assert!(all.iter().all(|c| c.in_app && c.desktop && !c.email));

    let changed = settings::set(&db, "uni.today", "email", true).await.unwrap();
    assert!(changed.email && changed.in_app, "only that channel changes");
    assert!(settings::set(&db, "reading.streak", "email", true).await.is_err(), "streaks aren't emailed");
    assert!(settings::set(&db, "nope", "email", true).await.is_err());
}

#[tokio::test]
async fn a_notification_comes_once_on_the_day_from_its_time() {
    let db = setup().await;
    lectures(&db).await;
    // Only University has anything to say; everything else stays quiet.
    assert!(come_due(&db, at(27, 6, 59), &Off::new()).await.unwrap().is_empty(), "not before 7");
    let fresh = come_due(&db, at(27, 7, 5), &Off::new()).await.unwrap();
    assert_eq!(fresh.len(), 1);
    assert_eq!(fresh[0].note.id, "uni.today:2026-10-27");
    assert_eq!(fresh[0].note.title, "1 lecture today");
    assert!(fresh[0].desktop && fresh[0].note.in_app);
    assert!(come_due(&db, at(27, 7, 6), &Off::new()).await.unwrap().is_empty(), "once a day");

    // Thursday: too late (the computer was off all morning) and it's skipped.
    assert!(come_due(&db, at(29, 13, 1), &Off::new()).await.unwrap().is_empty());

    // Switched off everywhere but email, it doesn't show.
    settings::set(&db, "uni.today", "in_app", false).await.unwrap();
    settings::set(&db, "uni.today", "desktop", false).await.unwrap();
    let tuesday = NaiveDate::from_ymd_opt(2026, 11, 3).unwrap().and_hms_opt(7, 0, 0).unwrap();
    assert!(come_due(&db, tuesday, &Off::new()).await.unwrap().is_empty());
}

#[tokio::test]
async fn emails_are_planned_for_the_week_ahead_in_local_time() {
    let db = setup().await;
    lectures(&db).await;
    assert!(plan(&db, at(26, 10, 0), london(), &Off::new()).await.unwrap().is_empty(), "email's off to start with");

    settings::set(&db, "uni.today", "email", true).await.unwrap();
    let planned = plan(&db, at(27, 10, 0), london(), &Off::new()).await.unwrap();
    // Today's 7am has gone, and next Tuesday is more than a week away: Thursday's is all.
    let keys: Vec<&str> = planned.iter().map(|p| p.key.as_str()).collect();
    assert_eq!(keys, ["uni.today:2026-10-29"]);
    // 7am in London: summer time ends on 25 October, so it's 7am UTC.
    assert_eq!(planned[0].send_at, Utc.with_ymd_and_hms(2026, 10, 29, 7, 0, 0).unwrap());
    assert!(matches!(&planned[0].digest, Digest::UniToday { lectures, .. } if lectures[0].module == "COMP1001 Algorithms"));
}

#[tokio::test]
async fn deadlines_list_what_is_overdue_due_today_and_tomorrow() {
    let db = setup().await;
    let late = plan_service::create_task(&db, "Send the report", None, None).await.unwrap();
    plan_service::set_due(&db, &late.id, Some(day(25))).await.unwrap();
    let later = plan_service::create_task(&db, "Book flights", None, None).await.unwrap();
    plan_service::set_due(&db, &later.id, Some(day(30))).await.unwrap();

    let digest = super::digests::digest(&db, "daily_plan.deadlines", day(27), false).await.unwrap().unwrap();
    assert_eq!(digest.headline().0, "1 task: 1 overdue", "not the one due on the 30th");
}

#[tokio::test]
async fn unsubscribing_by_link_switches_email_off_unless_switched_on_since() {
    let db = setup().await;
    settings::set(&db, "uni.weekly", "email", true).await.unwrap();
    let later = Utc::now() + chrono::Duration::minutes(1);
    let (resubscribe, off) = reconcile(&db, &[Unsubscribed { kind: "uni.weekly".into(), at: later }]).await.unwrap();
    assert!(resubscribe.is_empty() && off);
    assert!(!settings::all(&db).await.unwrap().iter().find(|c| c.kind == "uni.weekly").unwrap().email);

    // Switched back on after the link was clicked: the server is told.
    let earlier = Utc::now() - chrono::Duration::minutes(1);
    settings::set(&db, "uni.weekly", "email", true).await.unwrap();
    let (resubscribe, off) = reconcile(&db, &[Unsubscribed { kind: "uni.weekly".into(), at: earlier }]).await.unwrap();
    assert_eq!((resubscribe, off), (vec!["uni.weekly".to_owned()], false));
}

#[tokio::test]
async fn a_switched_off_extension_sends_nothing_anywhere() {
    let db = setup().await;
    lectures(&db).await;
    settings::set(&db, "uni.today", "email", true).await.unwrap();
    let off: Off = ["uni".to_owned()].into();

    assert!(come_due(&db, at(27, 7, 5), &off).await.unwrap().is_empty(), "not in the app or on the desktop");
    assert!(plan(&db, at(27, 10, 0), london(), &off).await.unwrap().is_empty(), "and no emails");
    assert!(!sends("uni.today", &off) && sends("journal.reminder", &off));

    // Switched back on, it picks up where it was: today's still to come.
    assert_eq!(come_due(&db, at(27, 7, 5), &Off::new()).await.unwrap().len(), 1);
    assert_eq!(plan(&db, at(27, 10, 0), london(), &Off::new()).await.unwrap().len(), 1);
}
