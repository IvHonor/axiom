import { useEffect, useSyncExternalStore } from "react";
import { api, errorMessage, type Board, type Project } from "../api";

interface Snapshot {
  projects: Project[];
  boards: Board[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  unavailable: string[];
  revision: number;
}
let snapshot: Snapshot = { projects: [], boards: [], loaded: false, loading: false, error: null, unavailable: [], revision: 0 };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let queued = false;
let users = 0;
let timer: number | undefined;
const publish = (change: Partial<Snapshot>) => { snapshot = { ...snapshot, ...change }; listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Bound local database work even when a user has many projects. Preserve ordering. */
export async function mapProjects<T, R>(items: T[], read: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { status: "fulfilled", value: await read(items[index]) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }));
  return results;
}

export function refreshBoardOverview(afterMutation = false): Promise<void> {
  if (inFlight) { queued ||= afterMutation; return inFlight; }
  publish({ loading: true });
  inFlight = (async () => {
    try {
      do {
        queued = false;
        try {
          const projects = await api.listProjects();
          const results = await mapProjects(projects, (project) => api.getBoard(project.id));
          const boards: Board[] = [];
          const unavailable: string[] = [];
          results.forEach((result, index) => result.status === "fulfilled" ? boards.push(result.value) : unavailable.push(projects[index].name));
          publish({ projects, boards, unavailable, loaded: true, loading: false, error: null, revision: snapshot.revision + 1 });
        } catch (error) { publish({ loading: false, error: errorMessage(error) }); }
        // A mutation during a read needs a fresh pass. All callers await that pass,
        // so completion buttons cannot become active against an older snapshot.
      } while (queued && users > 0);
    } finally { inFlight = null; }
  })();
  return inFlight;
}
/** Board edits only trigger a portfolio read while an overview is mounted. */
export function boardOverviewChanged() {
  if (users) void refreshBoardOverview(true);
}
const onFocus = () => { void refreshBoardOverview(); };
export function useBoardOverviewData() {
  const data = useSyncExternalStore(subscribe, () => snapshot);
  useEffect(() => {
    if (users++ === 0) {
      void refreshBoardOverview();
      timer = window.setInterval(onFocus, 60_000);
      window.addEventListener("focus", onFocus);
    }
    return () => {
      if (--users === 0) { window.clearInterval(timer); window.removeEventListener("focus", onFocus); }
    };
  }, []);
  return data;
}
