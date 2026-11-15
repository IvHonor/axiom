//! The Playground: friends, and leaderboards where everyone's Lemma stands
//! beside their name.
//!
//! An account's data is end-to-end encrypted, so the server can't count
//! anything itself. Each device works its own numbers out (a week, a month,
//! all time and streaks for every metric) and sends only the metrics the
//! person chose to share. The server keeps those totals, checks they're
//! believable, and ranks them.
//!
//! Unlike the rest of the protocol, these types are camelCase on the wire:
//! the app hands them to React as they arrive, on the desktop and the web.

use chrono::{DateTime, Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

/// How a metric's number reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MetricUnit {
    Count,
    Minutes,
    /// Days on which something happened: at most one a day.
    Days,
}

/// Something people can be ranked on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Metric {
    /// `<area>.<what>`, or `active` for every area together.
    pub id: &'static str,
    /// The area (extension id) it comes from; `axiom` for `active`.
    pub area: &'static str,
    pub unit: MetricUnit,
    /// Fit to compare with strangers: hard to inflate, the same thing for everyone.
    /// The rest (sizes people choose themselves, like tasks) are for friends only.
    pub global: bool,
    /// The most one day can believably add. Anything sent above `cap × days` is refused.
    pub daily_cap: i64,
}

/// Every metric, in the order the app lists them. The app keeps labels and
/// icons (`src/features/playground/metrics.ts`); ids and rules live here.
pub const METRICS: &[Metric] = &[
    Metric { id: "active", area: "axiom", unit: MetricUnit::Days, global: true, daily_cap: 1 },
    Metric { id: "reading.pages", area: "reading", unit: MetricUnit::Count, global: true, daily_cap: 1500 },
    Metric { id: "reading.books", area: "reading", unit: MetricUnit::Count, global: true, daily_cap: 10 },
    Metric { id: "learning.minutes", area: "learning", unit: MetricUnit::Minutes, global: true, daily_cap: 16 * 60 },
    Metric { id: "learning.units", area: "learning", unit: MetricUnit::Count, global: false, daily_cap: 60 },
    Metric { id: "daily_plan.focus", area: "daily_plan", unit: MetricUnit::Minutes, global: true, daily_cap: 16 * 60 },
    Metric { id: "daily_plan.perfect", area: "daily_plan", unit: MetricUnit::Days, global: true, daily_cap: 1 },
    Metric { id: "daily_plan.done", area: "daily_plan", unit: MetricUnit::Count, global: false, daily_cap: 150 },
    Metric { id: "journal.days", area: "journal", unit: MetricUnit::Days, global: true, daily_cap: 1 },
    Metric { id: "goals.checkins", area: "goals", unit: MetricUnit::Count, global: true, daily_cap: 50 },
    Metric { id: "project_board.done", area: "project_board", unit: MetricUnit::Count, global: false, daily_cap: 200 },
    Metric { id: "uni.caught_up", area: "uni", unit: MetricUnit::Count, global: false, daily_cap: 40 },
];

pub fn metric(id: &str) -> Option<&'static Metric> {
    METRICS.iter().find(|m| m.id == id)
}

/// Longest streak the server believes: ten years of days.
pub const MAX_STREAK: u32 = 3650;

// ---------- Handles ----------

pub const MIN_HANDLE: usize = 3;
pub const MAX_HANDLE: usize = 20;

/// Handles nobody can take, so no one passes for Axiom or its staff.
const RESERVED: &[&str] = &["admin", "administrator", "axiom", "lemma", "support", "help", "staff", "team", "official", "moderator", "root", "system", "null", "undefined", "me", "you", "everyone"];

/// `@Ada_L ` → `ada_l`. Handles are compared lowercased.
pub fn normalize_handle(handle: &str) -> String {
    handle.trim().trim_start_matches('@').to_lowercase()
}

/// Returns the message to show if a (normalised) handle can't be used.
pub fn check_handle(handle: &str) -> Result<(), &'static str> {
    if handle.len() < MIN_HANDLE || handle.len() > MAX_HANDLE {
        return Err("Use 3 to 20 characters for your handle.");
    }
    if !handle.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_') {
        return Err("Use only letters, numbers and underscores in your handle.");
    }
    if !handle.as_bytes()[0].is_ascii_lowercase() {
        return Err("Start your handle with a letter.");
    }
    if RESERVED.contains(&handle) || handle.starts_with("axiom") || handle.starts_with("lemma_") {
        return Err("That handle is reserved. Try another.");
    }
    Ok(())
}

/// Friend codes: 8 letters and digits, without ones that look alike.
pub const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
pub const CODE_LEN: usize = 8;

/// `k7q2-m9xd` → `K7Q2M9XD`.
pub fn normalize_friend_code(code: &str) -> String {
    code.chars().filter(char::is_ascii_alphanumeric).map(|c| c.to_ascii_uppercase()).collect()
}

// ---------- Lemma ----------

/// Someone's Lemma as everyone else sees it: its look (`src/features/lemma/look.ts`),
/// name and personality. The app redraws it from these.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LemmaCard {
    /// The `Look` object. Checked by `check_lemma`; the app normalises it again when drawing.
    pub look: serde_json::Map<String, serde_json::Value>,
    /// "" is Lemma.
    pub name: String,
    pub personality: String,
}

pub const MAX_LEMMA_NAME: usize = 24;
pub const PERSONALITIES: &[&str] = &["standard", "cheerful", "calm", "direct", "witty", "coach"];
/// The `Look` fields, so nothing else rides along to other people's screens.
const LOOK_FIELDS: &[&str] = &[
    "glow", "shell", "shape", "accessory", "facewear", "neckwear", "finish", "headwearColor", "facewearColor", "neckwearColor", "holdingColor", "jewelColor", "holding",
];

/// Returns the message to show if the Lemma can't be shown to others.
pub fn check_lemma(lemma: &LemmaCard) -> Result<(), &'static str> {
    if lemma.name.chars().count() > MAX_LEMMA_NAME || lemma.name.chars().any(char::is_control) {
        return Err("Keep your Lemma's name to 24 characters.");
    }
    if !PERSONALITIES.contains(&lemma.personality.as_str()) {
        return Err("That personality isn't one Lemma has.");
    }
    for (key, value) in &lemma.look {
        let plain = value.as_str().is_some_and(|v| (1..=16).contains(&v.len()) && v.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'#' || b == b'-'));
        if !LOOK_FIELDS.contains(&key.as_str()) || !plain {
            return Err("Your Lemma's look couldn't be read. Change it once and try again.");
        }
    }
    Ok(())
}

/// What someone's held item needs: the app hides admin and early-account
/// keepsakes from Lemmas that haven't earned them. Worked out by the server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Perks {
    pub admin: bool,
    pub first_light: bool,
}

/// When First Light stopped being given (see `hasFirstLight` in the app).
pub fn first_light(created_at: DateTime<Utc>) -> bool {
    created_at < DateTime::parse_from_rfc3339("2027-03-21T00:00:00Z").expect("a valid date").with_timezone(&Utc)
}

// ---------- You ----------

/// Someone on a board or in a friends list. Never their email.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub user_id: String,
    pub handle: String,
    /// Their display name, or None to show the handle.
    pub name: Option<String>,
    pub lemma: LemmaCard,
    pub perks: Perks,
    /// Which profile picture they have (it changes when they change it), to
    /// fetch from `PLAYGROUND_AVATAR` once and keep; None without one.
    /// Lists carry this, not the pictures, so a board stays small.
    #[serde(default)]
    pub avatar: Option<String>,
    /// The account asking.
    pub you: bool,
    pub friend: bool,
}

/// You, from `GET PLAYGROUND_ME`: null until you pick a handle. A handle is
/// enough for friends; the boards need `in_playground` too.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaygroundMe {
    pub player: Player,
    /// On the Playground's boards (sharing `shared`), not just friends with people.
    pub in_playground: bool,
    /// On the global boards too, not just your friends'.
    pub global: bool,
    /// The metrics you share (ids from `METRICS`). Only these are ever sent.
    pub shared: Vec<String>,
    /// Anyone with it becomes your friend straight away; make a new one to stop that.
    pub friend_code: String,
    pub joined_at: DateTime<Utc>,
    /// Cheers friends sent you this week (Monday on, UTC).
    pub cheers_this_week: u32,
    /// Friend requests waiting for your answer.
    pub requests: u32,
}

/// Body of `PUT PLAYGROUND_ME`: picking a handle, joining the Playground, or
/// changing how you appear.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlayground {
    /// On the boards. False keeps just the handle and friends (and shares nothing).
    #[serde(default = "yes")]
    pub playground: bool,
    /// Chosen once: after that it must be the same, or the request is refused.
    pub handle: String,
    pub global: bool,
    pub shared: Vec<String>,
    pub lemma: LemmaCard,
}

fn yes() -> bool {
    true
}

/// What `PLAYGROUND_AVATAR` returns.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerAvatar {
    /// A `data:image/...;base64,` URL (see `check_avatar`), or None.
    pub avatar: Option<String>,
}

// ---------- Stats ----------

/// One metric's numbers, as the device worked them out on `PublishStats::today`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricStats {
    pub metric: String,
    /// The Monday of this week.
    pub week_key: NaiveDate,
    pub week: i64,
    pub last_week: i64,
    /// The first of this month.
    pub month_key: NaiveDate,
    pub month: i64,
    pub last_month: i64,
    pub total: i64,
    /// Days in a row up to `streak_through`.
    pub streak: u32,
    pub best_streak: u32,
    /// The streak's last day: today, or yesterday while today's still to come.
    pub streak_through: Option<NaiveDate>,
}

/// Body of `PUT PLAYGROUND_STATS`. Metrics left out keep what was sent before.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishStats {
    /// The device's own date, which its weeks and streaks are counted from.
    pub today: NaiveDate,
    pub stats: Vec<MetricStats>,
}

/// What `PUT PLAYGROUND_STATS` returns.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Published {
    pub saved: u32,
    /// Metrics whose numbers didn't add up; what was there before stays.
    pub refused: Vec<String>,
}

pub fn monday_of(day: NaiveDate) -> NaiveDate {
    day - chrono::Days::new(day.weekday().num_days_from_monday() as u64)
}

pub fn first_of_month(day: NaiveDate) -> NaiveDate {
    day.with_day(1).expect("every month has a first")
}

/// Returns the message to show if the numbers aren't believable for `today`.
pub fn check_stats(stats: &MetricStats, today: NaiveDate) -> Result<&'static Metric, String> {
    let m = metric(&stats.metric).ok_or_else(|| format!("{} isn't something the Playground ranks.", stats.metric))?;
    if stats.week_key != monday_of(today) || stats.month_key != first_of_month(today) {
        return Err("Those numbers are for another week. Check your computer's date.".into());
    }
    let cap = |days: i64| m.daily_cap * days;
    let within = |value: i64, days: i64| (0..=cap(days)).contains(&value);
    let ok = within(stats.week, 7)
        && within(stats.last_week, 7)
        && within(stats.month, 31)
        && within(stats.last_month, 31)
        && within(stats.total, MAX_STREAK as i64)
        && stats.week <= stats.total
        && stats.month <= stats.total
        && stats.streak <= stats.best_streak
        && stats.best_streak <= MAX_STREAK
        && stats.streak_through.is_none_or(|d| d <= today && (today - d).num_days() <= 1 || stats.streak == 0);
    if ok { Ok(m) } else { Err(format!("Some of your {} numbers don't add up, so they weren't shared.", m.id)) }
}

// ---------- Boards ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Period {
    Week,
    Month,
    /// All time.
    All,
    /// Days in a row, as of now.
    Streak,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Scope {
    Friends,
    Global,
}

/// Query of `GET PLAYGROUND_BOARD`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardQuery {
    pub metric: String,
    pub period: Period,
    pub scope: Scope,
    /// The asking device's today: picks the week or month, and which streaks are still alive.
    pub today: NaiveDate,
}

/// One place on a board.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardEntry {
    /// 1 is first. Ties share a rank.
    pub rank: u32,
    pub player: Player,
    pub value: i64,
    /// The same period before (last week, last month); None for all time and streaks.
    pub previous: Option<i64>,
    pub streak: u32,
    pub best_streak: u32,
    pub streak_through: Option<NaiveDate>,
    /// Their device's date when it last sent numbers.
    pub as_of: NaiveDate,
    /// You cheered them today (friends only).
    pub cheered: bool,
}

/// What `GET PLAYGROUND_BOARD` returns.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub metric: String,
    pub period: Period,
    pub scope: Scope,
    /// Best first; the top `BOARD_SIZE` of a global board.
    pub entries: Vec<BoardEntry>,
    /// You, when you're on the board but outside `entries`; or, on a global
    /// board you haven't joined, where you would be (rank only, not listed to others).
    pub you: Option<BoardEntry>,
    /// You're counted on this board (shared, and on global if it's global).
    pub joined: bool,
    /// Everyone on the board.
    pub players: u32,
    /// Who won the period before (week and month boards).
    pub champion: Option<BoardEntry>,
}

/// Most people a global board lists.
pub const BOARD_SIZE: usize = 100;

// ---------- Friends ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub player: Player,
    pub since: DateTime<Utc>,
    /// Their streak of days active, if they share it.
    pub streak: Option<u32>,
    pub streak_through: Option<NaiveDate>,
    pub as_of: Option<NaiveDate>,
    /// You've cheered them today (UTC); one a day.
    pub cheered: bool,
    /// They cheered you today.
    pub cheered_you: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRequest {
    pub player: Player,
    pub sent_at: DateTime<Utc>,
}

/// What `GET PLAYGROUND_FRIENDS` returns.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friends {
    pub friends: Vec<Friend>,
    /// Waiting for your answer.
    pub incoming: Vec<FriendRequest>,
    /// Waiting for theirs.
    pub outgoing: Vec<FriendRequest>,
}

/// Body of `POST PLAYGROUND_FRIENDS`: a handle, or a friend code.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddFriend {
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AddOutcome {
    /// Friends now (a code, or they'd already asked you).
    Friends,
    /// Asked; waiting for them.
    Requested,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Added {
    pub outcome: AddOutcome,
    pub player: Player,
}

/// Most friends one account can have, and most requests it can have waiting.
pub const MAX_FRIENDS: usize = 200;
pub const MAX_PENDING: usize = 50;

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> NaiveDate {
        s.parse().unwrap()
    }

    fn stats(metric: &str) -> MetricStats {
        let today = day("2026-11-13");
        MetricStats {
            metric: metric.into(),
            week_key: monday_of(today),
            week: 40,
            last_week: 70,
            month_key: first_of_month(today),
            month: 120,
            last_month: 300,
            total: 2000,
            streak: 3,
            best_streak: 12,
            streak_through: Some(today),
        }
    }

    #[test]
    fn handles() {
        assert_eq!(normalize_handle(" @Ada_L "), "ada_l");
        assert!(check_handle("ada_l").is_ok());
        for bad in ["ad", "1ada", "ada lovelace", "ada-l", "admin", "axiom_team", &"a".repeat(21)] {
            assert!(check_handle(bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn friend_codes() {
        assert_eq!(normalize_friend_code("k7q2-m9xd"), "K7Q2M9XD");
    }

    #[test]
    fn lemma_looks_carry_only_look_fields() {
        let mut lemma = LemmaCard { personality: "witty".into(), name: "Pixel".into(), ..Default::default() };
        lemma.look.insert("glow".into(), "#2ec4ff".into());
        assert!(check_lemma(&lemma).is_ok());
        lemma.look.insert("onclick".into(), "x".into());
        assert!(check_lemma(&lemma).is_err());
        lemma.look.remove("onclick");
        lemma.look.insert("shape".into(), "<svg>".into());
        assert!(check_lemma(&lemma).is_err());
        lemma.look.remove("shape");
        lemma.personality = "evil".into();
        assert!(check_lemma(&lemma).is_err());
    }

    #[test]
    fn believable_stats_pass() {
        assert!(check_stats(&stats("reading.pages"), day("2026-11-13")).is_ok());
    }

    #[test]
    fn unbelievable_stats_are_refused() {
        let today = day("2026-11-13");
        let mut s = stats("journal.days");
        s.week = 8; // more days than a week has
        assert!(check_stats(&s, today).is_err());
        let mut s = stats("reading.pages");
        s.week_key = day("2026-11-02");
        assert!(check_stats(&s, today).is_err(), "last week's key");
        let mut s = stats("reading.pages");
        s.streak = 20; // longer than the best
        assert!(check_stats(&s, today).is_err());
        let mut s = stats("reading.pages");
        s.streak_through = Some(day("2026-11-01")); // a streak that ended long ago can't still count
        assert!(check_stats(&s, today).is_err());
        assert!(check_stats(&stats("finance.spent"), today).is_err(), "not a metric");
    }
}
