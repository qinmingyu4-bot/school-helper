const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reconcileCosts } = require('../lib/ai-cost-reconciliation');
const row = (day, amountMicros, source='study') => ({startedAt:day+'T15:00:00Z',amountMicros,source,model:'mock',trigger:'interactive'});
test('daily reconciliation separates history, installation day and new differences without hiding negative gaps', () => {
  const rows=[row('2026-11-20',1000000),row('2026-11-21',2000000),row('2026-11-21',500000,'unattributed'),row('2026-11-21',null),row('2026-11-22',9000000)];
  const official={status:'available',amountUsd:14,from:'2026-11-19',through:'2026-11-21',days:[{day:'2026-11-19',amountUsd:10},{day:'2026-11-20',amountUsd:3},{day:'2026-11-21',amountUsd:1}]};
  const r=reconcileCosts(rows,official,'2026-11-20T13:57:00Z');
  assert.equal(r.historicalUsd,10);assert.equal(r.transitionDifferenceUsd,2);assert.equal(r.currentDifferenceUsd,-1.5);
  assert.equal(r.attributedUsd,3);assert.equal(r.unclassifiedUsd,.5);assert.equal(r.outsideCoverageUsd,9);
  assert.equal(r.historicalUsd+r.transitionDifferenceUsd+r.currentDifferenceUsd+r.attributedUsd+r.unclassifiedUsd,official.amountUsd);
  assert.equal(r.features[0].unknownRequests,1);assert.equal(r.features[0].amountUsd,3);
  assert.equal(r.daily.at(-1).category,'current');
});
test('missing official detail never turns a partial ledger into an official total or invented historical split',()=>{
  assert.equal(reconcileCosts([], {status:'unavailable'},'2026-11-20').status,'unavailable');
  assert.equal(reconcileCosts([], {status:'available',amountUsd:15},'2026-11-20').status,'awaiting_daily_breakdown');
});
