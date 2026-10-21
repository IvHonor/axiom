import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Activity, Archive, ChartLine, Columns3, Ellipsis, GanttChart, Plus, SquareKanban, Table2, X, type LucideIcon } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { Dropdown } from "../../shell/ui/Dropdown";
import { usePersistentState } from "../../shell/usePersistentState";
import { useDataChanged } from "../../lib/sync";
import { api, errorMessage, type Board, type Project, type TaskCard } from "./api";
import { ActivityView } from "./ActivityView";
import { ArchiveList } from "./ArchiveList";
import { BoardColumns } from "./BoardColumns";
import { InlineInput } from "./Column";
import { FilterBar, matches, NO_FILTER, type Filter } from "./Filters";
import { colorOf, todayISO } from "./palette";
import { TaskDrawer } from "./TaskDrawer";
import { InsightsView } from "./InsightsView";
import { TaskTable } from "./TaskTable";
import { TimelineView } from "./TimelineView";

type BoardViewKind = "board" | "table" | "timeline" | "activity" | "insights" | "archive";

/** Ways to look at a project. The filter bar applies to the first three and the archive. */
const VIEWS: { id: BoardViewKind; label: string; icon: LucideIcon }[] = [
  { id: "board", label: "Board", icon: Columns3 },
  { id: "table", label: "Table", icon: Table2 },
  { id: "timeline", label: "Timeline", icon: GanttChart },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "insights", label: "Insights", icon: ChartLine },
  { id: "archive", label: "Archive", icon: Archive },
];

/** The Project Board's main view: project tabs, the board, and the card drawer. */
export function ProjectBoardView() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [savedId, setSavedId] = usePersistentState<string | null>("axiom.board.project", (saved) =>
    typeof saved === "string" ? saved : null,
  );
  const [board, setBoard] = useState<Board | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const [view, setView] = usePersistentState<BoardViewKind>("axiom.board.view", (saved) =>
    VIEWS.some((v) => v.id === saved) ? (saved as BoardViewKind) : "board",
  );
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const visible = useCallback((task: TaskCard) => matches(task, filter), [filter]);

  const projectId = projects?.some((p) => p.id === savedId) ? savedId : (projects?.[0]?.id ?? null);

  const loadProjects = useCallback(
    () =>
      api
        .listProjects()
        .then(setProjects)
        .catch((e) => setError(errorMessage(e))),
    [],
  );

  const reload = useCallback(async () => {
    if (projectId === null) return setBoard(null);
    try {
      setBoard(await api.getBoard(projectId));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [projectId]);

  useEffect(() => void loadProjects(), [loadProjects]);
  useEffect(() => void reload(), [reload]);
  // Another computer's changes just arrived.
  useDataChanged(() => {
    loadProjects();
    reload();
  });

  /** Runs a change, shows any error, then reloads so the board matches the database. */
  const act = useCallback(
    async (change: () => Promise<unknown>) => {
      try {
        await change();
      } catch (e) {
        setError(errorMessage(e));
      }
      await reload();
    },
    [reload],
  );

  async function createProject(name: string) {
    try {
      const project = await api.createProject(name);
      setSavedId(project.id);
      await loadProjects();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function projectAction(change: () => Promise<unknown>) {
    try {
      await change();
    } catch (e) {
      setError(errorMessage(e));
    }
    await loadProjects();
  }

  const current = board && board.project.id === projectId ? board : null;
  const today = todayISO();
  const stats = current && {
    total: current.tasks.length,
    done: current.tasks.filter((t) => t.completedAt).length,
    overdue: current.tasks.filter((t) => !t.completedAt && t.dueDate && t.dueDate < today).length,
  };

  return (
    <div className="pb-view">
      <header className="pb-toolbar">
        <nav className="pb-tabs" aria-label="Projects">
          {projects?.map((p) =>
            naming === "rename" && p.id === projectId ? (
              <InlineInput
                key={p.id}
                initial={p.name}
                onSubmit={(name) => (setNaming(null), projectAction(() => api.renameProject(p.id, name)))}
                onCancel={() => setNaming(null)}
              />
            ) : (
              <button
                key={p.id}
                className={p.id === projectId ? "pb-tab is-active" : "pb-tab"}
                onClick={() => (setSavedId(p.id), setOpenTask(null), setFilter(NO_FILTER))}
                style={{ "--project": colorOf(p.color) } as CSSProperties}
              >
                <span className="pb-tab-dot" />
                {p.name}
              </button>
            ),
          )}
          {naming === "new" ? (
            <InlineInput
              initial=""
              placeholder="Project name"
              onSubmit={(name) => (setNaming(null), createProject(name))}
              onCancel={() => setNaming(null)}
            />
          ) : (
            projects && (
              <button className="pb-tab pb-tab-new" onClick={() => setNaming("new")}>
                <Plus size={14} strokeWidth={1.75} /> New project
              </button>
            )
          )}
        </nav>

        {stats && (
          <div className="pb-stats">
            <span>{stats.total} tasks</span>
            <span>{stats.done} done</span>
            {stats.overdue > 0 && <span className="is-overdue">{stats.overdue} overdue</span>}
          </div>
        )}
        {current && (
          <Dropdown label="Project actions" icon={<Ellipsis size={16} strokeWidth={1.5} />}>
            {(close) => (
              <>
                <button className="menu-item" onClick={() => (setNaming("rename"), close())}>
                  Rename project
                </button>
                <ConfirmButton
                  className="menu-item is-danger"
                  confirmText="Deletes every task. Click again"
                  onConfirm={() => (close(), setOpenTask(null), projectAction(() => api.deleteProject(current.project.id)))}
                >
                  Delete project
                </ConfirmButton>
              </>
            )}
          </Dropdown>
        )}
      </header>

      {current && (
        <div className="pb-viewbar">
          <div className="pb-segmented" role="tablist" aria-label="Board view">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                className={view === id ? "is-active" : undefined}
                onClick={() => setView(id)}
              >
                <Icon size={14} strokeWidth={1.5} /> {label}
              </button>
            ))}
          </div>
          {view !== "activity" && view !== "insights" && (
            <FilterBar filter={filter} onChange={setFilter} labels={current.labels} />
          )}
        </div>
      )}

      {error && (
        <div className="pb-error" role="alert">
          <span>{error}</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {projects === null ? (
        !error && <p className="dim pb-message">Loading projects…</p>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <SquareKanban size={48} strokeWidth={0.75} className="dim" />
          <div className="empty-title">No projects yet</div>
          <p className="empty-text">A project gets its own board with Backlog, To do, Doing and Done columns.</p>
          <button className="btn" onClick={() => setNaming("new")}>
            Create a project
          </button>
        </div>
      ) : current ? (
        view === "table" ? (
          <TaskTable board={current} tasks={current.tasks.filter(visible)} onOpenTask={setOpenTask} />
        ) : view === "timeline" ? (
          <TimelineView board={current} tasks={current.tasks.filter(visible)} onOpenTask={setOpenTask} />
        ) : view === "activity" ? (
          <ActivityView board={current} onOpenTask={setOpenTask} onError={setError} />
        ) : view === "insights" ? (
          <InsightsView board={current} onError={setError} />
        ) : view === "archive" ? (
          <ArchiveList board={current} filter={filter} act={act} onError={setError} />
        ) : (
          <BoardColumns board={current} visible={visible} act={act} onOpenTask={setOpenTask} />
        )
      ) : (
        <p className="dim pb-message">Loading board…</p>
      )}

      {current && openTask !== null && (
        <TaskDrawer
          taskId={openTask}
          board={current}
          onClose={() => setOpenTask(null)}
          onOpenTask={setOpenTask}
          act={act}
          onError={setError}
        />
      )}
    </div>
  );
}
