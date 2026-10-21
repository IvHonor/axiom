// Typed wrappers for the Project Board's Tauri commands.
// Mirrors src-tauri/src/features/project_board/{entities,types}.rs.
import { invoke } from "@tauri-apps/api/core";

export type Recurrence = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export interface Template {
  id: string;
  projectId: string;
  name: string;
  title: string;
  description: string;
  priority: number;
  estimate: number | null;
  recurrence: Recurrence | null;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  taskId: string;
  taskTitle: string;
  kind: string;
  detail: string;
  createdAt: string;
}

export interface Insights {
  burnup: { date: string; total: number; done: number }[];
  throughput: { weekStart: string; done: number }[];
  openByColumn: { name: string; count: number }[];
  openByPriority: { name: string; count: number }[];
  openByLabel: { name: string; color: string; count: number }[];
  avgCycleDays: number | null;
  open: number;
  overdue: number;
  createdLast7: number;
  completedLast7: number;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  position: number;
  createdAt: string;
}

export interface Column {
  id: string;
  projectId: string;
  name: string;
  position: number;
  isDone: boolean;
  wipLimit: number | null;
}

export interface Task {
  id: string;
  projectId: string;
  columnId: string;
  parentTaskId: string | null;
  title: string;
  description: string;
  position: number;
  /** 0 none, 1 low, 2 medium, 3 high. */
  priority: number;
  /** "YYYY-MM-DD" */
  startDate: string | null;
  dueDate: string | null;
  /** Hours. */
  estimate: number | null;
  /** How the task repeats; null if it doesn't. */
  recurrence: Recurrence | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archived: boolean;
}

export interface TaskCard extends Task {
  labelIds: string[];
  checklistDone: number;
  checklistTotal: number;
  subtaskDone: number;
  subtaskTotal: number;
  /** Set when this card is a sub-task. */
  parentTitle: string | null;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  position: number;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  kind: string;
  detail: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  labelIds: string[];
  checklist: ChecklistItem[];
  events: TaskEvent[];
  subtasks: Task[];
  parent: { id: string; title: string } | null;
}

export interface Board {
  project: Project;
  columns: Column[];
  tasks: TaskCard[];
  labels: Label[];
  templates: Template[];
}

export interface TaskFields {
  title: string;
  description: string;
  priority: number;
  startDate: string | null;
  dueDate: string | null;
  estimate: number | null;
  recurrence: Recurrence | null;
}

export interface ColumnFields {
  name: string;
  isDone: boolean;
  wipLimit: number | null;
}

export interface Summary {
  today: string;
  projects: {
    id: string;
    name: string;
    color: string;
    total: number;
    done: number;
    overdue: number;
    columns: { name: string; count: number; isDone: boolean }[];
  }[];
  dueSoon: { id: string; projectId: string; projectName: string; title: string; dueDate: string }[];
}

export const api = {
  listProjects: () => invoke<Project[]>("board_list_projects"),
  createProject: (name: string) => invoke<Project>("board_create_project", { name }),
  renameProject: (id: string, name: string) => invoke<Project>("board_rename_project", { id, name }),
  deleteProject: (id: string) => invoke<void>("board_delete_project", { id }),

  getBoard: (projectId: string) => invoke<Board>("board_get", { projectId }),
  createColumn: (projectId: string, name: string) => invoke<Column>("board_create_column", { projectId, name }),
  updateColumn: (id: string, fields: ColumnFields) => invoke<Column>("board_update_column", { id, fields }),
  moveColumn: (id: string, direction: -1 | 1) => invoke<Column[]>("board_move_column", { id, direction }),
  deleteColumn: (id: string) => invoke<void>("board_delete_column", { id }),

  createTask: (columnId: string, title: string) => invoke<TaskCard>("board_create_task", { columnId, title }),
  createSubtask: (parentId: string, title: string) => invoke<TaskCard>("board_create_subtask", { parentId, title }),
  convertChecklistItem: (id: string) => invoke<TaskCard>("board_convert_checklist_item", { id }),
  listArchived: (projectId: string) => invoke<TaskCard[]>("board_list_archived", { projectId }),
  getTask: (id: string) => invoke<TaskDetail>("board_get_task", { id }),
  updateTask: (id: string, fields: TaskFields) => invoke<TaskDetail>("board_update_task", { id, fields }),
  moveTask: (id: string, columnId: string, beforeId: string | null) =>
    invoke<Task>("board_move_task", { id, columnId, beforeId }),
  archiveTask: (id: string, archived: boolean) => invoke<Task>("board_archive_task", { id, archived }),
  deleteTask: (id: string) => invoke<void>("board_delete_task", { id }),

  createLabel: (projectId: string, name: string, color: string) =>
    invoke<Label>("board_create_label", { projectId, name, color }),
  updateLabel: (id: string, name: string, color: string) => invoke<Label>("board_update_label", { id, name, color }),
  deleteLabel: (id: string) => invoke<void>("board_delete_label", { id }),
  setTaskLabels: (taskId: string, labelIds: string[]) =>
    invoke<string[]>("board_set_task_labels", { taskId, labelIds }),

  addChecklistItem: (taskId: string, text: string) =>
    invoke<ChecklistItem>("board_add_checklist_item", { taskId, text }),
  updateChecklistItem: (id: string, text: string, done: boolean) =>
    invoke<ChecklistItem>("board_update_checklist_item", { id, text, done }),
  deleteChecklistItem: (id: string) => invoke<void>("board_delete_checklist_item", { id }),

  summary: () => invoke<Summary>("board_summary"),

  saveTemplate: (taskId: string, name: string) => invoke<Template>("board_save_template", { taskId, name }),
  deleteTemplate: (id: string) => invoke<void>("board_delete_template", { id }),
  createFromTemplate: (templateId: string, columnId: string) =>
    invoke<TaskCard>("board_create_from_template", { templateId, columnId }),

  activity: (projectId: string) => invoke<ActivityItem[]>("board_activity", { projectId }),
  insights: (projectId: string) => invoke<Insights>("board_insights", { projectId }),
};

/** Turns whatever a rejected invoke gives us into a readable message. */
export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
}
