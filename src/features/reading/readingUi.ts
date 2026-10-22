// What the Reading Tracker shows, shared by its view, side panel and
// overview tile: the shelf or page, the open book, and the add dialog.
import { useSyncExternalStore } from "react";
import type { Status } from "./api";

export type ReadingPage = Status | "all" | "stats" | "notes";

export const PAGES: ReadingPage[] = ["reading", "want", "finished", "dnf", "all", "stats", "notes"];

interface ReadingUi {
  page: ReadingPage;
  /** The book whose page is open. */
  book: string | null;
  adding: boolean;
  /** Bumped after any change here, so everything showing books re-reads. */
  revision: number;
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

let state: ReadingUi = { page: savedPage(), book: null, adding: false, revision: 0 };
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

export function useReadingUi(): ReadingUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
