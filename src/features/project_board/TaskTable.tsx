import { Fragment, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, CornerDownRight } from "lucide-react";
import { usePersistentState } from "../../shell/usePersistentState";
import type { Board, TaskCard } from "./api";
import { colorOf, dueState, PRIORITIES, shortDate, timeAgo } from "./palette";

type SortKey = "title" | "status" | "priority" | "due" | "estimate" | "updated";
type GroupBy = "none" | "status" | "priority";

const HEADERS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "title", label: "Title", className: "is-title" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: null, label: "Labels" },
  { key: "due", label: "Due" },
  { key: "estimate", label: "Estimate", className: "is-number" },
  { key: null, label: "Progress" },
  { key: "updated", label: "Updated" },
];

interface TaskTableProps {
  board: Board;
  tasks: TaskCard[];
  onOpenTask: (id: string) => void;
}

/** Every task as a sortable, groupable spreadsheet, like GitHub Projects' table view. */
export function TaskTable({ board, tasks, onOpenTask }: TaskTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "status", desc: false });
  const [groupBy, setGroupBy] = usePersistentState<GroupBy>("axiom.board.groupBy", (saved) =>
    saved === "status" || saved === "priority" ? saved : "none",
  );

  const columnIndex = new Map(board.columns.map((c, i) => [c.id, i]));
  const columnName = new Map(board.columns.map((c) => [c.id, c.name]));

  const value = (t: TaskCard): string | number => {
    switch (sort.key) {
      case "title":
        return t.title.toLowerCase();
      case "status":
        return (columnIndex.get(t.columnId) ?? 0) * 1e6 + t.position;
      case "priority":
        return t.priority;
      // Undated and unestimated tasks sort last.
      case "due":
        return t.dueDate ?? "9999-99-99";
      case "estimate":
        return t.estimate ?? Number.MAX_VALUE;
      case "updated":
        return t.updatedAt;
    }
  };
  const sorted = [...tasks].sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    const order = x < y ? -1 : x > y ? 1 : 0;
    return sort.desc ? -order : order;
  });

  const groups: { name: string; tasks: TaskCard[] }[] =
    groupBy === "status"
      ? board.columns.map((c) => ({ name: c.name, tasks: sorted.filter((t) => t.columnId === c.id) }))
      : groupBy === "priority"
        ? [3, 2, 1, 0].map((p) => ({ name: `${PRIORITIES[p]} priority`, tasks: sorted.filter((t) => t.priority === p) }))
        : [{ name: "", tasks: sorted }];

  const sortBy = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }));

  return (
    <div className="pb-table-wrap">
      <div className="pb-table-tools">
        <label>
          Group by
          <select value={groupBy} onChange={(e) => setGroupBy(e.currentTarget.value as GroupBy)}>
            <option value="none">None</option>
            <option value="status">Status</option>
            <option value="priority">Priority</option>
          </select>
        </label>
        <span className="dim">{tasks.length} tasks</span>
      </div>

      <table className="pb-table">
        <thead>
          <tr>
            {HEADERS.map(({ key, label, className }) => (
              <th key={label} className={className} aria-sort={key === sort.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                {key ? (
                  <button onClick={() => sortBy(key)}>
                    {label}
                    {key === sort.key &&
                      (sort.desc ? <ArrowDown size={12} strokeWidth={1.75} /> : <ArrowUp size={12} strokeWidth={1.75} />)}
                  </button>
                ) : (
                  label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.name}>
              {group.name && (
                <tr className="pb-group-row">
                  <td colSpan={HEADERS.length}>
                    {group.name} <span className="dim">{group.tasks.length}</span>
                  </td>
                </tr>
              )}
              {group.tasks.map((t) => {
                const labels = board.labels.filter((l) => t.labelIds.includes(l.id));
                const done = t.completedAt !== null;
                const progress = [
                  t.checklistTotal ? `☑ ${t.checklistDone}/${t.checklistTotal}` : "",
                  t.subtaskTotal ? `↳ ${t.subtaskDone}/${t.subtaskTotal}` : "",
                ]
                  .filter(Boolean)
                  .join("  ");
                return (
                  <tr
                    key={t.id}
                    className={done ? "pb-row is-done" : "pb-row"}
                    tabIndex={0}
                    onClick={() => onOpenTask(t.id)}
                    onKeyDown={(e) => e.key === "Enter" && onOpenTask(t.id)}
                  >
                    <td className="is-title">
                      {t.parentTitle && (
                        <span className="pb-parent" title={`Sub-task of ${t.parentTitle}`}>
                          <CornerDownRight size={12} strokeWidth={1.75} />
                        </span>
                      )}
                      {t.title}
                    </td>
                    <td>{columnName.get(t.columnId)}</td>
                    <td className={t.priority === 0 ? "dim" : undefined}>{PRIORITIES[t.priority]}</td>
                    <td>
                      <span className="pb-card-labels">
                        {labels.map((l) => (
                          <span key={l.id} className="pb-label" style={{ "--label": colorOf(l.color) } as CSSProperties}>
                            {l.name}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>
                      {t.dueDate && <span className={`pb-due is-${dueState(t.dueDate, done)}`}>{shortDate(t.dueDate)}</span>}
                    </td>
                    <td className="is-number">{t.estimate !== null ? `${t.estimate}h` : ""}</td>
                    <td className="dim">{progress}</td>
                    <td className="dim">{timeAgo(t.updatedAt)}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      {tasks.length === 0 && <p className="dim pb-message">No tasks match.</p>}
    </div>
  );
}
