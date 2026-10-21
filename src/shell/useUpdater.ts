import { useCallback, useEffect, useRef, useState } from "react";
import { findUpdate, installUpdate, type Update } from "../lib/updates";

export type UpdaterState =
  | { state: "idle" }
  | { state: "checking" }
  /** Shown briefly after a check the user asked for. */
  | { state: "current" }
  | { state: "available"; update: Update }
  | { state: "installing"; update: Update; progress: number | null }
  | { state: "error"; message: string; update?: Update };

const FIRST_CHECK_MS = 10_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Looks for a newer version shortly after launch and every few hours.
 * Background checks stay silent unless they find something; a check the
 * user asks for always reports back. Development builds never update.
 */
export function useUpdater() {
  const [status, setStatus] = useState<UpdaterState>({ state: "idle" });
  /** The version the user said "Later" to; not offered again this session. */
  const [snoozed, setSnoozed] = useState<string | null>(null);
  const busy = useRef(false);

  const checkNow = useCallback(async (asked: boolean) => {
    if (busy.current) return;
    if (import.meta.env.DEV) {
      if (asked) setStatus({ state: "error", message: "Updates are only checked in installed copies of Axiom." });
      return;
    }
    busy.current = true;
    if (asked) setStatus({ state: "checking" });
    try {
      const update = await findUpdate();
      if (update) {
        setStatus({ state: "available", update });
        if (asked) setSnoozed(null);
      } else {
        setStatus(asked ? { state: "current" } : { state: "idle" });
      }
    } catch (err) {
      setStatus(asked ? { state: "error", message: `Couldn't check for updates. ${String(err)}` } : { state: "idle" });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void checkNow(false), FIRST_CHECK_MS);
    const every = window.setInterval(() => void checkNow(false), CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [checkNow]);

  // "Up to date" and errors fade back to normal after a few seconds.
  useEffect(() => {
    if (status.state !== "current" && !(status.state === "error" && !status.update)) return;
    const timer = window.setTimeout(() => setStatus({ state: "idle" }), 5000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const install = useCallback(async (update: Update) => {
    setStatus({ state: "installing", update, progress: null });
    try {
      await installUpdate(update, (progress) => setStatus({ state: "installing", update, progress }));
    } catch (err) {
      setStatus({ state: "error", message: `The update couldn't be installed. ${String(err)}`, update });
    }
  }, []);

  const later = useCallback((update: Update) => setSnoozed(update.version), []);

  const offered =
    (status.state === "available" || status.state === "installing" || (status.state === "error" && status.update)) &&
    !(status.state === "available" && snoozed === status.update.version);

  return { status, offered: !!offered, checkNow, install, later };
}
