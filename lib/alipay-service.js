"use strict";
const { randomUUID, createHash } = require("node:crypto");
const Stripe = require("stripe");
const { createPassService, publicPasses, passEnd } = require("./billing-passes");
const { API_VERSION, stripeRedirect } = require("./billing-service");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode, billingSafe: true });
const objectId = (value) => typeof value === "string" ? value : value?.id;
const events = new Set(["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled", "refund.created", "refund.updated", "refund.failed", "charge.refunded"]);

function alipayConfig(env = process.env) {
  const mode = ["test", "live"].includes(env.ALIPAY_MODE) ? env.ALIPAY_MODE : "disabled", live = mode === "live";
  let base = "";
  try {
    const url = new URL(env.BILLING_PUBLIC_BASE_URL || "");
    if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/") base = url.origin;
  } catch { /* Payment return URLs must have a trusted HTTPS origin. */ }
  const plans = [
    { id: "month", days: 30, amount: Number(env.ALIPAY_MONTH_AMOUNT_CENTS || 1999), priceId: env.STRIPE_ALIPAY_MONTH_PRICE_ID },
    { id: "semester", days: 120, amount: Number(env.ALIPAY_SEMESTER_AMOUNT_CENTS || 6999), priceId: env.STRIPE_ALIPAY_SEMESTER_PRICE_ID }
  ];
  const accountId = env.STRIPE_ALIPAY_ACCOUNT_ID || "", ownerId = env.ALIPAY_OWNER_USER_ID || "";
  const configured = mode !== "disabled" && new RegExp(`^(?:sk|rk)_${live ? "live" : "test"}_[A-Za-z0-9_]+$`).test(env.STRIPE_ALIPAY_SECRET_KEY || "") &&
    /^whsec_[A-Za-z0-9_]+$/.test(env.STRIPE_ALIPAY_WEBHOOK_SECRET || "") && /^acct_[A-Za-z0-9]+$/.test(accountId) && Boolean(base) &&
    plans.every((p) => /^price_[A-Za-z0-9_]+$/.test(p.priceId || "") && Number.isSafeInteger(p.amount) && p.amount >= 100 && p.amount <= 100000) && plans[0].priceId !== plans[1].priceId;
  const access = ["owner", "public"].includes(env.ALIPAY_CHECKOUT_ACCESS) ? env.ALIPAY_CHECKOUT_ACCESS : "closed";
  const termsVersion = env.ALIPAY_TERMS_VERSION || "";
  const approved = env.ALIPAY_PRICES_APPROVED === "true" && /^[A-Za-z0-9_.-]{1,80}$/.test(termsVersion);
  return { mode, live, configured, base, accountId, ownerId, access, approved, termsVersion, namespace: live ? "alipay-live" : "alipay-test",
    secret: env.STRIPE_ALIPAY_SECRET_KEY, webhookSecret: env.STRIPE_ALIPAY_WEBHOOK_SECRET,
    passes: { configured, plans, live, methods: ["alipay"], automaticTax: true, taxCode: "txcd_10105001", termsVersion, idempotencyPrefix: `sb-alipay-${mode}` } };
}

function createAlipayService({ db, env = process.env, stripe: suppliedStripe, now = Date.now, leaseMs = 120000 }) {
  const config = alipayConfig(env), integration = `studybridge-alipay-${config.mode}-v1`;
  const stripe = config.configured ? suppliedStripe || new Stripe(config.secret, { apiVersion: API_VERSION, maxNetworkRetries: 1, timeout: 15000 }) : null;
  const passes = createPassService({ stripe, config: config.passes, base: config.base, now, fail, stripeRedirect, objectId, integration });
  const initial = (userId) => ({ userId, mode: config.namespace, accountId: config.accountId, events: [] });
  const enabled = () => { if (!stripe) throw fail(503, "支付宝正式接入尚未完成，目前不会收费。"); };
  const allowed = (userId) => Boolean(config.configured && config.approved && (config.access === "public" || config.access === "owner" && config.ownerId && userId === config.ownerId));
  async function safe(work) {
    try { return await work(); } catch (error) {
      if (error.billingSafe) { error.message = error.message.replaceAll("测试", ""); throw error; }
      throw fail(503, "支付宝付款状态暂时无法确认，请稍后重试。");
    }
  }
  async function saved(userId) {
    const value = await db.getBilling(userId, config.namespace);
    if (value && value.accountId !== config.accountId) throw fail(409, "支付宝收款账户配置已变更，请联系管理员核对。");
    return value || initial(userId);
  }
  function view(state) {
    const canCheckout = allowed(state.userId), visible = state.userId === config.ownerId || Boolean(state.customerId);
    return { userId: state.userId, visible, mode: config.mode, configured: config.configured, canCheckout, canRefresh: Boolean(stripe && state.customerId),
      realCharges: config.live, pricesApproved: config.approved, termsVersion: config.termsVersion,
      passes: publicPasses(state, { ...config.passes, configured: canCheckout }, now()),
      message: !config.approved ? "支付宝价格仍为草案，付款尚未开放。" : !canCheckout ? "支付宝付款尚未对当前账号开放。" : config.live ? "支付宝正式付款：一次性购买，不会自动续费。" : "支付宝测试付款：不会真实扣款。" };
  }
  async function account(checkout = false) {
    const value = await stripe.accounts.retrieve();
    if (value.id !== config.accountId || value.country !== "CA") throw fail(503, "支付宝收款账户无法确认。");
    if (checkout && config.live && (!value.charges_enabled || !value.payouts_enabled || value.capabilities?.alipay_payments !== "active")) throw fail(503, "支付宝尚未通过收款审核，暂时无法付款。");
    if (checkout) {
      const tax = await stripe.tax.settings.retrieve();
      if (tax.status !== "active") throw fail(503, "自动算税配置尚未完成，暂时无法付款。");
    }
  }
  async function withLease(userId, work) {
    enabled(); await saved(userId);
    const token = randomUUID();
    let state = await db.changeBilling(userId, (before) => {
      if (before?.lease?.until > now()) throw fail(409, "付款状态正在更新，请稍后重试。");
      return { ...(before || initial(userId)), lease: { token, until: now() + leaseMs } };
    }, config.namespace);
    const save = async (changes) => {
      state = await db.changeBilling(userId, (before) => {
        if (before?.lease?.token !== token || before.lease.until <= now()) throw fail(409, "付款操作已过期，请刷新状态。");
        const next = { ...before, ...changes };
        // Entitlement and its verified purchase ledger commit in the same transaction.
        next.entitlementExpiresAt = config.live ? passEnd(next.passOrders || []) : 0;
        if (Buffer.byteLength(JSON.stringify(next)) > 250000) throw fail(409, "付款记录需要管理员归档，请联系支持后再购买。");
        return next;
      }, config.namespace); return state;
    };
    try { return await work(() => state, save); }
    finally { await db.changeBilling(userId, (before) => before?.lease?.token === token ? { ...before, lease: null } : null, config.namespace).catch(() => {}); }
  }
  async function customer(user, get, save) {
    if (get().customerId) return;
    if (!get().customerAttempt) await save({ customerAttempt: { email: user.email, name: user.name, until: now() + 3600000, id: randomUUID() } });
    const attempt = get().customerAttempt;
    if (attempt.until <= now()) throw fail(409, "收款账号建立结果需要核对，请联系管理员。");
    const value = await stripe.customers.create({ email: attempt.email, name: attempt.name, metadata: { studybridge_user_id: user.id, studybridge_integration: integration } },
      { idempotencyKey: `sb-alipay-${config.mode}-customer-${createHash("sha256").update(`${config.accountId}:${user.id}:${attempt.id}`).digest("hex")}` });
    if (value.livemode !== config.live || !/^cus_[A-Za-z0-9_]+$/.test(value.id || "")) throw fail(503, "支付宝付款账号无法确认。");
    await save({ customerId: value.id, customerAttempt: null });
  }
  const status = (userId) => safe(async () => view(await saved(userId)));
  const checkout = (user, values) => safe(async () => {
    if (!allowed(user.id)) throw fail(503, "支付宝付款尚未开放，目前不会收费。");
    if (values.consent !== true || values.termsVersion !== config.termsVersion || values.userId !== user.id || !["month", "semester"].includes(values.plan) ||
        !/^[\w-]{8,100}$/.test(values.requestId || "") || Object.keys(values).some((key) => !["userId", "plan", "consent", "requestId", "termsVersion"].includes(key))) throw fail(400, "请确认当前价格、天数和手动续费说明后再付款。");
    await account(true);
    return withLease(user.id, async (get, save) => {
      const { termsVersion, ...request } = values;
      // Save the agreed version alongside the durable order, including uncertain creations.
      const orderSave = (changes) => save({ ...changes, ...(changes.passOrders ? { passOrders: changes.passOrders.map((o) => o.termsVersion ? o : { ...o, termsVersion }) } : {}) });
      return passes.checkout(user, request, get, orderSave, () => customer(user, get, save));
    });
  });
  const refresh = (userId) => safe(async () => {
    enabled(); await account();
    return withLease(userId, async (get, save) => { await passes.reconcile(get, save); return view(get()); });
  });
  const cancel = (userId) => safe(async () => { enabled(); await account(); return withLease(userId, async (get, save) => view(await passes.cancel(get, save))); });
  const webhook = (raw, signature) => safe(async () => {
    enabled(); let event;
    try { event = stripe.webhooks.constructEvent(raw, signature, config.webhookSecret, 300); } catch { throw fail(400, "支付宝通知签名无效。"); }
    if (event.livemode !== config.live || event.account || !/^evt_[A-Za-z0-9_]+$/.test(event.id || "")) throw fail(400, "支付宝通知环境或账号不匹配。");
    if (!events.has(event.type)) return { received: true };
    await account();
    const object = event.data?.object;
    let target, customerId;
    if (event.type.startsWith("checkout.session.")) { target = { sessionId: object?.id }; customerId = objectId(object?.customer); }
    else {
      const id = event.type.startsWith("payment_intent.") ? object?.id : objectId(object?.payment_intent);
      if (!/^pi_[A-Za-z0-9_]+$/.test(id || "")) return { received: true };
      const intent = await stripe.paymentIntents.retrieve(id);
      if (intent.livemode !== config.live) throw fail(400, "支付宝通知环境不匹配。");
      customerId = objectId(intent.customer); target = { intentId: intent.id, orderId: intent.metadata?.studybridge_pass_order };
    }
    const owner = await db.billingCustomerOwner(customerId, config.namespace);
    if (!owner) return { received: true };
    await withLease(owner.userId, async (get, save) => {
      if (get().events?.includes(event.id)) return;
      await passes.reconcile(get, save, target);
      await save({ events: [...(get().events || []), event.id].slice(-64), lastSyncedAt: new Date(now()).toISOString() });
    });
    return { received: true };
  });
  async function entitlement(userId) {
    // Reads do not depend on Checkout availability, so closing sales preserves paid access.
    const state = await db.getBilling(userId, "alipay-live");
    const end = state?.entitlementExpiresAt;
    return state?.mode === "alipay-live" && Number.isSafeInteger(end) && end > now() ? new Date(end).toISOString() : null;
  }
  return { status, checkout, refresh, cancel, webhook, entitlement, origin: config.base };
}
module.exports = { alipayConfig, createAlipayService };
