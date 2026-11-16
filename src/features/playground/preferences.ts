import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../lib/settings";
import { METRICS, PERIODS } from "./metrics";
import type { Period, Scope } from "./api";

export interface BoardFilters { metric: string; period: Period; scope: Scope }
export interface PlaygroundOptions {
  defaultBoard: BoardFilters;
  compact: boolean;
  companions: boolean;
  podium: boolean;
  reducedMotion: boolean;
  alerts: { cheers: boolean; overtaken: boolean; results: boolean };
}
const KEY = "axiom.playground.preferences.v1";
const VIEW_KEY = "axiom.playground.view";
const DEFAULT_BOARD: BoardFilters = { metric: "active", period: "week", scope: "friends" };
export function parseBoardFilters(raw: unknown, fallback = DEFAULT_BOARD): BoardFilters {
  const p = raw && typeof raw === "object" ? raw as Partial<BoardFilters> : {};
  const metric = METRICS.find(m => m.id === p.metric);
  return {
    metric: metric?.id ?? fallback.metric,
    period: PERIODS.some(x => x.id === p.period) ? p.period! : fallback.period,
    scope: (p.scope ?? fallback.scope) === "global" && (metric ?? METRICS.find(m => m.id === fallback.metric))?.global ? "global" : "friends",
  };
}
function parse(raw: unknown): PlaygroundOptions {
  const p = raw && typeof raw === "object" ? raw as Partial<PlaygroundOptions> : {};
  return {
    defaultBoard: parseBoardFilters(p.defaultBoard),
    compact: p.compact === true, companions: p.companions !== false, podium: p.podium !== false,
    reducedMotion: p.reducedMotion === true,
    alerts: { cheers: p.alerts?.cheers !== false, overtaken: p.alerts?.overtaken !== false, results: p.alerts?.results !== false },
  };
}
let options = parse(readSetting(KEY));
const listeners = new Set<() => void>();
onSettingSynced(KEY, raw => { options = parse(raw); listeners.forEach(l => l()); });
export function usePlaygroundOptions() {
  const value = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => options);
  const update = (change: Partial<PlaygroundOptions>) => {
    options = parse({ ...options, ...change });
    saveSetting(KEY, options);
    listeners.forEach(l => l());
  };
  return { options: value, update };
}

let filters = parseBoardFilters(readSetting(VIEW_KEY), options.defaultBoard);
const boardListeners = new Set<() => void>();
onSettingSynced(VIEW_KEY, raw => { filters = parseBoardFilters(raw, options.defaultBoard); boardListeners.forEach(l => l()); });
export function setBoardFilters(next: BoardFilters) {
  filters = parseBoardFilters(next);
  saveSetting(VIEW_KEY, filters);
  boardListeners.forEach(l => l());
}
export function useBoardFilters(): [BoardFilters, typeof setBoardFilters] {
  const value = useSyncExternalStore(l => { boardListeners.add(l); return () => { boardListeners.delete(l); }; }, () => filters);
  return [value, setBoardFilters];
}

let requestedOpen = false;
const openListeners = new Set<() => void>();
/** An overview click opens the matching board. */
export function openLeaderboards(next: BoardFilters) {
  setBoardFilters(next);
  if (openListeners.size) openListeners.forEach(l => l());
  else requestedOpen = true;
}
/** The Playground opens on the leaderboards; Nexus is a hidden door (`nexus` = it's been found). */
export function usePlaygroundMode() {
  const { options } = usePlaygroundOptions();
  const opening = useRef({ filters: requestedOpen ? filters : options.defaultBoard });
  const [mode, setMode] = useState<"boards" | "nexus">("boards");
  useLayoutEffect(() => {
    if (filters !== opening.current.filters) setBoardFilters(opening.current.filters);
    requestedOpen = false;
    const back = () => setMode("boards");
    openListeners.add(back);
    return () => { openListeners.delete(back); };
  }, []);
  return [mode, setMode] as const;
}
