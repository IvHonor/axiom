import { useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { ArrowRight, Check, Ellipsis, Flag, Inbox, Kanban, Pause, Play, Plus, Star, Trash2 } from "lucide-react";
import { Dropdown } from "../../shell/ui/Dropdown";
import { DueChip, DueEdit } from "./due";
import { api, cardDragId, cardFromDrag, MAX_FOCUS, trackedMinutes, type Block, type Card, type Day, type DayPlan, type PlanTask } from "./api";
import { colorOf } from "./palette";
import { addDays, clock, duration, parseDuration, relativeDay } from "./time";

/** Drag-and-drop data type for a task (or a board card), used by the list and the timeline. */
export const TASK_DRAG = "application/x-axiom-plan-task";

/** The task being dragged. Browsers hide drag data until the drop, but the
 * timeline needs the task's length while it's still being dragged. */
export const draggedTask: { id: string | null; minutes: number | null } = { id: null, minutes: null };

type Act = (change: () => Promise<unknown>) => Promise<void>;

interface TaskPanelProps {
  plan: DayPlan;
  today: Day;
  /** Re-renders running timers. */
  now: number;
  act: Act;
  /** Opens focus mode on a task, starting its timer. */
  onFocus: (task: PlanTask) => void;
  /** Shown under the inbox, such as the open event's details. */
  children?: ReactNode;
}

/** The left column: top priorities, the day's tasks, board suggestions, leftovers and the inbox. */
export function TaskPanel({ plan, today, now, act, onFocus, children }: TaskPanelProps) {
  const isToday = plan.day === today;
  const focus = plan.tasks.filter((t) => t.focusRank !== null);
  const rest = plan.tasks.filter((t) => t.focusRank === null);
  const focusFull = focus.length >= MAX_FOCUS;
  const scheduled = (task: PlanTask) => plan.blocks.find((b) => b.taskId === task.id);
  const cardOf = (task: PlanTask) => plan.cards.find((c) => c.id === task.boardTaskId);

  /** A task or board card dropped on a list (not a row) goes to the end of it. */
  const listDrop = (day: Day | null) => (e: DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DRAG);
    if (!id) return;
    e.preventDefault();
    const card = cardFromDrag(id);
    void act(() => (card ? api.planCard(card, day) : api.moveTask(id, day)));
  };
  const rowDrop = (day: Day | null, beforeId: string) => (e: DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DRAG);
    if (!id || id === beforeId) return;
    e.preventDefault();
    e.stopPropagation();
    const card = cardFromDrag(id);
    void act(() => (card ? api.planCard(card, day) : api.moveTask(id, day, beforeId)));
  };

  const row = (task: PlanTask, list: Day | null, extra?: ReactNode) => (
    <TaskRow
      key={task.id}
      task={task}
      block={scheduled(task)}
      card={cardOf(task)}
      focusFull={focusFull}
      day={plan.day}
      now={now}
      act={act}
      onFocus={onFocus}
      onDropBefore={rowDrop(list, task.id)}
      extra={extra}
    />
  );

  return (
    <div className="dp-panel">
      <section className="dp-section" onDragOver={allowTaskDrop} onDrop={listDrop(plan.day)}>
        <h3 className="dp-heading">
          <Star size={13} strokeWidth={1.75} /> Top {MAX_FOCUS}
        </h3>
        {focus.length ? (
          <ol className="dp-list dp-focus">{focus.map((t) => row(t, plan.day))}</ol>
        ) : (
          <p className="dp-hint">Star up to {MAX_FOCUS} tasks that matter most{isToday ? " today" : ""}. Do them first.</p>
        )}
      </section>

      <section className="dp-section" onDragOver={allowTaskDrop} onDrop={listDrop(plan.day)}>
        <h3 className="dp-heading">
          Tasks <span className="dp-count">{rest.length}</span>
        </h3>
        {rest.length ? (
          <ul className="dp-list">{rest.map((t) => row(t, plan.day))}</ul>
        ) : (
          <p className="dp-hint">
            {plan.tasks.length ? "Everything planned is a top priority." : "Nothing planned yet. Add a task above, or drag one in from below."}
          </p>
        )}
      </section>

      {plan.dueSoon.length > 0 && (
        <section className="dp-section dp-due-soon">
          <h3 className="dp-heading">
            <Flag size={13} strokeWidth={1.75} /> Due soon <span className="dp-count">{plan.dueSoon.length}</span>
          </h3>
          <ul className="dp-list">
            {plan.dueSoon.map((t) =>
              row(
                t,
                t.day,
                <span className="dp-row-actions">
                  {t.day && <span className="dp-from">Planned {relativeDay(t.day, today).toLowerCase()}</span>}
                  <button className="icon-btn" title="Do it today" aria-label="Plan for today" onClick={() => act(() => api.moveTask(t.id, today))}>
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </button>
                </span>,
              ),
            )}
          </ul>
        </section>
      )}

      {plan.suggestions.length > 0 && (
        <section className="dp-section dp-suggestions">
          <h3 className="dp-heading">
            <Kanban size={13} strokeWidth={1.75} /> From your boards <span className="dp-count">{plan.suggestions.length}</span>
          </h3>
          <ul className="dp-list">
            {plan.suggestions.map((card) => (
              <CardRow key={card.id} card={card} day={plan.day} today={today} act={act} />
            ))}
          </ul>
        </section>
      )}

      {isToday && plan.earlier.length > 0 && (
        <section className="dp-section dp-earlier">
          <h3 className="dp-heading">
            From earlier days <span className="dp-count">{plan.earlier.length}</span>
            <span className="dp-heading-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => act(() => api.carryOver(plan.earlier.map((t) => t.id), "today", today))}>
                Move all to today
              </button>
            </span>
          </h3>
          <ul className="dp-list">
            {plan.earlier.map((t) =>
              row(
                t,
                t.day,
                <span className="dp-row-actions">
                  <span className="dp-from">{relativeDay(t.day!, today)}</span>
                  <button className="icon-btn" title="Move to today" aria-label="Move to today" onClick={() => act(() => api.carryOver([t.id], "today", today))}>
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </button>
                  <button className="icon-btn" title="Back to the inbox" aria-label="Back to the inbox" onClick={() => act(() => api.carryOver([t.id], "inbox", today))}>
                    <Inbox size={14} strokeWidth={1.75} />
                  </button>
                </span>,
              ),
            )}
          </ul>
        </section>
      )}

      <section className="dp-section dp-inbox" onDragOver={allowTaskDrop} onDrop={listDrop(null)}>
        <h3 className="dp-heading">
          <Inbox size={13} strokeWidth={1.75} /> Inbox <span className="dp-count">{plan.inbox.length}</span>
        </h3>
        {plan.inbox.length ? (
          <ul className="dp-list">
            {plan.inbox.map((t) =>
              row(
                t,
                null,
                <span className="dp-row-actions">
                  <button
                    className="icon-btn"
                    title={`Plan for ${relativeDay(plan.day, today).toLowerCase()}`}
                    aria-label="Plan for this day"
                    onClick={() => act(() => api.moveTask(t.id, plan.day))}
                  >
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </button>
                </span>,
              ),
            )}
          </ul>
        ) : (
          <p className="dp-hint">Tasks without a day wait here until you plan them. End a quick add with "inbox" to put one here.</p>
        )}
      </section>
      {children}
    </div>
  );
}

const allowTaskDrop = (e: DragEvent) => {
  if (e.dataTransfer.types.includes(TASK_DRAG)) e.preventDefault();
};

/** "Due today", "Overdue", "Due Fri 24 Oct" or the column it's in. */
export function cardStatus(card: Card, today: Day): { text: string; urgent: boolean } {
  if (card.dueDate && card.dueDate < today) return { text: "Overdue", urgent: true };
  if (card.dueDate === today) return { text: "Due today", urgent: true };
  if (card.dueDate) return { text: `Due ${relativeDay(card.dueDate, today)}`, urgent: false };
  return { text: card.inProgress ? `In ${card.columnName}` : card.columnName, urgent: false };
}

/** A small project tag in the project's colour. */
export function ProjectChip({ card }: { card: Card }) {
  return (
    <span className="dp-project" style={{ "--project": colorOf(card.projectColor) } as CSSProperties} title={`${card.projectName} · ${card.columnName}`}>
      {card.projectName}
    </span>
  );
}

/** A board card suggested for the day: add it, or drag it onto the timeline. */
export function CardRow({ card, day, today, act }: { card: Card; day: Day; today: Day; act: Act }) {
  const status = cardStatus(card, today);
  return (
    <li
      className="dp-row dp-card-row"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TASK_DRAG, cardDragId(card.id));
        e.dataTransfer.effectAllowed = "copy";
        draggedTask.id = cardDragId(card.id);
        draggedTask.minutes = card.estimateMinutes;
      }}
      onDragEnd={() => Object.assign(draggedTask, { id: null, minutes: null })}
    >
      <button className="icon-btn dp-add" title="Add to this day" aria-label={`Add ${card.title} to this day`} onClick={() => act(() => api.planCard(card.id, day))}>
        <Plus size={14} strokeWidth={2} />
      </button>
      <span className="dp-title">{card.title}</span>
      <ProjectChip card={card} />
      <span className={status.urgent ? "dp-due is-urgent" : "dp-due"}>{status.text}</span>
      {card.estimateMinutes && <span className="dp-chip">{duration(card.estimateMinutes)}</span>}
    </li>
  );
}

interface TaskRowProps {
  task: PlanTask;
  block: Block | undefined;
  /** The board card it came from, if any. */
  card: Card | undefined;
  focusFull: boolean;
  /** The day being shown, for "move to the next day". */
  day: Day;
  now: number;
  act: Act;
  onFocus: (task: PlanTask) => void;
  onDropBefore: (e: DragEvent) => void;
  extra?: ReactNode;
}

function TaskRow({ task, block, card, focusFull, day, now, act, onFocus, onDropBefore, extra }: TaskRowProps) {
  const [editing, setEditing] = useState<"title" | "estimate" | "due" | null>(null);
  const [over, setOver] = useState(false);
  const done = task.doneAt !== null;
  const starred = task.focusRank !== null;
  const running = task.timerStartedAt !== null;
  const tracked = Math.floor(trackedMinutes(task, now));
  const save = (fields: Partial<{ title: string; estimateMinutes: number | null }>) =>
    act(() => api.updateTask(task.id, { title: task.title, notes: task.notes, estimateMinutes: task.estimateMinutes, ...fields }));

  return (
    <li
      className={`dp-row${done ? " is-done" : ""}${running ? " is-running" : ""}${over ? " is-drop-target" : ""}`}
      draggable={editing === null}
      onDragStart={(e) => {
        e.dataTransfer.setData(TASK_DRAG, task.id);
        e.dataTransfer.effectAllowed = "move";
        draggedTask.id = task.id;
        draggedTask.minutes = task.estimateMinutes;
      }}
      onDragEnd={() => Object.assign(draggedTask, { id: null, minutes: null })}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TASK_DRAG)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDropBefore(e);
      }}
    >
      {starred && <span className="dp-rank">{task.focusRank}</span>}
      <button
        className={`dp-check${done ? " is-checked" : ""}`}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={() => act(() => api.setDone(task.id, !done))}
      >
        {done && <Check size={12} strokeWidth={2.5} />}
      </button>

      {editing === "title" ? (
        <InlineEdit
          initial={task.title}
          className="dp-title-input"
          onSave={(title) => (setEditing(null), title.trim() && title !== task.title ? save({ title }) : undefined)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <span className="dp-title" onDoubleClick={() => setEditing("title")} title="Double-click to rename">
          {task.title}
        </span>
      )}

      {card && <ProjectChip card={card} />}

      {editing === "due" ? (
        <DueEdit
          due={task.dueDate}
          onSave={(due) => (setEditing(null), due !== task.dueDate ? act(() => api.setDue(task.id, due)) : undefined)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        task.dueDate && !done && <DueChip due={task.dueDate} onClick={() => setEditing("due")} />
      )}

      {block && (
        <span className="dp-chip dp-time" title="Scheduled">
          {clock(block.startMinute)}
        </span>
      )}

      {(tracked > 0 || running) && (
        <span className={`dp-chip dp-tracked${running ? " is-running" : ""}`} title="Time tracked">
          {duration(tracked)}
        </span>
      )}

      {editing === "estimate" ? (
        <InlineEdit
          initial={task.estimateMinutes ? duration(task.estimateMinutes) : ""}
          placeholder="45m"
          className="dp-estimate-input"
          onSave={(text) => {
            setEditing(null);
            const minutes = text.trim() ? parseDuration(text) : null;
            if (text.trim() && minutes === null) return;
            if (minutes !== task.estimateMinutes) void save({ estimateMinutes: minutes });
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button className={`dp-chip dp-estimate${task.estimateMinutes ? "" : " is-empty"}`} title="How long it'll take" onClick={() => setEditing("estimate")}>
          {task.estimateMinutes ? duration(task.estimateMinutes) : "+ time"}
        </button>
      )}

      {extra}

      {!done && task.day && (
        <button
          className={`icon-btn dp-timer${running ? " is-on" : ""}`}
          title={running ? "Pause the timer" : "Start a timer"}
          aria-label={running ? "Pause the timer" : "Start a timer"}
          onClick={() => act(() => (running ? api.stopTimer(task.id) : api.startTimer(task.id)))}
        >
          {running ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>
      )}

      {task.day && (
        <button
          className={`icon-btn dp-star${starred ? " is-on" : ""}`}
          aria-pressed={starred}
          disabled={!starred && focusFull}
          title={starred ? "Remove from top priorities" : focusFull ? `You already have ${MAX_FOCUS} top priorities` : "Make a top priority"}
          aria-label={starred ? "Remove from top priorities" : "Make a top priority"}
          onClick={() => act(() => api.setFocus(task.id, !starred))}
        >
          <Star size={14} strokeWidth={1.75} />
        </button>
      )}

      <Dropdown label="Task options" icon={<Ellipsis size={14} strokeWidth={1.75} />}>
        {(close) => (
          <>
            {!done && task.day && (
              <button className="menu-item" onClick={() => (close(), onFocus(task))}>
                Focus on this
              </button>
            )}
            <button className="menu-item" onClick={() => (close(), setEditing("title"))}>
              Rename
            </button>
            <button className="menu-item" onClick={() => (close(), setEditing("estimate"))}>
              Set time estimate
            </button>
            <button className="menu-item" onClick={() => (close(), setEditing("due"))}>
              {task.dueDate ? "Change deadline" : "Set deadline…"}
            </button>
            {task.dueDate && (
              <button className="menu-item" onClick={() => (close(), act(() => api.setDue(task.id, null)))}>
                Remove deadline
              </button>
            )}
            {task.day !== addDays(day, 1) && (
              <button className="menu-item" onClick={() => (close(), act(() => api.moveTask(task.id, addDays(day, 1))))}>
                Move to the next day
              </button>
            )}
            {task.day !== null && (
              <button className="menu-item" onClick={() => (close(), act(() => api.moveTask(task.id, null)))}>
                Move to the inbox
              </button>
            )}
            <div className="menu-sep" />
            <button className="menu-item is-danger" onClick={() => (close(), act(() => api.deleteTask(task.id)))}>
              <Trash2 size={13} strokeWidth={1.75} /> Delete
            </button>
          </>
        )}
      </Dropdown>
    </li>
  );
}

/** A text box that saves on Enter or when it loses focus, and cancels on Escape. */
export function InlineEdit({
  initial,
  placeholder,
  className,
  onSave,
  onCancel,
}: {
  initial: string;
  placeholder?: string;
  className?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [finished, setFinished] = useState(false);
  const finish = (save: boolean) => {
    if (finished) return;
    setFinished(true);
    if (save) onSave(text);
    else onCancel();
  };
  return (
    <input
      autoFocus
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.currentTarget.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") {
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
