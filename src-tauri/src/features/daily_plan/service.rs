//! The Daily Plan's logic: every query and change, independent of Tauri so
//! it can be tested on its own (see `tests.rs`).
//!
//! Days are passed in by the frontend (`day`, `today`) rather than read from
//! the clock here, so "today" always matches what the user sees.

use chrono::{Datelike, Days, Utc};
use sea_orm::prelude::{Date, Expr};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, Condition, EntityTrait, QueryFilter, QueryOrder,
    Select, Set, TransactionTrait,
};

use super::calendars::events_on;
use super::entities::{block, day, event, routine, settings, task};
use super::parse::{self, DayHint, DueHint};
use super::types::{
    BlockFields, CarryTo, DayDone, DaySlice, RangePlan, DayFields, DayInfo, DayPlan, NextBlock, PlanInsights, QuickAdded, RoutineFields,
    ScheduleResult, Settings, TaskFields, TodaySummary, WeekFocus,
};
use crate::features::project_board::service as board;
use crate::db::new_id;
use crate::error::{Error, Result};

const SETTINGS_ID: &str = "settings";
/// Top priorities per day (the Ivy Lee idea: few, and in order).
pub const MAX_FOCUS: i16 = 3;
const DAY_MINUTES: i32 = 24 * 60;
/// Blocks snap to this on the timeline, and can't be shorter.
const MIN_BLOCK_MINUTES: i32 = 5;
/// A block made from a task with no estimate.
const DEFAULT_BLOCK_MINUTES: i32 = 30;
pub const COLORS: &[&str] = &["blue", "green", "purple", "orange", "red", "pink", "yellow", "gray"];

fn tasks() -> Select<task::Entity> {
    task::Entity::find().filter(task::Column::DeletedAt.is_null())
}

fn blocks() -> Select<block::Entity> {
    block::Entity::find().filter(block::Column::DeletedAt.is_null())
}

fn routines() -> Select<routine::Entity> {
    routine::Entity::find().filter(routine::Column::DeletedAt.is_null())
}

fn days() -> Select<day::Entity> {
    day::Entity::find().filter(day::Column::DeletedAt.is_null())
}

/// Soft-deletes the matching rows, so the deletion syncs.
macro_rules! bury {
    ($entity:ident, $db:expr, $condition:expr) => {
        $entity::Entity::update_many()
            .col_expr($entity::Column::DeletedAt, Expr::value(Some(Utc::now())))
            .col_expr($entity::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter($entity::Column::DeletedAt.is_null())
            .filter($condition)
            .exec($db)
            .await?
    };
}

// ---------- Reading ----------

pub async fn get_day(db: &DatabaseConnection, day: Date, today: Date) -> Result<DayPlan> {
    if day >= today {
        lay_out_routines(db, day).await?;
    }
    let mut day_tasks = tasks().filter(task::Column::Day.eq(day)).order_by_asc(task::Column::Position).all(db).await?;
    day_tasks.sort_by_key(|t| t.focus_rank.unwrap_or(i16::MAX));
    let blocks = blocks()
        .filter(block::Column::Day.eq(day))
        .order_by_asc(block::Column::StartMinute)
        .all(db)
        .await?;
    let events = events_on(db, day).await?;
    let earlier = if day == today {
        tasks()
            .filter(task::Column::Day.lt(today))
            .filter(task::Column::DoneAt.is_null())
            .order_by_asc(task::Column::Day)
            .order_by_asc(task::Column::Position)
            .all(db)
            .await?
    } else {
        Vec::new()
    };
    let mut inbox = tasks()
        .filter(task::Column::Day.is_null())
        .filter(task::Column::DoneAt.is_null())
        .order_by_asc(task::Column::Position)
        .all(db)
        .await?;
    by_deadline(&mut inbox);
    // Due within three days but planned for later or not at all (leftovers
    // from earlier days are listed already).
    let due_soon = if day == today {
        let mut soon = tasks()
            .filter(task::Column::DoneAt.is_null())
            .filter(task::Column::DueDate.lte(today + Days::new(DUE_SOON_DAYS)))
            .filter(Condition::any().add(task::Column::Day.is_null()).add(task::Column::Day.gt(today)))
            .order_by_asc(task::Column::Position)
            .all(db)
            .await?;
        by_deadline(&mut soon);
        soon
    } else {
        Vec::new()
    };
    // Cards from the Project Board: those linked to these tasks, and
    // suggestions that aren't planned anywhere yet.
    let linked: Vec<String> = day_tasks.iter().chain(&earlier).chain(&inbox).filter_map(|t| t.board_task_id.clone()).collect();
    let cards = board::cards_by_id(db, &linked).await?;
    let planned_cards: Vec<String> = tasks()
        .filter(task::Column::BoardTaskId.is_not_null())
        .filter(task::Column::DoneAt.is_null())
        .all(db)
        .await?
        .into_iter()
        .filter_map(|t| t.board_task_id)
        .collect();
    let mut suggestions = if day >= today { board::plannable_cards(db, day).await? } else { Vec::new() };
    suggestions.retain(|c| !planned_cards.contains(&c.id));

    let running = tasks().filter(task::Column::TimerStartedAt.is_not_null()).one(db).await?;
    Ok(DayPlan {
        day,
        tasks: day_tasks,
        blocks,
        events,
        earlier,
        inbox,
        due_soon,
        settings: get_settings(db).await?,
        info: get_day_info(db, day).await?,
        cards,
        suggestions,
        running,
        pace: pace(db, today).await?.0,
    })
}

pub async fn summary(db: &DatabaseConnection, today: Date, now_minute: i32) -> Result<TodaySummary> {
    let plan = get_day(db, today, today).await?;
    let done = plan.tasks.iter().filter(|t| t.done_at.is_some()).count();
    let focus = plan.tasks.iter().filter(|t| t.focus_rank.is_some()).cloned().collect();
    let blocks = plan.blocks.iter().map(|b| (b.start_minute, b.duration_minutes, block_title(b, &plan.tasks)));
    let events = timed(&plan.events).map(|e| (e.start_minute, e.duration_minutes, e.title.clone()));
    let next_block = blocks
        .chain(events)
        .filter(|(start, length, _)| start + length > now_minute)
        .min_by_key(|(start, _, _)| *start)
        .map(|(start_minute, duration_minutes, title)| NextBlock {
            start_minute,
            duration_minutes,
            title,
            in_progress: start_minute <= now_minute,
        });
    Ok(TodaySummary {
        total: plan.tasks.len(),
        done,
        focus,
        next_block,
        planned_minutes: planned_minutes(&plan.tasks, &plan.blocks, &plan.events, &plan.settings),
        available_minutes: plan.settings.day_end_minute - plan.settings.day_start_minute,
        running: plan.running,
    })
}

/// What's planned for a day: every task's estimate (or the length of its
/// blocks when it has none), plus blocks that aren't for a task, such as
/// lunch, plus busy calendar events within working hours. What fills the
/// day, whether done yet or not.
pub fn planned_minutes(day_tasks: &[task::Model], day_blocks: &[block::Model], day_events: &[event::Model], settings: &Settings) -> i32 {
    let for_tasks: i32 = day_tasks
        .iter()
        .map(|t| {
            t.estimate_minutes.unwrap_or_else(|| {
                day_blocks.iter().filter(|b| b.task_id.as_deref() == Some(t.id.as_str())).map(|b| b.duration_minutes).sum()
            })
        })
        .sum();
    let other: i32 = day_blocks.iter().filter(|b| b.task_id.is_none()).map(|b| b.duration_minutes).sum();
    let meetings: i32 = busy_spans(day_events)
        .map(|(s, e)| (e.min(settings.day_end_minute) - s.max(settings.day_start_minute)).max(0))
        .sum();
    for_tasks + other + meetings
}

/// Calendar events with a time (not all-day ones).
fn timed(events: &[event::Model]) -> impl Iterator<Item = &event::Model> {
    events.iter().filter(|e| !e.all_day)
}

/// Start and end of each calendar event that takes up time.
fn busy_spans(events: &[event::Model]) -> impl Iterator<Item = (i32, i32)> + '_ {
    timed(events).filter(|e| e.busy).map(|e| (e.start_minute, e.start_minute + e.duration_minutes))
}

fn block_title(block: &block::Model, day_tasks: &[task::Model]) -> String {
    block
        .task_id
        .as_ref()
        .and_then(|id| day_tasks.iter().find(|t| &t.id == id))
        .map(|t| t.title.clone())
        .unwrap_or_else(|| block.title.clone())
}

// ---------- Tasks ----------

/// Deadlines this close (or past) are pointed out on today's plan.
const DUE_SOON_DAYS: u64 = 3;

/// Soonest deadline first, then tasks without one, each in their order.
fn by_deadline(list: &mut [task::Model]) {
    list.sort_by_key(|t| (t.due_date.is_none(), t.due_date));
}

/// A typed deadline as a date: the next such day, counting today.
pub fn due_date(hint: DueHint, today: Date) -> Option<Date> {
    match hint {
        DueHint::Today => Some(today),
        DueHint::Tomorrow => Some(today + Days::new(1)),
        DueHint::Weekday(wanted) => {
            let now = today.weekday().num_days_from_monday();
            Some(today + Days::new(((wanted + 7 - now) % 7) as u64))
        }
        DueHint::MonthDay { month, day } => {
            let this_year = Date::from_ymd_opt(today.year(), month, day)?;
            if this_year >= today {
                Some(this_year)
            } else {
                Date::from_ymd_opt(today.year() + 1, month, day)
            }
        }
        DueHint::Date { year, month, day } => Date::from_ymd_opt(year, month, day),
    }
}

/// Sets or clears when a task has to be done by.
pub async fn set_due(db: &DatabaseConnection, id: &str, due: Option<Date>) -> Result<task::Model> {
    let found = find_task(db, id).await?;
    let mut active: task::ActiveModel = found.into();
    active.due_date = Set(due);
    Ok(active.update(db).await?)
}

pub async fn create_task(db: &DatabaseConnection, title: &str, day: Option<Date>, estimate_minutes: Option<i32>) -> Result<task::Model> {
    let title = non_empty(title)?;
    let estimate_minutes = check_estimate(estimate_minutes)?;
    let now = Utc::now();
    Ok(task::ActiveModel {
        id: Set(new_id()),
        title: Set(title),
        notes: Set(String::new()),
        day: Set(day),
        position: Set(next_position(db, day).await?),
        estimate_minutes: Set(estimate_minutes),
        focus_rank: Set(None),
        done_at: Set(None),
        board_task_id: Set(None),
        created_at: Set(now),
        actual_minutes: Set(0),
        timer_started_at: Set(None),
        due_date: Set(None),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

/// One line of text into a task, and a block when it names a time.
pub async fn quick_add(db: &DatabaseConnection, text: &str, shown: Date, today: Date) -> Result<QuickAdded> {
    let parsed = parse::quick_add(text);
    if parsed.title.is_empty() {
        return Err(Error::Invalid("Add a title, e.g. \"Write report 45m 2pm\".".into()));
    }
    let day = match parsed.day {
        DayHint::Shown => Some(shown),
        DayHint::Today => Some(today),
        DayHint::Tomorrow => Some(today + Days::new(1)),
        DayHint::Inbox => None,
    };
    let mut task = create_task(db, &parsed.title, day, parsed.estimate_minutes).await?;
    if let Some(due) = parsed.due.and_then(|hint| due_date(hint, today)) {
        task = set_due(db, &task.id, Some(due)).await?;
    }
    if parsed.focus && day.is_some() {
        task = set_focus(db, &task.id, true).await?;
    }
    // A time only means something on a day.
    let block = match (parsed.start_minute, day) {
        (Some(start), Some(day)) => {
            let duration = parsed.estimate_minutes.unwrap_or(DEFAULT_BLOCK_MINUTES).min(DAY_MINUTES - start);
            Some(create_block(db, day, start, duration, "", Some(&task.id)).await?)
        }
        _ => None,
    };
    Ok(QuickAdded { task, block })
}

pub async fn update_task(db: &DatabaseConnection, id: &str, fields: TaskFields) -> Result<task::Model> {
    let mut task: task::ActiveModel = find_task(db, id).await?.into();
    task.title = Set(non_empty(&fields.title)?);
    task.notes = Set(fields.notes);
    task.estimate_minutes = Set(check_estimate(fields.estimate_minutes)?);
    Ok(task.update(db).await?)
}

/// Ticks a task off (or back on). A running timer stops, and a linked
/// Project Board card moves to Done (or back) too.
pub async fn set_done(db: &DatabaseConnection, id: &str, done: bool) -> Result<task::Model> {
    let task = find_task(db, id).await?;
    if let Some(card) = &task.board_task_id {
        match board::set_card_done(db, card, done).await {
            // The card was deleted from its board: the task still ticks off.
            Err(Error::NotFound(_)) | Ok(()) => {}
            Err(other) => return Err(other),
        }
    }
    if done && task.timer_started_at.is_some() {
        stop_timer(db, id).await?;
    }
    let mut task: task::ActiveModel = find_task(db, id).await?.into();
    task.done_at = Set(done.then(Utc::now));
    Ok(task.update(db).await?)
}

// ---------- Time tracking ----------

/// Starts timing a task. Any other running timer stops first: one thing at a time.
pub async fn start_timer(db: &DatabaseConnection, id: &str) -> Result<task::Model> {
    find_task(db, id).await?;
    let running = tasks().filter(task::Column::TimerStartedAt.is_not_null()).all(db).await?;
    for other in running.iter().filter(|t| t.id != id) {
        stop_timer(db, &other.id).await?;
    }
    let task = find_task(db, id).await?;
    if task.timer_started_at.is_some() {
        return Ok(task);
    }
    let mut task: task::ActiveModel = task.into();
    task.timer_started_at = Set(Some(Utc::now()));
    Ok(task.update(db).await?)
}

/// Stops a task's timer and adds the time to what it has tracked.
pub async fn stop_timer(db: &DatabaseConnection, id: &str) -> Result<task::Model> {
    let task = find_task(db, id).await?;
    let Some(started) = task.timer_started_at else {
        return Ok(task);
    };
    let minutes = ((Utc::now() - started).num_seconds() as f64 / 60.0).round() as i32;
    let total = task.actual_minutes + minutes.max(0);
    let mut task: task::ActiveModel = task.into();
    task.actual_minutes = Set(total);
    task.timer_started_at = Set(None);
    Ok(task.update(db).await?)
}

// ---------- The Project Board ----------

/// Plans a board card: as a new task on `day` (or in the inbox), or by
/// moving the task already planned for it.
pub async fn plan_card(db: &DatabaseConnection, card_id: &str, day: Option<Date>) -> Result<task::Model> {
    let existing = tasks()
        .filter(task::Column::BoardTaskId.eq(card_id))
        .filter(task::Column::DoneAt.is_null())
        .one(db)
        .await?;
    if let Some(task) = existing {
        return if task.day == day { Ok(task) } else { move_task(db, &task.id, day, None).await };
    }
    let card = board::cards_by_id(db, &[card_id.to_owned()]).await?.pop().ok_or(Error::NotFound("Card"))?;
    let task = create_task(db, &card.title, day, card.estimate_minutes).await?;
    let mut task: task::ActiveModel = task.into();
    task.board_task_id = Set(Some(card.id));
    Ok(task.update(db).await?)
}

// ---------- The day's rituals ----------

pub async fn get_day_info(db: &impl ConnectionTrait, day: Date) -> Result<DayInfo> {
    let row = days().filter(day::Column::Id.eq(day.to_string())).one(db).await?;
    Ok(row.map_or_else(DayInfo::default, |d| DayInfo {
        intention: d.intention,
        went_well: d.went_well,
        do_better: d.do_better,
        planned_at: d.planned_at,
        shutdown_at: d.shutdown_at,
    }))
}

/// Saves the day's words, and marks it planned or shut down when asked.
pub async fn update_day(db: &DatabaseConnection, day: Date, fields: DayFields) -> Result<DayInfo> {
    let id = day.to_string();
    let existing = days().filter(day::Column::Id.eq(id.as_str())).one(db).await?;
    let now = Utc::now();
    let is_new = existing.is_none();
    let mut row: day::ActiveModel = match existing {
        Some(found) => found.into(),
        None => day::ActiveModel {
            id: Set(id),
            intention: Set(String::new()),
            went_well: Set(String::new()),
            do_better: Set(String::new()),
            planned_at: Set(None),
            shutdown_at: Set(None),
            updated_at: Set(now),
            deleted_at: Set(None),
        },
    };
    if let Some(text) = fields.intention {
        row.intention = Set(text.trim().to_owned());
    }
    if let Some(text) = fields.went_well {
        row.went_well = Set(text.trim().to_owned());
    }
    if let Some(text) = fields.do_better {
        row.do_better = Set(text.trim().to_owned());
    }
    if fields.planned == Some(true) {
        row.planned_at = Set(Some(now));
    }
    if fields.shut_down == Some(true) {
        row.shutdown_at = Set(Some(now));
    }
    if is_new {
        row.insert(db).await?;
    } else {
        row.update(db).await?;
    }
    get_day_info(db, day).await
}

// ---------- Scheduling ----------

/// After the day slipped: blocks for unfinished tasks that should already
/// have started move to the next free time from now, in their original
/// order. Fixed blocks (meetings, lunch) and finished work stay put. Tasks
/// that no longer fit before the end of the working day lose their block and
/// wait in the list.
pub async fn replan(db: &DatabaseConnection, day: Date, now_minute: i32) -> Result<ScheduleResult> {
    let plan_tasks = tasks().filter(task::Column::Day.eq(day)).all(db).await?;
    let open = |b: &block::Model| {
        b.task_id.as_ref().is_some_and(|id| plan_tasks.iter().any(|t| &t.id == id && t.done_at.is_none()))
    };
    let day_blocks = blocks().filter(block::Column::Day.eq(day)).order_by_asc(block::Column::StartMinute).all(db).await?;
    let until = get_settings(db).await?.day_end_minute;
    let cursor = ceil_quarter(now_minute);

    let mut busy: Vec<(i32, i32)> =
        day_blocks.iter().filter(|b| !open(b)).map(|b| (b.start_minute, b.start_minute + b.duration_minutes)).collect();
    busy.extend(busy_spans(&events_on(db, day).await?));
    // First keep every block that's still in the future and clear, so the
    // missed ones can't be placed on top of them.
    let mut to_move = Vec::new();
    for block in day_blocks.iter().filter(|b| open(b)) {
        let (start, end) = (block.start_minute, block.start_minute + block.duration_minutes);
        if start >= cursor && !overlaps(&busy, start, end) {
            busy.push((start, end));
        } else {
            to_move.push(block);
        }
    }

    let mut result = ScheduleResult::default();
    let txn = db.begin().await?;
    for block in to_move {
        let length = block.duration_minutes;
        let title = plan_tasks
            .iter()
            .find(|t| Some(&t.id) == block.task_id.as_ref())
            .map(|t| t.title.clone())
            .unwrap_or_default();
        match free_slot(&busy, cursor, length, until) {
            Some(at) => {
                let mut moving: block::ActiveModel = block.clone().into();
                moving.start_minute = Set(at);
                moving.update(&txn).await?;
                busy.push((at, at + length));
                result.scheduled.push(title);
            }
            None => {
                bury!(block, &txn, block::Column::Id.eq(block.id.as_str()));
                result.left_over.push(title);
            }
        }
    }
    txn.commit().await?;
    Ok(result)
}

/// Places the day's unscheduled tasks into free time from `from_minute`,
/// top priorities first, each for its estimate (or 30 minutes). A one-off
/// suggestion: nothing moves again by itself afterwards.
pub async fn fit_into_day(db: &DatabaseConnection, day: Date, from_minute: i32) -> Result<ScheduleResult> {
    let settings = get_settings(db).await?;
    let mut open = tasks()
        .filter(task::Column::Day.eq(day))
        .filter(task::Column::DoneAt.is_null())
        .order_by_asc(task::Column::Position)
        .all(db)
        .await?;
    open.sort_by_key(|t| t.focus_rank.unwrap_or(i16::MAX));
    let day_blocks = blocks().filter(block::Column::Day.eq(day)).all(db).await?;
    let mut busy: Vec<(i32, i32)> = day_blocks.iter().map(|b| (b.start_minute, b.start_minute + b.duration_minutes)).collect();
    busy.extend(busy_spans(&events_on(db, day).await?));
    let from = ceil_quarter(from_minute.max(settings.day_start_minute));

    let mut result = ScheduleResult::default();
    for task in open.iter().filter(|t| !day_blocks.iter().any(|b| b.task_id.as_ref() == Some(&t.id))) {
        let length = task.estimate_minutes.unwrap_or(DEFAULT_BLOCK_MINUTES);
        match free_slot(&busy, from, length, settings.day_end_minute) {
            Some(at) => {
                create_block(db, day, at, length, "", Some(&task.id)).await?;
                busy.push((at, at + length));
                result.scheduled.push(task.title.clone());
            }
            None => result.left_over.push(task.title.clone()),
        }
    }
    Ok(result)
}

/// The earliest quarter-hour start at or after `from` where `length`
/// minutes fit between the busy spans and end by `until`.
fn free_slot(busy: &[(i32, i32)], from: i32, length: i32, until: i32) -> Option<i32> {
    let mut at = ceil_quarter(from);
    loop {
        if at + length > until {
            return None;
        }
        match busy.iter().filter(|(s, e)| *s < at + length && *e > at).map(|(_, e)| *e).max() {
            Some(end) => at = ceil_quarter(end),
            None => return Some(at),
        }
    }
}

fn overlaps(busy: &[(i32, i32)], start: i32, end: i32) -> bool {
    busy.iter().any(|(s, e)| *s < end && *e > start)
}

fn ceil_quarter(minute: i32) -> i32 {
    (minute + 14).div_euclid(15) * 15
}

/// Makes a task one of its day's top priorities (taking the next rank), or
/// stops it being one (the ones after it move up).
pub async fn set_focus(db: &DatabaseConnection, id: &str, focus: bool) -> Result<task::Model> {
    let task = find_task(db, id).await?;
    let Some(day) = task.day else {
        return Err(Error::Invalid("Plan a task for a day before making it a top priority.".into()));
    };
    let txn = db.begin().await?;
    let others: Vec<task::Model> = tasks()
        .filter(task::Column::Day.eq(day))
        .filter(task::Column::FocusRank.is_not_null())
        .filter(task::Column::Id.ne(id))
        .order_by_asc(task::Column::FocusRank)
        .all(&txn)
        .await?;
    let rank = if focus {
        if task.focus_rank.is_some() {
            task.focus_rank
        } else if others.len() >= MAX_FOCUS as usize {
            return Err(Error::Invalid(format!(
                "You already have {MAX_FOCUS} top priorities for this day. Unstar one first."
            )));
        } else {
            Some(others.len() as i16 + 1)
        }
    } else {
        None
    };
    // Keep the others numbered 1, 2, ... with no gaps.
    for (i, other) in others.into_iter().enumerate() {
        let wanted = Some(i as i16 + 1);
        if other.focus_rank != wanted {
            let mut other: task::ActiveModel = other.into();
            other.focus_rank = Set(wanted);
            other.update(&txn).await?;
        }
    }
    let mut task: task::ActiveModel = task.into();
    task.focus_rank = Set(rank);
    let task = task.update(&txn).await?;
    txn.commit().await?;
    Ok(task)
}

/// Moves a task to another day (or the inbox when `day` is `None`), placed
/// before `before_id` or at the end. Moving to another day drops its top
/// priority rank and its blocks, which belonged to the old day.
pub async fn move_task(db: &DatabaseConnection, id: &str, day: Option<Date>, before_id: Option<&str>) -> Result<task::Model> {
    let task = find_task(db, id).await?;
    let txn = db.begin().await?;
    let changing_day = task.day != day;
    if changing_day && task.focus_rank.is_some() {
        close_rank_gap(&txn, &task).await?;
    }
    if changing_day {
        bury!(block, &txn, block::Column::TaskId.eq(id));
    }
    let position = position_before(&txn, day, before_id, id).await?;
    let mut active: task::ActiveModel = find_task(&txn, id).await?.into();
    active.day = Set(day);
    active.position = Set(position);
    if changing_day {
        active.focus_rank = Set(None);
    }
    let task = active.update(&txn).await?;
    txn.commit().await?;
    Ok(task)
}

/// Deals with unfinished tasks from earlier days, all at once.
pub async fn carry_over(db: &DatabaseConnection, ids: &[String], to: CarryTo, today: Date) -> Result<()> {
    for id in ids {
        match to {
            CarryTo::Today => move_task(db, id, Some(today), None).await.map(drop)?,
            CarryTo::Inbox => move_task(db, id, None, None).await.map(drop)?,
            CarryTo::Delete => delete_task(db, id).await?,
        }
    }
    Ok(())
}

pub async fn delete_task(db: &DatabaseConnection, id: &str) -> Result<()> {
    let task = find_task(db, id).await?;
    let txn = db.begin().await?;
    if task.focus_rank.is_some() {
        close_rank_gap(&txn, &task).await?;
    }
    bury!(block, &txn, block::Column::TaskId.eq(id));
    bury!(task, &txn, task::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

/// Renumbers the other top priorities on a task's day as if it had none,
/// before it leaves the day or is deleted.
async fn close_rank_gap(db: &impl ConnectionTrait, task: &task::Model) -> Result<()> {
    let others = tasks()
        .filter(task::Column::Day.eq(task.day))
        .filter(task::Column::FocusRank.is_not_null())
        .filter(task::Column::Id.ne(task.id.as_str()))
        .order_by_asc(task::Column::FocusRank)
        .all(db)
        .await?;
    for (i, other) in others.into_iter().enumerate() {
        let wanted = Some(i as i16 + 1);
        if other.focus_rank != wanted {
            let mut other: task::ActiveModel = other.into();
            other.focus_rank = Set(wanted);
            other.update(db).await?;
        }
    }
    Ok(())
}

// ---------- Blocks ----------

/// Adds a block. For a task, the task moves to the block's day if it was
/// elsewhere (scheduling an inbox task plans it for that day).
pub async fn create_block(
    db: &DatabaseConnection,
    day: Date,
    start_minute: i32,
    duration_minutes: i32,
    title: &str,
    task_id: Option<&str>,
) -> Result<block::Model> {
    check_span(start_minute, duration_minutes)?;
    if let Some(task_id) = task_id {
        let task = find_task(db, task_id).await?;
        if task.day != Some(day) {
            move_task(db, task_id, Some(day), None).await?;
        }
    } else if title.trim().is_empty() {
        return Err(Error::Invalid("Give the block a name.".into()));
    }
    let now = Utc::now();
    Ok(block::ActiveModel {
        id: Set(new_id()),
        day: Set(day),
        start_minute: Set(start_minute),
        duration_minutes: Set(duration_minutes),
        title: Set(title.trim().to_owned()),
        color: Set("blue".into()),
        task_id: Set(task_id.map(str::to_owned)),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
        routine_id: Set(None),
    }
    .insert(db)
    .await?)
}

pub async fn update_block(db: &DatabaseConnection, id: &str, fields: BlockFields) -> Result<block::Model> {
    check_span(fields.start_minute, fields.duration_minutes)?;
    let block = find_block(db, id).await?;
    if block.task_id.is_none() && fields.title.trim().is_empty() {
        return Err(Error::Invalid("Give the block a name.".into()));
    }
    let color = if COLORS.contains(&fields.color.as_str()) { fields.color } else { "blue".into() };
    let mut block: block::ActiveModel = block.into();
    block.start_minute = Set(fields.start_minute);
    block.duration_minutes = Set(fields.duration_minutes);
    block.title = Set(fields.title.trim().to_owned());
    block.color = Set(color);
    Ok(block.update(db).await?)
}

pub async fn delete_block(db: &DatabaseConnection, id: &str) -> Result<()> {
    find_block(db, id).await?;
    bury!(block, db, block::Column::Id.eq(id));
    Ok(())
}

// ---------- Settings ----------

pub async fn get_settings(db: &impl ConnectionTrait) -> Result<Settings> {
    let row = settings::Entity::find_by_id(SETTINGS_ID)
        .filter(settings::Column::DeletedAt.is_null())
        .one(db)
        .await?;
    Ok(row.map_or_else(Settings::default, |s| Settings {
        day_start_minute: s.day_start_minute,
        day_end_minute: s.day_end_minute,
        buffer_percent: s.buffer_percent,
    }))
}

pub async fn update_settings(db: &DatabaseConnection, new: Settings) -> Result<Settings> {
    if !(0..DAY_MINUTES).contains(&new.day_start_minute) || !(1..=DAY_MINUTES).contains(&new.day_end_minute) {
        return Err(Error::Invalid("Pick times within the day.".into()));
    }
    if new.day_end_minute - new.day_start_minute < 60 {
        return Err(Error::Invalid("Your working day needs to be at least an hour long.".into()));
    }
    if !(0..=60).contains(&new.buffer_percent) {
        return Err(Error::Invalid("Keep the buffer between 0% and 60%.".into()));
    }
    let row = settings::ActiveModel {
        id: Set(SETTINGS_ID.into()),
        day_start_minute: Set(new.day_start_minute),
        day_end_minute: Set(new.day_end_minute),
        buffer_percent: Set(new.buffer_percent),
        updated_at: Set(Utc::now()),
        deleted_at: Set(None),
    };
    match settings::Entity::find_by_id(SETTINGS_ID).one(db).await? {
        Some(_) => row.update(db).await?,
        None => row.insert(db).await?,
    };
    Ok(new)
}

// ---------- Helpers ----------

async fn find_task(db: &impl ConnectionTrait, id: &str) -> Result<task::Model> {
    tasks().filter(task::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Task"))
}

async fn find_block(db: &impl ConnectionTrait, id: &str) -> Result<block::Model> {
    blocks().filter(block::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Block"))
}

/// Tasks on the same day (or in the inbox).
fn same_list(day: Option<Date>) -> Select<task::Entity> {
    match day {
        Some(day) => tasks().filter(task::Column::Day.eq(day)),
        None => tasks().filter(task::Column::Day.is_null()),
    }
}

async fn next_position(db: &impl ConnectionTrait, day: Option<Date>) -> Result<f64> {
    let last = same_list(day).order_by_desc(task::Column::Position).one(db).await?;
    Ok(last.map_or(1.0, |t| t.position + 1.0))
}

/// A position just before `before_id` in the list for `day`, or after the
/// last task. Halves the gap, so nothing else needs renumbering.
async fn position_before(db: &impl ConnectionTrait, day: Option<Date>, before_id: Option<&str>, moving: &str) -> Result<f64> {
    let list = same_list(day).filter(task::Column::Id.ne(moving)).order_by_asc(task::Column::Position).all(db).await?;
    let Some(before_id) = before_id else {
        return Ok(list.last().map_or(1.0, |t| t.position + 1.0));
    };
    let Some(index) = list.iter().position(|t| t.id == before_id) else {
        return Ok(list.last().map_or(1.0, |t| t.position + 1.0));
    };
    let after = list[index].position;
    let prior = if index == 0 { after - 1.0 } else { list[index - 1].position };
    Ok((prior + after) / 2.0)
}

fn non_empty(text: &str) -> Result<String> {
    let text = text.trim();
    if text.is_empty() {
        Err(Error::Invalid("Give the task a title.".into()))
    } else {
        Ok(text.to_owned())
    }
}

fn check_estimate(minutes: Option<i32>) -> Result<Option<i32>> {
    match minutes {
        Some(m) if !(1..=DAY_MINUTES).contains(&m) => Err(Error::Invalid("An estimate is between 1 minute and 24 hours.".into())),
        other => Ok(other),
    }
}

fn check_span(start_minute: i32, duration_minutes: i32) -> Result<()> {
    if !(0..DAY_MINUTES).contains(&start_minute) {
        return Err(Error::Invalid("A block has to start within the day.".into()));
    }
    if duration_minutes < MIN_BLOCK_MINUTES || start_minute + duration_minutes > DAY_MINUTES {
        return Err(Error::Invalid(format!("A block is at least {MIN_BLOCK_MINUTES} minutes and ends by midnight.")));
    }
    Ok(())
}

// ---------- Routines ----------

/// Monday is bit 0, Sunday bit 6.
fn weekday_bit(day: Date) -> i16 {
    1 << day.weekday().num_days_from_monday()
}

/// The id of a routine's block on a day. The same on every device, so two
/// computers laying out the same day make one block, and a skipped
/// (deleted) occurrence stays skipped.
fn routine_block_id(routine_id: &str, day: Date) -> String {
    format!("r-{routine_id}-{day}")
}

/// Puts the day's routines on its timeline, once.
async fn lay_out_routines(db: &DatabaseConnection, day: Date) -> Result<()> {
    let bit = weekday_bit(day);
    for routine in routines().all(db).await?.into_iter().filter(|r| r.weekdays & bit != 0) {
        let id = routine_block_id(&routine.id, day);
        // Deleted rows count too: deleting an occurrence skips that day.
        if block::Entity::find_by_id(id.as_str()).one(db).await?.is_some() {
            continue;
        }
        let now = Utc::now();
        block::ActiveModel {
            id: Set(id),
            day: Set(day),
            start_minute: Set(routine.start_minute),
            duration_minutes: Set(routine.duration_minutes),
            title: Set(routine.title.clone()),
            color: Set(routine.color.clone()),
            task_id: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
            deleted_at: Set(None),
            routine_id: Set(Some(routine.id.clone())),
        }
        .insert(db)
        .await?;
    }
    Ok(())
}

pub async fn list_routines(db: &DatabaseConnection) -> Result<Vec<routine::Model>> {
    Ok(routines().order_by_asc(routine::Column::StartMinute).all(db).await?)
}

fn check_routine(fields: &RoutineFields) -> Result<(String, String)> {
    let title = fields.title.trim();
    if title.is_empty() {
        return Err(Error::Invalid("Give the routine a name.".into()));
    }
    check_span(fields.start_minute, fields.duration_minutes)?;
    if fields.weekdays & 0x7f == 0 {
        return Err(Error::Invalid("Pick at least one day for the routine.".into()));
    }
    let color = if COLORS.contains(&fields.color.as_str()) { fields.color.clone() } else { "purple".into() };
    Ok((title.to_owned(), color))
}

pub async fn create_routine(db: &DatabaseConnection, fields: RoutineFields) -> Result<routine::Model> {
    let (title, color) = check_routine(&fields)?;
    let now = Utc::now();
    Ok(routine::ActiveModel {
        id: Set(new_id()),
        title: Set(title),
        start_minute: Set(fields.start_minute),
        duration_minutes: Set(fields.duration_minutes),
        color: Set(color),
        weekdays: Set(fields.weekdays & 0x7f),
        created_at: Set(now),
        updated_at: Set(now),
        deleted_at: Set(None),
    }
    .insert(db)
    .await?)
}

/// Changes a routine. Days from today on that are already laid out follow
/// the change (time, name, colour); days no longer chosen lose the block.
/// Past days keep what really happened.
pub async fn update_routine(db: &DatabaseConnection, id: &str, fields: RoutineFields, today: Date) -> Result<routine::Model> {
    let (title, color) = check_routine(&fields)?;
    let found = routines().filter(routine::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Routine"))?;
    let txn = db.begin().await?;
    let mut active: routine::ActiveModel = found.into();
    active.title = Set(title.clone());
    active.start_minute = Set(fields.start_minute);
    active.duration_minutes = Set(fields.duration_minutes);
    active.color = Set(color.clone());
    active.weekdays = Set(fields.weekdays & 0x7f);
    let updated = active.update(&txn).await?;

    let laid_out = blocks()
        .filter(block::Column::RoutineId.eq(id))
        .filter(block::Column::Day.gte(today))
        .all(&txn)
        .await?;
    for b in laid_out {
        let mut b: block::ActiveModel = b.into();
        let day = *b.day.as_ref();
        if updated.weekdays & weekday_bit(day) == 0 {
            b.deleted_at = Set(Some(Utc::now()));
        } else {
            b.title = Set(title.clone());
            b.start_minute = Set(fields.start_minute);
            b.duration_minutes = Set(fields.duration_minutes);
            b.color = Set(color.clone());
        }
        b.update(&txn).await?;
    }
    txn.commit().await?;
    Ok(updated)
}

/// Stops a routine. Its blocks from today on go; past days keep theirs.
pub async fn delete_routine(db: &DatabaseConnection, id: &str, today: Date) -> Result<()> {
    routines().filter(routine::Column::Id.eq(id)).one(db).await?.ok_or(Error::NotFound("Routine"))?;
    let txn = db.begin().await?;
    bury!(block, &txn, Condition::all().add(block::Column::RoutineId.eq(id)).add(block::Column::Day.gte(today)));
    bury!(routine, &txn, routine::Column::Id.eq(id));
    txn.commit().await?;
    Ok(())
}

// ---------- Insights ----------

/// Tracked time against estimates over the last 30 days, from tasks with
/// both. None with fewer than three such tasks: too little to go on.
async fn pace(db: &impl ConnectionTrait, today: Date) -> Result<(Option<f64>, usize)> {
    let since = today - Days::new(30);
    let timed: Vec<task::Model> = tasks()
        .filter(task::Column::Day.gte(since))
        .filter(task::Column::Day.lte(today))
        .filter(task::Column::EstimateMinutes.gt(0))
        .filter(task::Column::ActualMinutes.gt(0))
        .all(db)
        .await?;
    let estimated: i64 = timed.iter().map(|t| t.estimate_minutes.unwrap_or(0) as i64).sum();
    let actual: i64 = timed.iter().map(|t| t.actual_minutes as i64).sum();
    let pace = (timed.len() >= 3 && estimated > 0).then(|| actual as f64 / estimated as f64);
    Ok((pace, timed.len()))
}

pub async fn insights(db: &DatabaseConnection, today: Date) -> Result<PlanInsights> {
    let (pace, paced_tasks) = pace(db, today).await?;

    let this_monday = today - Days::new(today.weekday().num_days_from_monday() as u64);
    let first_monday = this_monday - Days::new(7 * 7);
    let recent = tasks().filter(task::Column::Day.gte(first_monday)).filter(task::Column::Day.lte(today)).all(db).await?;

    let weeks = (0..8)
        .map(|i| {
            let week_start = first_monday + Days::new(7 * i);
            let week_end = week_start + Days::new(7);
            let tracked_minutes = recent
                .iter()
                .filter(|t| t.day.is_some_and(|d| d >= week_start && d < week_end))
                .map(|t| t.actual_minutes)
                .sum();
            WeekFocus { week_start, tracked_minutes }
        })
        .collect();

    let days = (0..14)
        .rev()
        .map(|back| {
            let day = today - Days::new(back);
            let on_day: Vec<&task::Model> = recent.iter().filter(|t| t.day == Some(day)).collect();
            DayDone { day, planned: on_day.len(), done: on_day.iter().filter(|t| t.done_at.is_some()).count() }
        })
        .collect();

    let month_ago = today - Days::new(30);
    let focus: Vec<task::Model> = tasks()
        .filter(task::Column::Day.gte(month_ago))
        .filter(task::Column::Day.lte(today))
        .filter(task::Column::FocusRank.is_not_null())
        .all(db)
        .await?;

    let rows = days_table_since(db, today - Days::new(400)).await?;
    let streak = |done: &dyn Fn(&day::Model) -> bool| {
        let marked = |d: Date| rows.iter().any(|r| r.id == d.to_string() && done(r));
        // Today only counts once it's done; until then the streak runs to yesterday.
        let mut day = if marked(today) { today } else { today - Days::new(1) };
        let mut count = 0;
        while marked(day) {
            count += 1;
            day = day - Days::new(1);
        }
        count
    };

    Ok(PlanInsights {
        pace,
        paced_tasks,
        weeks,
        days,
        planning_streak: streak(&|r| r.planned_at.is_some()),
        shutdown_streak: streak(&|r| r.shutdown_at.is_some()),
        focus_total: focus.len(),
        focus_done: focus.iter().filter(|t| t.done_at.is_some()).count(),
    })
}

async fn days_table_since(db: &impl ConnectionTrait, since: Date) -> Result<Vec<day::Model>> {
    Ok(days().filter(day::Column::Id.gte(since.to_string())).all(db).await?)
}

// ---------- Ranges ----------

/// The most days one request may cover: a year, with room for the weeks
/// either side of it.
const MAX_RANGE_DAYS: i64 = 400;

/// Every day from `from` to `to` (both included). Routines show on days
/// from today on; they're only written down when a day is opened.
pub async fn range(db: &DatabaseConnection, from: Date, to: Date, today: Date) -> Result<RangePlan> {
    if to < from || (to - from).num_days() > MAX_RANGE_DAYS {
        return Err(Error::Invalid("That's too many days to show at once.".into()));
    }
    let all_tasks = tasks()
        .filter(task::Column::Day.gte(from))
        .filter(task::Column::Day.lte(to))
        .order_by_asc(task::Column::Position)
        .all(db)
        .await?;
    let all_blocks = blocks()
        .filter(block::Column::Day.gte(from))
        .filter(block::Column::Day.lte(to))
        .order_by_asc(block::Column::StartMinute)
        .all(db)
        .await?;
    // Every routine block ever made in the range, deleted ones included: a
    // deleted one is a skipped day.
    let made: std::collections::HashSet<String> = block::Entity::find()
        .filter(block::Column::RoutineId.is_not_null())
        .filter(block::Column::Day.gte(from))
        .filter(block::Column::Day.lte(to))
        .all(db)
        .await?
        .into_iter()
        .map(|b| b.id)
        .collect();
    let all_routines = routines().all(db).await?;
    let all_due = tasks()
        .filter(task::Column::DoneAt.is_null())
        .filter(task::Column::DueDate.gte(from))
        .filter(task::Column::DueDate.lte(to))
        .all(db)
        .await?;
    let all_events = event::Entity::find()
        .filter(event::Column::Day.gte(from))
        .filter(event::Column::Day.lte(to))
        .order_by_desc(event::Column::AllDay)
        .order_by_asc(event::Column::StartMinute)
        .all(db)
        .await?;
    let planned_days: std::collections::HashSet<String> = days()
        .filter(day::Column::Id.gte(from.to_string()))
        .filter(day::Column::Id.lte(to.to_string()))
        .filter(day::Column::PlannedAt.is_not_null())
        .all(db)
        .await?
        .into_iter()
        .map(|d| d.id)
        .collect();
    let settings = get_settings(db).await?;

    let mut out = Vec::new();
    let mut date = from;
    while date <= to {
        let mut day_tasks: Vec<task::Model> = all_tasks.iter().filter(|t| t.day == Some(date)).cloned().collect();
        day_tasks.sort_by_key(|t| t.focus_rank.unwrap_or(i16::MAX));
        let mut day_blocks: Vec<block::Model> = all_blocks.iter().filter(|b| b.day == date).cloned().collect();
        if date >= today {
            for r in all_routines.iter().filter(|r| r.weekdays & weekday_bit(date) != 0) {
                let id = routine_block_id(&r.id, date);
                if !made.contains(&id) {
                    day_blocks.push(block::Model {
                        id,
                        day: date,
                        start_minute: r.start_minute,
                        duration_minutes: r.duration_minutes,
                        title: r.title.clone(),
                        color: r.color.clone(),
                        task_id: None,
                        created_at: r.created_at,
                        updated_at: r.updated_at,
                        deleted_at: None,
                        routine_id: Some(r.id.clone()),
                    });
                }
            }
            day_blocks.sort_by_key(|b| b.start_minute);
        }
        let day_events: Vec<event::Model> = all_events.iter().filter(|e| e.day == date).cloned().collect();
        // Deadlines of tasks planned for another day (or none); those on the day show already.
        let due: Vec<task::Model> = all_due.iter().filter(|t| t.due_date == Some(date) && t.day != Some(date)).cloned().collect();
        out.push(DaySlice {
            day: date,
            planned_minutes: planned_minutes(&day_tasks, &day_blocks, &day_events, &settings),
            planned: planned_days.contains(&date.to_string()),
            tasks: day_tasks,
            blocks: day_blocks,
            events: day_events,
            due,
        });
        date = date + Days::new(1);
    }

    let mut inbox = tasks()
        .filter(task::Column::Day.is_null())
        .filter(task::Column::DoneAt.is_null())
        .order_by_asc(task::Column::Position)
        .all(db)
        .await?;
    by_deadline(&mut inbox);
    Ok(RangePlan { days: out, inbox, settings, pace: pace(db, today).await?.0 })
}

// ---------- For notifications ----------

/// One thing on a day's agenda: (start minute, or None for all day; minutes;
/// title; whether it's a calendar event).
pub type AgendaEntry = (Option<i32>, i32, String, bool);

/// A day's blocks and calendar events in time order, and its top priorities.
/// With `lay_out`, routine blocks are laid out first, as opening the day does.
pub async fn agenda(db: &DatabaseConnection, day: Date, lay_out: bool) -> Result<(Vec<AgendaEntry>, Vec<String>)> {
    if lay_out {
        lay_out_routines(db, day).await?;
    }
    let day_tasks = tasks().filter(task::Column::Day.eq(day)).all(db).await?;
    let title_of = |id: &Option<String>| id.as_ref().and_then(|id| day_tasks.iter().find(|t| &t.id == id)).map(|t| t.title.clone());
    let mut items: Vec<AgendaEntry> = blocks()
        .filter(block::Column::Day.eq(day))
        .all(db)
        .await?
        .into_iter()
        .map(|b| {
            let title = title_of(&b.task_id).filter(|t| !t.is_empty()).unwrap_or(b.title);
            (Some(b.start_minute), b.duration_minutes, title, false)
        })
        .collect();
    items.extend(events_on(db, day).await?.into_iter().map(|e| ((!e.all_day).then_some(e.start_minute), e.duration_minutes, e.title, true)));
    items.sort_by_key(|(start, ..)| start.unwrap_or(-1));
    let mut focus: Vec<&task::Model> = day_tasks.iter().filter(|t| t.focus_rank.is_some() && t.done_at.is_none()).collect();
    focus.sort_by_key(|t| t.focus_rank);
    Ok((items, focus.into_iter().map(|t| t.title.clone()).collect()))
}

/// Open tasks due on or before `through`, soonest first: (title, due).
pub async fn deadline_tasks(db: &DatabaseConnection, through: Date) -> Result<Vec<(String, Date)>> {
    let mut due: Vec<(String, Date)> = tasks()
        .filter(task::Column::DoneAt.is_null())
        .filter(task::Column::DueDate.lte(through))
        .all(db)
        .await?
        .into_iter()
        .filter_map(|t| Some((t.title, t.due_date?)))
        .collect();
    due.sort_by_key(|(_, d)| *d);
    Ok(due)
}
