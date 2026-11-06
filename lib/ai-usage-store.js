"use strict";

module.exports = {
  async getAiUsage(userId) {
    return this.dynamo ? this.dynamo.get(`USER#${userId}`, "AI_USAGE", { consistent: true })
      : this.local.read((state) => state.aiUsage?.[userId] || null);
  },
  async changeAiUsage(userId, mutate) {
    if (!this.dynamo) return this.local.write((state) => {
      if (!state.users[userId]) throw Object.assign(new Error("Please log in first."), { statusCode: 401 });
      const next = mutate(structuredClone(state.aiUsage?.[userId] || null));
      (state.aiUsage ||= {})[userId] = next;
      return next;
    });
    for (let attempt = 0; attempt < 8; attempt++) {
      const before = await this.getAiUsage(userId);
      const user = await this.getUser(userId, { consistent: true });
      if (!user) throw Object.assign(new Error("Please log in first."), { statusCode: 401 });
      const next = mutate(structuredClone(before));
      try {
        await this.dynamo.transactPut([
          { pk: `USER#${userId}`, sk: "AI_USAGE", type: "aiUsage", data: next, ...(before ? { expectedData: before } : { createOnly: true }) },
          { pk: `USER#${userId}`, sk: "PROFILE", checkOnly: true, expectedData: user }
        ]);
        return next;
      } catch (error) { if (error.code !== "TransactionCanceledException") throw error; }
    }
    throw Object.assign(new Error("额度正在更新，请稍后重试。"), { statusCode: 409, usageError: true });
  }
};
