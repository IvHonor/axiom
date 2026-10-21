import type { CSSProperties } from "react";
import { usePersistentState } from "../../shell/usePersistentState";
import type { Board, TaskCard } from "./api";
import { colorOf, todayISO } from "./palette";

type Zoom = "days" | "weeks";
const DAY_WIDTH: Record<Zoom, number> = { days: 34, weeks: 14 };

/** Days since the epoch for a "YYYY-MM-DD" date, in UTC so DST never shifts it. */
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const dateOf = (day: number) => new Date(day * 86_400_000);

interface TimelineViewProps {
  board: Board;
  tasks: TaskCard[];
  onOpenTask: (id: string) => void;
}

/** Tasks laid out by start and due date, like GitHub Projects' roadmap. */
export function TimelineView({ board, tasks, onOpenTask }: TimelineViewProps) {
  const [zoom, setZoom] = usePersistentState<Zoom>("axiom.board.zoom", (saved) => (saved === "weeks" ? "weeks" : "days"));
  const today = dayNumber(todayISO());
  const columnName = new Map(board.columns.map((c) => [c.id, c.name]));

  const scheduled = tasks
    .filter((t) => t.startDate || t.dueDate)
    .map((t) => {
      const start = dayNumber((t.startDate ?? t.dueDate)!);
      const end = dayNumber((t.dueDate ?? t.startDate)!);
      return { task: t, start, end, milestone: !t.startDate };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const unscheduled = tasks.length - scheduled.length;

  // Show from a few days before the earliest date to two weeks after the latest, always including today.
  const first = Math.min(today, ...scheduled.map((s) => s.start)) - 3;
  const last = Math.max(today + 14, ...scheduled.map((s) => s.end + 7));
  const days = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const width = DAY_WIDTH[zoom];
  const x = (day: number) => (day - first) * width;

  return (
    <div className="pb-timeline-wrap">
      <div className="pb-table-tools">
        <div className="pb-segmented" role="tablist" aria-label="Timeline scale">
          {(["days", "weeks"] as Zoom[]).map((z) => (
            <button key={z} role="tab" aria-selected={zoom === z} className={zoom === z ? "is-active" : undefined} onClick={() => setZoom(z)}>
              {z === "days" ? "Days" : "Weeks"}
            </button>
          ))}
        </div>
        <span className="dim">
          {unscheduled > 0
            ? `${unscheduled} task${unscheduled === 1 ? " has" : "s have"} no dates. Give them a start or due date to place them here.`
            : `${scheduled.length} scheduled`}
        </span>
      </div>

      {scheduled.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">Nothing scheduled</div>
          <p className="empty-text">Set a start or due date on a card and it appears on the timeline.</p>
        </div>
      ) : (
        <div className="pb-timeline" style={{ "--day": `${width}px`, "--track": `${days.length * width}px` } as CSSProperties}>
          <div className="pb-tl-head">
            <div className="pb-tl-name pb-tl-corner">Task</div>
            <div className="pb-tl-track">
              {days.map((day) => {
                const date = dateOf(day);
                const weekday = date.getUTCDay();
                const monthStart = date.getUTCDate() === 1 || day === first;
                const showDay = zoom === "days" || weekday === 1;
                return (
                  <div key={day} className={`pb-tl-day${weekday === 0 || weekday === 6 ? " is-weekend" : ""}${day === today ? " is-today" : ""}`}>
                    {monthStart && (
                      <span className="pb-tl-month">{date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}</span>
                    )}
                    {showDay && <span className="pb-tl-num">{date.getUTCDate()}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {scheduled.map(({ task, start, end, milestone }) => {
            const done = task.completedAt !== null;
            const overdue = !done && task.dueDate !== null && dayNumber(task.dueDate) < today;
            const label = board.labels.find((l) => task.labelIds.includes(l.id));
            const style = {
              left: x(start),
              width: milestone ? undefined : (end - start + 1) * width,
              "--bar": label ? colorOf(label.color) : "var(--accent)",
            } as CSSProperties;
            return (
              <div key={task.id} className="pb-tl-row">
                <button className={`pb-tl-name${done ? " is-done" : ""}`} onClick={() => onOpenTask(task.id)} title={task.title}>
                  <span>{task.title}</span>
                  <span className="ext-meta">{columnName.get(task.columnId)}</span>
                </button>
                <div className="pb-tl-track">
                  <button
                    className={`${milestone ? "pb-tl-milestone" : "pb-tl-bar"}${done ? " is-done" : ""}${overdue ? " is-overdue" : ""}`}
                    style={style}
                    onClick={() => onOpenTask(task.id)}
                    title={`${task.title}\n${task.startDate ?? "—"} → ${task.dueDate ?? "—"}`}
                    aria-label={`${task.title}, ${task.startDate ?? ""} to ${task.dueDate ?? ""}`}
                  >
                    {!milestone && <span>{task.title}</span>}
                  </button>
                </div>
              </div>
            );
          })}
          <div className="pb-tl-today" style={{ left: `calc(var(--name-width) + ${x(today) + width / 2}px)` }} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
