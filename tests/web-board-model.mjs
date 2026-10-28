import assert from 'node:assert/strict';
import { addChecklist, archiveCard, boardInsights, checklistToCard, createCard, createProject, deleteCard, deleteColumn, deleteLabel, deleteProject, fromTemplate, ordered, reorderColumn, rows, saveCard, saveColumn, saveTemplate, setCardLabels } from '../site/src/lib/terminal/board.ts';
import { completePlannerTask, moveBoardCard, planCard } from '../site/src/lib/terminal/boardPlanner.ts';
import { coalesceEdits, readableTable, validateChanges, visibleRecords } from '../site/src/lib/terminal/protocol.ts';
import { boardId } from '../site/src/lib/terminal/ids.ts';
const ids = Array.from({ length: 10000 }, () => boardId());
assert.equal(new Set(ids).size, ids.length); assert.deepEqual([...ids].sort(), ids);
assert.ok(ids.every(id => /^[a-f\d]{8}-[a-f\d]{4}-7[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(id)));
let records = [], key = 0, operation = 0;
const at = '2026-10-25T12:00:00.000Z', newId = () => `board-${++key}`;
const apply = edits => {
  const changes = coalesceEdits(edits).map(edit => ({ ...edit, changed_at: Date.now(), operation: `op-${++operation}` }));
  for (let index = 0; index < changes.length; index += 100) validateChanges(changes.slice(index, index + 100));
  records = visibleRecords(records, changes, true); return edits;
};
const projectEdits = apply(createProject('Launch', records, at, newId)), projectId = projectEdits[0].id;
assert.deepEqual(ordered(rows(records, 'columns')).map(row => row.data.name), ['Backlog', 'To do', 'Doing', 'Done']);
const [backlog, todo, doing, done] = ordered(rows(records, 'columns'));
const get = id => records.find(row => row.id === id);
const fields = title => ({ title, description: 'Details', priority: 3, start_date: '2026-10-24', due_date: '2026-10-25', estimate: 2, recurrence: 'weekly' });
const cardId = apply(saveCard(null, backlog.id, fields('First card'), null, records, at, newId))[0].id;
assert.equal(get(cardId).data.title, 'First card'); assert.equal(get(cardId).data.estimate, 2);
assert.throws(() => saveCard(get(cardId), backlog.id, { start_date: '2026-10-28' }, null, records, at, newId), /Start date/);
const childId = apply(createCard(backlog.id, 'Child', records, at, newId, cardId))[0].id;
assert.throws(() => createCard(backlog.id, 'Grandchild', records, at, newId, childId), /one level deep/);
const item = addChecklist(cardId, 'Review', records, newId); apply([item]); apply([{ table: item.table, id: item.id, fields: { done: true } }]);
const converted = apply(checklistToCard(item.id, records, at, newId))[0];
assert.equal(get(converted.id).data.column_id, done.id); assert.equal(get(converted.id).data.parent_task_id, cardId); assert.ok(get(converted.id).data.completed_at);
assert.ok(get(item.id).data.deleted_at);
const labelId = newId(); apply([{ table: 'project_board_labels', id: labelId, fields: { id: labelId, project_id: projectId, name: 'Urgent', color: 'red', deleted_at: null } }]);
apply(setCardLabels(cardId, [labelId, labelId], records, at, newId));
assert.equal(rows(records, 'task_labels').filter(row => row.data.task_id === cardId).length, 1);
assert.throws(() => setCardLabels(cardId, ['foreign-label'], records, at, newId), /this project/);
const freshItem = addChecklist(cardId, 'Ship', records, newId); apply([freshItem]);
const template = saveTemplate(cardId, 'Launch recipe', records, at, newId); apply([template]);
const copy = apply(fromTemplate(template.id, todo.id, records, at, newId))[0];
assert.equal(get(copy.id).data.title, 'First card'); assert.equal(get(copy.id).data.start_date, null); assert.equal(get(copy.id).data.due_date, null);
assert.equal(rows(records, 'checklist_items').find(row => row.data.task_id === copy.id).data.done, false);
assert.equal(rows(records, 'task_labels').find(row => row.data.task_id === copy.id).data.label_id, labelId);
assert.equal(readableTable('project_board_templates'), true);
const foreign = apply(createProject('Other project', records, at, newId))[0].id;
const foreignColumn = rows(records, 'columns').find(row => row.data.project_id === foreign);
assert.throws(() => moveBoardCard(cardId, foreignColumn.id, records, at, newId), /own project/);
assert.throws(() => fromTemplate(template.id, foreignColumn.id, records, at, newId), /another project/);
assert.throws(() => deleteColumn(backlog.id, records, at), /Move this column/);
apply(moveBoardCard(cardId, doing.id, records, at, newId));
assert.equal(get(cardId).data.column_id, doing.id); assert.equal(get(cardId).data.completed_at, null);
const titleChanged = { ...fields('Edited before recurring'), recurrence: 'monthly' };
const completionEdits = apply(saveCard(get(cardId), done.id, titleChanged, null, records, at, newId));
const next = completionEdits.find(edit => edit.table === 'project_board_tasks' && edit.id !== cardId);
assert.ok(get(cardId).data.completed_at); assert.equal(get(cardId).data.recurrence, null);
assert.equal(next.fields.title, 'Edited before recurring'); assert.equal(next.fields.due_date, '2026-11-25'); assert.equal(next.fields.recurrence, 'monthly');
assert.ok(rows(records, 'checklist_items').some(row => row.data.task_id === next.id && row.data.text === 'Ship' && !row.data.done));
const count = rows(records, 'tasks').length; apply(moveBoardCard(cardId, todo.id, records, at, newId)); apply(moveBoardCard(cardId, done.id, records, at, newId));
assert.equal(rows(records, 'tasks').length, count, 'reopening and re-completing the original cannot duplicate its next occurrence');
const reordered = moveBoardCard(next.id, doing.id, records, at, newId, null); apply(reordered);
const laterId = apply(createCard(doing.id, 'Later', records, at, newId))[0].id;
apply(moveBoardCard(laterId, doing.id, records, at, newId, next.id)); assert.ok(get(laterId).data.position < get(next.id).data.position);
const beforeColumn = doing.data.position; apply(reorderColumn(doing.id, -1, records)); assert.ok(get(doing.id).data.position < beforeColumn);
// Changing a column's done flag is a bulk status edit; it does not spawn recurrence copies.
const columnCount = rows(records, 'tasks').length;
apply(saveColumn(get(doing.id), projectId, { name: 'Completed together', is_done: true, wip_limit: 1 }, records, at, newId));
assert.equal(rows(records, 'tasks').length, columnCount); assert.ok(get(next.id).data.completed_at); assert.equal(get(next.id).data.recurrence, 'monthly');
apply(archiveCard(get(next.id), true, at, newId)); assert.equal(get(next.id).data.archived, true);
apply(archiveCard(get(next.id), false, at, newId)); assert.equal(get(next.id).data.archived, false);
const emptyColumn = apply(saveColumn(null, projectId, { name: 'Empty', is_done: false, wip_limit: null }, records, at, newId))[0];
apply(deleteColumn(emptyColumn.id, records, at)); assert.ok(get(emptyColumn.id).data.deleted_at);
apply(deleteLabel(labelId, records, at)); assert.equal(rows(records, 'task_labels').filter(row => row.data.label_id === labelId).length, 0);
const afterLabelCopy = apply(fromTemplate(template.id, todo.id, records, at, newId))[0];
assert.equal(rows(records, 'task_labels').filter(row => row.data.task_id === afterLabelCopy.id).length, 0, 'templates skip labels deleted since they were saved');
// Planner linking uses the same board model and status transitions.
const planned = planCard(childId, '2026-10-25', [], records, at, 'planner-link'); apply(planned);
assert.equal(planned[0].fields.board_task_id, childId);
const plannerTask = { id: 'planner-link', title: 'Child', notes: '', day: '2026-10-25', position: 1, focus_rank: null, estimate_minutes: null, actual_minutes: 0, done_at: null, timer_started_at: null, board_task_id: childId, due_date: null };
apply(completePlannerTask(plannerTask, records, records, at, newId)); assert.ok(get(childId).data.completed_at);
const stats = boardInsights(projectId, records, '2026-10-25'); assert.equal(stats.weeks.length, 8); assert.equal(stats.days.length, 30); assert.ok(stats.completed > 0);
apply(deleteCard(cardId, records, at)); assert.equal(get(childId).data.parent_task_id, null, 'deleting a parent promotes rather than destroys its subtasks');
assert.equal(rows(records, 'checklist_items').filter(row => row.data.task_id === cardId).length, 0); assert.equal(rows(records, 'task_events').filter(row => row.data.task_id === cardId).length, 0);
apply(deleteProject(projectId, records, at));
for (const table of ['projects', 'columns', 'labels', 'templates', 'tasks']) assert.equal(rows(records, table).filter(row => row.id === projectId || row.data.project_id === projectId).length, 0);
assert.ok(rows(records, 'projects').some(row => row.id === foreign), 'deleting one project leaves the other project intact');
for (const bad of [
  { table: 'project_board_templates', id: 'bad', fields: { label_ids: '["ok", 4]' } },
  { table: 'project_board_templates', id: 'bad', fields: { checklist: '{"bad": true}' } },
  { table: 'project_board_columns', id: 'bad', fields: { wip_limit: 0 } },
  { table: 'project_board_tasks', id: 'bad', fields: { start_date: '2026-10-27', due_date: '2026-10-25' } },
]) assert.throws(() => validateChanges([{ ...bad, changed_at: Date.now() }]));
console.log('PASS: project/column/card CRUD; reorder/status/recurrence/history; checklists/subtasks; label scope; templates; archive; planner links; insights; cascading deletion; validation.');
