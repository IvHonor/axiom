import type { DayPlan } from "./api";
import { clock, duration } from "./time";

/** Planned time against the working day, with room left for the unexpected,
 * and how long it's likely to really take at the user's usual pace. */
export function Capacity({ plan }: { plan: DayPlan }) {
  const planned = plannedMinutes(plan);
  const expected = expectedMinutes(plan, planned);
  const likely = expected ?? planned;
  const available = plan.settings.dayEndMinute - plan.settings.dayStartMinute;
  const comfortable = available * (1 - plan.settings.bufferPercent / 100);
  const state = capacityState(likely, available, comfortable);
  const unsized = plan.tasks.filter((t) => !t.doneAt && t.estimateMinutes === null && !plan.blocks.some((b) => b.taskId === t.id)).length;
  const note =
    state === "over"
      ? `Over by ${duration(likely - available)}${expected ? " at your usual pace" : ""}. Move something to another day.`
      : state === "tight"
        ? "Little room left for the unexpected."
        : `${duration(Math.max(0, Math.round(comfortable - likely)))} free, keeping ${plan.settings.bufferPercent}% spare.`;

  return (
    <div className={`dp-capacity is-${state}`} title={`Your day is ${clock(plan.settings.dayStartMinute)}–${clock(plan.settings.dayEndMinute)}.`}>
      <div className="dp-capacity-text">
        <span>
          <b>{duration(planned)}</b> planned of {duration(available)}
          {expected !== null && (
            <span className="dp-capacity-pace" title={paceText(plan.pace!)}>
              {" "}
              · likely {duration(expected)}
            </span>
          )}
        </span>
        <span className="dp-capacity-note">
          {note}
          {unsized > 0 && ` ${unsized} task${unsized === 1 ? "" : "s"} without a time.`}
        </span>
      </div>
      <div className="dp-capacity-bar" aria-hidden="true">
        {expected !== null && expected > planned && <em style={{ width: `${Math.min(expected / available, 1) * 100}%` }} />}
        <span style={{ width: `${Math.min(planned / available, 1) * 100}%` }} />
        <i style={{ left: `${100 - plan.settings.bufferPercent}%` }} />
      </div>
    </div>
  );
}

export function capacityState(minutes: number, available: number, comfortable: number) {
  return minutes > available ? "over" : minutes > comfortable ? "tight" : "ok";
}

/** "Tasks usually take 30% longer than estimated." */
export function paceText(pace: number): string {
  const percent = Math.round(Math.abs(pace - 1) * 100);
  return pace >= 1 ? `Your tasks usually take ${percent}% longer than estimated.` : `You usually finish tasks ${percent}% faster than estimated.`;
}

/** Mirrors `planned_minutes` in service.rs: task estimates (or their blocks),
 * other blocks, and busy calendar events within working hours. */
export function plannedMinutes(plan: DayPlan): number {
  const blocksOf = (id: string) => plan.blocks.filter((b) => b.taskId === id).reduce((n, b) => n + b.durationMinutes, 0);
  const forTasks = plan.tasks.reduce((n, t) => n + (t.estimateMinutes ?? blocksOf(t.id)), 0);
  const other = plan.blocks.filter((b) => !b.taskId).reduce((n, b) => n + b.durationMinutes, 0);
  const { dayStartMinute, dayEndMinute } = plan.settings;
  const meetings = plan.events
    .filter((e) => e.busy && !e.allDay)
    .reduce((n, e) => n + Math.max(0, Math.min(e.startMinute + e.durationMinutes, dayEndMinute) - Math.max(e.startMinute, dayStartMinute)), 0);
  return forTasks + other + meetings;
}

/** The plan at the user's usual pace: unfinished tasks' estimates scaled by
 * how long tasks really take. Null when the pace is unknown or close to 1. */
export function expectedMinutes(plan: DayPlan, planned: number): number | null {
  if (plan.pace === null || Math.abs(plan.pace - 1) < 0.1) return null;
  const estimated = plan.tasks.filter((t) => !t.doneAt).reduce((n, t) => n + (t.estimateMinutes ?? 0), 0);
  if (!estimated) return null;
  return Math.max(0, Math.round(planned + estimated * (plan.pace - 1)));
}
