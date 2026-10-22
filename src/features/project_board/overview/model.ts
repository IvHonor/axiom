import type { TileViewOption } from "../../../shell/ui/TileDisplayMenu";
import type { Board, Column, Label, Project, TaskCard } from "../api";
import { todayISO } from "../palette";

export type BoardTileView = "glance" | "next" | "tasks" | "deadlines" | "priorities" | "undated" | "progress" | "projects" | "cards" | "workflow" | "kanban" | "timeline" | "labels" | "activity" | "dashboard";
export interface BoardTilePreferences {
  view: BoardTileView | "auto";
  project: string;
  density: "auto" | "compact" | "comfortable";
  sort: "urgency" | "due" | "priority" | "updated" | "board";
  completed: boolean;
  subtasks: boolean;
  horizon: 7 | 14 | 30 | 90;
  label: string;
  priority: "all" | "0" | "1" | "2" | "3";
  details: boolean;
}
export const DEFAULTS: BoardTilePreferences = { view: "auto", project: "all", density: "auto", sort: "urgency", completed: false, subtasks: false, horizon: 14, label: "all", priority: "all", details: true };
export const VIEWS: (TileViewOption & { id: BoardTileView })[] = [
  { id: "glance", label: "At a glance", description: "Open cards and overdue count", width: 0, height: 0 },
  { id: "next", label: "Next actions", description: "Urgent open cards, with pages", width: 135, height: 92 },
  { id: "tasks", label: "Task list", description: "Cards across projects, with configurable sorting", width: 150, height: 140 },
  { id: "deadlines", label: "Deadlines", description: "Overdue and upcoming cards in due-date order", width: 155, height: 140 },
  { id: "priorities", label: "High priority", description: "Open high-priority cards needing attention", width: 135, height: 92 },
  { id: "undated", label: "Without deadlines", description: "Open work without a due date", width: 135, height: 92 },
  { id: "progress", label: "Overall progress", description: "Completion, overdue work and estimated hours", width: 160, height: 115 },
  { id: "projects", label: "Project progress", description: "Per-project completion and overdue counts", width: 170, height: 140 },
  { id: "cards", label: "Project cards", description: "A portfolio of progress cards, with pages", width: 420, height: 220 },
  { id: "workflow", label: "Workflow load", description: "Custom columns and their actual card limits", width: 190, height: 175 },
  { id: "kanban", label: "Mini Kanban", description: "Real board columns with paged cards and lanes", width: 500, height: 230 },
  { id: "timeline", label: "Deadline timeline", description: "Dated cards fitted to a shared calendar range", width: 480, height: 235 },
  { id: "labels", label: "Label breakdown", description: "Open-card counts by label, including unlabelled work", width: 180, height: 150 },
  { id: "activity", label: "Recent activity", description: "Latest changes across the selected projects", width: 230, height: 185 },
  { id: "dashboard", label: "Project dashboard", description: "Progress, next actions and workflow together", width: 600, height: 405 },
];
export const fits = (id: BoardTileView, width: number, height: number) => {
  const option = VIEWS.find((view) => view.id === id)!;
  return width >= option.width && height >= option.height;
};
export function recommendedView(width: number, height: number): BoardTileView {
  if (fits("dashboard", width, height)) return "dashboard";
  if (fits("kanban", width, height)) return "kanban";
  if (fits("projects", width, height) && height >= 330) return "projects";
  if (fits("tasks", width, height)) return "tasks";
  if (fits("next", width, height)) return "next";
  return "glance";
}
export const resolveView = (prefs: BoardTilePreferences, width: number, height: number) => prefs.view !== "auto" && fits(prefs.view, width, height) ? prefs.view : recommendedView(width, height);
export const rowHeight = (prefs: BoardTilePreferences, height: number) => prefs.density === "compact" || (prefs.density === "auto" && height < 230) ? 32 : 48;

export interface OverviewCard extends TaskCard { project: Project; column?: Column; labels: Label[] }
export function flattenBoards(boards: Board[]): OverviewCard[] {
  return boards.flatMap((board) => board.tasks.filter((task) => !task.archived).map((task) => ({
    ...task, project: board.project, column: board.columns.find((column) => column.id === task.columnId), labels: board.labels.filter((label) => task.labelIds.includes(label.id)),
  })));
}
export const isDone = (card: OverviewCard) => !!card.completedAt || !!card.column?.isDone;
export function filterCards(cards: OverviewCard[], prefs: BoardTilePreferences) {
  return cards.filter((card) => (prefs.subtasks || !card.parentTaskId)
    && (prefs.priority === "all" || card.priority === Number(prefs.priority))
    && (prefs.label === "all" || (prefs.label === "none" ? card.labels.length === 0 : card.labels.some((label) => `name:${label.name}` === prefs.label))));
}
export function sortCards(cards: OverviewCard[], sort: BoardTilePreferences["sort"], today = todayISO()): OverviewCard[] {
  const due = (card: OverviewCard) => card.dueDate ?? "9999-12-31";
  const upcoming = addDays(today, 7);
  const urgency = (card: OverviewCard) => card.dueDate && card.dueDate < today ? 0 : card.dueDate === today ? 1 : card.priority === 3 ? 2 : card.dueDate && card.dueDate <= upcoming ? 3 : 4;
  return [...cards].sort((a, b) => {
    const primary = sort === "priority" ? b.priority - a.priority || due(a).localeCompare(due(b))
      : sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt)
      : sort === "board" ? a.project.position - b.project.position || (a.column?.position ?? 0) - (b.column?.position ?? 0) || a.position - b.position
      : sort === "urgency" ? urgency(a) - urgency(b) || b.priority - a.priority || due(a).localeCompare(due(b))
      : due(a).localeCompare(due(b)) || b.priority - a.priority;
    return Number(isDone(a)) - Number(isDone(b)) || primary || a.position - b.position || a.id.localeCompare(b.id);
  });
}
export function stats(cards: OverviewCard[], today: string) {
  const open = cards.filter((card) => !isDone(card));
  const done = cards.length - open.length;
  return { total: cards.length, done, open: open.length, percent: cards.length ? Math.round(done / cards.length * 100) : 0,
    overdue: open.filter((card) => card.dueDate && card.dueDate < today).length,
    dueToday: open.filter((card) => card.dueDate === today).length,
    undated: open.filter((card) => !card.dueDate).length,
    hours: open.reduce((sum, card) => sum + (card.estimate ?? 0), 0), unestimated: open.filter((card) => card.estimate === null).length,
  };
}
export function addDays(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** Calendar arithmetic stays stable across daylight-saving changes. */
export const dayIndex = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86400000;
};
export const hoursLabel = (hours: number) => `${Number(hours.toFixed(1))}h`;
