import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../../lib/settings";
import { DEFAULTS, VIEWS, type BoardTilePreferences } from "./model";

const KEY = "axiom.projectBoard.overviewLayouts.v1";
function read(value: unknown): Record<string, BoardTilePreferences> {
  const saved: Record<string, BoardTilePreferences> = {};
  try {
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
  return saved;
}
let saved = read(readSetting(KEY));
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
onSettingSynced(KEY, (value) => { saved = read(value); listeners.forEach((listener) => listener()); });
export function useBoardTilePreferences(size: { w: number; h: number }) {
  const key = `${size.w}x${size.h}`;
  const prefs = useSyncExternalStore(subscribe, () => saved[key] ?? DEFAULTS);
  const update = (change: Partial<BoardTilePreferences>) => {
    saved = { ...saved, [key]: { ...(saved[key] ?? DEFAULTS), ...change } };
    saveSetting(KEY, saved);
    listeners.forEach((listener) => listener());
  };
  return { prefs, update };
}
