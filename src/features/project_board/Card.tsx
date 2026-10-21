import type { CSSProperties, KeyboardEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignLeft,
  CalendarDays,
  CircleCheck,
  Clock,
  CornerDownRight,
  ListTree,
  Repeat,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SquareCheck,
} from "lucide-react";
import type { Label, TaskCard } from "./api";
import { colorOf, dueState, PRIORITIES, shortDate } from "./palette";

const PRIORITY_ICONS = [null, SignalLow, SignalMedium, SignalHigh];

export const taskKey = (id: string) => `task-${id}`;

interface CardProps {
  task: TaskCard;
  labels: Label[];
  /** Rendered in the drag overlay rather than the column. */
  overlay?: boolean;
}

/** The front of a task card: labels, title, and a row of badges. */
export function Card({ task, labels, overlay }: CardProps) {
  const done = task.completedAt !== null;
  const cardLabels = labels.filter((l) => task.labelIds.includes(l.id));
  const Priority = PRIORITY_ICONS[task.priority];
  const due = task.dueDate ? dueState(task.dueDate, done) : null;
  const checklistDone = task.checklistTotal > 0 && task.checklistDone === task.checklistTotal;

  return (
    <div className={`pb-card${done ? " is-done" : ""}${overlay ? " is-overlay" : ""}`}>
      {cardLabels.length > 0 && (
        <div className="pb-card-labels">
          {cardLabels.map((l) => (
            <span key={l.id} className="pb-label" style={{ "--label": colorOf(l.color) } as CSSProperties}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      {task.parentTitle && (
        <div className="pb-card-parent" title={`Sub-task of ${task.parentTitle}`}>
          <CornerDownRight size={11} strokeWidth={1.75} />
          {task.parentTitle}
        </div>
      )}
      <div className="pb-card-title">
        {done && <CircleCheck size={14} strokeWidth={1.75} className="pb-done-icon" />}
        {task.title}
      </div>
      {(Priority || task.dueDate || task.recurrence || task.checklistTotal > 0 || task.subtaskTotal > 0 || task.description || task.estimate !== null) && (
        <div className="pb-badges">
          {Priority && (
            <span className="pb-badge" title={`${PRIORITIES[task.priority]} priority`}>
              <Priority size={14} strokeWidth={1.75} />
            </span>
          )}
          {task.dueDate && due && (
            <span className={`pb-badge pb-due is-${due}`} title={`Due ${task.dueDate}`}>
              <CalendarDays size={12} strokeWidth={1.75} />
              {shortDate(task.dueDate)}
            </span>
          )}
          {task.recurrence && (
            <span className="pb-badge" title={`Repeats ${task.recurrence}`}>
              <Repeat size={12} strokeWidth={1.75} />
            </span>
          )}
          {task.checklistTotal > 0 && (
            <span className={`pb-badge${checklistDone ? " is-complete" : ""}`} title="Checklist">
              <SquareCheck size={12} strokeWidth={1.75} />
              {task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {task.subtaskTotal > 0 && (
            <span className={`pb-badge${task.subtaskDone === task.subtaskTotal ? " is-complete" : ""}`} title="Sub-tasks">
              <ListTree size={12} strokeWidth={1.75} />
              {task.subtaskDone}/{task.subtaskTotal}
            </span>
          )}
          {task.estimate !== null && (
            <span className="pb-badge" title="Estimate">
              <Clock size={12} strokeWidth={1.75} />
              {task.estimate}h
            </span>
          )}
          {task.description && (
            <span className="pb-badge" title="Has a description">
              <AlignLeft size={12} strokeWidth={1.75} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface SortableCardProps {
  task: TaskCard;
  labels: Label[];
  onOpen: (id: string) => void;
}

/** A card that can be dragged with the mouse, or picked up with Space and moved with the arrow keys. */
export function SortableCard({ task, labels, onOpen }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: taskKey(task.id),
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(e);
    if (e.key === "Enter" && !e.defaultPrevented) onOpen(task.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "pb-sortable is-dragging" : "pb-sortable"}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => onOpen(task.id)}
      aria-label={`${task.title}. Enter to open, Space to move.`}
    >
      <Card task={task} labels={labels} />
    </div>
  );
}
