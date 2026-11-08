//! A week or a month that an area's analytics report on: its days, the
//! stretch before it to compare with, and the periods before that for a
//! trend line. Weeks start on Monday, as they do everywhere else in Axiom.

use chrono::{Datelike, Days, Local, Months};
use sea_orm::prelude::{Date, DateTimeUtc};
use serde::Serialize;

use crate::error::{Error, Result};

/// How many periods a trend line covers, this one included.
pub const TREND: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unit {
    Week,
    Month,
}

#[derive(Debug, Clone, Copy)]
pub struct Period {
    pub unit: Unit,
    pub start: Date,
    /// The day after the last one.
    pub end: Date,
    pub today: Date,
}

/// A number now, and at the same point in the period before.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Compare {
    pub now: Option<f64>,
    pub before: Option<f64>,
}

/// An area's one number for the scorecard, with a trend: one value a
/// period, oldest first, ending with this one.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Headline {
    pub now: Option<f64>,
    pub before: Option<f64>,
    pub trend: Vec<Option<f64>>,
}

impl Period {
    /// The week or month (`unit` is "week" or "month") that holds `day`.
    pub fn new(unit: &str, day: Date, today: Date) -> Result<Self> {
        let unit = match unit {
            "week" => Unit::Week,
            "month" => Unit::Month,
            _ => return Err(Error::Invalid(format!("Not a period: {unit}"))),
        };
        Ok(Self::holding(unit, day, today))
    }

    fn holding(unit: Unit, day: Date, today: Date) -> Self {
        let (start, end) = match unit {
            Unit::Week => {
                let monday = day - Days::new(day.weekday().num_days_from_monday() as u64);
                (monday, monday + Days::new(7))
            }
            Unit::Month => {
                let first = day.with_day(1).expect("every month has a first");
                (first, first + Months::new(1))
            }
        };
        Self { unit, start, end, today }
    }

    pub fn previous(&self) -> Self {
        Self::holding(self.unit, self.start - Days::new(1), self.today)
    }

    pub fn days(&self) -> Vec<Date> {
        self.start.iter_days().take_while(|d| *d < self.end).collect()
    }

    pub fn contains(&self, day: Date) -> bool {
        day >= self.start && day < self.end
    }

    /// Where the period stops counting: its end, or tomorrow while it's
    /// still going.
    pub fn counted_end(&self) -> Date {
        self.end.min(self.today + Days::new(1)).max(self.start)
    }

    /// The period before, cut to as many days as this one has had so far,
    /// so a week in progress is compared with the same days of last week.
    pub fn before(&self) -> (Date, Date) {
        let previous = self.previous();
        let elapsed = (self.counted_end() - self.start).num_days().max(0) as u64;
        (previous.start, (previous.start + Days::new(elapsed)).min(previous.end))
    }

    /// This period and the ones before it, oldest first.
    pub fn trend(&self) -> Vec<Period> {
        let mut periods = vec![*self];
        while periods.len() < TREND {
            let first = periods[0].previous();
            periods.insert(0, first);
        }
        periods
    }

    /// The first day a trend needs, for loading rows once.
    pub fn trend_start(&self) -> Date {
        self.trend()[0].start
    }

    /// `value` over [from, to) now and for the stretch before.
    pub fn compare(&self, value: impl Fn(Date, Date) -> Option<f64>) -> Compare {
        let (from, to) = self.before();
        Compare { now: unsigned_zero(value(self.start, self.counted_end())), before: unsigned_zero(value(from, to)) }
    }

    /// `value` over [from, to) now, before, and for every period of the trend.
    pub fn headline(&self, value: impl Fn(Date, Date) -> Option<f64>) -> Headline {
        let Compare { now, before } = self.compare(&value);
        let trend = self.trend().iter().map(|p| unsigned_zero(value(p.start, p.counted_end()))).collect();
        Headline { now, before, trend }
    }

    /// One value for each day of the period.
    pub fn daily<T>(&self, value: impl Fn(Date) -> T) -> Vec<T> {
        self.days().into_iter().map(value).collect()
    }
}

/// An empty f64 sum is -0.0, which would show as "-0".
fn unsigned_zero(value: Option<f64>) -> Option<f64> {
    value.map(|v| v + 0.0)
}

/// The day a moment fell on, where the user is.
pub fn local_day(at: DateTimeUtc) -> Date {
    at.with_timezone(&Local).date_naive()
}

/// A share as a percentage, or None when there's nothing to share out.
pub fn percent(part: usize, whole: usize) -> Option<f64> {
    (whole > 0).then(|| part as f64 * 100.0 / whole as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u32, day: u32) -> Date {
        Date::from_ymd_opt(y, m, day).unwrap()
    }

    #[test]
    fn a_week_runs_monday_to_sunday() {
        // 2026-11-04 is a Wednesday.
        let p = Period::new("week", d(2026, 11, 4), d(2026, 11, 4)).unwrap();
        assert_eq!((p.start, p.end), (d(2026, 11, 2), d(2026, 11, 9)));
        assert_eq!(p.days().len(), 7);
    }

    #[test]
    fn a_week_in_progress_is_compared_with_the_same_days_of_last_week() {
        let p = Period::new("week", d(2026, 11, 4), d(2026, 11, 4)).unwrap();
        assert_eq!(p.counted_end(), d(2026, 11, 5));
        assert_eq!(p.before(), (d(2026, 10, 26), d(2026, 10, 29)));
    }

    #[test]
    fn a_finished_month_is_compared_with_the_whole_month_before() {
        let p = Period::new("month", d(2026, 3, 9), d(2026, 11, 1)).unwrap();
        assert_eq!((p.start, p.end), (d(2026, 3, 1), d(2026, 4, 1)));
        assert_eq!(p.before(), (d(2026, 2, 1), d(2026, 3, 1)));
    }

    #[test]
    fn a_long_month_compared_with_a_short_one_stops_at_its_end() {
        // 31 days of March in, but February had 28.
        let p = Period::new("month", d(2026, 3, 31), d(2026, 3, 31)).unwrap();
        assert_eq!(p.before(), (d(2026, 2, 1), d(2026, 3, 1)));
    }

    #[test]
    fn the_trend_crosses_into_last_year() {
        let p = Period::new("month", d(2026, 2, 10), d(2026, 2, 10)).unwrap();
        let trend = p.trend();
        assert_eq!(trend.len(), TREND);
        assert_eq!(trend[0].start, d(2025, 7, 1));
        assert_eq!(trend[TREND - 1].start, d(2026, 2, 1));
        assert_eq!(p.trend_start(), d(2025, 7, 1));
    }

    #[test]
    fn a_headline_counts_each_stretch() {
        let days = [d(2026, 10, 27), d(2026, 11, 2), d(2026, 11, 3), d(2026, 11, 6)];
        let p = Period::new("week", d(2026, 11, 3), d(2026, 11, 3)).unwrap();
        let count = |from: Date, to: Date| Some(days.iter().filter(|x| **x >= from && **x < to).count() as f64);
        let h = p.headline(count);
        // The 6th hasn't happened yet; last week up to Tuesday had the 27th.
        assert_eq!((h.now, h.before), (Some(2.0), Some(1.0)));
        assert_eq!(h.trend[TREND - 1], Some(2.0));
        assert_eq!(h.trend[TREND - 2], Some(1.0));
    }

    #[test]
    fn an_unknown_unit_is_refused() {
        assert!(Period::new("year", d(2026, 1, 1), d(2026, 1, 1)).is_err());
    }
}

/// Every area's report, run on a database with nothing in it.
#[cfg(test)]
mod reports {
    use sea_orm::{ConnectOptions, Database};

    use super::Period;
    use crate::features::*;

    #[tokio::test]
    async fn every_area_reports_on_an_empty_database() {
        let mut options = ConnectOptions::new("sqlite::memory:");
        options.max_connections(1).sqlx_logging(false);
        let db = Database::connect(options).await.unwrap();
        crate::db::prepare(&db).await.unwrap();
        let today = chrono::NaiveDate::from_ymd_opt(2026, 11, 4).unwrap();
        for unit in ["week", "month"] {
            let p = Period::new(unit, today, today).unwrap();
            assert_eq!(daily_plan::analytics::report(&db, p).await.unwrap().headline.now, Some(0.0));
            assert_eq!(project_board::analytics::report(&db, p).await.unwrap().headline.now, Some(0.0));
            let pages = reading::analytics::report(&db, p).await.unwrap().headline.now.unwrap();
            assert!(pages == 0.0 && pages.is_sign_positive(), "nothing read shows as 0, not -0");
            assert_eq!(journal::analytics::report(&db, p).await.unwrap().headline.now, Some(0.0));
            assert_eq!(uni::analytics::report(&db, p).await.unwrap().headline.now, None, "no lectures due: no share to give");
            assert_eq!(learning::analytics::report(&db, p).await.unwrap().headline.now, Some(0.0));
            assert_eq!(goals::analytics::report(&db, p).await.unwrap().headline.now, Some(0.0));
            assert_eq!(notes::analytics::report(&db, p).await.unwrap().headline.now, Some(0.0));
            assert_eq!(birthdays::analytics::report(&db, p).await.unwrap().headline.now, Some(0.0));
            assert_eq!(crate::ai::analytics::report(&db, p).await.unwrap().headline.now, Some(0.0));
            // Finance needs its home currency before it can add anything up.
            assert!(finance::analytics::report(&db, p).await.is_err());
            assert_eq!(daily_plan::analytics::report(&db, p).await.unwrap().days.len(), p.days().len());
        }
    }
}
