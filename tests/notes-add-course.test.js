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
    state: { page: 'tools', user: { id: 'alice' } }, pageLoadGeneration: 0,
    ui: { text: x => x }, mobileNavigation: { closeStudyPanel() {} },
    async loadPage(page) { context.pageLoadGeneration++; context.state.page = page; calls.push(page); },
    async studyCourseDialog(options) { calls.push('dialog'); if (result) await options.submit('CSC108'); return result; },
    async api(path, options) { calls.push([path, options.body.name]); },
    async selectConversation(id) { calls.push(id); }
  });
  vm.runInContext(helper, context);
  return { context, calls };
}

test('notes navigates to Study before reusing course creation; existing Study entry still works', async () => {
  const h = studyHarness();
  await h.context.addStudyCourse({ fromNotes: true });
  assert.deepEqual(h.calls, ['study', 'dialog', ['/api/courses', 'CSC108'], 'new-course']);
  const existing = studyHarness();
  await existing.context.addStudyCourse();
  assert.deepEqual(existing.calls, ['dialog', ['/api/courses', 'CSC108'], 'new-course']);
});

test('cancel does not create/select a course; stale navigation does not open a dialog', async () => {
  const canceled = studyHarness(null);
  await canceled.context.addStudyCourse({ fromNotes: true });
  assert.deepEqual(canceled.calls, ['study', 'dialog']);
  for (const changed of ['page', 'account', 'generation']) {
    const h = studyHarness();
    h.context.loadPage = async () => {
      h.context.pageLoadGeneration++;
      h.context.state.page = changed === 'page' ? 'profile' : 'study';
      if (changed === 'account') h.context.state.user.id = 'bob';
      if (changed === 'generation') h.context.pageLoadGeneration++;
    };
    await h.context.addStudyCourse({ fromNotes: true });
    assert.deepEqual(h.calls, []);
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

test('notes saves before leaving, blocks duplicate clicks and stays in place on save failure', async () => {
  for (const failure of [false, true]) {
    const calls = []; let click, finish;
    const c = vm.createContext({
      host: { addEventListener: (_name, fn) => { click = fn; } }, busy: false, epoch: 0,
      items: [], selectedSticky: -1, finishGesture() {}, syncControls() {}, paint() {},
      closePickers: () => calls.push('close'), status: message => calls.push(message),
      save: () => new Promise((resolve, reject) => { calls.push('save'); finish = () => failure ? reject(new Error('offline')) : resolve(); }),
      ctx: { addStudyCourse: async () => calls.push('navigate') }
    });
    const handler = notes.slice(notes.indexOf('  function bind() {'), notes.indexOf("    host.addEventListener('change'")) + '\n}';
    vm.runInContext(handler, c); c.bind();
    const event = { target: { closest: () => ({ dataset: { note: 'add-course' } }) } };
    const pending = click(event); await click(event);
    assert.deepEqual(calls, ['close', 'save']);
    finish(); await pending;
    assert.deepEqual(calls, ['close', 'save', failure ? 'offline' : 'navigate']);
    assert.equal(c.busy, false);
  }
});
