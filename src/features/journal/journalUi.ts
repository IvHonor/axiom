// What the Journal shows, shared by its view, side panel and overview tile:
// the page, the open entry and the filters.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDataChanged } from "../../lib/sync";
import { today } from "../daily_plan/time";
import { api, errorMessage, type EntryFilter } from "./api";

export type JournalPage = "journal" | "calendar" | "insights";

export const PAGES: JournalPage[] = ["journal", "calendar", "insights"];

interface JournalUi {
  page: JournalPage;
  /** The entry open in the editor. */
  entry: string | null;
  search: string;
  tag: string | null;
  /** Bumped after any change here, so lists re-read. */
  revision: number;
}

const PAGE_KEY = "axiom.journal.page";

function savedPage(): JournalPage {
  try {
    return PAGES.find((p) => p === localStorage.getItem(PAGE_KEY)) ?? "journal";
  } catch {
    return "journal";
  }
}

let state: JournalUi = { page: savedPage(), entry: null, search: "", tag: null, revision: 0 };
const listeners = new Set<() => void>();

export function setJournalUi(change: Partial<JournalUi>) {
  state = { ...state, ...change };
  if (change.page) {
    try {
      localStorage.setItem(PAGE_KEY, change.page);
    } catch {
      // Remembering the page is a nicety.
    }
  }
  listeners.forEach((listener) => listener());
}

export const journalChanged = () => setJournalUi({ revision: state.revision + 1 });

export function useJournalUi(): JournalUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Reads again after any change here or a sync. */
function useJournalData<T>(read: () => Promise<T>, key: string): { data: T | null; error: string | null } {
  const { revision } = useJournalUi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reader = useRef(read);
  reader.current = read;
  const load = useCallback(() => {
    reader.current().then(
      (d) => {
        setData(d);
        setError(null);
      },
      (err) => setError(errorMessage(err)),
    );
  }, []);
  useEffect(load, [load, revision, key]);
  useDataChanged(load);
  return { data, error };
}

export const useJournalStats = () => useJournalData(() => api.stats(today()), today());

export const useDayEntries = (day: string) => useJournalData(() => api.onDay(day), day);

export function useEntries(filter: EntryFilter) {
  return useJournalData(() => api.list(filter), JSON.stringify(filter));
}
