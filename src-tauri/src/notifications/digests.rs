//! What each notification says, worked out from the extension's data as it
//! stands. None when there's nothing worth saying (no lectures today, no
//! deadlines), so nothing is sent.

use axiom_protocol::notify::{AgendaItem, Bill, BirthdayItem, GoalItem, BookProgress, Deadline, Digest, Goal, LectureItem, MAX_DIGEST_ITEMS, ModuleProgress};
use chrono::{Days, NaiveDate};
use sea_orm::DatabaseConnection;

use crate::error::Result;
use crate::features::{birthdays, daily_plan, finance, goals, journal, learning, project_board, reading, uni};

/// The notification of `kind` for `day`. `lay_out` lets the Daily Plan lay
/// out routine blocks first (only for today and tomorrow; see `runner`).
pub async fn digest(db: &DatabaseConnection, kind: &str, day: NaiveDate, lay_out: bool) -> Result<Option<Digest>> {
    let tomorrow = day + Days::new(1);
    Ok(match kind {
        "project_board.deadlines" => {
            let items: Vec<Deadline> = project_board::service::deadline_cards(db, tomorrow)
                .await?
                .into_iter()
                .filter_map(|c| Some(Deadline { due: c.due_date?, title: c.title, context: c.project_name, color: Some(c.project_color) }))
                .take(MAX_DIGEST_ITEMS)
                .collect();
            (!items.is_empty()).then_some(Digest::BoardDeadlines { day, items })
        }
        "daily_plan.deadlines" => {
            let items: Vec<Deadline> = daily_plan::service::deadline_tasks(db, tomorrow)
                .await?
                .into_iter()
                .map(|(title, due)| Deadline { title, context: String::new(), color: None, due })
                .take(MAX_DIGEST_ITEMS)
                .collect();
            (!items.is_empty()).then_some(Digest::PlanDeadlines { day, items })
        }
        "daily_plan.agenda" => {
            let (items, focus) = daily_plan::service::agenda(db, day, lay_out).await?;
            let items: Vec<AgendaItem> = items
                .into_iter()
                .map(|(start, minutes, title, event)| AgendaItem { start, minutes, title, event })
                .take(MAX_DIGEST_ITEMS)
                .collect();
            (!items.is_empty() || !focus.is_empty()).then_some(Digest::PlanAgenda { day, items, focus })
        }
        "uni.today" => {
            let summary = uni::service::summary(db, day).await?;
            let lectures: Vec<LectureItem> = summary.upcoming.iter().filter(|h| h.days == 0).map(lecture).take(MAX_DIGEST_ITEMS).collect();
            (!lectures.is_empty()).then_some(Digest::UniToday { day, lectures, behind: summary.behind.len() as u32 })
        }
        "uni.weekly" => {
            let summary = uni::service::summary(db, day).await?;
            let Some(term) = summary.terms.iter().find(|t| Some(&t.term.id) == summary.current.as_ref()) else { return Ok(None) };
            if summary.modules.iter().all(|m| m.lectures == 0) {
                return Ok(None);
            }
            Some(Digest::UniWeekly {
                day,
                term: term.term.name.clone(),
                week: term.week,
                modules: summary
                    .modules
                    .iter()
                    .filter(|m| m.lectures > 0)
                    .map(|m| ModuleProgress {
                        name: label(&m.module.code, &m.module.name),
                        color: m.module.color.clone(),
                        caught_up: m.caught_up,
                        lectures: m.lectures,
                        behind: m.behind,
                    })
                    .collect(),
                behind: summary.behind.iter().map(lecture).take(MAX_DIGEST_ITEMS).collect(),
            })
        }
        "reading.streak" => {
            let summary = reading::service::summary(db, day).await?;
            let due = summary.streak > 0 && !reading::service::read_on(db, day).await?;
            due.then(|| Digest::ReadingStreak { day, streak: summary.streak, book: summary.reading.first().map(|b| b.book.title.clone()) })
        }
        "reading.weekly" => {
            let summary = reading::service::summary(db, day).await?;
            let (pages, minutes, reading_days, finished) = reading::service::week_recap(db, day).await?;
            let books: Vec<BookProgress> = summary
                .reading
                .iter()
                .map(|b| BookProgress { title: b.book.title.clone(), authors: b.book.authors.clone(), percent: b.percent })
                .take(MAX_DIGEST_ITEMS)
                .collect();
            let quiet = reading_days == 0 && books.is_empty() && finished.is_empty();
            (!quiet).then_some(Digest::ReadingWeekly {
                day,
                pages,
                minutes,
                reading_days,
                streak: summary.streak,
                finished,
                books,
                goal: Some(Goal { finished: summary.goal.finished, target: summary.goal.books, year: summary.goal.year }),
            })
        }
        "journal.reminder" => {
            let written = journal::service::on_day(db, day).await?.iter().any(|e| e.words > 0 || e.mood.is_some());
            if written {
                return Ok(None);
            }
            let streak = journal::service::stats(db, day).await?.streak;
            Some(Digest::JournalReminder { day, streak, prompt: journal::service::prompt_for(day).to_owned() })
        }
        "finance.bills" => {
            if finance::service::settings(db).await?.is_none() {
                return Ok(None);
            }
            let bills: Vec<Bill> = finance::service::due(db, day)
                .await?
                .into_iter()
                .filter(|d| d.day <= day)
                .map(|d| Bill { amount: finance::money::display(d.amount.abs(), &d.currency), name: d.name, day: d.day })
                .take(MAX_DIGEST_ITEMS)
                .collect();
            (!bills.is_empty()).then_some(Digest::FinanceBills { day, bills })
        }
        "finance.month" => {
            let Some(settings) = finance::service::settings(db).await? else { return Ok(None) };
            let last = day - Days::new(1);
            let month = format!("{:04}-{:02}", chrono::Datelike::year(&last), chrono::Datelike::month(&last));
            let summary = finance::service::month_summary(db, &month, day).await?;
            if summary.income == 0 && summary.spending == 0 {
                return Ok(None);
            }
            let names: std::collections::HashMap<String, String> =
                finance::service::state(db, day).await?.categories.into_iter().map(|c| (c.id, c.name)).collect();
            let over = summary
                .spending_by_category
                .iter()
                .filter(|c| c.budget.is_some_and(|b| c.total > b))
                .filter_map(|c| names.get(c.category_id.as_ref()?).cloned())
                .collect();
            let home = &settings.home_currency;
            Some(Digest::FinanceMonth {
                day,
                month: last.format("%B").to_string(),
                spent: finance::money::display(summary.spending, home),
                income: finance::money::display(summary.income, home),
                over,
            })
        }
        "goals.weekly" => {
            let items: Vec<GoalItem> = goals::service::list(db, day)
                .await?
                .into_iter()
                .filter(|g| g.goal.status == "active")
                .take(MAX_DIGEST_ITEMS)
                .map(|g| GoalItem {
                    progress: goals::service::progress_text(&g),
                    icon: goals::service::icon_of(&g.goal),
                    title: g.goal.title,
                    percent: g.percent,
                    pace: g.pace.map(|p| p.as_str().to_owned()),
                    due: g.goal.due_date,
                })
                .collect();
            (!items.is_empty()).then_some(Digest::GoalsWeekly { day, goals: items })
        }
        "birthdays.upcoming" => {
            let (on, ahead) = birthdays::service::due(db, day).await?;
            let item = |p: birthdays::types::PersonView| BirthdayItem { name: p.name, occasion: p.occasion, date: p.next, turning: p.turning, days: p.days, ideas: p.ideas };
            let (today, soon): (Vec<BirthdayItem>, Vec<BirthdayItem>) = (on.into_iter().map(item).collect(), ahead.into_iter().map(item).collect());
            (!today.is_empty() || !soon.is_empty()).then_some(Digest::Birthdays { day, today, soon })
        }
        "learning.review" => {
            let summary = learning::service::summary(db, day).await?;
            let units: Vec<String> = summary.reviews.iter().take(MAX_DIGEST_ITEMS).map(|r| r.unit.title.clone()).collect();
            (!units.is_empty()).then_some(Digest::LearningReview { day, units, total: summary.reviews.len() as u32 })
        }
        "learning.weekly" => {
            let summary = learning::service::summary(db, day).await?;
            (summary.week_minutes > 0 || summary.week_units > 0).then_some(Digest::LearningWeekly { day, minutes: summary.week_minutes, units: summary.week_units, streak: summary.streak })
        }
        _ => None,
    })
}

fn lecture(hit: &uni::types::LectureHit) -> LectureItem {
    LectureItem {
        title: hit.lecture.title.clone(),
        module: label(&hit.module_code, &hit.module_name),
        color: hit.module_color.clone(),
        day: hit.lecture.day,
        recorded: hit.lecture.recorded,
    }
}

/// "COMP1001 Algorithms", or just the name when there's no code.
fn label(code: &str, name: &str) -> String {
    if code.is_empty() { name.to_owned() } else { format!("{code} {name}") }
}
