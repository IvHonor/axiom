import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { PlanTask } from "../api";
import { colorOf } from "../palette";
import { clock, duration } from "../time";
import { itemTime, type Item } from "./model";

export interface TaskActions {
  toggle: (task: PlanTask) => void;
  pending: Set<string>;
}
export function TaskRow({ task, toggle, pending }: { task: PlanTask } & TaskActions) {
  return <div className={`dp-ov-row ${task.doneAt ? "is-done" : ""}`}>
    <button className={`dp-check${task.doneAt ? " is-checked" : ""}`} role="checkbox" aria-checked={!!task.doneAt}
      aria-label={`${task.doneAt ? "Reopen" : "Complete"} ${task.title}`} disabled={pending.has(task.id)} onClick={() => toggle(task)}>
      {task.doneAt && <Check size={11} />}
    </button>
    <span className="dp-ov-row-text" title={task.title}>{task.focusRank && <b className="dp-ov-rank">{task.focusRank}</b>}{task.title}</span>
    {task.estimateMinutes != null && <small>{duration(task.estimateMinutes)}</small>}
  </div>;
}

export function EventRow({ item, minute, open }: { item: Item; minute: number; open: (item?: Item) => void }) {
  const current = !item.allDay && item.start <= minute && item.end > minute;
  return <button className={`dp-ov-row dp-ov-event-row ${current ? "is-current" : ""} ${item.task?.doneAt ? "is-done" : ""}`} title={`${item.title} · ${itemTime(item)}`} onClick={() => open(item)}>
    <span className="dp-ov-dot" style={{ "--block": colorOf(item.color) } as CSSProperties} />
    <time>{item.allDay ? "All day" : current ? "Now" : clock(item.start)}</time>
    <span className="dp-ov-row-text">{item.title}</span>
  </button>;
}

/** Pages are sized from the available height; the tile never gains its own scrollbar. */
export function PagedList({ rows, height, row, empty, label }: { rows: { id: string; node: ReactNode }[]; height: number; row: number; empty: string; label: string }) {
  const [requestedPage, setPage] = useState(0);
  const needsPages = rows.length > Math.max(1, Math.floor(height / row));
  const pageSize = Math.max(1, Math.floor((height - (needsPages ? 25 : 0)) / row));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requestedPage, pages - 1);
  return <div className="dp-ov-list" aria-label={label} style={{ "--ov-row": `${row}px` } as CSSProperties}>
    {rows.length ? <div className="dp-ov-list-rows">{rows.slice(page * pageSize, (page + 1) * pageSize).map((entry) => <div key={entry.id}>{entry.node}</div>)}</div> : <p className="dp-ov-empty">{empty}</p>}
    {pages > 1 && <div className="dp-ov-pager">
      <span aria-live="polite">{page * pageSize + 1}–{Math.min(rows.length, (page + 1) * pageSize)} of {rows.length}</span>
      <button className="icon-btn" aria-label={`Previous ${label} page`} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={13} /></button>
      <button className="icon-btn" aria-label={`Next ${label} page`} disabled={page === pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={13} /></button>
    </div>}
  </div>;
}
