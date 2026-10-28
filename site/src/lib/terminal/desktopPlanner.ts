import type { Block, Calendar, CalendarSetup, DayInfo, DayPlan, PlanTask, RangePlan, Routine, Settings } from "../../../../src/features/daily_plan/api";
import { applyRoutines, carryTasks, changeRoutine, createBlock, localDay, parseQuickTask, placeBlock, planCapacity, planInsights, planSettings, planTasks, removeFromDay, reorderTask, routinePreview, scheduleDay, shiftDay, taskEdit, toggleTimer, type Edit } from "./planner.ts";
import { calendarEdits, calendarEvents, readCalendar, removeCalendar } from "./calendar.ts";
import { boardId } from "./ids.ts";
import { completePlannerTask, planCard, plannerCards } from "./boardPlanner.ts";
import { validDay, visibleRecords, type Fields, type SyncRecord } from "./protocol.ts";

export interface PlannerStorage { read: () => Promise<{ records: SyncRecord[]; allRecords: SyncRecord[] }>; save: (edits: Edit[]) => Promise<void>; feed?: (url: string) => Promise<string> }
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" ? value : 0;
const dayValue = (value: unknown) => { if (!validDay(value)) throw new Error("Choose a valid date."); return value; };
const tasksForUi = (records: SyncRecord[]): PlanTask[] => planTasks(records).map(task => { const data = records.find(row => row.table === "daily_plan_tasks" && row.id === task.id)!.data; return { id: task.id, title: task.title, notes: task.notes, day: task.day, position: task.position, estimateMinutes: task.estimate_minutes, focusRank: task.focus_rank, doneAt: task.done_at, boardTaskId: task.board_task_id, createdAt: text(data.created_at), updatedAt: text(data.updated_at), actualMinutes: task.actual_minutes, timerStartedAt: task.timer_started_at, dueDate: task.due_date }; });
const blocksForUi = (records: SyncRecord[]): Block[] => records.filter(row => row.table === "daily_plan_blocks" && !row.data.deleted_at).map(row => ({ id: row.id, day: text(row.data.day), startMinute: number(row.data.start_minute), durationMinutes: number(row.data.duration_minutes), title: text(row.data.title), color: text(row.data.color), taskId: text(row.data.task_id) || null, routineId: text(row.data.routine_id) || null }));
const routineForUi = (row: SyncRecord): Routine => ({ id: row.id, title: text(row.data.title), startMinute: number(row.data.start_minute), durationMinutes: number(row.data.duration_minutes), color: text(row.data.color), weekdays: number(row.data.weekdays) });
const settingsForUi = (records: SyncRecord[]): Settings => { const settings = planSettings(records); return { dayStartMinute: settings.start, dayEndMinute: settings.end, bufferPercent: settings.buffer }; };
const infoForUi = (records: SyncRecord[], day: string): DayInfo => { const data = records.find(row => row.table === "daily_plan_days" && row.id === day)?.data; return { intention: text(data?.intention), wentWell: text(data?.went_well), doBetter: text(data?.do_better), plannedAt: text(data?.planned_at) || null, shutdownAt: text(data?.shutdown_at) || null }; };
const calendarsForUi = (records: SyncRecord[]): Calendar[] => records.filter(row => row.table === "web_plan_calendars" && !row.data.deleted_at).map(row => ({ id: row.id, name: text(row.data.name), color: text(row.data.color), refreshedAt: text(row.data.refreshed_at) || null, problem: text(row.data.problem) || null, createdAt: text(row.data.created_at), accountId: null, writable: false, shown: row.data.shown !== false, publish: false, mine: true }));
const eventsForUi = (records: SyncRecord[], from: string, to = from) => calendarEvents(records, from, to).events.map(event => ({ id: event.id, calendarId: event.calendarId, day: event.day, startMinute: event.start, durationMinutes: event.duration, allDay: event.allDay, busy: event.busy, title: event.title, color: event.color, startAt: event.startAt, endAt: event.endAt, location: event.location, description: event.description, link: event.link, recurring: event.recurring, editable: false }));

/** Supplies the native planner's command contract using the web's durable, account-scoped store. */
export function createDesktopPlanner(storage: PlannerStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  async function execute(command: string, args: Record<string, unknown>) {
    let snapshot = await storage.read();
    let { records, allRecords } = snapshot;
    const at = new Date().toISOString(), today = validDay(args.today) ? args.today : localDay();
    const tasks = () => planTasks(records);
    const task = () => { const found = tasks().find(task => task.id === args.id); if (!found) throw new Error("That task is no longer available. Sync and try again."); return found; };
    const save = async (edits: Edit[]) => { if (edits.length) await storage.save(edits); snapshot = await storage.read(); records = snapshot.records; allRecords = snapshot.allRecords; };
    const uiTask = (id: string) => tasksForUi(records).find(task => task.id === id)!;
    const materialize = async (day: string) => { if (day >= today) await save(applyRoutines(records, allRecords, day, at)); };
    const getDay = async (day: string): Promise<DayPlan> => {
      await materialize(day);
      const all = tasksForUi(records), cards = plannerCards(records).map(card => ({ id: card.id, title: card.title, projectName: card.projectName, projectColor: card.color, columnName: card.column, dueDate: card.due, estimateMinutes: card.estimate, inProgress: card.inProgress, done: card.done }));
      const dayTasks = all.filter(task => task.day === day).sort((a, b) => (a.focusRank ?? 99) - (b.focusRank ?? 99) || a.position - b.position);
      return { day, tasks: dayTasks, blocks: blocksForUi(records).filter(block => block.day === day), events: eventsForUi(records, day), earlier: day === today ? all.filter(task => task.day && task.day < today && !task.doneAt) : [], inbox: all.filter(task => !task.day && !task.doneAt), dueSoon: day === today ? all.filter(task => !task.doneAt && task.dueDate && task.dueDate <= shiftDay(today, 3) && (!task.day || task.day > today)) : [], settings: settingsForUi(records), info: infoForUi(records, day), cards: cards.filter(card => all.some(task => task.boardTaskId === card.id)), suggestions: day >= today ? cards.filter(card => !card.done && (card.inProgress || card.dueDate && card.dueDate <= day) && !all.some(task => !task.doneAt && task.boardTaskId === card.id)).slice(0, 30) : [], running: all.find(task => task.timerStartedAt) ?? null, pace: planInsights(tasks(), records, today).pace };
    };
    const findBlock = () => {
      const row = records.find(row => row.table === "daily_plan_blocks" && row.id === args.id);
      if (row) return row;
      const day = dayValue(text(args.id).slice(-10));
      const virtual = routinePreview(records, allRecords, [day], today).find(row => row.table === "daily_plan_blocks" && row.id === args.id);
      if (!virtual) throw new Error("That time block is no longer available."); return virtual;
    };
    switch (command) {
      case "plan_get_day": return getDay(dayValue(args.day));
      case "plan_range": {
        const from = dayValue(args.from), to = dayValue(args.to), count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
        if (count < 1 || count > 400) throw new Error("Choose a planner range of up to one year.");
        const days = Array.from({ length: count }, (_, index) => shiftDay(from, index)), preview = routinePreview(records, allRecords, days, today), all = tasksForUi(records), blocks = blocksForUi(preview), events = eventsForUi(records, from, to);
        const busy = calendarEvents(records, from, to).events;
        return { settings: settingsForUi(records), pace: planInsights(tasks(), records, today).pace, inbox: all.filter(task => !task.day && !task.doneAt), days: days.map(day => ({ day, tasks: all.filter(task => task.day === day), blocks: blocks.filter(block => block.day === day), events: events.filter(event => event.day === day), plannedMinutes: planCapacity(tasks(), preview, day, planSettings(records), busy).planned, planned: !!infoForUi(records, day).plannedAt, due: all.filter(task => task.dueDate === day && !task.doneAt && task.day !== day) })) } satisfies RangePlan;
      }
      case "plan_summary": {
        const plan = await getDay(today), minute = number(args.nowMinute), all = [...plan.blocks.map(block => ({ startMinute: block.startMinute, durationMinutes: block.durationMinutes, title: plan.tasks.find(task => task.id === block.taskId)?.title ?? block.title })), ...plan.events.filter(event => !event.allDay).map(event => ({ startMinute: event.startMinute, durationMinutes: event.durationMinutes, title: event.title }))].filter(item => item.startMinute + item.durationMinutes > minute).sort((a, b) => a.startMinute - b.startMinute);
        return { total: plan.tasks.length, done: plan.tasks.filter(task => task.doneAt).length, focus: plan.tasks.filter(task => task.focusRank), nextBlock: all[0] ? { ...all[0], inProgress: all[0].startMinute <= minute } : null, plannedMinutes: planCapacity(tasks(), records, today, planSettings(records), calendarEvents(records, today, today).events).planned, availableMinutes: plan.settings.dayEndMinute - plan.settings.dayStartMinute, running: plan.running };
      }
      case "plan_create_task": case "plan_quick_add": {
        const parsed = command === "plan_quick_add" ? parseQuickTask(text(args.text), dayValue(args.day), today) : { title: text(args.title), day: args.day === null ? null : dayValue(args.day), estimate: args.estimateMinutes == null ? null : number(args.estimateMinutes), due: null, focus: false, start: null };
        const id = boardId(), edits = taskEdit(null, { title: parsed.title, notes: "", day: parsed.day, estimate_minutes: parsed.estimate, due_date: parsed.due, focus_rank: parsed.focus && parsed.day ? 1 : null }, tasks(), records, id, at);
        const block = parsed.start !== null && parsed.day ? createBlock(boardId(), parsed.day, parsed.start, Math.min(parsed.estimate ?? 30, 1440 - parsed.start), at, { id }) : null;
        if (block) edits.push(block); await save(edits);
        return command === "plan_quick_add" ? { task: uiTask(id), block: block ? blocksForUi(records).find(row => row.id === block.id) : null } : uiTask(id);
      }
      case "plan_update_task": case "plan_set_focus": case "plan_set_due": {
        const original = task(), fields = (args.fields ?? {}) as Record<string, unknown>;
        const changes: Fields = { day: original.day, focus_rank: original.focus_rank };
        if (command === "plan_update_task") Object.assign(changes, { title: text(fields.title), notes: text(fields.notes), estimate_minutes: fields.estimateMinutes === null ? null : number(fields.estimateMinutes) });
        if (command === "plan_set_focus") changes.focus_rank = args.focus ? 1 : null;
        if (command === "plan_set_due") changes.due_date = args.due === null ? null : dayValue(args.due);
        await save(taskEdit(original, changes, tasks(), records, "unused", at)); return uiTask(original.id);
      }
      case "plan_set_done": case "plan_start_timer": case "plan_stop_timer": {
        const original = task();
        if (command === "plan_set_done") { if (!!original.done_at !== !!args.done) await save(completePlannerTask(original, records, allRecords, at, boardId)); }
        else if ((command === "plan_start_timer") !== !!original.timer_started_at) await save(toggleTimer(original, tasks(), at));
        return uiTask(original.id);
      }
      case "plan_move_task": {
        const original = task(), day = args.day === null ? null : dayValue(args.day);
        const edits = original.day === day ? [] : taskEdit(original, { day, focus_rank: null }, tasks(), records, "unused", at);
        const projected = visibleRecords(records, edits.map((edit, index) => ({ ...edit, changed_at: index, operation: String(index) })));
        const current = planTasks(projected), moved = current.find(task => task.id === original.id)!;
        edits.push(...reorderTask(moved, text(args.beforeId) || null, current)); await save(edits); return uiTask(original.id);
      }
      case "plan_carry_over": await save(carryTasks(Array.isArray(args.ids) ? args.ids.map(String) : [], args.to === "today" ? today : args.to === "delete" ? "delete" : null, tasks(), records, at)); return;
      case "plan_delete_task": { const original = task(); await save([{ table: "daily_plan_tasks", id: original.id, fields: { deleted_at: at } }, ...removeFromDay(original, tasks(), records, at)]); return; }
      case "plan_create_block": {
        const day = dayValue(args.day), linked = tasks().find(task => task.id === args.taskId), edits = linked && linked.day !== day ? taskEdit(linked, { day, focus_rank: null }, tasks(), records, "unused", at) : [];
        if (args.taskId && !linked) throw new Error("The task linked to this block is no longer available.");
        const block = createBlock(boardId(), day, number(args.startMinute), number(args.durationMinutes), at, linked, text(args.title)); edits.push(block); await save(edits); return blocksForUi(records).find(row => row.id === block.id);
      }
      case "plan_update_block": { const block = findBlock(), fields = args.fields as Record<string, unknown>; const edits = placeBlock(block, text(block.data.day), number(fields.startMinute), number(fields.durationMinutes), tasks(), records, at); Object.assign(edits.at(-1)!.fields, { title: text(fields.title), color: text(fields.color) }); await save(edits); return blocksForUi(records).find(row => row.id === block.id); }
      case "plan_delete_block": { const block = findBlock(); await save([{ table: block.table, id: block.id, fields: { ...(block.seq === -1 ? block.data : {}), deleted_at: at } }]); return; }
      case "plan_update_settings": { const settings = args.settings as Record<string, unknown>; await save([{ table: "daily_plan_settings", id: "settings", fields: { id: "settings", day_start_minute: number(settings.dayStartMinute), day_end_minute: number(settings.dayEndMinute), buffer_percent: number(settings.bufferPercent), deleted_at: null } }]); return settingsForUi(records); }
      case "plan_update_day": { const day = dayValue(args.day), fields = args.fields as Record<string, unknown>, changes: Fields = {};
        for (const [key, column] of [["intention", "intention"], ["wentWell", "went_well"], ["doBetter", "do_better"]]) if (fields[key] !== undefined) changes[column] = text(fields[key]);
        if (fields.planned !== undefined) changes.planned_at = fields.planned ? at : null;
        if (fields.shutDown !== undefined) changes.shutdown_at = fields.shutDown ? at : null;
        if (!records.some(row => row.table === "daily_plan_days" && row.id === day)) Object.assign(changes, { id: day, intention: changes.intention ?? "", went_well: changes.went_well ?? "", do_better: changes.do_better ?? "", planned_at: changes.planned_at ?? null, shutdown_at: changes.shutdown_at ?? null, deleted_at: null });
        await save([{ table: "daily_plan_days", id: day, fields: changes }]); return infoForUi(records, day);
      }
      case "plan_fit_into_day": case "plan_replan": { const day = dayValue(args.day); await materialize(day); const result = scheduleDay(tasks(), records, day, number(command === "plan_replan" ? args.nowMinute : args.fromMinute), at, boardId, command === "plan_replan", calendarEvents(records, day, day).events); await save(result.edits); return { scheduled: result.scheduled, leftOver: result.leftOver }; }
      case "plan_card": { const day = args.day === null ? null : dayValue(args.day), edits = planCard(text(args.cardId), day, tasks(), records, at, boardId()); await save(edits); return tasksForUi(records).find(task => task.boardTaskId === args.cardId && !task.doneAt); }
      case "plan_list_routines": return records.filter(row => row.table === "daily_plan_routines").map(routineForUi).sort((a, b) => a.startMinute - b.startMinute);
      case "plan_create_routine": case "plan_update_routine": case "plan_delete_routine": {
        const original = records.find(row => row.table === "daily_plan_routines" && row.id === args.id) ?? null;
        if (command !== "plan_create_routine" && !original) throw new Error("That routine is no longer available.");
        const fields = args.fields as Record<string, unknown>, changes: Fields | null = command === "plan_delete_routine" ? null : { title: text(fields.title), start_minute: number(fields.startMinute), duration_minutes: number(fields.durationMinutes), color: text(fields.color), weekdays: number(fields.weekdays) };
        const edits = changeRoutine(original, changes, records, today, at, boardId()); await save(edits); return changes ? routineForUi(records.find(row => row.table === "daily_plan_routines" && row.id === edits[0].id)!) : undefined;
      }
      case "plan_insights": { const data = planInsights(tasks(), records, today); return { pace: data.pace, pacedTasks: data.timed, weeks: data.weeks.map(week => ({ weekStart: week.start, trackedMinutes: week.tracked })), days: data.days.map(day => ({ day: day.day, planned: day.total, done: day.done })), planningStreak: data.plannedStreak, shutdownStreak: data.shutdownStreak, focusTotal: data.focus, focusDone: data.focusDone }; }
      case "plan_calendar_setup": return { accounts: [], calendars: calendarsForUi(records), available: { google: false, microsoft: false, caldav: false } } satisfies CalendarSetup;
      case "plan_add_calendar": { if (!storage.feed) throw new Error("Calendar feeds are not available here."); const source = await storage.feed(text(args.url)); readCalendar(source, "check", text(args.color), shiftDay(today, -366), shiftDay(today, 366)); const edits = calendarEdits(null, text(args.name), text(args.color), source, records, at, boardId), parent = edits.find(edit => edit.table === "web_plan_calendars")!; Object.assign(parent.fields, { feed_url: text(args.url).replace(/^webcal:/i, "https:"), refreshed_at: at, problem: null }); await save(edits); return calendarsForUi(records).find(calendar => calendar.id === parent.id); }
      case "plan_remove_calendar": { const calendar = records.find(row => row.table === "web_plan_calendars" && row.id === args.id); if (calendar) await save(removeCalendar(calendar, records, at)); return; }
      case "plan_show_calendar": await save([{ table: "web_plan_calendars", id: text(args.id), fields: { shown: !!args.shown } }]); return;
      case "plan_refresh_calendars": {
        if (!args.force || !storage.feed) return false;
        let changed = false;
        for (const calendar of records.filter(row => row.table === "web_plan_calendars" && row.data.feed_url)) {
          try { const source = await storage.feed(text(calendar.data.feed_url)); readCalendar(source, calendar.id, text(calendar.data.color), shiftDay(today, -366), shiftDay(today, 366)); const edits = calendarEdits(calendar, text(calendar.data.name), text(calendar.data.color), source, records, at, boardId); Object.assign(edits.find(edit => edit.table === calendar.table)!.fields, { refreshed_at: at, problem: null }); await save(edits); changed = true; }
          catch (cause) { await save([{ table: calendar.table, id: calendar.id, fields: { problem: cause instanceof Error ? cause.message : "The feed could not be read." } }]); }
        } return changed;
      }
      case "plan_cancel_calendar_sign_in": return;
      default: throw new Error("Direct calendar account sign-in, event editing and publishing are not available on the web yet. You can import a file or subscribe to an iCalendar link.");
    }
  }
  return <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    const result = queue.then(() => execute(command, args)); queue = result.catch(() => {}); return result as Promise<T>;
  };
}
