(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./i18n"));
  else root.StudyBridgeBilling = factory(root.StudyBridgeI18n);
})(typeof globalThis === "object" ? globalThis : this, function (ui) {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const labels = { none: "尚未订阅", active: "测试订阅有效", trialing: "测试试用中", past_due: "测试付款失败，请更新付款方式", unpaid: "测试账单未付款", canceled: "测试订阅已结束", incomplete: "测试付款尚未完成", incomplete_expired: "测试付款已过期", paused: "测试订阅已暂停" };
  function redirectAllowed(value, action) {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname === (action === "checkout" ? "checkout.stripe.com" : "billing.stripe.com"); } catch { return false; }
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
    async function act(action, consent = false) {
      if (!active() || busy || !data?.configured || !["checkout", "portal", "refresh", "cancel", "resume"].includes(action)) return;
      if (action === "checkout" && !consent) { error = ui.text("请先确认测试订阅的价格和按月续订说明。"); notify(); return; }
      const token = ++generation; busy = true; error = ""; status = ui.text("正在处理测试订阅…"); notify();
      try {
        const result = await request(`/api/billing/${action}`, { method: "POST", headers: { "x-csrf-token": data.csrfToken },
          body: { userId, ...(action === "checkout" ? { consent: true, requestId: makeId() } : {}) } });
        if (!active() || token !== generation) return;
        if (result.url) {
          if (!["checkout", "portal"].includes(action) || !redirectAllowed(result.url, action)) throw new Error(ui.text("付款页面地址无效，请重试。"));
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
    let consent = false;
    const controller = createController({ request, getUser, onChange: render, redirect: (url) => doc.defaultView.location.assign(url) });
    function render({ data, busy, error, status }) {
      const plan = data?.plan || { name: "StudyBridge Plus", amount: 1999, currency: "cad" };
      const amount = new Intl.NumberFormat(ui.locale(), { style: "currency", currency: plan.currency.toUpperCase() }).format(plan.amount / 100);
      const sub = data?.subscription, renewal = ["active", "trialing", "past_due"].includes(sub?.status);
      const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString(ui.locale()) : "";
      container.innerHTML = `<div class="settings-block billing-plan"><p class="billing-test-label">${ui.text("测试付款 · 不会真实扣款")}</p><h4>${esc(plan.name)}</h4><p class="billing-price">${esc(amount)} <span>CAD / ${ui.text("月")}</span></p><p class="settings-caption">${esc(ui.text(data?.message || "正在读取订阅状态…"))}</p><p class="settings-caption">${ui.text("月费为测试价格；测试订阅与邀请码、现有 Plus 分类分开保存，暂不改变功能权限。")}</p></div>
      <div class="settings-block"><h4>${ui.text("我的测试订阅")}</h4><p class="billing-subscription-state">${esc(ui.text(labels[sub?.status] || "正在读取订阅状态…"))}</p>${end ? `<p class="settings-caption">${ui.text(sub.cancelAtPeriodEnd ? "本期结束日期" : "下次续订日期")}：${esc(end)}</p>` : ""}${sub?.status === "active" ? `<p class="settings-caption">${ui.text(sub.paid ? "测试账单已付款。" : "测试账单付款仍待确认。")}</p>` : ""}
      <label class="billing-consent" ${!data?.canCheckout ? "hidden" : ""}><input type="checkbox" data-billing-consent ${consent ? "checked" : ""} ${busy ? "disabled" : ""}><span>${ui.text("我确认以上测试价格，按月自动续订，可在下次续订前取消；此次不会真实扣款。")}</span></label>
      <div class="billing-actions"><button type="button" class="settings-primary" data-billing-action="checkout" ${!data?.canCheckout || busy ? "disabled" : ""}>${ui.text("开通测试订阅")}</button><button type="button" data-billing-action="portal" ${!data?.configured || !data?.hasCustomer || busy ? "disabled" : ""}>${ui.text("管理测试账单与付款方式")}</button>${renewal ? `<button type="button" data-billing-action="${sub.cancelAtPeriodEnd ? "resume" : "cancel"}" ${busy ? "disabled" : ""}>${ui.text(sub.cancelAtPeriodEnd ? "恢复测试续订" : "到期取消测试订阅")}</button>` : ""}<button type="button" data-billing-action="refresh" ${busy ? "disabled" : ""}>${ui.text("刷新订阅状态")}</button></div><p class="settings-caption billing-status${error ? " is-error" : ""}" role="status" aria-live="polite">${esc(error || status)}</p></div>`;
    }
    container.addEventListener("change", (event) => { if (event.target.matches("[data-billing-consent]")) consent = event.target.checked; });
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-billing-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.billingAction;
      if (action === "cancel" && !doc.defaultView.confirm(ui.text("确认在本期结束时取消测试订阅？此次不会扣款，也不会产生退款。"))) return;
      if (action === "refresh" && !controller.snapshot().data?.configured) return void controller.load();
      void controller.act(action, consent);
    });
    const unbind = ui.subscribe(() => render(controller.snapshot()));
    render(controller.snapshot());
    return { activate: async () => { await controller.activate(); if (controller.snapshot().data?.configured) await controller.act("refresh"); },
      suspend: () => { consent = false; controller.suspend(); }, dispose: () => { controller.dispose(); unbind(); } };
  }
  return { createController, mount, redirectAllowed };
});
