// This fixture replaces the board API with in-memory data. No desktop database access.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BoardSummary } from "../src/features/project_board/BoardSummary";
import { BoardSummaryTitle } from "../src/features/project_board/overview/BoardOverviewMenu";
import { ProjectBoardView } from "../src/features/project_board/ProjectBoardView";
import { api, type Board, type TaskCard } from "../src/features/project_board/api";
import { addDays } from "../src/features/project_board/overview/model";
import { refreshBoardOverview } from "../src/features/project_board/overview/data";
import { todayISO } from "../src/features/project_board/palette";
import { useBoardTarget } from "../src/features/project_board/boardNavigation";
import { ResizableTile, TileGrid } from "../src/shell/ui/ResizableTile";
import { Panel } from "../src/shell/ui/Panel";
import { applyTheme } from "../src/shell/theme/applyTheme";
import { modernThemes } from "../src/themes/modern_themes";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/project_board/board.css";

const query = new URLSearchParams(location.search);
applyTheme(modernThemes.themes![query.get("theme") === "light" ? 1 : 0]);
const today = todayISO();
let fail = query.get("fail") === "true";
let partial = query.get("partial") === "true";
const boards: Board[] = Array.from({ length: query.get("empty") === "true" ? 0 : 8 }, (_, p) => {
  const project = { id: `p${p}`, name: p === 0 ? "University" : p === 1 ? "Application redesign with a very long project name" : `Project ${p + 1}`, position: p, color: ["blue", "purple", "green"][p % 3], createdAt: new Date().toISOString() };
  const columns = ["Backlog", "In progress", "Review with a long column title", "Done"].map((name, c) => ({ id: `p${p}c${c}`, projectId: project.id, name, position: c, isDone: c === 3 && p !== 7, wipLimit: c === 1 ? 1 : null }));
  const labels = [{ id: `p${p}l0`, projectId: project.id, name: "Research", color: "blue" }, { id: `p${p}l1`, projectId: project.id, name: "Writing", color: "green" }];
  const tasks: TaskCard[] = Array.from({ length: 20 }, (_, t) => ({
    id: `p${p}t${t}`, projectId: project.id, columnId: columns[t % 4].id, parentTaskId: t === 12 ? `p${p}t0` : null,
    title: `${p === 0 ? "University" : `Project ${p + 1}`} card ${t + 1}${t === 0 ? ": finish the long research proposal and send it for review" : ""}`,
    description: "Fixture card", position: t, priority: t % 4, startDate: t % 3 === 0 ? addDays(today, t - 10) : null,
    dueDate: t % 5 === 0 ? null : addDays(today, t - 8), estimate: t % 3 === 0 ? null : t / 2, recurrence: t === 8 ? "weekly" : null,
    createdAt: new Date().toISOString(), updatedAt: new Date(Date.now() - t * 3600000).toISOString(), completedAt: t % 4 === 3 && p !== 7 ? new Date().toISOString() : null,
    archived: t === 19, labelIds: t % 3 === 0 ? [] : t % 3 === 1 ? [labels[0].id] : labels.map((label) => label.id), checklistDone: 1, checklistTotal: 3, subtaskDone: 0, subtaskTotal: t === 0 ? 1 : 0, parentTitle: t === 12 ? "Parent card" : null,
  }));
  return { project, columns: query.get("columns") === "none" ? [] : columns, labels, tasks: query.get("tasks") === "none" ? [] : tasks, templates: [] };
});
let moves = 0;
api.listProjects = async () => { if (fail) throw new Error("Test connection failure"); return structuredClone(boards.map((b) => b.project)); };
api.getBoard = async (id) => { if (partial && id === "p1") throw new Error("Unavailable project"); const board = boards.find((b) => b.project.id === id); if (!board) throw new Error("Missing project"); return structuredClone(board); };
api.moveTask = async (id, columnId) => {
  if (query.get("mutationFailure") === "true") throw new Error("Test completion failure");
  moves++; const board = boards.find((b) => b.tasks.some((t) => t.id === id))!; const task = board.tasks.find((t) => t.id === id)!;
  task.columnId = columnId; task.completedAt = board.columns.find((c) => c.id === columnId)?.isDone ? new Date().toISOString() : null;
  return structuredClone(task);
};
api.activity = async (id) => boards.find((board) => board.project.id === id)!.tasks.map((task, i) => ({ id: `a${task.id}`, taskId: task.id, taskTitle: task.title, kind: "created", detail: "Created a card", createdAt: new Date(Date.now() - i * 60000).toISOString() }));
api.getTask = async (id) => { const task = boards.flatMap((board) => board.tasks).find((task) => task.id === id)!; return { ...structuredClone(task), checklist: [], events: [], subtasks: [], parent: null }; };

function Fixture() {
  const [size, setSize] = useState({ w: Number(query.get("w") ?? 4), h: Number(query.get("h") ?? 4) });
  const [opened, setOpened] = useState(0);
  const [full, setFull] = useState(false);
  const target = useBoardTarget();
  return <div style={{ padding: 24, height: "100%", overflow: "auto" }}>
    <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
      <label>Width <input aria-label="Grid width" type="number" value={size.w} onChange={(e) => setSize({ ...size, w: +e.target.value })} style={{ width: 60, background: "var(--panel)" }} /></label>
      <label>Height <input aria-label="Grid height" type="number" value={size.h} onChange={(e) => setSize({ ...size, h: +e.target.value })} style={{ width: 60, background: "var(--panel)" }} /></label>
      <span data-testid="opened">Opened {opened}</span><span data-testid="target">{target ? `${target.projectId}/${target.taskId ?? ""}` : "None"}</span><span data-testid="moves">{moves}</span>
      <button onClick={() => { fail = false; partial = false; void refreshBoardOverview(true); }}>Recover data</button>
      <button onClick={() => { boards.splice(1, 1); void refreshBoardOverview(true); }}>Delete project fixture</button>
      <button onClick={() => setFull(true)}>Mount full board</button>
    </div>
    {full ? <ProjectBoardView /> : <TileGrid><ResizableTile size={size} onResize={setSize} label="Project Board">
      <Panel className="tile tile-fitted" title={<BoardSummaryTitle onOpen={() => setOpened(opened + 1)} />} actions={<button onClick={() => setOpened(opened + 1)}>↗</button>}>
        <BoardSummary onOpen={() => setOpened(opened + 1)} />
      </Panel>
    </ResizableTile></TileGrid>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
