import type { Day } from "./api";

/** A Date's day, "YYYY-MM-DD", in local time. */
export function dayOf(date: Date): Day {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const today = (): Day => dayOf(new Date());

/** Noon on a day, so adding days never trips over a clock change. */
function noon(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(day: Day, n: number): Day {
  const date = noon(day);
  date.setDate(date.getDate() + n);
  return dayOf(date);
}

/** The Monday of a day's week. */
export function mondayOf(day: Day): Day {
  return addDays(day, -((noon(day).getDay() + 6) % 7));
}

/** The first of the month `n` months from `day`'s. */
export function addMonths(day: Day, n: number): Day {
  const date = noon(day);
  return dayOf(new Date(date.getFullYear(), date.getMonth() + n, 1, 12));
}

/** The first of a day's month. */
export const monthOf = (day: Day): Day => `${day.slice(0, 7)}-01`;

/** "October 2026". */
export function monthName(day: Day, withYear = true): string {
  return noon(day).toLocaleDateString("en-GB", withYear ? { month: "long", year: "numeric" } : { month: "long" });
}

/** "Wednesday 22 October". */
export function longDay(day: Day): string {
  return noon(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** "Wed 22 October", for the toolbar. */
export function mediumDay(day: Day): string {
  return noon(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });
}

/** "Today", "Tomorrow", "Yesterday", or the weekday and date. */
export function relativeDay(day: Day, now: Day): string {
  if (day === now) return "Today";
  if (day === addDays(now, 1)) return "Tomorrow";
  if (day === addDays(now, -1)) return "Yesterday";
  return noon(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Minutes since midnight now. */
export function nowMinute(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** 870 -> "14:30". */
export function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "14:30" -> 870, or null if it isn't a time. */
export function parseClock(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** 95 -> "1h 35m", 45 -> "45m", 120 -> "2h". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "45m", "1h", "1h30", "1.5h", "90" -> minutes, or null. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  let minutes: number;
  const hm = /^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/.exec(t);
  if (hm) minutes = Number(hm[1]) * 60 + (hm[2] ? Number(hm[2]) : 0);
  else if (/^\d+(m|min|mins)?$/.test(t)) minutes = parseInt(t, 10);
  else return null;
  minutes = Math.round(minutes);
  return minutes >= 1 && minutes <= 24 * 60 ? minutes : null;
}
