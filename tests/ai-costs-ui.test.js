const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const i18n = require('../public/i18n');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function host() {
  const controls = {}, content = { setAttribute() {} };
  return { isConnected: true, controls, content, querySelector: (s) => s.includes('controls') ? controls : content };
}
test('cost range controls are independent, bilingual, and ignore superseded responses', async () => {
  const usage = host(), costs = host(), calls = [], pending = [];
  const root = { querySelector: (s) => s === '[data-admin-costs]' ? costs : usage };
  const context = { StudyBridgeI18n: i18n, document: {}, AbortController };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../public/admin-usage'), 'utf8'), context);
  const data = { from: '2026-11-14', through: '2026-11-20', since: '2026-11-14T00:00:00Z', activeUsers: 0,
    firstStudy: { reached: 0, eligible: 0 }, retention: { day1: { reached: 0, eligible: 0 }, day7: { reached: 0, eligible: 0 } },
    failed: 0, completed: 0, trend: [], features: [], aiCosts: { since: '2026-11-14T00:00:00Z', calculatedUsd: 3,
      userUsd: 1, platformUsd: 2, unknownRequests: 0, pendingRequests: 0, estimatedUsd: 0, sources: [], official: { status: 'not_configured' } } };
  const ui = context.StudyBridgeAdminUsage.create({ root, getAdmin: () => 'owner', api: (path) => {
    calls.push(path);
    if (path.includes('period=90') || path.includes('period=all')) return new Promise(resolve => pending.push(resolve));
    return Promise.resolve(data);
  } });
  i18n.setLanguage('zh-CN', false);
  ui.sync(); await flush();
  assert.match(ui.html(), /总 AI 成本/);
  assert.equal((costs.controls.innerHTML.match(/data-admin-usage-days=/g) || []).length, 6);
  assert.match(costs.content.innerHTML, /总 AI 成本（已记录）/);
  assert.match(costs.content.innerHTML, /USD.*3\.00/);
  assert.equal((usage.controls.innerHTML.match(/data-admin-usage-days=/g) || []).length, 2);
  const choose = (value) => costs.onclick({ target: { closest: () => ({ dataset: { adminUsageDays: value } }) } });
  choose('90'); choose('all');
  pending[1]({ ...data, aiCosts: { ...data.aiCosts, calculatedUsd: 9 } }); await flush();
  pending[0](data); await flush();
  assert.match(costs.content.innerHTML, /USD.*9\.00/);
  assert.equal(calls.filter((s) => s === '/api/admin/usage?days=7').length, 1);
  assert.ok(calls.includes('/api/admin/ai-costs?period=all'));
  i18n.setLanguage('en', false); ui.sync();
  assert.match(costs.controls.innerHTML, /Last 365 days/);
  assert.match(costs.content.innerHTML, /Total AI cost \(recorded\)/);
  i18n.setLanguage('zh-CN', false);
});
