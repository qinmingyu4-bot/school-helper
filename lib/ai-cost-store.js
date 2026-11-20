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
