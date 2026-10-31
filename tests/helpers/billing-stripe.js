"use strict";
const Stripe = require("stripe");
const clone = (value) => structuredClone(value);
function billingStripeFixture() {
  const customers = new Map(), sessions = new Map(), subscriptions = new Map(), invoices = new Map(), intents = new Map(), refunds = new Map(), idem = new Map();
  const calls = []; let index = 0;
  const price = { id: "price_test_monthly", active: true, livemode: false, currency: "cad", unit_amount: 1999,
    type: "recurring", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
  const passPrices = new Map(["month", "semester"].map((plan) => [`price_test_${plan}_pass`, { id: `price_test_${plan}_pass`, active: true, livemode: false, currency: "cad", unit_amount: plan === "month" ? 1999 : 6999, type: "one_time" }]));
  const request = async (name, values, options, work) => {
    calls.push({ name, values: clone(values), options: clone(options) });
    const key = options?.idempotencyKey;
    if (key && idem.has(key)) return clone(idem.get(key));
    const result = await work(); if (key) idem.set(key, clone(result)); return clone(result);
  };
  const stripe = {
    webhooks: new Stripe("sk_test_fixture").webhooks,
    prices: { retrieve: (id) => request("price", id, null, () => passPrices.get(id) || ({ ...price, id })) },
    customers: { create: (values, options) => request("customer", values, options, () => { const value = { id: `cus_test_${++index}`, livemode: false, ...values }; customers.set(value.id, value); return value; }) },
    checkout: { sessions: {
      create: (values, options) => request("checkout", values, options, () => { const id = `cs_test_${++index}`, value = { id, livemode: false, status: "open", expires_at: values.expires_at,
        url: `https://checkout.stripe.com/c/pay/${id}`, payment_status: "unpaid", amount_total: passPrices.get(values.line_items[0].price)?.unit_amount, currency: "cad", ...values }; sessions.set(id, value); return value; }),
      retrieve: (id) => request("checkout.read", id, null, () => { if (!sessions.has(id)) throw Error("Missing session"); return sessions.get(id); }),
      list: (values) => request("checkout.list", values, null, () => ({ data: [...sessions.values()].filter((session) => session.payment_intent === values.payment_intent), has_more: false })),
      listLineItems: (id) => request("checkout.lines", id, null, () => ({ data: sessions.get(id).line_items.map((line) => ({ ...line, price: clone(passPrices.get(line.price) || price) })), has_more: false })),
      expire: (id) => request("checkout.expire", id, null, () => { const value = sessions.get(id); if (value.status !== "open") throw Error("Already completed"); value.status = "expired"; return value; })
    } },
    subscriptions: {
      list: (values) => request("subscriptions", values, null, () => ({ data: [...subscriptions.values()].filter((sub) => sub.customer === values.customer), has_more: false })),
      update: (id, values) => request("renewal", { id, ...values }, null, () => { const value = { ...subscriptions.get(id), ...values }; subscriptions.set(id, value); return value; })
    },
    invoices: { retrieve: (id) => request("invoice", id, null, () => invoices.get(id)) },
    paymentIntents: { retrieve: (id) => request("intent", id, null, () => { if (!intents.has(id)) throw Error("Missing intent"); return intents.get(id); }) },
    refunds: { list: (values) => request("refunds", values, null, () => ({ data: [...refunds.values()].filter((refund) => refund.payment_intent === values.payment_intent), has_more: false })) },
    billingPortal: { sessions: { create: (values) => request("portal", values, null, () => ({ url: "https://billing.stripe.com/p/session/test_fixture" })) } }
  };
  function subscription(userId, customerId, overrides = {}) {
    return { id: `sub_test_${++index}`, livemode: false, customer: customerId, status: "active", created: index, currency: "cad", cancel_at_period_end: false,
      metadata: { studybridge_user_id: userId, studybridge_integration: "studybridge-test-v1" },
      items: { data: [{ quantity: 1, price: clone(price), current_period_end: Math.floor(Date.now() / 1000) + 2592000 }] },
      latest_invoice: { id: `in_test_${index}`, livemode: false, customer: customerId, status: "paid" }, ...overrides };
  }
  function pay(id, method = "wechat_pay", created = Math.floor(Date.now() / 1000)) {
    const session = sessions.get(id), intentId = `pi_test_${++index}`;
    Object.assign(session, { status: "complete", payment_status: "paid", payment_intent: intentId });
    const intent = { id: intentId, livemode: false, customer: session.customer, metadata: clone(session.metadata), currency: "cad", amount: session.amount_total, amount_received: session.amount_total, status: "succeeded",
      latest_charge: { id: `ch_test_${index}`, livemode: false, customer: session.customer, payment_intent: intentId, paid: true, captured: true, amount: session.amount_total, currency: "cad", created, payment_method_details: { type: method } } };
    intents.set(intent.id, intent); return intent;
  }
  return { stripe, calls, price, passPrices, customers, sessions, subscriptions, invoices, intents, refunds, subscription, pay };
}
module.exports = { billingStripeFixture };
