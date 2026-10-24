// Typed wrappers for the sync commands and events in src-tauri/src/sync/.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

/** Mirrors `SyncStatus` in src-tauri/src/sync/mod.rs. Times are ISO strings. */
export type SyncStatus =
  | { state: "off" }
  | { state: "needs_choice"; projects: number; planTasks: number; books: number; modules: number }
  | { state: "syncing"; lastSynced: string | null }
  | { state: "synced"; at: string }
  | { state: "offline"; lastSynced: string | null }
  | { state: "error"; message: string };

/** How to join this computer's data to the account: upload it, or swap it for the account's. */
export type LinkChoice = "merge" | "replace";

export const getSyncStatus = () => invoke<SyncStatus>("sync_status");
export const syncNow = () => invoke<void>("sync_now");
export const linkData = (how: LinkChoice) => invoke<void>("sync_link", { how });
/** Whether this computer syncs by itself (after edits and every minute). */
export const getAutoSync = () => invoke<boolean>("sync_auto");
export const setAutoSync = (on: boolean) => invoke<void>("sync_set_auto", { on });

/** Calls `handler` whenever Rust emits `event`, for as long as the component is mounted. */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
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
