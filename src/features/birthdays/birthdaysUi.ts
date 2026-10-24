// What Birthdays shows, shared by its view, side panel and overview tile:
// the page, the open person, the filters and the open dialog.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDataChanged } from "../../lib/sync";
import { today } from "../daily_plan/time";
import { api, errorMessage, type Person, type PersonDetail, type Relation } from "./api";

export type BirthdaysPage = "upcoming" | "calendar" | "everyone";

export const PAGES: BirthdaysPage[] = ["upcoming", "calendar", "everyone"];

export type BirthdaysDialog = { kind: "person"; id: string | null } | { kind: "import" };

interface BirthdaysUi {
  page: BirthdaysPage;
  /** The person open beside the list. */
  person: string | null;
  relation: Relation | null;
  search: string;
  dialog: BirthdaysDialog | null;
  /** Bumped after any change here, so lists re-read. */
  revision: number;
}

let state: BirthdaysUi = { page: "upcoming", person: null, relation: null, search: "", dialog: null, revision: 0 };
const listeners = new Set<() => void>();

export function setBirthdaysUi(change: Partial<BirthdaysUi>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

export const birthdaysChanged = () => setBirthdaysUi({ revision: state.revision + 1 });

export function useBirthdaysUi(): BirthdaysUi {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Reads again after any change here or a sync, and when the day turns. */
function useBirthdaysData<T>(read: (day: string) => Promise<T>, key: string): { data: T | null; error: string | null } {
  const { revision } = useBirthdaysUi();
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
  return { data, error };
}

export const usePeople = () => useBirthdaysData<Person[]>((day) => api.list(day), "");

export const usePerson = (id: string) => useBirthdaysData<PersonDetail>((day) => api.get(id, day), id);
