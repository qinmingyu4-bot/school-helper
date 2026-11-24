const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { startGoogleOAuth, verifyGoogleOAuth } = require('../lib/google-oauth');
const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const handler = source.slice(source.indexOf('  async function handleAction('), source.indexOf('  function keepLatestAfterFontLoad('));
const requestWithTimeout = source.slice(source.indexOf('  async function apiWithTimeout('), source.indexOf('  function loadLoginConfig('));
function harness(action, fail = false) {
  const calls = [], state = { user: { id: 'alice' }, page: 'study', toast: '' };
  const cleanup = new Proxy({}, { get: (_, key) => () => calls.push(key) });
  const location = { href: 'https://example.test/login?page=classmates&classmateChat=chat_123', replace: p => calls.push(p) };
  let expire;
  const context = vm.createContext({ action, state, URL, URLSearchParams, AbortController, location, ui: { text: x => x }, esc: String,
    window: { setTimeout: (callback) => { expire = callback; }, clearTimeout() {} },
    api: async (path, options) => {
      calls.push('request');
      if (path === '/api/auth/logout') {
        assert.equal(options.method, 'POST');
        if (fail === 'timeout') await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));
      }
      if (fail) throw Error('offline');
      return { user: state.user };
    },
    $: () => ({ value: '' }), isAdmin: () => false,
    officeTools: { takeSharedLink: () => null },
    loadPage: async page => { calls.push(page); location.href = 'https://example.test/app?page=' + page; },
    openPushLink: async url => calls.push(url.searchParams.get('classmateChat') || url.searchParams.get('scheduleItem')),
    learningLoop: cleanup, classmateNotifications: cleanup, dmAttachments: cleanup, mailboxView: cleanup,
    appearanceController: cleanup, studyHistoryCache: new Map([["kept", "history"]]), emailDraft: { kept: 'draft' }, scheduleQuickRequest: null, scheduleExtractionRequest: null,
    cancelScheduleVoice() {}, uploadPreviewUrls: new Map(), clearTimeout, learningStyleTimer: null,
    learningStyleEditor: null, studyReplies: new Map(), deferredStudyReply: {}, deferredStudyTasks: true, studyTasks: null, localStorage: cleanup,
    setToast: message => { state.toast = message; }, render: () => calls.push('render'),
    root: { querySelector: () => null, insertAdjacentHTML: () => calls.push('notice') }
  });
  vm.runInContext(handler + requestWithTimeout, context);
  const button = { dataset: { action }, isConnected: true };
  return { calls, state, context, button, run: () => context.handleAction(button), expire: () => expire() };
}
for (const problem of ['network error', 'timeout']) {
  test(`sign-out ${problem} keeps workspace and drafts and lets Settings offer retry`, async () => {
    const h = harness('logout', problem);
    const result = h.run();
    if (problem === 'timeout') h.expire();
    assert.equal(await result, false);
    assert.deepEqual(h.calls, ['request']);
    assert.equal(h.context.studyHistoryCache.get('kept'), 'history');
    assert.equal(h.context.emailDraft.kept, 'draft');
    assert.equal(h.state.user.id, 'alice');
    assert.equal(h.button.disabled, false);
  });
}
test('successful sign-out confirms invalidation before clearing private client state', async () => {
  const h = harness('logout'); assert.equal(await h.run(), true);
  assert.equal(h.calls[0], 'request'); assert.equal(h.calls.at(-1), '/login');
  assert.equal(h.context.emailDraft.kept, undefined); assert.equal(h.context.studyHistoryCache.size, 0);
  assert.equal(h.context.deferredStudyReply, null); assert.equal(h.context.deferredStudyTasks, false);
});
for (const [page, key, id] of [['classmates', 'classmateChat', 'chat_123'], ['schedule', 'scheduleItem', 'event_123']]) {
  test(`password login resumes the exact ${page} notification after URL rewriting`, async () => {
    const h = harness('login'); h.context.location.href = `https://example.test/login?page=${page}&${key}=${id}`;
    await h.run(); assert.deepEqual(h.calls, ['request', page, id]);
  });
  test(`Google signed state preserves the allowlisted ${page} destination`, () => {
    const oauth = startGoogleOAuth({ mode: 'login', target: { page, [key]: id, redirect: 'https://evil.test' } });
    const verified = verifyGoogleOAuth(oauth.state, oauth.cookie);
    assert.deepEqual(verified.target, { page, [key]: id });
    assert.throws(() => verifyGoogleOAuth(oauth.state + 'tampered', oauth.cookie));
  });
}
test('Google state rejects external or malformed destinations', () => {
  for (const target of [{ page: 'https://evil.test', classmateChat: 'x' }, { page: 'schedule', scheduleItem: '//evil.test' }]) {
    const oauth = startGoogleOAuth({ mode: 'login', target });
    assert.deepEqual(verifyGoogleOAuth(oauth.state, oauth.cookie).target, {});
  }
});
