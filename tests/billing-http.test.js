const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const Stripe = require("stripe");
const { billingStripeFixture } = require("./helpers/billing-stripe");

test("test-only billing HTTP lifecycle enforces auth/CSRF, verifies raw signed events and persists without changing membership", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-billing-http-")), database = path.join(directory, "db.json");
  let child, base;
  async function stop() { if (child?.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; } }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start(mode = "disabled") {
    child = spawn(process.execPath, ["--require", "./tests/fixtures/billing-provider.js", "server.js"], { cwd: path.resolve(__dirname, ".."), env: {
      ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: database, LOCAL_DB_BACKUP_DISABLED: "true", SESSION_SECRET: "billing-http-test-only",
      REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", BILLING_MODE: mode,
      STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture", STRIPE_PLUS_MONTHLY_PRICE_ID: "price_test_monthly", BILLING_PUBLIC_BASE_URL: "https://studybridge.example",
      BILLING_WALLET_PASSES_ENABLED: "true", STRIPE_MONTH_PASS_PRICE_ID: "price_test_month_pass", STRIPE_SEMESTER_PASS_PRICE_ID: "price_test_semester_pass"
    }, stdio: ["ignore", "pipe", "pipe"] });
    base = await new Promise((resolve, reject) => {
      let output = "", errors = ""; const timer = setTimeout(() => reject(Error("Billing server startup timed out")), 10000);
      child.stderr.on("data", (chunk) => { errors += chunk; }); child.once("error", reject);
      child.once("exit", () => { clearTimeout(timer); reject(Error(errors || "Billing server exited")); });
      child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    });
  }
  const request = async (route, method = "GET", body, cookie = "", headers = {}) => {
    const response = await fetch(base + route, { method, headers: { cookie, "content-type": "application/json", ...headers }, ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], cache: response.headers.get("cache-control"), data: await response.json() };
  };
  const register = (email) => request("/api/auth/register", "POST", { name: "Billing test", email, password: "Billing-Test-2026!", passwordConfirm: "Billing-Test-2026!" });
  await start();
  const alice = await register("billing-alice@example.test"), bob = await register("billing-bob@example.test");
  assert.equal(alice.status, 201); assert.equal(bob.status, 201);
  const userId = alice.data.user.id, before = (await request("/api/me", "GET", undefined, alice.cookie)).data.user;
  let config = await request("/api/billing", "GET", undefined, alice.cookie);
  assert.equal(config.data.billing.configured, false); assert.equal(config.data.billing.livePaymentsEnabled, false);
  assert.equal(config.cache, "private, no-store");
  const act = (action, values = {}, cookie = alice.cookie, headers = {}) => request(`/api/billing/${action}`, "POST", { userId, ...values }, cookie, { "x-csrf-token": config.data.billing.csrfToken, ...headers });
  assert.equal((await act("checkout", { consent: true, requestId: "request-0001" })).status, 503);
  await stop(); await start("test"); config = await request("/api/billing", "GET", undefined, alice.cookie);
  assert.equal(config.data.billing.configured, true);
  assert.equal((await request("/api/billing")).status, 401);
  assert.equal((await act("checkout", { consent: true, requestId: "request-0001" }, bob.cookie)).status, 403);
  assert.equal((await act("checkout", { userId: bob.data.user.id, consent: true, requestId: "request-0001" })).status, 409);
  assert.equal((await act("checkout", {}, alice.cookie, { origin: "https://evil.test", "x-forwarded-host": "evil.test" })).status, 403);
  assert.equal((await act("checkout", { consent: true, requestId: "request-0001", amount: 1 })).status, 400);
  const checkout = await act("checkout", { consent: true, requestId: "request-0001" });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.data)); assert.match(checkout.data.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal((await act("checkout", { consent: true, requestId: "request-0002" })).data.url, checkout.data.url);
  assert.equal((await request("/api/billing", "GET", undefined, alice.cookie)).data.billing.subscription.status, "none");
  const stored = JSON.parse(await fs.readFile(database, "utf8")).billing[userId], helper = billingStripeFixture();
  const subscription = { object: "subscription", ...helper.subscription(userId, stored.customerId) };
  const notify = (object, id, type = "customer.subscription.updated", overrides = {}) => {
    const raw = JSON.stringify({ id, livemode: false, type, data: { object }, ...overrides });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: "whsec_fixture" });
    return request("/api/billing/webhook", "POST", raw, "", { "stripe-signature": signature });
  };
  assert.equal((await request("/api/billing/webhook", "POST", "{}", "", { "stripe-signature": "bad" })).status, 400);
  assert.equal((await notify(subscription, "evt_live", undefined, { livemode: true })).status, 400);
  assert.equal((await notify(subscription, "evt_paid")).status, 200);
  assert.equal((await notify(subscription, "evt_paid")).status, 200);
  let view = (await request("/api/billing", "GET", undefined, alice.cookie)).data.billing;
  assert.equal(view.subscription.status, "active"); assert.equal(view.subscription.paid, true); assert.equal(view.canCheckout, false);
  assert.equal((await request("/api/billing", "GET", undefined, bob.cookie)).data.billing.subscription.status, "none");
  assert.deepEqual((await request("/api/me", "GET", undefined, alice.cookie)).data.user, before);
  assert.equal((await act("checkout", { consent: true, requestId: "request-0003" })).status, 409);
  const canceled = await act("cancel"); assert.equal(canceled.status, 200); assert.equal(canceled.data.billing.subscription.cancelAtPeriodEnd, true);
  assert.equal(canceled.data.billing.subscription.currentPeriodEnd, view.subscription.currentPeriodEnd);
  assert.equal((await act("resume")).data.billing.subscription.cancelAtPeriodEnd, false);
  assert.match((await act("portal")).data.url, /^https:\/\/billing\.stripe\.com\//);
  await notify({ ...subscription, status: "past_due", latest_invoice: { ...subscription.latest_invoice, status: "open" } }, "evt_failed");
  assert.equal((await act("refresh")).data.billing.subscription.status, "past_due");
  for (const action of ["pass-checkout", "pass-cancel"]) {
    assert.equal((await act(action, {}, alice.cookie, { "x-csrf-token": "0".repeat(64) })).status, 403);
    assert.equal((await act(action, { userId: bob.data.user.id })).status, 409);
  }
  assert.equal((await act("pass-checkout", { plan: "month", consent: true, requestId: "request-pass-1", amount: 1 })).status, 400);
  const wallet = await act("pass-checkout", { plan: "month", consent: true, requestId: "request-pass-1" }); assert.equal(wallet.status, 200);
  const walletState = JSON.parse(await fs.readFile(database, "utf8")).billing[userId], order = walletState.passOrders[0];
  assert.equal((await act("refresh")).data.billing.passes.status, "none");
  assert.equal((await act("pass-cancel")).status, 200);
  const semester = await act("pass-checkout", { plan: "semester", consent: true, requestId: "request-pass-2" }); assert.equal(semester.status, 200);
  const semesterOrder = JSON.parse(await fs.readFile(database, "utf8")).billing[userId].passOrders.at(-1);
  const walletEvent = { id: semesterOrder.sessionId, object: "checkout.session", mode: "payment", customer: stored.customerId, status: "complete", payment_status: "paid" };
  assert.equal((await notify(walletEvent, "evt_wallet_paid", "checkout.session.completed")).status, 200);
  const passView = (await act("refresh")).data.billing.passes; assert.equal(passView.status, "active"); assert.equal(passView.latest.plan, "semester");
  assert.equal((await request("/api/billing", "GET", undefined, bob.cookie)).data.billing.passes.status, "none");
  assert.deepEqual((await request("/api/me", "GET", undefined, alice.cookie)).data.user, before);
  assert.ok(order.sessionId);
  await stop(); await start("test");
  view = (await request("/api/billing", "GET", undefined, alice.cookie)).data.billing;
  assert.equal(view.subscription.status, "past_due"); assert.equal(view.subscription.paid, false);
  assert.equal(view.passes.expiresAt, passView.expiresAt);
  assert.doesNotMatch(JSON.stringify(view), /sk_test|whsec|customerId|checkoutSessionId|lease|events/);
});
