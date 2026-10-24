// What Goals shows, shared by its view, side panel and overview tile: the
// shelf, the area, the open goal and the open dialog.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDataChanged } from "../../lib/sync";
import { today } from "../daily_plan/time";
import { api, errorMessage, type Area, type Goal, type GoalDetail, type GoalFields } from "./api";

export type Shelf = "active" | "achieved" | "all";

/** Editing a goal, or a new one (maybe from a starting idea). */
export type GoalsDialog = { kind: "goal"; id: string | null; preset?: Partial<GoalFields> };

interface GoalsUi {
  shelf: Shelf;
  area: Area | null;
  /** The goal open beside the list. */
  goal: string | null;
  dialog: GoalsDialog | null;
  /** Bumped after any change here, so lists re-read. */
  revision: number;
}

let state: GoalsUi = { shelf: "active", area: null, goal: null, dialog: null, revision: 0 };
const listeners = new Set<() => void>();

export function setGoalsUi(change: Partial<GoalsUi>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

export const goalsChanged = () => setGoalsUi({ revision: state.revision + 1 });

export function useGoalsUi(): GoalsUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Reads again after any change here or a sync (other extensions' changes
 * move goals that follow them), and when the day turns. */
function useGoalsData<T>(read: (day: string) => Promise<T>, key: string): { data: T | null; error: string | null } {
  const { revision } = useGoalsUi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reader = useRef(read);
  reader.current = read;
  const day = today();
  const load = useCallback(() => {
    reader.current(today()).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (err) => setError(errorMessage(err)),
    );
  }, []);
  useEffect(load, [load, revision, key, day]);
  useDataChanged(load);
  // Progress made in other extensions shows when you come back.
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [load]);
  return { data, error };
}

export const useGoals = () => useGoalsData<Goal[]>((day) => api.list(day), "");

export const useGoal = (id: string) => useGoalsData<GoalDetail>((day) => api.get(id, day), id);
