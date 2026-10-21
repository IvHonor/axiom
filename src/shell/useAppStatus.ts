import { useEffect, useState } from "react";
import { getAppStatus, type DbStatus } from "../lib/backend";

export interface ShellStatus {
  version: string | null;
  db: DbStatus;
}

/** Asks Rust for the app status, re-asking every second while the database is still connecting. */
export function useAppStatus(): ShellStatus {
  const [status, setStatus] = useState<ShellStatus>({ version: null, db: { state: "connecting" } });

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const next = await getAppStatus();
        if (cancelled) return;
        setStatus(next);
        if (next.db.state === "connecting") timer = window.setTimeout(poll, 1000);
      } catch (err) {
        if (!cancelled) setStatus({ version: null, db: { state: "error", message: `Axiom didn't start properly. Restart the app. (${err})` } });
      }
    }

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return status;
}
