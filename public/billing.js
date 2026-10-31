(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./i18n"));
  else root.StudyBridgeBilling = factory(root.StudyBridgeI18n);
})(typeof globalThis === "object" ? globalThis : this, function (ui) {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const labels = { none: "尚未订阅", active: "测试订阅有效", trialing: "测试试用中", past_due: "测试付款失败，请更新付款方式", unpaid: "测试账单未付款", canceled: "测试订阅已结束", incomplete: "测试付款尚未完成", incomplete_expired: "测试付款已过期", paused: "测试订阅已暂停" };
  function redirectAllowed(value, action) {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname === (["checkout", "pass-checkout"].includes(action) ? "checkout.stripe.com" : "billing.stripe.com"); } catch { return false; }
  }
  function createController({ request, getUser, onChange = () => {}, redirect = () => {}, makeId = () => crypto.randomUUID() }) {
    const userId = String(getUser()?.id || "");
    let visible = false, disposed = false, generation = 0, data = null, busy = false, error = "", status = "";
    const active = () => !disposed && visible && userId && getUser()?.id === userId;
    const snapshot = () => ({ data, busy, error, status });
    const notify = () => { if (active()) onChange(snapshot()); };
    async function load() {
      if (!active() || busy) return;
      const token = ++generation; busy = true; error = ""; status = ui.text("正在读取订阅状态…"); notify();
      try {
        const result = await request("/api/billing");
        if (!active() || token !== generation) return;
        if (result.billing?.userId !== userId) throw new Error(ui.text("登录账号已变更，请重新打开设置。"));
        data = result.billing; status = "";
      } catch (cause) { if (active() && token === generation) { data = null; error = ui.text(cause.message || "读取失败，请重试。"); status = ""; } }
      finally { if (active() && token === generation) { busy = false; notify(); } }
    }
    async function act(action, consent = false, plan) {
      if (!active() || busy || !data?.configured || !["checkout", "pass-checkout", "pass-cancel", "portal", "refresh", "cancel", "resume"].includes(action)) return;
      if (action === "pass-checkout" && (!data.passes?.configured || !["month", "semester"].includes(plan))) return;
      if (action === "pass-checkout" && !consent) { error = ui.text("请先确认会员卡测试价格和手动续费说明。"); notify(); return; }
      if (action === "checkout" && !consent) { error = ui.text("请先确认测试订阅的价格和按月续订说明。"); notify(); return; }
      const token = ++generation; busy = true; error = ""; status = ui.text("正在处理测试订阅…"); notify();
      try {
        const result = await request(`/api/billing/${action}`, { method: "POST", headers: { "x-csrf-token": data.csrfToken },
          body: { userId, ...(["checkout", "pass-checkout"].includes(action) ? { consent: true, requestId: makeId(), ...(action === "pass-checkout" ? { plan } : {}) } : {}) } });
        if (!active() || token !== generation) return;
        if (result.url) {
          if (!["checkout", "pass-checkout", "portal"].includes(action) || !redirectAllowed(result.url, action)) throw new Error(ui.text("付款页面地址无效，请重试。"));
          redirect(result.url); status = "";
        } else {
          if (result.billing?.userId !== userId) throw new Error(ui.text("登录账号已变更，请重新打开设置。"));
          data = result.billing;
          status = ui.text(action === "cancel" ? "已取消测试续订，当前周期结束前仍可查看订阅。" : action === "resume" ? "已恢复测试续订。" : "订阅状态已更新。");
        }
      } catch (cause) { if (active() && token === generation) { error = ui.text(cause.message || "读取失败，请重试。"); status = ""; } }
      finally { if (active() && token === generation) { busy = false; notify(); } }
    }
    return { snapshot, load, act,
      async activate() { if (disposed || getUser()?.id !== userId) return; visible = true; await load(); },
      suspend() { visible = false; ++generation; busy = false; data = null; error = status = ""; },
      dispose() { disposed = true; visible = false; ++generation; data = null; } };
  }
  function mount({ container, request, getUser }) {
    const doc = container.ownerDocument;
    let consent = false, passConsent = false;
    const controller = createController({ request, getUser, onChange: render, redirect: (url) => doc.defaultView.location.assign(url) });
    function render({ data, busy, error, status }) {
      const plan = data?.plan || { name: "StudyBridge Plus", amount: 1999, currency: "cad" };
      const amount = new Intl.NumberFormat(ui.locale(), { style: "currency", currency: plan.currency.toUpperCase() }).format(plan.amount / 100);
      const sub = data?.subscription, renewal = ["active", "trialing", "past_due"].includes(sub?.status);
      const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString(ui.locale()) : "";
      const passes = data?.passes, pending = passes?.pending, passExpiry = passes?.expiresAt ? new Date(passes.expiresAt).toLocaleString(ui.locale()) : "";
      const passLabels = { none: "尚未购买测试会员卡", active: "测试会员卡有效", expired: "测试会员卡已到期" };
      const orderLabels = { creating: "正在建立测试订单", open: "测试订单待付款", processing: "测试付款确认中", failed: "测试会员卡付款失败，可重新购买", expired: "测试订单已关闭或过期", paid: "测试会员卡已付款", refunded: "测试会员卡已退款", partially_refunded: "测试会员卡已部分退款" };
      const wallet = `<div class="settings-block billing-wallet"><h4>${ui.text("微信／支付宝会员卡")}</h4><p class="settings-caption">${ui.text("一次性购买，到期手动续费，不会自动扣款。续费从剩余有效期结束后接续。")}</p><p class="billing-pass-state">${esc(ui.text(passLabels[passes?.status] || passLabels.none))}</p>${passExpiry ? `<p class="settings-caption">${ui.text("会员卡到期时间")}：${esc(passExpiry)}</p>` : ""}${passes?.latest ? `<p class="settings-caption">${ui.text("最近订单")}：${esc(ui.text(orderLabels[passes.latest.status] || "测试付款确认中"))}</p>` : ""}
      <div class="billing-pass-plans">${(passes?.plans || [{ id: "month", days: 30, amount: 1999 }, { id: "semester", days: 120, amount: 6999 }]).map((p) => `<div class="billing-pass-plan"><strong>${ui.text(p.id === "month" ? "月卡 · 30 天" : "学期卡 · 120 天")}</strong><p class="billing-pass-price">${esc(new Intl.NumberFormat(ui.locale(), { style: "currency", currency: "CAD" }).format(p.amount / 100))} CAD</p><button type="button" class="settings-primary" data-billing-action="pass-checkout" data-pass-plan="${esc(p.id)}" ${!passes?.configured || busy || pending && (pending.plan !== p.id || pending.status === "processing") ? "disabled" : ""}>${ui.text(pending?.plan === p.id ? "继续测试付款" : "微信／支付宝测试购买")}</button></div>`).join("")}</div>
      <label class="billing-consent"><input type="checkbox" data-pass-consent ${passConsent ? "checked" : ""} ${!passes?.configured || busy ? "disabled" : ""}><span>${ui.text("我确认所选会员卡的测试价格与天数，到期手动续费；此次不会真实扣款。")}</span></label>
      ${!passes?.configured ? `<p class="settings-caption">${ui.text("微信和支付宝测试付款尚未配置，请联系管理员。")}</p>` : ""}${pending ? `<p class="settings-caption">${esc(ui.text(orderLabels[pending.status]))}</p><div class="billing-actions"><button type="button" data-billing-action="pass-cancel" ${!pending.canCancel || busy ? "disabled" : ""}>${ui.text("关闭待付款会员卡订单")}</button></div>` : ""}<p class="settings-caption">${ui.text("会员卡价格仅供测试，付款确认后记录测试有效期，暂不改变账号功能权限。")}</p></div>`;
      container.innerHTML = `<div class="billing-actions billing-toolbar"><button type="button" data-billing-action="refresh" ${busy ? "disabled" : ""}>${ui.text("刷新订阅状态")}</button></div><p class="settings-caption billing-status${error ? " is-error" : ""}" role="status" aria-live="polite">${esc(error || status)}</p>${wallet}<div class="settings-block billing-plan"><p class="billing-test-label">${ui.text("测试付款 · 不会真实扣款")}</p><h4>${esc(plan.name)} · ${ui.text("银行卡按月自动续订")}</h4><p class="billing-price">${esc(amount)} <span>CAD / ${ui.text("月")}</span></p><p class="settings-caption">${esc(ui.text(data?.message || "正在读取订阅状态…"))}</p><p class="settings-caption">${ui.text("月费为测试价格；测试订阅与邀请码、现有 Plus 分类分开保存，暂不改变功能权限。")}</p></div>
      <div class="settings-block"><h4>${ui.text("我的测试订阅")}</h4><p class="billing-subscription-state">${esc(ui.text(labels[sub?.status] || "正在读取订阅状态…"))}</p>${end ? `<p class="settings-caption">${ui.text(sub.cancelAtPeriodEnd ? "本期结束日期" : "下次续订日期")}：${esc(end)}</p>` : ""}${sub?.status === "active" ? `<p class="settings-caption">${ui.text(sub.paid ? "测试账单已付款。" : "测试账单付款仍待确认。")}</p>` : ""}
      <label class="billing-consent" ${!data?.canCheckout ? "hidden" : ""}><input type="checkbox" data-billing-consent ${consent ? "checked" : ""} ${busy ? "disabled" : ""}><span>${ui.text("我确认以上测试价格，按月自动续订，可在下次续订前取消；此次不会真实扣款。")}</span></label>
      <div class="billing-actions"><button type="button" class="settings-primary" data-billing-action="checkout" ${!data?.canCheckout || busy ? "disabled" : ""}>${ui.text("开通测试订阅")}</button><button type="button" data-billing-action="portal" ${!data?.configured || !data?.hasCustomer || busy ? "disabled" : ""}>${ui.text("管理测试账单与付款方式")}</button>${renewal ? `<button type="button" data-billing-action="${sub.cancelAtPeriodEnd ? "resume" : "cancel"}" ${busy ? "disabled" : ""}>${ui.text(sub.cancelAtPeriodEnd ? "恢复测试续订" : "到期取消测试订阅")}</button>` : ""}</div></div>`;
    }
    container.addEventListener("change", (event) => { if (event.target.matches("[data-billing-consent]")) consent = event.target.checked; if (event.target.matches("[data-pass-consent]")) passConsent = event.target.checked; });
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-billing-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.billingAction;
      if (action === "cancel" && !doc.defaultView.confirm(ui.text("确认在本期结束时取消测试订阅？此次不会扣款，也不会产生退款。"))) return;
      if (action === "refresh" && !controller.snapshot().data?.configured) return void controller.load();
      void controller.act(action, action === "pass-checkout" ? passConsent : consent, button.dataset.passPlan);
    });
    const unbind = ui.subscribe(() => render(controller.snapshot()));
    render(controller.snapshot());
    return { activate: async () => { await controller.activate(); if (controller.snapshot().data?.configured) await controller.act("refresh"); },
      suspend: () => { consent = passConsent = false; controller.suspend(); }, dispose: () => { controller.dispose(); unbind(); } };
  }
  return { createController, mount, redirectAllowed };
});
