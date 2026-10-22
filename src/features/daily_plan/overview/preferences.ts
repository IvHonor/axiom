import { useSyncExternalStore } from "react";
import { DEFAULTS, VIEWS, type Preferences } from "./model";

const KEY = "axiom.dailyPlan.overviewLayouts.v2";
let saved: Record<string, Preferences> = {};
try {
  const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, prefs] of Object.entries(value)) {
      if (!/^\d+x\d+$/.test(key) || !prefs || typeof prefs !== "object") continue;
      saved[key] = {
        view: prefs.view === "auto" || VIEWS.some((v) => v.id === prefs.view) ? prefs.view : DEFAULTS.view,
        density: ["auto", "compact", "comfortable"].includes(prefs.density) ? prefs.density : DEFAULTS.density,
        hours: ["scheduled", "working", "full"].includes(prefs.hours) ? prefs.hours : DEFAULTS.hours,
        completed: prefs.completed === true,
        earlier: prefs.earlier === true,
      };
    }
  }
} catch { /* A missing or corrupt preference should always fall back to Auto. */ }
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useOverviewPreferences(size: { w: number; h: number }) {
  const key = `${size.w}x${size.h}`;
  const prefs = useSyncExternalStore(subscribe, () => saved[key] ?? DEFAULTS);
  const update = (change: Partial<Preferences>) => {
    saved = { ...saved, [key]: { ...prefs, ...change } };
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* Optional local preference. */ }
    listeners.forEach((listener) => listener());
  };
  return { prefs, update };
}
