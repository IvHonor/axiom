import { useEffect, useState } from "react";
import { Check, Maximize2, Pause, Play, X } from "lucide-react";
import { api, trackedMinutes, type Card, type DayPlan, type PlanTask } from "./api";
import { ProjectChip } from "./TaskPanel";
import { clock, duration, nowMinute } from "./time";

type Act = (change: () => Promise<unknown>) => Promise<void>;

/** 75.5 minutes -> "1:15:30", 12.25 -> "12:15". */
export function stopwatch(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Shown across the planner while a timer runs, on any day. */
export function FocusBar({ task, now, act, onOpen }: { task: PlanTask; now: number; act: Act; onOpen: () => void }) {
  const tracked = trackedMinutes(task, now);
  return (
    <div className="dp-focusbar" role="status">
      <span className="dp-pulse" aria-hidden="true" />
      <span className="dp-focusbar-label">Working on</span>
      <span className="dp-focusbar-title">{task.title}</span>
      <span className="dp-focusbar-clock">
        {stopwatch(tracked)}
        {task.estimateMinutes && <span className="dim"> of {duration(task.estimateMinutes)}</span>}
      </span>
      <button className="btn btn-sm btn-ghost" onClick={() => act(() => api.stopTimer(task.id))}>
        <Pause size={13} strokeWidth={2} /> Pause
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => act(() => api.setDone(task.id, true))}>
        <Check size={13} strokeWidth={2} /> Done
      </button>
      <button className="btn btn-sm" onClick={onOpen} title="Focus mode">
        <Maximize2 size={13} strokeWidth={2} /> Focus
      </button>
    </div>
  );
}

interface FocusModeProps {
  task: PlanTask;
  card: Card | undefined;
  plan: DayPlan;
  now: number;
  act: Act;
  onClose: () => void;
}

/** One task, its timer and its notes, and nothing else. */
export function FocusMode({ task, card, plan, now, act, onClose }: FocusModeProps) {
  const [notes, setNotes] = useState(task.notes);
  const running = task.timerStartedAt !== null;
  const done = task.doneAt !== null;
  const tracked = trackedMinutes(task, now);
  const estimate = task.estimateMinutes;
  const progress = estimate ? tracked / estimate : null;
  const minute = nowMinute();
  const next = plan.blocks.find((b) => b.startMinute >= minute && b.taskId !== task.id);
  const nextTitle = next ? (plan.tasks.find((t) => t.id === next.taskId)?.title ?? next.title) : null;

  // Reset the notes only when switching tasks, not while typing.
  useEffect(() => setNotes(task.notes), [task.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest("textarea") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveNotes = () => {
    if (notes !== task.notes) void act(() => api.updateTask(task.id, { title: task.title, notes, estimateMinutes: task.estimateMinutes }));
  };

  return (
    <div className="dp-focus-mode" role="dialog" aria-label={`Focus: ${task.title}`}>
      <button className="icon-btn dp-focus-close" aria-label="Leave focus mode (Esc)" title="Leave focus mode (Esc)" onClick={onClose}>
        <X size={18} strokeWidth={1.75} />
      </button>
      <div className="dp-focus-card">
        <p className="dp-focus-kicker">{done ? "Done" : running ? "Focusing on" : "Paused"}</p>
        <h2 className="dp-focus-title">{task.title}</h2>
        {card && <ProjectChip card={card} />}

        <p className={`dp-focus-clock${running ? " is-running" : ""}`} aria-live="off">
          {stopwatch(tracked)}
        </p>
        {estimate && (
          <div className="dp-focus-progress">
            <div className={`dp-focus-bar${progress! > 1 ? " is-over" : ""}`}>
              <span style={{ width: `${Math.min(progress!, 1) * 100}%` }} />
            </div>
            <span className="field-hint">
              {progress! > 1 ? `${duration(Math.round(tracked - estimate))} over your ${duration(estimate)} estimate` : `of ${duration(estimate)} estimated`}
            </span>
          </div>
        )}

        <div className="row dp-focus-actions">
          {!done &&
            (running ? (
              <button className="btn" onClick={() => act(() => api.stopTimer(task.id))}>
                <Pause size={15} strokeWidth={2} /> Pause
              </button>
            ) : (
              <button className="btn" onClick={() => act(() => api.startTimer(task.id))}>
                <Play size={15} strokeWidth={2} /> Resume
              </button>
            ))}
          {!done && (
            <button className="btn btn-ghost" onClick={() => act(() => api.setDone(task.id, true)).then(onClose)}>
              <Check size={15} strokeWidth={2} /> Mark done
            </button>
          )}
        </div>

        <label className="dp-focus-notes">
          <span className="field-label">Notes</span>
          <textarea value={notes} rows={5} placeholder="Jot down anything you need for this task." onChange={(e) => setNotes(e.currentTarget.value)} onBlur={saveNotes} />
        </label>

        {next && nextTitle && (
          <p className="field-hint">
            Up next: {clock(next.startMinute)} {nextTitle}
          </p>
        )}
      </div>
    </div>
  );
}
