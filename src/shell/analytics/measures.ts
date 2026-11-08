import type { AnalyticsContribution, Measure } from "../../extensions/types";
import { duration } from "../../features/daily_plan/time";

/** Ties an area's loader, headline and section to one report shape. */
export const defineAnalytics = <R>(analytics: AnalyticsContribution<R>): AnalyticsContribution<R> => analytics;

export const COUNT: Measure = { format: (n) => Math.round(n).toLocaleString(), better: "up" };

/** Minutes, written as "1h 30m". */
export const MINUTES: Measure = { format: (n) => duration(Math.round(n)), better: "up" };

/** Minutes as whole hours on an axis: "2h", or "30m" under an hour. */
export const axisMinutes = (n: number) => (n === 0 ? "0" : n >= 60 ? `${Math.round((n / 60) * 10) / 10}h` : `${Math.round(n)}m`);

/** A share, 0 to 100. */
export const PERCENT: Measure = { format: (n) => `${Math.round(n)}%`, better: "up", percent: true };

/** A 1 to 5 average. */
export const RATING: Measure = { format: (n) => n.toFixed(1), better: "up" };

/** "3 days", "1 day". */
export const plural = (n: number, one: string, many = `${one}s`) => `${Math.round(n).toLocaleString()} ${Math.round(n) === 1 ? one : many}`;

/** The same measure, but where less is better (spending, time over). */
export const lessIsBetter = (m: Measure): Measure => ({ ...m, better: "down" });

export const neutral = (m: Measure): Measure => ({ ...m, better: "neutral" });

/** Values of the days that have happened; later days are null. */
export const soFar = <T extends { day: string }>(days: T[], today: string, value: (d: T) => number | null) =>
  days.map((d) => (d.day > today ? null : value(d)));

/** A running total of the days that have happened. */
export function cumulative(values: (number | null)[]): (number | null)[] {
  let sum = 0;
  return values.map((v) => (v === null ? null : (sum += v)));
}
