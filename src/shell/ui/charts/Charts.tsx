import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { Compare, Measure } from "../../../extensions/types";
import { daysOf, previousName, type Period } from "../../analytics/period";
import { niceScale, PAD, roundedBottom, roundedTop, useWidth } from "./geometry";
import "./charts.css";

/**
 * Charts for a week or month, one mark per day. They draw in the section's
 * `--series` colour (the area's own); a second series is neutral, so only
 * the one that matters stands out. Every value is in the tooltip and the
 * chart's label, never in colour alone.
 */

/** How a series is coloured. */
export type Tone = "main" | "soft" | "muted" | "danger" | "faint";

export interface Series {
  label: string;
  values: (number | null)[];
  tone?: Tone;
  /** A colour of its own (a skill's, a project's) in place of the tone. */
  color?: string;
}

const TONES: Record<Tone, string> = {
  main: "var(--series, var(--accent))",
  soft: "color-mix(in oklab, var(--series, var(--accent)) 45%, var(--panel))",
  muted: "var(--text-faint)",
  danger: "var(--danger)",
  faint: "var(--line-strong)",
};

export const colorOf = (s: { tone?: Tone; color?: string }) => s.color ?? TONES[s.tone ?? "main"];

const dayName = (day: string, style: "short" | "long" = "short") =>
  new Date(`${day}T00:00`).toLocaleDateString(undefined, style === "short" ? { weekday: "short" } : { weekday: "short", day: "numeric", month: "short" });

/** Whether a day gets a label on the x axis: every day of a week, every
 * week of a month (and more when there's room). */
const labelled = (period: Period, i: number, slot: number) => period.unit === "week" || i % 7 === 0 || (slot >= 26 && i % 2 === 0);

function axisLabel(period: Period, day: string) {
  return period.unit === "week" ? dayName(day) : String(Number(day.slice(8)));
}

// ---------- Cards and numbers ----------

export function ChartCard({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`chart-card panel${wide ? " is-wide" : ""}`}>
      <header>
        <h4 className="chart-title">{title}</h4>
        {note && <span className="panel-meta">{note}</span>}
      </header>
      {children}
    </section>
  );
}

export function Legend({ series }: { series: { label: string; tone?: Tone; color?: string; dashed?: boolean }[] }) {
  return (
    <div className="chart-legend">
      {series.map((s) => (
        <span key={s.label}>
          <i className={`chart-key${s.dashed ? " is-dashed" : ""}`} style={{ "--key": colorOf(s) } as CSSProperties} /> {s.label}
        </span>
      ))}
    </div>
  );
}

/** A change between two numbers, in words: "12%", "+3 pts", "+2h". */
export function change(value: Compare, measure: Measure): { text: string; direction: "up" | "down" | "same"; tone: "good" | "bad" | "neutral" } | null {
  const { now, before } = value;
  if (now === null || before === null) return null;
  const diff = now - before;
  if (Math.abs(diff) < 1e-9) return { text: "Same", direction: "same", tone: "neutral" };
  const direction = diff > 0 ? "up" : "down";
  const tone = measure.better === "neutral" ? "neutral" : (measure.better === "up") === diff > 0 ? "good" : "bad";
  let text: string;
  if (measure.percent) text = `${Math.round(Math.abs(diff))} pts`;
  else if (before !== 0 && Math.abs(diff / before) < 10) text = `${Math.round(Math.abs(diff / before) * 100)}%`;
  else text = measure.format(Math.abs(diff));
  return { text, direction, tone };
}

/** The change since the period before, as a small chip with an arrow. */
export function Delta({ value, measure, period }: { value: Compare; measure: Measure; period: Period }) {
  const c = change(value, measure);
  if (!c) return <span className="chart-delta is-none">No {previousName(period)} to compare</span>;
  const Icon = c.direction === "up" ? ArrowUp : c.direction === "down" ? ArrowDown : Minus;
  const words = c.direction === "same" ? `Same as ${previousName(period)}` : `${c.text} ${c.direction === "up" ? "more" : "less"} than ${previousName(period)}`;
  return (
    <span className={`chart-delta is-${c.tone}`} title={words} aria-label={words}>
      <Icon size={11} strokeWidth={2.25} aria-hidden="true" />
      {c.direction === "same" ? "Same" : c.text} <span className="chart-delta-vs">vs {previousName(period)}</span>
    </span>
  );
}

/** One number for the period, with how it compares to the one before. */
export function Metric({ label, value, measure, period, note }: { label: string; value: Compare; measure: Measure; period: Period; note?: string }) {
  return (
    <div className="chart-metric">
      <div className="chart-metric-value">{value.now === null ? "—" : measure.format(value.now)}</div>
      <div className="chart-metric-label">{label}</div>
      {note ? <span className="chart-delta is-none">{note}</span> : <Delta value={value} measure={measure} period={period} />}
    </div>
  );
}

export function Metrics({ children }: { children: ReactNode }) {
  return <div className="chart-metrics">{children}</div>;
}

/** A line of the last few periods, the latest still in progress. */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return <svg className="chart-spark" aria-hidden="true" />;
  const min = Math.min(0, ...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 26 - ((v - min) / span) * 22;
  let path = "";
  values.forEach((v, i) => {
    if (v === null) return;
    path += `${path && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`;
  });
  const last = values[values.length - 1];
  return (
    <svg className="chart-spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={path} vectorEffect="non-scaling-stroke" />
      {last !== null && <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

// ---------- Bars ----------

interface DayBarsProps {
  period: Period;
  /** "overlay": the first series behind the second (planned, then done);
   * "stack": one on another; "diverging": the first up, the second down. */
  mode?: "single" | "overlay" | "stack" | "diverging";
  series: Series[];
  format: (value: number) => string;
  /** Shorter text for the axis; `format` by default. */
  axisFormat?: (value: number) => string;
  /** The smallest top the axis may have, so a quiet week isn't blown up. */
  least?: number;
  /** What the axis steps count in: 60 for minutes as hours, 100 for pence as pounds. */
  tickUnit?: number;
  label: string;
  height?: number;
}

/** One bar (or stack) a day, with the day's numbers on hover. */
export function DayBars({ period, mode = "single", series, format, axisFormat = format, least = 4, tickUnit, label, height = 200 }: DayBarsProps) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const days = daysOf(period);
  const value = (s: Series, i: number) => Math.max(0, s.values[i] ?? 0);
  const totals = days.map((_, i) => (mode === "stack" ? series.reduce((sum, s) => sum + value(s, i), 0) : Math.max(...series.map((s) => value(s, i)))));
  const upMax = mode === "diverging" ? Math.max(...days.map((_, i) => value(series[0], i))) : Math.max(...totals);
  const downMax = mode === "diverging" ? Math.max(...days.map((_, i) => value(series[1], i))) : 0;
  const up = niceScale(upMax, least, tickUnit);
  const down = mode === "diverging" ? niceScale(downMax, least, tickUnit) : { top: 0, ticks: [] as number[] };
  const pad = { ...PAD, left: 40 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const range = up.top + down.top;
  const zero = pad.top + (up.top / range) * plotH;
  const y = (v: number) => zero - (v / range) * plotH;
  const slot = plotW / days.length;
  const barW = Math.max(3, Math.min(22, slot * 0.62));
  const ticks = [...up.ticks.map((t) => ({ t, at: y(t) })), ...down.ticks.slice(1).map((t) => ({ t, at: y(-t) }))];
  // Overlaid, the one behind is neutral; diverging, the one below is.
  const keyed: Series[] =
    mode === "overlay" ? series.map((s, i) => ({ ...s, tone: s.tone ?? (i === 0 ? "muted" : "main") })) : mode === "diverging" ? series.map((s, i) => ({ ...s, tone: s.tone ?? (i === 1 ? "muted" : "main") })) : series;

  return (
    <div className="chart-body" ref={ref}>
      {series.length > 1 && <Legend series={keyed} />}
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
          {ticks.map(({ t, at }) => (
            <g key={at}>
              <line className="chart-gridline" x1={pad.left} x2={width - pad.right} y1={at} y2={at} />
              <text className="chart-axis" x={pad.left - 8} y={at} textAnchor="end" dominantBaseline="middle">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {days.map((day, i) => {
            const cx = pad.left + slot * i + slot / 2;
            const x0 = cx - barW / 2;
            const future = day > period.today;
            let marks: ReactNode;
            if (mode === "stack") {
              let base = 0;
              const parts = keyed.map((s, k) => ({ s, k, v: value(s, i) })).filter((p) => p.v > 0);
              marks = parts.map(({ s, k, v }, n) => {
                const bottom = y(base);
                base += v;
                const top = y(base);
                // A 2px surface gap between segments.
                const h = Math.max(0, bottom - top - (n > 0 ? 2 : 0));
                return n === parts.length - 1 ? (
                  <path key={k} d={roundedTop(x0, top, barW, h, 3)} style={{ fill: colorOf(s) }} />
                ) : (
                  <rect key={k} x={x0} y={top} width={barW} height={h} style={{ fill: colorOf(s) }} />
                );
              });
            } else if (mode === "diverging") {
              const a = value(keyed[0], i);
              const b = value(keyed[1], i);
              marks = (
                <>
                  {a > 0 && <path d={roundedTop(x0, y(a), barW, zero - y(a) - 1, 3)} style={{ fill: colorOf(keyed[0]) }} />}
                  {b > 0 && <path d={roundedBottom(x0, zero + 1, barW, y(-b) - zero - 1, 3)} style={{ fill: colorOf(keyed[1]) }} />}
                </>
              );
            } else {
              marks = keyed.map((s, k) => {
                const v = value(s, i);
                if (v <= 0) return null;
                // Overlaid bars narrow a little so the one behind shows round them.
                const w = mode === "overlay" && k > 0 ? Math.max(2, barW - 6) : barW;
                return <path key={k} d={roundedTop(cx - w / 2, y(v), w, zero - y(v), 3)} style={{ fill: colorOf(s) }} />;
              });
            }
            return (
              <g key={day} className={`chart-day${future ? " is-future" : ""}${hover === i ? " is-hover" : ""}`} onMouseEnter={() => setHover(i)}>
                <rect className="chart-hit" x={pad.left + slot * i} y={pad.top} width={slot} height={plotH} />
                {marks}
                {labelled(period, i, slot) && (
                  <text className={`chart-axis${day === period.today ? " is-today" : ""}`} x={cx} y={height - 6} textAnchor="middle">
                    {axisLabel(period, day)}
                  </text>
                )}
              </g>
            );
          })}
          {mode === "diverging" && <line className="chart-baseline" x1={pad.left} x2={width - pad.right} y1={zero} y2={zero} />}
        </svg>
      )}
      {hover !== null && (
        <Tooltip left={pad.left + slot * hover + slot / 2} width={width} title={dayName(days[hover], "long")}>
          {keyed.map((s) => (
            <span key={s.label}>
              <i className="chart-key" style={{ "--key": colorOf(s) } as CSSProperties} /> {s.label} <b>{format(s.values[hover] ?? 0)}</b>
            </span>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

function Tooltip({ left, width, title, children }: { left: number; width: number; title: string; children: ReactNode }) {
  return (
    <div className="chart-tooltip" style={{ left: Math.max(0, Math.min(left + 12, width - 170)) }}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}

// ---------- Lines ----------

interface DayLinesProps {
  period: Period;
  series: Series[];
  /** Dashed lines to set the others against (last month, a budget), neutral unless toned. */
  references?: Series[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  /** A fixed scale, as for 1 to 5 ratings; else from 0 to a nice top. */
  domain?: [number, number];
  ticks?: number[];
  least?: number;
  tickUnit?: number;
  label: string;
  height?: number;
}

/** Lines across the days, gaps where there's nothing, with a crosshair. */
export function DayLines({ period, series, references = [], format, axisFormat = format, domain, ticks: fixedTicks, least = 4, tickUnit, label, height = 200 }: DayLinesProps) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const days = daysOf(period);
  const refs: Series[] = references.map((s) => ({ ...s, tone: s.tone ?? "muted" }));
  const all = [...series, ...refs];
  const dashed = (s: Series) => refs.includes(s);
  const known = all.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const nice = niceScale(Math.max(0, ...known), least, tickUnit);
  const [min, max] = domain ?? [0, nice.top];
  const ticks = fixedTicks ?? (domain ? [min, (min + max) / 2, max] : nice.ticks);
  const pad = { ...PAD, left: 40 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (days.length > 1 ? (i / (days.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => pad.top + plotH - ((v - min) / (max - min || 1)) * plotH;
  const path = (values: (number | null)[]) => {
    let d = "";
    values.forEach((v, i) => {
      if (v === null || i >= days.length) return;
      d += `${i > 0 && values[i - 1] !== null && d ? "L" : "M"}${x(i)},${y(v)}`;
    });
    return d;
  };
  // Sparse lines (a mood logged now and then) show every point.
  const sparse = (s: Series) => s.values.filter((v) => v !== null).length < days.length * 0.6;
  const lastOf = (s: Series) => s.values.reduce<number>((last, v, i) => (v !== null && i < days.length ? i : last), -1);
  const slot = plotW / Math.max(1, days.length);

  return (
    <div className="chart-body" ref={ref}>
      {all.length > 1 && <Legend series={all.map((s) => ({ ...s, dashed: dashed(s) }))} />}
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - box.left - pad.left) / plotW) * (days.length - 1));
            setHover(Math.max(0, Math.min(days.length - 1, i)));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-gridline" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
              <text className="chart-axis" x={pad.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {days.map((day, i) =>
            labelled(period, i, slot) ? (
              <text key={day} className={`chart-axis${day === period.today ? " is-today" : ""}`} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}>
                {axisLabel(period, day)}
              </text>
            ) : null,
          )}
          {refs.map((s) => (
            <path key={s.label} className="chart-line is-dashed" d={path(s.values)} style={{ stroke: colorOf(s) }} />
          ))}
          {series.map((s) => (
            <g key={s.label} style={{ "--stroke": colorOf(s) } as CSSProperties}>
              <path className="chart-line" d={path(s.values)} />
              {s.values.map((v, i) =>
                v !== null && i < days.length && (sparse(s) || i === lastOf(s)) ? <circle key={i} className="chart-dot" cx={x(i)} cy={y(v)} r={sparse(s) ? 3.5 : 4} /> : null,
              )}
            </g>
          ))}
          {/* The latest value of the main line, labelled directly. */}
          {series[0] && lastOf(series[0]) >= 0 && (() => {
            const i = lastOf(series[0]);
            const at = y(series[0].values[i]!);
            const late = i > days.length * 0.8;
            // Above the point, or below it when that would leave the chart.
            return (
              <text className="chart-direct" x={x(i) + (late ? -8 : 8)} y={at - 10 < pad.top + 8 ? at + 18 : at - 10} textAnchor={late ? "end" : "start"}>
                {format(series[0].values[i]!)}
              </text>
            );
          })()}
          {hover !== null && <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} />}
        </svg>
      )}
      {hover !== null && (
        <Tooltip left={x(hover)} width={width} title={dayName(days[hover], "long")}>
          {all.map((s) => (
            <span key={s.label}>
              <i className={`chart-key${dashed(s) ? " is-dashed" : ""}`} style={{ "--key": colorOf(s) } as CSSProperties} /> {s.label}{" "}
              <b>{s.values[hover] === null || s.values[hover] === undefined ? "—" : format(s.values[hover]!)}</b>
            </span>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Ranked bars ----------

export interface BarRow {
  key: string;
  name: string;
  value: number;
  /** The value in words, in place of `format` (an audiobook's time, not "0 pages"). */
  text?: string;
  /** A line across the bar: a budget, a total to reach. */
  target?: number | null;
  color?: string;
  icon?: ReactNode;
  /** Words after the value ("of 12", "£40 over"). */
  note?: string;
  /** Colours the note when it is a verdict ("Behind"). */
  noteTone?: "good" | "bad";
}

/** Horizontal bars, largest first, with names and numbers as text. */
export function BarList({ rows, format, overIsBad, max: fixedMax }: { rows: BarRow[]; format: (value: number) => string; overIsBad?: boolean; /** A fixed full width, as 100 for shares. */ max?: number }) {
  const max = fixedMax ?? Math.max(1e-9, ...rows.map((r) => Math.max(r.value, r.target ?? 0)));
  return (
    <ul className="chart-barlist">
      {rows.map((r) => {
        const over = overIsBad && r.target != null && r.value > r.target;
        return (
          <li key={r.key} title={`${r.name}: ${r.text ?? format(r.value)}${r.note ? ` ${r.note}` : ""}`}>
            <span className="chart-barlist-name">
              {r.icon}
              {r.name}
            </span>
            <span className="chart-barlist-track">
              <span className={over ? "is-over" : undefined} style={{ width: `${(r.value / max) * 100}%`, ...(r.color && !over ? { background: r.color } : {}) }} />
              {r.target != null && <i className="chart-barlist-target" style={{ left: `${(r.target / max) * 100}%` }} aria-hidden="true" />}
            </span>
            <span className="chart-barlist-value">
              {r.text ?? format(r.value)}
              {r.note && <span className={over ? "is-over" : r.noteTone ? `is-${r.noteTone}` : "dim"}> {r.note}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Days as a calendar ----------

const LEVELS = [0, 28, 48, 72, 100];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Each day as a square, darker for more: when a habit happened. */
export function DayGrid({ period, values, describe, label }: { period: Period; values: (number | null)[]; /** The day in words, for its tooltip. */ describe: (index: number) => string; label: string }) {
  const days = daysOf(period);
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  const level = (v: number | null) => (!v || v <= 0 || max === 0 ? 0 : Math.max(1, Math.ceil((v / max) * 4)));
  const offset = (new Date(`${period.start}T00:00`).getDay() + 6) % 7;
  return (
    <div className="chart-daygrid" role="img" aria-label={label}>
      {WEEKDAYS.map((w) => (
        <span key={w} className="chart-daygrid-head">
          {w.slice(0, period.unit === "week" ? 3 : 1)}
        </span>
      ))}
      {Array.from({ length: offset }, (_, i) => (
        <span key={`gap${i}`} />
      ))}
      {days.map((day, i) => {
        const future = day > period.today;
        const v = values[i];
        const l = level(v);
        return (
          <span
            key={day}
            className={`chart-daygrid-cell${future ? " is-future" : ""}${day === period.today ? " is-today" : ""}${l >= 3 ? " is-strong" : ""}`}
            style={l ? ({ background: `color-mix(in oklab, var(--series, var(--accent)) ${LEVELS[l]}%, var(--panel))` } as CSSProperties) : undefined}
            title={`${dayName(day, "long")}: ${future ? "still to come" : v ? describe(i) : "nothing"}`}
          >
            {Number(day.slice(8))}
          </span>
        );
      })}
    </div>
  );
}

/** A row of dots a day for each habit: filled when done. */
export function DotRows({ period, rows }: { period: Period; rows: { label: string; values: boolean[] }[] }) {
  const days = daysOf(period);
  return (
    <div className="chart-dotrows" style={{ "--days": days.length } as CSSProperties}>
      {rows.map((r) => (
        <div key={r.label} className="chart-dotrow" role="img" aria-label={`${r.label}: ${r.values.filter((v, i) => v && days[i] <= period.today).length} of ${days.filter((d) => d <= period.today).length} days`}>
          <span className="chart-dotrow-label">{r.label}</span>
          <span className="chart-dotrow-dots">
            {days.map((day, i) => (
              <i key={day} className={day > period.today ? "is-future" : r.values[i] ? "is-on" : undefined} title={`${dayName(day, "long")}: ${day > period.today ? "still to come" : r.values[i] ? "done" : "not done"}`} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A friendly line where a chart would be, when there's nothing to draw yet. */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="chart-empty">{children}</p>;
}
