//! Notification emails: one design per kind, in the colours of the extension
//! it's from. Built from tables with inline styles, which is what email
//! clients (Gmail, Outlook) reliably render. Everything from the user is
//! escaped.

use axiom_protocol::notify::{AgendaItem, BirthdayItem, Deadline, Digest, GoalItem, LectureItem, ModuleProgress, clock};
use chrono::{Datelike, Days, NaiveDate, Weekday};

use crate::mail::Email;

/// An extension's look in email.
struct Look {
    extension: &'static str,
    emoji: &'static str,
    /// Its colour (the light theme's), and a pale tint of it for backgrounds.
    accent: &'static str,
    tint: &'static str,
    /// The kind's name, for "you get this because … is on".
    what: &'static str,
}

fn look(kind: &str) -> Look {
    let (extension, emoji, accent, tint) = match kind.split('.').next().unwrap_or_default() {
        "project_board" => ("Project Board", "📋", "#3569b3", "#e8eff9"),
        "daily_plan" => ("Daily Plan", "☀️", "#956515", "#f7efe0"),
        "uni" => ("University", "🎓", "#7954b3", "#f0eaf8"),
        "journal" => ("Journal", "📓", "#a84d6b", "#f8e9ee"),
        "birthdays" => ("Birthdays", "🎂", "#a8479a", "#f7e8f4"),
        "goals" => ("Goals", "🎯", "#2f6fa8", "#e6f0f9"),
        _ => ("Reading Tracker", "📖", "#237c79", "#e3f2f0"),
    };
    let what = match kind {
        "project_board.deadlines" => "deadline reminders",
        "daily_plan.deadlines" => "deadline reminders",
        "daily_plan.agenda" => "morning agenda",
        "uni.today" => "today's lectures",
        "uni.weekly" => "weekly summary",
        "journal.reminder" => "evening reminder",
        "birthdays.upcoming" => "birthday reminder",
        "goals.weekly" => "weekly check-in",
        _ => "weekly recap",
    };
    Look { extension, emoji, accent, tint, what }
}

/// Palette names from the app, as colours that read on white.
fn color(name: Option<&str>) -> &'static str {
    match name.unwrap_or_default() {
        "blue" => "#3b82f6",
        "sky" => "#0ea5e9",
        "teal" => "#14b8a6",
        "green" => "#22c55e",
        "lime" => "#84cc16",
        "yellow" => "#eab308",
        "amber" => "#f59e0b",
        "orange" => "#f97316",
        "red" => "#ef4444",
        "pink" => "#ec4899",
        "purple" => "#8b5cf6",
        "slate" => "#64748b",
        _ => "#8a8478",
    }
}

const FONT: &str = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK: &str = "#1f1d1a";
const DIM: &str = "#6b665d";
const FAINT: &str = "#9a958b";
const LINE: &str = "#ebe6dd";
const OVERDUE: &str = "#c2410c";

pub fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;")
}

/// "Tuesday 27 October".
fn long_day(day: NaiveDate) -> String {
    day.format("%A %-d %B").to_string()
}

/// "Tue 27 Oct".
fn short_day(day: NaiveDate) -> String {
    day.format("%a %-d %b").to_string()
}

/// The email for a digest, with a one-click unsubscribe link.
pub fn render(to: &str, digest: &Digest, unsubscribe: &str) -> Email {
    let kind = digest.kind();
    let look = look(kind);
    let (subject, preview) = digest.headline();
    let (body, text) = match digest {
        Digest::BoardDeadlines { day, items } => deadlines(&look, *day, items),
        Digest::PlanDeadlines { day, items } => deadlines(&look, *day, items),
        Digest::PlanAgenda { day, items, focus } => agenda(&look, *day, items, focus),
        Digest::UniToday { day, lectures, behind } => uni_today(&look, *day, lectures, *behind),
        Digest::UniWeekly { day, term, week, modules, behind } => uni_weekly(&look, *day, term, *week, modules, behind),
        Digest::JournalReminder { streak, prompt, .. } => journal_reminder(&look, *streak, prompt),
        Digest::Birthdays { today, soon, .. } => birthdays(&look, today, soon),
        Digest::GoalsWeekly { day, goals } => goals_weekly(&look, *day, goals),
        Digest::ReadingWeekly { day, pages, minutes, reading_days, streak, finished, books, goal } => {
            reading_weekly(&look, *day, *pages, *minutes, *reading_days, *streak, finished, books, goal.as_ref())
        }
        // Not emailed (see EMAIL_KINDS); kept so a bad plan can't crash the sender.
        Digest::ReadingStreak { .. } | Digest::FinanceBills { .. } | Digest::FinanceMonth { .. } | Digest::LearningReview { .. } | Digest::LearningWeekly { .. } => {
            (paragraph(&escape(&preview)), preview.clone())
        }
    };
    let html = layout(&look, &subject, &preview, &body, unsubscribe);
    let text = format!(
        "{subject}\n\n{text}\n\nOpen Axiom to see everything.\n\n\
         You get this because {} emails are on for {} in Axiom. Unsubscribe: {unsubscribe}",
        look.what, look.extension
    );
    Email { to: to.into(), subject, text, html, unsubscribe: Some(unsubscribe.into()), reply_to: None }
}

// ---------- Layout ----------

fn layout(look: &Look, title: &str, preview: &str, body: &str, unsubscribe: &str) -> String {
    let Look { extension, emoji, accent, tint, what } = look;
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f3efe8;font-family:{FONT};color:{INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 14px;font-size:13px;letter-spacing:4px;font-weight:700;color:{INK}">AXIOM</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;border:1px solid {LINE};overflow:hidden">
<div style="height:6px;background:{accent};border-radius:16px 16px 0 0"></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:26px 28px 8px">
<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:{tint};color:{accent};font-size:12px;font-weight:600">{emoji}&nbsp; {extension}</span>
<h1 style="margin:14px 0 6px;font-size:22px;line-height:1.3;font-weight:700;color:{INK}">{title}</h1>
<p style="margin:0;font-size:14px;line-height:1.5;color:{DIM}">{preview}</p>
</td></tr>
<tr><td style="padding:12px 28px 28px">{body}</td></tr></table>
</td></tr>
<tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:{FAINT};text-align:center">
Open Axiom to see everything and tick things off.<br>
You get this because {what} emails are on for {extension}.
<a href="{unsubscribe}" style="color:{FAINT};text-decoration:underline">Unsubscribe</a>, or change it in Axiom under Extensions → {extension} → Notifications.
</td></tr>
</table></td></tr></table></body></html>"#,
        title = escape(title),
        preview = escape(preview),
        unsubscribe = escape(unsubscribe),
    )
}

fn paragraph(html: &str) -> String {
    format!(r#"<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:{INK}">{html}</p>"#)
}

/// A small capitalised label over a group, with a count.
fn heading(label: &str, color: &str, count: Option<usize>) -> String {
    let count = count.map(|n| format!(r#" <span style="color:{FAINT};font-weight:600">{n}</span>"#)).unwrap_or_default();
    format!(
        r#"<div style="margin:18px 0 8px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:{color}">{label}{count}</div>"#
    )
}

/// A list of rows in a soft box.
fn rows(items: &[String]) -> String {
    let joined = items.join(&format!(r#"<tr><td colspan="3" style="border-top:1px solid {LINE};font-size:0;line-height:0">&nbsp;</td></tr>"#));
    format!(
        r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {LINE};border-radius:12px;border-collapse:separate">{joined}</table>"#
    )
}

/// A row: a coloured dot, a title (with a line under it), and something on the right.
fn row(dot: &str, title: &str, under: &str, right: &str) -> String {
    let under = if under.is_empty() { String::new() } else { format!(r#"<div style="font-size:12px;color:{DIM};margin-top:2px">{under}</div>"#) };
    format!(
        r#"<tr><td width="22" valign="top" style="padding:13px 0 13px 14px"><div style="width:9px;height:9px;margin-top:5px;border-radius:50%;background:{dot}"></div></td>
<td style="padding:11px 8px"><div style="font-size:14px;font-weight:600;color:{INK}">{title}</div>{under}</td>
<td align="right" valign="top" style="padding:13px 14px 13px 0;font-size:12px;color:{DIM};white-space:nowrap">{right}</td></tr>"#
    )
}

/// A thin progress bar, `percent` of it filled.
fn bar(percent: f64, color: &str) -> String {
    let filled = percent.clamp(0.0, 100.0).round() as u32;
    let rest = 100 - filled;
    let empty = if rest > 0 { format!(r#"<td width="{rest}%" style="background:{LINE};height:6px;font-size:0;line-height:0">&nbsp;</td>"#) } else { String::new() };
    let full = if filled > 0 { format!(r#"<td width="{filled}%" style="background:{color};height:6px;font-size:0;line-height:0">&nbsp;</td>"#) } else { String::new() };
    format!(
        r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:3px;overflow:hidden"><tr>{full}{empty}</tr></table>"#
    )
}

/// Big numbers side by side.
fn stats(look: &Look, tiles: &[(String, &str)]) -> String {
    let width = 100 / tiles.len().max(1);
    let cells: String = tiles
        .iter()
        .map(|(value, label)| {
            format!(
                r#"<td width="{width}%" align="center" style="padding:14px 6px;background:{tint};border-radius:12px"><div style="font-size:22px;font-weight:700;color:{accent}">{value}</div><div style="font-size:11px;color:{DIM};margin-top:2px">{label}</div></td>"#,
                tint = look.tint,
                accent = look.accent,
            )
        })
        .collect::<Vec<_>>()
        .join(r#"<td width="8" style="font-size:0">&nbsp;</td>"#);
    format!(r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 6px"><tr>{cells}</tr></table>"#)
}

// ---------- Deadlines (Project Board, Daily Plan) ----------

fn deadlines(look: &Look, day: NaiveDate, items: &[Deadline]) -> (String, String) {
    let tomorrow = day + Days::new(1);
    let groups = [
        ("Overdue", OVERDUE, items.iter().filter(|d| d.due < day).collect::<Vec<_>>()),
        ("Due today", look.accent, items.iter().filter(|d| d.due == day).collect()),
        ("Due tomorrow", DIM, items.iter().filter(|d| d.due >= tomorrow).collect()),
    ];
    let mut html = String::new();
    let mut text = String::new();
    for (label, tone, group) in groups.iter().filter(|(_, _, g)| !g.is_empty()) {
        html.push_str(&heading(label, tone, Some(group.len())));
        let lines: Vec<String> = group
            .iter()
            .map(|d| {
                let right = if d.due < day {
                    let late = (day - d.due).num_days();
                    format!(r#"<span style="color:{OVERDUE};font-weight:600">{late} day{} late</span>"#, if late == 1 { "" } else { "s" })
                } else {
                    short_day(d.due)
                };
                let dot = d.color.as_deref().map(|c| color(Some(c))).unwrap_or(look.accent);
                row(dot, &escape(&d.title), &escape(&d.context), &right)
            })
            .collect();
        html.push_str(&rows(&lines));
        text.push_str(&format!("{label}:\n"));
        for d in group {
            let context = if d.context.is_empty() { String::new() } else { format!(" ({})", d.context) };
            text.push_str(&format!("  • {}{context}\n", d.title));
        }
    }
    (html, text)
}

// ---------- Agenda (Daily Plan) ----------

fn agenda(look: &Look, day: NaiveDate, items: &[AgendaItem], focus: &[String]) -> (String, String) {
    let mut html = String::new();
    let mut text = String::new();
    if !focus.is_empty() {
        html.push_str(&heading("Top priorities", look.accent, None));
        let cells: String = focus
            .iter()
            .enumerate()
            .map(|(i, f)| {
                format!(
                    r#"<tr><td width="34" valign="top" style="padding:8px 0 8px 12px"><div style="width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:{accent};color:#ffffff;font-size:12px;font-weight:700">{n}</div></td><td style="padding:9px 12px 9px 6px;font-size:14px;font-weight:600;color:{INK}">{title}</td></tr>"#,
                    accent = look.accent,
                    n = i + 1,
                    title = escape(f),
                )
            })
            .collect();
        html.push_str(&format!(
            r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{tint};border-radius:12px">{cells}</table>"#,
            tint = look.tint
        ));
        text.push_str("Top priorities:\n");
        for (i, f) in focus.iter().enumerate() {
            text.push_str(&format!("  {}. {f}\n", i + 1));
        }
    }
    if !items.is_empty() {
        html.push_str(&heading(&long_day(day), DIM, None));
        let lines: Vec<String> = items
            .iter()
            .map(|item| {
                let when = item.start.map(clock).unwrap_or_else(|| "All day".into());
                let length = if item.start.is_some() && item.minutes > 0 { duration(item.minutes) } else { String::new() };
                let tag = if item.event { r#"<span style="font-size:11px;color:#8a8478">&nbsp;📅 calendar</span>"# } else { "" };
                format!(
                    r#"<tr><td width="64" valign="top" style="padding:12px 0 12px 14px;font-size:13px;font-weight:700;color:{accent};font-variant-numeric:tabular-nums">{when}</td>
<td style="padding:12px 0"><div style="border-left:3px solid {bar};padding-left:12px"><div style="font-size:14px;font-weight:600;color:{INK}">{title}{tag}</div><div style="font-size:12px;color:{DIM}">{length}</div></div></td><td width="14"></td></tr>"#,
                    accent = look.accent,
                    bar = if item.event { "#c9c3b8" } else { look.accent },
                    title = escape(&item.title),
                )
            })
            .collect();
        html.push_str(&rows(&lines));
        for item in items {
            let when = item.start.map(clock).unwrap_or_else(|| "All day".into());
            text.push_str(&format!("  {when}  {}\n", item.title));
        }
    }
    (html, text)
}

fn duration(minutes: i32) -> String {
    match (minutes / 60, minutes % 60) {
        (0, m) => format!("{m} min"),
        (h, 0) => format!("{h} h"),
        (h, m) => format!("{h} h {m} min"),
    }
}

// ---------- University ----------

fn lecture_card(item: &LectureItem) -> String {
    let stripe = color(Some(&item.color));
    let recorded = if item.recorded { r#"<span style="font-size:11px;color:#8a8478">🎥 Recorded</span>"# } else { "" };
    let when = item.day.map(short_day).unwrap_or_default();
    format!(
        r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid {LINE};border-left:4px solid {stripe};border-radius:10px"><tr>
<td style="padding:11px 14px"><div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:{stripe}">{module}</div>
<div style="font-size:15px;font-weight:600;color:{INK};margin-top:2px">{title}</div></td>
<td align="right" valign="middle" style="padding:11px 14px;font-size:12px;color:{DIM};white-space:nowrap">{when}<br>{recorded}</td></tr></table>"#,
        module = escape(&item.module),
        title = escape(&item.title),
    )
}

fn uni_today(look: &Look, day: NaiveDate, lectures: &[LectureItem], behind: u32) -> (String, String) {
    let mut html = heading(&long_day(day), look.accent, Some(lectures.len()));
    let mut text = String::new();
    for l in lectures {
        html.push_str(&lecture_card(l));
        text.push_str(&format!("  • {} — {}{}\n", l.module, l.title, if l.recorded { " (recorded)" } else { "" }));
    }
    if behind > 0 {
        let s = if behind == 1 { "" } else { "s" };
        html.push_str(&format!(
            r#"<div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#fdf1e7;color:{OVERDUE};font-size:13px">⏳ You've also got <b>{behind} lecture{s}</b> to catch up on.</div>"#
        ));
        text.push_str(&format!("\nYou've also got {behind} lecture{s} to catch up on.\n"));
    }
    (html, text)
}

fn uni_weekly(look: &Look, day: NaiveDate, term: &str, week: Option<i32>, modules: &[ModuleProgress], behind: &[LectureItem]) -> (String, String) {
    let (caught_up, total): (u32, u32) = modules.iter().fold((0, 0), |(c, t), m| (c + m.caught_up, t + m.lectures));
    let behind_total: u32 = modules.iter().map(|m| m.behind).sum();
    let mut html = stats(
        look,
        &[
            (week.map(|w| w.to_string()).unwrap_or_else(|| "–".into()), "week"),
            (format!("{caught_up}/{total}"), "caught up"),
            (behind_total.to_string(), "behind"),
        ],
    );
    let mut text = format!("{term}, {}\n\n", week.map(|w| format!("week {w}")).unwrap_or_else(|| short_day(day)));
    if !modules.is_empty() {
        html.push_str(&heading("Your modules", look.accent, None));
        for m in modules {
            let percent = if m.lectures > 0 { m.caught_up as f64 / m.lectures as f64 * 100.0 } else { 0.0 };
            let stripe = color(Some(&m.color));
            let late = if m.behind > 0 { format!(r#" · <span style="color:{OVERDUE}">{} behind</span>"#, m.behind) } else { String::new() };
            html.push_str(&format!(
                r#"<div style="margin:0 0 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:13px;font-weight:600;color:{INK};padding-bottom:5px">{name}</td><td align="right" style="font-size:12px;color:{DIM};padding-bottom:5px">{c} of {t}{late}</td></tr></table>{bar}</div>"#,
                name = escape(&m.name),
                c = m.caught_up,
                t = m.lectures,
                bar = bar(percent, stripe),
            ));
            text.push_str(&format!("  {}: {} of {} caught up{}\n", m.name, m.caught_up, m.lectures, if m.behind > 0 { format!(", {} behind", m.behind) } else { String::new() }));
        }
    }
    if behind.is_empty() {
        html.push_str(&format!(
            r#"<div style="margin-top:8px;padding:14px;border-radius:10px;background:{tint};color:{accent};font-size:14px;font-weight:600;text-align:center">🎉 All caught up. Enjoy your weekend.</div>"#,
            tint = look.tint,
            accent = look.accent
        ));
    } else {
        html.push_str(&heading("Still to catch up on", OVERDUE, Some(behind.len())));
        for l in behind {
            html.push_str(&lecture_card(l));
        }
        text.push_str("\nStill to catch up on:\n");
        for l in behind {
            text.push_str(&format!("  • {} — {}\n", l.module, l.title));
        }
    }
    (html, text)
}

// ---------- Reading ----------

#[allow(clippy::too_many_arguments)]
fn reading_weekly(
    look: &Look,
    day: NaiveDate,
    pages: i32,
    minutes: i32,
    reading_days: i32,
    streak: i32,
    finished: &[String],
    books: &[axiom_protocol::notify::BookProgress],
    goal: Option<&axiom_protocol::notify::Goal>,
) -> (String, String) {
    let time = if minutes >= 60 { format!("{}h", (minutes as f64 / 60.0).round() as i32) } else { format!("{minutes}m") };
    let mut tiles = vec![(pages.to_string(), "pages"), (format!("{reading_days}/7"), "days read")];
    if minutes > 0 {
        tiles.push((time, "listening & reading"));
    }
    tiles.push((format!("{streak}🔥"), "day streak"));
    let mut html = stats(look, &tiles);
    let mut text = format!("Week ending {}: {pages} pages, {reading_days} of 7 days, {streak}-day streak.\n", short_day(day));

    if !finished.is_empty() {
        html.push_str(&heading("Finished this week", look.accent, Some(finished.len())));
        for f in finished {
            html.push_str(&format!(
                r#"<div style="margin:0 0 6px;padding:10px 14px;border-radius:10px;background:{tint};font-size:14px;font-weight:600;color:{INK}">🎉 {title}</div>"#,
                tint = look.tint,
                title = escape(f)
            ));
        }
        text.push_str(&format!("Finished: {}\n", finished.join(", ")));
    }
    if !books.is_empty() {
        html.push_str(&heading("On the go", DIM, None));
        for b in books {
            let pct = b.percent.map(|p| format!("{}%", p.round() as i32)).unwrap_or_default();
            html.push_str(&format!(
                r#"<div style="margin:0 0 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-bottom:5px"><div style="font-size:14px;font-weight:600;color:{INK}">{title}</div><div style="font-size:12px;color:{DIM}">{authors}</div></td><td align="right" valign="bottom" style="font-size:12px;color:{DIM};padding-bottom:5px">{pct}</td></tr></table>{bar}</div>"#,
                title = escape(&b.title),
                authors = escape(&b.authors),
                bar = bar(b.percent.unwrap_or(0.0), look.accent),
            ));
        }
    }
    if let Some((goal, target)) = goal.and_then(|g| Some((g, g.target.filter(|t| *t > 0)?))) {
        let percent = goal.finished as f64 / target as f64 * 100.0;
        // Where you'd be reading evenly through the year.
        let expected = (day.ordinal() as f64 / 365.0 * target as f64).floor() as i32;
        let pace = if goal.finished >= expected { "on track" } else { "a little behind" };
        html.push_str(&heading(&format!("{} goal", goal.year), look.accent, None));
        html.push_str(&format!(
            r#"<div style="font-size:13px;color:{INK};margin-bottom:6px"><b>{f}</b> of {target} books · {pace}</div>{bar}"#,
            f = goal.finished,
            bar = bar(percent, look.accent),
        ));
        text.push_str(&format!("{} goal: {} of {target} books ({pace}).\n", goal.year, goal.finished));
    }
    if day.weekday() == Weekday::Sun && reading_days == 0 {
        html.push_str(&paragraph("A quiet week. Pick up where you left off: even ten pages counts."));
    }
    (html, text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axiom_protocol::notify::Deadline;

    #[test]
    fn user_text_is_escaped_and_the_link_is_there() {
        let day = NaiveDate::from_ymd_opt(2026, 10, 27).unwrap();
        let digest = Digest::BoardDeadlines {
            day,
            items: vec![Deadline { title: "<script>alert(1)</script>".into(), context: "R&D".into(), color: Some("blue".into()), due: day }],
        };
        let email = render("ada@example.com", &digest, "https://axiom.example/unsubscribe?token=abc");
        assert!(!email.html.contains("<script>"));
        assert!(email.html.contains("&lt;script&gt;") && email.html.contains("R&amp;D"));
        assert!(email.html.contains("https://axiom.example/unsubscribe?token=abc"));
        assert!(email.subject.starts_with("1 card: 1 due today"));
        assert!(email.text.contains("Due today:\n  • <script>alert(1)</script> (R&D)"), "the text part is plain");
    }
}

/// Writes a sample of every email to `EMAIL_PREVIEWS` (a folder), to look at
/// in a browser: `EMAIL_PREVIEWS=<dir> cargo test -p axiom-server previews -- --ignored`.
#[cfg(test)]
mod previews {
    use super::*;
    use axiom_protocol::notify::{AgendaItem, BookProgress, Deadline, Goal, GoalItem, LectureItem, ModuleProgress};

    #[test]
    #[ignore]
    fn previews() {
        let dir = std::path::PathBuf::from(std::env::var("EMAIL_PREVIEWS").expect("set EMAIL_PREVIEWS to a folder"));
        std::fs::create_dir_all(&dir).unwrap();
        let day = NaiveDate::from_ymd_opt(2026, 10, 27).unwrap();
        let ago = |n| day - Days::new(n);
        let ahead = |n| day + Days::new(n);
        let deadline = |title: &str, context: &str, color: &str, due| Deadline { title: title.into(), context: context.into(), color: Some(color.into()), due };
        let lecture = |title: &str, module: &str, color: &str, recorded| LectureItem { title: title.into(), module: module.into(), color: color.into(), day: Some(day), recorded };
        let samples = [
            Digest::BoardDeadlines {
                day,
                items: vec![
                    deadline("Fix the sign-in bug", "Axiom", "blue", ago(2)),
                    deadline("Send the invoice", "Freelance", "green", day),
                    deadline("Review pull request", "Axiom", "blue", day),
                    deadline("Draft launch post", "Marketing", "purple", ahead(1)),
                ],
            },
            Digest::PlanAgenda {
                day,
                items: vec![
                    AgendaItem { start: None, minutes: 0, title: "Mum's birthday".into(), event: true },
                    AgendaItem { start: Some(9 * 60), minutes: 30, title: "Stand-up".into(), event: true },
                    AgendaItem { start: Some(9 * 60 + 30), minutes: 120, title: "Deep work: notifications".into(), event: false },
                    AgendaItem { start: Some(13 * 60), minutes: 60, title: "Gym".into(), event: false },
                    AgendaItem { start: Some(15 * 60), minutes: 90, title: "Algorithms revision".into(), event: false },
                ],
                focus: vec!["Ship the notifications".into(), "Call the bank".into(), "Revise dynamic programming".into()],
            },
            Digest::UniToday {
                day,
                lectures: vec![lecture("Lecture 11: Dynamic programming", "COMP1001 Algorithms", "blue", true), lecture("Seminar 5", "MATH2002 Linear Algebra", "purple", false)],
                behind: 3,
            },
            Digest::UniWeekly {
                day,
                term: "Year 2 · Autumn".into(),
                week: Some(6),
                modules: vec![
                    ModuleProgress { name: "COMP1001 Algorithms".into(), color: "blue".into(), caught_up: 10, lectures: 12, behind: 1 },
                    ModuleProgress { name: "MATH2002 Linear Algebra".into(), color: "purple".into(), caught_up: 6, lectures: 6, behind: 0 },
                    ModuleProgress { name: "PHYS1010 Mechanics".into(), color: "orange".into(), caught_up: 4, lectures: 8, behind: 2 },
                ],
                behind: vec![lecture("Lecture 9: Graphs", "COMP1001 Algorithms", "blue", true), lecture("Lecture 7: Momentum", "PHYS1010 Mechanics", "orange", true)],
            },
            Digest::ReadingWeekly {
                day,
                pages: 186,
                minutes: 95,
                reading_days: 5,
                streak: 12,
                finished: vec!["Project Hail Mary".into()],
                books: vec![
                    BookProgress { title: "Dune".into(), authors: "Frank Herbert".into(), percent: Some(42.0) },
                    BookProgress { title: "Atomic Habits".into(), authors: "James Clear".into(), percent: Some(80.0) },
                ],
                goal: Some(Goal { finished: 19, target: Some(24), year: 2026 }),
            },
            Digest::GoalsWeekly {
                day,
                goals: vec![
                    GoalItem { title: "Save for a house deposit".into(), icon: "💰".into(), percent: 46.0, pace: Some("on_track".into()), progress: "£2,300 of £5,000".into(), due: Some(ahead(65)) },
                    GoalItem { title: "Run 500 km this year".into(), icon: "💪".into(), percent: 61.0, pace: Some("behind".into()), progress: "305 km of 500 km".into(), due: Some(ahead(65)) },
                    GoalItem { title: "Launch the side project".into(), icon: "💼".into(), percent: 60.0, pace: Some("ahead".into()), progress: "3 of 5 milestones".into(), due: Some(ahead(30)) },
                    GoalItem { title: "Learn to cook 10 dishes".into(), icon: "🎉".into(), percent: 20.0, pace: None, progress: "2 of 10 dishes".into(), due: None },
                ],
            },
            Digest::Birthdays {
                day,
                today: vec![BirthdayItem { name: "Sam".into(), occasion: "birthday".into(), date: day, turning: Some(30), days: 0, ideas: 2 }],
                soon: vec![
                    BirthdayItem { name: "Mum & Dad".into(), occasion: "anniversary".into(), date: ahead(7), turning: Some(25), days: 7, ideas: 0 },
                    BirthdayItem { name: "Alex".into(), occasion: "birthday".into(), date: ahead(14), turning: None, days: 14, ideas: 1 },
                ],
            },
        ];
        let mut index = String::from("<!doctype html><meta charset=utf-8><title>Axiom emails</title><body style=\"font-family:sans-serif;padding:24px\"><h1>Axiom notification emails</h1><ul>");
        for digest in samples {
            let email = render("ada@example.com", &digest, "https://axiom.example/unsubscribe");
            let file = format!("{}.html", digest.kind());
            std::fs::write(dir.join(&file), &email.html).unwrap();
            index.push_str(&format!("<li><a href=\"{file}\">{}</a>: {}</li>", digest.kind(), escape(&email.subject)));
        }
        let plan = Digest::PlanDeadlines { day, items: vec![deadline("Renew passport", "", "gray", ago(1)), deadline("Pay rent", "", "gray", ahead(1))] };
        std::fs::write(dir.join("daily_plan.deadlines.html"), render("ada@example.com", &plan, "https://axiom.example/unsubscribe").html).unwrap();
        index.push_str("<li><a href=\"daily_plan.deadlines.html\">daily_plan.deadlines</a></li></ul>");
        std::fs::write(dir.join("index.html"), index).unwrap();
    }
}

// ---------- Journal ----------

/// A gentle nudge: the prompt as a quote, and the streak. Nothing written in
/// the journal is ever in it (that's end-to-end encrypted).
fn journal_reminder(look: &Look, streak: i32, prompt: &str) -> (String, String) {
    let mut html = format!(
        r#"<div style="margin:6px 0 16px;padding:18px 20px;border-left:4px solid {accent};background:{tint};border-radius:0 12px 12px 0">
<div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:{accent};margin-bottom:6px">Tonight's prompt</div>
<div style="font-size:17px;line-height:1.45;font-style:italic;color:{INK}">“{prompt}”</div></div>"#,
        accent = look.accent,
        tint = look.tint,
        prompt = escape(prompt),
    );
    let mut text = format!("Tonight's prompt: {prompt}\n");
    if streak > 0 {
        let s = if streak == 1 { "" } else { "s" };
        html.push_str(&stats(look, &[(format!("{streak}🔥"), "day streak")]));
        html.push_str(&paragraph(&format!("You've written {streak} day{s} in a row. A few lines tonight keeps it going.")));
        text.push_str(&format!("\nYou've written {streak} day{s} in a row. A few lines tonight keeps it going.\n"));
    } else {
        html.push_str(&paragraph("Even two sentences count. Open Axiom and start with the prompt, or with how today went."));
        text.push_str("\nEven two sentences count.\n");
    }
    (html, text)
}

// ---------- Birthdays ----------

/// Today's people each get a card of their own, with what they're turning;
/// what's coming up is a list with countdowns.
fn birthdays(look: &Look, today: &[BirthdayItem], soon: &[BirthdayItem]) -> (String, String) {
    let mut html = String::new();
    let mut text = String::new();
    for b in today {
        let emoji = if b.occasion == "anniversary" { "💍" } else { "🎂" };
        let milestone = b.milestone().map(|m| format!(r#"<div style="margin-top:4px;font-size:15px;font-weight:600;color:{accent}">{}</div>"#, escape(&cap(&m)), accent = look.accent)).unwrap_or_default();
        let ideas = gift_line(b.ideas).map(|g| format!(r#"<div style="margin-top:10px;font-size:12px;color:{DIM}">🎁 {g}</div>"#)).unwrap_or_default();
        html.push_str(&format!(
            r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 12px;background:{tint};border-radius:14px"><tr><td align="center" style="padding:22px 18px">
<div style="font-size:40px;line-height:1">{emoji}</div>
<div style="margin-top:10px;font-size:20px;font-weight:700;color:{INK}">{what}</div>{milestone}{ideas}</td></tr></table>"#,
            tint = look.tint,
            what = escape(&b.what()),
        ));
        text.push_str(&format!("{emoji} Today: {}{}
", b.what(), b.milestone().map(|m| format!(" ({m})")).unwrap_or_default()));
    }
    if !soon.is_empty() {
        html.push_str(&heading("Coming up", look.accent, Some(soon.len())));
        let lines: Vec<String> = soon
            .iter()
            .map(|b| {
                let when = if b.days == 1 { "Tomorrow".to_owned() } else { format!("In {} days", b.days) };
                let under = [Some(short_day(b.date)), b.milestone(), gift_line(b.ideas)].into_iter().flatten().collect::<Vec<_>>().join(" · ");
                row(look.accent, &escape(&b.what()), &escape(&under), &format!(r#"<span style="font-weight:600;color:{}">{when}</span>"#, look.accent))
            })
            .collect();
        html.push_str(&rows(&lines));
        text.push_str("Coming up:
");
        for b in soon {
            text.push_str(&format!("  • {} on {} ({} days)
", b.what(), short_day(b.date), b.days));
        }
    }
    if today.is_empty() {
        html.push_str(&paragraph("Time to sort a card or a present. Your gift ideas are saved in Axiom."));
    }
    (html, text)
}

fn gift_line(ideas: u32) -> Option<String> {
    (ideas > 0).then(|| format!("{ideas} gift {} saved", if ideas == 1 { "idea" } else { "ideas" }))
}

fn cap(text: &str) -> String {
    let mut c = text.chars();
    c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
}

// ---------- Goals ----------

/// The week's check-in: how many are on pace, then each goal with a bar and
/// where it should be.
fn goals_weekly(look: &Look, day: NaiveDate, goals: &[GoalItem]) -> (String, String) {
    let on = goals.iter().filter(|g| matches!(g.pace.as_deref(), Some("on_track" | "ahead"))).count();
    let behind = goals.iter().filter(|g| g.pace.as_deref() == Some("behind")).count();
    let mut html = stats(look, &[(goals.len().to_string(), "active"), (on.to_string(), "on track"), (behind.to_string(), "behind")]);
    let mut text = format!("{} active, {on} on track, {behind} behind.

", goals.len());
    let cards: Vec<String> = goals
        .iter()
        .map(|g| {
            let (label, tone) = match g.pace.as_deref() {
                Some("ahead") => ("Ahead", "#15803d"),
                Some("on_track") => ("On track", look.accent),
                Some("behind") => ("Behind", OVERDUE),
                _ => ("", DIM),
            };
            let badge = if label.is_empty() { String::new() } else { format!(r#"<span style="font-size:11px;font-weight:700;color:{tone}">{label}</span>"#) };
            let due = g.due.map(|d| {
                let left = (d - day).num_days();
                if left < 0 { format!("Was due {}", short_day(d)) } else { format!("Due {} · {left} days left", short_day(d)) }
            });
            let under = [Some(escape(&g.progress)), due].into_iter().flatten().collect::<Vec<_>>().join(" · ");
            text.push_str(&format!("  {} {}: {}% ({}){}
", g.icon, g.title, g.percent.round(), g.progress, if label.is_empty() { String::new() } else { format!(", {label}") }));
            format!(
                r#"<tr><td style="padding:12px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:14px;font-weight:600;color:{INK}">{icon}&nbsp; {title}</td>
<td align="right" style="white-space:nowrap">{badge} <span style="font-size:13px;font-weight:700;color:{INK};margin-left:6px">{percent}%</span></td></tr></table>
<div style="margin:7px 0 5px">{bar}</div>
<div style="font-size:12px;color:{DIM}">{under}</div></td></tr>"#,
                icon = escape(&g.icon),
                title = escape(&g.title),
                percent = g.percent.round(),
                bar = bar(g.percent, if g.pace.as_deref() == Some("behind") { OVERDUE } else { look.accent }),
            )
        })
        .collect();
    html.push_str(&heading("Your goals", look.accent, None));
    html.push_str(&rows(&cards));
    html.push_str(&paragraph("A few minutes to check in now keeps the week on course. Open Axiom to log progress or tick off a milestone."));
    (html, text)
}
