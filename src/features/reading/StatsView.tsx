import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Target } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { ChartCard, PAD, roundedTop, scale, Stat, useWidth } from "../project_board/InsightsView";
import { mediumDay, today } from "../daily_plan/time";
import { api, errorMessage, hours, type Goal, type ReadingStats } from "./api";
import { Cover, Progress, Stars } from "./Cover";
import { readingChanged, setReadingUi, useReadingUi } from "./readingUi";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A year of reading: the goal, how much, how often, and what you finished. */
export function StatsView() {
  const { revision } = useReadingUi();
  const thisYear = Number(today().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);
  useDataChanged(() => setAsked((n) => n + 1));

  useEffect(() => {
    api.stats(year, today()).then(setStats, (e) => setError(errorMessage(e)));
  }, [year, revision, asked]);

  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  return (
    <div className="pb-insights rd-stats">
      <div className="rd-year">
        <button className="icon-btn" aria-label="Previous year" onClick={() => setYear(year - 1)}>
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <h2>{year}</h2>
        <button className="icon-btn" aria-label="Next year" onClick={() => setYear(year + 1)} disabled={year >= thisYear}>
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>
      {error && <p className="rd-error">{error}</p>}
      {!stats ? (
        <p className="dim">Loading…</p>
      ) : (
        <>
          <GoalCard goal={stats.goal} current={year === thisYear} />
          <div className="pb-stat-row">
            <Stat label="Books finished" value={stats.goal.finished} />
            <Stat label="Pages read" value={stats.pages.toLocaleString()} />
            {stats.listenedMinutes > 0 && <Stat label="Listened" value={hours(stats.listenedMinutes)} />}
            {stats.readingMinutes > 0 && <Stat label="Time reading (logged)" value={hours(stats.readingMinutes)} />}
            <Stat label={`Reading streak (best ${days(stats.longestStreak)})`} value={days(stats.streak)} />
            <Stat label="Pages a day, last 30 days" value={stats.pagesPerDay.toFixed(1)} />
            <Stat label="Days you read" value={stats.readingDays} />
            <Stat label="Average rating" value={stats.averageRating === null ? "—" : `${stats.averageRating.toFixed(1)} ★`} />
            <Stat label="Days per book" value={stats.averageDays === null ? "—" : Math.round(stats.averageDays)} />
          </div>
          <div className="pb-chart-grid">
            <ChartCard title="Pages read" note="Each month">
              <MonthBars values={stats.months.map((m) => m.pages)} unit="pages" />
            </ChartCard>
            <ChartCard title="Books finished" note="Each month">
              <MonthBars values={stats.months.map((m) => m.books)} unit="books" />
            </ChartCard>
          </div>
          <section className="panel rd-finished">
            <header>
              <h3 className="panel-title">Finished in {year}</h3>
              <span className="panel-meta">{stats.finished.length}</span>
            </header>
            {stats.finished.length === 0 ? (
              <p className="dim">Books you finish this year show here.</p>
            ) : (
              <ul className="rd-finished-list">
                {stats.finished.map((f) => (
                  <li key={`${f.bookId}-${f.finishedOn}`}>
                    <button onClick={() => setReadingUi({ book: f.bookId })} title={f.title}>
                      <Cover url={f.coverUrl} title={f.title} size="sm" />
                      <span className="rd-result-text">
                        <b>{f.title}</b>
                        <span className="dim">
                          {f.outcome === "dnf" ? "Put down" : "Finished"} {mediumDay(f.finishedOn)}
                          {f.days !== null && ` · ${days(f.days)}`}
                        </span>
                        {f.rating && <Stars value={f.rating} size={12} />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** The yearly goal: how many books, and whether you're on track. */
export function GoalCard({ goal, current }: { goal: Goal; current: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(goal.books ? String(goal.books) : "");
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.setGoal(goal.year, Number.parseInt(text, 10) || 0);
      setEditing(false);
      readingChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const ahead = goal.books ? Math.round(goal.finished - goal.expected) : 0;
  const pace =
    !goal.books || !current
      ? null
      : goal.finished >= goal.books
        ? "Goal reached. Anything more is a bonus."
        : ahead > 0
          ? `${ahead} book${ahead === 1 ? "" : "s"} ahead of schedule.`
          : ahead < 0
            ? `${-ahead} book${ahead === -1 ? "" : "s"} behind schedule. ${goal.books - goal.finished} to go.`
            : "Right on schedule.";

  return (
    <section className="panel rd-goal">
      <Target size={18} strokeWidth={1.75} className="rd-goal-icon" />
      {editing ? (
        <form className="rd-inline" onSubmit={save}>
          <label>
            Read
            <input className="rd-num" autoFocus inputMode="numeric" value={text} aria-label="Books to read" onChange={(e) => setText(e.currentTarget.value)} />
            books in {goal.year}
          </label>
          <button className="btn btn-sm" type="submit">
            Save
          </button>
          <button className="btn btn-sm btn-ghost" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          {goal.books && <span className="dim rd-small">Save 0 to remove the goal.</span>}
          {error && <span className="rd-error">{error}</span>}
        </form>
      ) : goal.books ? (
        <div className="rd-goal-body">
          <div className="rd-goal-line">
            <b>
              {goal.finished} of {goal.books} books
            </b>
            <span className="dim">{goal.year} goal</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
              Change
            </button>
          </div>
          <Progress percent={Math.min(100, (goal.finished / goal.books) * 100)} label="Reading goal" />
          {pace && <span className="dim rd-small">{pace}</span>}
        </div>
      ) : (
        <div className="rd-goal-line">
          <span className="dim">No goal for {goal.year}.</span>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Set a reading goal
          </button>
        </div>
      )}
    </section>
  );
}

/** Twelve bars, one a month, with the value on hover. */
function MonthBars({ values, unit }: { values: number[]; unit: string }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const height = 200;
  const { top, ticks } = scale(Math.max(...values));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / 12;
  const barW = Math.max(4, Math.min(24, slot - 8));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  return (
    <div className="pb-chart-body" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${unit} each month`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="pb-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="pb-axis" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {t >= 1000 ? `${t / 1000}k` : t}
              </text>
            </g>
          ))}
          {values.map((v, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.max(0, y(0) - y(v));
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                {h > 0 && <path className={`pb-bar${hover === i ? " is-hover" : ""}`} d={roundedTop(cx - barW / 2, y(v), barW, h, 4)} />}
                {(slot > 28 || i % 3 === 0) && (
                  <text className="pb-axis" x={cx} y={height - 6} textAnchor="middle">
                    {MONTHS[i]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && (
        <div className="pb-tooltip" style={{ left: Math.min(PAD.left + slot * hover + slot / 2 + 12, Math.max(0, width - 140)) }}>
          <strong>{MONTHS[hover]}</strong>
          <span>
            {unit === "pages" ? "Pages" : "Books"} <b>{values[hover].toLocaleString()}</b>
          </span>
        </div>
      )}
    </div>
  );
}
