import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataChanged } from "../../lib/sync";
import { api as birthdays } from "../birthdays/api";
import { api as plan } from "../daily_plan/api";
import { nowMinute, today } from "../daily_plan/time";
import { api as goals } from "../goals/api";
import { api as learning } from "../learning/api";
import { api as reading } from "../reading/api";
import { api as uni } from "../uni/api";
import { brief, type Briefing, type Sources } from "./briefing";
import { useLemmaAreas, useName } from "./parts";
import { usePersona } from "./persona";

/** How each area is asked for what Lemma talks about. */
const LOADERS: { [K in keyof Sources]-?: (day: string) => Promise<NonNullable<Sources[K]>> } = {
  daily_plan: (day) => plan.summary(day, nowMinute()),
  uni: (day) => uni.summary(day),
  learning: (day) => learning.summary(day),
  reading: (day) => reading.summary(day),
  birthdays: (day) => birthdays.list(day),
  goals: (day) => goals.summary(day),
};

/** Lemma's briefing on the areas that are on, kept fresh: after any change or
 *  sync, on coming back to the window, and every few minutes (the clock moves
 *  the plan on). An area that can't answer is simply left out. */
export function useBriefing(enabled = true): Briefing | null {
  const areas = useLemmaAreas();
  const ids = areas.map((a) => a.id).filter((id): id is keyof Sources => id in LOADERS).join();
  const name = useName();
  const { personality } = usePersona();
  const [sources, setSources] = useState<Sources | null>(null);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  const request = useRef(0);

  const load = useCallback(() => {
    if (!enabled) return;
    const id = ++request.current;
    const day = today();
    const wanted = (ids ? ids.split(",") : []) as (keyof Sources)[];
    void Promise.allSettled(wanted.map((area) => LOADERS[area](day))).then((results) => {
      if (id !== request.current) return;
      const next: Sources = {};
      results.forEach((r, i) => { if (r.status === "fulfilled") (next as Record<string, unknown>)[wanted[i]] = r.value; });
      setSources(next);
      setMinute(Math.floor(Date.now() / 60_000));
    });
  }, [enabled, ids]);

  useEffect(() => {
    load();
    if (!enabled) return () => { request.current++; };
    const timer = window.setInterval(load, 5 * 60_000);
    window.addEventListener("focus", load);
    return () => { request.current++; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [load, enabled]);
  useDataChanged(load);

  // Worded for when it was last loaded, so the greeting and evening nudges move on with the day.
  return useMemo(() => (sources ? brief(sources, { name, personality, now: new Date(minute * 60_000) }) : null), [sources, name, personality, minute]);
}
