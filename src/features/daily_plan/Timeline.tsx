import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import { Check } from "lucide-react";
import { api, cardFromDrag, type Block, type Day, type DayPlan, type PlanTask } from "./api";
import { BLOCK_COLORS, colorOf } from "./palette";
import { draggedTask, TASK_DRAG } from "./TaskPanel";
import { clock, duration, nowMinute, parseClock, parseDuration } from "./time";

/** Pixels per hour. */
const HOUR = 56;
const PX = HOUR / 60;
/** Everything snaps to quarter hours. */
const SNAP = 15;
const DAY = 24 * 60;
const NEW_BLOCK = 30;

const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const floorSnap = (m: number) => Math.floor(m / SNAP) * SNAP;
const clampStart = (start: number, length: number) => Math.max(0, Math.min(DAY - length, start));

type Act = (change: () => Promise<unknown>) => Promise<void>;

type Drag =
  | { kind: "create"; anchor: number; current: number; moved: boolean }
  | { kind: "move"; id: string; grab: number; start: number; length: number; moved: boolean }
  | { kind: "resize"; id: string; start: number; length: number };

/** The block being edited; `id` is null for a new one. */
interface Editing {
  id: string | null;
  start: number;
  length: number;
}

interface TimelineProps {
  plan: DayPlan;
  today: Day;
  act: Act;
}

/** The day as a timeline of blocks you drag to create, move and resize. */
export function Timeline({ plan, today, act }: TimelineProps) {
  const grid = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [ghost, setGhost] = useState<{ start: number; length: number } | null>(null);
  const [now, setNow] = useState(nowMinute);
  const isToday = plan.day === today;
  const { dayStartMinute, dayEndMinute } = plan.settings;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMinute()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Open on the part of the day that matters: now, or the start of the working day.
  useLayoutEffect(() => {
    const focus = isToday ? nowMinute() - 90 : dayStartMinute - 30;
    scroller.current?.scrollTo({ top: Math.max(0, focus * PX) });
    setEditing(null);
    // Only when the day changes, not on every reload.
  }, [plan.day]);

  const minuteAt = (clientY: number) => {
    const rect = grid.current!.getBoundingClientRect();
    return Math.max(0, Math.min(DAY, (clientY - rect.top) / PX));
  };

  const taskOf = (block: Block): PlanTask | undefined => plan.tasks.find((t) => t.id === block.taskId);
  const titleOf = (block: Block) => taskOf(block)?.title ?? block.title;

  // ---- Pointer: create, move, resize ----

  const onGridDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== grid.current) return;
    if (editing) return setEditing(null);
    const start = floorSnap(minuteAt(e.clientY));
    grid.current!.setPointerCapture(e.pointerId);
    setDrag({ kind: "create", anchor: start, current: start + SNAP, moved: false });
  };

  const onBlockDown = (e: PointerEvent, block: Block, resize: boolean) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setEditing(null);
    grid.current!.setPointerCapture(e.pointerId);
    setDrag(
      resize
        ? { kind: "resize", id: block.id, start: block.startMinute, length: block.durationMinutes }
        : {
            kind: "move",
            id: block.id,
            grab: minuteAt(e.clientY) - block.startMinute,
            start: block.startMinute,
            length: block.durationMinutes,
            moved: false,
          },
    );
  };

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const m = minuteAt(e.clientY);
    if (drag.kind === "create") {
      const current = snap(m);
      if (current !== drag.current) setDrag({ ...drag, current, moved: true });
    } else if (drag.kind === "move") {
      const start = clampStart(snap(m - drag.grab), drag.length);
      if (start !== drag.start) setDrag({ ...drag, start, moved: true });
    } else {
      const length = Math.max(SNAP, Math.min(DAY - drag.start, snap(m) - drag.start));
      if (length !== drag.length) setDrag({ ...drag, length });
    }
  };

  const onUp = () => {
    if (!drag) return;
    setDrag(null);
    if (drag.kind === "create") {
      const [a, b] = drag.moved ? [Math.min(drag.anchor, drag.current), Math.max(drag.anchor, drag.current)] : [drag.anchor, drag.anchor + NEW_BLOCK];
      const length = Math.max(SNAP, Math.min(DAY, b) - a);
      setEditing({ id: null, start: clampStart(a, length), length });
      return;
    }
    const block = plan.blocks.find((b) => b.id === drag.id);
    if (!block) return;
    if (drag.kind === "move" && !drag.moved) {
      setEditing({ id: block.id, start: block.startMinute, length: block.durationMinutes });
      return;
    }
    const start = drag.start;
    const length = drag.length;
    if (start === block.startMinute && length === block.durationMinutes) return;
    void act(() => api.updateBlock(block.id, { startMinute: start, durationMinutes: length, title: block.title, color: block.color }));
  };

  // ---- Dropping a task (or a board card) from the list ----

  const dropLength = () => draggedTask.minutes ?? NEW_BLOCK;

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(TASK_DRAG)) return;
    e.preventDefault();
    const length = Math.min(dropLength(), DAY);
    const start = clampStart(floorSnap(minuteAt(e.clientY)), length);
    if (ghost?.start !== start || ghost.length !== length) setGhost({ start, length });
  };

  const onDrop = (e: DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DRAG);
    setGhost(null);
    if (!id) return;
    e.preventDefault();
    const length = Math.min(dropLength(), DAY);
    const start = clampStart(floorSnap(minuteAt(e.clientY)), length);
    const card = cardFromDrag(id);
    // A board card becomes a planner task first, then gets its block.
    void act(async () => {
      const taskId = card ? (await api.planCard(card, plan.day)).id : id;
      await api.createBlock(plan.day, start, length, "", taskId);
    });
  };

  // ---- Layout ----

  const shown = plan.blocks.map((b) => {
    const live = drag && drag.kind !== "create" && drag.id === b.id ? drag : null;
    return { block: b, start: live ? live.start : b.startMinute, length: live ? live.length : b.durationMinutes };
  });
  const lanes = laneLayout(shown.map((s) => ({ id: s.block.id, start: s.start, end: s.start + s.length })));
  const creating =
    drag?.kind === "create"
      ? { start: Math.min(drag.anchor, drag.current), length: Math.max(SNAP, Math.abs(drag.current - drag.anchor)) }
      : null;

  return (
    <div className="dp-timeline" ref={scroller}>
      <div
        className="dp-grid"
        ref={grid}
        style={{ height: DAY * PX }}
        onPointerDown={onGridDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
        onDragOver={onDragOver}
        onDragLeave={(e) => !grid.current?.contains(e.relatedTarget as Node) && setGhost(null)}
        onDrop={onDrop}
      >
        <div className="dp-offhours" style={{ top: 0, height: dayStartMinute * PX }} />
        <div className="dp-offhours" style={{ top: dayEndMinute * PX, height: (DAY - dayEndMinute) * PX }} />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="dp-hour" style={{ top: h * HOUR }}>
            <span className="dp-hour-label">{clock(h * 60)}</span>
          </div>
        ))}

        {shown.map(({ block, start, length }) => {
          const task = taskOf(block);
          const done = !!task?.doneAt;
          const lane = lanes.get(block.id) ?? { lane: 0, lanes: 1 };
          const short = length < 40;
          return (
            <div
              key={block.id}
              className={`dp-block${done ? " is-done" : ""}${task?.timerStartedAt ? " is-running" : ""}${short ? " is-short" : ""}${drag && "id" in drag && drag.id === block.id ? " is-dragging" : ""}`}
              style={
                {
                  top: start * PX,
                  height: Math.max(length * PX - 2, 12),
                  left: `calc(var(--dp-gutter) + (100% - var(--dp-gutter) - 8px) * ${lane.lane / lane.lanes})`,
                  width: `calc((100% - var(--dp-gutter) - 8px) / ${lane.lanes} - 4px)`,
                  "--block": colorOf(block.color),
                } as CSSProperties
              }
              onPointerDown={(e) => onBlockDown(e, block, false)}
              title={`${titleOf(block)} · ${clock(start)}–${clock(start + length)}`}
            >
              {task && (
                <button
                  className={`dp-check dp-block-check${done ? " is-checked" : ""}`}
                  role="checkbox"
                  aria-checked={done}
                  aria-label={done ? "Mark as not done" : "Mark as done"}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => act(() => api.setDone(task.id, !done))}
                >
                  {done && <Check size={11} strokeWidth={2.5} />}
                </button>
              )}
              <span className="dp-block-text">
                <span className="dp-block-title">{titleOf(block)}</span>
                <span className="dp-block-time">
                  {clock(start)}–{clock(start + length)}
                  {!short && ` · ${duration(length)}`}
                </span>
              </span>
              <span className="dp-resize" onPointerDown={(e) => onBlockDown(e, block, true)} aria-hidden="true" />
            </div>
          );
        })}

        {creating && <div className="dp-block dp-pending" style={{ top: creating.start * PX, height: creating.length * PX - 2 }} />}
        {ghost && (
          <div className="dp-block dp-pending" style={{ top: ghost.start * PX, height: ghost.length * PX - 2 }}>
            <span className="dp-block-time">
              {clock(ghost.start)}–{clock(ghost.start + ghost.length)}
            </span>
          </div>
        )}
        {editing?.id === null && <div className="dp-block dp-pending" style={{ top: editing.start * PX, height: editing.length * PX - 2 }} />}

        {isToday && (
          <div className="dp-now" style={{ top: now * PX }} aria-label={`Now, ${clock(now)}`}>
            <span className="dp-now-dot" />
          </div>
        )}

        {editing && (
          <BlockEditor
            key={editing.id ?? "new"}
            editing={editing}
            block={plan.blocks.find((b) => b.id === editing.id)}
            taskTitle={(() => {
              const b = plan.blocks.find((x) => x.id === editing.id);
              return b ? taskOf(b)?.title : undefined;
            })()}
            onClose={() => setEditing(null)}
            onSave={(fields) => {
              setEditing(null);
              void act(() =>
                editing.id
                  ? api.updateBlock(editing.id, fields)
                  : api.createBlock(plan.day, fields.startMinute, fields.durationMinutes, fields.title, null).then((b) =>
                      fields.color !== b.color ? api.updateBlock(b.id, { ...fields }) : b,
                    ),
              );
            }}
            onDelete={() => {
              const id = editing.id!;
              setEditing(null);
              void act(() => api.deleteBlock(id));
            }}
          />
        )}
      </div>
    </div>
  );
}

interface BlockEditorProps {
  editing: Editing;
  block: Block | undefined;
  /** Set when the block is for a task, whose title it shows. */
  taskTitle: string | undefined;
  onClose: () => void;
  onSave: (fields: { startMinute: number; durationMinutes: number; title: string; color: string }) => void;
  onDelete: () => void;
}

/** A small card next to a block for its name, time, length and colour. */
function BlockEditor({ editing, block, taskTitle, onClose, onSave, onDelete }: BlockEditorProps) {
  const [title, setTitle] = useState(block?.title ?? "");
  const [start, setStart] = useState(clock(editing.start));
  const [length, setLength] = useState(duration(editing.length));
  const [color, setColor] = useState(block?.color ?? "blue");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const startMinute = parseClock(start);
    const durationMinutes = parseDuration(length);
    if (startMinute === null) return setProblem("Enter a start time like 14:30.");
    if (durationMinutes === null || durationMinutes < 5) return setProblem("Enter a length like 45m or 1h 30m.");
    if (startMinute + durationMinutes > DAY) return setProblem("A block has to end by midnight.");
    if (!taskTitle && !title.trim()) return setProblem("Give the block a name.");
    onSave({ startMinute, durationMinutes, title: title.trim(), color });
  };

  return (
    <form
      className="dp-editor"
      style={{ top: Math.max(0, editing.start * PX - 6) }}
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {taskTitle ? (
        <p className="dp-editor-task">{taskTitle}</p>
      ) : (
        <input
          autoFocus
          className="dp-editor-title"
          value={title}
          placeholder="What's this time for?"
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
      )}
      <div className="dp-editor-row">
        <label>
          Start
          <input value={start} onChange={(e) => setStart(e.currentTarget.value)} autoFocus={!!taskTitle} />
        </label>
        <label>
          Length
          <input value={length} onChange={(e) => setLength(e.currentTarget.value)} />
        </label>
      </div>
      <div className="dp-swatches" role="radiogroup" aria-label="Colour">
        {BLOCK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-label={c}
            className={c === color ? "dp-swatch is-on" : "dp-swatch"}
            style={{ "--block": colorOf(c) } as CSSProperties}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      {problem && <p className="dp-editor-problem">{problem}</p>}
      <div className="row">
        <button className="btn btn-sm" type="submit">
          {editing.id ? "Save" : "Add block"}
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={onClose}>
          Cancel
        </button>
        {editing.id && (
          <button className="btn btn-sm btn-ghost is-danger dp-editor-delete" type="button" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

/** Side-by-side lanes for overlapping blocks: each cluster of overlaps is
 * split into as many equal columns as it needs at its busiest. */
function laneLayout(items: { id: string; start: number; end: number }[]) {
  const out = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    cluster.push({ id: item.id, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return out;
}
