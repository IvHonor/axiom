import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api, errorMessage, type Board, type Insights } from "./api";
import { colorOf, shortDate } from "./palette";

interface InsightsViewProps {
  board: Board;
  onError: (message: string) => void;
}

/** Progress charts for a project: what got done, how fast, and what's still open. */
export function InsightsView({ board, onError }: InsightsViewProps) {
  const [data, setData] = useState<Insights | null>(null);

  useEffect(() => {
    api
      .insights(board.project.id)
      .then(setData)
      .catch((e) => onError(errorMessage(e)));
  }, [board, onError]);

  if (!data) return <p className="dim pb-message">Loading insights…</p>;

  const cycle = data.avgCycleDays;
  return (
    <div className="pb-insights">
      <div className="pb-stat-row">
        <Stat label="Open" value={data.open} />
        <Stat label="Overdue" value={data.overdue} tone={data.overdue > 0 ? "danger" : undefined} />
        <Stat label="Completed, last 7 days" value={data.completedLast7} />
        <Stat label="Created, last 7 days" value={data.createdLast7} />
        <Stat
          label="Average time to complete"
          value={cycle === null ? "—" : cycle < 1 ? `${Math.round(cycle * 24)}h` : `${cycle.toFixed(1)}d`}
        />
      </div>

      <div className="pb-chart-grid">
        <ChartCard title="Burn-up" note="Last 30 days" className="is-wide">
          <BurnupChart points={data.burnup} />
        </ChartCard>
        <ChartCard title="Completed per week" note="Last 8 weeks">
          <WeeklyBars weeks={data.throughput} />
        </ChartCard>
        <ChartCard title="Open by column">
          <BarList rows={data.openByColumn.map((r) => ({ name: r.name, count: r.count }))} />
        </ChartCard>
        <ChartCard title="Open by priority">
          <BarList rows={data.openByPriority.map((r) => ({ name: r.name, count: r.count }))} />
        </ChartCard>
        <ChartCard title="Open by label">
          {data.openByLabel.length === 0 ? (
            <p className="dim">No labels in this project.</p>
          ) : (
            <BarList rows={data.openByLabel.map((r) => ({ name: r.name || "Unnamed", count: r.count, swatch: colorOf(r.color) }))} />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "danger" }) {
  return (
    <div className={`pb-stat panel${tone ? ` is-${tone}` : ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ChartCard({ title, note, className, children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`pb-chart panel${className ? ` ${className}` : ""}`}>
      <header>
        <h3 className="panel-title">{title}</h3>
        {note && <span className="panel-meta">{note}</span>}
      </header>
      {children}
    </section>
  );
}

/** Width of an element, kept up to date as it resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A "nice" axis maximum and three gridline values for counts. */
function scale(max: number) {
  const top = Math.max(4, Math.ceil(max / 4) * 4);
  return { top, ticks: [0, top / 2, top] };
}

const PAD = { top: 12, right: 12, bottom: 24, left: 32 };

/**
 * Two lines over 30 days: every task that existed (a neutral reference) and
 * those done (the accent). The gap between them is the work still open.
 * Hover shows a crosshair and the day's numbers.
 */
function BurnupChart({ points }: { points: Insights["burnup"] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const { top, ticks } = scale(Math.max(...points.map((p) => p.total)));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : 0);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const path = (key: "total" | "done") => points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join("");
  const last = points[points.length - 1];
  const shown = hover === null ? null : points[hover];

  return (
    <div className="pb-chart-body" ref={ref}>
      <div className="pb-legend">
        <span>
          <i className="pb-key is-total" /> All tasks
        </span>
        <span>
          <i className="pb-key is-done" /> Done
        </span>
      </div>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Burn-up: ${last.done} of ${last.total} tasks done`}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - box.left - PAD.left) / plotW) * (points.length - 1));
            setHover(Math.max(0, Math.min(points.length - 1, i)));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="pb-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="pb-axis" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
            <text key={i} className="pb-axis" x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
              {shortDate(points[i].date)}
            </text>
          ))}
          <path className="pb-line is-total" d={path("total")} />
          <path className="pb-line is-done" d={path("done")} />
          {/* Direct labels on the latest values. */}
          <text className="pb-direct" x={x(points.length - 1) - 4} y={y(last.total) - 8} textAnchor="end">
            {last.total}
          </text>
          <text className="pb-direct" x={x(points.length - 1) - 4} y={y(last.done) + 16} textAnchor="end">
            {last.done}
          </text>
          {shown && hover !== null && (
            <g>
              <line className="pb-crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} />
              <circle className="pb-dot is-total" cx={x(hover)} cy={y(shown.total)} r={4} />
              <circle className="pb-dot is-done" cx={x(hover)} cy={y(shown.done)} r={4} />
            </g>
          )}
        </svg>
      )}
      {shown && hover !== null && (
        <div className="pb-tooltip" style={{ left: Math.min(x(hover) + 12, width - 150) }}>
          <strong>{shortDate(shown.date)}</strong>
          <span>
            <i className="pb-key is-total" /> All tasks <b>{shown.total}</b>
          </span>
          <span>
            <i className="pb-key is-done" /> Done <b>{shown.done}</b>
          </span>
        </div>
      )}
    </div>
  );
}

/** Tasks completed each week, one bar per week, newest on the right. */
function WeeklyBars({ weeks }: { weeks: Insights["throughput"] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const { top, ticks } = scale(Math.max(...weeks.map((w) => w.done)));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.max(4, Math.min(28, slot - 8));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  return (
    <div className="pb-chart-body" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Tasks completed per week" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="pb-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="pb-axis" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.max(0, y(0) - y(w.done));
            return (
              <g key={w.weekStart} onMouseEnter={() => setHover(i)}>
                {/* A full-height hit area, bigger than the bar. */}
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                {h > 0 && <path className={`pb-bar${hover === i ? " is-hover" : ""}`} d={roundedTop(cx - barW / 2, y(w.done), barW, h, 4)} />}
                {(i === 0 || i === weeks.length - 1 || i % 2 === 0) && (
                  <text className="pb-axis" x={cx} y={height - 6} textAnchor="middle">
                    {shortDate(w.weekStart)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && (
        <div className="pb-tooltip" style={{ left: Math.min(PAD.left + slot * hover + slot / 2 + 12, width - 150) }}>
          <strong>Week of {shortDate(weeks[hover].weekStart)}</strong>
          <span>
            Completed <b>{weeks[hover].done}</b>
          </span>
        </div>
      )}
    </div>
  );
}

/** A bar path with its data end rounded and its baseline square. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
}

/** Horizontal bars with the name and value as text, so nothing relies on color. */
function BarList({ rows }: { rows: { name: string; count: number; swatch?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="pb-barlist">
      {rows.map((r) => (
        <li key={r.name} title={`${r.name}: ${r.count} open`}>
          <span className="pb-barlist-name">
            {r.swatch && <i className="pb-key" style={{ background: r.swatch } as CSSProperties} />}
            {r.name}
          </span>
          <span className="pb-barlist-track">
            <span style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="pb-barlist-value">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}
