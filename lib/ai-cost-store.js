"use strict";

module.exports = {
  async aiCostSince(at) {
    if (!this.dynamo) return this.local.write((s) => s.aiCostSince ||= at,
      { skipSave: (value) => value !== at });
    const previous = await this.dynamo.get("AI_COST", "START", { consistent: true });
    if (previous) return previous.since;
    try { await this.dynamo.transactPut([{ pk: "AI_COST", sk: "START", type: "aiCostStart", data: { since: at }, createOnly: true }]); }
    catch (error) {
      if (error.code !== "TransactionCanceledException") throw error;
      return (await this.dynamo.get("AI_COST", "START", { consistent: true })).since;
    }
    return at;
  },
  async putAiCost(record) {
    record = structuredClone(record);
    const day = record.startedAt.slice(0, 10);
    if (this.dynamo) return this.dynamo.transactPut([{ pk: `AI_COST#${day}`, sk: record.id,
      type: "aiCost", data: record }]);
    return this.local.write((s) => {
      const rows = s.aiCosts ||= {};
      (rows[day] ||= {})[record.id] = record;
    });
  },
  async listAiCosts(days) {
    if (!this.dynamo) return this.local.read((s) => days.flatMap((day) => Object.values(s.aiCosts?.[day] || {})));
    const result = [];
    // Bound database concurrency; queryPage uses consistent reads and drains every page.
    for (const day of days) {
      let cursor;
      do {
        const page = await this.dynamo.queryPage(`AI_COST#${day}`, { limit: 100, cursor });
        result.push(...page.rows); cursor = page.cursor;
      } while (cursor);
    }
    return result;
  }
};

// Small operational state, shared by ledger guards and official-cost caching.
module.exports.changeAiCostControl = async function (key, mutate) {
  if (!this.dynamo) return this.local.write((s) => {
    const next = mutate(structuredClone(s.aiCostControl?.[key] || null));
    if (next === undefined) return null;
    (s.aiCostControl ||= {})[key] = next; return next;
  }, { skipSave: (next) => next === null });
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await this.dynamo.get('AI_COST_CONTROL', key, { consistent: true });
    const next = mutate(structuredClone(before));
    if (next === undefined) return null;
    try {
      await this.dynamo.transactPut([{ pk: 'AI_COST_CONTROL', sk: key, type: 'aiCostControl', data: next,
        ...(before ? { expectedData: before } : { createOnly: true }) }]); return next;
    } catch (e) { if (e.code !== 'TransactionCanceledException' || attempt === 7) throw e; }
  }
};
module.exports.getAiCostControl = async function (key) {
  return this.dynamo ? this.dynamo.get('AI_COST_CONTROL', key, { consistent: true })
    : this.local.read((s) => s.aiCostControl?.[key] || null);
};
module.exports.markAiCostUnresolved = async function (row) {
  if (row.status !== 'pending') return;
  if (!this.dynamo) return this.local.write((s) => {
    const current = s.aiCosts?.[row.startedAt.slice(0, 10)]?.[row.id];
    if (current?.status !== 'pending') return false;
    current.status = 'unknown'; current.reason = 'interrupted'; return true;
  }, { skipSave: (changed) => !changed });
  try { await this.dynamo.transactPut([{ pk: `AI_COST#${row.startedAt.slice(0,10)}`, sk: row.id, type: 'aiCost',
    data: { ...row, status: 'unknown', reason: 'interrupted' }, expectedData: row }]); }
  catch (e) { if (e.code !== 'TransactionCanceledException') throw e; }
};
