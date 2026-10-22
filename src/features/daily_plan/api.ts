// Typed wrappers for the Daily Plan's Tauri commands.
// Mirrors src-tauri/src/features/daily_plan/{entities,types}.rs.
import { invoke } from "@tauri-apps/api/core";

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
  /** Unfinished tasks from earlier days (only for today). */
  earlier: PlanTask[];
  inbox: PlanTask[];
  settings: Settings;
  info: DayInfo;
  /** Board cards linked to the tasks above. */
  cards: Card[];
  /** Board cards due, overdue or in progress, not planned yet. */
  suggestions: Card[];
  /** The task being timed, on any day. */
  running: PlanTask | null;
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
  summary: (today: Day, nowMinute: number) => invoke<TodaySummary>("plan_summary", { today, nowMinute }),
  quickAdd: (text: string, day: Day, today: Day) =>
    invoke<{ task: PlanTask; block: Block | null }>("plan_quick_add", { text, day, today }),
  createTask: (title: string, day: Day | null, estimateMinutes: number | null) =>
    invoke<PlanTask>("plan_create_task", { title, day, estimateMinutes }),
  updateTask: (id: string, fields: TaskFields) => invoke<PlanTask>("plan_update_task", { id, fields }),
  setDone: (id: string, done: boolean) => invoke<PlanTask>("plan_set_done", { id, done }),
  setFocus: (id: string, focus: boolean) => invoke<PlanTask>("plan_set_focus", { id, focus }),
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
};

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
