import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from "react";
import { Check, Inbox, Plus } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { api, cardFromDrag, errorMessage, nudgeCalendars, type Day, type DayPlan, type PlanTask } from "./api";
import { capacityState, expectedMinutes, plannedMinutes } from "./Capacity";
import { colorOf } from "./palette";
import { draggedTask, TASK_DRAG } from "./TaskPanel";
import { addDays, duration, today as todayNow } from "./time";

type Act = (change: () => Promise<unknown>) => Promise<void>;

interface WeekViewProps {
  /** The Monday the week starts on. */
  weekStart: Day;
  today: Day;
  /** Bumped when something outside changed the plan (e.g. calendars). */
  version: number;
  onOpenDay: (day: Day) => void;
  onError: (message: string) => void;
}

/** Seven days side by side, to spread work over the week: drag tasks
 * between days, or from the inbox, and see which days are full. */
export function WeekView({ weekStart, today, version, onOpenDay, onError }: WeekViewProps) {
  const [plans, setPlans] = useState<DayPlan[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      setPlans(await Promise.all(days.map((d) => api.getDay(d, todayNow()))));
    } catch (e) {
      onError(errorMessage(e));
    }
  }, [weekStart, onError]);

  useEffect(() => void reload(), [reload, version, today]);
  useDataChanged(reload);

  const act: Act = useCallback(
    async (change) => {
      try {
        await change();
        nudgeCalendars(todayNow());
      } catch (e) {
        onError(errorMessage(e));
      }
      await reload();
    },
    [reload, onError],
  );

  if (!plans) return <p className="dim dp-loading">Loading your week…</p>;

  return (
    <div className="dp-week">
      {plans.map((plan) => (
        <DayColumn key={plan.day} plan={plan} today={today} act={act} onOpen={() => onOpenDay(plan.day)} />
      ))}
      <InboxColumn tasks={plans[0].inbox} act={act} />
    </div>
  );
}

/** Moves a dragged task (or plans a dragged board card) to a day or the inbox. */
function dropOn(day: Day | null, act: Act) {
  return (e: DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DRAG);
    if (!id) return;
    e.preventDefault();
    const card = cardFromDrag(id);
    void act(() => (card ? api.planCard(card, day) : api.moveTask(id, day)));
  };
}

function useDropTarget(day: Day | null, act: Act) {
  const [over, setOver] = useState(false);
  const drop = dropOn(day, act);
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
        drop(e);
      },
    },
  };
}

function DayColumn({ plan, today, act, onOpen }: { plan: DayPlan; today: Day; act: Act; onOpen: () => void }) {
  const { over, handlers } = useDropTarget(plan.day, act);
  const planned = plannedMinutes(plan);
  const likely = expectedMinutes(plan, planned) ?? planned;
  const available = plan.settings.dayEndMinute - plan.settings.dayStartMinute;
  const comfortable = available * (1 - plan.settings.bufferPercent / 100);
  const state = capacityState(likely, available, comfortable);
  const date = new Date(`${plan.day}T12:00`);
  const past = plan.day < today;
  const allDay = plan.events.filter((e) => e.allDay);
  const meetings = plan.events.filter((e) => !e.allDay && e.busy);
  const fixed = [...plan.blocks.filter((b) => !b.taskId), ...meetings];
  const fixedMinutes = fixed.reduce((n, b) => n + b.durationMinutes, 0);

  return (
    <section
      className={`dp-week-day${plan.day === today ? " is-today" : ""}${past ? " is-past" : ""}${over ? " is-drop-target" : ""}`}
      aria-label={date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      {...handlers}
    >
      <button className="dp-week-head" onClick={onOpen} title="Open this day">
        <span className="dp-week-weekday">{date.toLocaleDateString("en-GB", { weekday: "short" })}</span>
        <span className="dp-week-date">{date.getDate()}</span>
        {plan.info.plannedAt && <Check size={12} strokeWidth={2.5} className="dp-week-planned" aria-label="Planned" />}
      </button>
      <div className={`dp-week-load is-${state}`} title={`${duration(planned)} planned of ${duration(available)}`}>
        <div className="dp-capacity-bar">
          <span style={{ width: `${Math.min(likely / available, 1) * 100}%` }} />
        </div>
        <span>
          {duration(likely)} / {duration(available)}
        </span>
      </div>

      {(allDay.length > 0 || fixed.length > 0) && (
        <div className="dp-week-fixed">
          {allDay.map((e) => (
            <span key={e.id} className="dp-week-chip" style={{ "--block": colorOf(e.color) } as React.CSSProperties}>
              {e.title}
            </span>
          ))}
          {fixed.length > 0 && (
            <span className="dim" title={fixed.map((f) => f.title || "Block").join(", ")}>
              {fixed.length} fixed · {duration(fixedMinutes)}
            </span>
          )}
        </div>
      )}

      <ul className="dp-week-list">
        {plan.tasks.map((t) => (
          <WeekTask key={t.id} task={t} act={act} />
        ))}
      </ul>
      {!past && <AddLine day={plan.day} act={act} />}
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
      <ul className="dp-week-list">
        {tasks.map((t) => (
          <WeekTask key={t.id} task={t} act={act} />
        ))}
      </ul>
    </section>
  );
}

function WeekTask({ task, act }: { task: PlanTask; act: Act }) {
  const done = task.doneAt !== null;
  return (
    <li
      className={`dp-week-task${done ? " is-done" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TASK_DRAG, task.id);
        e.dataTransfer.effectAllowed = "move";
        draggedTask.id = task.id;
        draggedTask.minutes = task.estimateMinutes;
      }}
      onDragEnd={() => Object.assign(draggedTask, { id: null, minutes: null })}
    >
      <button
        className={`dp-check${done ? " is-checked" : ""}`}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={() => act(() => api.setDone(task.id, !done))}
      >
        {done && <Check size={11} strokeWidth={2.5} />}
      </button>
      {task.focusRank !== null && <span className="dp-rank">{task.focusRank}</span>}
      <span className="dp-week-title">{task.title}</span>
      {task.estimateMinutes !== null && <span className="dp-week-est">{duration(task.estimateMinutes)}</span>}
    </li>
  );
}

function AddLine({ day, act }: { day: Day; act: Act }) {
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
