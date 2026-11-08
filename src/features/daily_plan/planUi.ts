// Which planner view is showing and which dialog is open, shared by the
// planner and its items in the sidebar (PlanNav).
import { useSyncExternalStore } from "react";
import { onSettingSynced, readSetting, saveSetting } from "../../lib/settings";

export type PlanView = "day" | "week" | "month" | "year" | "insights";

export const PLAN_VIEWS: PlanView[] = ["day", "week", "month", "year", "insights"];

export type PlanDialog =
  | { kind: "routines" }
  /** `start` goes straight into connecting that kind of account. */
  | { kind: "calendars"; start?: "google" | "microsoft" | "caldav" }
  | null;

interface PlanUi {
  view: PlanView;
  dialog: PlanDialog;
  /** Bumped to send the planner back to today. */
  todayAsked: number;
  /** Bumped whenever the plan changes here, so the sidebar re-reads it. */
  revision: number;
  /** The calendar event open in the event panel. */
  event: string | null;
}

const VIEW_KEY = "axiom.dailyPlan.view";

const viewFrom = (saved: unknown): PlanView => PLAN_VIEWS.find((view) => view === saved) ?? "day";

let state: PlanUi = { view: viewFrom(readSetting(VIEW_KEY)), dialog: null, todayAsked: 0, revision: 0, event: null };
const listeners = new Set<() => void>();

onSettingSynced(VIEW_KEY, (saved) => {
  state = { ...state, view: viewFrom(saved) };
  listeners.forEach((listener) => listener());
});

export function setPlanUi(change: Partial<PlanUi>) {
  state = { ...state, ...change };
  if (change.view) saveSetting(VIEW_KEY, change.view);
  listeners.forEach((listener) => listener());
}

export function usePlanUi(): PlanUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Shows today in the day view. */
export function showToday() {
  setPlanUi({ view: "day", todayAsked: state.todayAsked + 1 });
}

/** Tells the sidebar the plan changed. */
export function planChanged() {
  setPlanUi({ revision: state.revision + 1 });
}
