import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../../lib/settings";
import { DEFAULTS, VIEWS, type Preferences } from "./model";

const KEY = "axiom.uni.overviewLayouts.v1";
function read(raw: unknown): Record<string, Preferences> {
  const saved: Record<string, Preferences> = {};
  try {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw)) {
        if (!/^\d+x\d+$/.test(key) || !value || typeof value !== "object") continue;
        const prefs = value as Partial<Preferences>;
        saved[key] = {
          view: prefs.view === "auto" || VIEWS.some(view => view.id === prefs.view) ? prefs.view! : "auto",
          density: ["auto", "comfortable", "compact"].includes(prefs.density ?? "") ? prefs.density! : "auto",
          sort: ["position", "behind", "progress", "name"].includes(prefs.sort ?? "") ? prefs.sort! : "position",
          scope: ["all", "behind", "shaky"].includes(prefs.scope ?? "") ? prefs.scope! : "all",
          details: prefs.details !== false,
        };
      }
    }
  } catch { /* Missing or corrupt settings start in Auto. */ }
  return saved;
}
let saved = read(readSetting(KEY));
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
onSettingSynced(KEY, raw => { saved = read(raw); listeners.forEach(listener => listener()); });
export function useUniPreferences(size: {w: number; h: number}) {
  const key = `${size.w}x${size.h}`;
  const prefs = useSyncExternalStore(subscribe, () => saved[key] ?? DEFAULTS);
  const update = (change: Partial<Preferences>) => {
    saved = {...saved, [key]: {...(saved[key] ?? DEFAULTS), ...change}};
    saveSetting(KEY, saved);
    listeners.forEach(listener => listener());
  };
  return {prefs, update};
}
