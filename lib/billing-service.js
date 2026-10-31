"use strict";
const { randomUUID, createHash } = require("node:crypto");
const Stripe = require("stripe");
const API_VERSION = "2026-10-28.endive";
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode, billingSafe: true });
const integration = "studybridge-test-v1";
const terminal = (status) => ["none", "canceled", "incomplete_expired"].includes(status);
const objectId = (value) => typeof value === "string" ? value : value?.id;

function billingConfig(env = process.env) {
  const mode = env.BILLING_MODE || "disabled", amount = Number(env.BILLING_MONTHLY_AMOUNT_CENTS || 1999);
  const plan = { name: "StudyBridge Plus", amount, currency: "cad", interval: "month" };
  let base = "";
  try {
    const url = new URL(env.BILLING_PUBLIC_BASE_URL || "");
    const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol === "https:" || local && url.protocol === "http:") && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/") base = url.origin;
  } catch { /* A trusted callback origin must be configured explicitly. */ }
  const configured = mode === "test" && /^sk_test_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY || "") &&
    /^whsec_[A-Za-z0-9_]+$/.test(env.STRIPE_WEBHOOK_SECRET || "") && /^price_[A-Za-z0-9_]+$/.test(env.STRIPE_PLUS_MONTHLY_PRICE_ID || "") &&
    Boolean(base) && Number.isSafeInteger(amount) && amount >= 100 && amount <= 100000;
  return { mode: mode === "test" ? "test" : "disabled", configured, plan, base,
    priceId: env.STRIPE_PLUS_MONTHLY_PRICE_ID, portalId: env.STRIPE_PORTAL_CONFIGURATION_ID || "", webhookSecret: env.STRIPE_WEBHOOK_SECRET };
}

function stripeRedirect(value, host) {
  try { const url = new URL(value); if (url.protocol === "https:" && url.hostname === host && !url.port && !url.username && !url.password) return url.href; } catch {}
  throw fail(503, "测试付款页面暂时无法打开，请重试。");
}

function createBillingService({ db, env = process.env, stripe: suppliedStripe, now = Date.now, leaseMs = 120000 }) {
  const config = billingConfig(env);
  const stripe = config.configured ? suppliedStripe || new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: API_VERSION, maxNetworkRetries: 1, timeout: 15000 }) : null;
  const enabled = () => { if (!stripe) throw fail(503, config.mode === "test" ? "测试订阅尚未配置，请联系管理员。" : "订阅付款尚未开放，目前不会收费。"); };
  const initial = (userId) => ({ userId, mode: "test", status: "none", events: [] });
  async function safe(work) {
    try { return await work(); }
    catch (error) { if (error.billingSafe) throw error; throw fail(503, "测试订阅服务暂时不可用，请稍后重试。"); }
  }
  async function saved(userId) { return await db.getBilling(userId) || initial(userId); }
  function publicStatus(state) {
    return { userId: state.userId, mode: config.mode, configured: config.configured, livePaymentsEnabled: false,
      plan: { ...config.plan, amount: Number.isSafeInteger(config.plan.amount) && config.plan.amount >= 100 && config.plan.amount <= 100000 ? config.plan.amount : 1999 },
      subscription: { status: state.status || "none", paid: Boolean(state.paid), cancelAtPeriodEnd: Boolean(state.cancelAtPeriodEnd),
        currentPeriodEnd: state.currentPeriodEnd || null, lastSyncedAt: state.lastSyncedAt || null },
      hasCustomer: Boolean(state.customerId), canCheckout: config.configured && terminal(state.status || "none"),
      message: config.configured ? "测试模式：不会产生真实扣款，现有账号权益保持不变。" : config.mode === "test" ? "测试订阅尚未配置，请联系管理员。" : "订阅付款尚未开放，目前不会收费。" };
  }
  async function withLease(userId, work) {
    enabled(); const token = randomUUID();
    let state = await db.changeBilling(userId, (before) => {
      if (before?.lease?.until > now()) throw fail(409, "订阅操作正在处理中，请稍后重试。");
      return { ...(before || initial(userId)), lease: { token, until: now() + leaseMs } };
    });
    const save = async (changes) => {
      state = await db.changeBilling(userId, (before) => {
        if (before?.lease?.token !== token || before.lease.until <= now()) throw fail(409, "订阅操作已过期，请刷新状态后重试。");
        return { ...before, ...changes };
      }); return state;
    };
    try { return await work(() => state, save); }
    finally { await db.changeBilling(userId, (before) => before?.lease?.token === token ? { ...before, lease: null } : null).catch(() => {}); }
  }
  async function price() {
    const value = await stripe.prices.retrieve(config.priceId);
    if (value.livemode !== false || !value.active || value.currency !== "cad" || value.unit_amount !== config.plan.amount ||
        value.type !== "recurring" || value.recurring?.interval !== "month" || value.recurring.interval_count !== 1 || value.recurring.usage_type !== "licensed") {
      throw fail(503, "测试套餐配置不一致，请联系管理员。");
    }
    return value;
  }
  async function reconcile(state, save, eventId) {
    if (!state.customerId) return state;
    let cursor, subscriptions = [], complete = false;
    for (let page = 0; page < 20; page++) {
      const result = await stripe.subscriptions.list({ customer: state.customerId, status: "all", limit: 100, expand: ["data.latest_invoice"], ...(cursor ? { starting_after: cursor } : {}) });
      if (!Array.isArray(result.data)) throw fail(503, "测试订阅状态暂时无法确认，请重试。");
      subscriptions.push(...result.data);
      if (!result.has_more) { complete = true; break; }
      cursor = result.data.at(-1)?.id;
      if (!cursor) break;
    }
    if (!complete) throw fail(503, "测试订阅状态暂时无法确认，请重试。");
    for (const value of subscriptions) {
      if (!terminal(value.status) && value.items?.data?.some((item) => item.price?.id === config.priceId) &&
          (value.metadata?.studybridge_user_id !== state.userId || value.metadata?.studybridge_integration !== integration)) throw fail(409, "测试订阅归属无法确认，请联系管理员核对。");
    }
    subscriptions = subscriptions.filter((value) => value.metadata?.studybridge_user_id === state.userId && value.metadata?.studybridge_integration === integration);
    for (const value of subscriptions) {
      const items = value.items?.data;
      if (value.livemode !== false || objectId(value.customer) !== state.customerId || !Array.isArray(items) || items.length !== 1 ||
          items[0].price?.id !== config.priceId || items[0].quantity !== 1 || value.currency !== "cad" ||
          items[0].price.unit_amount !== config.plan.amount || items[0].price.recurring?.interval !== "month" || items[0].price.recurring.interval_count !== 1) {
        throw fail(503, "测试订阅信息与套餐不一致，请联系管理员。");
      }
    }
    const current = subscriptions.filter((value) => !terminal(value.status));
    if (current.length > 1) throw fail(409, "检测到重复测试订阅，请联系管理员核对。");
    const subscription = current[0] || subscriptions.sort((a, b) => b.created - a.created)[0];
    let invoice = subscription?.latest_invoice;
    if (typeof invoice === "string") invoice = await stripe.invoices.retrieve(invoice);
    if (invoice && (invoice.livemode !== false || objectId(invoice.customer) !== state.customerId)) throw fail(503, "测试账单信息无法确认，请重试。");
    const end = subscription?.items?.data[0]?.current_period_end;
    const events = eventId ? [...(state.events || []).filter((id) => id !== eventId), eventId].slice(-64) : state.events || [];
    return save({ status: subscription?.status || "none", subscriptionId: subscription?.id || null,
      paid: invoice?.status === "paid", cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
      currentPeriodEnd: Number.isFinite(end) && end > 0 ? new Date(end * 1000).toISOString() : null,
      lastSyncedAt: new Date(now()).toISOString(), events });
  }
  async function customer(user, get, save) {
    if (get().customerId) return get().customerId;
    if (!get().customerAttempt) await save({ customerAttempt: { email: user.email, name: user.name } });
    const value = await stripe.customers.create({ ...get().customerAttempt,
      metadata: { studybridge_user_id: user.id, studybridge_integration: integration } },
    { idempotencyKey: `sb-test-customer-${createHash("sha256").update(user.id).digest("hex")}` });
    if (value.livemode !== false || !/^cus_[A-Za-z0-9_]+$/.test(value.id || "")) throw fail(503, "测试订阅账号暂时无法建立，请重试。");
    await save({ customerId: value.id, customerAttempt: null }); return value.id;
  }
  const status = (userId) => safe(async () => publicStatus(await saved(userId)));
  const refresh = (userId) => safe(() => withLease(userId, async (get, save) => publicStatus(await reconcile(get(), save))));
  const checkout = (user, values) => safe(() => withLease(user.id, async (get, save) => {
    if (values.consent !== true) throw fail(400, "请先确认测试订阅的价格和按月续订说明。");
    if (Object.keys(values).some((key) => !["userId", "consent", "requestId"].includes(key)) || !/^[\w-]{8,100}$/.test(values.requestId || "")) throw fail(400, "测试订阅请求无效，请刷新后重试。");
    await price(); await customer(user, get, save); await reconcile(get(), save);
    if (!terminal(get().status)) throw fail(409, "已有测试订阅，请查看或管理当前订阅。");
    const fingerprint = JSON.stringify([config.priceId, config.plan.amount, config.base]);
    if (get().checkoutSessionId) {
      const previous = await stripe.checkout.sessions.retrieve(get().checkoutSessionId);
      if (previous.livemode !== false || objectId(previous.customer) !== get().customerId) throw fail(503, "测试付款状态无法确认，请重试。");
      if (previous.status === "open" && previous.expires_at * 1000 > now()) {
        if (get().checkoutAttempt?.fingerprint !== fingerprint) throw fail(409, "测试套餐已更新，请联系管理员关闭旧的结账会话后重试。");
        return { url: stripeRedirect(previous.url, "checkout.stripe.com") };
      }
      if (previous.status === "complete" && !(get().subscriptionId && objectId(previous.subscription) === get().subscriptionId && terminal(get().status))) throw fail(409, "正在确认测试付款，请刷新订阅状态。");
      await save({ checkoutAttempt: null, checkoutSessionId: null });
    }
    if (!get().checkoutAttempt || get().checkoutAttempt.until <= now()) await save({ checkoutAttempt: { id: randomUUID(), until: now() + 3600000, fingerprint } });
    if (get().checkoutAttempt.fingerprint !== fingerprint) throw fail(409, "测试套餐已更新，请联系管理员关闭旧的结账会话后重试。");
    const value = await stripe.checkout.sessions.create({ mode: "subscription", customer: get().customerId, client_reference_id: user.id,
      line_items: [{ price: config.priceId, quantity: 1 }], payment_method_types: ["card"],
      metadata: { studybridge_user_id: user.id, studybridge_integration: integration },
      subscription_data: { metadata: { studybridge_user_id: user.id, studybridge_integration: integration } },
      expires_at: Math.floor(get().checkoutAttempt.until / 1000),
      success_url: `${config.base}/app?billing=return`, cancel_url: `${config.base}/app?billing=cancelled` },
    { idempotencyKey: `sb-test-checkout-${get().checkoutAttempt.id}` });
    if (value.livemode !== false || objectId(value.customer) !== get().customerId || value.mode !== "subscription") throw fail(503, "测试付款状态无法确认，请重试。");
    const url = stripeRedirect(value.url, "checkout.stripe.com");
    await save({ checkoutSessionId: value.id }); return { url };
  }));
  const portal = (userId) => safe(() => withLease(userId, async (get) => {
    if (!get().customerId) throw fail(409, "尚未建立测试订阅，请先开通测试订阅。");
    if (config.portalId && !/^bpc_[A-Za-z0-9_]+$/.test(config.portalId)) throw fail(503, "测试账单管理尚未配置，请联系管理员。");
    const value = await stripe.billingPortal.sessions.create({ customer: get().customerId, return_url: `${config.base}/app?billing=return`, ...(config.portalId ? { configuration: config.portalId } : {}) });
    return { url: stripeRedirect(value.url, "billing.stripe.com") };
  }));
  const changeRenewal = (userId, cancel) => safe(() => withLease(userId, async (get, save) => {
    await reconcile(get(), save);
    if (!get().subscriptionId || !["active", "trialing", "past_due"].includes(get().status)) throw fail(409, "当前测试订阅无法调整续订，请先刷新状态。");
    await stripe.subscriptions.update(get().subscriptionId, { cancel_at_period_end: cancel, proration_behavior: "none" });
    return publicStatus(await reconcile(get(), save));
  }));
  const webhook = (raw, signature) => safe(async () => {
    enabled(); let event;
    try { event = stripe.webhooks.constructEvent(raw, signature, config.webhookSecret, 300); }
    catch { throw fail(400, "订阅通知签名无效。"); }
    if (event.livemode !== false || event.account) throw fail(400, "仅接收当前账号的测试订阅通知。");
    if (!/^evt_[A-Za-z0-9_]+$/.test(event.id || "")) throw fail(400, "订阅通知格式无效。");
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) return { received: true };
    const owner = await db.billingCustomerOwner(objectId(event.data?.object?.customer));
    if (!owner) return { received: true };
    const state = await saved(owner.userId);
    if (state.events?.includes(event.id)) return { received: true };
    await withLease(owner.userId, async (get, save) => {
      if (!get().events?.includes(event.id)) await reconcile(get(), save, event.id);
    });
    return { received: true };
  });
  return { status, refresh, checkout, portal, changeRenewal, webhook, origin: config.base };
}
module.exports = { createBillingService, billingConfig, stripeRedirect, API_VERSION };
