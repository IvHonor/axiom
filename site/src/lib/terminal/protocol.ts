/** The desktop sync wire format uses SQLite column names, not the UI's camelCase. */
export type Fields = Record<string, string | number | boolean | null>;
export interface SyncRecord { table: string; id: string; data: Fields; seq: number }
export interface Change { table: string; id: string; fields: Fields; changed_at: number }
export interface Pull { records: SyncRecord[]; cursor: number; more: boolean }
export interface Pending extends Change { operation: string }

/** One operation per row preserves the caller's field order within an atomic save. */
export function coalesceEdits(edits: { table: string; id: string; fields: Fields }[]) {
  const rows = new Map<string, { table: string; id: string; fields: Fields }>();
  for (const edit of edits) {
    const key = `${edit.table}/${edit.id}`, previous = rows.get(key);
    rows.set(key, { ...edit, fields: { ...previous?.fields, ...edit.fields } });
  }
  return [...rows.values()];
}

const text = (value: unknown) => typeof value === "string" && value.length <= 10_000;
const title = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 500;
const nullable = (check: (value: unknown) => boolean) => (value: unknown) => value === null || check(value);
const integer = (min: number, max: number) => (value: unknown) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
export const validDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const id = (value: unknown) => typeof value === "string" && /^[\w-]{1,64}$/.test(value);
const common = { id, updated_at: timestamp, deleted_at: nullable(timestamp) };
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const boolean = (value: unknown) => typeof value === "boolean";
const color = (value: unknown) => typeof value === "string" && /^[\w#-]{1,32}$/.test(value);
const jsonList = (check: (value: unknown) => boolean) => (value: unknown) => {
  try { const list: unknown = typeof value === "string" ? JSON.parse(value) : null; return Array.isArray(list) && list.length <= 500 && list.every(check); } catch { return false; }
};

/** Only ported tables can be written. In particular, encrypted tables never accept plaintext. */
const schemas: Record<string, Record<string, (value: unknown) => boolean>> = {
  daily_plan_tasks: { ...common, title, notes: text, day: nullable(validDay), position: value => typeof value === "number" && Number.isFinite(value), estimate_minutes: nullable(integer(1, 1440)), focus_rank: nullable(integer(1, 3)), done_at: nullable(timestamp), board_task_id: nullable(id), created_at: timestamp, actual_minutes: integer(0, 10_000_000), timer_started_at: nullable(timestamp), due_date: nullable(validDay) },
  daily_plan_blocks: { ...common, day: validDay, title: text, start_minute: integer(0, 1439), duration_minutes: integer(5, 1440), color: value => typeof value === "string" && /^[\w#-]{1,32}$/.test(value), task_id: nullable(id), routine_id: nullable(id), created_at: timestamp },
  daily_plan_days: { ...common, intention: text, went_well: text, do_better: text, planned_at: nullable(timestamp), shutdown_at: nullable(timestamp) },
  daily_plan_settings: { ...common, day_start_minute: integer(0, 1439), day_end_minute: integer(1, 1440), buffer_percent: integer(0, 60) },
  daily_plan_routines: { ...common, title, start_minute: integer(0, 1439), duration_minutes: integer(5, 1440), color: value => typeof value === "string" && /^[\w#-]{1,32}$/.test(value), weekdays: integer(1, 127), created_at: timestamp },
  web_plan_calendars: { ...common, name: title, source: value => typeof value === "string" && (value === "" || value.includes("BEGIN:VCALENDAR")), parts: text, feed_url: nullable(value => typeof value === "string" && value.length <= 4096 && /^https:\/\//.test(value)), refreshed_at: nullable(timestamp), problem: nullable(text), color: value => typeof value === "string" && /^[\w#-]{1,32}$/.test(value), shown: value => typeof value === "boolean", created_at: timestamp },
  web_plan_calendar_chunks: { ...common, calendar_id: id, content: value => typeof value === "string" && value.length <= 8000 },
  project_board_projects: { ...common, name: title, color, position: finite, created_at: timestamp },
  project_board_columns: { ...common, project_id: id, name: title, position: finite, is_done: boolean, wip_limit: nullable(integer(1, 1000000)) },
  project_board_labels: { ...common, project_id: id, name: text, color: value => ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "gray"].includes(String(value)) },
  project_board_templates: { ...common, project_id: id, name: title, title, description: text, priority: integer(0, 3), estimate: nullable(value => finite(value) && Number(value) >= 0), recurrence: nullable(value => ["daily", "weekdays", "weekly", "monthly", "yearly"].includes(String(value))), label_ids: jsonList(id), checklist: jsonList(text), created_at: timestamp },
  project_board_tasks: { ...common, project_id: id, column_id: id, parent_task_id: nullable(id), title, description: text, position: finite, priority: integer(0, 3), start_date: nullable(validDay), due_date: nullable(validDay), estimate: nullable(value => finite(value) && Number(value) >= 0), recurrence: nullable(value => ["daily", "weekdays", "weekly", "monthly", "yearly"].includes(String(value))), created_at: timestamp, completed_at: nullable(timestamp), archived: boolean },
  project_board_task_events: { ...common, task_id: id, kind: title, detail: text, created_at: timestamp },
  project_board_task_labels: { ...common, task_id: id, label_id: id },
  project_board_checklist_items: { ...common, task_id: id, text, done: boolean, position: finite },
};

export const writableTable = (table: string) => Object.hasOwn(schemas, table);
export const readableTable = writableTable;

export function validateChanges(value: unknown): Change[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("Send between 1 and 100 changes.");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid change.");
    const { table, id: rowId, fields, changed_at } = item as Change;
    if (typeof table !== "string" || !writableTable(table) || !id(rowId)) throw new Error("This area is not ready for web editing.");
    if (!Number.isSafeInteger(changed_at) || changed_at < 0 || changed_at > Date.now() + 300_000) throw new Error("Check your device's clock and try again.");
    if (!fields || typeof fields !== "object" || Array.isArray(fields) || !Object.keys(fields).length) throw new Error("No fields to save.");
    if (new TextEncoder().encode(JSON.stringify(fields)).length > 64 * 1024) throw new Error("One of your items is too large to sync. Shorten its contents and try again.");
    if (fields.id !== undefined && fields.id !== rowId) throw new Error("The item ID does not match.");
    for (const [field, fieldValue] of Object.entries(fields)) {
      if (!Object.hasOwn(schemas[table], field) || !schemas[table][field](fieldValue)) throw new Error(`Invalid ${field.replaceAll("_", " ")}.`);
    }
    if (table === "daily_plan_days" && !validDay(rowId)) throw new Error("Invalid day.");
    if (table === "daily_plan_settings" && rowId !== "settings") throw new Error("Invalid settings.");
    if (typeof fields.start_minute === "number" && typeof fields.duration_minutes === "number" && fields.start_minute + fields.duration_minutes > 1440) throw new Error("Time blocks must end within the day.");
    if (typeof fields.day_start_minute === "number" && typeof fields.day_end_minute === "number" && fields.day_end_minute - fields.day_start_minute < 60) throw new Error("Your working day must be at least an hour long.");
    if (typeof fields.start_date === "string" && typeof fields.due_date === "string" && fields.start_date > fields.due_date) throw new Error("Start date must be on or before the due date.");
    return { table, id: rowId, fields, changed_at };
  });
}

/** Merge pending field edits onto server rows, preserving fields edited on another device. */
export function visibleRecords(records: SyncRecord[], pending: Pending[], includeDeleted = false): SyncRecord[] {
  const merged = new Map(records.map(row => [`${row.table}/${row.id}`, { ...row, data: { ...row.data } }]));
  for (const change of [...pending].sort((a, b) => a.changed_at - b.changed_at || a.operation.localeCompare(b.operation))) {
    const key = `${change.table}/${change.id}`;
    const row = merged.get(key) ?? { table: change.table, id: change.id, data: { id: change.id }, seq: 0 };
    row.data = { ...row.data, ...change.fields };
    merged.set(key, row);
  }
  return [...merged.values()].filter(row => includeDeleted || !row.data.deleted_at);
}
