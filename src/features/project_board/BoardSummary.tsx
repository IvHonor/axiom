import { useEffect, useState, type CSSProperties } from "react";
import { useLabels } from "../../shell/theme/ThemeProvider";
import { useDataChanged } from "../../lib/sync";
import { api, errorMessage, type Summary } from "./api";
import { colorOf, dueState, shortDate } from "./palette";

/**
 * The overview tile. It shows more as the tile grows:
 * small = progress ring and counts, taller = up-next list, larger = per-project bars.
 */
export function BoardSummary() {
  const { label } = useLabels();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .summary()
      .then(setSummary)
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => void load(), []);
  useDataChanged(load);

  if (error) return <p className="dim">{error}</p>;
  if (!summary) return <p className="dim">Loading…</p>;
  if (summary.projects.length === 0) return <p className="dim">No projects yet. Open the board to create one.</p>;

  const total = summary.projects.reduce((n, p) => n + p.total, 0);
  const done = summary.projects.reduce((n, p) => n + p.done, 0);
  const overdue = summary.projects.reduce((n, p) => n + p.overdue, 0);
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="pb-summary">
      <div className="pb-sum-top">
        <Ring percent={percent} />
        <dl className="pb-sum-stats">
          <div>
            <dt className="stat-label">{label("Open")}</dt>
            <dd>{total - done}</dd>
          </div>
          <div className={overdue ? "is-overdue" : undefined}>
            <dt className="stat-label">{label("Overdue")}</dt>
            <dd>{overdue}</dd>
          </div>
          <div>
            <dt className="stat-label">{label("Done")}</dt>
            <dd>{done}</dd>
          </div>
        </dl>
      </div>

      <section className="pb-sum-due">
        <h4 className="stat-label">{label("Up next")}</h4>
        {summary.dueSoon.length === 0 ? (
          <p className="dim">Nothing due this week.</p>
        ) : (
          <ul>
            {summary.dueSoon.map((t) => (
              <li key={t.id}>
                <span className={`pb-due is-${dueState(t.dueDate, false, summary.today)}`}>{shortDate(t.dueDate)}</span>
                <span className="pb-sum-title">{t.title}</span>
                <span className="dim pb-sum-project">{t.projectName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pb-sum-projects">
        <h4 className="stat-label">{label("Projects")}</h4>
        <ul>
          {summary.projects.map((p) => (
            <li key={p.id} style={{ "--project": colorOf(p.color) } as CSSProperties}>
              <span className="pb-sum-title">{p.name}</span>
              <span className="pb-bar" aria-hidden="true">
                <span style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
              </span>
              <span className="dim">
                {p.done}/{p.total}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  return (
    <svg className="pb-ring" width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`${percent}% done`}>
      <circle cx="34" cy="34" r={r} className="pb-ring-track" />
      <circle
        cx="34"
        cy="34"
        r={r}
        className="pb-ring-fill"
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
