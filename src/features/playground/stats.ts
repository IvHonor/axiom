// Turns a metric's days ("2026-11-13" → how much) into what the Playground
// shares: this week and last, this month and last, all time, and streaks.
// Weeks start on Monday, as everywhere in Axiom. Days after today don't count.
import { MAX_STREAK, ruleOf, type MetricRule } from "./rules.ts";
import type { MetricStats } from "./api.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/** A local date as "YYYY-MM-DD". */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-11-13" at local midnight; noon would also do, but this keeps sums exact. */
const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (day: string, n: number) => {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

export const mondayOf = (day: string) => addDays(day, -((parse(day).getDay() + 6) % 7));
export const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`;
const nextMonth = (first: string) => {
  const d = parse(first);
  d.setMonth(d.getMonth() + 1);
  return dayKey(d);
};
const previousMonth = (first: string) => firstOfMonth(addDays(first, -1));

/** One metric's numbers as of `today`. */
export function statsFor(rule: MetricRule, days: Record<string, number>, today: string): MetricStats {
  // Only days that happened, each held to what one day can believably add.
  const counted = Object.entries(days)
    .filter(([day, n]) => day <= today && Number.isFinite(n) && n > 0)
    .map(([day, n]) => [day, Math.min(Math.round(n), rule.dailyCap)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const sum = (from: string, to: string) => counted.reduce((total, [day, n]) => (day >= from && day < to ? total + n : total), 0);

  const week = mondayOf(today);
  const month = firstOfMonth(today);

  // Runs of consecutive days.
  let best = 0, run = 0, previous: string | null = null;
  for (const [day] of counted) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  const last = previous;
  const alive = !!last && (last === today || last === addDays(today, -1));
  const streak = alive ? run : 0;

  return {
    metric: rule.id,
    weekKey: week,
    week: sum(week, addDays(week, 7)),
    lastWeek: sum(addDays(week, -7), week),
    monthKey: month,
    month: sum(month, nextMonth(month)),
    lastMonth: sum(previousMonth(month), month),
    total: Math.min(sum("0000-01-01", "9999-12-31"), rule.dailyCap * MAX_STREAK),
    streak: Math.min(streak, MAX_STREAK),
    bestStreak: Math.min(Math.max(best, streak), MAX_STREAK),
    streakThrough: alive ? last : null,
  };
}

/** Numbers for each metric in `ids` that this device knows about. */
export function allStats(days: Record<string, Record<string, number>>, ids: string[], today: string): MetricStats[] {
  return ids.flatMap((id) => {
    const rule = ruleOf(id);
    return rule && days[id] ? [statsFor(rule, days[id], today)] : [];
  });
}
