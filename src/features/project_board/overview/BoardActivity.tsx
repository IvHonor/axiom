import { useEffect, useState } from "react";
import { api, errorMessage, type ActivityItem, type Board } from "../api";
import { timeAgo } from "../palette";
import { mapProjects } from "./data";
import { PagedRows, type CardActions } from "./BoardOverviewParts";
import type { OverviewCard } from "./model";

export function BoardActivity({ boards, cards, revision, height, row, open }: { boards: Board[]; cards: OverviewCard[]; revision: number; height: number; row: number; open: CardActions["open"] }) {
  const [items, setItems] = useState<(ActivityItem & { projectId: string; projectName: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const projectKey = boards.map((board) => board.project.id).join(",");
  useEffect(() => {
    let cancelled = false;
    setItems(null); setError(null);
    void mapProjects(boards, async (board) => (await api.activity(board.project.id)).map((item) => ({ ...item, projectId: board.project.id, projectName: board.project.name })))
      .then((results) => {
        if (cancelled) return;
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") { setError(errorMessage(failure.reason)); return; }
        setItems(results.flatMap((result) => result.status === "fulfilled" ? result.value : []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      });
    return () => { cancelled = true; };
    // Project identity and revision define the data request, not render-time array references.
  }, [projectKey, revision, attempt]);
  if (error) return <div className="pb-ov-status" role="alert"><span>{error}</span><button className="btn btn-ghost" onClick={() => setAttempt((value) => value + 1)}>Retry activity</button></div>;
  if (!items) return <p className="pb-ov-empty">Loading recent activity…</p>;
  const ids = new Set(cards.map((card) => card.id));
  const shown = items.filter((item) => ids.has(item.taskId));
  return <div className="pb-ov-activity"><small className="pb-ov-note">Latest 300 changes per project · matching active cards</small><PagedRows height={height - 22} row={Math.max(48, row)} label="activity" empty="No recent changes for matching active cards."
    rows={shown.map((item) => ({ id: item.id, node: <button className="pb-ov-activity-row" onClick={() => open(item.projectId, item.taskId)} title={`${item.projectName} · ${item.taskTitle}\n${item.detail || item.kind}\n${new Date(item.createdAt).toLocaleString()}`}>
      <span><strong className="pb-ov-ellipsis">{item.taskTitle}</strong><small className="pb-ov-ellipsis">{item.projectName} · {item.detail || item.kind}</small></span><time>{timeAgo(item.createdAt)}</time>
    </button> }))} /></div>;
}
