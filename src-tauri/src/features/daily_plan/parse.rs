//! Quick add: one line of text becomes a task, read the way people type:
//! `Write report 45m 2pm !` is "Write report", 45 minutes, at 14:00, top priority.
//!
//! - **Estimates:** `45m`, `45min`, `2h`, `1.5h`, `1h30`, `1h30m`
//! - **Times:** `2pm`, `2:30pm`, `14:30`, `@14`; a preceding "at" is dropped
//! - **Days:** `today`, `tomorrow`, or `inbox` for no day yet
//! - **Top priority:** `!`
//! - **Deadlines:** `due fri`, `due tomorrow`, `due 25 oct`, `due oct 25`, `due 25/10`, `due 2026-11-03`
//!
//! Anything else is the title. A word that looks like one of these but
//! isn't (`3D`, `v2`) stays in the title.

#[derive(Debug, PartialEq)]
pub struct QuickAdd {
    pub title: String,
    pub estimate_minutes: Option<i32>,
    /// Minutes after midnight.
    pub start_minute: Option<i32>,
    pub day: DayHint,
    pub focus: bool,
    pub due: Option<DueHint>,
}

/// A deadline as typed, before it's turned into a date (that needs today).
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum DueHint {
    Today,
    Tomorrow,
    /// The next one, counting today: 0 is Monday.
    Weekday(u32),
    /// The next one, counting today.
    MonthDay { month: u32, day: u32 },
    Date { year: i32, month: u32, day: u32 },
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum DayHint {
    /// The day being looked at.
    Shown,
    Today,
    Tomorrow,
    /// No day: the task waits in the inbox.
    Inbox,
}

pub fn quick_add(text: &str) -> QuickAdd {
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut title = Vec::new();
    let (mut estimate, mut start, mut day, mut focus, mut due) = (None, None, DayHint::Shown, false, None);

    let mut i = 0;
    while i < words.len() {
        let word = &words[i];
        let lower = word.to_lowercase();
        if let (None, true, Some((hint, used))) = (due, lower == "due", deadline(&words[i + 1..])) {
            due = Some(hint);
            i += 1 + used;
            continue;
        }
        if lower == "!" {
            focus = true;
        } else if lower == "today" && day == DayHint::Shown {
            day = DayHint::Today;
        } else if lower == "tomorrow" && day == DayHint::Shown {
            day = DayHint::Tomorrow;
        } else if lower == "inbox" && day == DayHint::Shown {
            day = DayHint::Inbox;
        } else if let (None, Some(minutes)) = (estimate, duration(&lower)) {
            estimate = Some(minutes);
        } else if let (None, Some(minute)) = (start, time(&lower)) {
            start = Some(minute);
            // "Call mum at 5pm": the "at" belongs to the time.
            if i > 0 && words[i - 1].eq_ignore_ascii_case("at") && title.last().is_some_and(|w: &&str| w.eq_ignore_ascii_case("at")) {
                title.pop();
            }
        } else {
            title.push(*word);
        }
        i += 1;
    }

    QuickAdd { title: title.join(" "), estimate_minutes: estimate, start_minute: start, day, focus, due }
}

/// `45m`, `45min`, `45mins`, `2h`, `1.5h`, `1h30`, `1h30m`, in minutes.
fn duration(word: &str) -> Option<i32> {
    let minutes = if let Some((h, rest)) = word.split_once('h') {
        let hours: f64 = h.parse().ok()?;
        let rest = rest.trim_end_matches("min").trim_end_matches('m');
        let extra: f64 = if rest.is_empty() { 0.0 } else { rest.parse().ok()? };
        hours * 60.0 + extra
    } else {
        let digits = word.strip_suffix("mins").or_else(|| word.strip_suffix("min")).or_else(|| word.strip_suffix('m'))?;
        digits.parse().ok()?
    };
    let minutes = minutes.round() as i32;
    (1..=24 * 60).contains(&minutes).then_some(minutes)
}

/// `2pm`, `2:30pm`, `12am`, `14:30`, `9:05`, `@14`, `@9:30`, in minutes after midnight.
fn time(word: &str) -> Option<i32> {
    let (word, marked) = match word.strip_prefix('@') {
        Some(rest) => (rest, true),
        None => (word, false),
    };
    let (clock, meridiem) = if let Some(c) = word.strip_suffix("am") {
        (c, Some(false))
    } else if let Some(c) = word.strip_suffix("pm") {
        (c, Some(true))
    } else {
        (word, None)
    };
    let (h, m) = match clock.split_once(':') {
        Some((h, m)) if m.len() == 2 => (h.parse::<i32>().ok()?, m.parse::<i32>().ok()?),
        // A bare number is only a time when marked, as in "2pm" or "@14";
        // otherwise "Read 3 chapters" would get a start time.
        None if meridiem.is_some() || marked => (clock.parse::<i32>().ok()?, 0),
        _ => return None,
    };
    if m > 59 {
        return None;
    }
    let h = match meridiem {
        Some(pm) if (1..=12).contains(&h) => h % 12 + if pm { 12 } else { 0 },
        Some(_) => return None,
        None if (0..=23).contains(&h) => h,
        None => return None,
    };
    Some(h * 60 + m)
}

/// The words after "due", and how many of them it used.
fn deadline(words: &[&str]) -> Option<(DueHint, usize)> {
    let first = words.first()?.to_lowercase();
    match first.as_str() {
        "today" => return Some((DueHint::Today, 1)),
        "tomorrow" | "tmrw" => return Some((DueHint::Tomorrow, 1)),
        _ => {}
    }
    if let Some(day) = weekday(&first) {
        return Some((DueHint::Weekday(day), 1));
    }
    // 2026-11-03
    let iso: Vec<&str> = first.split('-').collect();
    if let [y, m, d] = iso[..] {
        if let (Ok(year), Ok(month), Ok(day)) = (y.parse(), m.parse(), d.parse()) {
            if y.len() == 4 && valid(month, day) {
                return Some((DueHint::Date { year, month, day }, 1));
            }
        }
    }
    // 25/10 or 25/10/2026
    let slashed: Vec<&str> = first.split('/').collect();
    if let [d, m, rest @ ..] = &slashed[..] {
        if let (Ok(day), Ok(month)) = (d.parse(), m.parse()) {
            if valid(month, day) {
                return Some(match rest {
                    [y] => (DueHint::Date { year: y.parse().ok()?, month, day }, 1),
                    [] => (DueHint::MonthDay { month, day }, 1),
                    _ => return None,
                });
            }
        }
    }
    // 25 oct, 25th oct, oct 25
    let second = words.get(1)?.to_lowercase();
    let number = |w: &str| w.trim_end_matches(|c: char| c.is_ascii_alphabetic()).parse::<u32>().ok();
    let (day, month) = match (number(&first), month(&second), month(&first), number(&second)) {
        (Some(d), Some(m), _, _) => (d, m),
        (_, _, Some(m), Some(d)) => (d, m),
        _ => return None,
    };
    valid(month, day).then_some((DueHint::MonthDay { month, day }, 2))
}

fn valid(month: u32, day: u32) -> bool {
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

fn weekday(word: &str) -> Option<u32> {
    let days = [
        &["mon", "monday"][..],
        &["tue", "tues", "tuesday"],
        &["wed", "weds", "wednesday"],
        &["thu", "thur", "thurs", "thursday"],
        &["fri", "friday"],
        &["sat", "saturday"],
        &["sun", "sunday"],
    ];
    days.iter().position(|names| names.contains(&word)).map(|i| i as u32)
}

fn month(word: &str) -> Option<u32> {
    let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    let word = word.get(..3)?;
    months.iter().position(|m| *m == word).map(|i| i as u32 + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(text: &str) -> QuickAdd {
        quick_add(text)
    }

    #[test]
    fn reads_deadlines() {
        let essay = parsed("Essay due fri inbox 3h");
        assert_eq!((essay.title.as_str(), essay.due, essay.day, essay.estimate_minutes), ("Essay", Some(DueHint::Weekday(4)), DayHint::Inbox, Some(180)));
        assert_eq!(parsed("Pay rent due tomorrow").due, Some(DueHint::Tomorrow));
        assert_eq!(parsed("Report due 25 oct").due, Some(DueHint::MonthDay { month: 10, day: 25 }));
        assert_eq!(parsed("Report due Oct 25th").due, Some(DueHint::MonthDay { month: 10, day: 25 }));
        assert_eq!(parsed("Visa due 3/11").due, Some(DueHint::MonthDay { month: 11, day: 3 }));
        assert_eq!(parsed("Taxes due 2027-01-31").due, Some(DueHint::Date { year: 2027, month: 1, day: 31 }));
        // "due" without a date after it is just a word.
        let plain = parsed("Library books due back");
        assert_eq!((plain.title.as_str(), plain.due), ("Library books due back", None));
    }

    #[test]
    fn reads_estimates_times_days_and_priority() {
        assert_eq!(
            parsed("Write report 45m 2pm !"),
            QuickAdd { title: "Write report".into(), estimate_minutes: Some(45), start_minute: Some(14 * 60), day: DayHint::Shown, focus: true, due: None }
        );
        let p = parsed("Gym tomorrow at 7:30am 1h");
        assert_eq!((p.title.as_str(), p.start_minute, p.estimate_minutes, p.day), ("Gym", Some(450), Some(60), DayHint::Tomorrow));
        assert_eq!(parsed("Plan sprint 1h30 @9:15").estimate_minutes, Some(90));
        assert_eq!(parsed("Plan sprint 1h30 @9:15").start_minute, Some(555));
        assert_eq!(parsed("Deep work 1.5h 14:00").estimate_minutes, Some(90));
        assert_eq!(parsed("Review 20min").estimate_minutes, Some(20));
        assert_eq!(parsed("Lunch 12pm").start_minute, Some(12 * 60));
        assert_eq!(parsed("Late call 12am").start_minute, Some(0));
    }

    #[test]
    fn leaves_ordinary_words_in_the_title() {
        let p = parsed("Read 3 chapters of 3D modelling v2 at home");
        assert_eq!(p.title, "Read 3 chapters of 3D modelling v2 at home");
        assert_eq!((p.estimate_minutes, p.start_minute, p.focus), (None, None, false));
        // Only the first estimate and time count; later ones are words.
        let p = parsed("Call 10m 5pm about 20m slot");
        assert_eq!((p.title.as_str(), p.estimate_minutes, p.start_minute), ("Call about 20m slot", Some(10), Some(17 * 60)));
    }

    #[test]
    fn rejects_impossible_values() {
        assert_eq!(parsed("Thing 25:00").start_minute, None);
        assert_eq!(parsed("Thing 13pm").start_minute, None);
        assert_eq!(parsed("Thing 9:75").start_minute, None);
        assert_eq!(parsed("Thing 0m").estimate_minutes, None);
        assert_eq!(parsed("Thing 30h").estimate_minutes, None);
    }

    #[test]
    fn inbox_means_no_day() {
        let p = parsed("Renew passport inbox 30m");
        assert_eq!((p.title.as_str(), p.day, p.estimate_minutes), ("Renew passport", DayHint::Inbox, Some(30)));
    }

    #[test]
    fn at_goes_with_its_time_only() {
        assert_eq!(parsed("Call mum at 5pm").title, "Call mum");
        assert_eq!(parsed("Look at notes").title, "Look at notes");
    }
}
