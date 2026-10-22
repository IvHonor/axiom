import type { DayPlan, PlanTask } from "../api";
import { clock } from "../time";

export type View = "glance" | "focus" | "agenda" | "tasks" | "priorities" | "progress" | "strip" | "timeline" | "split" | "week" | "month";
export type Density = "auto" | "comfortable" | "compact";
export interface Preferences {
  view: View | "auto";
  density: Density;
  hours: "scheduled" | "working" | "full";
  completed: boolean;
  earlier: boolean;
}
export const DEFAULTS: Preferences = { view: "auto", density: "auto", hours: "scheduled", completed: false, earlier: false };
export const VIEWS: { id: View; label: string; description: string; width: number; height: number; shape: string }[] = [
  { id: "glance", label: "At a glance", description: "Next item and task count", width: 0, height: 0, shape: "Smallest tiles" },
  { id: "focus", label: "Now & next", description: "Current event, next event and a task", width: 140, height: 92, shape: "Compact tiles" },
  { id: "agenda", label: "Today's agenda", description: "Events and unscheduled tasks, with pages", width: 150, height: 145, shape: "Medium or tall tiles" },
  { id: "tasks", label: "Task list", description: "Today's checklist, including unscheduled work", width: 140, height: 92, shape: "Compact or tall tiles" },
  { id: "priorities", label: "Top priorities", description: "Your three focus tasks, in order", width: 140, height: 92, shape: "Compact tiles" },
  { id: "progress", label: "Daily progress", description: "Completion, time planned and next task", width: 160, height: 115, shape: "Compact or wide tiles" },
  { id: "strip", label: "Day strip", description: "A horizontal schedule above today's tasks", width: 440, height: 220, shape: "Wide tiles" },
  { id: "timeline", label: "Fitted timeline", description: "The day's hours fit without scrolling", width: 250, height: 430, shape: "Tall tiles" },
  { id: "split", label: "Schedule + tasks", description: "Fitted calendar and checklist side by side", width: 570, height: 430, shape: "Large tiles" },
  { id: "week", label: "Week overview", description: "Seven days of events and task counts", width: 570, height: 245, shape: "Wide, medium-height tiles" },
  { id: "month", label: "Month overview", description: "Month grid with daily workload indicators", width: 420, height: 405, shape: "Large tiles" },
];
export const fits = (view: View, width: number, height: number) => {
  const option = VIEWS.find((v) => v.id === view)!;
  return width >= option.width && height >= option.height;
};
export function recommendedView(width: number, height: number): View {
  if (fits("split", width, height)) return "split";
  if (fits("timeline", width, height)) return "timeline";
  if (fits("strip", width, height) && height < 260) return "strip";
  if (fits("agenda", width, height)) return "agenda";
  if (fits("focus", width, height)) return "focus";
  return "glance";
}
export function resolveView(prefs: Preferences, width: number, height: number) {
  const recommended = recommendedView(width, height);
  return prefs.view !== "auto" && fits(prefs.view, width, height) ? prefs.view : recommended;
}
export const rowHeight = (density: Density, height: number) => density === "compact" || (density === "auto" && height < 240) ? 30 : 42;

export interface Item {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  color: string;
  task?: PlanTask;
  eventId?: string;
}
export function scheduleItems(plan: DayPlan): Item[] {
  return [
    ...plan.blocks.map((block) => {
      const task = plan.tasks.find((t) => t.id === block.taskId);
      return { id: `block-${block.id}`, title: task?.title ?? block.title, start: block.startMinute,
        end: Math.min(1440, block.startMinute + block.durationMinutes), allDay: false, color: block.color, task };
    }),
    ...plan.events.map((event) => ({ id: `event-${event.id}`, title: event.title, start: event.startMinute,
      end: Math.min(1440, event.startMinute + event.durationMinutes), allDay: event.allDay, color: event.color, eventId: event.id })),
  ].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.id.localeCompare(b.id));
}
export const itemTime = (item: Item) => item.allDay ? "All day" : `${clock(item.start)}–${clock(item.end)}`;
export const sortedTasks = (tasks: PlanTask[]) => [...tasks].sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || (a.focusRank ?? 99) - (b.focusRank ?? 99) || a.position - b.position);

export function timeRange(items: Item[], plan: DayPlan, hours: Preferences["hours"]): [number, number] {
  if (hours === "full") return [0, 1440];
  const timed = items.filter((item) => !item.allDay);
  let start = plan.settings.dayStartMinute;
  let end = plan.settings.dayEndMinute;
  if (hours === "scheduled" && timed.length) {
    start = Math.min(...timed.map((item) => item.start));
    end = Math.max(...timed.map((item) => item.end));
  }
  // Always include events outside working hours rather than silently clipping them.
  start = Math.min(start, ...timed.map((item) => item.start));
  end = Math.max(end, ...timed.map((item) => item.end));
  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.min(1440, Math.max(start + 180, Math.ceil(end / 60) * 60));
  return [Math.min(start, end - 180), end];
}

/** Allocate lanes using the rendered height, so short events cannot cover each other. */
export function lanes(items: Item[], minMinutes = 0) {
  const result = new Map<string, { lane: number; count: number }>();
  const timed = items.filter((item) => !item.allDay).sort((a, b) => a.start - b.start);
  let group: Item[] = [];
  let groupEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    for (const item of group) {
      let lane = ends.findIndex((end) => end <= item.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = Math.max(item.end, item.start + minMinutes);
      result.set(item.id, { lane, count: 0 });
    }
    group.forEach((item) => { result.get(item.id)!.count = ends.length; });
  };
  for (const item of timed) {
    if (item.start >= groupEnd) { flush(); group = []; groupEnd = -1; }
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end, item.start + minMinutes);
  }
  flush();
  return result;
}
