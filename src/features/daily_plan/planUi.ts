// Which planner view is showing and which dialog is open, shared by the
// planner and its items in the sidebar (PlanNav).
import { useSyncExternalStore } from "react";

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

function savedView(): PlanView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return PLAN_VIEWS.find((view) => view === v) ?? "day";
  } catch {
    return "day";
  }
}

let state: PlanUi = { view: savedView(), dialog: null, todayAsked: 0, revision: 0, event: null };
const listeners = new Set<() => void>();

export function setPlanUi(change: Partial<PlanUi>) {
  state = { ...state, ...change };
  if (change.view) {
    try {
      localStorage.setItem(VIEW_KEY, change.view);
    } catch {
      // Remembering the view is a convenience; without storage it resets.
    }
  }
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
