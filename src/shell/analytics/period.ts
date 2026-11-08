import type { Day } from "../../features/daily_plan/api";
import { addDays, addMonths, mondayOf, monthOf, today } from "../../features/daily_plan/time";

export type PeriodUnit = "week" | "month";

/** The week (Monday on) or month the Analytics view reports on. Mirrors
 * `Period` in src-tauri/src/features/period.rs. */
export interface Period {
  unit: PeriodUnit;
  /** Its first day. */
  start: Day;
  /** The day after its last. */
  end: Day;
  today: Day;
}

/** What every area's analytics command takes. */
export const periodArgs = (p: Period) => ({ unit: p.unit, day: p.start, today: p.today });

export function periodOf(unit: PeriodUnit, day: Day, now: Day = today()): Period {
  const start = unit === "week" ? mondayOf(day) : monthOf(day);
  return { unit, start, end: unit === "week" ? addDays(start, 7) : addMonths(start, 1), today: now };
}

export const shiftPeriod = (p: Period, by: number) =>
  periodOf(p.unit, p.unit === "week" ? addDays(p.start, 7 * by) : addMonths(p.start, by), p.today);

export const isCurrent = (p: Period) => p.today >= p.start && p.today < p.end;

export function daysOf(p: Period): Day[] {
  const days: Day[] = [];
  for (let d = p.start; d < p.end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** "This week", "Last week", "Week of 12 Oct", "November", "March 2025". */
export function periodName(p: Period): string {
  const current = periodOf(p.unit, p.today, p.today);
  if (p.start === current.start) return p.unit === "week" ? "This week" : "This month";
  if (p.start === shiftPeriod(current, -1).start) return p.unit === "week" ? "Last week" : "Last month";
  const date = new Date(`${p.start}T00:00`);
  if (p.unit === "week") {
    const sameYear = p.start.slice(0, 4) === p.today.slice(0, 4);
    return `Week of ${date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })}`;
  }
  return date.toLocaleDateString(undefined, { month: "long", ...(p.start.slice(0, 4) === p.today.slice(0, 4) ? {} : { year: "numeric" }) });
}

/** The dates it covers, for under the name: "2 – 8 Nov 2026", "1 – 30 Nov 2026". */
export function periodRange(p: Period): string {
  const first = new Date(`${p.start}T00:00`);
  const last = new Date(`${addDays(p.end, -1)}T00:00`);
  const sameMonth = first.getMonth() === last.getMonth();
  const from = first.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const to = last.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `${from} – ${to}`;
}

/** What a comparison is against, in words. */
export const previousName = (p: Period) => (p.unit === "week" ? "last week" : "last month");
