import { Flag } from "lucide-react";
import type { Day } from "./api";
import { addDays, today as todayNow } from "./time";

export type DueState = "overdue" | "near" | "soon" | "later";

/** How pressing a deadline is: past, today or tomorrow, this week, or later. */
export function dueState(due: Day, today: Day = todayNow()): DueState {
  if (due < today) return "overdue";
  if (due <= addDays(today, 1)) return "near";
  if (due <= addDays(today, 6)) return "soon";
  return "later";
}

/** "Due today", "Due tomorrow", "Due Fri", "Due 3 Nov", "Overdue · Mon 20 Oct". */
export function dueText(due: Day, today: Day = todayNow()): string {
  const date = new Date(`${due}T12:00`);
  if (due === today) return "Due today";
  if (due === addDays(today, 1)) return "Due tomorrow";
  if (due < today) return `Overdue · ${date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
  if (due <= addDays(today, 6)) return `Due ${date.toLocaleDateString("en-GB", { weekday: "short" })}`;
  return `Due ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: due.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" })}`;
}

/** A task's deadline, coloured by how close it is (and said in words, not colour alone). */
export function DueChip({ due, onClick }: { due: Day; onClick?: () => void }) {
  const state = dueState(due);
  const text = dueText(due);
  const content = (
    <>
      <Flag size={11} strokeWidth={2} /> {text}
    </>
  );
  return onClick ? (
    <button className={`dp-due is-${state}`} title={`${text}. Click to change.`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={`dp-due is-${state}`} title={text}>
      {content}
    </span>
  );
}

/** Picks a deadline: a date field that saves as soon as a date is chosen. */
export function DueEdit({ due, onSave, onCancel }: { due: Day | null; onSave: (due: Day | null) => void; onCancel: () => void }) {
  return (
    <span className="dp-due-edit">
      <input
        type="date"
        autoFocus
        defaultValue={due ?? ""}
        aria-label="Deadline"
        onChange={(e) => e.currentTarget.value && onSave(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onBlur={onCancel}
      />
      {due && (
        <button className="btn btn-sm btn-ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => onSave(null)}>
          Remove
        </button>
      )}
    </span>
  );
}
