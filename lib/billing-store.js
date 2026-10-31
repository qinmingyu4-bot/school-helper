"use strict";
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode, billingSafe: true });
const key = (userId) => ({ pk: `USER#${userId}`, sk: "BILLING#test" });
const customerKey = (customerId) => ({ pk: `BILLINGCUSTOMER#test#${customerId}`, sk: "OWNER" });

module.exports = {
  async getBilling(userId) {
    return this.dynamo ? this.dynamo.get(key(userId).pk, key(userId).sk, { consistent: true })
      : this.local.read((state) => state.billing?.[userId] || null);
  },
  async billingCustomerOwner(customerId) {
    if (!/^cus_[A-Za-z0-9_]{1,180}$/.test(customerId || "")) return null;
    return this.dynamo ? this.dynamo.get(customerKey(customerId).pk, "OWNER", { consistent: true })
      : this.local.read((state) => state.billingCustomers?.[customerId] || null);
  },
  async changeBilling(userId, mutate) {
    const prepare = (before, user, owner) => {
      if (!user) throw fail(404, "登录账号不存在，请重新登录。");
      const next = mutate(before);
      if (!next) return null;
      if (next.userId !== userId || next.mode !== "test" || before?.customerId && next.customerId !== before.customerId) throw fail(409, "订阅账号信息冲突，请刷新后重试。");
      if (next.customerId && (!/^cus_[A-Za-z0-9_]{1,180}$/.test(next.customerId) || owner && owner.userId !== userId)) throw fail(409, "订阅账号信息冲突，请刷新后重试。");
      return { ...next, version: (before?.version || 0) + 1, updatedAt: new Date().toISOString() };
    };
    if (!this.dynamo) return this.local.write((state) => {
      const before = state.billing?.[userId] || null;
      const next = prepare(before, state.users[userId], before?.customerId ? state.billingCustomers?.[before.customerId] : null);
      if (!next) return null;
      const owner = next.customerId && state.billingCustomers?.[next.customerId];
      if (owner && owner.userId !== userId) throw fail(409, "订阅账号信息冲突，请刷新后重试。");
      (state.billing ||= {})[userId] = next;
      if (next.customerId) (state.billingCustomers ||= {})[next.customerId] = { userId, mode: "test" };
      return next;
    }, { skipSave: (value) => !value });
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await this.getBilling(userId), user = await this.getUser(userId, { consistent: true });
      const next = prepare(before, user, null);
      if (!next) return null;
      const records = [{ ...key(userId), type: "billing", data: next, ...(before ? { expectedData: before } : { createOnly: true }) },
        { pk: `USER#${userId}`, sk: "PROFILE", checkOnly: true, expectedData: user }];
      if (next.customerId) {
        const owner = await this.billingCustomerOwner(next.customerId);
        if (owner && owner.userId !== userId) throw fail(409, "订阅账号信息冲突，请刷新后重试。");
        records.push({ ...customerKey(next.customerId), ...(owner ? { checkOnly: true, expectedData: owner } : { type: "billingCustomer", data: { userId, mode: "test" }, createOnly: true }) });
      }
      try { await this.dynamo.transactPut(records); return next; }
      catch (error) { if (error.code !== "TransactionCanceledException") throw error; }
    }
    throw fail(409, "订阅信息正在更新，请稍后重试。");
  }
};
