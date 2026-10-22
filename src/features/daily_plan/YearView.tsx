import type { Day, DaySlice } from "./api";
import { useRange } from "./RangeParts";
import { addDays, duration, monthName } from "./time";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

interface YearViewProps {
  /** Any day in the year. */
  year: Day;
  today: Day;
  version: number;
  onOpenDay: (day: Day) => void;
  onOpenMonth: (day: Day) => void;
  onError: (message: string) => void;
}

/** How full a day is, from 0 (nothing planned) to 4 (all or more of the working day). */
function level(planned: number, available: number): number {
  if (planned <= 0) return 0;
  const share = planned / available;
  return share <= 0.25 ? 1 : share <= 0.5 ? 2 : share <= 0.75 ? 3 : 4;
}

/** The year at a glance: every day shaded by how much was planned for it. */
export function YearView({ year, today, version, onOpenDay, onOpenMonth, onError }: YearViewProps) {
  const y = year.slice(0, 4);
  const { data } = useRange(`${y}-01-01`, `${y}-12-31`, today, version, onError);
  if (!data) return <p className="dim dp-loading">Loading your year…</p>;

  const available = data.settings.dayEndMinute - data.settings.dayStartMinute;
  const byDay = new Map(data.days.map((d) => [d.day, d]));
  const tasks = data.days.flatMap((d) => d.tasks);
  const done = tasks.filter((t) => t.doneAt).length;
  const plannedDays = data.days.filter((d) => d.planned).length;
  const tracked = tasks.reduce((n, t) => n + t.actualMinutes, 0);

  return (
    <div className="dp-year">
      <div className="dp-year-stats">
        <span>
          <b>{done}</b> of {tasks.length} tasks done
        </span>
        <span>
          <b>{plannedDays}</b> {plannedDays === 1 ? "day" : "days"} planned
        </span>
        <span>
          <b>{duration(tracked)}</b> tracked
        </span>
        <span className="dp-year-legend" aria-hidden="true">
          Planned time
          <span className="dp-year-legend-scale">
            {[0, 1, 2, 3, 4].map((l) => (
              <i key={l} className={`dp-year-day lv-${l}`} />
            ))}
          </span>
          less → more
        </span>
      </div>
      <div className="dp-year-months">
        {Array.from({ length: 12 }, (_, m) => {
          const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
          return <MiniMonth key={first} first={first} byDay={byDay} available={available} today={today} onOpenDay={onOpenDay} onOpenMonth={onOpenMonth} />;
        })}
      </div>
    </div>
  );
}

interface MiniMonthProps {
  first: Day;
  byDay: Map<Day, DaySlice>;
  available: number;
  today: Day;
  onOpenDay: (day: Day) => void;
  onOpenMonth: (day: Day) => void;
}

function MiniMonth({ first, byDay, available, today, onOpenDay, onOpenMonth }: MiniMonthProps) {
  const lead = (new Date(`${first}T12:00`).getDay() + 6) % 7;
  const days: Day[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);

  return (
    <section className="dp-year-month">
      <button className="dp-year-month-name" onClick={() => onOpenMonth(first)} title="Open this month">
        {monthName(first, false)}
      </button>
      <div className="dp-year-grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="dp-year-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const slice = byDay.get(d);
          const tasks = slice?.tasks ?? [];
          const finished = tasks.filter((t) => t.doneAt).length;
          const meetings = slice?.events.filter((e) => !e.allDay).length ?? 0;
          const planned = slice?.plannedMinutes ?? 0;
          const label = [
            new Date(`${d}T12:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
            tasks.length ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} (${finished} done)` : "no tasks",
            planned ? `${duration(planned)} planned` : "",
            meetings ? `${meetings} meeting${meetings === 1 ? "" : "s"}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={d}
              className={`dp-year-day lv-${level(planned, available)}${d === today ? " is-today" : ""}`}
              title={label}
              aria-label={label}
              onClick={() => onOpenDay(d)}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </section>
  );
}
