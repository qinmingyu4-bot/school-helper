const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Stripe = require("stripe");
const { StudyBridgeDatabase } = require("../lib/database");
const { createBillingService, billingConfig, stripeRedirect, API_VERSION } = require("../lib/billing-service");
const { memoryDynamo } = require("./helpers/community-dynamo");
const { billingStripeFixture } = require("./helpers/billing-stripe");
const env = { BILLING_MODE: "test", NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_PLUS_MONTHLY_PRICE_ID: "price_test_monthly", BILLING_PUBLIC_BASE_URL: "https://studybridge.example" };
async function fixture(t, mode = "local") {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-billing-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json"); db.dynamo = mode === "dynamodb" ? memoryDynamo().store : null;
  for (const id of ["alice", "bob"]) {
    const user = { id, email: `${id}@example.test`, name: id, membershipTier: "standard", profile: { school: "Retained" } };
    if (db.dynamo) await db.dynamo.put(`USER#${id}`, "PROFILE", "user", user); else await db.createUser(user);
  }
  const provider = billingStripeFixture(), service = createBillingService({ db, env, stripe: provider.stripe });
  const checkout = (userId = "alice") => service.checkout({ id: userId, email: `${userId}@example.test`, name: userId }, { userId, consent: true, requestId: "request-0001" });
  const notify = async (type, object, id = "evt_fixture", options = {}) => {
    const raw = JSON.stringify({ id, type, livemode: false, data: { object }, ...options });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: env.STRIPE_WEBHOOK_SECRET });
    return service.webhook(Buffer.from(raw), signature);
  };
  return { db, provider, service, checkout, notify };
}
test("billing defaults closed and never accepts live keys, live mode, missing webhook secrets or untrusted callback origins", async (t) => {
  assert.equal(billingConfig({}).configured, false);
  for (const change of [{ BILLING_MODE: "live" }, { STRIPE_SECRET_KEY: "sk_live_dont_use" }, { STRIPE_WEBHOOK_SECRET: "" }, { BILLING_PUBLIC_BASE_URL: "http://evil.example" }, { BILLING_PUBLIC_BASE_URL: "https://user:pass@example.test" }, { BILLING_PUBLIC_BASE_URL: "https://example.test/other?redirect=evil" }, { BILLING_MONTHLY_AMOUNT_CENTS: "-10" }]) assert.equal(billingConfig({ ...env, ...change }).configured, false);
  const f = await fixture(t), disabled = createBillingService({ db: f.db, env: {}, stripe: f.provider.stripe });
  assert.equal((await disabled.status("alice")).livePaymentsEnabled, false);
  await assert.rejects(disabled.checkout({ id: "alice" }, {}), { statusCode: 503 });
  assert.equal(f.provider.calls.length, 0);
  assert.equal(API_VERSION, require("stripe").API_VERSION);
  for (const url of ["https://checkout.stripe.com.evil.test/a", "http://checkout.stripe.com/a", "https://user@checkout.stripe.com/a", "https://checkout.stripe.com:8443/a", "javascript:alert(1)"]) assert.throws(() => stripeRedirect(url, "checkout.stripe.com"));
});
for (const mode of ["local", "dynamodb"]) {
  test(`${mode}: checkout is owned, price-validated, durable and reused without duplicate subscriptions`, async (t) => {
    const f = await fixture(t, mode), userBefore = await f.db.getUser("alice");
    await assert.rejects(f.service.checkout({ id: "alice" }, { consent: false }), { statusCode: 400 });
    await assert.rejects(f.service.checkout({ id: "alice" }, { consent: true, requestId: "request-0001", priceId: "price_cheaper" }), { statusCode: 400 });
    const [one, two] = await Promise.allSettled([f.checkout(), f.checkout()]);
    assert.equal([one, two].filter((value) => value.status === "fulfilled").length, 1);
    const result = (one.status === "fulfilled" ? one : two).value;
    assert.equal((await f.checkout()).url, result.url);
    assert.equal(f.provider.calls.filter((call) => call.name === "checkout").length, 1);
    assert.equal(f.provider.calls.filter((call) => call.name === "customer").length, 1);
    const stored = await f.db.getBilling("alice"), owner = await f.db.billingCustomerOwner(stored.customerId);
    assert.equal(owner.userId, "alice"); assert.notEqual((await f.checkout("bob")).url, result.url);
    await assert.rejects(f.db.changeBilling("bob", (before) => ({ ...before, customerId: stored.customerId })), { statusCode: 409 });
    assert.deepEqual(await f.db.getUser("alice"), userBefore, "Test subscriptions never overwrite account membership/profile/permissions");
    assert.equal((await f.service.status("alice")).subscription.status, "none", "A checkout redirect alone cannot grant a subscription");
    const fresh = createBillingService({ db: f.db, env, stripe: f.provider.stripe });
    assert.equal((await fresh.status("alice")).hasCustomer, true);
  });
  test(`${mode}: signed events reconcile current provider state despite duplication and out-of-order delivery; cancellation preserves the current period`, async (t) => {
    const f = await fixture(t, mode); await f.checkout();
    const customerId = (await f.db.getBilling("alice")).customerId, sub = f.provider.subscription("alice", customerId);
    f.provider.subscriptions.set(sub.id, sub);
    await f.notify("customer.subscription.created", sub);
    let status = await f.service.status("alice"); assert.equal(status.subscription.status, "active"); assert.equal(status.subscription.paid, true);
    assert.ok(status.subscription.currentPeriodEnd); assert.equal(status.canCheckout, false);
    const calls = f.provider.calls.length; await f.notify("customer.subscription.created", sub); assert.equal(f.provider.calls.length, calls);
    status = await f.service.changeRenewal("alice", true); assert.equal(status.subscription.cancelAtPeriodEnd, true); assert.equal(status.subscription.status, "active");
    status = await f.service.changeRenewal("alice", false); assert.equal(status.subscription.cancelAtPeriodEnd, false);
    f.provider.subscriptions.set(sub.id, { ...sub, status: "past_due", latest_invoice: { ...sub.latest_invoice, status: "open" } });
    await f.notify("invoice.payment_failed", { customer: customerId }, "evt_failed");
    await f.notify("customer.subscription.updated", { ...sub, status: "active" }, "evt_old_success");
    status = await f.service.status("alice"); assert.equal(status.subscription.status, "past_due"); assert.equal(status.subscription.paid, false);
    f.provider.subscriptions.set(sub.id, { ...sub, status: "canceled" });
    await f.notify("customer.subscription.deleted", sub, "evt_canceled");
    assert.equal((await f.service.status("alice")).subscription.status, "canceled");
    const next = f.provider.subscription("alice", customerId); f.provider.subscriptions.set(next.id, next);
    await f.notify("customer.subscription.created", next, "evt_new");
    await f.notify("customer.subscription.deleted", sub, "evt_old_deleted");
    assert.equal((await f.db.getBilling("alice")).subscriptionId, next.id);
    assert.equal((await f.service.status("bob")).subscription.status, "none");
    assert.ok((await f.service.portal("alice")).url.startsWith("https://billing.stripe.com/"));
    await assert.rejects(f.service.portal("bob"), { statusCode: 409 });
  });
}
test("raw signatures, timestamp tolerance, live events and customer mappings are validated before processing", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.webhook(Buffer.from("{}"), "invalid"), { statusCode: 400 });
  await assert.rejects(f.notify("invoice.paid", { customer: "cus_missing" }, "evt_live", { livemode: true }), { statusCode: 400 });
  const raw = JSON.stringify({ id: "evt_old", livemode: false, type: "invoice.paid", data: { object: { customer: "cus_missing" } } });
  await assert.rejects(f.service.webhook(Buffer.from(raw), Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: env.STRIPE_WEBHOOK_SECRET, timestamp: Math.floor(Date.now() / 1000) - 1000 })), { statusCode: 400 });
  await f.notify("invoice.paid", { customer: "cus_unmapped" }); assert.equal(f.provider.calls.length, 0);
});
test("price mismatch and provider failures fail closed without exposing provider secrets", async (t) => {
  const f = await fixture(t); f.provider.price.unit_amount = 999;
  await assert.rejects(f.checkout(), { statusCode: 503 }); assert.equal(f.provider.customers.size, 0);
  f.provider.price.unit_amount = 1999; f.provider.stripe.customers.create = async () => { throw Error("sk_test_PRIVATE customer@example.test provider diagnostic"); };
  await assert.rejects(f.checkout(), (error) => error.statusCode === 503 && !/PRIVATE|example\.test/.test(error.message));
});
test("uncertain checkout creation retries the same durable idempotency key, and ended subscriptions can subscribe again", async (t) => {
  const f = await fixture(t), create = f.provider.stripe.checkout.sessions.create;
  let first = true;
  f.provider.stripe.checkout.sessions.create = async (...args) => { const result = await create(...args); if (first) { first = false; throw Error("response lost"); } return result; };
  await assert.rejects(f.checkout(), { statusCode: 503 });
  const result = await f.checkout(); assert.equal(f.provider.sessions.size, 1);
  const calls = f.provider.calls.filter((call) => call.name === "checkout"); assert.equal(calls[0].options.idempotencyKey, calls[1].options.idempotencyKey);
  const customerId = (await f.db.getBilling("alice")).customerId, sub = f.provider.subscription("alice", customerId, { status: "canceled" });
  f.provider.subscriptions.set(sub.id, sub);
  const session = [...f.provider.sessions.values()][0]; Object.assign(session, { status: "complete", subscription: sub.id });
  assert.notEqual((await f.checkout()).url, result.url); assert.equal(f.provider.sessions.size, 2);
});
test("failed local persistence rolls back billing and reverse mappings together", async (t) => {
  const f = await fixture(t); await f.checkout();
  const before = await f.db.getBilling("alice"), save = f.db.local.save;
  f.db.local.save = async () => { throw Error("disk full"); };
  await assert.rejects(f.db.changeBilling("alice", (value) => ({ ...value, status: "active" })), /disk full/);
  f.db.local.save = save; assert.deepEqual(await f.db.getBilling("alice"), before);
});
test("an expired in-flight reconciliation cannot overwrite a newer worker's subscription", async (t) => {
  const f = await fixture(t); await f.checkout();
  let clock = Date.now(), resolveOld, entered;
  const reached = new Promise((resolve) => { entered = resolve; });
  const old = new Promise((resolve) => { resolveOld = resolve; });
  const list = f.provider.stripe.subscriptions.list;
  f.provider.stripe.subscriptions.list = async (...args) => { f.provider.stripe.subscriptions.list = list; entered(); return old; };
  const first = createBillingService({ db: f.db, env, stripe: f.provider.stripe, now: () => clock, leaseMs: 10 });
  const pending = first.refresh("alice"); await reached;
  clock += 20;
  const customer = (await f.db.getBilling("alice")).customerId, sub = f.provider.subscription("alice", customer);
  f.provider.subscriptions.set(sub.id, sub);
  const second = createBillingService({ db: f.db, env, stripe: f.provider.stripe, now: () => clock, leaseMs: 100 });
  assert.equal((await second.refresh("alice")).subscription.status, "active");
  resolveOld({ data: [], has_more: false });
  await assert.rejects(pending, { statusCode: 409 });
  assert.equal((await f.service.status("alice")).subscription.status, "active");
});
test("a changed plan cannot reuse an older Checkout price, and ambiguous subscription ownership fails closed", async (t) => {
  const f = await fixture(t); await f.checkout();
  f.provider.price.unit_amount = 2499;
  const changed = createBillingService({ db: f.db, env: { ...env, BILLING_MONTHLY_AMOUNT_CENTS: "2499" }, stripe: f.provider.stripe });
  await assert.rejects(changed.checkout({ id: "alice", email: "alice@example.test" }, { consent: true, requestId: "request-0002" }), { statusCode: 409 });
  assert.equal(f.provider.sessions.size, 1);
  const customer = (await f.db.getBilling("alice")).customerId;
  f.provider.price.unit_amount = 1999;
  const foreign = f.provider.subscription("bob", customer); f.provider.subscriptions.set(foreign.id, foreign);
  await assert.rejects(f.service.refresh("alice"), { statusCode: 409 });
  assert.equal((await f.service.status("alice")).subscription.status, "none");
});
