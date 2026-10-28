import assert from 'node:assert/strict';
import { createDesktopPlanner } from '../site/src/lib/terminal/desktopPlanner.ts';
import { coalesceEdits, validateChanges, visibleRecords } from '../site/src/lib/terminal/protocol.ts';
import { localDay, shiftDay } from '../site/src/lib/terminal/planner.ts';

const today = localDay(), tomorrow = shiftDay(today, 1);
let rows = [], counter = Date.now(), writes = 0;
const command = createDesktopPlanner({
  read: async () => ({ allRecords: rows, records: rows.filter(row => !row.data.deleted_at) }),
  save: async edits => {
    // Every native command must still satisfy the web sync boundary.
    const changes = validateChanges(coalesceEdits(edits).map(edit => ({ ...edit, changed_at: ++counter })));
    rows = visibleRecords(rows, changes.map((change, index) => ({ ...change, operation: String(counter + index) })), true);
    writes++;
  },
});
const a = (await command('plan_quick_add', { text: 'First 30m !', day: today, today })).task;
assert.equal(a.focusRank, 1); assert.equal(a.estimateMinutes, 30);
const b = await command('plan_create_task', { title: 'Second', day: today });
assert.equal(b.estimateMinutes, null);
await Promise.all([command('plan_set_focus', { id: b.id, focus: true }), command('plan_set_due', { id: a.id, due: tomorrow })]);
let day = await command('plan_get_day', { day: today, today });
assert.equal(day.tasks.find(task => task.id === b.id).focusRank, 2, 'serial commands read the latest durable state');
assert.equal(day.tasks[0].dueDate, tomorrow);
await command('plan_start_timer', { id: a.id });
const started = rows.find(row => row.id === a.id).data.timer_started_at, before = writes;
await command('plan_start_timer', { id: a.id }); assert.equal(writes, before, 'start is idempotent');
assert.equal(rows.find(row => row.id === a.id).data.timer_started_at, started);
await command('plan_start_timer', { id: b.id });
assert.equal(rows.find(row => row.id === a.id).data.timer_started_at, null);
assert.ok(rows.find(row => row.id === b.id).data.timer_started_at);
await command('plan_set_done', { id: b.id, done: true });
assert.equal(rows.find(row => row.id === b.id).data.timer_started_at, null);
await command('plan_set_done', { id: b.id, done: true });
assert.ok(rows.find(row => row.id === b.id).data.done_at);
await command('plan_update_task', { id: a.id, fields: { title: 'First edited', notes: 'Durable focus notes', estimateMinutes: 45 } });
const block = await command('plan_create_block', { day: today, startMinute: 600, durationMinutes: 45, title: '', taskId: a.id });
await command('plan_update_block', { id: block.id, fields: { startMinute: 615, durationMinutes: 30, title: 'Edited block', color: 'blue' } });
await command('plan_move_task', { id: a.id, day: tomorrow });
assert.ok(rows.find(row => row.id === block.id).data.deleted_at, 'moving a task cleans its old block');
assert.equal(rows.find(row => row.id === b.id).data.focus_rank, 1);
await command('plan_carry_over', { ids: [a.id], to: 'inbox', today });
assert.equal(rows.find(row => row.id === a.id).data.day, null);
const settings = await command('plan_update_settings', { settings: { dayStartMinute: 480, dayEndMinute: 1020, bufferPercent: 10 } });
assert.equal(settings.dayStartMinute, 480);
await command('plan_update_day', { day: today, fields: { intention: 'Make progress', wentWell: 'Shared UI', planned: true, shutDown: true } });
day = await command('plan_get_day', { day: today, today });
assert.equal(day.inbox[0].notes, 'Durable focus notes'); assert.equal(day.info.intention, 'Make progress'); assert.ok(day.info.shutdownAt);
const routine = await command('plan_create_routine', { fields: { title: 'Routine', startMinute: 540, durationMinutes: 30, color: 'teal', weekdays: 127 } });
const range = await command('plan_range', { from: tomorrow, to: shiftDay(tomorrow, 1), today });
assert.equal(range.days[0].blocks[0].routineId, routine.id);
assert.equal(rows.some(row => row.table === 'daily_plan_blocks' && row.data.day === tomorrow), false, 'range previews do not write future routines');
const occurrence = range.days[0].blocks[0];
await command('plan_update_block', { id: occurrence.id, fields: { startMinute: 570, durationMinutes: 30, title: 'Custom occurrence', color: 'teal' } });
assert.equal(rows.find(row => row.id === occurrence.id).data.title, 'Custom occurrence');
await command('plan_delete_block', { id: occurrence.id });
const afterSkip = await command('plan_get_day', { day: tomorrow, today });
assert.equal(afterSkip.blocks.some(block => block.id === occurrence.id), false, 'skipped virtual occurrence stays skipped');
await command('plan_delete_routine', { id: routine.id, today });
assert.equal((await command('plan_list_routines')).length, 0);
assert.equal((await command('plan_calendar_setup')).available.caldav, false);
await assert.rejects(command('plan_connect_calendar', { provider: 'google' }), /not available on the web/);
await assert.rejects(command('plan_get_day', { day: 'bad' }), /valid date/);
assert.equal((await command('plan_summary', { today, nowMinute: 540 })).done, 1, 'command queue recovers after errors');
const insights = await command('plan_insights', { today }); assert.equal(insights.days.length, 14);
await command('plan_delete_task', { id: a.id });
assert.ok(rows.find(row => row.id === a.id).data.deleted_at);
console.log('PASS: desktop command adapter, DTOs, serialized edits, idempotent timers, cleanup, rituals, range previews and routine tombstones');
