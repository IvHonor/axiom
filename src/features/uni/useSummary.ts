import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChanged } from "../../lib/sync";
import { today } from "../daily_plan/time";
import { api, errorMessage, type UniSummary } from "./api";
import { useUniUi } from "./uniUi";

/** The current term at a glance, re-read after any change here or a sync. */
export function useSummary(enabled = true) {
  const { revision } = useUniUi();
  const [summary, setSummary] = useState<UniSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const load = useCallback(() => {
    if (!enabled) return;
    const id = ++request.current;
    setLoading(true);
    api.summary(today()).then(
      (s) => {
        if (id !== request.current) return;
        setSummary(s);
        setError(null);
        setLoading(false);
      },
      (e) => { if (id === request.current) { setError(errorMessage(e)); setLoading(false); } },
    );
  }, [enabled]);
  useEffect(() => {
    load();
    if (!enabled) return () => { request.current++; };
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => { request.current++; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [load, revision, enabled]);
  useDataChanged(load);
  return { summary, error, loading, reload: load };
}
