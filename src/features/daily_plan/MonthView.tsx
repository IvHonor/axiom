import type { CSSProperties } from "react";
import { CalendarDays } from "lucide-react";
import type { Day, DaySlice, Settings } from "./api";
import { agenda, type AgendaItem } from "./agenda";
import { colorOf } from "./palette";
import { AgendaRow, useDropTarget, useRange, type Act } from "./RangeParts";
import { addDays, addMonths, mondayOf, monthOf } from "./time";
import { DayLoad } from "./WeekView";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Lines shown in a day before "+N more". */
const SHOWN = 3;

interface MonthViewProps {
  /** Any day in the month. */
  month: Day;
  today: Day;
  version: number;
  onOpenDay: (day: Day) => void;
  onError: (message: string) => void;
}

/** The month as a calendar: each day's first few things, how full it is,
 * and tasks you can drag to another day. */
export function MonthView({ month, today, version, onOpenDay, onError }: MonthViewProps) {
  const first = monthOf(month);
  const start = mondayOf(first);
  const end = addDays(mondayOf(addDays(addMonths(first, 1), -1)), 6);
  const { data, act } = useRange(start, end, today, version, onError);
  if (!data) return <p className="dim dp-loading">Loading your month…</p>;
  const weeks = data.days.length / 7;

  return (
    <div className="dp-month">
      <div className="dp-month-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="dp-month-grid" style={{ gridTemplateRows: `repeat(${weeks}, minmax(112px, 1fr))` }}>
        {data.days.map((slice) => (
          <MonthCell
            key={slice.day}
            slice={slice}
            inMonth={slice.day.slice(0, 7) === first.slice(0, 7)}
            today={today}
            settings={data.settings}
            pace={data.pace}
            act={act}
            onOpen={() => onOpenDay(slice.day)}
          />
        ))}
      </div>
    </div>
  );
}

interface MonthCellProps {
  slice: DaySlice;
  inMonth: boolean;
  today: Day;
  settings: Settings;
  pace: number | null;
  act: Act;
  onOpen: () => void;
}

function MonthCell({ slice, inMonth, today, settings, pace, act, onOpen }: MonthCellProps) {
  const { over, handlers } = useDropTarget(slice.day, act);
  const { allDay, timed, anytime } = agenda(slice);
  const items: ({ kind: "allday"; id: string; title: string; color: string } | AgendaItem)[] = [
    ...allDay.map((e) => ({ kind: "allday" as const, id: e.id, title: e.title, color: e.color })),
    ...timed,
    ...anytime,
  ];
  const more = items.length - SHOWN;
  const date = new Date(`${slice.day}T12:00`);

  return (
    <section
      className={`dp-month-cell${inMonth ? "" : " is-other"}${slice.day === today ? " is-today" : ""}${slice.day < today ? " is-past" : ""}${over ? " is-drop-target" : ""}`}
      aria-label={date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      {...handlers}
    >
      <div className="dp-month-top">
        <button className="dp-month-date" onClick={onOpen} title="Open this day">
          {date.getDate()}
        </button>
        {slice.plannedMinutes > 0 && <DayLoad slice={slice} settings={settings} pace={pace} label={false} />}
      </div>
      <ul className="dp-ag is-compact">
        {items.slice(0, SHOWN).map((item) =>
          item.kind === "allday" ? (
            <li key={`allday-${item.id}`} className="dp-ag-item is-allday" style={{ "--block": colorOf(item.color) } as CSSProperties} title={`${item.title} · all day`}>
              <span className="dp-ag-title">
                <CalendarDays size={11} strokeWidth={2} className="dp-ag-icon" aria-hidden="true" />
                {item.title}
              </span>
            </li>
          ) : (
            <AgendaRow key={`${item.kind}-${item.id}`} item={item} act={act} compact />
          ),
        )}
      </ul>
      {more > 0 && (
        <button className="dp-month-more" onClick={onOpen}>
          +{more} more
        </button>
      )}
    </section>
  );
}
