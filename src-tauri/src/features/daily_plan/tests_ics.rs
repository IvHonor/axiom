//! Tests for reading calendar feeds. The user is in London: British clocks
//! go back on 25 October 2026, American ones on 1 November.

use chrono::NaiveDate;
use rrule::Tz;

use super::ics::{day_events, DayEvent};

const LONDON: Tz = Tz::Tz(chrono_tz::Europe::London);

fn d(month: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, month, day).unwrap()
}

fn calendar(events: &str) -> String {
    format!("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n{events}END:VCALENDAR\r\n")
}

fn read(events: &str, from: NaiveDate, to: NaiveDate) -> Vec<DayEvent> {
    day_events(&calendar(events), from, to, LONDON).unwrap()
}

/// (day, start "HH:MM", minutes, title) for compact checks.
fn shape(events: &[DayEvent]) -> Vec<(NaiveDate, String, i32, String)> {
    events
        .iter()
        .map(|e| (e.day, format!("{:02}:{:02}", e.start_minute / 60, e.start_minute % 60), e.duration_minutes, e.title.clone()))
        .collect()
}

#[test]
fn utc_times_show_in_local_time() {
    let found = read(
        "BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Stand-up\r\nDTSTART:20261022T140000Z\r\nDTEND:20261022T141500Z\r\nEND:VEVENT\r\n",
        d(10, 19),
        d(10, 25),
    );
    assert_eq!(shape(&found), [(d(10, 22), "15:00".into(), 15, "Stand-up".into())]);
    assert!(found[0].busy && !found[0].all_day);
}

#[test]
fn repeats_follow_their_own_zone_across_clock_changes() {
    let events = "BEGIN:VEVENT\r\n\
        UID:weekly\r\n\
        SUMMARY:Sync with NY\r\n\
        DTSTART;TZID=America/New_York:20261006T090000\r\n\
        DTEND;TZID=America/New_York:20261006T093000\r\n\
        RRULE:FREQ=WEEKLY;BYDAY=TU\r\n\
        EXDATE;TZID=America/New_York:20261027T090000\r\n\
        END:VEVENT\r\n\
        BEGIN:VEVENT\r\n\
        UID:weekly\r\n\
        RECURRENCE-ID;TZID=America/New_York:20261103T090000\r\n\
        SUMMARY:Sync with NY (moved)\r\n\
        DTSTART;TZID=America/New_York:20261103T100000\r\n\
        DTEND;TZID=America/New_York:20261103T103000\r\n\
        END:VEVENT\r\n";
    let found = read(events, d(10, 19), d(11, 15));
    assert_eq!(
        shape(&found),
        [
            // 9am in New York is 2pm in London while both are on summer time...
            (d(10, 20), "14:00".into(), 30, "Sync with NY".into()),
            // ...the 27th is skipped (EXDATE)...
            // ...the 3rd was moved to 10am New York, 3pm London...
            (d(11, 3), "15:00".into(), 30, "Sync with NY (moved)".into()),
            // ...and once both are on winter time it's 2pm again.
            (d(11, 10), "14:00".into(), 30, "Sync with NY".into()),
        ]
    );
}

#[test]
fn all_day_events_cover_their_days_without_blocking_time() {
    let found = read(
        "BEGIN:VEVENT\r\nUID:trip\r\nSUMMARY:Conference\r\nDTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261024\r\nEND:VEVENT\r\n",
        d(10, 19),
        d(10, 25),
    );
    assert_eq!(found.iter().map(|e| e.day).collect::<Vec<_>>(), [d(10, 22), d(10, 23)]);
    assert!(found.iter().all(|e| e.all_day && !e.busy));
}

#[test]
fn weekly_all_day_events_stop_at_their_end_date() {
    let found = read(
        "BEGIN:VEVENT\r\nUID:bins\r\nSUMMARY:Bin day\r\nDTSTART;VALUE=DATE:20261005\r\nRRULE:FREQ=WEEKLY;UNTIL=20261026\r\nEND:VEVENT\r\n",
        d(10, 1),
        d(11, 30),
    );
    assert_eq!(found.iter().map(|e| e.day).collect::<Vec<_>>(), [d(10, 5), d(10, 12), d(10, 19), d(10, 26)]);
}

#[test]
fn outlook_zones_folded_lines_alarms_and_cancellations() {
    let events = "BEGIN:VEVENT\r\n\
        UID:outlook\r\n\
        SUMMARY:Budget review\\, Q4\r\n  planning\r\n\
        DTSTART;TZID=\"Pacific Standard Time\":20261021T080000\r\n\
        DURATION:PT1H30M\r\n\
        BEGIN:VALARM\r\n\
        SUMMARY:Not the title\r\n\
        TRIGGER:-PT15M\r\n\
        END:VALARM\r\n\
        END:VEVENT\r\n\
        BEGIN:VEVENT\r\n\
        UID:off\r\n\
        SUMMARY:Called off\r\n\
        STATUS:CANCELLED\r\n\
        DTSTART:20261021T100000Z\r\n\
        END:VEVENT\r\n";
    let found = read(events, d(10, 19), d(10, 25));
    // 8am in Seattle is 4pm in London.
    assert_eq!(shape(&found), [(d(10, 21), "16:00".into(), 90, "Budget review, Q4 planning".into())]);
}

#[test]
fn late_events_split_at_midnight_and_free_time_is_not_busy() {
    let events = "BEGIN:VEVENT\r\nUID:late\r\nSUMMARY:Night shift\r\nDTSTART:20261022T230000\r\nDTEND:20261023T010000\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\n";
    let found = read(events, d(10, 19), d(10, 25));
    assert_eq!(
        shape(&found),
        [(d(10, 22), "23:00".into(), 60, "Night shift".into()), (d(10, 23), "00:00".into(), 60, "Night shift".into())]
    );
    assert!(found.iter().all(|e| !e.busy));
}

#[test]
fn a_web_page_is_not_a_calendar() {
    assert!(day_events("<html>Sign in</html>", d(10, 1), d(10, 2), LONDON).is_err());
}
