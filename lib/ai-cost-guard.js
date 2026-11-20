"use strict";
const { createHash } = require('node:crypto');
const hash = (v) => createHash('sha256').update(v).digest('hex');
const failure = () => Object.assign(new Error('暂时无法完成，请稍后再试。'), { statusCode: 503, usageError: true, costGuard: true });
function createCostGuard({ db, now = Date.now, env = process.env }) {
  const budget = Number(env.AI_PLATFORM_DAILY_BUDGET_USD || 5);
  const budgetMicros = Number.isFinite(budget) && budget > 0 ? Math.round(budget * 1e6) : 5000000;
  async function admit(row, fingerprint) {
    const day = row.startedAt.slice(0,10), principal = hash(`${row.payer}:${row.userId || 'platform'}:${row.source}`);
    const key = `${principal}:${fingerprint}`, account = hash(String(row.userId || "platform")); let denied;
    const previous = now() - Date.parse(day) < 15 * 60000
      ? await db.getAiCostControl(`guard:${new Date(Date.parse(day)-86400000).toISOString().slice(0,10)}`) : null;
    const previousHolds = Object.values(previous?.holds || {}).filter(h=>h.until>now());
    await db.changeAiCostControl(`guard:${day}`, (state) => {
      denied = null; state ||= { spent: 0, holds: {}, failures: {}, blocked: {}, budgetMicros };
      state.userSpent ||= {};
      // An expired paid attempt is still a possible expense, never free capacity.
      for (const [id, hold] of Object.entries(state.holds)) if (hold.until <= now()) {
        if (hold.platform) state.spent += hold.amount;
        else if (hold.account) state.userSpent[hold.account] = (state.userSpent[hold.account] || 0) + hold.amount;
        const f = state.failures[hold.principal] ||= { count: 0, until: 0 }; f.count++; f.until = now() + 15 * 60000;
        delete state.holds[id];
      }
      for (const [id,f] of Object.entries(state.failures)) if (f.until < now()) delete state.failures[id];
      const pending = Object.values(state.holds);
      if ([...pending,...previousHolds].some(h => h.key === key)) denied = 'duplicate';
      else if ((previous?.failures?.[principal]?.until > now() && previous.failures[principal].count >= 3) || (state.failures[principal]?.count || 0) >= 3 || (state.failures[`operation:${principal}`]?.count || 0) >= 3) denied = 'failure-cooldown';
      else if (row.payer === 'platform' && state.spent + pending.filter(h => h.platform).reduce((s,h)=>s+h.amount,0) + row.estimateMicros > budgetMicros) denied = 'platform-budget';
      else if (row.payer === 'user' && (state.userSpent[account] || 0) + pending.filter(h=>!h.platform && h.account===account).reduce((s,h)=>s+h.amount,0) + row.estimateMicros > budgetMicros) denied = 'account-provider-budget';
      if (denied) state.blocked[denied] = (state.blocked[denied] || 0) + 1;
      else state.holds[row.id] = { key, principal, account, amount: row.estimateMicros, platform: row.payer === 'platform', until: now() + 10 * 60000 };
      state.budgetMicros = budgetMicros; return state;
    });
    if (denied) throw failure();
    return async (amount, failed) => db.changeAiCostControl(`guard:${day}`, (state) => {
      const hold = state?.holds[row.id]; if (!hold) return undefined;
      if (hold.platform || failed) state.spent += amount ?? hold.amount;
      if (row.operationId) {
        const op = (state.operations ||= {})[row.operationId] ||= { amount: 0, absorbed: 0 };
        op.amount += amount ?? hold.amount;
        if (hold.platform || failed) op.absorbed += amount ?? hold.amount;
      }
      if (!hold.platform) state.userSpent[account] = (state.userSpent[account] || 0) + (amount ?? hold.amount);
      delete state.holds[row.id];
      if (failed) { const f = state.failures[principal] ||= { count: 0, until: 0 }; f.count++; f.until = now() + 15 * 60000; }
      else delete state.failures[principal];
      return state;
    });
  }
  async function failedOperation(job) {
    const days = [...new Set([String(job.createdAt).slice(0,10),String(job.updatedAt || job.createdAt).slice(0,10)])];
    const principal = hash(`user:${job.userId}:office`);
    for (const day of days) await db.changeAiCostControl(`guard:${day}`, state => {
      const op = state?.operations?.[job.id];
      if (!op || op.refunded) return undefined;
      op.refunded = true;
      state.spent += Math.max(0,op.amount-op.absorbed);
      const f = state.failures[`operation:${principal}`] ||= { count:0, until:0 };
      f.count++; f.until=now()+15*60000;
      return state;
    });
  }
  return { admit, hash, failedOperation };
}
module.exports = { createCostGuard };
