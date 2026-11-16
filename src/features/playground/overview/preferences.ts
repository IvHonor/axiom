// The Playground tile's settings, one set per tile size (as Reading's are),
// synced with the profile so a layout chosen on one computer is there on the
// others.
import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../../lib/settings";
import { METRICS, PERIODS } from "../metrics";
import { DEFAULTS, VIEWS, type Preferences } from "./model";

const KEY = "axiom.playground.overviewLayouts.v1";

function read(raw: unknown): Record<string, Preferences> {
  const saved: Record<string, Preferences> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return saved;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d+x\d+$/.test(key) || !value || typeof value !== "object") continue;
    const p = value as Partial<Preferences>;
    saved[key] = {
      view: (p.view as string) === "hub" ? "board" : p.view === "auto" || VIEWS.some((v) => v.id === p.view) ? p.view! : "auto",
      metric: METRICS.some((m) => m.id === p.metric) ? p.metric! : DEFAULTS.metric,
      scope: p.scope === "global" ? "global" : "friends",
      period: PERIODS.some((x) => x.id === p.period) ? p.period! : DEFAULTS.period,
    };
  }
  return saved;
}

let saved = read(readSetting(KEY));
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
onSettingSynced(KEY, (raw) => {
  saved = read(raw);
  listeners.forEach((l) => l());
});

export function usePlaygroundPreferences(size: { w: number; h: number }) {
  const key = `${size.w}x${size.h}`;
  const prefs = useSyncExternalStore(subscribe, () => saved[key] ?? DEFAULTS);
  const update = (change: Partial<Preferences>) => {
    saved = { ...saved, [key]: { ...(saved[key] ?? DEFAULTS), ...change } };
    saveSetting(KEY, saved);
    listeners.forEach((l) => l());
  };
  return { prefs, update };
}
