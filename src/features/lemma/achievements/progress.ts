// How far along an achievement is: its levels (bronze, silver, gold, …) and
// the count towards the next one. Pure, with no imports, so its tests run
// anywhere (`node --test tests/achievements.mjs`).

export type Tier = "bronze" | "silver" | "gold" | "platinum" | "diamond";
/** Level 1 is bronze, 2 silver, and so on. An achievement has up to five. */
export const TIERS: Tier[] = ["bronze", "silver", "gold", "platinum", "diamond"];
/** What each level is worth, for unlocking Lemma's customisation later. Not shown yet. */
export const TIER_POINTS = [10, 25, 50, 100, 200];

/** A metric's days: "2026-11-13" → how much happened that day. */
export type Days = Record<string, number>;

/** Everything a day ever added up to. */
export const total = (days: Days) => Object.values(days).reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0);

const next = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return date.toISOString().slice(0, 10);
};

/** The longest run of consecutive days with something on them. A streak
 *  that's broken still counts: an achievement, once earned, stays earned. */
export function bestStreak(days: Days): number {
  const on = Object.keys(days).filter((d) => days[d] > 0).sort();
  let best = 0, run = 0, previous: string | null = null;
  for (const day of on) {
    run = previous && next(previous) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

const activeDays = (days: Days) => Object.keys(days).filter((d) => days[d] > 0);
const dayNumber = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
};

/** How many weeks (Monday to Sunday) had at least `atLeast` days with something on them. */
export function weeksWith(days: Days, atLeast: number): number {
  const perWeek = new Map<number, number>();
  // Day 0 was a Thursday, so adding 3 makes each block of seven start on a Monday.
  for (const day of activeDays(days)) { const week = Math.floor((dayNumber(day) + 3) / 7); perWeek.set(week, (perWeek.get(week) ?? 0) + 1); }
  return [...perWeek.values()].filter((n) => n >= atLeast).length;
}

/** How many different calendar months have something in them. */
export const monthsWith = (days: Days) => new Set(activeDays(days).map((day) => day.slice(0, 7))).size;

/** The largest single value. */
export const largest = (days: Days) => Math.max(0, ...Object.values(days).filter(Number.isFinite));

/** The most days with something on them inside any stretch of `span` days. */
export function bestWithin(days: Days, span: number): number {
  const on = Object.keys(days).filter((d) => days[d] > 0).map((day) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 864e5;
  }).sort((a, b) => a - b);
  let best = 0, start = 0;
  on.forEach((day, i) => {
    while (day - on[start] >= span) start++;
    best = Math.max(best, i - start + 1);
  });
  return best;
}

export interface Progress {
  /** Levels reached: 0 is none yet, `levels.length` is every one. */
  reached: number;
  /** The count to beat for the next level, or null once every level is reached. */
  target: number | null;
  /** How far from the last level reached to the next, 0 to 1 (1 when complete). */
  fraction: number;
}

export function progressOf(count: number, levels: number[]): Progress {
  const reached = levels.filter((l) => count >= l).length;
  if (reached === levels.length) return { reached, target: null, fraction: 1 };
  const from = reached ? levels[reached - 1] : 0;
  const target = levels[reached];
  return { reached, target, fraction: Math.max(0, Math.min(1, (count - from) / (target - from))) };
}

/** The tier of the highest level reached, or null for none. A single-level
 *  achievement is gold: earning it is the whole thing. */
export function tierOf(reached: number, levels: number): Tier | null {
  if (!reached) return null;
  return levels === 1 ? "gold" : TIERS[reached - 1];
}
