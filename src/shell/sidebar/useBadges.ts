// Little badges on the area icons, so the sidebar needn't be opened to see
// what's waiting: a timer running, reviews due, birthdays today, bills due,
// lectures to catch up on. Looked at again when anything changes, and every
// couple of minutes.
import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { api as birthdays } from "../../features/birthdays/api";
import { today } from "../../features/daily_plan/time";
import { api as finance } from "../../features/finance/api";
import { api as learning } from "../../features/learning/api";
import { api as uni } from "../../features/uni/api";
import { useDataChanged, useTauriEvent } from "../../lib/sync";

export interface Badge {
  /** A number to show, or a dot when there's no number to it. */
  count: number | null;
  /** What it means, for its tooltip. */
  label: string;
}

const AGAIN_MS = 2 * 60_000;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Each area's badge (if it has one), for the installed areas in `ids`. */
export function useBadges(ids: string[], timerRunning: boolean): Record<string, Badge> {
  const [found, setFound] = useState<Record<string, Badge>>({});
  const key = ids.join();
  const look = useCallback(() => {
    if (!isTauri()) return;
    const day = today();
    const has = (id: string) => key.split(",").includes(id);
    const asks: Promise<[string, Badge | null]>[] = [];
    if (has("learning")) asks.push(learning.summary(day).then((s) => ["learning", s.reviews.length ? { count: s.reviews.length, label: plural(s.reviews.length, "review") + " due" } : null], () => ["learning", null]));
    if (has("birthdays")) asks.push(birthdays.list(day).then((people) => { const n = people.filter((p) => p.days === 0).length; return ["birthdays", n ? { count: n, label: `${plural(n, "birthday")} or anniversaries today` } : null]; }, () => ["birthdays", null]));
    if (has("finance")) asks.push(finance.month(day.slice(0, 7), day).then((m) => { const n = m.due.filter((d) => d.day <= day).length; return ["finance", n ? { count: n, label: `${plural(n, "bill")} to confirm` } : null]; }, () => ["finance", null]));
    if (has("uni")) asks.push(uni.summary(day).then((s) => ["uni", s.behind.length ? { count: s.behind.length, label: `${plural(s.behind.length, "lecture")} to catch up on` } : null], () => ["uni", null]));
    void Promise.all(asks).then((all) => setFound(Object.fromEntries(all.filter((a): a is [string, Badge] => a[1] !== null))));
  }, [key]);
  useEffect(() => {
    look();
    const every = setInterval(look, AGAIN_MS);
    return () => clearInterval(every);
  }, [look]);
  useDataChanged(look);
  useTauriEvent("timer-changed", look);
  return timerRunning ? { ...found, daily_plan: { count: null, label: "A timer's running" } } : found;
}
