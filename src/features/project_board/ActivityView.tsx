import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  CircleCheck,
  CirclePlus,
  History,
  LayoutTemplate,
  ListTree,
  Pencil,
  Repeat,
  RotateCcw,
  Signal,
  type LucideIcon,
} from "lucide-react";
import { api, errorMessage, type ActivityItem, type Board } from "./api";
import { timeAgo } from "./palette";

const ICONS: Record<string, LucideIcon> = {
  created: CirclePlus,
  moved: ArrowRightLeft,
  completed: CircleCheck,
  reopened: RotateCcw,
  renamed: Pencil,
  due: CalendarDays,
  priority: Signal,
  subtask: ListTree,
  recurrence: Repeat,
  template: LayoutTemplate,
};

interface ActivityViewProps {
  board: Board;
  onOpenTask: (id: string) => void;
  onError: (message: string) => void;
}

/** Everything that happened in the project, newest first, grouped by day. */
export function ActivityView({ board, onOpenTask, onError }: ActivityViewProps) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const openIds = new Set(board.tasks.map((t) => t.id));

  useEffect(() => {
    api
      .activity(board.project.id)
      .then(setItems)
      .catch((e) => onError(errorMessage(e)));
  }, [board, onError]);

  if (!items) return <p className="dim pb-message">Loading activity…</p>;
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-title">No activity yet</div>
        <p className="empty-text">Changes to cards in this project show up here.</p>
      </div>
    );
  }

  const days: { label: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    if (days[days.length - 1]?.label !== label) days.push({ label, items: [] });
    days[days.length - 1].items.push(item);
  }

  return (
    <div className="pb-activity-feed">
      {days.map((day) => (
        <section key={day.label}>
          <h4 className="pb-section-title">{day.label}</h4>
          <ul>
            {day.items.map((item) => {
              const Icon = ICONS[item.kind] ?? History;
              // Archived and deleted tasks can't be opened from the board.
              const canOpen = openIds.has(item.taskId);
              return (
                <li key={item.id}>
                  <span className="pb-feed-icon">
                    <Icon size={14} strokeWidth={1.75} />
                  </span>
                  <div className="pb-feed-text">
                    <button className="pb-feed-task" disabled={!canOpen} onClick={() => onOpenTask(item.taskId)}>
                      {item.taskTitle}
                    </button>
                    <span className="dim">{item.detail || item.kind[0].toUpperCase() + item.kind.slice(1)}</span>
                  </div>
                  <time className="dim" title={new Date(item.createdAt).toLocaleString()}>
                    {timeAgo(item.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function dayLabel(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
