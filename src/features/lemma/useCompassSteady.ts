// Whether the True Compass has settled: it steadies once you've made some
// progress today, and drifts until you have.
import { useCallback, useEffect, useState } from "react";
import { useDataChanged } from "../../lib/sync";
import { getDays } from "../playground/api";
import { dayKey } from "../playground/stats";

/** Not things you did today: a routine existing, or a book merely being open. */
const NOT_PROGRESS = new Set(["daily_plan.routines", "reading.quiet_started", "reading.quiet_finished", "reading.longest"]);

export function useCompassSteady(enabled: boolean) {
  const [steady, setSteady] = useState(false);
  const check = useCallback(() => {
    if (!enabled) return;
    const today = dayKey(new Date());
    getDays().then(days => setSteady(Object.entries(days ?? {}).some(([metric, values]) => !NOT_PROGRESS.has(metric) && (values[today] ?? 0) > 0))).catch(() => {});
  }, [enabled]);
  useEffect(check, [check]);
  useDataChanged(check);
  return steady;
}
