import { useEffect, useState } from "react";
import { ChartCard, PAD, roundedTop, scale, Stat, useWidth } from "../project_board/InsightsView";
import { shortDate } from "../project_board/palette";
import { api, errorMessage, type PlanInsights } from "./api";
import { paceText } from "./Capacity";
import { duration } from "./time";

interface InsightsProps {
  today: string;
  version: number;
  onError: (message: string) => void;
}

/** How planning is going: estimates against reality, focus time, follow-through and habits. */
export function Insights({ today, version, onError }: InsightsProps) {
  const [data, setData] = useState<PlanInsights | null>(null);

  useEffect(() => {
    api.insights(today).then(setData, (e) => onError(errorMessage(e)));
  }, [today, version, onError]);

  if (!data) return <p className="dim dp-loading">Loading insights…</p>;

  const thisWeek = data.weeks[data.weeks.length - 1]?.trackedMinutes ?? 0;
  const focusRate = data.focusTotal ? Math.round((data.focusDone / data.focusTotal) * 100) : null;
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

  return (
    <div className="pb-insights dp-insights">
      <div className="pb-stat-row">
        <Stat label={data.pace === null ? "Estimates: time a few tasks to see" : "Time taken against estimates"} value={data.pace === null ? "—" : `${data.pace.toFixed(1)}×`} />
        <Stat label={focusRate === null ? "Top priorities done" : `Top priorities done (${data.focusDone} of ${data.focusTotal})`} value={focusRate === null ? "—" : `${focusRate}%`} />
        <Stat label="Focus time this week" value={duration(thisWeek)} />
        <Stat label="Planning streak" value={days(data.planningStreak)} />
        <Stat label="Shutdown streak" value={days(data.shutdownStreak)} />
      </div>
      {data.pace !== null && (
        <p className="dp-insights-note">
          {paceText(data.pace)} Based on {data.pacedTasks} timed tasks over the last 30 days; the capacity bar allows for it.
        </p>
      )}

      <div className="pb-chart-grid">
        <ChartCard title="Planned and done" note="Last 14 days">
          <DoneBars days={data.days} />
        </ChartCard>
        <ChartCard title="Focus time per week" note="Last 8 weeks, from timers">
          <FocusBars weeks={data.weeks} />
        </ChartCard>
      </div>
    </div>
  );
}

/** Each day's planned tasks (a neutral bar) with the done share drawn inside it. */
function DoneBars({ days }: { days: PlanInsights["days"] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const { top, ticks } = scale(Math.max(...days.map((d) => d.planned)));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / days.length;
  const barW = Math.max(4, Math.min(24, slot - 8));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const shown = hover === null ? null : days[hover];

  return (
    <div className="pb-chart-body" ref={ref}>
      <div className="pb-legend">
        <span>
          <i className="pb-key is-total" /> Planned
        </span>
        <span>
          <i className="pb-key is-done" /> Done
        </span>
      </div>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Tasks planned and done each day" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="pb-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="pb-axis" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const planned = Math.max(0, y(0) - y(d.planned));
            const done = Math.max(0, y(0) - y(d.done));
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)}>
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                {planned > 0 && <path className={`pb-bar dp-bar-planned${hover === i ? " is-hover" : ""}`} d={roundedTop(cx - barW / 2, y(d.planned), barW, planned, 4)} />}
                {done > 0 && <path className={`pb-bar${hover === i ? " is-hover" : ""}`} d={roundedTop(cx - barW / 2, y(d.done), barW, done, 4)} />}
                {(i % 2 === 1 || i === days.length - 1) && (
                  <text className="pb-axis" x={cx} y={height - 6} textAnchor="middle">
                    {i === days.length - 1 ? "Today" : shortDate(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {shown && hover !== null && (
        <div className="pb-tooltip" style={{ left: Math.min(PAD.left + slot * hover + slot / 2 + 12, width - 150) }}>
          <strong>{shortDate(shown.day)}</strong>
          <span>
            <i className="pb-key is-total" /> Planned <b>{shown.planned}</b>
          </span>
          <span>
            <i className="pb-key is-done" /> Done <b>{shown.done}</b>
          </span>
        </div>
      )}
    </div>
  );
}

/** Time tracked each week, in hours. */
function FocusBars({ weeks }: { weeks: PlanInsights["weeks"] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const hours = weeks.map((w) => w.trackedMinutes / 60);
  const { top, ticks } = scale(Math.max(...hours));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.max(4, Math.min(28, slot - 8));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  return (
    <div className="pb-chart-body" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Hours of focus time tracked per week" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="pb-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="pb-axis" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {t}h
              </text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.max(0, y(0) - y(hours[i]));
            return (
              <g key={w.weekStart} onMouseEnter={() => setHover(i)}>
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                {h > 0 && <path className={`pb-bar${hover === i ? " is-hover" : ""}`} d={roundedTop(cx - barW / 2, y(hours[i]), barW, h, 4)} />}
                {(i % 2 === 1 || i === weeks.length - 1) && (
                  <text className="pb-axis" x={cx} y={height - 6} textAnchor="middle">
                    {i === weeks.length - 1 ? "This week" : shortDate(w.weekStart)}
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
            Tracked <b>{duration(weeks[hover].trackedMinutes)}</b>
          </span>
        </div>
      )}
    </div>
  );
}
