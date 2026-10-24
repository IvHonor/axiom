import { useSyncExternalStore } from "react";
import { DEFAULTS, VIEWS, type Preferences } from "./model";

const KEY = "axiom.reading.overviewLayouts.v1";
let saved: Record<string, Preferences> = {};
try {
  const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (!/^\d+x\d+$/.test(key) || !value || typeof value !== "object") continue;
      const prefs = value as Partial<Preferences>;
      saved[key] = {
        view: prefs.view === "auto" || VIEWS.some(view => view.id === prefs.view) ? prefs.view! : "auto",
        density: ["auto", "comfortable", "compact"].includes(prefs.density ?? "") ? prefs.density! : "auto",
        sort: ["recent", "position", "progress", "title"].includes(prefs.sort ?? "") ? prefs.sort! : "recent",
        covers: prefs.covers !== false,
      };
    }
  }
} catch { /* A missing or corrupt preference starts in Auto. */ }
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useReadingPreferences(size: { w: number; h: number }) {
  const key = `${size.w}x${size.h}`;
  const prefs = useSyncExternalStore(subscribe, () => saved[key] ?? DEFAULTS);
  const update = (change: Partial<Preferences>) => {
    saved = { ...saved, [key]: { ...(saved[key] ?? DEFAULTS), ...change } };
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* Settings still work for this session. */ }
    listeners.forEach(listener => listener());
  };
  return { prefs, update };
}
