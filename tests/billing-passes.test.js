const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const Stripe = require("stripe");
const { StudyBridgeDatabase } = require("../lib/database");
const { createBillingService, billingConfig } = require("../lib/billing-service");
const { billingStripeFixture } = require("./helpers/billing-stripe");
const { memoryDynamo } = require("./helpers/community-dynamo");
const DAY = 86400000;
const env = { BILLING_MODE: "test", NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_PLUS_MONTHLY_PRICE_ID: "price_test_monthly", BILLING_PUBLIC_BASE_URL: "https://studybridge.example", BILLING_WALLET_PASSES_ENABLED: "true",
  STRIPE_MONTH_PASS_PRICE_ID: "price_test_month_pass", STRIPE_SEMESTER_PASS_PRICE_ID: "price_test_semester_pass" };
async function fixture(t, mode = "local") {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-passes-")); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json"); db.dynamo = mode === "dynamodb" ? memoryDynamo().store : null;
  for (const id of ["alice", "bob"]) {
    const user = { id, email: `${id}@example.test`, name: id, membershipTier: "standard" };
    if (db.dynamo) await db.dynamo.put(`USER#${id}`, "PROFILE", "user", user); else await db.createUser(user);
  }
  let clock = Math.floor(Date.now() / 1000) * 1000, sequence = 0;
  const provider = billingStripeFixture(), service = createBillingService({ db, env, stripe: provider.stripe, now: () => clock });
  const checkout = (plan = "month", extra = {}, userId = "alice") => service.passCheckout({ id: userId, email: `${userId}@example.test`, name: userId }, { userId, plan, consent: true, requestId: `request-${++sequence}-pass`, ...extra });
  const notify = (type, object, id = `evt_pass_${++sequence}`) => {
    const raw = JSON.stringify({ id, type, livemode: false, data: { object } });
    return service.webhook(Buffer.from(raw), Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: env.STRIPE_WEBHOOK_SECRET }));
  };
  return { db, provider, service, checkout, notify, time: () => clock, advance: (days) => { clock += days * DAY; } };
}
test("wallet passes require explicit test configuration and distinct one-time prices", async (t) => {
  assert.equal(billingConfig(env).passes.configured, true);
  for (const change of [{ BILLING_WALLET_PASSES_ENABLED: "false" }, { STRIPE_MONTH_PASS_PRICE_ID: "" }, { STRIPE_SEMESTER_PASS_PRICE_ID: env.STRIPE_MONTH_PASS_PRICE_ID }, { BILLING_SEMESTER_PASS_AMOUNT_CENTS: "NaN" }, { BILLING_MODE: "live" }, { STRIPE_SECRET_KEY: "sk_live_fixture" }]) assert.equal(billingConfig({ ...env, ...change }).passes.configured, false);
  const f = await fixture(t), disabled = createBillingService({ db: f.db, env: { ...env, BILLING_WALLET_PASSES_ENABLED: "false" }, stripe: f.provider.stripe });
  await assert.rejects(disabled.passCheckout({ id: "alice" }, {}), { statusCode: 503 }); assert.equal(f.provider.calls.length, 0);
  assert.equal((await disabled.status("alice")).configured, true, "The existing card subscription stays available");
  for (const extra of [{ consent: false }, { amount: 1 }, { priceId: "price_fake" }, { plan: "lifetime" }]) await assert.rejects(f.checkout("month", extra), { statusCode: 400 });
  assert.equal(f.provider.calls.length, 0, "Invalid/unconsented requests never send user data to the provider");
  f.provider.passPrices.get(env.STRIPE_MONTH_PASS_PRICE_ID).unit_amount = 1;
  await assert.rejects(f.checkout(), { statusCode: 503 }); assert.equal(f.provider.sessions.size, 0);
});
for (const mode of ["local", "dynamodb"]) {
  test(`${mode}: one-time wallet checkout is owned, reusable and grants nothing on redirect; unpaid orders can close`, async (t) => {
    const f = await fixture(t, mode), before = await f.db.getUser("alice");
    const result = await f.checkout(), repeated = await f.checkout(); assert.equal(result.url, repeated.url);
    const session = [...f.provider.sessions.values()][0];
    assert.equal(session.mode, "payment"); assert.deepEqual(session.payment_method_types, ["alipay", "wechat_pay"]);
    assert.deepEqual(session.payment_method_options, { wechat_pay: { client: "web" } }); assert.equal(session.subscription_data, undefined);
    assert.deepEqual(session.line_items, [{ price: env.STRIPE_MONTH_PASS_PRICE_ID, quantity: 1 }]);
    assert.equal((await f.service.status("alice")).passes.status, "none");
    await f.notify("checkout.session.completed", { ...session, status: "complete", payment_status: "paid" });
    assert.equal((await f.service.status("alice")).passes.status, "none", "A signed stale snapshot also needs current provider confirmation");
    await assert.rejects(f.checkout("semester"), { statusCode: 409 });
    assert.notEqual((await f.checkout("month", {}, "bob")).url, result.url);
    const canceled = await f.service.passCancel("alice"); assert.equal(canceled.passes.pending, null); assert.equal(session.status, "expired");
    assert.notEqual((await f.checkout("semester")).url, result.url);
    assert.deepEqual(await f.db.getUser("alice"), before);
  });
  test(`${mode}: verified wallet payments extend 30/120 days exactly once across duplicate events, restarts and subscription refresh`, async (t) => {
    const f = await fixture(t, mode), before = await f.db.getUser("alice"); await f.checkout();
    const session = [...f.provider.sessions.values()][0], intent = f.provider.pay(session.id, "wechat_pay", f.time() / 1000);
    await f.notify("checkout.session.completed", session, "evt_first");
    const end = f.time() + 30 * DAY;
    let view = await f.service.status("alice"); assert.equal(view.passes.expiresAt, new Date(end).toISOString()); assert.equal(view.passes.status, "active"); assert.equal(view.subscription.status, "none");
    await f.notify("checkout.session.completed", session, "evt_first");
    await f.notify("payment_intent.succeeded", intent); await f.service.refresh("alice");
    assert.equal((await f.service.status("alice")).passes.expiresAt, new Date(end).toISOString());
    f.advance(2); await f.checkout("semester");
    const second = [...f.provider.sessions.values()].at(-1), next = f.provider.pay(second.id, "alipay", f.time() / 1000);
    await f.notify("payment_intent.succeeded", next);
    await f.notify("checkout.session.expired", { ...session, status: "expired" });
    view = await f.service.status("alice"); assert.equal(view.passes.expiresAt, new Date(end + 120 * DAY).toISOString());
    assert.equal(view.passes.latest.status, "paid"); assert.equal((await f.service.status("bob")).passes.status, "none");
    assert.deepEqual(await f.db.getUser("alice"), before);
    assert.doesNotMatch(JSON.stringify(view), /price_test|cus_test|pi_test|requestId|passOrders|fingerprint/);
    const fresh = createBillingService({ db: f.db, env, stripe: f.provider.stripe, now: () => f.time() });
    assert.equal((await fresh.status("alice")).passes.expiresAt, view.passes.expiresAt);
    f.advance(150); assert.equal((await fresh.status("alice")).passes.status, "expired");
    await f.checkout(); const third = [...f.provider.sessions.values()].at(-1); f.provider.pay(third.id, "alipay", f.time() / 1000); await f.service.refresh("alice");
    assert.equal((await fresh.status("alice")).passes.expiresAt, new Date(f.time() + 30 * DAY).toISOString());
  });
  test(`${mode}: pending and failed refunds keep time; successful partial/full refunds adjust only purchased time and old events cannot restore it`, async (t) => {
    const f = await fixture(t, mode); await f.checkout(); const session = [...f.provider.sessions.values()][0], intent = f.provider.pay(session.id, "alipay", f.time() / 1000);
    await f.notify("checkout.session.completed", session);
    const refund = { id: "re_pass_1", payment_intent: intent.id, currency: "cad", amount: 1999, status: "pending" };
    f.provider.refunds.set(refund.id, refund); await f.notify("refund.created", refund);
    assert.equal((await f.service.status("alice")).passes.expiresAt, new Date(f.time() + 30 * DAY).toISOString());
    refund.status = "failed"; await f.notify("refund.failed", refund); assert.equal((await f.service.status("alice")).passes.status, "active");
    refund.status = "succeeded"; refund.amount = 1000; await f.notify("refund.updated", refund);
    assert.equal((await f.service.status("alice")).passes.expiresAt, new Date(f.time() + Math.floor(30 * DAY * 999 / 1999)).toISOString());
    await f.checkout("semester"); const second = [...f.provider.sessions.values()].at(-1); f.provider.pay(second.id, "wechat_pay", f.time() / 1000); await f.service.refresh("alice");
    refund.amount = 1999; await f.notify("refund.updated", refund); await f.notify("checkout.session.completed", session);
    assert.equal((await f.service.status("alice")).passes.expiresAt, new Date(f.time() + 120 * DAY).toISOString());
    assert.equal((await f.db.getBilling("alice")).passOrders[0].status, "refunded");
  });
}
test("wallet retries recover an uncertain creation and a webhook arriving before the session ID was persisted", async (t) => {
  const f = await fixture(t), create = f.provider.stripe.checkout.sessions.create; let once = true;
  f.provider.stripe.checkout.sessions.create = async (...args) => { const value = await create(...args); if (once) { once = false; throw Error("lost response"); } return value; };
  await assert.rejects(f.checkout(), { statusCode: 503 });
  assert.equal((await f.db.getBilling("alice")).passOrders[0].sessionId, undefined);
  await f.checkout(); assert.equal(f.provider.sessions.size, 1);
  await f.service.passCancel("alice"); once = true;
  await assert.rejects(f.checkout("semester"), { statusCode: 503 });
  const session = [...f.provider.sessions.values()].at(-1); f.provider.pay(session.id, "wechat_pay", f.time() / 1000);
  await f.notify("checkout.session.completed", session);
  assert.equal((await f.service.status("alice")).passes.expiresAt, new Date(f.time() + 120 * DAY).toISOString());
  once = true; await assert.rejects(f.checkout(), { statusCode: 503 });
  const third = [...f.provider.sessions.values()].at(-1), intent = f.provider.pay(third.id, "alipay", f.time() / 1000);
  await f.notify("payment_intent.succeeded", intent);
  assert.equal((await f.service.status("alice")).passes.expiresAt, new Date(f.time() + 150 * DAY).toISOString());
});
test("incomplete/failed payment, ownership, amount, quantity and wallet tampering never grant time", async (t) => {
  for (const mutate of [(s, i) => { s.payment_status = "unpaid"; }, (s, i) => { i.status = "processing"; }, (s, i) => { i.metadata.studybridge_user_id = "bob"; }, (s, i) => { i.amount_received = 1; }, (s, i) => { s.amount_total = 1; }, (s, i) => { s.line_items[0].quantity = 2; }, (s, i) => { i.latest_charge.payment_method_details.type = "card"; }, (s, i) => { i.livemode = true; }]) {
    const f = await fixture(t); await f.checkout(); const session = [...f.provider.sessions.values()][0], intent = f.provider.pay(session.id, "wechat_pay", f.time() / 1000); mutate(session, intent);
    try { await f.notify("checkout.session.async_payment_succeeded", session); } catch (error) { assert.equal(error.statusCode, 503); }
    assert.equal((await f.service.status("alice")).passes.status, "none");
  }
});
test("wallet history survives event-cache eviction, concurrent requests and expired leases without duplicating paid time", async (t) => {
  const f = await fixture(t, "dynamodb");
  const results = await Promise.allSettled([f.checkout(), f.checkout()]); assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const session = [...f.provider.sessions.values()][0]; f.provider.pay(session.id, "wechat_pay", f.time() / 1000);
  await f.notify("checkout.session.completed", session, "evt_original");
  await f.db.changeBilling("alice", (state) => ({ ...state, events: Array.from({ length: 64 }, (_, i) => `evt_other_${i}`) }));
  await f.notify("checkout.session.completed", session, "evt_original");
  assert.equal((await f.service.status("alice")).passes.expiresAt, new Date(f.time() + 30 * DAY).toISOString());
  let reached, release; const entered = new Promise((r) => { reached = r; }), waiting = new Promise((r) => { release = r; });
  const read = f.provider.stripe.checkout.sessions.retrieve;
  f.provider.stripe.checkout.sessions.retrieve = async (...args) => { f.provider.stripe.checkout.sessions.retrieve = read; const value = await read(...args); reached(); await waiting; return value; };
  const first = createBillingService({ db: f.db, env, stripe: f.provider.stripe, now: () => f.time(), leaseMs: 1 });
  const work = first.refresh("alice"); await entered; f.advance(1);
  const refund = { id: "re_new", payment_intent: session.payment_intent, amount: 1999, currency: "cad", status: "succeeded" }; f.provider.refunds.set(refund.id, refund);
  await f.service.refresh("alice"); release(); await assert.rejects(work, { statusCode: 409 });
  assert.equal((await f.service.status("alice")).passes.status, "none");
});
test("changed wallet prices cannot reuse pending checkout; incomplete refund pagination and capture failures fail closed", async (t) => {
  const f = await fixture(t); await f.checkout();
  f.provider.passPrices.set("price_test_new_month", { ...f.provider.passPrices.get(env.STRIPE_MONTH_PASS_PRICE_ID), id: "price_test_new_month", unit_amount: 2499 });
  const changed = createBillingService({ db: f.db, env: { ...env, STRIPE_MONTH_PASS_PRICE_ID: "price_test_new_month", BILLING_MONTH_PASS_AMOUNT_CENTS: "2499" }, stripe: f.provider.stripe });
  await assert.rejects(changed.passCheckout({ id: "alice" }, { consent: true, plan: "month", requestId: "changed-pass-price" }), { statusCode: 409 });
  assert.equal(f.provider.sessions.size, 1);
  f.provider.passPrices.get(env.STRIPE_MONTH_PASS_PRICE_ID).unit_amount = 1999;
  const session = [...f.provider.sessions.values()][0]; f.provider.pay(session.id, "alipay", f.time() / 1000);
  const list = f.provider.stripe.refunds.list;
  f.provider.stripe.refunds.list = async () => ({ data: [], has_more: true });
  await assert.rejects(f.notify("checkout.session.completed", session), { statusCode: 503 });
  assert.equal((await f.service.status("alice")).passes.status, "none");
  f.provider.stripe.refunds.list = list;
  const write = f.db.local.save; f.db.local.save = async () => { throw Error("disk full"); };
  await assert.rejects(f.notify("checkout.session.completed", session), { statusCode: 503 });
  f.db.local.save = write;
  assert.equal((await f.service.status("alice")).passes.status, "none");
  await f.notify("checkout.session.completed", session); assert.equal((await f.service.status("alice")).passes.status, "active");
});
test("failed asynchronous wallet payment permits a new purchase while a processing payment remains pending", async (t) => {
  const f = await fixture(t); await f.checkout();
  const session = [...f.provider.sessions.values()][0], intent = f.provider.pay(session.id, "wechat_pay", f.time() / 1000);
  session.payment_status = "unpaid"; intent.status = "processing";
  await f.notify("checkout.session.completed", session); assert.equal((await f.service.status("alice")).passes.pending.status, "processing");
  await assert.rejects(f.checkout(), { statusCode: 409 });
  intent.status = "requires_payment_method"; await f.notify("payment_intent.payment_failed", intent);
  const view = (await f.service.status("alice")).passes; assert.equal(view.pending, null); assert.equal(view.latest.status, "failed"); assert.equal(view.status, "none");
  await f.checkout(); assert.equal(f.provider.sessions.size, 2);
});
