"use strict";
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode, billingSafe: true });
const namespace = (mode) => {
  if (!["test", "alipay-test", "alipay-live"].includes(mode)) throw fail(400, "付款环境无效。");
  return mode;
};
const key = (userId, mode) => ({ pk: `USER#${userId}`, sk: `BILLING#${namespace(mode)}` });
const customerKey = (customerId, mode) => ({ pk: `BILLINGCUSTOMER#${namespace(mode)}#${customerId}`, sk: "OWNER" });
const bucket = (mode) => mode === "test" ? "billing" : mode === "alipay-live" ? "alipayLive" : "alipayTest";
const customers = (mode) => `${bucket(mode)}Customers`;

module.exports = {
  async getBilling(userId, mode = "test") {
    namespace(mode);
    return this.dynamo ? this.dynamo.get(key(userId, mode).pk, key(userId, mode).sk, { consistent: true })
      : this.local.read((state) => state[bucket(mode)]?.[userId] || null);
  },
  async billingCustomerOwner(customerId, mode = "test") {
    namespace(mode);
    if (!/^cus_[A-Za-z0-9_]{1,180}$/.test(customerId || "")) return null;
    return this.dynamo ? this.dynamo.get(customerKey(customerId, mode).pk, "OWNER", { consistent: true })
      : this.local.read((state) => state[mode === "test" ? "billingCustomers" : customers(mode)]?.[customerId] || null);
  },
  async changeBilling(userId, mutate, mode = "test") {
    namespace(mode);
    const rows = bucket(mode), owners = mode === "test" ? "billingCustomers" : customers(mode);
    const prepare = (before, user, owner) => {
      if (!user) throw fail(404, "登录账号不存在，请重新登录。");
      const next = mutate(before);
      if (!next) return null;
      if (next.userId !== userId || next.mode !== mode || before?.customerId && next.customerId !== before.customerId) throw fail(409, "订阅账号信息冲突，请刷新后重试。");
      if (next.customerId && (!/^cus_[A-Za-z0-9_]{1,180}$/.test(next.customerId) || owner && owner.userId !== userId)) throw fail(409, "订阅账号信息冲突，请刷新后重试。");
      return { ...next, version: (before?.version || 0) + 1, updatedAt: new Date().toISOString() };
    };
    if (!this.dynamo) return this.local.write((state) => {
      const before = state[rows]?.[userId] || null;
      const next = prepare(before, state.users[userId], before?.customerId ? state[owners]?.[before.customerId] : null);
      if (!next) return null;
      const owner = next.customerId && state[owners]?.[next.customerId];
      if (owner && owner.userId !== userId) throw fail(409, "订阅账号信息冲突，请刷新后重试。");
      (state[rows] ||= {})[userId] = next;
      if (next.customerId) (state[owners] ||= {})[next.customerId] = { userId, mode };
      return next;
    }, { skipSave: (value) => !value });
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await this.getBilling(userId, mode), user = await this.getUser(userId, { consistent: true });
      const next = prepare(before, user, null);
      if (!next) return null;
      const records = [{ ...key(userId, mode), type: "billing", data: next, ...(before ? { expectedData: before } : { createOnly: true }) },
        { pk: `USER#${userId}`, sk: "PROFILE", checkOnly: true, expectedData: user }];
      if (next.customerId) {
        const owner = await this.billingCustomerOwner(next.customerId, mode);
        if (owner && owner.userId !== userId) throw fail(409, "订阅账号信息冲突，请刷新后重试。");
        records.push({ ...customerKey(next.customerId, mode), ...(owner ? { checkOnly: true, expectedData: owner } : { type: "billingCustomer", data: { userId, mode }, createOnly: true }) });
      }
      try { await this.dynamo.transactPut(records); return next; }
      catch (error) { if (error.code !== "TransactionCanceledException") throw error; }
    }
    throw fail(409, "订阅信息正在更新，请稍后重试。");
  }
};
