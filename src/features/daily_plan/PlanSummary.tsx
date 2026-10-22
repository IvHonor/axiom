import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { useLabels } from "../../shell/theme/ThemeProvider";
import { api, errorMessage, trackedMinutes, type TodaySummary } from "./api";
import { clock, duration, nowMinute, today } from "./time";

/** The overview tile: today's progress, what's next, and the top priorities. */
export function PlanSummary() {
  const { label } = useLabels();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .summary(today(), nowMinute())
        .then(setSummary)
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);
  useDataChanged(load);

  if (error) return <p className="dim">{error}</p>;
  if (!summary) return <p className="dim">Loading…</p>;
  if (summary.total === 0 && !summary.nextBlock) return <p className="dim">Nothing planned for today. Open Daily Plan to plan your day.</p>;

  const percent = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  const next = summary.nextBlock;

  return (
    <div className="dp-summary">
      <div className="dp-sum-top">
        <Ring percent={percent} />
        <dl className="dp-sum-stats">
          <div>
            <dt className="stat-label">{label("Done")}</dt>
            <dd>
              {summary.done}/{summary.total}
            </dd>
          </div>
          <div>
            <dt className="stat-label">{label("Planned")}</dt>
            <dd>{duration(summary.plannedMinutes)}</dd>
          </div>
        </dl>
      </div>
      {summary.running && (
        <p className="dp-sum-next">
          <span className="dp-pulse" aria-hidden="true" /> Working on {summary.running.title} · {duration(Math.floor(trackedMinutes(summary.running)))}
        </p>
      )}
      {next && (
        <p className="dp-sum-next">
          <span className="stat-label">{label(next.inProgress ? "Now" : "Next")}</span>{" "}
          {next.inProgress ? `${next.title}, until ${clock(next.startMinute + next.durationMinutes)}` : `${clock(next.startMinute)} ${next.title}`}
        </p>
      )}
      {summary.focus.length > 0 && (
        <ol className="dp-sum-focus">
          {summary.focus.map((t) => (
            <li key={t.id} className={t.doneAt ? "is-done" : undefined}>
              <button
                className={`dp-check${t.doneAt ? " is-checked" : ""}`}
                role="checkbox"
                aria-checked={!!t.doneAt}
                aria-label={t.doneAt ? "Mark as not done" : "Mark as done"}
                onClick={() => api.setDone(t.id, !t.doneAt).then(load)}
              >
                {t.doneAt && <Check size={11} strokeWidth={2.5} />}
              </button>
              <span>{t.title}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  return (
    <svg className="dp-ring" width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`${percent}% of today's tasks done`}>
      <circle cx="34" cy="34" r={r} className="dp-ring-track" />
      <circle
        cx="34"
        cy="34"
        r={r}
        className="dp-ring-fill"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        transform="rotate(-90 34 34)"
      />
      <text x="34" y="34" textAnchor="middle" dominantBaseline="central">
        {percent}%
      </text>
    </svg>
  );
}
