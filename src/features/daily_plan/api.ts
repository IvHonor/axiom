// Typed wrappers for the Daily Plan's Tauri commands.
// Mirrors src-tauri/src/features/daily_plan/{entities,types}.rs.
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export type PlanTransport = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
let transport: PlanTransport = tauriInvoke;
const invoke: PlanTransport = (command, args) => transport(command, args);
/** The web host supplies storage; the desktop keeps its native command transport. */
export function setPlanTransport(next: PlanTransport) {
  transport = next;
  return () => { if (transport === next) transport = tauriInvoke; };
}

/** "YYYY-MM-DD" in the user's own time zone. */
export type Day = string;

export interface PlanTask {
  id: string;
  title: string;
  notes: string;
  day: Day | null;
  position: number;
  estimateMinutes: number | null;
  /** 1-3 when it's one of the day's top priorities. */
  focusRank: number | null;
  doneAt: string | null;
  boardTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Tracked so far, not counting a running timer. */
  actualMinutes: number;
  /** Set while its timer runs. */
  timerStartedAt: string | null;
  /** When it has to be done by, whatever day it's planned for. */
  dueDate: Day | null;
}

/** A Project Board card, as the planner shows it. Mirrors `PlannableCard`. */
export interface Card {
  id: string;
  title: string;
  projectName: string;
  projectColor: string;
  columnName: string;
  dueDate: Day | null;
  estimateMinutes: number | null;
  inProgress: boolean;
  done: boolean;
}

export interface DayInfo {
  intention: string;
  wentWell: string;
  doBetter: string;
  plannedAt: string | null;
  shutdownAt: string | null;
}

/** Changes to a day: anything left out stays as it is. */
export interface DayFields {
  intention?: string;
  wentWell?: string;
  doBetter?: string;
  planned?: boolean;
  shutDown?: boolean;
}

export interface ScheduleResult {
  scheduled: string[];
  leftOver: string[];
}

export interface Block {
  id: string;
  day: Day;
  /** Minutes after midnight. */
  startMinute: number;
  durationMinutes: number;
  title: string;
  color: string;
  taskId: string | null;
  /** Set when a routine laid this block out. */
  routineId: string | null;
}

/** An event from an imported calendar: fixed and read-only. */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  day: Day;
  startMinute: number;
  durationMinutes: number;
  allDay: boolean;
  /** False for events marked as free time. */
  busy: boolean;
  title: string;
  color: string;
  /** When the whole event starts and ends (ISO), across days. */
  startAt: string | null;
  endAt: string | null;
  location: string;
  /** Notes; may hold HTML from Google. */
  description: string;
  /** The event in its own calendar app or site. */
  link: string | null;
  /** One of a repeating series. */
  recurring: boolean;
  /** Whether Axiom can change it. */
  editable: boolean;
}

/** A change to a calendar event; anything left out stays as it is. */
export interface EventEdit {
  title?: string;
  location?: string;
  description?: string;
  /** Moves an event that has a time. */
  when?: { day: Day; startMinute: number; endMinute: number };
}

/** A calendar from an account, or read from a private iCal link (the link
 * itself stays in Rust). */
export interface Calendar {
  id: string;
  name: string;
  color: string;
  refreshedAt: string | null;
  /** Why the last read (or publish) failed, ready to show. */
  problem: string | null;
  createdAt: string;
  /** Null for a calendar added by link. */
  accountId: string | null;
  /** Whether the plan can be published into it. */
  writable: boolean;
  /** Whether its events show on the planner. */
  shown: boolean;
  /** The calendar the plan is published into. */
  publish: boolean;
  /** The user's own, not shared with them read-only. */
  mine: boolean;
}

export type CalendarProvider = "google" | "microsoft" | "caldav";

/** A connected Google, Microsoft or CalDAV (iCloud) account. */
export interface CalendarAccount {
  id: string;
  provider: CalendarProvider;
  /** Usually an email address. */
  name: string;
  /** The CalDAV server; empty for Google and Microsoft. */
  server: string;
  problem: string | null;
  /** The sign-in stopped working: reconnecting fixes it. */
  signedOut: boolean;
  createdAt: string;
}

export interface CalendarSetup {
  accounts: CalendarAccount[];
  calendars: Calendar[];
  /** Which providers this copy of Axiom can connect to. */
  available: { google: boolean; microsoft: boolean; caldav?: boolean };
}

/** A block that repeats on chosen weekdays. */
export interface Routine {
  id: string;
  title: string;
  startMinute: number;
  durationMinutes: number;
  color: string;
  /** Monday is bit 0 (1), Sunday bit 6 (64). */
  weekdays: number;
}

export type RoutineFields = Omit<Routine, "id">;

/** Patterns over recent weeks. Mirrors `PlanInsights`. */
export interface PlanInsights {
  pace: number | null;
  pacedTasks: number;
  weeks: { weekStart: Day; trackedMinutes: number }[];
  days: { day: Day; planned: number; done: number }[];
  planningStreak: number;
  shutdownStreak: number;
  focusTotal: number;
  focusDone: number;
}

export interface Settings {
  dayStartMinute: number;
  dayEndMinute: number;
  bufferPercent: number;
}

export interface DayPlan {
  day: Day;
  tasks: PlanTask[];
  blocks: Block[];
  events: CalendarEvent[];
  /** Unfinished tasks from earlier days (only for today). */
  earlier: PlanTask[];
  inbox: PlanTask[];
  /** Due within three days (or overdue) but planned for later or not at all. Today only. */
  dueSoon: PlanTask[];
  settings: Settings;
  info: DayInfo;
  /** Board cards linked to the tasks above. */
  cards: Card[];
  /** Board cards due, overdue or in progress, not planned yet. */
  suggestions: Card[];
  /** The task being timed, on any day. */
  running: PlanTask | null;
  /** How long tasks really take against their estimates (1.3 = 30% longer); null until known. */
  pace: number | null;
}

/** One day of a range (week, month, year). Mirrors `DaySlice`. */
export interface DaySlice {
  day: Day;
  tasks: PlanTask[];
  /** Includes routines on days ahead, shown before they're written down. */
  blocks: Block[];
  events: CalendarEvent[];
  plannedMinutes: number;
  /** Whether the morning planning was done. */
  planned: boolean;
  /** Open tasks due that day but planned for another (or none). */
  due: PlanTask[];
}

export interface RangePlan {
  days: DaySlice[];
  inbox: PlanTask[];
  settings: Settings;
  pace: number | null;
}

export interface TodaySummary {
  total: number;
  done: number;
  focus: PlanTask[];
  nextBlock: { startMinute: number; durationMinutes: number; title: string; inProgress: boolean } | null;
  plannedMinutes: number;
  availableMinutes: number;
  running: PlanTask | null;
}

export interface TaskFields {
  title: string;
  notes: string;
  estimateMinutes: number | null;
}

export interface BlockFields {
  startMinute: number;
  durationMinutes: number;
  title: string;
  color: string;
}

export type CarryTo = "today" | "inbox" | "delete";

export const MAX_FOCUS = 3;

export const api = {
  getDay: (day: Day, today: Day) => invoke<DayPlan>("plan_get_day", { day, today }),
  /** Many days at once (up to about a year). */
  range: (from: Day, to: Day, today: Day) => invoke<RangePlan>("plan_range", { from, to, today }),
  summary: (today: Day, nowMinute: number) => invoke<TodaySummary>("plan_summary", { today, nowMinute }),
  quickAdd: (text: string, day: Day, today: Day) =>
    invoke<{ task: PlanTask; block: Block | null }>("plan_quick_add", { text, day, today }),
  createTask: (title: string, day: Day | null, estimateMinutes: number | null) =>
    invoke<PlanTask>("plan_create_task", { title, day, estimateMinutes }),
  updateTask: (id: string, fields: TaskFields) => invoke<PlanTask>("plan_update_task", { id, fields }),
  setDone: (id: string, done: boolean) => invoke<PlanTask>("plan_set_done", { id, done }),
  setFocus: (id: string, focus: boolean) => invoke<PlanTask>("plan_set_focus", { id, focus }),
  /** Sets (or with null, clears) a task's deadline. */
  setDue: (id: string, due: Day | null) => invoke<PlanTask>("plan_set_due", { id, due }),
  moveTask: (id: string, day: Day | null, beforeId: string | null = null) =>
    invoke<PlanTask>("plan_move_task", { id, day, beforeId }),
  carryOver: (ids: string[], to: CarryTo, today: Day) => invoke<void>("plan_carry_over", { ids, to, today }),
  deleteTask: (id: string) => invoke<void>("plan_delete_task", { id }),
  createBlock: (day: Day, startMinute: number, durationMinutes: number, title: string, taskId: string | null) =>
    invoke<Block>("plan_create_block", { day, startMinute, durationMinutes, title, taskId }),
  updateBlock: (id: string, fields: BlockFields) => invoke<Block>("plan_update_block", { id, fields }),
  deleteBlock: (id: string) => invoke<void>("plan_delete_block", { id }),
  updateSettings: (settings: Settings) => invoke<Settings>("plan_update_settings", { settings }),
  startTimer: (id: string) => invoke<PlanTask>("plan_start_timer", { id }),
  stopTimer: (id: string) => invoke<PlanTask>("plan_stop_timer", { id }),
  /** Plans a board card for a day (or the inbox); returns its planner task. */
  planCard: (cardId: string, day: Day | null) => invoke<PlanTask>("plan_card", { cardId, day }),
  updateDay: (day: Day, fields: DayFields) => invoke<DayInfo>("plan_update_day", { day, fields }),
  replan: (day: Day, nowMinute: number) => invoke<ScheduleResult>("plan_replan", { day, nowMinute }),
  fitIntoDay: (day: Day, fromMinute: number) => invoke<ScheduleResult>("plan_fit_into_day", { day, fromMinute }),
  listRoutines: () => invoke<Routine[]>("plan_list_routines"),
  createRoutine: (fields: RoutineFields) => invoke<Routine>("plan_create_routine", { fields }),
  updateRoutine: (id: string, fields: RoutineFields, today: Day) => invoke<Routine>("plan_update_routine", { id, fields, today }),
  deleteRoutine: (id: string, today: Day) => invoke<void>("plan_delete_routine", { id, today }),
  insights: (today: Day) => invoke<PlanInsights>("plan_insights", { today }),
  calendarSetup: () => invoke<CalendarSetup>("plan_calendar_setup"),
  addCalendar: (name: string, url: string, color: string, today: Day) =>
    invoke<Calendar>("plan_add_calendar", { name, url, color, today }),
  removeCalendar: (id: string) => invoke<void>("plan_remove_calendar", { id }),
  /** Re-reads calendars that are due (or all, with `force`); true if any were. */
  refreshCalendars: (today: Day, force: boolean) => invoke<boolean>("plan_refresh_calendars", { today, force }),
  /** Opens the provider's sign-in page in the browser and waits for it. */
  connectCalendar: (provider: "google" | "microsoft", today: Day) =>
    invoke<CalendarAccount>("plan_connect_calendar", { provider, today }),
  cancelCalendarSignIn: () => invoke<void>("plan_cancel_calendar_sign_in"),
  /** iCloud when `server` is empty. */
  connectCaldav: (server: string, username: string, password: string, today: Day) =>
    invoke<CalendarAccount>("plan_connect_caldav", { server, username, password, today }),
  removeCalendarAccount: (id: string) => invoke<void>("plan_remove_calendar_account", { id }),
  showCalendar: (id: string, shown: boolean, today: Day) => invoke<void>("plan_show_calendar", { id, shown, today }),
  /** Publishes the plan into a calendar, or stops with null. */
  publishTo: (calendarId: string | null, today: Day) => invoke<void>("plan_publish_to", { calendarId, today }),
  /** Makes an "Axiom" calendar in an account and publishes the plan there. */
  createPlanCalendar: (accountId: string, today: Day) => invoke<Calendar>("plan_create_plan_calendar", { accountId, today }),
  /** Changes an event in its own calendar. */
  updateEvent: (id: string, edit: EventEdit, today: Day) => invoke<void>("plan_update_event", { id, edit, today }),
  deleteEvent: (id: string, today: Day) => invoke<void>("plan_delete_event", { id, today }),
};

let nudge: number | undefined;

/** After the plan changes: publish it to the calendar (if one is chosen) a
 * few seconds later, once a burst of edits has settled. */
export function nudgeCalendars(today: Day) {
  window.clearTimeout(nudge);
  nudge = window.setTimeout(() => {
    api.refreshCalendars(today, false).catch(() => {
      // Problems are noted on the calendar; the Calendars dialog shows them.
    });
  }, 4000);
}

/** Minutes tracked on a task, including a running timer. */
export function trackedMinutes(task: PlanTask, now = Date.now()): number {
  const running = task.timerStartedAt ? (now - Date.parse(task.timerStartedAt)) / 60_000 : 0;
  return task.actualMinutes + Math.max(0, running);
}

/** Drag data for a board card, sharing the task drag type: "card:<id>". */
export const cardDragId = (cardId: string) => `card:${cardId}`;
export const cardFromDrag = (id: string) => (id.startsWith("card:") ? id.slice(5) : null);

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
}
