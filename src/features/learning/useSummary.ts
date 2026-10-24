import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChanged } from "../../lib/sync";
import { today } from "../daily_plan/time";
import { api, errorMessage, type LearningSummary } from "./api";
import { useLearningUi } from "./learningUi";

/** Learning at a glance, re-read after any change here or a sync. */
export function useSummary(enabled = true) {
  const { revision } = useLearningUi();
  const [summary, setSummary] = useState<LearningSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(() => {
    if (!enabled) return;
    const id = ++request.current;
    api.summary(today()).then(
      (s) => {
        if (id !== request.current) return;
        setSummary(s);
        setError(null);
      },
      (e) => {
        if (id === request.current) setError(errorMessage(e));
      },
    );
  }, [enabled]);
  useEffect(() => {
    load();
    if (!enabled) return () => void request.current++;
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      request.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load, revision, enabled]);
  useDataChanged(load);
  return { summary, error, reload: load };
}
