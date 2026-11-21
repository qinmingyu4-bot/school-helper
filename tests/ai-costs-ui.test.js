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
  assert.match(costs.content.innerHTML, /总 AI 成本（官方消费）/);
  assert.match(costs.content.innerHTML, /官方账单暂不可用；不以本地估算代替/);
  assert.doesNotMatch(costs.content.innerHTML, /总 AI 成本（已记录）|AI 估算成本/);
  assert.equal((usage.controls.innerHTML.match(/data-admin-usage-days=/g) || []).length, 2);
  const choose = (value) => costs.onclick({ target: { closest: () => ({ dataset: { adminUsageDays: value } }) } });
  choose('90'); choose('all');
  pending[1]({ ...data, aiCosts: { ...data.aiCosts, calculatedUsd: 9 } }); await flush();
  pending[0](data); await flush();
  assert.doesNotMatch(costs.content.innerHTML, /总 AI 成本（已记录）|USD.*9\.00/);
  assert.equal(calls.filter((s) => s === '/api/admin/usage?days=7').length, 1);
  assert.ok(calls.includes('/api/admin/ai-costs?period=all'));
  i18n.setLanguage('en', false); ui.sync();
  assert.match(costs.controls.innerHTML, /Last 365 days/);
  assert.match(costs.content.innerHTML, /Total AI cost \(official spend\)/);
  i18n.setLanguage('zh-CN', false);
});

test('official total stays authoritative and historical versus new gaps remain visible',async()=>{
  i18n.setLanguage('zh-CN',false);
  const usage=host(),costs=host(),context={StudyBridgeI18n:i18n,document:{},AbortController};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../public/admin-usage'),'utf8'),context);
  const data={from:'2026-11-15',through:'2026-11-21',since:'2026-11-20T13:57:00Z',activeUsers:0,firstStudy:{reached:0,eligible:0},retention:{day1:{reached:0,eligible:0},day7:{reached:0,eligible:0}},failed:0,completed:0,trend:[],features:[],costUsd:0.662639,
    aiCosts:{since:'2026-11-20T13:57:00Z',calculatedUsd:1,userUsd:.2,platformUsd:.8,sources:[],unknownRequests:0,pendingRequests:0,estimatedUsd:0,
      official:{status:'available',amountUsd:15,from:'2026-11-15',through:'2026-11-21',fetchedAt:'2026-11-21T06:00:00Z',stale:true,items:[]},
      reconciliation:{status:'available',attributedUsd:1,historicalUsd:12,transitionDifferenceUsd:3,currentDifferenceUsd:-1,unclassifiedUsd:0,transitionDay:'2026-11-20',features:[],daily:[]}}};
  const ui=context.StudyBridgeAdminUsage.create({root:{querySelector:s=>s==='[data-admin-costs]'?costs:usage},getAdmin:()=> 'owner',api:async()=>data});
  ui.sync();await flush();
  assert.match(costs.content.innerHTML, /总 AI 成本（官方消费）<\/dt><dd>USD.?15\.00/);
  assert.match(costs.content.innerHTML,/历史未归属费用/);assert.match(costs.content.innerHTML,/启用后待核对差额/);
  assert.match(costs.content.innerHTML,/-USD.?1\.00|USD.?-1\.00/);
  assert.match(costs.content.innerHTML,/上次成功同步/);assert.doesNotMatch(usage.content.innerHTML,/0\.662639|AI 估算成本/);
});
