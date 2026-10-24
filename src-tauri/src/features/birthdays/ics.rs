//! Writes everyone as a calendar file (.ics) that Google Calendar, Outlook
//! and Apple Calendar import: one all-day event each, every year.

use chrono::{Datelike, Utc};
use sea_orm::prelude::Date;

use super::entities::person;

/// Commas, semicolons and backslashes are escaped in text values.
fn text(value: &str) -> String {
    value.replace('\\', "\\\\").replace(';', "\\;").replace(',', "\\,").replace('\n', "\\n")
}

/// Lines longer than 75 bytes are folded, as the format asks.
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

pub fn write(people: &[person::Model], today: Date) -> String {
    let stamp = Utc::now().format("%Y%m%dT%H%M%SZ");
    let mut lines = vec!["BEGIN:VCALENDAR".to_owned(), "VERSION:2.0".into(), "PRODID:-//Axiom//Birthdays//EN".into(), "CALSCALE:GREGORIAN".into(), "X-WR-CALNAME:Birthdays".into()];
    for p in people {
        // Start in the year it began when that's known, so calendars count
        // the years; otherwise this year.
        let start_year = p.year.unwrap_or(today.year());
        let start = super::service::in_year(p.month, p.day, start_year);
        let end = start.succ_opt().unwrap_or(start);
        let rule = if p.month == 2 && p.day == 29 { "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" } else { "RRULE:FREQ=YEARLY" };
        let summary = if p.occasion == "anniversary" { format!("💍 {} anniversary", p.name) } else { format!("🎂 {}'s birthday", p.name) };
        lines.extend([
            "BEGIN:VEVENT".to_owned(),
            format!("UID:{}@axiom", p.id),
            format!("DTSTAMP:{stamp}"),
            format!("DTSTART;VALUE=DATE:{}", start.format("%Y%m%d")),
            format!("DTEND;VALUE=DATE:{}", end.format("%Y%m%d")),
            rule.into(),
            format!("SUMMARY:{}", text(&summary)),
            "TRANSP:TRANSPARENT".into(),
            "END:VEVENT".into(),
        ]);
    }
    lines.push("END:VCALENDAR".into());
    lines.iter().map(|l| fold(l)).collect::<Vec<_>>().join("\r\n") + "\r\n"
}
