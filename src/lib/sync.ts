// Typed wrappers for the sync commands and events in src-tauri/src/sync/.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
let dataSubscriber: ((handler: () => void) => () => void) | null = null;
/** Lets another host notify the shared views without emulating native events. */
export function setDataChangedSubscriber(subscribe: (handler: () => void) => () => void) {
  dataSubscriber = subscribe;
  return () => { if (dataSubscriber === subscribe) dataSubscriber = null; };
}

/** Mirrors `SyncStatus` in src-tauri/src/sync/mod.rs. Times are ISO strings. */
export type SyncStatus =
  | { state: "off" }
  | ({ state: "needs_choice" } & SyncChoice)
  | { state: "syncing"; lastSynced: string | null }
  | { state: "synced"; at: string }
  | { state: "offline"; lastSynced: string | null }
  | { state: "error"; message: string };

/**
 * Why sync is waiting, and what's at stake. `new_computer`: this computer has
 * data and isn't linked to the account yet (the counts say what). `offline_changes`:
 * it was signed out, and `changes` rows were edited since `since`.
 */
export interface SyncChoice {
  reason: "new_computer" | "offline_changes";
  projects: number;
  planTasks: number;
  books: number;
  modules: number;
  changes: number;
  since: string | null;
}

/**
 * What to do with this computer's data. `merge`: keep both, newer edit wins.
 * `replace`: use the account's, dropping this computer's. `keep_local`: keep
 * both, this computer's wins.
 */
export type LinkChoice = "merge" | "replace" | "keep_local";

/** The copy of this computer's data taken at the last choice, kept for a week. */
export interface SyncBackup {
  at: string;
}

export const getSyncStatus = () => invoke<SyncStatus>("sync_status");
export const syncNow = () => invoke<void>("sync_now");
export const linkData = (how: LinkChoice) => invoke<void>("sync_link", { how });
export const getBackup = () => invoke<SyncBackup | null>("sync_backup");
/** Puts the backup's data back over this computer's; resolves to how many items came back. */
export const restoreBackup = () => invoke<number>("sync_restore_backup");
/** Whether this computer syncs by itself (after edits and every minute). */
export const getAutoSync = () => invoke<boolean>("sync_auto");
export const setAutoSync = (on: boolean) => invoke<void>("sync_set_auto", { on });

/** Calls `handler` whenever Rust emits `event`, for as long as the component is mounted. */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (event === "data-changed" && dataSubscriber) return dataSubscriber(() => latest.current(undefined as T));
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<T>(event, (e) => latest.current(e.payload))
      .then((stop) => (cancelled ? stop() : (unlisten = stop)))
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event]);
}

/** Runs `reload` when sync changes local data, so views show other devices' edits. */
export const useDataChanged = (reload: () => void) => useTauriEvent<void>("data-changed", reload);
