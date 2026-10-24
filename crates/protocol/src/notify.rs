//! Notifications: what each one says, and the emails the app plans for the
//! server to send.
//!
//! The app works out every notification from its own data (it knows the
//! user's time zone, shared boards and so on). In the app they become in-app
//! and desktop notifications; for email, the app sends the server the next
//! week's worth (`PlanEmails`) and the server sends each when it's due, so
//! they arrive even while the app is closed.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

/// One notification's content. The `kind` is also the preference's id.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum Digest {
    /// Project Board cards overdue, due today or due tomorrow.
    #[serde(rename = "project_board.deadlines")]
    BoardDeadlines { day: NaiveDate, items: Vec<Deadline> },
    /// Planner tasks overdue, due today or due tomorrow.
    #[serde(rename = "daily_plan.deadlines")]
    PlanDeadlines { day: NaiveDate, items: Vec<Deadline> },
    /// The day ahead: blocks and meetings in order, and the top priorities.
    #[serde(rename = "daily_plan.agenda")]
    PlanAgenda { day: NaiveDate, items: Vec<AgendaItem>, focus: Vec<String> },
    /// Today's lectures, and how many are waiting to be caught up on.
    #[serde(rename = "uni.today")]
    UniToday { day: NaiveDate, lectures: Vec<LectureItem>, behind: u32 },
    /// The week at university: progress per module and what's still to catch up on.
    #[serde(rename = "uni.weekly")]
    UniWeekly { day: NaiveDate, term: String, week: Option<i32>, modules: Vec<ModuleProgress>, behind: Vec<LectureItem> },
    /// The streak is about to break: nothing read yet today.
    #[serde(rename = "reading.streak")]
    ReadingStreak { day: NaiveDate, streak: i32, book: Option<String> },
    /// Not written in the journal yet today: a nudge, with a prompt to start.
    /// Nothing from the journal itself is in it, so it can be emailed.
    #[serde(rename = "journal.reminder")]
    JournalReminder { day: NaiveDate, streak: i32, prompt: String },
    /// Recurring bills and income that have come round to confirm. App only:
    /// emailing amounts would put them on the server unencrypted.
    #[serde(rename = "finance.bills")]
    FinanceBills { day: NaiveDate, bills: Vec<Bill> },
    /// Last month at a glance, on the 1st. App only, like `FinanceBills`.
    #[serde(rename = "finance.month")]
    FinanceMonth { day: NaiveDate, month: String, spent: String, income: String, over: Vec<String> },
    /// Birthdays and anniversaries today, and ones coming up that were asked
    /// to be heard about ahead (each person's own number of days).
    #[serde(rename = "birthdays.upcoming")]
    Birthdays { day: NaiveDate, today: Vec<BirthdayItem>, soon: Vec<BirthdayItem> },
    /// The week's check-in on goals: how each is going against its pace.
    #[serde(rename = "goals.weekly")]
    GoalsWeekly { day: NaiveDate, goals: Vec<GoalItem> },
    /// The week's reading.
    #[serde(rename = "reading.weekly")]
    ReadingWeekly {
        day: NaiveDate,
        pages: i32,
        minutes: i32,
        reading_days: i32,
        streak: i32,
        finished: Vec<String>,
        books: Vec<BookProgress>,
        /// Books finished this year, and the goal if one's set.
        goal: Option<Goal>,
    },
}

impl Digest {
    pub fn kind(&self) -> &'static str {
        match self {
            Digest::BoardDeadlines { .. } => "project_board.deadlines",
            Digest::PlanDeadlines { .. } => "daily_plan.deadlines",
            Digest::PlanAgenda { .. } => "daily_plan.agenda",
            Digest::UniToday { .. } => "uni.today",
            Digest::UniWeekly { .. } => "uni.weekly",
            Digest::ReadingStreak { .. } => "reading.streak",
            Digest::ReadingWeekly { .. } => "reading.weekly",
            Digest::JournalReminder { .. } => "journal.reminder",
            Digest::FinanceBills { .. } => "finance.bills",
            Digest::FinanceMonth { .. } => "finance.month",
            Digest::Birthdays { .. } => "birthdays.upcoming",
            Digest::GoalsWeekly { .. } => "goals.weekly",
        }
    }

    /// The day it's about.
    pub fn day(&self) -> NaiveDate {
        match self {
            Digest::BoardDeadlines { day, .. }
            | Digest::PlanDeadlines { day, .. }
            | Digest::PlanAgenda { day, .. }
            | Digest::UniToday { day, .. }
            | Digest::UniWeekly { day, .. }
            | Digest::ReadingStreak { day, .. }
            | Digest::ReadingWeekly { day, .. }
            | Digest::JournalReminder { day, .. }
            | Digest::FinanceBills { day, .. }
            | Digest::FinanceMonth { day, .. }
            | Digest::Birthdays { day, .. }
            | Digest::GoalsWeekly { day, .. } => *day,
        }
    }
}

/// Kinds that can be emailed. A streak reminder needs to know whether you've
/// read today, which only the app can tell at the time.
pub const EMAIL_KINDS: &[&str] =
    &["project_board.deadlines", "daily_plan.deadlines", "daily_plan.agenda", "uni.today", "uni.weekly", "reading.weekly", "journal.reminder", "birthdays.upcoming", "goals.weekly"];

/// Someone's birthday or anniversary, on the day it next comes round.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BirthdayItem {
    pub name: String,
    /// "birthday" or "anniversary".
    pub occasion: String,
    pub date: NaiveDate,
    /// The age they turn (or years married), when the year's known.
    pub turning: Option<i32>,
    /// Days from the digest's day: 0 for today.
    pub days: i32,
    /// Gift ideas saved, not given yet.
    pub ideas: u32,
}

impl BirthdayItem {
    /// "Sam's birthday", "Mum & Dad's anniversary".
    pub fn what(&self) -> String {
        format!("{}'s {}", self.name, if self.occasion == "anniversary" { "anniversary" } else { "birthday" })
    }

    /// "turns 30", "25 years", or nothing.
    pub fn milestone(&self) -> Option<String> {
        let n = self.turning?;
        Some(if self.occasion == "anniversary" { format!("{n} {}", plural(n as usize, "year", "years")) } else { format!("turns {n}") })
    }
}

/// A goal, as the weekly check-in shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GoalItem {
    pub title: String,
    /// An emoji.
    pub icon: String,
    /// 0 to 100.
    pub percent: f64,
    /// "ahead", "on_track" or "behind", for goals with a deadline.
    pub pace: Option<String>,
    /// Where it's got to, written out: "£2,300 of £5,000", "3 of 5 milestones".
    pub progress: String,
    pub due: Option<NaiveDate>,
}

/// A recurring item to confirm, with its amount already written out.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Bill {
    pub name: String,
    pub amount: String,
    pub day: NaiveDate,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Deadline {
    pub title: String,
    /// Where it's from, e.g. the project's name. May be empty.
    pub context: String,
    /// A palette name ("blue", "green"…), when it has one.
    pub color: Option<String>,
    pub due: NaiveDate,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgendaItem {
    /// Minutes after midnight, local time. None for all-day events.
    pub start: Option<i32>,
    pub minutes: i32,
    pub title: String,
    /// A calendar event (rather than a block you planned).
    pub event: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LectureItem {
    pub title: String,
    pub module: String,
    /// A palette name.
    pub color: String,
    pub day: Option<NaiveDate>,
    pub recorded: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModuleProgress {
    pub name: String,
    pub color: String,
    pub caught_up: u32,
    pub lectures: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookProgress {
    pub title: String,
    pub authors: String,
    /// 0 to 100, when the length is known.
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Goal {
    pub finished: i32,
    pub target: Option<i32>,
    pub year: i32,
}

/// An email the server sends at `send_at`, unless a newer plan drops it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlannedEmail {
    /// Stable for the same notification, e.g. `uni.today:2026-10-27`, so a
    /// new plan updates it rather than adding a second.
    pub key: String,
    pub send_at: DateTime<Utc>,
    pub digest: Digest,
}

/// Body of `PUT NOTIFY_EMAILS`: every email still to come, replacing the
/// last plan. Emails already sent aren't sent again.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlanEmails {
    pub emails: Vec<PlannedEmail>,
    /// Kinds the user switched email back on for since unsubscribing by link.
    #[serde(default)]
    pub resubscribe: Vec<String>,
}

/// What `PUT NOTIFY_EMAILS` returns: kinds unsubscribed from by the link in
/// an email, so the app can switch them off in its settings too.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PlanResult {
    pub unsubscribed: Vec<Unsubscribed>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Unsubscribed {
    pub kind: String,
    pub at: DateTime<Utc>,
}

/// Most emails in one plan: a week of everything comes to about 40.
pub const MAX_PLANNED: usize = 80;
/// Longest list in one digest; the app sends the most urgent first.
pub const MAX_DIGEST_ITEMS: usize = 25;

impl Digest {
    /// A title and a one-line body: the in-app and desktop notification, and
    /// the email's subject (the title) and preview (the body).
    pub fn headline(&self) -> (String, String) {
        match self {
            Digest::BoardDeadlines { day, items } | Digest::PlanDeadlines { day, items } => {
                let noun = if matches!(self, Digest::BoardDeadlines { .. }) { ("card", "cards") } else { ("task", "tasks") };
                let overdue = items.iter().filter(|d| d.due < *day).count();
                let today = items.iter().filter(|d| d.due == *day).count();
                let later = items.len() - overdue - today;
                let parts: Vec<String> = [(overdue, "overdue"), (today, "due today"), (later, "due tomorrow")]
                    .into_iter()
                    .filter(|(n, _)| *n > 0)
                    .map(|(n, what)| format!("{n} {what}"))
                    .collect();
                let title = format!("{} {}: {}", items.len(), plural(items.len(), noun.0, noun.1), parts.join(", "));
                (title, list(items.iter().map(|d| d.title.as_str())))
            }
            Digest::PlanAgenda { items, focus, .. } => {
                let title = match items.len() {
                    0 => format!("Your day: {} top {}", focus.len(), plural(focus.len(), "priority", "priorities")),
                    n => format!("Your day: {n} {} planned", plural(n, "thing", "things")),
                };
                let first = items.iter().find(|i| i.start.is_some()).map(|i| format!("First up: {} at {}", i.title, clock(i.start.unwrap_or(0))));
                let top = focus.first().map(|f| format!("Top priority: {f}"));
                (title, [first, top].into_iter().flatten().collect::<Vec<_>>().join(" · "))
            }
            Digest::UniToday { lectures, behind, .. } => {
                let title = format!("{} {} today", lectures.len(), plural(lectures.len(), "lecture", "lectures"));
                let mut body = list(lectures.iter().map(|l| l.title.as_str()));
                if *behind > 0 {
                    body.push_str(&format!(" · {behind} to catch up on"));
                }
                (title, body)
            }
            Digest::UniWeekly { week, modules, behind, .. } => {
                let (caught_up, total): (u32, u32) = modules.iter().fold((0, 0), |(c, t), m| (c + m.caught_up, t + m.lectures));
                let title = match week {
                    Some(w) => format!("Week {w} at uni: {caught_up} of {total} caught up"),
                    None => format!("Your week at uni: {caught_up} of {total} caught up"),
                };
                let body = if behind.is_empty() {
                    "You're all caught up. Nice work.".to_owned()
                } else {
                    format!("{} behind: {}", behind.len(), list(behind.iter().map(|l| l.title.as_str())))
                };
                (title, body)
            }
            Digest::ReadingStreak { streak, book, .. } => (
                format!("Keep your {streak}-day reading streak going"),
                match book {
                    Some(b) => format!("You haven't read yet today. A few pages of {b} will do it."),
                    None => "You haven't read yet today. A few pages will do it.".to_owned(),
                },
            ),
            Digest::JournalReminder { streak, prompt, .. } => (
                if *streak > 0 { format!("Keep your {streak}-day journal streak going") } else { "A minute to write today?".to_owned() },
                format!("Today's prompt: {prompt}"),
            ),
            Digest::FinanceBills { day, bills } => {
                let title = format!("{} to confirm: {}", plural(bills.len(), "1 recurring item", &format!("{} recurring items", bills.len())), list(bills.iter().map(|b| b.name.as_str())));
                let body = bills.iter().take(3).map(|b| format!("{} {}{}", b.name, b.amount, if b.day < *day { " (overdue)" } else { "" })).collect::<Vec<_>>().join(" · ");
                (title, body)
            }
            Digest::FinanceMonth { month, spent, income, over, .. } => (
                format!("{month}: spent {spent}"),
                if over.is_empty() { format!("Income {income} · within your budgets") } else { format!("Income {income} · over budget in {}", list(over.iter().map(String::as_str))) },
            ),
            Digest::Birthdays { today, soon, .. } => birthdays_headline(today, soon),
            Digest::GoalsWeekly { goals, .. } => {
                let on = goals.iter().filter(|g| matches!(g.pace.as_deref(), Some("on_track" | "ahead"))).count();
                let behind: Vec<&GoalItem> = goals.iter().filter(|g| g.pace.as_deref() == Some("behind")).collect();
                let title = if on + behind.len() == 0 {
                    format!("Your {} {} this week", goals.len(), plural(goals.len(), "goal", "goals"))
                } else {
                    let mut parts = Vec::new();
                    if on > 0 {
                        parts.push(format!("{on} on track"));
                    }
                    if !behind.is_empty() {
                        parts.push(format!("{} behind", behind.len()));
                    }
                    format!("Your goals: {}", parts.join(", "))
                };
                let body = if behind.is_empty() {
                    goals.iter().take(3).map(|g| format!("{} {}%", g.title, g.percent.round())).collect::<Vec<_>>().join(" · ")
                } else {
                    format!("Behind: {}", list(behind.iter().map(|g| g.title.as_str())))
                };
                (title, body)
            }
            Digest::ReadingWeekly { pages, reading_days, streak, finished, .. } => {
                let mut parts = vec![format!("{reading_days} {} of reading", plural(*reading_days as usize, "day", "days"))];
                if *streak > 1 {
                    parts.push(format!("{streak}-day streak"));
                }
                if !finished.is_empty() {
                    parts.push(format!("finished {}", list(finished.iter().map(String::as_str))));
                }
                (format!("Your reading week: {pages} {}", plural(*pages as usize, "page", "pages")), parts.join(" · "))
            }
        }
    }
}

fn birthdays_headline(today: &[BirthdayItem], soon: &[BirthdayItem]) -> (String, String) {
    let when = |b: &BirthdayItem| match b.days {
        0 => "today".to_owned(),
        1 => "tomorrow".to_owned(),
        n => format!("in {n} days"),
    };
    let about = |b: &BirthdayItem| match b.milestone() {
        Some(m) if b.occasion == "anniversary" => format!("{}: {m}", b.name),
        Some(m) => format!("{} {m}", b.name),
        None => b.what(),
    };
    let emoji = |b: &BirthdayItem| if b.occasion == "anniversary" { "💍" } else { "🎂" };
    let title = match (today, soon) {
        ([one], _) => format!("{} It's {} today", emoji(one), one.what()),
        ([first, ..], _) => format!("{} {} celebrations today: {}", emoji(first), today.len(), list(today.iter().map(|b| b.name.as_str()))),
        ([], [one]) => format!("{} is {}", one.what(), when(one)),
        ([], _) => format!("{} coming up: {}", plural(soon.len(), "1 birthday", &format!("{} birthdays", soon.len())), list(soon.iter().map(|b| b.name.as_str()))),
    };
    let mut parts: Vec<String> = today.iter().filter(|b| b.turning.is_some()).map(about).collect();
    parts.extend(soon.iter().map(|b| format!("{} {}", about(b), when(b))));
    let ideas: u32 = today.iter().chain(soon).map(|b| b.ideas).sum();
    if ideas > 0 {
        parts.push(format!("{ideas} gift {} saved", plural(ideas as usize, "idea", "ideas")));
    }
    (title, parts.join(" · "))
}

fn plural<'a>(n: usize, one: &'a str, many: &'a str) -> &'a str {
    if n == 1 { one } else { many }
}

/// "A, B, C and 2 more".
fn list<'a>(names: impl Iterator<Item = &'a str>) -> String {
    let names: Vec<&str> = names.collect();
    match names.len() {
        0 => String::new(),
        1..=3 => names.join(", "),
        n => format!("{} and {} more", names[..3].join(", "), n - 3),
    }
}

/// "09:30" from minutes after midnight.
pub fn clock(minute: i32) -> String {
    format!("{:02}:{:02}", minute.div_euclid(60) % 24, minute.rem_euclid(60))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, d).unwrap()
    }

    #[test]
    fn deadlines_say_what_is_overdue_and_what_is_due() {
        let item = |title: &str, due| Deadline { title: title.into(), context: "Launch".into(), color: None, due };
        let digest = Digest::BoardDeadlines { day: day(27), items: vec![item("Fix login", day(25)), item("Ship", day(27)), item("Write post", day(28))] };
        assert_eq!(digest.headline(), ("3 cards: 1 overdue, 1 due today, 1 due tomorrow".into(), "Fix login, Ship, Write post".into()));
        assert_eq!(digest.kind(), "project_board.deadlines");
    }

    #[test]
    fn goals_say_what_is_behind() {
        let g = |title: &str, pace: Option<&str>| GoalItem { title: title.into(), icon: "🎯".into(), percent: 40.0, pace: pace.map(Into::into), progress: "2 of 5".into(), due: None };
        let d = Digest::GoalsWeekly { day: day(25), goals: vec![g("Run 500 km", Some("behind")), g("Save £5k", Some("on_track")), g("Learn Spanish", None)] };
        assert_eq!(d.headline(), ("Your goals: 1 on track, 1 behind".into(), "Behind: Run 500 km".into()));
        assert_eq!(d.kind(), "goals.weekly");
    }

    #[test]
    fn birthdays_say_whose_and_when() {
        let b = |name: &str, occasion: &str, turning, days, ideas| BirthdayItem { name: name.into(), occasion: occasion.into(), date: day(27), turning, days, ideas };
        let one = Digest::Birthdays { day: day(27), today: vec![b("Sam", "birthday", Some(30), 0, 2)], soon: vec![b("Mum & Dad", "anniversary", Some(25), 7, 0)] };
        assert_eq!(one.headline(), ("🎂 It's Sam's birthday today".into(), "Sam turns 30 · Mum & Dad: 25 years in 7 days · 2 gift ideas saved".into()));
        let ahead = Digest::Birthdays { day: day(27), today: vec![], soon: vec![b("Alex", "birthday", None, 1, 0)] };
        assert_eq!(ahead.headline(), ("Alex's birthday is tomorrow".into(), "Alex's birthday tomorrow".into()));
    }

    #[test]
    fn digests_round_trip_with_their_kind() {
        let digest = Digest::ReadingStreak { day: day(27), streak: 5, book: Some("Dune".into()) };
        let json = serde_json::to_value(&digest).unwrap();
        assert_eq!(json["kind"], "reading.streak");
        assert_eq!(serde_json::from_value::<Digest>(json).unwrap(), digest);
        assert_eq!(digest.headline().0, "Keep your 5-day reading streak going");
    }
}
