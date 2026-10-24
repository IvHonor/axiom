//! Dates as statements write them. A statement's dates are read together:
//! the first layout that reads every one of them is the one it uses, so
//! 03/04/2026 is told apart from 04/03/2026 by the rest of the file.

use chrono::{NaiveDate, NaiveDateTime};

/// chrono layouts, most common first. Day-first and month-first both appear;
/// `detect` picks between them.
pub const LAYOUTS: &[&str] = &[
    "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%m-%d-%Y", "%d.%m.%Y", "%Y/%m/%d", "%d/%m/%y", "%m/%d/%y", "%d-%m-%y", "%d.%m.%y", "%d %b %Y",
    "%d %B %Y", "%d-%b-%Y", "%d-%b-%y", "%b %d, %Y", "%B %d, %Y", "%d %b %y", "%Y%m%d",
];

pub fn parse(text: &str, layout: &str) -> Option<NaiveDate> {
    let text = text.trim();
    // A time after the date ("2026-10-23 14:02:11", "2026-10-23T14:02").
    let date_part = text.split(['T', ' ']).next().filter(|_| layout == "%Y-%m-%d" || layout == "%Y/%m/%d").unwrap_or(text);
    NaiveDate::parse_from_str(date_part, layout)
        .ok()
        .or_else(|| NaiveDateTime::parse_from_str(text, &format!("{layout} %H:%M:%S")).ok().map(|d| d.date()))
        .or_else(|| NaiveDateTime::parse_from_str(text, &format!("{layout} %H:%M")).ok().map(|d| d.date()))
        // "1 Oct 2026" needs %e-style single digits; chrono's %d accepts them.
        .filter(|d| (1990..=2100).contains(&chrono::Datelike::year(d)))
}

/// The layout that reads the most of these (a stray footer or bad row
/// doesn't stop the rest). When day-first and month-first read as many (every
/// day is 12 or under), `month_first` decides.
pub fn detect(samples: &[&str], month_first: bool) -> Option<&'static str> {
    let samples: Vec<&str> = samples.iter().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    let read = |layout: &str| samples.iter().filter(|s| parse(s, layout).is_some()).count();
    let best = LAYOUTS.iter().map(|l| read(l)).max().filter(|n| *n > 0)?;
    let fits: Vec<&'static str> = LAYOUTS.iter().copied().filter(|l| read(l) == best).collect();
    let prefer = |a: &str| if month_first { a.starts_with("%m") || a.starts_with("%b") || a.starts_with("%B") } else { !a.starts_with("%m") };
    fits.iter().copied().find(|l| prefer(l)).or_else(|| fits.first().copied())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_whole_column_decides_the_layout() {
        assert_eq!(detect(&["03/04/2026", "25/04/2026"], false), Some("%d/%m/%Y"));
        assert_eq!(detect(&["03/04/2026", "04/25/2026"], false), Some("%m/%d/%Y"), "25 can only be a day");
        assert_eq!(detect(&["03/04/2026", "05/04/2026"], true), Some("%m/%d/%Y"), "ambiguous: the country decides");
        assert_eq!(detect(&["2026-10-23", "2026-10-24T09:12:00"], false), Some("%Y-%m-%d"));
        assert_eq!(detect(&["23 Oct 2026", "1 Nov 2026"], false), Some("%d %b %Y"));
        assert_eq!(detect(&["23.10.26"], false), Some("%d.%m.%y"));
        assert_eq!(detect(&["not a date"], false), None);
    }
}
