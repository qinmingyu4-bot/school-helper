const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process"), { once } = require("node:events");
const Stripe = require("stripe");
const { SESSION_COOKIE } = require("../lib/security");
const hashToken = (token) => require("node:crypto").createHmac("sha256", "alipay-http-only").update(token).digest("hex");

test("Alipay HTTP enforces closed/owner gates, CSRF and verified payment; paid membership survives closing sales and restarts", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-alipay-http-")), file = path.join(directory, "db.json");
  const users = Object.fromEntries(["alice", "bob"].map((id) => [id, { id, email: `${id}@example.test`, name: id, membershipTier: "standard", passwordVersion: 0 }]));
  const sessions = Object.fromEntries(["alice", "bob"].map((id) => [hashToken(`${id}-token`), { tokenHash: hashToken(`${id}-token`), userId: id, passwordVersion: 0, expiresAt: Date.now() + 3600000 }]));
  await fs.writeFile(file, JSON.stringify({ users, sessions, emailIndex: {}, courses: {}, documents: {}, messages: {}, invites: {} }));
  let child, base;
  async function stop() { if (child?.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; } }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start(access = "closed", approved = "false") {
    child = spawn(process.execPath, ["--require", "./tests/fixtures/alipay-provider.js", "server.js"], { cwd: path.resolve(__dirname, ".."), env: {
      ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: file, LOCAL_DB_BACKUP_DISABLED: "true", SESSION_SECRET: "alipay-http-only",
      OPENAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", BILLING_MODE: "disabled", ALIPAY_MODE: "live", ALIPAY_CHECKOUT_ACCESS: access,
      ALIPAY_PRICES_APPROVED: approved, ALIPAY_OWNER_USER_ID: "alice", ALIPAY_TERMS_VERSION: "fixture-v1", BILLING_PUBLIC_BASE_URL: "https://studybridge.example",
      STRIPE_ALIPAY_ACCOUNT_ID: "acct_fixture", STRIPE_ALIPAY_SECRET_KEY: "sk_live_fixture", STRIPE_ALIPAY_WEBHOOK_SECRET: "whsec_alipay",
      STRIPE_ALIPAY_MONTH_PRICE_ID: "price_test_month_pass", STRIPE_ALIPAY_SEMESTER_PRICE_ID: "price_test_semester_pass"
    }, stdio: ["ignore", "pipe", "pipe"] });
    base = await new Promise((resolve, reject) => {
      let out = "", errors = ""; const timer = setTimeout(() => reject(Error("Alipay server startup timed out")), 10000);
      child.stderr.on("data", (chunk) => { errors += chunk; }); child.once("error", reject); child.once("exit", () => { clearTimeout(timer); reject(Error(errors || "Alipay server exited")); });
      child.stdout.on("data", (chunk) => { out += chunk; const match = out.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    });
  }
  const request = async (route, method = "GET", body, user = "alice", headers = {}) => {
    const response = await fetch(base + route, { method, headers: { cookie: user ? `${SESSION_COOKIE}=${user}-token` : "", "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
    return { status: response.status, cache: response.headers.get("cache-control"), data: await response.json() };
  };
  let config;
  const act = (action, values = {}, user = "alice", headers = {}) => request(`/api/billing/alipay/${action}`, "POST", { userId: user, ...values }, user, { "x-csrf-token": config.data.alipay.csrfToken, ...headers });
  const buy = { plan: "month", consent: true, termsVersion: "fixture-v1", requestId: "alipay-http-request" };
  const notify = (object, id, type = "checkout.session.completed") => {
    const raw = JSON.stringify({ id, livemode: true, type, data: { object } });
    return request("/api/billing/alipay/webhook", "POST", raw, "", { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: "whsec_alipay" }) });
  };
  await start(); config = await request("/api/billing/alipay");
  assert.equal(config.data.alipay.canCheckout, false); assert.equal(config.cache, "private, no-store");
  assert.equal((await act("checkout", buy)).status, 503); assert.equal(JSON.parse(await fs.readFile(file, "utf8")).alipayLive, undefined);
  await stop(); await start("owner", "true"); config = await request("/api/billing/alipay");
  assert.equal((await request("/api/billing/alipay", "GET", undefined, "")).status, 401);
  assert.equal((await act("checkout", buy, "bob")).status, 403);
  const bobConfig = await request("/api/billing/alipay", "GET", undefined, "bob");
  assert.equal(bobConfig.data.alipay.visible, false);
  assert.equal((await act("checkout", buy, "bob", { "x-csrf-token": bobConfig.data.alipay.csrfToken })).status, 503);
  assert.equal((await act("checkout", buy, "alice", { origin: "https://evil.test" })).status, 403);
  assert.equal((await act("checkout", { ...buy, amount: 1 })).status, 400);
  assert.equal((await act("checkout", { ...buy, userId: "bob" })).status, 409);
  const checkout = await act("checkout", buy); assert.equal(checkout.status, 200); assert.match(checkout.data.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal((await request("/api/me")).data.user.membershipTier, "standard");
  assert.equal((await request("/api/billing/alipay/webhook", "POST", "{}", "")).status, 400);
  let state = JSON.parse(await fs.readFile(file, "utf8")).alipayLive.alice;
  const session = { id: state.passOrders[0].sessionId, object: "checkout.session", customer: state.customerId, payment_status: "paid" };
  assert.equal((await notify(session, "evt_http_paid")).status, 200);
  let me = (await request("/api/me")).data.user; assert.equal(me.membershipTier, "plus"); assert.ok(me.paidMembershipExpiresAt); assert.equal(me.role, "student");
  state = JSON.parse(await fs.readFile(file, "utf8")).alipayLive.alice;
  const refund = { id: "re_http", object: "refund", payment_intent: state.passOrders[0].intentId, currency: "cad", amount: 1999, status: "succeeded" };
  assert.equal((await notify(refund, "evt_http_refund", "refund.updated")).status, 200);
  assert.equal((await request("/api/me")).data.user.membershipTier, "standard");
  assert.equal((await act("checkout", { ...buy, requestId: "alipay-http-second" })).status, 200);
  state = JSON.parse(await fs.readFile(file, "utf8")).alipayLive.alice;
  assert.equal((await notify({ ...session, id: state.passOrders.at(-1).sessionId }, "evt_http_paid_again")).status, 200);
  const end = (await request("/api/me")).data.user.paidMembershipExpiresAt;
  await stop(); await start(); config = await request("/api/billing/alipay");
  me = (await request("/api/me")).data.user; assert.equal(me.membershipTier, "plus"); assert.equal(me.paidMembershipExpiresAt, end);
  assert.equal((await act("checkout", buy)).status, 503);
  assert.equal((await request("/api/billing")).data.billing.configured, false);
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).users.alice.membershipTier, "standard");
});
