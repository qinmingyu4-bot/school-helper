const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const Stripe = require("stripe");
const { StudyBridgeDatabase } = require("../lib/database");
const { createAlipayService, alipayConfig } = require("../lib/alipay-service");
const { membershipTier } = require("../lib/membership");
const { billingStripeFixture } = require("./helpers/billing-stripe");
const { memoryDynamo } = require("./helpers/community-dynamo");
const DAY = 86400000;
const env = { ALIPAY_MODE: "live", STRIPE_ALIPAY_SECRET_KEY: "sk_live_fixture", STRIPE_ALIPAY_WEBHOOK_SECRET: "whsec_alipay",
  STRIPE_ALIPAY_ACCOUNT_ID: "acct_fixture", BILLING_PUBLIC_BASE_URL: "https://studybridge.example", STRIPE_ALIPAY_MONTH_PRICE_ID: "price_test_month_pass",
  STRIPE_ALIPAY_SEMESTER_PRICE_ID: "price_test_semester_pass", ALIPAY_CHECKOUT_ACCESS: "owner", ALIPAY_OWNER_USER_ID: "alice", ALIPAY_PRICES_APPROVED: "true", ALIPAY_TERMS_VERSION: "fixture-v1" };
async function fixture(t, storage = "local", changes = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-alipay-")); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json"); db.dynamo = storage === "dynamodb" ? memoryDynamo().store : null;
  for (const id of ["alice", "bob"]) {
    const user = { id, email: `${id}@example.test`, name: id, membershipTier: "standard" };
    if (db.dynamo) await db.dynamo.put(`USER#${id}`, "PROFILE", "user", user); else await db.createUser(user);
  }
  const settings = { ...env, ...changes }, live = settings.ALIPAY_MODE === "live";
  let clock = Math.floor(Date.now() / 1000) * 1000, sequence = 0;
  const provider = billingStripeFixture({ livemode: live, automaticTax: true });
  const service = createAlipayService({ db, env: settings, stripe: provider.stripe, now: () => clock });
  const checkout = (plan = "month", extra = {}, userId = "alice") => service.checkout({ id: userId, email: `${userId}@example.test`, name: userId },
    { userId, plan, consent: true, termsVersion: settings.ALIPAY_TERMS_VERSION, requestId: `alipay-request-${++sequence}`, ...extra });
  const notify = (type, object, id = `evt_alipay_${++sequence}`, overrides = {}) => {
    const raw = JSON.stringify({ id, type, livemode: live, data: { object }, ...overrides });
    return service.webhook(Buffer.from(raw), Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: settings.STRIPE_ALIPAY_WEBHOOK_SECRET }));
  };
  return { db, service, provider, checkout, notify, time: () => clock, advance: (days) => { clock += days * DAY; }, settings };
}
test("Alipay defaults closed; draft prices, owner isolation and explicit live/test credentials fail before provider or persistence", async (t) => {
  assert.equal(alipayConfig().configured, false);
  for (const change of [{ ALIPAY_MODE: "disabled" }, { STRIPE_ALIPAY_SECRET_KEY: "sk_test_wrong" }, { STRIPE_ALIPAY_WEBHOOK_SECRET: "" }, { ALIPAY_CHECKOUT_ACCESS: "closed" },
    { ALIPAY_PRICES_APPROVED: "false" }, { ALIPAY_TERMS_VERSION: "" }, { STRIPE_ALIPAY_SEMESTER_PRICE_ID: env.STRIPE_ALIPAY_MONTH_PRICE_ID }, { ALIPAY_OWNER_USER_ID: "bob" }]) {
    const f = await fixture(t, "local", change);
    await assert.rejects(f.checkout(), { statusCode: 503 }); assert.equal(f.provider.calls.length, 0);
    assert.equal(await f.db.getBilling("alice", "alipay-live"), null);
  }
  const f = await fixture(t); await assert.rejects(f.checkout("month", {}, "bob"), { statusCode: 503 });
  for (const extra of [{ consent: false }, { termsVersion: "old" }, { amount: 1 }, { priceId: "price_other" }, { plan: "lifetime" }, { userId: "bob" }]) await assert.rejects(f.checkout("month", extra), { statusCode: 400 });
  assert.equal(f.provider.calls.length, 0);
});
for (const storage of ["local", "dynamodb"]) {
  test(`${storage}: live Alipay paid ledger atomically grants expiring Plus without overwriting profile, invitation or test records`, async (t) => {
    const f = await fixture(t, storage), before = await f.db.getUser("alice");
    await f.db.changeBilling("alice", () => ({ userId: "alice", mode: "test", customerId: "cus_unrelated", passOrders: [] }));
    const testState = await f.db.getBilling("alice");
    const url = await f.checkout(); assert.deepEqual(await f.checkout(), url);
    const session = [...f.provider.sessions.values()][0];
    assert.deepEqual(session.payment_method_types, ["alipay"]); assert.equal(session.payment_method_options, undefined);
    assert.equal(session.mode, "payment"); assert.deepEqual(session.customer_update, { address: "auto" }); assert.equal(session.billing_address_collection, "required");
    assert.equal(session.automatic_tax.enabled, true); assert.equal(await f.service.entitlement("alice"), null);
    // A believable signed redirect snapshot is insufficient when the provider is unpaid.
    await f.notify("checkout.session.completed", { ...session, status: "complete", payment_status: "paid" });
    assert.equal(await f.service.entitlement("alice"), null);
    session.amount_total += 260; session.total_details.amount_tax = 260;
    const intent = f.provider.pay(session.id, "alipay", f.time() / 1000);
    await f.notify("payment_intent.succeeded", intent, "evt_paid");
    const end = new Date(f.time() + 30 * DAY).toISOString();
    assert.equal(await f.service.entitlement("alice"), end);
    assert.equal(membershipTier({ ...before, paidMembershipExpiresAt: end }, f.time()), "plus");
    await f.notify("payment_intent.succeeded", intent, "evt_paid"); await f.service.refresh("alice");
    assert.equal(await f.service.entitlement("alice"), end);
    f.advance(2); await f.checkout("semester"); const next = [...f.provider.sessions.values()].at(-1);
    f.provider.pay(next.id, "alipay", f.time() / 1000); await f.notify("checkout.session.completed", next);
    assert.equal(await f.service.entitlement("alice"), new Date(Date.parse(end) + 120 * DAY).toISOString());
    assert.deepEqual(await f.db.getUser("alice"), before); assert.deepEqual(await f.db.getBilling("alice"), testState);
    assert.equal(await f.service.entitlement("bob"), null);
    const closed = createAlipayService({ db: f.db, env: { ...f.settings, ALIPAY_CHECKOUT_ACCESS: "closed" }, stripe: f.provider.stripe, now: f.time });
    assert.equal((await closed.status("alice")).canCheckout, false); assert.ok(await closed.entitlement("alice"));
    assert.doesNotMatch(JSON.stringify(await closed.status("alice")), /sk_live|whsec|price_test|cus_test|pi_test|passOrders|accountId/);
    f.advance(150); assert.equal(await closed.entitlement("alice"), null);
    assert.equal(membershipTier({ ...before, paidMembershipExpiresAt: end }, f.time()), "standard");
    assert.equal(membershipTier({ membershipTier: "plus", paidMembershipExpiresAt: end }, f.time()), "plus");
  });
  test(`${storage}: tax-inclusive refunds alter only purchased validity; retries and replay cannot restore refunded access`, async (t) => {
    const f = await fixture(t, storage); await f.checkout(); const session = [...f.provider.sessions.values()][0];
    session.amount_total = 2259; session.total_details.amount_tax = 260;
    const intent = f.provider.pay(session.id, "alipay", f.time() / 1000); await f.notify("checkout.session.completed", session);
    const refund = { id: "re_tax", payment_intent: intent.id, currency: "cad", amount: 1000, status: "pending" };
    f.provider.refunds.set(refund.id, refund); await f.notify("refund.updated", refund);
    assert.equal(await f.service.entitlement("alice"), new Date(f.time() + 30 * DAY).toISOString());
    refund.status = "succeeded"; await f.notify("refund.updated", refund);
    assert.equal(await f.service.entitlement("alice"), new Date(f.time() + Math.floor(30 * DAY * 1259 / 2259)).toISOString());
    refund.amount = 2259; await f.notify("refund.updated", refund); await f.notify("checkout.session.completed", session);
    assert.equal(await f.service.entitlement("alice"), null);
  });
}
test("Alipay blocks wrong merchant, pending approval, test objects, other wallets and inconsistent tax totals", async (t) => {
  for (const change of [{ id: "acct_other" }, { country: "US" }, { charges_enabled: false }, { payouts_enabled: false }, { capabilities: { alipay_payments: "pending" } }]) {
    const f = await fixture(t); Object.assign(f.provider.account, change); await assert.rejects(f.checkout(), { statusCode: 503 }); assert.equal(f.provider.customers.size, 0);
  }
  for (const mutate of [(s) => { s.livemode = false; }, (s) => { s.total_details.amount_tax = 10; }, (s) => { s.automatic_tax.status = "requires_location_inputs"; },
    (s, p, i) => { i.latest_charge.payment_method_details.type = "wechat_pay"; }, (s, p, i) => { i.latest_charge.livemode = false; }, (s, p, i) => { i.amount_received = 1; }]) {
    const f = await fixture(t); await f.checkout(); const s = [...f.provider.sessions.values()][0], i = f.provider.pay(s.id, "alipay", f.time() / 1000);
    mutate(s, f.provider, i); await assert.rejects(f.notify("payment_intent.succeeded", i)); assert.equal(await f.service.entitlement("alice"), null);
  }
  const f = await fixture(t); await assert.rejects(f.service.webhook(Buffer.from("{}"), "bad"), { statusCode: 400 });
  await assert.rejects(f.notify("checkout.session.completed", {}, undefined, { livemode: false }), { statusCode: 400 });
});
test("Alipay sandbox records never grant live access and live notifications cannot cross into sandbox", async (t) => {
  const f = await fixture(t, "local", { ALIPAY_MODE: "test", STRIPE_ALIPAY_SECRET_KEY: "sk_test_fixture" });
  await f.checkout(); const s = [...f.provider.sessions.values()][0]; f.provider.pay(s.id, "alipay", f.time() / 1000); await f.notify("checkout.session.completed", s);
  assert.equal((await f.service.status("alice")).passes.status, "active"); assert.equal(await f.service.entitlement("alice"), null);
  assert.equal(await f.db.getBilling("alice", "alipay-live"), null);
  await assert.rejects(f.notify("checkout.session.completed", s, undefined, { livemode: true }), { statusCode: 400 });
});
test("Alipay lost Checkout response recovers one order; expired leases cannot commit paid access", async (t) => {
  const f = await fixture(t), create = f.provider.stripe.checkout.sessions.create;
  let lost = true;
  f.provider.stripe.checkout.sessions.create = async (...args) => { const result = await create(...args); if (lost) { lost = false; throw Error("lost response"); } return result; };
  await assert.rejects(f.checkout(), { statusCode: 503 }); await f.checkout(); assert.equal(f.provider.sessions.size, 1);
  const s = [...f.provider.sessions.values()][0]; f.provider.pay(s.id, "alipay", f.time() / 1000);
  const read = f.provider.stripe.paymentIntents.retrieve;
  f.provider.stripe.paymentIntents.retrieve = async (...args) => { const result = await read(...args); f.advance(1); return result; };
  await assert.rejects(f.service.refresh("alice"), { statusCode: 409 }); assert.equal(await f.service.entitlement("alice"), null);
});
