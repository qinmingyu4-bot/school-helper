"use strict";
const { randomUUID } = require("node:crypto");
const DAY = 86400000;
const open = (order) => ["creating", "open", "processing"].includes(order.status);
function passConfig(env, enabled) {
  const plans = [
    { id: "month", days: 30, amount: Number(env.BILLING_MONTH_PASS_AMOUNT_CENTS || 1999), priceId: env.STRIPE_MONTH_PASS_PRICE_ID },
    { id: "semester", days: 120, amount: Number(env.BILLING_SEMESTER_PASS_AMOUNT_CENTS || 6999), priceId: env.STRIPE_SEMESTER_PASS_PRICE_ID }
  ];
  const configured = enabled && env.BILLING_WALLET_PASSES_ENABLED === "true" && plans.every((p) => /^price_[A-Za-z0-9_]+$/.test(p.priceId || "") && Number.isSafeInteger(p.amount) && p.amount >= 100 && p.amount <= 100000) &&
    new Set([...plans.map((p) => p.priceId), env.STRIPE_PLUS_MONTHLY_PRICE_ID]).size === 3;
  return { configured: Boolean(configured), plans };
}
// Rebuild from durable, verified purchases, never from notification counts or the current time.
function passEnd(orders) {
  let end = 0;
  for (const order of [...orders].filter((o) => o.paidAt && o.refundedAmount < o.amount).sort((a, b) => a.paidAt - b.paidAt || a.id.localeCompare(b.id))) {
    end = Math.max(end, order.paidAt) + Math.floor(order.days * DAY * (order.amount - order.refundedAmount) / order.amount);
  }
  return end;
}
function publicPasses(state, config, now) {
  const orders = state.passOrders || [], end = passEnd(orders), pending = orders.find(open);
  return { configured: config.configured, plans: config.plans.map(({ id, days, amount }) => ({ id, days, amount: Number.isSafeInteger(amount) && amount >= 100 && amount <= 100000 ? amount : id === "month" ? 1999 : 6999, currency: "cad" })),
    status: end > now ? "active" : end ? "expired" : "none", expiresAt: end ? new Date(end).toISOString() : null,
    pending: pending ? { plan: pending.plan, status: pending.status, canCancel: Boolean(pending.sessionId) && pending.status === "open" } : null,
    latest: orders.length ? { plan: orders.at(-1).plan, status: orders.at(-1).status } : null };
}
function createPassService({ stripe, config, base, now, fail, stripeRedirect, objectId, integration }) {
  const invalid = () => fail(503, "测试会员卡付款信息无法确认，请联系管理员。");
  const enabled = () => { if (!config.configured) throw fail(503, "微信和支付宝测试付款尚未配置，请联系管理员。"); };
  const metadata = (userId, id) => ({ studybridge_user_id: userId, studybridge_integration: integration, studybridge_pass_order: id });
  function owned(value, state, order) {
    return value?.livemode === false && objectId(value.customer) === state.customerId && Object.entries(metadata(state.userId, order.id)).every(([key, val]) => value.metadata?.[key] === val);
  }
  async function readOrder(state, order, suppliedSession) {
    if (!order.sessionId && !suppliedSession) return order;
    const session = suppliedSession || await stripe.checkout.sessions.retrieve(order.sessionId);
    if (!owned(session, state, order) || session.mode !== "payment" || session.client_reference_id !== state.userId || order.sessionId && order.sessionId !== session.id) throw invalid();
    const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
    const line = lines.data?.[0];
    if (lines.has_more || lines.data?.length !== 1 || line.quantity !== 1 || line.price?.id !== order.priceId || line.price?.type !== "one_time" || line.price?.currency !== "cad" || line.price?.unit_amount !== order.amount ||
        session.amount_total !== order.amount || session.currency !== "cad") throw invalid();
    const result = { ...order, sessionId: session.id, status: session.status === "expired" ? "expired" : session.status === "complete" ? "processing" : "open" };
    if (order.paidAt && session.payment_status !== "paid") throw invalid();
    if (session.payment_status !== "paid") {
      if (session.status === "complete" && objectId(session.payment_intent)) {
        const pending = await stripe.paymentIntents.retrieve(objectId(session.payment_intent));
        if (!owned(pending, state, order) || pending.amount !== order.amount || pending.currency !== "cad") throw invalid();
        if (["canceled", "requires_payment_method"].includes(pending.status)) return { ...result, status: "failed", intentId: pending.id };
      }
      return result;
    }
    if (session.status !== "complete" || !objectId(session.payment_intent)) throw invalid();
    const intent = await stripe.paymentIntents.retrieve(objectId(session.payment_intent), { expand: ["latest_charge"] });
    const charge = intent.latest_charge;
    if (!owned(intent, state, order) || intent.status !== "succeeded" || intent.amount !== order.amount || intent.amount_received !== order.amount || intent.currency !== "cad" ||
        !charge || typeof charge === "string" || charge.livemode !== false || !charge.paid || !charge.captured || objectId(charge.customer) !== state.customerId || objectId(charge.payment_intent) !== intent.id ||
        charge.amount !== order.amount || charge.currency !== "cad" || !["alipay", "wechat_pay"].includes(charge.payment_method_details?.type) || !Number.isSafeInteger(charge.created) || charge.created <= 0 || charge.created * 1000 > now() + 300000 ||
        order.intentId && order.intentId !== intent.id || order.paidAt && order.paidAt !== charge.created * 1000) throw invalid();
    let refunded = 0, cursor, complete = false;
    for (let page = 0; page < 20; page++) {
      const refunds = await stripe.refunds.list({ payment_intent: intent.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
      if (!Array.isArray(refunds.data)) throw invalid();
      for (const refund of refunds.data) {
        if (objectId(refund.payment_intent) !== intent.id || refund.currency !== "cad" || !Number.isSafeInteger(refund.amount) || refund.amount < 0) throw invalid();
        if (refund.status === "succeeded") refunded += refund.amount;
      }
      if (!refunds.has_more) { complete = true; break; }
      cursor = refunds.data.at(-1)?.id; if (!cursor) break;
    }
    if (!complete || refunded > order.amount) throw invalid();
    return { ...result, intentId: intent.id, paidAt: charge.created * 1000, refundedAmount: refunded, status: refunded === order.amount ? "refunded" : refunded ? "partially_refunded" : "paid" };
  }
  async function reconcile(get, save, target = {}) {
    let session;
    if (target.sessionId) session = await stripe.checkout.sessions.retrieve(target.sessionId);
    let orders = get().passOrders || [], changed = false;
    for (let index = 0; index < orders.length; index++) {
      const order = orders[index];
      const selected = target.sessionId ? order.sessionId === target.sessionId || session?.metadata?.studybridge_pass_order === order.id : target.intentId ? order.intentId === target.intentId || target.orderId === order.id :
        open(order) || order.paidAt >= now() - 181 * DAY;
      if (!selected) continue;
      if (target.intentId && !order.sessionId) {
        const sessions = await stripe.checkout.sessions.list({ payment_intent: target.intentId, limit: 2 });
        if (sessions.has_more || sessions.data?.length !== 1) throw invalid();
        session = sessions.data[0];
      }
      const next = await readOrder(get(), order, session);
      if (JSON.stringify(next) !== JSON.stringify(order)) { orders = orders.map((o, i) => i === index ? next : o); changed = true; }
    }
    if (changed) await save({ passOrders: orders });
    return get();
  }
  async function checkout(user, values, get, save, ensureCustomer) {
    enabled();
    if (values.consent !== true) throw fail(400, "请先确认会员卡测试价格和手动续费说明。");
    if (Object.keys(values).some((key) => !["userId", "plan", "consent", "requestId"].includes(key)) || !/^[\w-]{8,100}$/.test(values.requestId || "") || !config.plans.some((p) => p.id === values.plan)) throw fail(400, "测试会员卡请求无效，请刷新后重试。");
    await reconcile(get, save);
    const plan = config.plans.find((p) => p.id === values.plan), price = await stripe.prices.retrieve(plan.priceId);
    if (price.livemode !== false || !price.active || price.type !== "one_time" || price.currency !== "cad" || price.unit_amount !== plan.amount) throw fail(503, "测试套餐配置不一致，请联系管理员。");
    await ensureCustomer();
    const fingerprint = JSON.stringify([plan.priceId, plan.amount, plan.days, base]);
    let order = (get().passOrders || []).find(open);
    if (order && (order.plan !== plan.id || order.fingerprint !== fingerprint)) throw fail(409, "请先完成或关闭待付款会员卡订单，再选择其他套餐。");
    if (order?.status === "processing") throw fail(409, "正在确认测试付款，请刷新订阅状态。");
    if (!order) {
      if ((get().passOrders || []).some((o) => o.requestId === values.requestId)) throw fail(409, "此会员卡订单已处理，请刷新状态后重试。");
      if ((get().passOrders || []).length >= 100) throw fail(409, "测试会员卡订单已达上限，请联系管理员。");
      order = { id: randomUUID(), requestId: values.requestId, plan: plan.id, days: plan.days, amount: plan.amount, priceId: plan.priceId, fingerprint,
        status: "creating", until: now() + 3600000, refundedAmount: 0 };
      await save({ passOrders: [...(get().passOrders || []), order] });
    }
    if (order.sessionId) {
      const session = await stripe.checkout.sessions.retrieve(order.sessionId);
      if (session.status === "open" && session.expires_at * 1000 > now()) return { url: stripeRedirect(session.url, "checkout.stripe.com") };
      throw fail(409, "正在确认测试付款，请刷新订阅状态。");
    }
    // A lost creation response remains recoverable by its original idempotency key or webhook.
    if (order.until <= now()) throw fail(409, "待付款订单需要核对，请联系管理员后重试。");
    const value = await stripe.checkout.sessions.create({ mode: "payment", customer: get().customerId, client_reference_id: user.id,
      line_items: [{ price: order.priceId, quantity: 1 }], payment_method_types: ["alipay", "wechat_pay"], payment_method_options: { wechat_pay: { client: "web" } },
      metadata: metadata(user.id, order.id), payment_intent_data: { metadata: metadata(user.id, order.id) }, expires_at: Math.floor(order.until / 1000),
      success_url: `${base}/app?billing=return`, cancel_url: `${base}/app?billing=cancelled` }, { idempotencyKey: `sb-test-pass-${order.id}` });
    if (!owned(value, get(), order) || value.mode !== "payment") throw invalid();
    const url = stripeRedirect(value.url, "checkout.stripe.com");
    await save({ passOrders: get().passOrders.map((o) => o.id === order.id ? { ...o, sessionId: value.id, status: "open" } : o) });
    return { url };
  }
  async function cancel(get, save) {
    await reconcile(get, save);
    const order = (get().passOrders || []).find(open);
    if (!order?.sessionId || order.status !== "open") throw fail(409, "当前会员卡订单无法关闭，请先刷新付款状态。");
    await stripe.checkout.sessions.expire(order.sessionId);
    return reconcile(get, save, { sessionId: order.sessionId });
  }
  return { checkout, reconcile, cancel };
}
module.exports = { passConfig, publicPasses, createPassService, passEnd };
