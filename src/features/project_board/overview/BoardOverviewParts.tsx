import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { Board, Column, Project } from "../api";
import { colorOf, PRIORITIES, shortDate } from "../palette";
import { hoursLabel, isDone, stats, type BoardTilePreferences, type OverviewCard } from "./model";

export interface CardActions {
  open: (projectId: string, taskId?: string) => void;
  complete: (card: OverviewCard) => void;
  pending: Set<string>;
  boards: Board[];
}
export function CardRow({ card, today, prefs, row, actions }: { card: OverviewCard; today: string; prefs: BoardTilePreferences; row: number; actions: CardActions }) {
  const done = isDone(card);
  const destination = actions.boards.find((board) => board.project.id === card.projectId)?.columns.find((column) => column.isDone);
  const due = card.dueDate ? card.dueDate < today && !done ? "Overdue" : card.dueDate === today ? "Today" : shortDate(card.dueDate) : "No date";
  const details = [card.project.name, card.column?.name, card.parentTitle ? `Subtask of ${card.parentTitle}` : "", card.estimate !== null ? hoursLabel(card.estimate) : "", card.checklistTotal ? `${card.checklistDone}/${card.checklistTotal} checklist` : "", card.subtaskTotal ? `${card.subtaskDone}/${card.subtaskTotal} subtasks` : "", ...card.labels.map((label) => label.name), card.recurrence ? `Repeats ${card.recurrence}` : ""].filter(Boolean).join(" · ");
  return <div className={`pb-ov-task ${done ? "is-done" : ""}`}>
    <button className="pb-ov-check" role="checkbox" aria-checked={done}
      aria-label={done ? `${card.title} completed` : `Complete ${card.title}`}
      title={done ? "Completed · open the card to move it" : destination ? `Move to ${destination.name}` : "This project needs a column marked Done"}
      disabled={done || !destination || actions.pending.has(card.id)} onClick={() => actions.complete(card)}>{done && <Check size={11} />}</button>
    <button className="pb-ov-task-main" onClick={() => actions.open(card.projectId, card.id)} title={`${card.title}\n${details}\n${card.dueDate ? `Due ${card.dueDate}` : "No due date"}`}>
      <span className="pb-ov-task-line"><span className="pb-ov-ellipsis">{card.parentTaskId && "↳ "}{card.title}</span><small className={`pb-ov-due ${card.dueDate && card.dueDate < today && !done ? "is-overdue" : ""}`}>{due}</small></span>
      {prefs.details && row >= 44 && <small className="pb-ov-task-detail"><span className="pb-ov-priority" data-priority={card.priority}>{PRIORITIES[card.priority] ?? "None"}</span> · {details}</small>}
    </button>
  </div>;
}

export function Pager({ page, pages, start, end, total, label, onPage }: { page: number; pages: number; start: number; end: number; total: number; label: string; onPage: (page: number) => void }) {
  return <div className="pb-ov-pager"><span aria-live="polite">{start}–{end} of {total}</span><button className="icon-btn" aria-label={`Previous ${label} page`} disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={13} /></button><button className="icon-btn" aria-label={`Next ${label} page`} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><ChevronRight size={13} /></button></div>;
}

export function PagedRows({ rows, height, row, empty, label, columns = 1 }: { rows: { id: string; node: ReactNode }[]; height: number; row: number; empty: string; label: string; columns?: number }) {
  const [requested, setPage] = useState(0);
  const needsPages = rows.length > Math.max(1, Math.floor(height / row)) * columns;
  const pageSize = Math.max(1, Math.floor((height - (needsPages ? 25 : 0)) / row)) * columns;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requested, pages - 1);
  return <div className="pb-ov-list" aria-label={label}>
    {rows.length ? <div className="pb-ov-rows" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: row }}>
      {rows.slice(page * pageSize, (page + 1) * pageSize).map((entry) => <div key={entry.id}>{entry.node}</div>)}
    </div> : <p className="pb-ov-empty">{empty}</p>}
    {pages > 1 && <Pager page={page} pages={pages} start={page * pageSize + 1} end={Math.min(rows.length, (page + 1) * pageSize)} total={rows.length} label={label} onPage={setPage} />}
  </div>;
}

export function ProjectRow({ project, cards, today, open, expanded = false }: { project: Project; cards: OverviewCard[]; today: string; open: () => void; expanded?: boolean }) {
  const numbers = stats(cards, today);
  return <button className={`pb-ov-project ${expanded ? "is-card" : ""}`} onClick={open} style={{ "--project": colorOf(project.color) } as CSSProperties}
    title={`${project.name}: ${numbers.done}/${numbers.total} complete, ${numbers.overdue} overdue, ${hoursLabel(numbers.hours)} estimated open work`}>
    <div className="pb-ov-project-title"><strong className="pb-ov-ellipsis">{project.name}</strong><span>{numbers.total ? `${numbers.percent}%` : "Empty"}</span></div>
    <div className="pb-ov-bar" role="progressbar" aria-label={`${project.name} completion`} aria-valuenow={numbers.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${numbers.percent}%` }} /></div>
    <div className="pb-ov-project-meta"><span>{numbers.done}/{numbers.total} done</span><span className={numbers.overdue ? "is-overdue" : ""}>{numbers.overdue ? `${numbers.overdue} overdue` : `${numbers.open} open`}</span></div>
    {expanded && <div className="pb-ov-project-meta"><span>{hoursLabel(numbers.hours)} estimated</span><span>{numbers.undated} undated</span></div>}
  </button>;
}

export interface WorkflowColumn { board: Board; column: Column; cards: OverviewCard[]; actual: number }
export function workflowColumns(boards: Board[], cards: OverviewCard[]): WorkflowColumn[] {
  return boards.flatMap((board) => [...board.columns].sort((a, b) => a.position - b.position).map((column) => ({ board, column,
    cards: cards.filter((card) => card.columnId === column.id), actual: board.tasks.filter((task) => !task.archived && task.columnId === column.id).length,
  })));
}
export function WorkflowRow({ entry, open, maximum }: { entry: WorkflowColumn; open: () => void; maximum: number }) {
  const { column, board, actual } = entry;
  const over = column.wipLimit !== null && actual > column.wipLimit;
  return <button className={`pb-ov-workflow-row ${over ? "is-overdue" : ""}`} onClick={open} title={`${board.project.name} · ${column.name}: ${actual} active cards in full column${column.wipLimit !== null ? `, limit ${column.wipLimit}` : ", no limit"}. ${entry.cards.length} match tile filters.`}>
    <div><span className="pb-ov-ellipsis">{column.name}</span><strong>{actual}{column.wipLimit !== null && `/${column.wipLimit}`}{over && " !"}</strong></div>
    <div className="pb-ov-bar" style={{ "--project": over ? "var(--danger)" : colorOf(board.project.color) } as CSSProperties}><span style={{ width: `${Math.min(100, actual / Math.max(1, column.wipLimit ?? maximum) * 100)}%` }} /></div>
    <small className="pb-ov-ellipsis">{board.project.name}{actual !== entry.cards.length ? ` · ${entry.cards.length} shown` : ""}{column.isDone ? " · Done" : ""}</small>
  </button>;
}

export function Progress({ cards, today }: { cards: OverviewCard[]; today: string }) {
  const numbers = stats(cards, today);
  return <div className="pb-ov-progress">
    <div className="pb-ov-progress-main"><strong>{numbers.percent}<small>%</small></strong><span>{numbers.done}/{numbers.total} complete<small>{numbers.open} open · {numbers.overdue} overdue</small></span></div>
    <div className="pb-ov-bar" role="progressbar" aria-label="Card completion" aria-valuenow={numbers.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${numbers.percent}%` }} /></div>
    <small className="pb-ov-estimates" title="Sum of included open-card estimates. Parent and subtask estimates may overlap when subtasks are included.">{hoursLabel(numbers.hours)} estimated · {numbers.unestimated} without estimates</small>
  </div>;
}
