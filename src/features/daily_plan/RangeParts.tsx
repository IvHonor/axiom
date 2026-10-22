import { useCallback, useEffect, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Check, Plus, Repeat } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { api, cardFromDrag, errorMessage, nudgeCalendars, type Day, type PlanTask, type RangePlan } from "./api";
import type { AgendaItem } from "./agenda";
import { colorOf } from "./palette";
import { planChanged } from "./planUi";
import { draggedTask, TASK_DRAG } from "./TaskPanel";
import { clock, duration, today as todayNow } from "./time";

export type Act = (change: () => Promise<unknown>) => Promise<void>;

/** Loads days `from` to `to`, and reloads after each change made through `act`. */
export function useRange(from: Day, to: Day, today: Day, version: number, onError: (message: string) => void) {
  const [data, setData] = useState<RangePlan | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api.range(from, to, todayNow()));
    } catch (e) {
      onError(errorMessage(e));
    }
  }, [from, to, onError]);

  useEffect(() => void reload(), [reload, version, today]);
  useDataChanged(reload);

  const act: Act = useCallback(
    async (change) => {
      try {
        await change();
        nudgeCalendars(todayNow());
        planChanged();
      } catch (e) {
        onError(errorMessage(e));
      }
      await reload();
    },
    [reload, onError],
  );

  // Until the new range arrives, don't show the old one under the new title.
  const current = data && data.days[0]?.day === from && data.days[data.days.length - 1]?.day === to ? data : null;
  return { data: current, act };
}

/** A day (or the inbox, `null`) that tasks and board cards can be dropped on. */
export function useDropTarget(day: Day | null, act: Act) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(TASK_DRAG)) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(TASK_DRAG);
        if (!id) return;
        e.preventDefault();
        const card = cardFromDrag(id);
        void act(() => (card ? api.planCard(card, day) : api.moveTask(id, day)));
      },
    },
  };
}

function dragProps(task: PlanTask) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(TASK_DRAG, task.id);
      e.dataTransfer.effectAllowed = "move";
      draggedTask.id = task.id;
      draggedTask.minutes = task.estimateMinutes;
    },
    onDragEnd: () => Object.assign(draggedTask, { id: null, minutes: null }),
  };
}

function CheckBox({ task, act }: { task: PlanTask; act: Act }) {
  const done = task.doneAt !== null;
  return (
    <button
      className={`dp-check${done ? " is-checked" : ""}`}
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      onClick={() => act(() => api.setDone(task.id, !done))}
    >
      {done && <Check size={10} strokeWidth={2.5} />}
    </button>
  );
}

/** One line of a day: a task (tick it, drag it to another day), a block or a meeting. */
export function AgendaRow({ item, act, compact = false }: { item: AgendaItem; act: Act; compact?: boolean }) {
  // The week has room for the time span on a line of its own; the month only for the start.
  const time =
    item.start !== null && (
      <span className="dp-ag-time">{compact || item.minutes === null ? clock(item.start) : `${clock(item.start)}–${clock(item.start + item.minutes)}`}</span>
    );
  const body = (title: ReactNode) =>
    compact ? (
      <>
        {time}
        <span className="dp-ag-title">{title}</span>
      </>
    ) : (
      <span className="dp-ag-body">
        {time}
        <span className="dp-ag-title">{title}</span>
      </span>
    );
  if (item.kind === "task") {
    const { task } = item;
    return (
      <li
        className={`dp-ag-item is-task${task.doneAt ? " is-done" : ""}`}
        style={{ "--block": item.color ? colorOf(item.color) : "var(--line-strong)" } as CSSProperties}
        title={`${task.title}${item.start !== null ? ` · ${clock(item.start)}` : ""}${task.estimateMinutes ? ` · ${duration(task.estimateMinutes)}` : ""}`}
        {...dragProps(task)}
      >
        <CheckBox task={task} act={act} />
        {body(
          <>
            {task.focusRank !== null && <span className="dp-rank">{task.focusRank}</span>}
            {task.title}
          </>,
        )}
        {!compact && item.start === null && task.estimateMinutes !== null && <span className="dp-ag-meta">{duration(task.estimateMinutes)}</span>}
      </li>
    );
  }
  const isEvent = item.kind === "event";
  return (
    <li
      className={`dp-ag-item ${isEvent ? "is-event" : "is-block"}${isEvent && !item.busy ? " is-free" : ""}`}
      style={{ "--block": colorOf(item.color) } as CSSProperties}
      title={`${item.title} · ${clock(item.start)}–${clock(item.start + item.minutes)}${isEvent ? " · from your calendar" : ""}`}
    >
      {body(
        <>
          {isEvent ? (
            <CalendarDays size={11} strokeWidth={2} className="dp-ag-icon" aria-label="Calendar event" />
          ) : (
            item.routine && <Repeat size={11} strokeWidth={2} className="dp-ag-icon" aria-label="Routine" />
          )}
          {item.title}
        </>,
      )}
    </li>
  );
}

export function AddLine({ day, act }: { day: Day; act: Act }) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const value = text;
    setText("");
    void act(() => api.quickAdd(value, day, todayNow()));
  };
  return (
    <form className="dp-week-add" onSubmit={submit}>
      <Plus size={13} strokeWidth={1.75} />
      <input value={text} placeholder="Add a task" aria-label="Add a task to this day" onChange={(e) => setText(e.currentTarget.value)} />
    </form>
  );
}
