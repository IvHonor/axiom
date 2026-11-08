// Project Board on the web: the desktop's board_* commands over the synced
// rows, using the web board rules (site/src/lib/terminal/board.ts) for
// columns, cards, sub-tasks, checklists, labels, templates, recurrence and
// history. Mirrors src-tauri/src/features/project_board/service.rs.
// Shared boards (the role-checked spaces API) are the desktop's for now.
import {
  addChecklist, archiveCard, checklistToCard, createCard, createProject, deleteCard, deleteColumn, deleteLabel, deleteProject,
  fromTemplate, numeric, ordered, reorderColumn, required, saveColumn, saveTemplate, setCardLabels, text, updateCard, BOARD_COLORS, PRIORITIES,
} from "../../../site/src/lib/terminal/board";
import { moveBoardCard } from "../../../site/src/lib/terminal/boardPlanner";
import { localDay, shiftDay, weekStart } from "../../../site/src/lib/terminal/planner";
import type { SyncRecord } from "../../../site/src/lib/terminal/protocol";
import { newId, rowsOf, save, snapshot, type Edit } from "../runtime";
import type { Handlers } from "./types";

const T = (name: string) => `project_board_${name}`;
const nullable = (v: unknown) => (v === undefined || v === "" ? null : (v as string | number | null));
const now = () => new Date().toISOString();

const projectView = (r: SyncRecord) => ({ id: r.id, name: text(r.data.name), color: text(r.data.color), position: numeric(r.data.position), createdAt: text(r.data.created_at) });
const columnView = (r: SyncRecord) => ({ id: r.id, projectId: text(r.data.project_id), name: text(r.data.name), position: numeric(r.data.position), isDone: !!r.data.is_done, wipLimit: (r.data.wip_limit as number | null) ?? null });
const taskView = (r: SyncRecord) => ({
  id: r.id, projectId: text(r.data.project_id), columnId: text(r.data.column_id), parentTaskId: nullable(r.data.parent_task_id) as string | null,
  title: text(r.data.title), description: text(r.data.description), position: numeric(r.data.position), priority: numeric(r.data.priority),
  startDate: nullable(r.data.start_date), dueDate: nullable(r.data.due_date), estimate: (r.data.estimate as number | null) ?? null,
  recurrence: nullable(r.data.recurrence), createdAt: text(r.data.created_at), updatedAt: text(r.data.updated_at), completedAt: nullable(r.data.completed_at),
  archived: !!r.data.archived,
});
const labelView = (r: SyncRecord) => ({ id: r.id, projectId: text(r.data.project_id), name: text(r.data.name), color: text(r.data.color) });
const itemView = (r: SyncRecord) => ({ id: r.id, taskId: text(r.data.task_id), text: text(r.data.text), done: !!r.data.done, position: numeric(r.data.position) });
const eventView = (r: SyncRecord) => ({ id: r.id, taskId: text(r.data.task_id), kind: text(r.data.kind), detail: text(r.data.detail), createdAt: text(r.data.created_at) });
const templateView = (r: SyncRecord) => ({
  id: r.id, projectId: text(r.data.project_id), name: text(r.data.name), title: text(r.data.title), description: text(r.data.description),
  priority: numeric(r.data.priority), estimate: (r.data.estimate as number | null) ?? null, recurrence: nullable(r.data.recurrence), createdAt: text(r.data.created_at),
});
const byId = (a: SyncRecord, b: SyncRecord) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function find(records: SyncRecord[], table: string, id: unknown) {
  const row = rowsOf(records, T(table)).find((r) => r.id === id);
  if (!row) throw new Error("This item is no longer available. Sync and try again.");
  return row;
}

function cardView(records: SyncRecord[], r: SyncRecord) {
  const tasks = rowsOf(records, T("tasks"));
  const items = rowsOf(records, T("checklist_items")).filter((i) => i.data.task_id === r.id);
  const subtasks = tasks.filter((t) => t.data.parent_task_id === r.id && !t.data.archived);
  const parent = r.data.parent_task_id ? tasks.find((t) => t.id === r.data.parent_task_id) : undefined;
  return {
    ...taskView(r),
    labelIds: rowsOf(records, T("task_labels")).filter((l) => l.data.task_id === r.id).map((l) => text(l.data.label_id)).sort(),
    checklistDone: items.filter((i) => i.data.done).length,
    checklistTotal: items.length,
    subtaskDone: subtasks.filter((t) => t.data.completed_at).length,
    subtaskTotal: subtasks.length,
    parentTitle: parent ? text(parent.data.title) : null,
  };
}

function detail(records: SyncRecord[], id: unknown) {
  const r = find(records, "tasks", id);
  const parent = r.data.parent_task_id ? rowsOf(records, T("tasks")).find((t) => t.id === r.data.parent_task_id) : undefined;
  return {
    ...taskView(r),
    labelIds: rowsOf(records, T("task_labels")).filter((l) => l.data.task_id === r.id).map((l) => text(l.data.label_id)).sort(),
    checklist: ordered(rowsOf(records, T("checklist_items")).filter((i) => i.data.task_id === r.id)).map(itemView),
    events: rowsOf(records, T("task_events")).filter((e) => e.data.task_id === r.id).sort(byId).reverse().map(eventView),
    subtasks: rowsOf(records, T("tasks"))
      .filter((t) => t.data.parent_task_id === r.id && !t.data.archived)
      .sort((a, b) => text(a.data.created_at).localeCompare(text(b.data.created_at)))
      .map(taskView),
    parent: parent ? { id: parent.id, title: text(parent.data.title) } : null,
  };
}

/** Saves, then answers from the data as it now is. */
async function apply<T>(edits: Edit[], answer: (records: SyncRecord[]) => T): Promise<T> {
  await save(edits);
  return answer((await snapshot()).records);
}
const created = (edits: Edit[], table: string) => edits.find((e) => e.table === T(table))!.id;
const columnsOf = (records: SyncRecord[], projectId: string) => ordered(rowsOf(records, T("columns")).filter((c) => c.data.project_id === projectId));

function insights(records: SyncRecord[], projectId: string) {
  find(records, "projects", projectId);
  const today = localDay();
  const tasks = rowsOf(records, T("tasks")).filter((t) => t.data.project_id === projectId);
  const day = (v: unknown) => (v ? localDay(new Date(text(v))) : null);
  const open = tasks.filter((t) => !t.data.archived && !t.data.completed_at);
  const cycles = tasks.filter((t) => t.data.completed_at).map((t) => (Date.parse(text(t.data.completed_at)) - Date.parse(text(t.data.created_at))) / 86_400_000);
  const weekAgo = shiftDay(today, -7);
  const openLinks = rowsOf(records, T("task_labels")).filter((l) => open.some((t) => t.id === l.data.task_id));
  return {
    burnup: Array.from({ length: 30 }, (_, i) => {
      const date = shiftDay(today, i - 29);
      return { date, total: tasks.filter((t) => day(t.data.created_at)! <= date).length, done: tasks.filter((t) => (day(t.data.completed_at) ?? "9999") <= date).length };
    }),
    throughput: Array.from({ length: 8 }, (_, i) => {
      const start = shiftDay(weekStart(today), (i - 7) * 7), end = shiftDay(start, 7);
      return { weekStart: start, done: tasks.filter((t) => { const d = day(t.data.completed_at); return !!d && d >= start && d < end; }).length };
    }),
    openByColumn: columnsOf(records, projectId).filter((c) => !c.data.is_done).map((c) => ({ name: text(c.data.name), count: open.filter((t) => t.data.column_id === c.id).length })),
    openByPriority: [3, 2, 1, 0].map((p) => ({ name: PRIORITIES[p], count: open.filter((t) => numeric(t.data.priority) === p).length })),
    openByLabel: rowsOf(records, T("labels")).filter((l) => l.data.project_id === projectId).map((l) => ({ name: text(l.data.name), color: text(l.data.color), count: openLinks.filter((x) => x.data.label_id === l.id).length })),
    avgCycleDays: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null,
    open: open.length,
    overdue: open.filter((t) => t.data.due_date && text(t.data.due_date) < today).length,
    createdLast7: tasks.filter((t) => day(t.data.created_at)! > weekAgo).length,
    completedLast7: tasks.filter((t) => (day(t.data.completed_at) ?? "") > weekAgo).length,
  };
}

const SHARING_ON_DESKTOP = "Sharing boards from the web isn't ready yet. Share it from the Axiom desktop app; your personal boards sync here as usual.";

export const board: Handlers = {
  board_list_projects: async () => ordered(rowsOf((await snapshot()).records, T("projects"))).map(projectView),
  async board_create_project({ name }) {
    const edits = createProject(String(name), (await snapshot()).records, now(), newId);
    return apply(edits, (r) => projectView(find(r, "projects", created(edits, "projects"))));
  },
  async board_rename_project({ id, name }) {
    const records = (await snapshot()).records;
    find(records, "projects", id);
    return apply([{ table: T("projects"), id, fields: { name: required(name, "Project name") } }], (r) => projectView(find(r, "projects", id)));
  },
  board_delete_project: async ({ id }) => save(deleteProject(id, (await snapshot()).records, now())),

  async board_get({ projectId }) {
    const records = (await snapshot()).records;
    const project = find(records, "projects", projectId);
    return {
      project: projectView(project),
      columns: columnsOf(records, projectId).map(columnView),
      tasks: ordered(rowsOf(records, T("tasks")).filter((t) => t.data.project_id === projectId && !t.data.archived)).map((t) => cardView(records, t)),
      labels: rowsOf(records, T("labels")).filter((l) => l.data.project_id === projectId).sort(byId).map(labelView),
      templates: rowsOf(records, T("templates")).filter((t) => t.data.project_id === projectId).sort((a, b) => text(a.data.name).localeCompare(text(b.data.name))).map(templateView),
    };
  },
  async board_create_column({ projectId, name }) {
    const edits = saveColumn(null, projectId, { name, is_done: false, wip_limit: null }, (await snapshot()).records, now(), newId);
    return apply(edits, (r) => columnView(find(r, "columns", created(edits, "columns"))));
  },
  async board_update_column({ id, fields }) {
    const records = (await snapshot()).records, column = find(records, "columns", id);
    const edits = saveColumn(column, text(column.data.project_id), { name: fields.name, is_done: !!fields.isDone, wip_limit: fields.wipLimit ?? null }, records, now(), newId);
    return apply(edits, (r) => columnView(find(r, "columns", id)));
  },
  async board_move_column({ id, direction }) {
    const records = (await snapshot()).records, column = find(records, "columns", id);
    return apply(reorderColumn(id, Number(direction), records), (r) => columnsOf(r, text(column.data.project_id)).map(columnView));
  },
  board_delete_column: async ({ id }) => save(deleteColumn(id, (await snapshot()).records, now())),

  async board_create_task({ columnId, title }) {
    const edits = createCard(columnId, String(title), (await snapshot()).records, now(), newId);
    return apply(edits, (r) => cardView(r, find(r, "tasks", edits[0].id)));
  },
  async board_create_subtask({ parentId, title }) {
    const records = (await snapshot()).records, parent = find(records, "tasks", parentId);
    const edits = createCard(text(parent.data.column_id), String(title), records, now(), newId, parentId);
    return apply(edits, (r) => cardView(r, find(r, "tasks", edits[0].id)));
  },
  async board_convert_checklist_item({ id }) {
    const edits = checklistToCard(id, (await snapshot()).records, now(), newId);
    return apply(edits, (r) => cardView(r, find(r, "tasks", edits[0].id)));
  },
  async board_list_archived({ projectId }) {
    const records = (await snapshot()).records;
    find(records, "projects", projectId);
    return rowsOf(records, T("tasks"))
      .filter((t) => t.data.project_id === projectId && t.data.archived)
      .sort((a, b) => text(b.data.updated_at).localeCompare(text(a.data.updated_at)))
      .map((t) => cardView(records, t));
  },
  board_get_task: async ({ id }) => detail((await snapshot()).records, id),
  async board_update_task({ id, fields }) {
    const records = (await snapshot()).records, task = find(records, "tasks", id);
    const snake = { title: fields.title, description: fields.description ?? "", priority: Number(fields.priority) || 0, start_date: fields.startDate ?? null, due_date: fields.dueDate ?? null, estimate: fields.estimate ?? null, recurrence: fields.recurrence ?? null };
    return apply(updateCard(task, snake, text(task.data.column_id), records, now(), newId), (r) => detail(r, id));
  },
  async board_move_task({ id, columnId, beforeId }) {
    return apply(moveBoardCard(id, columnId, (await snapshot()).records, now(), newId, beforeId ?? null), (r) => taskView(find(r, "tasks", id)));
  },
  async board_archive_task({ id, archived }) {
    const task = find((await snapshot()).records, "tasks", id);
    return apply(archiveCard(task, !!archived, now(), newId), (r) => taskView(find(r, "tasks", id)));
  },
  board_delete_task: async ({ id }) => save(deleteCard(id, (await snapshot()).records, now())),

  async board_create_label({ projectId, name, color }) {
    find((await snapshot()).records, "projects", projectId);
    if (!BOARD_COLORS.includes(color)) throw "Choose one of the label colours.";
    const id = newId();
    return apply([{ table: T("labels"), id, fields: { id, project_id: projectId, name: String(name ?? "").trim(), color, deleted_at: null } }], (r) => labelView(find(r, "labels", id)));
  },
  async board_update_label({ id, name, color }) {
    find((await snapshot()).records, "labels", id);
    if (!BOARD_COLORS.includes(color)) throw "Choose one of the label colours.";
    return apply([{ table: T("labels"), id, fields: { name: String(name ?? "").trim(), color } }], (r) => labelView(find(r, "labels", id)));
  },
  board_delete_label: async ({ id }) => save(deleteLabel(id, (await snapshot()).records, now())),
  async board_set_task_labels({ taskId, labelIds }) {
    const records = (await snapshot()).records, task = find(records, "tasks", taskId);
    const valid = new Set(rowsOf(records, T("labels")).filter((l) => l.data.project_id === task.data.project_id).map((l) => l.id));
    const kept = [...new Set<string>(labelIds)].filter((l) => valid.has(l)).sort();
    await save(setCardLabels(taskId, kept, records, now(), newId));
    return kept;
  },

  async board_add_checklist_item({ taskId, text: value }) {
    const edit = addChecklist(taskId, String(value), (await snapshot()).records, newId);
    return apply([edit], (r) => itemView(find(r, "checklist_items", edit.id)));
  },
  async board_update_checklist_item({ id, text: value, done }) {
    find((await snapshot()).records, "checklist_items", id);
    return apply([{ table: T("checklist_items"), id, fields: { text: required(value, "Checklist item"), done: !!done } }], (r) => itemView(find(r, "checklist_items", id)));
  },
  async board_delete_checklist_item({ id }) {
    const item = rowsOf((await snapshot()).records, T("checklist_items")).find((i) => i.id === id);
    if (item) await save([{ table: item.table, id, fields: { deleted_at: now() } }]);
  },

  async board_summary() {
    const records = (await snapshot()).records, today = localDay(), week = shiftDay(today, 7);
    const projects = ordered(rowsOf(records, T("projects")));
    const tasks = rowsOf(records, T("tasks")).filter((t) => !t.data.archived);
    const open = (t: SyncRecord) => !t.data.completed_at;
    return {
      today,
      projects: projects.map((p) => {
        const own = tasks.filter((t) => t.data.project_id === p.id);
        return {
          id: p.id, name: text(p.data.name), color: text(p.data.color), total: own.length, done: own.filter((t) => !open(t)).length,
          overdue: own.filter((t) => open(t) && t.data.due_date && text(t.data.due_date) < today).length,
          columns: columnsOf(records, p.id).map((c) => ({ name: text(c.data.name), count: own.filter((t) => t.data.column_id === c.id).length, isDone: !!c.data.is_done })),
        };
      }),
      dueSoon: tasks
        .filter((t) => open(t) && t.data.due_date && text(t.data.due_date) <= week)
        .sort((a, b) => text(a.data.due_date).localeCompare(text(b.data.due_date)))
        .slice(0, 8)
        .map((t) => ({ id: t.id, projectId: text(t.data.project_id), projectName: text(projects.find((p) => p.id === t.data.project_id)?.data.name), title: text(t.data.title), dueDate: text(t.data.due_date) })),
    };
  },

  async board_save_template({ taskId, name }) {
    const edit = saveTemplate(taskId, String(name), (await snapshot()).records, now(), newId);
    return apply([edit], (r) => templateView(find(r, "templates", edit.id)));
  },
  async board_delete_template({ id }) {
    const template = rowsOf((await snapshot()).records, T("templates")).find((t) => t.id === id);
    if (template) await save([{ table: template.table, id, fields: { deleted_at: now() } }]);
  },
  async board_create_from_template({ templateId, columnId }) {
    const edits = fromTemplate(templateId, columnId, (await snapshot()).records, now(), newId);
    return apply(edits, (r) => cardView(r, find(r, "tasks", edits[0].id)));
  },
  async board_activity({ projectId }) {
    const records = (await snapshot()).records;
    find(records, "projects", projectId);
    const tasks = rowsOf(records, T("tasks")).filter((t) => t.data.project_id === projectId);
    return rowsOf(records, T("task_events"))
      .filter((e) => tasks.some((t) => t.id === e.data.task_id))
      .sort(byId)
      .reverse()
      .slice(0, 100)
      .map((e) => ({ ...eventView(e), taskTitle: text(tasks.find((t) => t.id === e.data.task_id)?.data.title) }));
  },
  board_insights: async ({ projectId }) => insights((await snapshot()).records, projectId),

  // Shared boards: what's shared with you, and invitations, come from the
  // spaces API, which the web doesn't speak yet.
  board_shared_boards: () => [],
  board_invitations: () => [],
  board_members: () => Promise.reject(SHARING_ON_DESKTOP),
  board_share: () => Promise.reject(SHARING_ON_DESKTOP),
  board_stop_sharing: () => Promise.reject(SHARING_ON_DESKTOP),
  board_invite: () => Promise.reject(SHARING_ON_DESKTOP),
  board_withdraw_invite: () => Promise.reject(SHARING_ON_DESKTOP),
  board_set_role: () => Promise.reject(SHARING_ON_DESKTOP),
  board_remove_member: () => Promise.reject(SHARING_ON_DESKTOP),
  board_leave: () => Promise.reject(SHARING_ON_DESKTOP),
  board_accept_invite: () => Promise.reject(SHARING_ON_DESKTOP),
  board_decline_invite: () => Promise.reject(SHARING_ON_DESKTOP),
};
