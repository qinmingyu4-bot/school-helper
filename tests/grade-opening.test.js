const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(language = 'zh', categories = []) {
  let resolve, reject;
  const requests = [];
  const root = { innerHTML: '', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const dialog = { addEventListener() {} };
  const scope = { getElementById: id => id === 'grade-app' ? root : id === 'grade-dialog' ? dialog : null, addEventListener() {} };
  const host = { isConnected: true, dataset: {}, attachShadow: () => scope };
  const context = { console, URL, crypto: require('node:crypto'), setTimeout, clearTimeout,
    MutationObserver: class { observe() {} disconnect() {} }, addEventListener() {}, removeEventListener() {},
    document: { documentElement: { dataset: {}, lang: language }, getElementById: () => null },
    StudyBridgeGrades: require('../public/grade-planner-model'), StudyBridgeGradeLocations: require('../public/grade-locations'),
    fetch(url) { requests.push(url); return new Promise((yes, no) => { resolve = yes; reject = no; }); }
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/grade-planner.js'), 'utf8'), context);
  return { root, host, requests, mount: () => context.StudyBridgeGradePlanner.mount(host),
    finish: () => resolve({ ok: true, json: async () => ({ userId: 'test', csrfToken: 'test', courses: [{ id: 'course', name: 'Course', code: 'C', term: '', version: 0, categories }] }) }),
    fail: () => reject(new Error('offline')) };
}

test('slow grade reads paint localized feedback immediately and mount only one request', async () => {
  for (const language of ['zh', 'en']) {
    const f = fixture(language), pending = f.mount();
    assert.match(f.root.innerHTML, language === 'zh' ? /正在读取课程成绩/ : /Loading course grades/);
    assert.match(f.root.innerHTML, /role="status"/);
    await f.mount();
    assert.deepEqual(f.requests, ['/api/grade-planner']);
    f.finish(); await pending;
    assert.match(f.root.innerHTML, /Course/);
    assert.doesNotMatch(f.root.innerHTML, /Loading course grades|正在读取课程成绩/);
    assert.deepEqual(f.requests, ['/api/grade-planner'], 'empty rules must not start PDF/link scanning');
  }
});

test('a failed or abandoned grade read cannot leave a silent blank page or paint a detached workspace', async () => {
  const failed = fixture(), pending = failed.mount(); failed.fail(); await pending;
  assert.match(failed.root.innerHTML, /Unable to load grades/);
  const gone = fixture(), abandoned = gone.mount(), loading = gone.root.innerHTML;
  gone.host.isConnected = false; gone.finish(); await abandoned;
  assert.equal(gone.root.innerHTML, loading);
});
