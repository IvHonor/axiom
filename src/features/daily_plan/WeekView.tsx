import { Check, Inbox } from "lucide-react";
import type { CSSProperties } from "react";
import type { Day, DaySlice, PlanTask, Settings } from "./api";
import { agenda, likelyMinutes } from "./agenda";
import { capacityState } from "./Capacity";
import { colorOf } from "./palette";
import { AddLine, AgendaRow, useDropTarget, useRange, type Act } from "./RangeParts";
import { addDays, duration } from "./time";

interface WeekViewProps {
  /** The Monday the week starts on. */
  weekStart: Day;
  today: Day;
  /** Bumped when something outside changed the plan (e.g. calendars). */
  version: number;
  onOpenDay: (day: Day) => void;
  onError: (message: string) => void;
}

/** Seven days side by side, each listing what's on it in time order: drag
 * tasks between days, or from the inbox, and see which days are full. */
export function WeekView({ weekStart, today, version, onOpenDay, onError }: WeekViewProps) {
  const { data, act } = useRange(weekStart, addDays(weekStart, 6), today, version, onError);
  if (!data) return <p className="dim dp-loading">Loading your week…</p>;

  return (
    <div className="dp-week">
      {data.days.map((slice) => (
        <DayColumn
          key={slice.day}
          slice={slice}
          settings={data.settings}
          pace={data.pace}
          today={today}
          act={act}
          onOpen={() => onOpenDay(slice.day)}
        />
      ))}
      <InboxColumn tasks={data.inbox} act={act} />
    </div>
  );
}

/** How full a day is: a bar and "4h / 8h 30m", coloured when it's tight or over. */
export function DayLoad({ slice, settings, pace, label = true }: { slice: DaySlice; settings: Settings; pace: number | null; label?: boolean }) {
  const likely = likelyMinutes(slice, pace);
  const available = settings.dayEndMinute - settings.dayStartMinute;
  const state = capacityState(likely, available, available * (1 - settings.bufferPercent / 100));
  return (
    <div className={`dp-week-load is-${state}`} title={`${duration(likely)} planned of ${duration(available)}`}>
      <div className="dp-capacity-bar">
        <span style={{ width: `${Math.min(likely / available, 1) * 100}%` }} />
      </div>
      {label && (
        <span>
          {duration(likely)} / {duration(available)}
        </span>
      )}
    </div>
  );
}

interface DayColumnProps {
  slice: DaySlice;
  settings: Settings;
  pace: number | null;
  today: Day;
  act: Act;
  onOpen: () => void;
}

function DayColumn({ slice, settings, pace, today, act, onOpen }: DayColumnProps) {
  const { over, handlers } = useDropTarget(slice.day, act);
  const date = new Date(`${slice.day}T12:00`);
  const past = slice.day < today;
  const { allDay, due, timed, anytime } = agenda(slice);
  const empty = !allDay.length && !due.length && !timed.length && !anytime.length;

  return (
    <section
      className={`dp-week-day${slice.day === today ? " is-today" : ""}${past ? " is-past" : ""}${over ? " is-drop-target" : ""}`}
      aria-label={date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      {...handlers}
    >
      <button className="dp-week-head" onClick={onOpen} title="Open this day">
        <span className="dp-week-weekday">{date.toLocaleDateString("en-GB", { weekday: "short" })}</span>
        <span className="dp-week-date">{date.getDate()}</span>
        {slice.planned && <Check size={12} strokeWidth={2.5} className="dp-week-planned" aria-label="Planned" />}
      </button>
      <DayLoad slice={slice} settings={settings} pace={pace} />

      {allDay.length > 0 && (
        <div className="dp-week-fixed">
          {allDay.map((e) => (
            <span key={e.id} className="dp-week-chip" style={{ "--block": colorOf(e.color) } as CSSProperties} title={`${e.title} · all day`}>
              {e.title}
            </span>
          ))}
        </div>
      )}
      {due.length > 0 && (
        <ul className="dp-ag">
          {due.map((item) => (
            <AgendaRow key={`due-${item.id}`} item={item} act={act} />
          ))}
        </ul>
      )}
      {timed.length > 0 && (
        <ul className="dp-ag">
          {timed.map((item) => (
            <AgendaRow key={`${item.kind}-${item.id}`} item={item} act={act} />
          ))}
        </ul>
      )}
      {anytime.length > 0 && (
        <>
          <p className="dp-ag-label">Anytime</p>
          <ul className="dp-ag">
            {anytime.map((item) => (
              <AgendaRow key={`${item.kind}-${item.id}`} item={item} act={act} />
            ))}
          </ul>
        </>
      )}
      {empty && <p className="dp-ag-empty">{past ? "Nothing planned." : "Free"}</p>}
      {!past && <AddLine day={slice.day} act={act} />}
    </section>
  );
}

function InboxColumn({ tasks, act }: { tasks: PlanTask[]; act: Act }) {
  const { over, handlers } = useDropTarget(null, act);
  return (
    <section className={`dp-week-day dp-week-inbox${over ? " is-drop-target" : ""}`} aria-label="Inbox" {...handlers}>
      <div className="dp-week-head is-static">
        <Inbox size={14} strokeWidth={1.75} />
        <span className="dp-week-weekday">Inbox</span>
      </div>
      <p className="dp-hint">Drag tasks onto a day to plan them.</p>
      <ul className="dp-ag">
        {tasks.map((task) => (
          <AgendaRow key={task.id} item={{ kind: "task", id: task.id, start: null, minutes: task.estimateMinutes, task, color: null }} act={act} />
        ))}
      </ul>
    </section>
  );
}
