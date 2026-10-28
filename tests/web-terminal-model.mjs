import assert from 'node:assert/strict';
import { validateChanges, visibleRecords, validDay } from '../site/src/lib/terminal/protocol.ts';
import { applyRoutines, changeRoutine, createBlock, parseQuickTask, planCapacity, planInsights, planSettings, removeFromDay, reorderTask, scheduleDay, shiftDay, taskEdit, toggleTask, toggleTimer, weekdayBit } from '../site/src/lib/terminal/planner.ts';

const at = Date.now();
const change = (fields, table = 'daily_plan_tasks', id = 'task-1') => ({ table, id, fields, changed_at: at });
assert.equal(validDay('2026-02-29'), false);
assert.equal(validDay('2028-02-29'), true);
assert.equal(validDay('not-a-date'), false);
assert.equal(validateChanges([change({ title: 'Work', day: '2026-10-25', estimate_minutes: 30 })]).length, 1);
for (const bad of [
  change({ title: '' }), change({ title: 'Work', id: 'somebody-else' }), change({ unknown: 'field' }),
  change({ focus_rank: 4 }), change({ estimate_minutes: -3 }), change({ day: '2026-02-30' }),
  change({ done_at: '1' }),
  change({ name: 'Private plaintext' }, 'finance_accounts'), change({ name: 'Private' }, 'notes_notes'),
  change({ id: '__proto__', name: 'Private' }, '__proto__', '__proto__'),
  change({ start_minute: 1430, duration_minutes: 60 }, 'daily_plan_blocks'),
  change({ intention: 'hi' }, 'daily_plan_days', 'invalid'),
]) assert.throws(() => validateChanges([bad]));
assert.throws(() => validateChanges(Array(101).fill(change({ title: 'Work' }))));
assert.throws(() => validateChanges([{ ...change({ title: 'Work' }), changed_at: at + 600_000 }]));
const base = [{ table: 'daily_plan_tasks', id: 'task-1', data: { id: 'task-1', title: 'Desktop title', notes: 'Desktop notes', done_at: null }, seq: 4 }];
const pending = [
  { ...change({ title: 'Newer title' }), operation: 'b', changed_at: 20 },
  { ...change({ title: 'Earlier title', done_at: 'today' }), operation: 'a', changed_at: 10 },
];
const merged = visibleRecords(base, pending);
assert.equal(merged[0].data.title, 'Newer title');
assert.equal(merged[0].data.notes, 'Desktop notes', 'field edits preserve other-device fields');
assert.equal(base[0].data.title, 'Desktop title', 'reading does not mutate server snapshots');
assert.equal(visibleRecords(base, [{ ...change({ deleted_at: new Date().toISOString() }), operation: 'deleted' }]).length, 0);
assert.equal(visibleRecords([], [{ ...change({ title: 'Offline task' }), operation: 'new' }])[0].data.title, 'Offline task');
const task = { id: 'task-1', title: 'Work', notes: '', day: '2026-10-25', focus_rank: 1, done_at: null, position: 1, estimate_minutes: 30, due_date: null, board_task_id: null, timer_started_at: null, actual_minutes: 0 };
const second = { ...task, id: 'task-2', focus_rank: 2 };
const blocks = [{ table: 'daily_plan_blocks', id: 'block-1', data: { task_id: 'task-1' }, seq: 1 }];
const cleaned = removeFromDay(task, [task, second], blocks, timestamp());
assert.equal(cleaned.find(change => change.id === 'block-1').fields.deleted_at, timestamp());
assert.equal(cleaned.find(change => change.id === 'task-2').fields.focus_rank, 1, 'priorities close the gap after moving/deleting');
const moved = taskEdit(task, { title: 'Work', day: '2026-10-26', focus_rank: null }, [task, second], blocks, 'unused', timestamp());
assert.ok(moved.some(change => change.id === 'block-1' && change.fields.deleted_at));
assert.throws(() => taskEdit(null, { day: null, focus_rank: 1 }, [], [], 'new', timestamp()));
assert.throws(() => taskEdit(null, { day: task.day, focus_rank: 1 }, [task, second, { ...task, id: 'task-3', focus_rank: 3 }], [], 'new', timestamp()));
const finished = toggleTask({ ...task, actual_minutes: 5, timer_started_at: '2026-10-25T09:00:00Z' }, '2026-10-25T09:02:00Z')[0];
assert.equal(finished.fields.actual_minutes, 7);
assert.equal(finished.fields.timer_started_at, null);
assert.throws(() => toggleTask({ ...task, board_task_id: 'linked-card' }, timestamp()));
assert.equal(toggleTimer({ ...task, timer_started_at: '2026-10-25T09:00:00Z' }, [], '2026-10-25T09:02:00Z')[0].fields.actual_minutes, 2);
const switched = toggleTimer(second, [{ ...task, timer_started_at: '2026-10-25T09:00:00Z' }, second], '2026-10-25T09:02:00Z');
assert.equal(switched[0].fields.timer_started_at, null, 'starting a timer stops the other task');
assert.equal(switched[1].fields.timer_started_at, '2026-10-25T09:02:00Z');
assert.throws(() => toggleTimer({ ...task, done_at: timestamp() }, [], timestamp()));
assert.equal(reorderTask(second, task.id, [task, { ...second, position: 2 }])[0].fields.position, 0);
assert.equal(shiftDay('2026-10-25', -1), '2026-10-24');
const parse = value => parseQuickTask(value, '2026-10-25', '2026-10-25');
assert.deepEqual(parse('Write report 45m 2pm !'), { title: 'Write report', day: '2026-10-25', estimate: 45, start: 840, focus: true, due: null });
assert.deepEqual(parse('Gym tomorrow at 7:30am 1h'), { title: 'Gym', day: '2026-10-26', estimate: 60, start: 450, focus: false, due: null });
assert.equal(parse('Plan sprint 1h30 @9:15').estimate, 90);
assert.equal(parse('Deep work 1.5h 14:00').start, 840);
assert.equal(parse('Lunch 12pm').start, 720);
assert.equal(parse('Late call 12am').start, 0);
assert.equal(parse('Essay due fri inbox 3h').due, '2026-10-30');
assert.equal(parse('Report due Oct 25th').due, '2026-10-25');
assert.equal(parse('Visa due 3/11').due, '2026-11-03');
assert.equal(parse('Taxes due 2027-01-31').due, '2027-01-31');
assert.equal(parse('Renew passport inbox 30m').day, null);
assert.equal(parse('Read 3 chapters of 3D modelling v2 at home').title, 'Read 3 chapters of 3D modelling v2 at home');
assert.equal(parse('Call 10m 5pm about 20m slot').title, 'Call about 20m slot');
for (const value of ['Thing 25:00', 'Thing 13pm', 'Thing 9:75']) assert.equal(parse(value).start, null);
for (const value of ['Thing 0m', 'Thing 30h']) assert.equal(parse(value).estimate, null);
const fixed = { table: 'daily_plan_blocks', id: 'fixed', seq: 1, data: { day: task.day, start_minute: 540, duration_minutes: 60, task_id: null } };
const linked = { table: 'daily_plan_blocks', id: 'linked', seq: 2, data: { day: task.day, start_minute: 600, duration_minutes: 60, task_id: task.id } };
assert.equal(planCapacity([task], [fixed, linked], task.day, planSettings([])).planned, 90, 'task estimates and linked blocks are not counted twice');
assert.equal(planCapacity([task], [fixed], task.day, planSettings([])).available, 408);
let counter = 0;
const scheduled = scheduleDay([task, { ...second, position: 2 }], [fixed], task.day, 540, timestamp(), () => `block-${++counter}`);
assert.equal(scheduled.edits[0].fields.start_minute, 600, 'scheduler works around fixed blocks');
assert.equal(scheduled.edits[1].fields.start_minute, 630, 'scheduled task blocks do not overlap');
assert.equal(scheduleDay([{ ...task, estimate_minutes: 1440 }], [], task.day, 540, timestamp(), () => 'block').leftOver.length, 1);
const replanned = scheduleDay([task], [linked], task.day, 660, timestamp(), () => 'unused', true);
assert.equal(replanned.edits[0].fields.start_minute, 660);
assert.throws(() => createBlock('bad', task.day, 1430, 30, timestamp()));
assert.throws(() => createBlock('bad', task.day, 600, 2, timestamp()));
const routine = { table: 'daily_plan_routines', id: 'routine-1', seq: 1, data: { title: 'Daily review', start_minute: 960, duration_minutes: 30, weekdays: 127, color: 'purple' } };
const occurrence = applyRoutines([routine], [routine], task.day, timestamp())[0];
assert.equal(occurrence.id, `r-routine-1-${task.day}`, 'routine IDs match desktop exactly');
assert.equal(applyRoutines([routine], [routine, { table: 'daily_plan_blocks', id: occurrence.id, seq: 2, data: { deleted_at: timestamp() } }], task.day, timestamp()).length, 0, 'skipped occurrences are never resurrected');
assert.equal(weekdayBit(task.day), 64, 'Sunday is bit six');
const future = { table: 'daily_plan_blocks', id: 'future', seq: 2, data: { routine_id: routine.id, day: '2026-10-26' } };
const past = { table: 'daily_plan_blocks', id: 'past', seq: 3, data: { routine_id: routine.id, day: '2026-10-24' } };
const deletedRoutine = changeRoutine(routine, null, [routine, future, past], task.day, timestamp(), 'unused');
assert.deepEqual(deletedRoutine.map(row => row.id), [routine.id, future.id], 'deleting routines preserves history');
const changedRoutine = changeRoutine(routine, { ...routine.data, title: 'Updated', weekdays: 64 }, [future, past], task.day, timestamp(), 'unused');
assert.ok(changedRoutine.find(row => row.id === future.id).fields.deleted_at, 'unchosen future weekdays lose their block');
const rituals = [-2, -1, 0].map(back => ({ table: 'daily_plan_days', id: shiftDay(task.day, back), seq: 1, data: { planned_at: timestamp(), shutdown_at: back === 0 ? null : timestamp() } }));
const insights = planInsights([task, { ...second, actual_minutes: 60 }, { ...second, id: '3', actual_minutes: 30 }, { ...task, id: '4', actual_minutes: 45 }], rituals, task.day);
assert.equal(insights.plannedStreak, 3);
assert.equal(insights.shutdownStreak, 2);
assert.equal(insights.pace, 1.5);
assert.equal(insights.days.length, 14);
assert.equal(visibleRecords(base, [{ ...change({ deleted_at: timestamp() }), operation: 'delete' }], true).length, 1, 'routine layout can inspect tombstones');
function timestamp() { return '2026-10-25T12:00:00Z'; }
console.log('PASS: sync validation; priorities; cleanup; timer exclusivity; quick-add tokens and dates; ordering; capacity; fit/replan; routine IDs and skips; historical routine updates; insights and streaks.');
