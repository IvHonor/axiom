import { localDay, shiftDay, taskEdit, toggleTask, type Edit, type PlanTask } from "./planner.ts";
import type { Fields, SyncRecord } from "./protocol";

const text = (value: unknown) => typeof value === "string" ? value : "";
const live = (records: SyncRecord[], table: string) => records.filter(row => row.table === table && !row.data.deleted_at);
export function plannerCards(records: SyncRecord[]) {
  const projects = live(records, "project_board_projects"), columns = live(records, "project_board_columns");
  return live(records, "project_board_tasks").filter(card => !card.data.archived).flatMap(card => {
    const project = projects.find(row => row.id === card.data.project_id), own = columns.filter(row => row.data.project_id === card.data.project_id).sort((a, b) => Number(a.data.position) - Number(b.data.position));
    const column = own.find(row => row.id === card.data.column_id);
    if (!project || !column) return [];
    return [{ id: card.id, title: text(card.data.title), projectName: text(project.data.name), color: text(project.data.color), column: text(column.data.name), done: !!column.data.is_done, due: text(card.data.due_date) || null, estimate: Number(card.data.estimate) > 0 ? Math.min(1440, Math.round(Number(card.data.estimate) * 60)) : null, inProgress: own.length > 1 && !column.data.is_done && own.findLast(row => !row.data.is_done)?.id === column.id }];
  });
}
export function planCard(id: string, day: string | null, tasks: PlanTask[], records: SyncRecord[], at: string, newId: string): Edit[] {
  const original = tasks.find(task => task.board_task_id === id && !task.done_at);
  if (original) return original.day === day ? [] : taskEdit(original, { day, focus_rank: null }, tasks, records, newId, at);
  const card = plannerCards(records).find(card => card.id === id);
  if (!card || card.done) throw new Error("That card is no longer available to plan. Sync and try again.");
  const edits = taskEdit(null, { title: card.title, notes: "", day, estimate_minutes: card.estimate, due_date: null, focus_rank: null }, tasks, records, newId, at);
  edits.at(-1)!.fields.board_task_id = id;
  return edits;
}

export function nextCardDate(day: string, rule: string): string {
  if (rule === "daily") return shiftDay(day, 1);
  if (rule === "weekly") return shiftDay(day, 7);
  if (rule === "weekdays") { let next = shiftDay(day, 1); while ([0, 6].includes(new Date(next + "T12:00:00").getDay())) next = shiftDay(next, 1); return next; }
  const date = new Date(day + "T12:00:00"), wanted = date.getDate(); date.setDate(1);
  date.setMonth(date.getMonth() + (rule === "monthly" ? 1 : 12));
  const end = new Date(date); end.setMonth(end.getMonth() + 1); end.setDate(0); date.setDate(Math.min(wanted, end.getDate()));
  return localDay(date);
}

/** Personal boards use account sync. Shared boards must use the separate role-checked spaces API. */
export function completePlannerTask(task: PlanTask, records: SyncRecord[], allRecords: SyncRecord[], at: string, newId: () => string): Edit[] {
  const result = toggleTask({ ...task, board_task_id: null }, at);
  if (!task.board_task_id) return result;
  const card = allRecords.find(row => row.table === "project_board_tasks" && row.id === task.board_task_id);
  if (card?.data.deleted_at) return result;
  if (!card) throw new Error("This linked card is not in your personal board cache. Complete shared-board cards in the desktop app until web shared boards are connected.");
  const columns = live(records, "project_board_columns").filter(row => row.data.project_id === card.data.project_id).sort((a, b) => Number(a.data.position) - Number(b.data.position));
  const from = columns.find(row => row.id === card.data.column_id), done = !task.done_at;
  if (!from) throw new Error("Sync the linked board before completing this task.");
  if (!!from.data.is_done === done) return result;
  const target = done ? columns.find(row => row.data.is_done) : columns.findLast(row => !row.data.is_done);
  if (!target && done) throw new Error("That card’s project has no Done column.");
  if (!target) return result;
  return [...result, ...moveBoardCard(card.id, target.id, records, at, newId)];
}

/** Board and planner moves share completion, recurrence and history side effects. */
export function moveBoardCard(id: string, targetId: string, records: SyncRecord[], at: string, newId: () => string, beforeId: string | null = null): Edit[] {
  const card = live(records, "project_board_tasks").find(row => row.id === id);
  if (!card) throw new Error("That card is no longer available. Sync and try again.");
  const columns = live(records, "project_board_columns").filter(row => row.data.project_id === card.data.project_id).sort((a, b) => Number(a.data.position) - Number(b.data.position));
  const from = columns.find(row => row.id === card.data.column_id), target = columns.find(row => row.id === targetId);
  if (!from || !target) throw new Error("Cards can only move within their own project.");
  if (beforeId === id) return [];
  const siblings = live(records, "project_board_tasks").filter(row => row.id !== id && !row.data.archived && row.data.column_id === target.id).sort((a, b) => Number(a.data.position) - Number(b.data.position));
  const index = beforeId ? siblings.findIndex(row => row.id === beforeId) : siblings.length;
  if (index < 0) throw new Error("The card you are moving before is no longer in that column.");
  const after = Number(siblings[index]?.data.position ?? Number(siblings.at(-1)?.data.position ?? 0) + 2), before = Number(siblings[index - 1]?.data.position ?? after - 2);
  let position = (before + after) / 2;
  const result: Edit[] = [];
  if (!(position > before && position < after)) {
    siblings.forEach((row, i) => result.push({ table: row.table, id: row.id, fields: { position: i < index ? i + 1 : i + 2 } }));
    position = index + 1;
  }
  const fields: Fields = { column_id: target.id, position };
  if (from.id === target.id) return [...result, { table: card.table, id, fields }];
  const done = !!target.data.is_done;
  const log = (id: string, kind: string, detail: string) => { const key = newId(); result.push({ table: "project_board_task_events", id: key, fields: { id: key, task_id: id, kind, detail, created_at: at, deleted_at: null } }); };
  log(card.id, "moved", `${from.data.name} → ${target.data.name}`);
  if (done && !card.data.completed_at) {
    fields.completed_at = at;
    log(card.id, "completed", "Completed");
    if (card.data.recurrence) {
      const id = newId(), rule = text(card.data.recurrence), base = text(card.data.due_date) || text(card.data.start_date) || localDay(new Date(at)), next = nextCardDate(base, rule), offset = Math.round((Date.parse(next) - Date.parse(base)) / 86400000);
      const copy: Fields = { id, project_id: card.data.project_id, column_id: from.id, parent_task_id: null, title: card.data.title, description: card.data.description, position: Math.max(0, ...live(records, "project_board_tasks").filter(row => !row.data.archived && row.data.column_id === from.id).map(row => Number(row.data.position))) + 1, priority: card.data.priority, estimate: card.data.estimate, recurrence: rule, start_date: card.data.start_date ? shiftDay(text(card.data.start_date), offset) : null, due_date: card.data.due_date ? shiftDay(text(card.data.due_date), offset) : next, created_at: at, completed_at: null, archived: false, deleted_at: null };
      result.push({ table: card.table, id, fields: copy });
      for (const table of ["project_board_task_labels", "project_board_checklist_items"]) {
        live(records, table).filter(row => row.data.task_id === card.id).sort((a, b) => Number(a.data.position ?? 0) - Number(b.data.position ?? 0)).forEach((row, index) => {
          const key = newId(); result.push({ table, id: key, fields: table.endsWith("task_labels") ? { id: key, task_id: id, label_id: row.data.label_id, deleted_at: null } : { id: key, task_id: id, text: row.data.text, done: false, position: index + 1, deleted_at: null } });
        });
      }
      log(id, "created", `Created in ${from.data.name}`); log(id, "recurrence", `Repeats ${rule}`); log(card.id, "recurrence", `Next occurrence created, due ${copy.due_date}`); fields.recurrence = null;
    }
  } else if (!done && card.data.completed_at) { fields.completed_at = null; log(card.id, "reopened", "Reopened"); }
  result.push({ table: card.table, id: card.id, fields });
  return result;
}
