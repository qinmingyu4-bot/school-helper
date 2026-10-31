"use strict";
const Stripe = require("stripe");
const clone = (value) => structuredClone(value);
function billingStripeFixture() {
  const customers = new Map(), sessions = new Map(), subscriptions = new Map(), invoices = new Map(), idem = new Map();
  const calls = []; let index = 0;
  const price = { id: "price_test_monthly", active: true, livemode: false, currency: "cad", unit_amount: 1999,
    type: "recurring", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
  const request = async (name, values, options, work) => {
    calls.push({ name, values: clone(values), options: clone(options) });
    const key = options?.idempotencyKey;
    if (key && idem.has(key)) return clone(idem.get(key));
    const result = await work(); if (key) idem.set(key, clone(result)); return clone(result);
  };
  const stripe = {
    webhooks: new Stripe("sk_test_fixture").webhooks,
    prices: { retrieve: (id) => request("price", id, null, () => ({ ...price, id })) },
    customers: { create: (values, options) => request("customer", values, options, () => { const value = { id: `cus_test_${++index}`, livemode: false, ...values }; customers.set(value.id, value); return value; }) },
    checkout: { sessions: {
      create: (values, options) => request("checkout", values, options, () => { const id = `cs_test_${++index}`, value = { id, livemode: false, status: "open", expires_at: values.expires_at,
        url: `https://checkout.stripe.com/c/pay/${id}`, ...values }; sessions.set(id, value); return value; }),
      retrieve: (id) => request("checkout.read", id, null, () => { if (!sessions.has(id)) throw Error("Missing session"); return sessions.get(id); })
    } },
    subscriptions: {
      list: (values) => request("subscriptions", values, null, () => ({ data: [...subscriptions.values()].filter((sub) => sub.customer === values.customer), has_more: false })),
      update: (id, values) => request("renewal", { id, ...values }, null, () => { const value = { ...subscriptions.get(id), ...values }; subscriptions.set(id, value); return value; })
    },
    invoices: { retrieve: (id) => request("invoice", id, null, () => invoices.get(id)) },
    billingPortal: { sessions: { create: (values) => request("portal", values, null, () => ({ url: "https://billing.stripe.com/p/session/test_fixture" })) } }
  };
  function subscription(userId, customerId, overrides = {}) {
    return { id: `sub_test_${++index}`, livemode: false, customer: customerId, status: "active", created: index, currency: "cad", cancel_at_period_end: false,
      metadata: { studybridge_user_id: userId, studybridge_integration: "studybridge-test-v1" },
      items: { data: [{ quantity: 1, price: clone(price), current_period_end: Math.floor(Date.now() / 1000) + 2592000 }] },
      latest_invoice: { id: `in_test_${index}`, livemode: false, customer: customerId, status: "paid" }, ...overrides };
  }
  return { stripe, calls, price, customers, sessions, subscriptions, invoices, subscription };
}
module.exports = { billingStripeFixture };
