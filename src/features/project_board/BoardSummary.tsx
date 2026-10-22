import { useRef, useState } from "react";
import { useDataChanged } from "../../lib/sync";
import { useTileLayout } from "../../shell/ui/ResizableTile";
import { api, errorMessage } from "./api";
import { openBoardTarget } from "./boardNavigation";
import { todayISO } from "./palette";
import { BoardActivity } from "./overview/BoardActivity";
import { CardRow, PagedRows, Progress, ProjectRow, WorkflowRow, workflowColumns, type CardActions } from "./overview/BoardOverviewParts";
import { DeadlineTimeline, MiniKanban } from "./overview/BoardSpatialViews";
import { refreshBoardOverview, useBoardOverviewData } from "./overview/data";
import { addDays, filterCards, flattenBoards, isDone, resolveView, rowHeight, sortCards, stats, VIEWS, type OverviewCard } from "./overview/model";
import { useBoardTilePreferences } from "./overview/preferences";
import "./overview/overview.css";

export function BoardSummary({ onOpen }: { onOpen: () => void }) {
  const { size, width, height } = useTileLayout();
  const { prefs, update } = useBoardTilePreferences(size);
  const data = useBoardOverviewData();
  useDataChanged(() => { void refreshBoardOverview(true); });
  const [actionError, setActionError] = useState<string | null>(null);
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState(new Set<string>());
  const today = todayISO();
  const view = resolveView(prefs, width, height);
  const projectMissing = prefs.project !== "all" && data.loaded && !data.projects.some((project) => project.id === prefs.project);
  const boards = data.boards.filter((board) => prefs.project === "all" || projectMissing || board.project.id === prefs.project);
  const allCards = flattenBoards(boards);
  const cards = filterCards(allCards, prefs);
  const openCards = cards.filter((card) => !isDone(card));
  const shownCards = sortCards(prefs.completed ? cards : openCards, prefs.sort, today);
  const attention = sortCards(openCards, "urgency", today);
  const numbers = stats(cards, today);
  const row = rowHeight(prefs, height);
  const tiny = height < 130;
  const notice = actionError ?? data.error ?? (data.unavailable.length ? `${data.unavailable.length} project${data.unavailable.length === 1 ? "" : "s"} unavailable · totals are partial` : projectMissing ? "Saved project unavailable · showing all projects" : null);
  const contentHeight = Math.max(0, height - (tiny ? 0 : 52) - (notice ? 26 : 0));
  const scope = prefs.project !== "all" && !projectMissing ? data.projects.find((project) => project.id === prefs.project)?.name ?? "Project" : "All projects";
  const filtered = prefs.label !== "all" || prefs.priority !== "all";
  const key = `${prefs.project}-${prefs.label}-${prefs.priority}-${prefs.completed}-${prefs.subtasks}-${prefs.sort}-${prefs.horizon}-${prefs.density}`;

  const open = (projectId: string, taskId?: string) => { openBoardTarget(projectId, taskId); onOpen(); };
  const complete = async (card: OverviewCard) => {
    const doneColumn = boards.find((board) => board.project.id === card.projectId)?.columns.find((column) => column.isDone);
    if (!doneColumn || isDone(card) || pendingRef.current.has(card.id)) return;
    pendingRef.current.add(card.id); setPending(new Set(pendingRef.current)); setActionError(null);
    try { await api.moveTask(card.id, doneColumn.id, null); await refreshBoardOverview(true); }
    catch (error) { setActionError(errorMessage(error)); }
    finally { pendingRef.current.delete(card.id); setPending(new Set(pendingRef.current)); }
  };
  const actions: CardActions = { open, complete, pending, boards };

  if (!data.loaded) return <div className="pb-ov-status" role={data.error ? "alert" : "status"}><span>{data.error ?? "Loading projects…"}</span>{data.error && <button className="btn btn-ghost" onClick={() => refreshBoardOverview()}>Retry</button>}</div>;
  if (!data.projects.length) return <button className="pb-ov-start" onClick={onOpen}><strong>No projects yet</strong><span>Open the board to create one ↗</span></button>;
  if (height < 80 && notice) return <button className="pb-ov-start" title={notice} onClick={() => { setActionError(null); if (projectMissing) update({ project: "all" }); else void refreshBoardOverview(); }}><strong>Data issue</strong><span>{projectMissing ? "Reset" : "Retry"} ↗</span></button>;

  const cardList = (list: OverviewCard[], available = contentHeight, label = "cards", empty = "No matching cards. Adjust the filters or open the board.") => <PagedRows key={`${key}-${label}`} rows={list.map((card) => ({ id: card.id, node: <CardRow card={card} today={today} prefs={prefs} row={row} actions={actions} /> }))} height={available} row={row} label={label} empty={empty} />;
  const projects = [...boards].sort((a, b) => {
    const aStats = stats(cards.filter((card) => card.projectId === a.project.id), today);
    const bStats = stats(cards.filter((card) => card.projectId === b.project.id), today);
    return bStats.overdue - aStats.overdue || a.project.position - b.project.position;
  });
  const columns = workflowColumns(boards, shownCards);
  const maxColumn = Math.max(1, ...columns.map((entry) => entry.actual));
  const projectRows = (expanded = false) => projects.map((board) => ({ id: board.project.id, node: <ProjectRow project={board.project} cards={cards.filter((card) => card.projectId === board.project.id)} today={today} expanded={expanded} open={() => open(board.project.id)} /> }));
  const workflowRows = columns.map((entry) => ({ id: entry.column.id, node: <WorkflowRow entry={entry} maximum={maxColumn} open={() => open(entry.board.project.id)} /> }));

  const renderView = () => {
    if (!boards.length) return <p className="pb-ov-empty">This project's data is unavailable. Retry to load its cards.</p>;
    if (view === "glance") return <button className="pb-ov-glance" onClick={onOpen} title={`${scope}: ${numbers.open} open, ${numbers.overdue} overdue, ${numbers.done} done`}>
      {width >= 110 ? <><span><strong>{numbers.open}</strong><small>open</small></span><span className={numbers.overdue ? "is-overdue" : ""}><strong>{numbers.overdue}</strong><small>overdue</small></span></> : <span className={numbers.overdue ? "is-overdue" : ""}><strong>{numbers.overdue || numbers.open}</strong><small>{numbers.overdue ? "overdue" : "open cards"}</small></span>}
    </button>;
    if (view === "next") return cardList(attention, contentHeight, "next actions", "No open cards. You're caught up in this scope.");
    if (view === "tasks") return cardList(shownCards);
    if (view === "deadlines") return cardList(sortCards(openCards.filter((card) => card.dueDate && card.dueDate <= addDays(today, prefs.horizon - 1)), "due", today), contentHeight, "deadlines", `No overdue cards or deadlines in the next ${prefs.horizon} days. Undated work is available in Without deadlines.`);
    if (view === "priorities") return cardList(attention.filter((card) => card.priority === 3), contentHeight, "high priority", "No open high-priority cards match this scope.");
    if (view === "undated") return cardList(sortCards(openCards.filter((card) => !card.dueDate), prefs.sort, today), contentHeight, "undated", "Every matching open card has a deadline.");
    if (view === "progress") return <Progress cards={cards} today={today} />;
    if (view === "projects") return <PagedRows key={key} rows={projectRows()} height={contentHeight} row={prefs.density === "comfortable" ? 72 : 56} label="projects" empty="No projects in this scope." />;
    if (view === "cards") return <PagedRows key={key} rows={projectRows(true)} height={contentHeight} row={124} columns={Math.max(2, Math.floor(width / 210))} label="project cards" empty="No projects in this scope." />;
    if (view === "workflow") return <div className="pb-ov-workflow"><small className="pb-ov-note">Full column counts · ! means over the card limit</small><PagedRows key={key} rows={workflowRows} height={contentHeight - 22} row={56} label="workflow" empty="No columns in this project." /></div>;
    if (view === "kanban") return <MiniKanban key={key} columns={columns} width={width} height={contentHeight} prefs={prefs} today={today} actions={actions} />;
    if (view === "timeline") return <DeadlineTimeline key={key} cards={shownCards} today={today} prefs={prefs} height={contentHeight} row={row} open={open} showUndated={() => update({ view: "undated" })} />;
    if (view === "activity") return <BoardActivity boards={boards} cards={cards} revision={data.revision} height={contentHeight} row={row} open={open} />;
    if (view === "labels") {
      const groups = new Map<string, number>();
      for (const card of openCards) for (const name of new Set(card.labels.length ? card.labels.map((label) => `name:${label.name}`) : ["none"])) groups.set(name, (groups.get(name) ?? 0) + 1);
      return <div className="pb-ov-labels"><small className="pb-ov-note">Cards with multiple labels appear in each group</small><PagedRows key={key} height={contentHeight - 22} row={row} label="labels" empty="No open labelled or unlabelled cards in this scope."
        rows={[...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, count]) => ({ id: label, node: <button className="pb-ov-label-row" onClick={() => update({ label, view: "tasks" })} title={`Show ${count} open cards: ${label === "none" ? "Unlabelled" : label.slice(5)}`}><span className="pb-ov-ellipsis">{label === "none" ? "Unlabelled" : label.slice(5)}</span><strong>{count}</strong></button> }))} /></div>;
    }
    const lowerHeight = contentHeight - 92;
    return <div className="pb-ov-dashboard">
      <Progress cards={cards} today={today} />
      <div className="pb-ov-dashboard-columns">
        <section><h3>Needs attention <span>{numbers.overdue} overdue</span></h3>{cardList(attention, lowerHeight - 26, "attention", "No open cards in this scope.")}</section>
        <section><h3>Projects <span>{projects.length}</span></h3><PagedRows key={key} rows={projectRows()} height={Math.floor((lowerHeight - 52) / 2)} row={56} label="dashboard projects" empty="No projects." />
          <h3>Workflow limits</h3><PagedRows key={`${key}-workflow`} rows={[...workflowRows].sort((a, b) => {
            const score = (id: string) => { const entry = columns.find((column) => column.column.id === id)!; return entry.column.wipLimit !== null ? entry.actual - entry.column.wipLimit : -1000; };
            return score(b.id) - score(a.id);
          })} height={Math.floor((lowerHeight - 52) / 2)} row={56} label="dashboard workflow" empty="No columns." /></section>
      </div>
    </div>;
  };
  return <section className="pb-ov-root" data-view={view} aria-label={`Project Board: ${VIEWS.find((option) => option.id === view)!.label}`}>
    {notice && <div className="pb-ov-notice" role="status" title={notice}><span>{notice}</span><button onClick={() => { setActionError(null); if (projectMissing) update({ project: "all" }); else void refreshBoardOverview(); }}>{projectMissing ? "Reset" : "Retry"}</button></div>}
    {!tiny && <div className="pb-ov-heading"><strong title={`${scope}${filtered ? " · filtered" : ""}`}>{scope}{filtered && " · filtered"}</strong><span>{VIEWS.find((option) => option.id === view)!.label}</span></div>}
    <div className="pb-ov-content" key={view}>{renderView()}</div>
    {!tiny && <button className="pb-ov-footer" onClick={() => prefs.project !== "all" && !projectMissing ? open(prefs.project) : onOpen()} title={`${numbers.open} open cards · ${prefs.subtasks ? "including subtasks" : "top-level cards"}${data.unavailable.length ? " · partial totals" : ""}`}><span>{numbers.open} open{width >= 280 ? ` · ${numbers.overdue} overdue` : ""}</span><span>Open board ↗</span></button>}
  </section>;
}
