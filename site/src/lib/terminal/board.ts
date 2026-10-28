import { coalesceEdits, type Fields, type SyncRecord } from "./protocol.ts";
import { localDay, shiftDay, weekStart, type Edit } from "./planner.ts";
import { moveBoardCard } from "./boardPlanner.ts";

export const BOARD_COLORS = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "gray"];
export const PRIORITIES = ["None", "Low", "Medium", "High"];
export const rows = (records: SyncRecord[], table: string) => records.filter(row => row.table === `project_board_${table}` && !row.data.deleted_at);
export const text = (value: unknown) => typeof value === "string" ? value : "";
export const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
export const ordered = (records: SyncRecord[]) => [...records].sort((a, b) => numeric(a.data.position) - numeric(b.data.position) || a.id.localeCompare(b.id));
export const required = (value: unknown, name: string) => { const result = text(value).trim(); if (!result || result.length > 500) throw new Error(`${name} must be between 1 and 500 characters.`); return result; };
const find = (records: SyncRecord[], table: string, id: string) => { const row = rows(records, table).find(row => row.id === id); if (!row) throw new Error("This item is no longer available. Sync and try again."); return row; };
const tombstone = (row: SyncRecord, at: string): Edit => ({ table: row.table, id: row.id, fields: { deleted_at: at } });
export function boardEvent(id: string, kind: string, detail: string, at: string, newId: () => string): Edit {
  const key = newId(); return { table: "project_board_task_events", id: key, fields: { id: key, task_id: id, kind, detail, created_at: at, deleted_at: null } };
}

export function createProject(name: string, records: SyncRecord[], at: string, newId: () => string): Edit[] {
  const id = newId(), projects = rows(records, "projects");
  return [{ table: "project_board_projects", id, fields: { id, name: required(name, "Project name"), color: ["blue", "green", "purple", "orange", "pink", "sky"][projects.length % 6], position: Math.max(0, ...projects.map(row => numeric(row.data.position))) + 1, created_at: at, deleted_at: null } }, ...["Backlog", "To do", "Doing", "Done"].map((name, index) => { const key = newId(); return { table: "project_board_columns", id: key, fields: { id: key, project_id: id, name, position: index + 1, is_done: index === 3, wip_limit: null, deleted_at: null } }; })];
}
export function deleteProject(id: string, records: SyncRecord[], at: string): Edit[] {
  const project = find(records, "projects", id), tasks = rows(records, "tasks").filter(row => row.data.project_id === id), ids = new Set(tasks.map(row => row.id));
  return [project, ...["columns", "labels", "templates"].flatMap(table => rows(records, table).filter(row => row.data.project_id === id)), ...tasks, ...["task_events", "task_labels", "checklist_items"].flatMap(table => rows(records, table).filter(row => ids.has(text(row.data.task_id))))].map(row => tombstone(row, at));
}
export function saveColumn(original: SyncRecord | null, projectId: string, fields: Fields, records: SyncRecord[], at: string, newId: () => string): Edit[] {
  find(records, "projects", projectId);
  if (original && original.data.project_id !== projectId) throw new Error("The column belongs to another project.");
  fields = { name: required(fields.name, "Column name"), is_done: !!fields.is_done, wip_limit: fields.wip_limit ?? null };
  const id = original?.id ?? newId(), columns = rows(records, "columns").filter(row => row.data.project_id === projectId);
  const edits: Edit[] = [{ table: "project_board_columns", id, fields: original ? fields : { ...fields, id, project_id: projectId, position: Math.max(0, ...columns.map(row => numeric(row.data.position))) + 1, deleted_at: null } }];
  if (original && !!original.data.is_done !== fields.is_done) for (const task of rows(records, "tasks").filter(row => row.data.column_id === id)) edits.push({ table: task.table, id: task.id, fields: { completed_at: fields.is_done ? at : null } });
  return edits;
}
export function deleteColumn(id: string, records: SyncRecord[], at: string): Edit[] {
  const column = find(records, "columns", id), tasks = rows(records, "tasks").filter(row => row.data.column_id === id);
  if (tasks.some(task => !task.data.archived)) throw new Error("Move this column’s cards to another column first.");
  const fallback = ordered(rows(records, "columns")).find(row => row.id !== id && row.data.project_id === column.data.project_id);
  if (!fallback) throw new Error("A board needs at least one column.");
  return [...tasks.map(task => ({ table: task.table, id: task.id, fields: { column_id: fallback.id } })), tombstone(column, at)];
}
export function reorderColumn(id: string, direction: number, records: SyncRecord[]): Edit[] {
  const column = find(records, "columns", id), columns = ordered(rows(records, "columns").filter(row => row.data.project_id === column.data.project_id));
  const other = columns[columns.findIndex(row => row.id === id) + direction];
  if (!other) return [];
  return [{ table: column.table, id, fields: { position: other.data.position } }, { table: other.table, id: other.id, fields: { position: column.data.position } }];
}

export function createCard(columnId: string, title: string, records: SyncRecord[], at: string, newId: () => string, parentId: string | null = null): Edit[] {
  const column = find(records, "columns", columnId); find(records, "projects", text(column.data.project_id));
  if (parentId) {
    const parent = find(records, "tasks", parentId);
    if (parent.data.parent_task_id || parent.data.project_id !== column.data.project_id) throw new Error("Subtasks stay in their parent’s project and can only go one level deep.");
  }
  const id = newId(), name = required(title, "Card title");
  const edits: Edit[] = [{ table: "project_board_tasks", id, fields: { id, project_id: column.data.project_id, column_id: columnId, parent_task_id: parentId, title: name, description: "", position: Math.max(0, ...rows(records, "tasks").filter(row => !row.data.archived && row.data.column_id === columnId).map(row => numeric(row.data.position))) + 1, priority: 0, start_date: null, due_date: null, estimate: null, recurrence: null, created_at: at, completed_at: column.data.is_done ? at : null, archived: false, deleted_at: null } }, boardEvent(id, "created", `Created in ${column.data.name}`, at, newId)];
  if (parentId) edits.push(boardEvent(parentId, "subtask", `Added sub-task "${name}"`, at, newId));
  return edits;
}
export function updateCard(original: SyncRecord, fields: Fields, columnId: string, records: SyncRecord[], at: string, newId: () => string): Edit[] {
  find(records, "tasks", original.id);
  const allowed = ["title", "description", "priority", "start_date", "due_date", "estimate", "recurrence"];
  fields = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key)));
  const merged = { ...original.data, ...fields }; merged.title = required(merged.title, "Card title");
  if (merged.start_date && merged.due_date && text(merged.start_date) > text(merged.due_date)) throw new Error("Start date must be on or before the due date.");
  const changed = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== original.data[key]));
  if (fields.title !== undefined) changed.title = merged.title;
  const edits: Edit[] = Object.keys(changed).length ? [{ table: original.table, id: original.id, fields: changed }] : [];
  const log = (kind: string, detail: string) => edits.push(boardEvent(original.id, kind, detail, at, newId));
  if (merged.title !== original.data.title) log("renamed", `Renamed to "${merged.title}"`);
  if (merged.priority !== original.data.priority) log("priority", `Priority set to ${PRIORITIES[numeric(merged.priority)]}`);
  if (merged.due_date !== original.data.due_date) log("due", merged.due_date ? `Due date set to ${merged.due_date}` : "Due date removed");
  if (merged.recurrence !== original.data.recurrence) log("recurrence", merged.recurrence ? `Repeats ${merged.recurrence}` : "No longer repeats");
  if (columnId !== original.data.column_id) edits.push(...moveBoardCard(original.id, columnId, records.map(row => row.table === original.table && row.id === original.id ? { ...row, data: merged } : row), at, newId));
  return coalesceEdits(edits);
}
export function archiveCard(task: SyncRecord, archived: boolean, at: string, newId: () => string): Edit[] {
  return [{ table: task.table, id: task.id, fields: { archived } }, boardEvent(task.id, archived ? "archived" : "restored", "", at, newId)];
}
export function saveCard(original: SyncRecord | null, columnId: string, fields: Fields, parentId: string | null, records: SyncRecord[], at: string, newId: () => string): Edit[] {
  if (original) return updateCard(original, fields, columnId, records, at, newId);
  const edits = createCard(columnId, text(fields.title), records, at, newId, parentId), created = edits[0];
  const row: SyncRecord = { table: created.table, id: created.id, data: created.fields, seq: 0 };
  return coalesceEdits([...edits, ...updateCard(row, fields, columnId, [...records, row], at, newId)]);
}
export function deleteCard(id: string, records: SyncRecord[], at: string): Edit[] {
  const task = find(records, "tasks", id);
  return [tombstone(task, at), ...rows(records, "tasks").filter(row => row.data.parent_task_id === id).map(row => ({ table: row.table, id: row.id, fields: { parent_task_id: null } })), ...["task_labels", "checklist_items", "task_events"].flatMap(table => rows(records, table).filter(row => row.data.task_id === id).map(row => tombstone(row, at)))];
}
export function setCardLabels(taskId: string, labelIds: string[], records: SyncRecord[], at: string, newId: () => string): Edit[] {
  const task = find(records, "tasks", taskId), valid = new Set(rows(records, "labels").filter(row => row.data.project_id === task.data.project_id).map(row => row.id));
  if (labelIds.some(id => !valid.has(id))) throw new Error("Choose labels from this project.");
  const current = rows(records, "task_labels").filter(row => row.data.task_id === taskId), existing = new Set(current.map(row => text(row.data.label_id)));
  return [...current.filter(row => !labelIds.includes(text(row.data.label_id))).map(row => tombstone(row, at)), ...[...new Set(labelIds)].filter(id => !existing.has(id)).map(label => { const id = newId(); return { table: "project_board_task_labels", id, fields: { id, task_id: taskId, label_id: label, deleted_at: null } }; })];
}
export function deleteLabel(id: string, records: SyncRecord[], at: string): Edit[] {
  return [find(records, "labels", id), ...rows(records, "task_labels").filter(row => row.data.label_id === id)].map(row => tombstone(row, at));
}
export function addChecklist(taskId: string, value: string, records: SyncRecord[], newId: () => string): Edit {
  find(records, "tasks", taskId); const id = newId();
  return { table: "project_board_checklist_items", id, fields: { id, task_id: taskId, text: required(value, "Checklist item"), done: false, position: Math.max(0, ...rows(records, "checklist_items").filter(row => row.data.task_id === taskId).map(row => numeric(row.data.position))) + 1, deleted_at: null } };
}
export function checklistToCard(itemId: string, records: SyncRecord[], at: string, newId: () => string): Edit[] {
  const item = find(records, "checklist_items", itemId), task = find(records, "tasks", text(item.data.task_id));
  const done = rows(records, "columns").find(row => row.data.project_id === task.data.project_id && row.data.is_done);
  return [...createCard(item.data.done && done ? done.id : text(task.data.column_id), text(item.data.text), records, at, newId, task.id), tombstone(item, at)];
}
function jsonStrings(value: unknown) { try { const parsed: unknown = JSON.parse(text(value)); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
export function saveTemplate(taskId: string, name: string, records: SyncRecord[], at: string, newId: () => string): Edit {
  const task = find(records, "tasks", taskId), id = newId();
  return { table: "project_board_templates", id, fields: { id, project_id: task.data.project_id, name: required(name, "Template name"), title: task.data.title, description: task.data.description, priority: task.data.priority, estimate: task.data.estimate, recurrence: task.data.recurrence, label_ids: JSON.stringify(rows(records, "task_labels").filter(row => row.data.task_id === taskId).map(row => row.data.label_id)), checklist: JSON.stringify(ordered(rows(records, "checklist_items").filter(row => row.data.task_id === taskId)).map(row => row.data.text)), created_at: at, deleted_at: null } };
}
export function fromTemplate(id: string, columnId: string, records: SyncRecord[], at: string, newId: () => string): Edit[] {
  const template = find(records, "templates", id), column = find(records, "columns", columnId);
  if (template.data.project_id !== column.data.project_id) throw new Error("That template belongs to another project.");
  const edits = createCard(columnId, text(template.data.title), records, at, newId), task = edits[0];
  Object.assign(task.fields, { description: template.data.description, priority: template.data.priority, estimate: template.data.estimate, recurrence: template.data.recurrence });
  const valid = rows(records, "labels").filter(row => row.data.project_id === column.data.project_id).map(row => row.id);
  for (const label of jsonStrings(template.data.label_ids).filter(id => valid.includes(id))) { const key = newId(); edits.push({ table: "project_board_task_labels", id: key, fields: { id: key, task_id: task.id, label_id: label, deleted_at: null } }); }
  jsonStrings(template.data.checklist).forEach((value, index) => { const key = newId(); edits.push({ table: "project_board_checklist_items", id: key, fields: { id: key, task_id: task.id, text: value, done: false, position: index + 1, deleted_at: null } }); });
  edits.push(boardEvent(task.id, "template", `Created from template "${template.data.name}"`, at, newId));
  return edits;
}
export function boardInsights(projectId: string, records: SyncRecord[], today = localDay()) {
  const tasks = rows(records, "tasks").filter(row => row.data.project_id === projectId), open = tasks.filter(row => !row.data.archived && !row.data.completed_at);
  const date = (value: unknown) => value && Number.isFinite(Date.parse(text(value))) ? localDay(new Date(text(value))) : "9999-99-99";
  const cycles = tasks.filter(row => row.data.completed_at).map(row => Math.max(0, (Date.parse(text(row.data.completed_at)) - Date.parse(text(row.data.created_at))) / 86400000)).filter(Number.isFinite);
  return { open: open.length, overdue: open.filter(row => row.data.due_date && text(row.data.due_date) < today).length, avgCycle: cycles.length ? cycles.reduce((sum, days) => sum + days, 0) / cycles.length : null, created: tasks.filter(row => date(row.data.created_at) > shiftDay(today, -7) && date(row.data.created_at) <= today).length, completed: tasks.filter(row => date(row.data.completed_at) > shiftDay(today, -7) && date(row.data.completed_at) <= today).length, weeks: Array.from({ length: 8 }, (_, index) => { const start = shiftDay(weekStart(today), (index - 7) * 7); return { start, done: tasks.filter(row => date(row.data.completed_at) >= start && date(row.data.completed_at) < shiftDay(start, 7) && date(row.data.completed_at) <= today).length }; }), days: Array.from({ length: 30 }, (_, index) => { const day = shiftDay(today, index - 29); return { day, total: tasks.filter(row => date(row.data.created_at) <= day).length, done: tasks.filter(row => date(row.data.completed_at) <= day).length }; }) };
}
