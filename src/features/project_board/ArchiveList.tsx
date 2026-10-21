import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { useDataChanged } from "../../lib/sync";
import { api, errorMessage, type Board, type TaskCard } from "./api";
import { matches, type Filter } from "./Filters";
import { timeAgo } from "./palette";

interface ArchiveListProps {
  board: Board;
  filter: Filter;
  /** Runs a change, reports any error, then reloads the board. */
  act: (change: () => Promise<unknown>) => Promise<void>;
  onError: (message: string) => void;
}

/** Archived tasks, with restore and permanent delete. */
export function ArchiveList({ board, filter, act, onError }: ArchiveListProps) {
  const [tasks, setTasks] = useState<TaskCard[] | null>(null);
  const columnName = new Map(board.columns.map((c) => [c.id, c.name]));

  const load = useCallback(
    () =>
      api
        .listArchived(board.project.id)
        .then(setTasks)
        .catch((e) => onError(errorMessage(e))),
    [board.project.id, onError],
  );

  useEffect(() => void load(), [load]);
  useDataChanged(load);

  const run = (change: () => Promise<unknown>) => act(change).then(load);

  if (!tasks) return <p className="dim pb-message">Loading archive…</p>;
  const shown = tasks.filter((t) => matches(t, filter));

  return (
    <div className="pb-archive">
      {shown.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">{tasks.length ? "No matches" : "Nothing archived"}</div>
          <p className="empty-text">Archived cards leave the board but keep their history. They show up here.</p>
        </div>
      ) : (
        <ul>
          {shown.map((t) => (
            <li key={t.id} className="pb-archive-row">
              <div className="pb-archive-text">
                <span className="pb-card-title">{t.title}</span>
                <span className="ext-meta">
                  {columnName.get(t.columnId)} · archived {timeAgo(t.updatedAt)}
                </span>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => run(() => api.archiveTask(t.id, false))}>
                <ArchiveRestore size={12} strokeWidth={1.75} /> Restore
              </button>
              <ConfirmButton
                className="btn btn-sm btn-ghost is-danger"
                confirmText="Delete forever?"
                onConfirm={() => run(() => api.deleteTask(t.id))}
              >
                <Trash2 size={12} strokeWidth={1.75} /> Delete
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
