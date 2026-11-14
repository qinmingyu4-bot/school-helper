const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const daily = require('../public/daily-checklist');
const batch = require('../lib/schedule-batch');
const management = require('../public/schedule-management');
const { StudyBridgeDatabase } = require('../lib/database');
const row = (id, extra = {}) => ({ id, docId: id, courseId: 'math', title: id, kind: 'DDL', startsAt: '2026-11-13T18:00', timeZone: 'Asia/Shanghai', ...extra });

test('today aggregates courses, separates events, preserves due-day visibility and leaves backlog for explicit planning', () => {
  const items = [row('essay', { courseId: 'english', plannedDate: '2026-11-12' }), row('future', { startsAt: '2026-11-20T18:00', plannedDate: '2026-11-13' }), row('old', { startsAt: '2026-11-10T18:00' }), row('review', { kind: 'EVENT', learningTopicId: 'topic' }), row('lecture', { kind: 'LEC' }), row('exam', { title: 'Final exam' }), row('club', { kind: 'EVENT' })];
  const m = daily.model(items, '2026-11-13');
  assert.deepEqual(m.tasks.map(i => i.id), ['essay', 'future', 'review']);
  assert.deepEqual(m.overdue.map(i => i.id), ['old']);
  assert.deepEqual(m.events.map(i => i.id), ['lecture', 'exam', 'club']);
  assert.equal(new Set(m.tasks.map(i => i.id)).size, m.tasks.length);
});

test('plans keep deadlines and learning links; quantity completion and undo stay consistent', () => {
  const source = row('assignment', { learningTopicId: 'topic', notes: 'original', goalTarget: 20, goalProgress: 12 });
  const planned = management.applyPatch(source, { plannedDate: '2026-11-15' });
  assert.equal(planned.startsAt, source.startsAt);
  assert.equal(planned.learningTopicId, 'topic');
  assert.equal(planned.notes, 'original');
  const completed = management.applyPatch(planned, { goalProgress: 20 });
  assert.ok(completed.completedAt);
  assert.equal(management.applyPatch(completed, { completed: false }).goalProgress, 0);
  assert.equal(management.applyPatch(completed, { goalProgress: 19 }).completedAt, '');
  assert.throws(() => management.applyPatch(source, { goalProgress: 21 }));
  assert.throws(() => management.applyPatch(source, { plannedDate: '2026-02-30' }));
  assert.throws(() => management.applyPatch(source, { completed: 'true' }));
  assert.throws(() => management.applyPatch(source, { goalTarget: 30 }));
  assert.throws(() => management.applyPatch(row('class', { kind: 'LEC' }), { completed: true }));
});

test('untimed goals move with their calendar date without changing task semantics', () => {
  const goal = row('goal', { checklist: true, untimed: true, plannedDate: '2026-11-13', startsAt: '2026-11-13T23:59', kind: 'EVENT' });
  const moved = management.applyPatch(goal, { plannedDate: '2026-11-14' });
  assert.equal(moved.startsAt, '2026-11-14T23:59');
  const calendarEdit = management.applyPatch(moved, { date: '2026-11-16', startTime: '09:00' });
  assert.equal(calendarEdit.plannedDate, '2026-11-16');
  assert.equal(daily.model([calendarEdit], '2026-11-16').tasks.length, 1);
});

test('real course storage, reload, edits and access isolation share the schedule record', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-daily-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, 'db.json');
  await db.createCourse({ id: 'math', userId: 'alice', name: 'Mathematics' });
  await db.createCourse({ id: 'private', userId: 'bob', name: 'Private' });
  const normalize = courseId => batch.normalizeBatch({ timeZone: 'Asia/Shanghai', items: [{ title: 'Review 20 cards', kind: 'EVENT', courseId, course: 'Mathematics', startsAt: '2026-11-13T23:59', checklist: true, untimed: true, plannedDate: '2026-11-13', goalTarget: 20, goalProgress: 0 }] });
  const saved = await db.importScheduleBatch('alice', normalize('math'));
  assert.equal(saved.records[0].courseId, 'math');
  await assert.rejects(db.importScheduleBatch('alice', normalize('private')), /Course not found/);
  const docId = saved.records[0].id;
  const change = { operation: 'edit', items: [{ courseId: 'math', docId }], patch: { goalProgress: 20 } };
  await assert.rejects(db.manageScheduleItems('bob', change));
  await db.manageScheduleItems('alice', change);
  const restarted = new StudyBridgeDatabase(); restarted.local.file = db.local.file;
  const items = batch.storedItems(await restarted.listCourses('alice'), await restarted.listDocuments('alice', 'math'), 'alice');
  assert.equal(items.length, 1); assert.equal(items[0].goalProgress, 20); assert.ok(items[0].completedAt);
  assert.equal(daily.model(items, '2026-11-13').done, 1);
  await restarted.manageScheduleItems('alice', { ...change, patch: { completed: false, plannedDate: '2026-11-14' } });
  assert.equal(batch.storedItems(await restarted.listCourses('alice'), await restarted.listDocuments('alice', 'math'), 'alice')[0].startsAt, '2026-11-14T23:59');
});

test('render escapes imported content and exposes course and learning links in both languages', () => {
  const ui = require('../public/i18n');
  const items = [row('x', { title: '<script>alert(1)</script>', learningTopicId: 'topic', course: 'Math' })];
  items[0].startsAt = require('../public/schedule-import').todayInZone('UTC') + 'T18:00';
  const zh = daily.render(items, [{ id: 'math', name: 'Math' }]);
  assert.ok(!zh.includes('<script>')); assert.match(zh, /data-action="select-course"/); assert.match(zh, /learning-start/);
  ui.setLanguage('en');
  try { assert.match(daily.render(items, []), /Today's|Today/); } finally { ui.setLanguage('zh-CN'); }
});
