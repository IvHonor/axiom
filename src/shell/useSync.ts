import { useEffect, useState } from "react";
import { getSyncStatus, syncNow, useTauriEvent, type SyncStatus } from "../lib/sync";

/** Sync's status, kept up to date by events from Rust. Also syncs when the network comes back. */
export function useSync(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ state: "off" });

  useEffect(() => {
    getSyncStatus()
      .then(setStatus)
      .catch(() => {});
    const onOnline = () => void syncNow().catch(() => {});
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useTauriEvent<SyncStatus>("sync-status", setStatus);
  return status;
}

/** The current time, updated every `ms`, for "2 min ago" labels. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return now;
}
