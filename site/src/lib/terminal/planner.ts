import type { Fields, SyncRecord } from "./protocol";

export interface PlanTask { id: string; title: string; notes: string; day: string | null; estimate_minutes: number | null; due_date: string | null; focus_rank: number | null; done_at: string | null; position: number; board_task_id: string | null; timer_started_at: string | null; actual_minutes: number }
export interface Edit { table: string; id: string; fields: Fields }
export const planTasks = (records: SyncRecord[]): PlanTask[] => records.filter(row => row.table === "daily_plan_tasks" && !row.data.deleted_at && typeof row.data.title === "string").map(({ id, data }) => ({ id, title: text(data.title), notes: text(data.notes), day: text(data.day) || null, estimate_minutes: number(data.estimate_minutes) || null, due_date: text(data.due_date) || null, focus_rank: number(data.focus_rank) || null, done_at: text(data.done_at) || null, position: number(data.position), board_task_id: text(data.board_task_id) || null, timer_started_at: text(data.timer_started_at) || null, actual_minutes: number(data.actual_minutes) })).sort((a, b) => a.position - b.position);
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const shiftDay = (day: string, amount: number) => { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + amount); return localDay(date); };
export const weekStart = (day: string) => shiftDay(day, -((new Date(`${day}T12:00:00`).getDay() + 6) % 7));
export function monthDays(day: string) {
  const first = `${day.slice(0, 7)}-01`, start = weekStart(first);
  const last = new Date(`${first}T12:00:00`); last.setMonth(last.getMonth() + 1); last.setDate(0);
  const count = Math.ceil((Date.parse(localDay(last)) - Date.parse(start) + 86400000) / 604800000) * 7;
  return Array.from({ length: count }, (_, index) => shiftDay(start, index));
}
export function shiftPeriod(day: string, view: string, direction: number) {
  if (view === "week") return shiftDay(day, direction * 7);
  if (view !== "month" && view !== "year") return shiftDay(day, direction);
  const date = new Date(`${day}T12:00:00`), wanted = date.getDate(); date.setDate(1);
  if (view === "year") date.setFullYear(date.getFullYear() + direction); else date.setMonth(date.getMonth() + direction);
  const end = new Date(date); end.setMonth(end.getMonth() + 1); end.setDate(0);
  date.setDate(Math.min(wanted, end.getDate())); return localDay(date);
}
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const text = (value: unknown) => typeof value === "string" ? value : "";

/** Mirrors Daily Plan's move/delete side effects in the desktop service. */
export function removeFromDay(task: PlanTask, tasks: PlanTask[], records: SyncRecord[], at: string): Edit[] {
  const edits: Edit[] = records.filter(row => row.table === "daily_plan_blocks" && row.data.task_id === task.id).map(row => ({ table: row.table, id: row.id, fields: { deleted_at: at } }));
  if (task.focus_rank) tasks.filter(other => other.day === task.day && other.id !== task.id && other.focus_rank).sort((a, b) => a.focus_rank! - b.focus_rank!).forEach((other, index) => {
    if (other.focus_rank !== index + 1) edits.push({ table: "daily_plan_tasks", id: other.id, fields: { focus_rank: index + 1 } });
  });
  return edits;
}

export function taskEdit(original: PlanTask | null, fields: Fields, tasks: PlanTask[], records: SyncRecord[], newId: string, at: string): Edit[] {
  const edits: Edit[] = [];
  const moving = !!original && fields.day !== original.day;
  if (moving) fields = { ...fields, position: tasks.filter(task => task.id !== original.id && task.day === fields.day).reduce((max, task) => Math.max(max, task.position), 0) + 1 };
  const changingPriority = !original || !!fields.focus_rank !== !!original.focus_rank || moving;
  if (fields.focus_rank && !fields.day) throw new Error("Plan a task for a day before making it a top priority.");
  if (changingPriority) {
    const others = tasks.filter(task => task.id !== original?.id && task.day === fields.day && task.focus_rank);
    if (fields.focus_rank && others.length >= 3) throw new Error("You already have three top priorities. Unstar one first.");
    fields = { ...fields, focus_rank: fields.focus_rank ? others.length + 1 : null };
  } else fields = { ...fields, focus_rank: original!.focus_rank };
  if (original && (moving || (original.focus_rank && !fields.focus_rank))) {
    const cleanup = removeFromDay(original, tasks, records, at);
    // Unstarring keeps the task's blocks; moving to another day removes them.
    edits.push(...cleanup.filter(edit => moving || edit.table !== "daily_plan_blocks"));
  }
  const changed: Fields = original ? Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== original[key as keyof PlanTask])) : { ...fields, id: newId, created_at: at, deleted_at: null, position: Math.max(0, ...tasks.map(task => task.position)) + 1, actual_minutes: 0, timer_started_at: null, board_task_id: null, done_at: null };
  if (Object.keys(changed).length) edits.push({ table: "daily_plan_tasks", id: original?.id ?? newId, fields: changed });
  return edits;
}

/** Successive snapshots keep ranks and positions consistent through a batch move. */
export function carryTasks(selected: string[], to: string | null | "delete", tasks: PlanTask[], records: SyncRecord[], at: string): Edit[] {
  let current = [...tasks];
  const edits: Edit[] = [];
  for (const item of tasks.filter(task => selected.includes(task.id) && !task.done_at)) {
    const task = current.find(row => row.id === item.id)!;
    if (to === "delete") {
      const changes = removeFromDay(task, current, records, at);
      edits.push(...changes, { table: "daily_plan_tasks", id: task.id, fields: { deleted_at: at } });
      current = current.filter(row => row.id !== task.id).map(row => ({ ...row, ...changes.find(edit => edit.table === "daily_plan_tasks" && edit.id === row.id)?.fields } as PlanTask));
    } else if (task.day !== to) {
      const changes = taskEdit(task, { day: to, focus_rank: null }, current, records, "unused", at);
      edits.push(...changes);
      current = current.map(row => ({ ...row, ...changes.findLast(edit => edit.table === "daily_plan_tasks" && edit.id === row.id)?.fields } as PlanTask));
    }
  }
  return edits;
}

export function toggleTask(task: PlanTask, at: string): Edit[] {
  if (task.board_task_id) throw new Error("This task is linked to Project Board. Update it in the desktop app until web boards are ready.");
  const fields: Fields = { done_at: task.done_at ? null : at };
  if (!task.done_at && task.timer_started_at) {
    Object.assign(fields, stoppedTimer(task, at));
  }
  return [{ table: "daily_plan_tasks", id: task.id, fields }];
}

function stoppedTimer(task: PlanTask, at: string): Fields {
  const elapsed = task.timer_started_at ? Math.max(0, Math.round((Date.parse(at) - Date.parse(task.timer_started_at)) / 60_000)) : 0;
  if (!Number.isFinite(elapsed)) throw new Error("This timer could not be read. Sync again before changing it.");
  return { actual_minutes: task.actual_minutes + elapsed, timer_started_at: null };
}

export function toggleTimer(task: PlanTask, tasks: PlanTask[], at: string): Edit[] {
  if (task.timer_started_at) return [{ table: "daily_plan_tasks", id: task.id, fields: stoppedTimer(task, at) }];
  if (task.done_at) throw new Error("Reopen this task before starting its timer.");
  return [...tasks.filter(other => other.timer_started_at).map(other => ({ table: "daily_plan_tasks", id: other.id, fields: stoppedTimer(other, at) })), { table: "daily_plan_tasks", id: task.id, fields: { timer_started_at: at } }];
}

/** Reorder only the position field; dates and priorities keep their meaning. */
export function reorderTask(task: PlanTask, beforeId: string | null, tasks: PlanTask[]): Edit[] {
  const list = tasks.filter(other => other.id !== task.id && other.day === task.day).sort((a, b) => a.position - b.position);
  const index = beforeId === null ? list.length : list.findIndex(other => other.id === beforeId);
  if (index < 0 || beforeId === task.id) return [];
  const after = list[index]?.position ?? (list.at(-1)?.position ?? 0) + 2;
  const prior = list[index - 1]?.position ?? after - 2;
  const position = (prior + after) / 2;
  if (position > prior && position < after) return [{ table: "daily_plan_tasks", id: task.id, fields: { position } }];
  // Rebalance only when repeated midpoint inserts have exhausted floating-point space.
  list.splice(index, 0, task);
  return list.map((row, i) => ({ table: "daily_plan_tasks", id: row.id, fields: { position: i + 1 } }));
}

export interface PlanSettings { start: number; end: number; buffer: number }
export function planSettings(records: SyncRecord[]): PlanSettings {
  const row = records.find(record => record.table === "daily_plan_settings" && record.id === "settings")?.data;
  return { start: number(row?.day_start_minute, 540), end: number(row?.day_end_minute, 1050), buffer: number(row?.buffer_percent, 20) };
}

export interface BusyEvent { day: string; start: number; duration: number; busy: boolean; allDay: boolean }
export function planCapacity(tasks: PlanTask[], records: SyncRecord[], day: string, settings: PlanSettings, events: BusyEvent[] = []) {
  const blocks = records.filter(row => row.table === "daily_plan_blocks" && row.data.day === day);
  const planned = tasks.filter(task => task.day === day).reduce((total, task) => total + (task.estimate_minutes ?? blocks.filter(block => block.data.task_id === task.id).reduce((sum, block) => sum + number(block.data.duration_minutes), 0)), 0) + blocks.filter(block => !block.data.task_id).reduce((sum, block) => sum + number(block.data.duration_minutes), 0);
  const available = Math.max(0, Math.floor((settings.end - settings.start) * (100 - settings.buffer) / 100));
  const meetings = events.filter(event => event.day === day && event.busy && !event.allDay).reduce((sum, event) => sum + Math.max(0, Math.min(settings.end, event.start + event.duration) - Math.max(settings.start, event.start)), 0);
  return { planned: planned + meetings, available, remaining: available - planned - meetings };
}

const quarter = (minute: number) => Math.ceil(minute / 15) * 15;
function freeSlot(busy: [number, number][], from: number, length: number, until: number): number | null {
  let at = quarter(from);
  while (at + length <= until) {
    const overlaps = busy.filter(([start, end]) => start < at + length && end > at);
    if (!overlaps.length) return at;
    at = quarter(Math.max(...overlaps.map(([, end]) => end)));
  }
  return null;
}
export function createBlock(id: string, day: string, start: number, duration: number, at: string, task: Pick<PlanTask, "id"> | null = null, title = ""): Edit {
  if (!Number.isInteger(start) || !Number.isInteger(duration) || start < 0 || duration < 5 || start + duration > 1440) throw new Error("A time block must last at least five minutes and end by midnight.");
  return { table: "daily_plan_blocks", id, fields: { id, day, start_minute: start, duration_minutes: duration, title, color: "blue", task_id: task?.id ?? null, routine_id: null, created_at: at, deleted_at: null } };
}

/** Fixed blocks remain fixed; scheduling never creates an overlapping task block. */
export function scheduleDay(tasks: PlanTask[], records: SyncRecord[], day: string, from: number, at: string, newId: () => string, replan = false, events: BusyEvent[] = []) {
  const settings = planSettings(records);
  const blocks = records.filter(row => row.table === "daily_plan_blocks" && row.data.day === day).sort((a, b) => number(a.data.start_minute) - number(b.data.start_minute));
  const open = tasks.filter(task => task.day === day && !task.done_at);
  const busy: [number, number][] = events.filter(event => event.day === day && event.busy && !event.allDay).map(event => [event.start, event.start + event.duration]);
  const edits: Edit[] = [];
  const scheduled: string[] = [], leftOver: string[] = [];
  if (replan) {
    const move: SyncRecord[] = [];
    for (const block of blocks) {
      const start = number(block.data.start_minute), end = start + number(block.data.duration_minutes);
      if (!open.some(task => task.id === block.data.task_id)) busy.push([start, end]);
    }
    for (const block of blocks.filter(row => open.some(task => task.id === row.data.task_id))) {
      const start = number(block.data.start_minute), end = start + number(block.data.duration_minutes);
      if (start >= quarter(from) && !busy.some(([a, b]) => a < end && b > start)) busy.push([start, end]);
      else move.push(block);
    }
    for (const block of move) {
      const length = number(block.data.duration_minutes), slot = freeSlot(busy, from, length, settings.end);
      const title = open.find(task => task.id === block.data.task_id)?.title ?? text(block.data.title);
      edits.push({ table: block.table, id: block.id, fields: slot === null ? { deleted_at: at } : { start_minute: slot } });
      if (slot === null) leftOver.push(title); else { busy.push([slot, slot + length]); scheduled.push(title); }
    }
  } else {
    busy.push(...blocks.map(row => [number(row.data.start_minute), number(row.data.start_minute) + number(row.data.duration_minutes)] as [number, number]));
    for (const task of [...open].sort((a, b) => (a.focus_rank ?? 99) - (b.focus_rank ?? 99) || a.position - b.position)) {
      if (blocks.some(block => block.data.task_id === task.id)) continue;
      const length = task.estimate_minutes ?? 30, slot = freeSlot(busy, Math.max(from, settings.start), length, settings.end);
      if (slot === null) leftOver.push(task.title);
      else { edits.push(createBlock(newId(), day, slot, length, at, task)); busy.push([slot, slot + length]); scheduled.push(task.title); }
    }
  }
  return { edits, scheduled, leftOver };
}

export const weekdayBit = (day: string) => 1 << ((new Date(`${day}T12:00:00`).getDay() + 6) % 7);
export function applyRoutines(records: SyncRecord[], allRecords: SyncRecord[], day: string, at: string): Edit[] {
  return records.filter(row => row.table === "daily_plan_routines" && (number(row.data.weekdays) & weekdayBit(day)) !== 0).flatMap(routine => {
    const id = `r-${routine.id}-${day}`;
    if (allRecords.some(row => row.table === "daily_plan_blocks" && row.id === id)) return [];
    const block = createBlock(id, day, number(routine.data.start_minute), number(routine.data.duration_minutes), at, null, text(routine.data.title));
    block.fields.color = text(routine.data.color) || "purple";
    block.fields.routine_id = routine.id;
    return [block];
  });
}

export function changeRoutine(original: SyncRecord | null, fields: Fields | null, records: SyncRecord[], today: string, at: string, newId: string): Edit[] {
  const id = original?.id ?? newId;
  if (fields && (!number(fields.weekdays) || number(fields.weekdays) > 127)) throw new Error("Choose at least one day for the routine.");
  if (fields) createBlock("check", today, number(fields.start_minute), number(fields.duration_minutes), at);
  const edits: Edit[] = [{ table: "daily_plan_routines", id, fields: fields ? { ...fields, ...(original ? {} : { id, created_at: at, deleted_at: null }) } : { deleted_at: at } }];
  for (const block of records.filter(row => row.table === "daily_plan_blocks" && row.data.routine_id === id && text(row.data.day) >= today)) {
    edits.push({ table: block.table, id: block.id, fields: !fields || !(number(fields.weekdays) & weekdayBit(text(block.data.day))) ? { deleted_at: at } : { title: fields.title, start_minute: fields.start_minute, duration_minutes: fields.duration_minutes, color: fields.color } });
  }
  return edits;
}

/** Browsing ahead previews routines without writing hundreds of occurrences. */
export function routinePreview(records: SyncRecord[], allRecords: SyncRecord[], days: string[], today: string): SyncRecord[] {
  return [...records, ...days.filter(day => day >= today).flatMap(day => applyRoutines(records, allRecords, day, `${day}T12:00:00Z`).map(edit => ({ table: edit.table, id: edit.id, data: edit.fields, seq: -1 })))];
}

export function placeBlock(block: SyncRecord, day: string, start: number, duration: number, tasks: PlanTask[], records: SyncRecord[], at: string): Edit[] {
  createBlock(block.id, day, start, duration, at);
  const task = tasks.find(task => task.id === block.data.task_id);
  const edits = task && task.day !== day ? taskEdit(task, { day, focus_rank: null }, tasks, records, "unused", at) : [];
  const fields: Fields = { day, start_minute: start, duration_minutes: duration, ...(day !== block.data.day ? { routine_id: null } : {}) };
  edits.push({ table: block.table, id: block.id, fields: block.seq === -1 ? { ...block.data, ...fields } : { ...fields, deleted_at: null } });
  return edits;
}

/** Allocate lanes using the rendered height, so short items cannot cover each other. */
export function timelineLanes(items: { id: string; start: number; duration: number }[], minimum = 24) {
  const result = new Map<string, { lane: number; count: number }>();
  let group: typeof items = [], groupEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    for (const item of group) {
      let lane = ends.findIndex(end => end <= item.start); if (lane < 0) lane = ends.length;
      ends[lane] = item.start + Math.max(item.duration, minimum); result.set(item.id, { lane, count: 0 });
    }
    group.forEach(item => { result.get(item.id)!.count = ends.length; });
  };
  for (const item of [...items].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
    if (item.start >= groupEnd) { flush(); group = []; groupEnd = -1; }
    group.push(item); groupEnd = Math.max(groupEnd, item.start + Math.max(item.duration, minimum));
  }
  flush(); return result;
}

export function planInsights(tasks: PlanTask[], records: SyncRecord[], today: string) {
  const month = tasks.filter(task => task.day && task.day >= shiftDay(today, -30) && task.day <= today);
  const timed = month.filter(task => (task.estimate_minutes ?? 0) > 0 && task.actual_minutes > 0);
  const pace = timed.length >= 3 ? timed.reduce((sum, task) => sum + task.actual_minutes, 0) / timed.reduce((sum, task) => sum + (task.estimate_minutes ?? 0), 0) : null;
  const streak = (field: string) => {
    const marked = new Set(records.filter(row => row.table === "daily_plan_days" && row.data[field]).map(row => row.id));
    let day = marked.has(today) ? today : shiftDay(today, -1), count = 0;
    while (marked.has(day)) { count++; day = shiftDay(day, -1); }
    return count;
  };
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const start = shiftDay(weekStart(today), (index - 7) * 7), end = shiftDay(start, 7);
    return { start, tracked: tasks.filter(task => task.day && task.day >= start && task.day < end && task.day <= today).reduce((sum, task) => sum + task.actual_minutes, 0) };
  });
  return { pace, timed: timed.length, weeks, plannedStreak: streak("planned_at"), shutdownStreak: streak("shutdown_at"), focus: month.filter(task => task.focus_rank).length, focusDone: month.filter(task => task.focus_rank && task.done_at).length, days: Array.from({ length: 14 }, (_, i) => { const day = shiftDay(today, i - 13), rows = tasks.filter(task => task.day === day); return { day, total: rows.length, done: rows.filter(task => task.done_at).length, tracked: rows.reduce((sum, task) => sum + task.actual_minutes, 0) }; }) };
}

/** Quick-add follows the desktop's token order and leaves ordinary words alone. */
export function parseQuickTask(input: string, shownDay: string | null, today: string) {
  const words = input.trim().split(/\s+/), title: string[] = [];
  let day = shownDay, chosenDay = false, estimate: number | null = null, start: number | null = null, focus = false, due: string | null = null;
  const clock = (word: string) => {
    const match = /^(@?)(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(word);
    if (!match || (!match[1] && !match[3] && !match[4])) return null;
    let h = Number(match[2]); const m = Number(match[3] ?? 0);
    if (m > 59 || (match[4] ? h < 1 || h > 12 : h > 23)) return null;
    if (match[4]) h = h % 12 + (match[4] === "pm" ? 12 : 0);
    return h * 60 + m;
  };
  const duration = (word: string) => {
    const hours = /^(\d+(?:\.\d+)?)h(?:(\d+(?:\.\d+)?)(?:m|min)?)?$/.exec(word), minutes = /^(\d+(?:\.\d+)?)(?:m|min|mins)$/.exec(word);
    const value = hours ? Math.round(Number(hours[1]) * 60 + Number(hours[2] ?? 0)) : minutes ? Math.round(Number(minutes[1])) : 0;
    return value >= 1 && value <= 1440 ? value : null;
  };
  const date = (year: number, month: number, date: number) => { const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`; return Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null; };
  const deadline = (a = "", b = ""): [string, number] | null => {
    if (a === "today") return [today, 1];
    if (a === "tomorrow" || a === "tmrw") return [shiftDay(today, 1), 1];
    const weekdays = [["mon", "monday"], ["tue", "tues", "tuesday"], ["wed", "weds", "wednesday"], ["thu", "thur", "thurs", "thursday"], ["fri", "friday"], ["sat", "saturday"], ["sun", "sunday"]];
    const weekday = weekdays.findIndex(names => names.includes(a));
    if (weekday >= 0) return [shiftDay(today, (weekday - (new Date(`${today}T12:00:00`).getDay() + 6) % 7 + 7) % 7), 1];
    let result: string | null = null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a), slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(a);
    if (iso) { result = date(Number(iso[1]), Number(iso[2]), Number(iso[3])); return result ? [result, 1] : null; }
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const year = Number(today.slice(0, 4));
    let month = 0, day = 0, used = 1;
    if (slash) { month = Number(slash[2]); day = Number(slash[1]); if (slash[3]) { result = date(Number(slash[3]), month, day); return result ? [result, 1] : null; } }
    else if (/^\d{1,2}(?:st|nd|rd|th)?$/.test(a) && months.includes(b.slice(0, 3))) { day = parseInt(a); month = months.indexOf(b.slice(0, 3)) + 1; used = 2; }
    else if (months.includes(a.slice(0, 3)) && /^\d{1,2}(?:st|nd|rd|th)?$/.test(b)) { day = parseInt(b); month = months.indexOf(a.slice(0, 3)) + 1; used = 2; }
    result = date(year, month, day);
    if (result && result < today) result = date(year + 1, month, day);
    return result ? [result, used] : null;
  };
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();
    const dueHint: [string, number] | null = word === "due" && !due ? deadline(words[i + 1]?.toLowerCase(), words[i + 2]?.toLowerCase()) : null;
    const minutes: number | null = estimate === null ? duration(word) : null, at: number | null = start === null ? clock(word) : null;
    if (dueHint) { due = dueHint[0]; i += dueHint[1]; }
    else if (word === "!") focus = true;
    else if (!chosenDay && ["today", "tomorrow", "inbox"].includes(word)) { day = word === "today" ? today : word === "tomorrow" ? shiftDay(today, 1) : null; chosenDay = true; }
    else if (minutes !== null) estimate = minutes;
    else if (at !== null) { start = at; if (title.at(-1)?.toLowerCase() === "at") title.pop(); }
    else title.push(words[i]);
  }
  return { title: title.join(" "), day, estimate, start, focus, due };
}
