// What Learning shows, shared by its view, side panel and overview tile: the
// page, the open source, any open dialog, and the study timer.
import { useSyncExternalStore } from "react";

export type LearningPage = "skills" | "review" | "activity";

export const PAGES: LearningPage[] = ["skills", "review", "activity"];

export type LearningDialog =
  | { kind: "skill"; id: string | null }
  | { kind: "source"; id: string | null; skillId?: string }
  | { kind: "units"; sourceId: string }
  | { kind: "session"; sourceId: string | null; minutes?: number }
  | null;

/** A running study timer: what it's for and when it started (ms since epoch). */
export interface Timer {
  sourceId: string;
  title: string;
  startedAt: number;
}

interface LearningUi {
  page: LearningPage;
  /** The source whose page is open. */
  source: string | null;
  dialog: LearningDialog;
  timer: Timer | null;
  /** Bumped after any change here, so everything showing Learning re-reads. */
  revision: number;
}

const PAGE_KEY = "axiom.learning.page";
const TIMER_KEY = "axiom.learning.timer";

function saved<T>(key: string, read: (text: string) => T | null, fallback: T): T {
  try {
    const text = localStorage.getItem(key);
    return text ? read(text) ?? fallback : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Remembering is a nicety.
  }
}

let state: LearningUi = {
  page: saved(PAGE_KEY, (t) => PAGES.find((p) => p === t) ?? null, "skills"),
  source: null,
  dialog: null,
  // Kept across restarts, so closing Axiom doesn't lose a running timer.
  timer: saved(
    TIMER_KEY,
    (t) => {
      const v = JSON.parse(t) as Timer;
      return typeof v?.sourceId === "string" && typeof v.startedAt === "number" ? v : null;
    },
    null,
  ),
  revision: 0,
};
const listeners = new Set<() => void>();

export function setLearningUi(change: Partial<LearningUi>) {
  state = { ...state, ...change };
  if (change.page) remember(PAGE_KEY, change.page);
  if ("timer" in change) remember(TIMER_KEY, change.timer ? JSON.stringify(change.timer) : null);
  listeners.forEach((listener) => listener());
}

export const openSource = (id: string) => setLearningUi({ source: id });
export const showPage = (page: LearningPage) => setLearningUi({ page, source: null });
export const learningChanged = () => setLearningUi({ revision: state.revision + 1 });

export const startTimer = (sourceId: string, title: string) => setLearningUi({ timer: { sourceId, title, startedAt: Date.now() } });

/** Stops the timer and opens "log time" with its minutes filled in. */
export function stopTimer() {
  const t = state.timer;
  if (!t) return;
  const minutes = Math.max(1, Math.round((Date.now() - t.startedAt) / 60_000));
  setLearningUi({ timer: null, dialog: { kind: "session", sourceId: t.sourceId, minutes } });
}

export function useLearningUi(): LearningUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
