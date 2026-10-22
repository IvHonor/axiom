import { useSyncExternalStore } from "react";
import { DEFAULTS, VIEWS, type BoardTilePreferences } from "./model";

const KEY = "axiom.projectBoard.overviewLayouts.v1";
let saved: Record<string, BoardTilePreferences> = {};
try {
  const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, prefs] of Object.entries(value)) {
      if (!/^\d+x\d+$/.test(key) || !prefs || typeof prefs !== "object") continue;
      saved[key] = {
        view: prefs.view === "auto" || VIEWS.some((view) => view.id === prefs.view) ? prefs.view : "auto",
        project: typeof prefs.project === "string" ? prefs.project : "all",
        density: ["auto", "comfortable", "compact"].includes(prefs.density) ? prefs.density : "auto",
        sort: ["urgency", "due", "priority", "updated", "board"].includes(prefs.sort) ? prefs.sort : "urgency",
        completed: prefs.completed === true, subtasks: prefs.subtasks === true, details: prefs.details !== false,
        horizon: [7, 14, 30, 90].includes(prefs.horizon) ? prefs.horizon : 14,
        label: typeof prefs.label === "string" ? prefs.label : "all",
        priority: ["all", "0", "1", "2", "3"].includes(prefs.priority) ? prefs.priority : "all",
      };
    }
  }
} catch { /* Invalid or unavailable local storage starts in Auto. */ }
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useBoardTilePreferences(size: { w: number; h: number }) {
  const key = `${size.w}x${size.h}`;
  const prefs = useSyncExternalStore(subscribe, () => saved[key] ?? DEFAULTS);
  const update = (change: Partial<BoardTilePreferences>) => {
    saved = { ...saved, [key]: { ...(saved[key] ?? DEFAULTS), ...change } };
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* Preferences remain usable for this session. */ }
    listeners.forEach((listener) => listener());
  };
  return { prefs, update };
}
