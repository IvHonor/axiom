//! Reading calendar feeds (.ics, RFC 5545), just enough to show events as
//! busy time on the planner: titles and times, repeats, exceptions and
//! moved occurrences. Recurrence rules are expanded by the `rrule` crate;
//! the rest is a small line parser.

use std::collections::HashSet;

use chrono::{DateTime, Days, Duration, NaiveDate, NaiveDateTime, TimeZone, Timelike};
use rrule::{RRule, RRuleSet, Tz, Unvalidated};

/// One event's share of one day, in the user's own time.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DayEvent {
    /// The provider's id for the event (an occurrence, for repeats), or the iCalendar UID.
    pub uid: String,
    pub title: String,
    pub day: NaiveDate,
    pub start_minute: i32,
    pub duration_minutes: i32,
    pub all_day: bool,
    /// False for events marked as free time (TRANSP:TRANSPARENT).
    pub busy: bool,
    /// When the whole event starts and ends, across days.
    pub start_at: DateTime<chrono::Utc>,
    pub end_at: DateTime<chrono::Utc>,
    pub details: Details,
    /// Whether Axiom may change it (set by the account sync).
    pub editable: bool,
}

/// What an event says beyond its time.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Details {
    pub location: String,
    pub description: String,
    /// The event in the provider's own app or site.
    pub link: Option<String>,
    /// One of a repeating series.
    pub recurring: bool,
}

/// Most occurrences one event can produce in the window.
const MAX_OCCURRENCES: u16 = 2000;

/// Every event between `from` and `to` (both included), cut into days in
/// `zone` (the user's time zone).
pub fn day_events(text: &str, from: NaiveDate, to: NaiveDate, zone: Tz) -> Result<Vec<DayEvent>, String> {
    let lines: Vec<Line> = unfold(text).iter().filter_map(|l| parse_line(l)).collect();
    if !lines.iter().any(|l| l.name == "BEGIN" && l.value.eq_ignore_ascii_case("VCALENDAR")) {
        return Err("That link didn't return a calendar. Check it's the iCal (.ics) address.".into());
    }
    // Blocks Axiom published from the plan are the plan, not meetings.
    let events: Vec<Event> = collect_events(&lines, zone).into_iter().filter(|e| e.axiom_block.is_none()).collect();

    // Occurrences moved or edited on their own (RECURRENCE-ID) replace the
    // originals they name.
    let replaced: HashSet<(String, i64)> = events
        .iter()
        .filter_map(|e| Some((e.uid.clone(), e.recurrence_id?.timestamp())))
        .collect();

    let window_start = midnight(from, zone);
    let window_end = midnight(to + Days::new(1), zone);
    let mut out = Vec::new();
    for event in events.iter().filter(|e| !e.cancelled) {
        let Some(start) = event.start else { continue };
        let length = event.length();
        let starts = if event.recurrence_id.is_none() && (!event.rrules.is_empty() || !event.rdates.is_empty()) {
            event
                .expand(start, window_start - length, window_end)
                .into_iter()
                .filter(|s| !replaced.contains(&(event.uid.clone(), s.timestamp())))
                .collect()
        } else {
            vec![start]
        };
        let details = Details {
            location: event.location.clone(),
            description: event.description.clone(),
            link: event.url.clone(),
            recurring: !event.rrules.is_empty() || !event.rdates.is_empty() || event.recurrence_id.is_some(),
        };
        let what = Occurrence {
            uid: &event.uid,
            title: &event.title,
            all_day: event.all_day,
            busy: !event.transparent && !event.all_day,
            details: &details,
        };
        for s in starts {
            split_into_days(&what, s, length, zone, from, to, &mut out);
        }
    }
    out.sort_by(|a, b| (a.day, !a.all_day, a.start_minute).cmp(&(b.day, !b.all_day, b.start_minute)));
    Ok(out)
}

/// What an occurrence is, apart from when.
pub struct Occurrence<'a> {
    pub uid: &'a str,
    pub title: &'a str,
    pub all_day: bool,
    pub busy: bool,
    pub details: &'a Details,
}

/// Cuts one occurrence into a piece per day it touches, within the window.
/// Shared by every calendar source.
pub fn split_into_days(
    event: &Occurrence,
    start: DateTime<Tz>,
    length: Duration,
    zone: Tz,
    from: NaiveDate,
    to: NaiveDate,
    out: &mut Vec<DayEvent>,
) {
    let (start_at, end_at) = (start.with_timezone(&chrono::Utc), (start + length).with_timezone(&chrono::Utc));
    let piece = |day: NaiveDate, start_minute: i32, duration_minutes: i32| DayEvent {
        uid: event.uid.to_owned(),
        title: event.title.to_owned(),
        day,
        start_minute,
        duration_minutes,
        all_day: event.all_day,
        busy: event.busy,
        start_at,
        end_at,
        details: event.details.clone(),
        editable: false,
    };
    let local = start.with_timezone(&zone).naive_local();
    if event.all_day {
        let days = length.num_days().max(1);
        for i in 0..days {
            let day = local.date() + Days::new(i as u64);
            if day >= from && day <= to {
                out.push(piece(day, 0, 24 * 60));
            }
        }
        return;
    }
    let end = (start + length).with_timezone(&zone).naive_local();
    let mut day = local.date();
    loop {
        let day_start = day.and_hms_opt(0, 0, 0).unwrap();
        let next = day_start + Duration::days(1);
        let s = local.max(day_start);
        let e = end.min(next);
        if day >= from && day <= to && (e > s || (local == end && day == local.date())) {
            let start_minute = (s.hour() * 60 + s.minute()) as i32;
            out.push(piece(day, start_minute, ((e - s).num_minutes() as i32).max(0)));
        }
        if end <= next || day >= to {
            break;
        }
        day = day + Days::new(1);
    }
}

#[derive(Default)]
struct Event {
    uid: String,
    title: String,
    all_day: bool,
    start: Option<DateTime<Tz>>,
    end: Option<DateTime<Tz>>,
    duration: Option<Duration>,
    rrules: Vec<String>,
    rdates: Vec<DateTime<Tz>>,
    exdates: Vec<DateTime<Tz>>,
    recurrence_id: Option<DateTime<Tz>>,
    cancelled: bool,
    transparent: bool,
    /// X-AXIOM-BLOCK: the plan block Axiom published this event for.
    axiom_block: Option<String>,
    location: String,
    description: String,
    url: Option<String>,
}

impl Event {
    fn length(&self) -> Duration {
        let fallback = if self.all_day { Duration::days(1) } else { Duration::zero() };
        match (self.start, self.end, self.duration) {
            (_, _, Some(d)) => d,
            (Some(s), Some(e), _) if e > s => e - s,
            _ => fallback,
        }
    }

    /// Start times of the occurrences that overlap the window.
    fn expand(&self, start: DateTime<Tz>, after: DateTime<Tz>, before: DateTime<Tz>) -> Vec<DateTime<Tz>> {
        let mut set = RRuleSet::new(start);
        for rule in &self.rrules {
            // A rule we can't read is skipped rather than failing the calendar.
            let rule = until_in_utc(rule, start.timezone());
            if let Ok(rule) = rule.parse::<RRule<Unvalidated>>().and_then(|r| r.validate(start)) {
                set = set.rrule(rule);
            }
        }
        if set.get_rrule().is_empty() && self.rdates.is_empty() {
            return vec![start];
        }
        let mut dates = self.rdates.iter().fold(set, |s, d| s.rdate(*d));
        dates = self.exdates.iter().fold(dates, |s, d| s.exdate(*d));
        let mut found = dates.after(after).before(before).all(MAX_OCCURRENCES).dates;
        // The first occurrence always counts, even if the rule wouldn't pick it.
        if start > after && start < before && !found.contains(&start) && !self.exdates.contains(&start) {
            found.insert(0, start);
        }
        found
    }
}

/// Writes a rule's UNTIL in UTC, as `rrule` requires for zoned starts.
/// Calendars often give a local time or just a date (meaning that whole day).
fn until_in_utc(rule: &str, zone: Tz) -> String {
    rule.split(';')
        .map(|part| match part.split_once('=') {
            Some((key, value)) if key.eq_ignore_ascii_case("UNTIL") && !value.ends_with('Z') => {
                let local = if value.len() == 8 {
                    NaiveDate::parse_from_str(value, "%Y%m%d").ok().and_then(|d| d.and_hms_opt(23, 59, 59))
                } else {
                    NaiveDateTime::parse_from_str(value, "%Y%m%dT%H%M%S").ok()
                };
                match local.and_then(|l| in_zone(zone, l)) {
                    Some(at) => format!("UNTIL={}", at.with_timezone(&chrono::Utc).format("%Y%m%dT%H%M%SZ")),
                    None => part.to_owned(),
                }
            }
            _ => part.to_owned(),
        })
        .collect::<Vec<_>>()
        .join(";")
}

fn collect_events(lines: &[Line], zone: Tz) -> Vec<Event> {
    let mut events = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut current = Event::default();
    for line in lines {
        match line.name.as_str() {
            "BEGIN" => {
                let component = line.value.to_ascii_uppercase();
                if component == "VEVENT" {
                    current = Event::default();
                }
                stack.push(component);
                continue;
            }
            "END" => {
                if stack.pop().as_deref() == Some("VEVENT") {
                    events.push(std::mem::take(&mut current));
                }
                continue;
            }
            _ => {}
        }
        // Only the event's own properties, not those of alarms inside it.
        if stack.last().map(String::as_str) != Some("VEVENT") {
            continue;
        }
        let e = &mut current;
        match line.name.as_str() {
            "UID" => e.uid = line.value.clone(),
            "SUMMARY" => e.title = unescape(&line.value),
            "DTSTART" => {
                e.all_day = is_date(line);
                e.start = when(line, &line.value, zone);
            }
            "DTEND" => e.end = when(line, &line.value, zone),
            "DURATION" => e.duration = parse_duration(&line.value),
            "RRULE" => e.rrules.push(line.value.clone()),
            "RDATE" => e.rdates.extend(line.value.split(',').filter_map(|v| when(line, v, zone))),
            "EXDATE" => e.exdates.extend(line.value.split(',').filter_map(|v| when(line, v, zone))),
            "RECURRENCE-ID" => e.recurrence_id = when(line, &line.value, zone),
            "STATUS" => e.cancelled = line.value.eq_ignore_ascii_case("CANCELLED"),
            "TRANSP" => e.transparent = line.value.eq_ignore_ascii_case("TRANSPARENT"),
            "X-AXIOM-BLOCK" => e.axiom_block = Some(line.value.clone()),
            "LOCATION" => e.location = unescape(&line.value),
            "DESCRIPTION" => e.description = unescape_multiline(&line.value),
            "URL" => e.url = Some(line.value.clone()),
            _ => {}
        }
    }
    for e in &mut events {
        if e.title.trim().is_empty() {
            e.title = "Busy".into();
        }
    }
    events
}

/// An event Axiom published from the plan, as found in a calendar.
#[derive(Debug, Clone, PartialEq)]
pub struct Marked {
    pub block_id: String,
    pub title: String,
    pub start: DateTime<chrono::Utc>,
    pub end: DateTime<chrono::Utc>,
}

/// Axiom's own events in a calendar object (one CalDAV resource).
pub fn marked(text: &str) -> Vec<Marked> {
    let lines: Vec<Line> = unfold(text).iter().filter_map(|l| parse_line(l)).collect();
    collect_events(&lines, Tz::UTC)
        .into_iter()
        .filter_map(|e| {
            let start = e.start?;
            Some(Marked {
                block_id: e.axiom_block.clone()?,
                title: e.title.clone(),
                start: start.with_timezone(&chrono::Utc),
                end: (start + e.length()).with_timezone(&chrono::Utc),
            })
        })
        .collect()
}

// ---------- Lines and values ----------

struct Line {
    name: String,
    params: Vec<(String, String)>,
    value: String,
}

impl Line {
    fn param(&self, name: &str) -> Option<&str> {
        self.params.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }
}

/// Joins folded lines: a line starting with a space or tab continues the one before.
fn unfold(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in text.lines() {
        match (raw.strip_prefix(' ').or_else(|| raw.strip_prefix('\t')), lines.last_mut()) {
            (Some(rest), Some(last)) => last.push_str(rest),
            _ => lines.push(raw.to_owned()),
        }
    }
    lines
}

/// `NAME;PARAM=VALUE;PARAM="VALUE":value`, with colons and semicolons
/// inside quotes left alone.
fn parse_line(line: &str) -> Option<Line> {
    let mut quoted = false;
    let mut split = None;
    for (i, c) in line.char_indices() {
        match c {
            '"' => quoted = !quoted,
            ':' if !quoted => {
                split = Some(i);
                break;
            }
            _ => {}
        }
    }
    let split = split?;
    let (head, value) = (&line[..split], &line[split + 1..]);
    let mut parts = Vec::new();
    let (mut start, mut quoted) = (0, false);
    for (i, c) in head.char_indices() {
        match c {
            '"' => quoted = !quoted,
            ';' if !quoted => {
                parts.push(&head[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&head[start..]);
    let name = parts[0].trim().to_ascii_uppercase();
    let params = parts[1..]
        .iter()
        .filter_map(|p| p.split_once('='))
        .map(|(k, v)| (k.trim().to_ascii_uppercase(), v.trim().trim_matches('"').to_owned()))
        .collect();
    Some(Line { name, params, value: value.trim().to_owned() })
}

/// Like `unescape`, but keeps line breaks (for notes).
fn unescape_multiline(text: &str) -> String {
    unescape(&text.replace("\\n", "\u{1}").replace("\\N", "\u{1}")).replace('\u{1}', "\n")
}

fn unescape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push(' '),
                Some(other) => out.push(other),
                None => {}
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn is_date(line: &Line) -> bool {
    line.param("VALUE").is_some_and(|v| v.eq_ignore_ascii_case("DATE")) || line.value.trim().len() == 8
}

/// A date or date-time value as an instant. Dates are midnight in `zone`;
/// times without a zone ("floating") are in `zone` too.
fn when(line: &Line, value: &str, zone: Tz) -> Option<DateTime<Tz>> {
    let value = value.trim();
    if value.len() == 8 {
        return Some(midnight(NaiveDate::parse_from_str(value, "%Y%m%d").ok()?, zone));
    }
    let (text, utc) = match value.strip_suffix('Z') {
        Some(rest) => (rest, true),
        None => (value, false),
    };
    let naive = NaiveDateTime::parse_from_str(text, "%Y%m%dT%H%M%S").ok()?;
    let tz = if utc { Tz::UTC } else { line.param("TZID").and_then(time_zone).unwrap_or(zone) };
    in_zone(tz, naive)
}

/// A local time in a zone. A time skipped by a clock change moves forward an hour.
pub fn in_zone(tz: Tz, naive: NaiveDateTime) -> Option<DateTime<Tz>> {
    tz.from_local_datetime(&naive).earliest().or_else(|| tz.from_local_datetime(&(naive + Duration::hours(1))).earliest())
}

pub fn midnight(day: NaiveDate, zone: Tz) -> DateTime<Tz> {
    in_zone(zone, day.and_hms_opt(0, 0, 0).unwrap()).expect("midnight or 1am exists")
}

/// `P1D`, `PT1H30M`, `P2W`: an iCalendar length.
fn parse_duration(text: &str) -> Option<Duration> {
    let text = text.trim();
    let (negative, text) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text.strip_prefix('+').unwrap_or(text)),
    };
    let mut seconds = 0i64;
    let mut number = String::new();
    let mut in_time = false;
    for c in text.strip_prefix('P')?.chars() {
        match c {
            '0'..='9' => number.push(c),
            'T' => in_time = true,
            unit => {
                let n: i64 = number.parse().ok()?;
                number.clear();
                seconds += n * match (unit, in_time) {
                    ('W', false) => 7 * 86_400,
                    ('D', false) => 86_400,
                    ('H', true) => 3_600,
                    ('M', true) => 60,
                    ('S', true) => 1,
                    _ => return None,
                };
            }
        }
    }
    (!negative).then(|| Duration::seconds(seconds))
}

/// A TZID: an IANA name ("Europe/London"), one with a prefix
/// ("/mozilla.org/20050126_1/Europe/London"), or a Windows name from
/// Outlook ("GMT Standard Time").
fn time_zone(id: &str) -> Option<Tz> {
    let id = id.trim().trim_matches('"');
    let iana = |name: &str| name.parse::<chrono_tz::Tz>().ok().map(Tz::Tz);
    if let Some(tz) = iana(id) {
        return Some(tz);
    }
    let segments: Vec<&str> = id.split('/').filter(|s| !s.is_empty()).collect();
    for take in [3, 2] {
        if segments.len() >= take {
            if let Some(tz) = iana(&segments[segments.len() - take..].join("/")) {
                return Some(tz);
            }
        }
    }
    WINDOWS_ZONES.iter().find(|(windows, _)| windows.eq_ignore_ascii_case(id)).and_then(|(_, name)| iana(name))
}

/// Windows time zone names, as Outlook writes them, and their IANA
/// equivalents (from the Unicode CLDR mapping, most-used zones).
const WINDOWS_ZONES: &[(&str, &str)] = &[
    ("Dateline Standard Time", "Etc/GMT+12"),
    ("Hawaiian Standard Time", "Pacific/Honolulu"),
    ("Alaskan Standard Time", "America/Anchorage"),
    ("Pacific Standard Time", "America/Los_Angeles"),
    ("US Mountain Standard Time", "America/Phoenix"),
    ("Mountain Standard Time", "America/Denver"),
    ("Central America Standard Time", "America/Guatemala"),
    ("Central Standard Time", "America/Chicago"),
    ("Central Standard Time (Mexico)", "America/Mexico_City"),
    ("Canada Central Standard Time", "America/Regina"),
    ("SA Pacific Standard Time", "America/Bogota"),
    ("Eastern Standard Time", "America/New_York"),
    ("US Eastern Standard Time", "America/Indianapolis"),
    ("Venezuela Standard Time", "America/Caracas"),
    ("Atlantic Standard Time", "America/Halifax"),
    ("SA Western Standard Time", "America/La_Paz"),
    ("Pacific SA Standard Time", "America/Santiago"),
    ("Newfoundland Standard Time", "America/St_Johns"),
    ("E. South America Standard Time", "America/Sao_Paulo"),
    ("Argentina Standard Time", "America/Buenos_Aires"),
    ("SA Eastern Standard Time", "America/Cayenne"),
    ("UTC", "Etc/UTC"),
    ("Coordinated Universal Time", "Etc/UTC"),
    ("GMT Standard Time", "Europe/London"),
    ("Greenwich Standard Time", "Atlantic/Reykjavik"),
    ("W. Europe Standard Time", "Europe/Berlin"),
    ("Central Europe Standard Time", "Europe/Budapest"),
    ("Romance Standard Time", "Europe/Paris"),
    ("Central European Standard Time", "Europe/Warsaw"),
    ("W. Central Africa Standard Time", "Africa/Lagos"),
    ("GTB Standard Time", "Europe/Bucharest"),
    ("FLE Standard Time", "Europe/Kiev"),
    ("E. Europe Standard Time", "Europe/Chisinau"),
    ("Egypt Standard Time", "Africa/Cairo"),
    ("South Africa Standard Time", "Africa/Johannesburg"),
    ("Israel Standard Time", "Asia/Jerusalem"),
    ("Turkey Standard Time", "Europe/Istanbul"),
    ("Arabic Standard Time", "Asia/Baghdad"),
    ("Arab Standard Time", "Asia/Riyadh"),
    ("Russian Standard Time", "Europe/Moscow"),
    ("E. Africa Standard Time", "Africa/Nairobi"),
    ("Iran Standard Time", "Asia/Tehran"),
    ("Arabian Standard Time", "Asia/Dubai"),
    ("Afghanistan Standard Time", "Asia/Kabul"),
    ("Pakistan Standard Time", "Asia/Karachi"),
    ("West Asia Standard Time", "Asia/Tashkent"),
    ("India Standard Time", "Asia/Calcutta"),
    ("Sri Lanka Standard Time", "Asia/Colombo"),
    ("Nepal Standard Time", "Asia/Katmandu"),
    ("Bangladesh Standard Time", "Asia/Dhaka"),
    ("Myanmar Standard Time", "Asia/Rangoon"),
    ("SE Asia Standard Time", "Asia/Bangkok"),
    ("China Standard Time", "Asia/Shanghai"),
    ("Singapore Standard Time", "Asia/Singapore"),
    ("W. Australia Standard Time", "Australia/Perth"),
    ("Taipei Standard Time", "Asia/Taipei"),
    ("Tokyo Standard Time", "Asia/Tokyo"),
    ("Korea Standard Time", "Asia/Seoul"),
    ("Cen. Australia Standard Time", "Australia/Adelaide"),
    ("AUS Central Standard Time", "Australia/Darwin"),
    ("E. Australia Standard Time", "Australia/Brisbane"),
    ("AUS Eastern Standard Time", "Australia/Sydney"),
    ("Tasmania Standard Time", "Australia/Hobart"),
    ("New Zealand Standard Time", "Pacific/Auckland"),
];

// ---------- Editing ----------

/// A change to one event. Fields left `None` stay as they are.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct EventChange {
    pub title: Option<String>,
    pub location: Option<String>,
    pub description: Option<String>,
    /// New start and end, for an event with a time.
    pub times: Option<(DateTime<chrono::Utc>, DateTime<chrono::Utc>)>,
}

/// Applies a change to a calendar object holding one event that doesn't
/// repeat (CalDAV stores each event as such an object). Returns the new text.
pub fn edit_event(text: &str, change: &EventChange) -> Result<String, String> {
    let lines = unfold(text);
    let events = lines.iter().filter(|l| l.trim().eq_ignore_ascii_case("BEGIN:VEVENT")).count();
    let repeats = lines.iter().filter_map(|l| parse_line(l)).any(|l| matches!(l.name.as_str(), "RRULE" | "RDATE" | "RECURRENCE-ID"));
    if events != 1 || repeats {
        return Err("Repeating events can only be changed in the calendar's own app.".into());
    }
    let mut replaced: Vec<(&str, String)> = Vec::new();
    let escape = |t: &str| t.replace('\\', "\\\\").replace(';', "\\;").replace(',', "\\,").replace('\n', "\\n");
    if let Some(t) = &change.title {
        replaced.push(("SUMMARY", format!("SUMMARY:{}", escape(t))));
    }
    if let Some(l) = &change.location {
        replaced.push(("LOCATION", format!("LOCATION:{}", escape(l))));
    }
    if let Some(d) = &change.description {
        replaced.push(("DESCRIPTION", format!("DESCRIPTION:{}", escape(d))));
    }
    let stamp = |t: DateTime<chrono::Utc>| t.format("%Y%m%dT%H%M%SZ").to_string();
    if let Some((start, end)) = change.times {
        replaced.push(("DTSTART", format!("DTSTART:{}", stamp(start))));
        replaced.push(("DTEND", format!("DTEND:{}", stamp(end))));
        // DTEND replaces any DURATION.
        replaced.push(("DURATION", String::new()));
    }
    let now = stamp(chrono::Utc::now());
    replaced.push(("LAST-MODIFIED", format!("LAST-MODIFIED:{now}")));
    replaced.push(("DTSTAMP", format!("DTSTAMP:{now}")));

    let mut out = Vec::new();
    let mut depth: Vec<String> = Vec::new();
    let mut sequence = 0;
    for raw in &lines {
        let Some(line) = parse_line(raw) else {
            out.push(raw.clone());
            continue;
        };
        let in_event = depth.last().map(String::as_str) == Some("VEVENT");
        match line.name.as_str() {
            "BEGIN" => depth.push(line.value.to_ascii_uppercase()),
            "END" if line.value.eq_ignore_ascii_case("VEVENT") && in_event => {
                // The changed properties go in just before the event ends.
                for (_, new) in replaced.iter().filter(|(_, l)| !l.is_empty()) {
                    out.push(new.clone());
                }
                out.push(format!("SEQUENCE:{}", sequence + 1));
                depth.pop();
                out.push(raw.clone());
                continue;
            }
            "END" => {
                depth.pop();
            }
            name if in_event => {
                if name == "SEQUENCE" {
                    sequence = line.value.trim().parse().unwrap_or(0);
                    continue;
                }
                if replaced.iter().any(|(n, _)| *n == name) {
                    continue;
                }
            }
            _ => {}
        }
        out.push(raw.clone());
    }
    Ok(out.iter().map(|l| fold(l)).collect::<Vec<_>>().join("\r\n") + "\r\n")
}

/// Splits a line into 75-byte pieces, continuations starting with a space.
pub fn fold(line: &str) -> String {
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
