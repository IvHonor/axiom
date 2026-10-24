//! Tests for Birthdays against a throwaway in-memory database.

use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::service::*;
use super::types::{GiftFields, PersonFields};

async fn setup() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn day(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

fn today() -> NaiveDate {
    day(2026, 10, 24)
}

fn someone(name: &str, month: i16, d: i16, year: Option<i32>, remind_days: i32) -> PersonFields {
    PersonFields { name: name.into(), occasion: "birthday".into(), month, day: d, year, relation: "friend".into(), notes: String::new(), remind_days }
}

fn gift(idea: &str, status: &str) -> GiftFields {
    GiftFields { idea: idea.into(), url: String::new(), status: status.into() }
}

#[tokio::test]
async fn everyone_comes_soonest_first_with_their_age() {
    let db = setup().await;
    create(&db, someone("Sam", 10, 31, Some(1996), 7), today()).await.unwrap();
    create(&db, someone("Today", 10, 24, Some(2000), 0), today()).await.unwrap();
    // Already been this year: next year, and already that age.
    create(&db, someone("Jan", 1, 5, Some(1990), 7), today()).await.unwrap();
    create(&db, someone("No year", 12, 1, None, 7), today()).await.unwrap();

    let all = list(&db, today()).await.unwrap();
    let names: Vec<&str> = all.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(names, ["Today", "Sam", "No year", "Jan"]);
    assert_eq!((all[0].days, all[0].age, all[0].turning), (0, Some(26), Some(26)), "turns 26 today");
    assert_eq!((all[1].days, all[1].age, all[1].turning), (7, Some(29), Some(30)));
    assert_eq!((all[3].next, all[3].age, all[3].turning), (day(2027, 1, 5), Some(36), Some(37)));
    assert_eq!((all[2].age, all[2].turning), (None, None));
}

#[tokio::test]
async fn the_29th_of_february_falls_on_the_28th_in_other_years() {
    let db = setup().await;
    let leap = create(&db, someone("Leap", 2, 29, Some(2000), 0), today()).await.unwrap();
    assert_eq!(leap.next, day(2027, 2, 28));
    assert_eq!(next_from(2, 29, day(2027, 12, 1)), day(2028, 2, 29));
    assert!(create(&db, someone("Wrong", 2, 29, Some(2001), 0), today()).await.is_err(), "2001 had none");
    assert!(create(&db, someone("Wrong", 4, 31, None, 0), today()).await.is_err());
    assert!(create(&db, someone("Later", 1, 1, Some(2030), 0), today()).await.is_err(), "not born yet");
    assert!(create(&db, someone("  ", 1, 1, None, 0), today()).await.is_err());
    assert!(create(&db, someone("Odd", 1, 1, None, 5), today()).await.is_err(), "reminders come 0, 1, 2, 3, 7, 14 or 30 days ahead");
}

#[tokio::test]
async fn reminders_come_on_the_day_and_when_asked_ahead() {
    let db = setup().await;
    create(&db, someone("Today", 10, 24, None, 7), today()).await.unwrap();
    create(&db, someone("In a week", 10, 31, None, 7), today()).await.unwrap();
    create(&db, someone("In a week, but only on the day", 10, 31, None, 0), today()).await.unwrap();
    create(&db, someone("In three days", 10, 27, None, 7), today()).await.unwrap();
    let (on, ahead) = due(&db, today()).await.unwrap();
    assert_eq!(on.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["Today"]);
    assert_eq!(ahead.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["In a week"]);

    let digest = crate::notifications::digests::digest(&db, "birthdays.upcoming", today(), false).await.unwrap().unwrap();
    assert_eq!(digest.headline().0, "🎂 It's Today's birthday today");
    let quiet = crate::notifications::digests::digest(&db, "birthdays.upcoming", day(2026, 10, 25), false).await.unwrap();
    assert!(quiet.is_none(), "nothing to say");
}

#[tokio::test]
async fn gifts_go_from_idea_to_given() {
    let db = setup().await;
    let p = create(&db, someone("Sam", 10, 31, None, 7), today()).await.unwrap();
    let book = add_gift(&db, &p.id, gift("The new Sally Rooney", "idea"), today()).await.unwrap();
    add_gift(&db, &p.id, gift("Concert tickets", "bought"), today()).await.unwrap();
    assert!(add_gift(&db, &p.id, GiftFields { url: "javascript:alert(1)".into(), ..gift("Bad", "idea") }, today()).await.is_err());
    assert_eq!(get(&db, &p.id, today()).await.unwrap().person.ideas, 2);

    let given = update_gift(&db, &book.id, gift("The new Sally Rooney", "given"), today()).await.unwrap();
    assert_eq!(given.year, Some(2026), "the year it was given");
    let detail = get(&db, &p.id, today()).await.unwrap();
    assert_eq!(detail.person.ideas, 1);
    assert_eq!(detail.gifts.iter().map(|g| g.status.as_str()).collect::<Vec<_>>(), ["bought", "given"]);
    assert_eq!(update_gift(&db, &book.id, gift("The new Sally Rooney", "idea"), today()).await.unwrap().year, None);

    delete(&db, &p.id).await.unwrap();
    assert!(list(&db, today()).await.unwrap().is_empty());
    assert!(get(&db, &p.id, today()).await.is_err());
}

#[tokio::test]
async fn contacts_come_in_once_and_go_out_as_a_calendar() {
    let db = setup().await;
    let vcf = "BEGIN:VCARD\nFN:Ada Lovelace\nBDAY:1815-12-10\nEND:VCARD\nBEGIN:VCARD\nFN:Leap Day\nBDAY:--02-29\nEND:VCARD\nBEGIN:VCARD\nFN:Nobody\nEND:VCARD\n";
    let first = import_vcard(&db, vcf, today()).await.unwrap();
    assert_eq!((first.added, first.already, first.without_date), (2, 0, 1));
    let again = import_vcard(&db, vcf, today()).await.unwrap();
    assert_eq!((again.added, again.already), (0, 2), "not twice");
    let ada = list(&db, today()).await.unwrap().into_iter().find(|p| p.name == "Ada Lovelace").unwrap();
    assert_eq!(ada.year, None, "1815 is before 1900: kept without the year");

    let ics = calendar(&db, today()).await.unwrap();
    assert!(ics.starts_with("BEGIN:VCALENDAR\r\n") && ics.ends_with("END:VCALENDAR\r\n"));
    assert!(ics.contains("SUMMARY:🎂 Ada Lovelace's birthday"));
    assert!(ics.contains("DTSTART;VALUE=DATE:20261210"));
    assert!(ics.contains("RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1"), "29 February: the last day of February");
}
