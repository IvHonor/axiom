// What the Reading Tracker shows, shared by its view, side panel and
// overview tile: the shelf or page, the open book, the add dialog, and the
// reading timer (kept across restarts, and followed by Lemma on the desktop).
import { useSyncExternalStore } from "react";
import type { Status } from "./api";

export type ReadingPage = Status | "all" | "stats" | "notes";

export const PAGES: ReadingPage[] = ["reading", "want", "finished", "dnf", "all", "stats", "notes"];

interface ReadingUi {
  page: ReadingPage;
  /** The book whose page is open. */
  book: string | null;
  adding: boolean;
  /** A running reading timer. */
  timer: ReadingTimer | null;
  /** Minutes the timer just counted, for the book's log form to fill in. */
  counted: { bookId: string; minutes: number } | null;
  /** Bumped after any change here, so everything showing books re-reads. */
  revision: number;
}

/** What's being read, and when it started (ms since epoch). */
export interface ReadingTimer {
  bookId: string;
  title: string;
  startedAt: number;
}

const TIMER_KEY = "axiom.reading.timer";

function savedTimer(): ReadingTimer | null {
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY) ?? "null");
    return t && typeof t.bookId === "string" && typeof t.title === "string" && typeof t.startedAt === "number" ? t : null;
  } catch {
    return null;
  }
}

const PAGE_KEY = "axiom.reading.page";

function savedPage(): ReadingPage {
  try {
    const saved = localStorage.getItem(PAGE_KEY);
    return PAGES.find((p) => p === saved) ?? "reading";
  } catch {
    return "reading";
  }
}

let state: ReadingUi = { page: savedPage(), book: null, adding: false, timer: savedTimer(), counted: null, revision: 0 };
const listeners = new Set<() => void>();

export function setReadingUi(change: Partial<ReadingUi>) {
  state = { ...state, ...change };
  if (change.page) {
    try {
      localStorage.setItem(PAGE_KEY, change.page);
    } catch {
      // Remembering the shelf is a nicety.
    }
  }
  listeners.forEach((listener) => listener());
}

export const openBook = (id: string) => setReadingUi({ book: id });
export const showPage = (page: ReadingPage) => setReadingUi({ page, book: null });
export const readingChanged = () => setReadingUi({ revision: state.revision + 1 });

export function startReading(bookId: string, title: string) {
  const timer = { bookId, title, startedAt: Date.now() };
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
  } catch {
    // Without storage the timer lasts while Axiom's open.
  }
  setReadingUi({ timer });
}

/** Stops the reading timer and opens its book, with the minutes ready to log. */
export function stopReading() {
  const t = state.timer;
  if (!t) return;
  try {
    localStorage.removeItem(TIMER_KEY);
  } catch {
    // Nothing to forget.
  }
  const minutes = Math.max(1, Math.round((Date.now() - t.startedAt) / 60_000));
  setReadingUi({ timer: null, book: t.bookId, counted: { bookId: t.bookId, minutes } });
}

/** Stops the reading timer without opening its book: Lemma on the desktop logs it himself. */
export function dropReading() {
  if (!state.timer) return;
  try {
    localStorage.removeItem(TIMER_KEY);
  } catch {
    // Nothing to forget.
  }
  setReadingUi({ timer: null });
}

/** Takes `minutes` away from the computer off the reading timer, as if it started later. */
export function shiftReading(minutes: number) {
  const t = state.timer;
  if (!t) return;
  const timer = { ...t, startedAt: Math.min(Date.now(), t.startedAt + minutes * 60_000) };
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
  } catch {
    // Without storage the change lasts while Axiom's open.
  }
  setReadingUi({ timer });
}

export function useReadingUi(): ReadingUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
