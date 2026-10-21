//! Quick add: one line of text becomes a task, read the way people type:
//! `Write report 45m 2pm !` is "Write report", 45 minutes, at 14:00, top priority.
//!
//! - **Estimates:** `45m`, `45min`, `2h`, `1.5h`, `1h30`, `1h30m`
//! - **Times:** `2pm`, `2:30pm`, `14:30`, `@14`; a preceding "at" is dropped
//! - **Days:** `today`, `tomorrow`, or `inbox` for no day yet
//! - **Top priority:** `!`
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
    let (mut estimate, mut start, mut day, mut focus) = (None, None, DayHint::Shown, false);

    for (i, word) in words.iter().enumerate() {
        let lower = word.to_lowercase();
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
    }

    QuickAdd { title: title.join(" "), estimate_minutes: estimate, start_minute: start, day, focus }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(text: &str) -> QuickAdd {
        quick_add(text)
    }

    #[test]
    fn reads_estimates_times_days_and_priority() {
        assert_eq!(
            parsed("Write report 45m 2pm !"),
            QuickAdd { title: "Write report".into(), estimate_minutes: Some(45), start_minute: Some(14 * 60), day: DayHint::Shown, focus: true }
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
