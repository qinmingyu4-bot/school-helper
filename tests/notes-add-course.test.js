const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const notes = fs.readFileSync(require.resolve('../public/course-notes.js'), 'utf8');
const helper = app.slice(app.indexOf('  async function addStudyCourse('), app.indexOf('  async function selectConversation('));

function studyHarness(result = { course: { id: 'new-course' } }) {
  const calls = [];
  const context = vm.createContext({
    state: { page: 'tools', tool: 'notes', courses: [{ id: 'existing' }], user: { id: 'alice' } }, pageLoadGeneration: 0,
    ui: { text: x => x }, mobileNavigation: { closeStudyPanel() {} },
    async loadPage(page) { context.pageLoadGeneration++; context.state.page = page; calls.push(page); },
    async studyCourseDialog(options) { calls.push('dialog'); if (result) await options.submit('CSC108'); return result; },
    async api(path, options) { calls.push([path, options.body.name]); },
    async selectConversation(id) { calls.push(id); }
  });
  vm.runInContext(helper, context);
  return { context, calls };
}

test('notes creates a shared Study course in place; existing Study entry still opens the course', async () => {
  const h = studyHarness();
  const created = await h.context.addStudyCourse({ fromNotes: true });
  assert.equal(created.id, 'new-course');
  assert.equal(h.context.state.page, 'tools');
  assert.deepEqual(Array.from(h.context.state.courses, c => c.id), ['new-course', 'existing']);
  assert.deepEqual(h.calls, ['dialog', ['/api/courses', 'CSC108']]);
  const existing = studyHarness();
  await existing.context.addStudyCourse();
  assert.deepEqual(existing.calls, ['dialog', ['/api/courses', 'CSC108'], 'new-course']);
});

test('cancel preserves the page and course list; stale creation cannot change the active selection or account', async () => {
  const canceled = studyHarness(null);
  assert.equal(await canceled.context.addStudyCourse({ fromNotes: true }), undefined);
  assert.deepEqual(canceled.calls, ['dialog']);
  assert.equal(canceled.context.state.page, 'tools');
  assert.deepEqual(Array.from(canceled.context.state.courses, c => c.id), ['existing']);
  for (const changed of ['page', 'account', 'generation', 'tool']) {
    const h = studyHarness();
    h.context.studyCourseDialog = async () => {
      if (changed === 'page') h.context.state.page = 'profile';
      if (changed === 'account') h.context.state.user.id = 'bob';
      if (changed === 'generation') h.context.pageLoadGeneration++;
      if (changed === 'tool') h.context.state.tool = 'docs';
      return { course: { id: 'new-course' } };
    };
    assert.equal(await h.context.addStudyCourse({ fromNotes: true }), undefined);
    assert.deepEqual(h.calls, []);
    assert.equal(h.context.state.courses.length, changed === 'account' ? 1 : 2);
  }
});

test('empty and populated course pickers always offer localized Add course without changing material picker', () => {
  for (const populated of [false, true]) for (const english of [false, true]) {
    const nodes = {};
    for (const key of ['course', 'document']) {
      nodes[`[data-${key}]`] = { options: [{ value: '', textContent: 'Choose' }, ...(populated ? [{ value: 'c', textContent: 'CSC108' }] : [])], selectedOptions: [] };
      nodes[`[data-picker-toggle="${key}"]`] = { querySelector: () => ({}), setAttribute() {} };
      nodes[`#note-${key}-menu`] = { hidden: true };
    }
    const c = vm.createContext({ host: {}, busy: false, $: key => nodes[key], t: (zh, en) => english ? en : zh, esc: x => x });
    vm.runInContext(notes.slice(notes.indexOf('  function syncPickers()'), notes.indexOf('  function openPicker(')), c);
    c.syncPickers();
    assert.equal(nodes['[data-picker-toggle="course"]'].disabled, false);
    assert.match(nodes['#note-course-menu'].innerHTML, /data-note="add-course"/);
    assert.ok(nodes['#note-course-menu'].innerHTML.includes(english ? 'Add course' : '添加课程'));
    assert.doesNotMatch(nodes['#note-document-menu'].innerHTML, /add-course/);
  }
});

test('notes saves before creating, blocks duplicate clicks and preserves the material on cancel or save failure', async () => {
  for (const failure of [false, true]) {
    const calls = []; let click, finish;
    const c = vm.createContext({
      host: { addEventListener: (_name, fn) => { click = fn; } }, busy: false, epoch: 0,
      items: [], selectedSticky: -1, finishGesture() {}, syncControls() {}, paint() {},
      closePickers: () => calls.push('close'), status: message => calls.push(message),
      save: () => new Promise((resolve, reject) => { calls.push('save'); finish = () => failure ? reject(new Error('offline')) : resolve(); }),
      ctx: { addStudyCourse: async () => { calls.push('dialog'); return null; } }
    });
    const handler = notes.slice(notes.indexOf('  function bind() {'), notes.indexOf("    host.addEventListener('change'")) + '\n}';
    vm.runInContext(handler, c); c.bind();
    const event = { target: { closest: () => ({ dataset: { note: 'add-course' } }) } };
    const pending = click(event); await click(event);
    assert.deepEqual(calls, ['close', 'save']);
    finish(); await pending;
    assert.deepEqual(calls, ['close', 'save', failure ? 'offline' : 'dialog']);
    assert.equal(c.busy, false);
  }
});

test('successful in-place creation selects the new course for upload without navigation', async () => {
  const calls = [], select = {}; let click;
  const c = vm.createContext({
    host: { addEventListener: (_name, fn) => { click = fn; } }, busy: false, epoch: 0,
    course: 'old', items: [], selectedSticky: -1, finishGesture() {}, syncControls() {}, paint() {},
    closePickers() {}, save: async () => {}, status: message => { throw Error(message); },
    ctx: { courses: [{ id: 'old' }], addStudyCourse: async () => ({ id: 'new-course' }) },
    mount: async context => { calls.push(Array.from(context.courses, course => course.id)); },
    switchCourse: async id => { c.course = id; }, $: () => select, syncPickers() {}
  });
  vm.runInContext(notes.slice(notes.indexOf('  function bind() {'), notes.indexOf("    host.addEventListener('change'")) + '\n}', c);
  c.bind();
  await click({ target: { closest: () => ({ dataset: { note: 'add-course' } }) } });
  assert.deepEqual(calls, [['new-course', 'old']]);
  assert.equal(select.value, 'new-course');
  assert.equal(c.busy, false);
});
