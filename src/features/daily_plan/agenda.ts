// A day as a list in time order, for the week and month views.
import type { CalendarEvent, DaySlice, PlanTask } from "./api";

export type AgendaItem =
  /** From an imported calendar: fixed. */
  | { kind: "event"; id: string; start: number; minutes: number; title: string; color: string; busy: boolean }
  /** A block that isn't for a task: a routine, lunch, a meeting typed in by hand. */
  | { kind: "block"; id: string; start: number; minutes: number; title: string; color: string; routine: boolean }
  /** A task, at its block's time if it has one. */
  | { kind: "task"; id: string; start: number | null; minutes: number | null; task: PlanTask; color: string | null };

export interface Agenda {
  allDay: CalendarEvent[];
  /** Things with a time, earliest first. */
  timed: AgendaItem[];
  /** Tasks without a time, top priorities first. */
  anytime: AgendaItem[];
}

export function agenda(slice: DaySlice): Agenda {
  const timed: AgendaItem[] = [];
  for (const e of slice.events) {
    if (!e.allDay) timed.push({ kind: "event", id: e.id, start: e.startMinute, minutes: e.durationMinutes, title: e.title, color: e.color, busy: e.busy });
  }
  for (const b of slice.blocks) {
    if (!b.taskId) {
      timed.push({ kind: "block", id: b.id, start: b.startMinute, minutes: b.durationMinutes, title: b.title || "Focus time", color: b.color, routine: !!b.routineId });
    }
  }
  const anytime: AgendaItem[] = [];
  for (const task of slice.tasks) {
    const block = slice.blocks.filter((b) => b.taskId === task.id).sort((a, b) => a.startMinute - b.startMinute)[0];
    if (block) {
      timed.push({ kind: "task", id: task.id, start: block.startMinute, minutes: block.durationMinutes, task, color: block.color });
    } else {
      anytime.push({ kind: "task", id: task.id, start: null, minutes: task.estimateMinutes, task, color: null });
    }
  }
  timed.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  return { allDay: slice.events.filter((e) => e.allDay), timed, anytime };
}

/** How long a day's plan will likely take at the user's usual pace (see Capacity). */
export function likelyMinutes(slice: DaySlice, pace: number | null): number {
  if (pace === null || Math.abs(pace - 1) < 0.1) return slice.plannedMinutes;
  const estimated = slice.tasks.filter((t) => !t.doneAt).reduce((n, t) => n + (t.estimateMinutes ?? 0), 0);
  return Math.max(0, Math.round(slice.plannedMinutes + estimated * (pace - 1)));
}
