(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeAiUsage = factory();
})(globalThis, function () {
  "use strict";
  const ui = typeof module === "object" && module.exports ? require("./i18n") : globalThis.StudyBridgeI18n;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const refreshLabels = { idle: "刷新额度", loading: "刷新中…", success: "已刷新", error: "重试刷新" };
  const refreshIcon = "M13 6A5 5 0 1 0 13 10M13 2v4H9";
  function refreshButton() {
    return `<button type="button" class="ai-usage-refresh" data-usage-refresh>
      <svg aria-hidden="true" viewBox="0 0 16 16"><path d="${refreshIcon}"/></svg>
      <span class="ai-usage-refresh-label">${Object.values(refreshLabels).map((label) => `<span class="ai-usage-refresh-size" aria-hidden="true">${ui.text(label)}</span>`).join("")}<span data-usage-refresh-label>${ui.text(refreshLabels.idle)}</span></span>
    </button><span class="ai-usage-refresh-status" data-usage-refresh-status role="status" aria-live="polite" aria-atomic="true"></span>`;
  }
  function markup(data, error = "") {
    if (!data) return `<p role="status">${esc(error || ui.text("正在读取 AI 额度…"))}</p>${refreshButton()}`;
    const percent = Math.floor(data.remainingUsd / data.limitUsd * 100);
    const reset = data.resetsAt ? `${ui.text("恢复时间")} · ${new Date(data.resetsAt).toLocaleString(ui.locale())}` : ui.text("首次使用 AI 后，每 7 天恢复额度。");
    return `<div class="ai-usage-title"><strong>${ui.text("本周 AI 额度")} · ${ui.text(data.tier === "plus" ? "Plus 用户" : "普通用户")}</strong><span>${ui.text("剩余")} ${percent}%</span></div>
      <progress max="100" value="${percent}" aria-label="${ui.text("剩余 AI 额度")}"></progress>
      <p>${esc(reset)}</p>
      ${data.pendingUsd ? `<p>${ui.text("正在生成的任务已暂留部分额度，完成后按实际用量结算。")}</p>` : ""}
      ${data.estimatedUsd ? `<p>${ui.text("部分中断请求缺少实际用量，暂按预估扣减，可联系管理员核对。")}</p>` : ""}
      ${data.remainingUsd <= 0 ? `<p role="status">${ui.text("本周 AI 额度已用完，将在恢复时间自动补充。")}</p>` : ""}
      <div class="ai-usage-actions">${refreshButton()}${data.canUpgrade ? `<button type="button" data-usage-upgrade>${ui.text("升级 Plus")}</button>` : data.tier === "standard" ? `<span>${ui.text("充值开放后可升级 Plus，获得 4 倍每周额度。")}</span>` : ""}</div>
      ${error ? `<p role="status">${esc(error)}</p>` : ""}`;
  }
  function create({ request, getUser, openBilling, doc = document }) {
    let userId = null, data = null, error = "", generation = 0, pending = null, updated = 0, expanded = false;
    let feedback = "idle", feedbackGeneration = 0, feedbackTimer;
    const rendered = new WeakMap();
    function resetFeedback() { feedbackGeneration++; clearTimeout(feedbackTimer); feedback = "idle"; }
    function paintRefresh() {
      for (const button of doc.querySelectorAll("[data-usage-refresh]")) {
        button.dataset.refreshState = feedback;
        button.setAttribute("aria-busy", String(feedback === "loading"));
        button.setAttribute("aria-disabled", String(feedback === "loading"));
        button.querySelector("[data-usage-refresh-label]").textContent = ui.text(refreshLabels[feedback]);
        button.querySelector("svg path").setAttribute("d", feedback === "success" ? "m3 8 3 3 7-7" : refreshIcon);
      }
      const status = feedback === "idle" ? "" : ui.text(feedback === "error" ? "刷新失败，请重试。" : refreshLabels[feedback]);
      for (const element of doc.querySelectorAll("[data-usage-refresh-status]")) {
        if (element.textContent !== status) element.textContent = status;
      }
    }
    function disclosureHtml() {
      return `<details class="ai-usage-disclosure" data-usage-disclosure${expanded ? " open" : ""}>
        <summary><span>${ui.text("AI 额度")}</span><span data-usage-summary></span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></summary>
        <div data-ai-usage></div>
      </details>`;
    }
    function render() {
      for (const disclosure of doc.querySelectorAll("[data-usage-disclosure]")) {
        disclosure.open = expanded;
        disclosure.querySelector("[data-usage-summary]").textContent = data
          ? `${ui.text("剩余")} ${Math.floor(data.remainingUsd / data.limitUsd * 100)}%` : "—";
      }
      for (const element of doc.querySelectorAll("[data-ai-usage]")) {
        const html = markup(data, error);
        if (rendered.get(element) === html) continue;
        const focusedAction = element.contains(doc.activeElement)
          ? ["data-usage-refresh", "data-usage-upgrade"].find((name) => doc.activeElement.hasAttribute(name)) : null;
        element.innerHTML = html;
        rendered.set(element, html);
        if (focusedAction) element.querySelector(`[${focusedAction}]`)?.focus({ preventScroll: true });
      }
      paintRefresh();
    }
    async function refresh(force = false) {
      const current = getUser()?.id || null;
      if (current !== userId) { userId = current; data = null; error = ""; pending = null; updated = 0; expanded = false; resetFeedback(); generation++; render(); }
      if (!userId) return false;
      if (pending) return pending;
      if (!force && Date.now() - updated < 15000) return true;
      const token = ++generation, expectedUser = userId;
      pending = Promise.resolve().then(async () => {
        try {
          const result = await request("/api/me/ai-usage");
          if (token !== generation || getUser()?.id !== expectedUser) return false;
          if (result.usage?.userId !== expectedUser) throw new Error(ui.text("登录账号已变更，请重新打开设置。"));
          data = result.usage; error = ""; updated = Date.now();
          return true;
        } catch (cause) {
          if (token === generation && getUser()?.id === expectedUser) error = ui.text(cause.message);
          return false;
        } finally { if (token === generation) { pending = null; if (getUser()?.id === expectedUser) render(); } }
      });
      return pending;
    }
    async function manualRefresh() {
      const expectedUser = getUser()?.id;
      if (!expectedUser || feedback === "loading") return;
      const work = refresh(true), started = Date.now(), token = ++feedbackGeneration;
      clearTimeout(feedbackTimer); feedback = "loading"; paintRefresh();
      const success = await work;
      // Keep fast local/cached responses perceptible without delaying the balance update.
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 650 - (Date.now() - started))));
      if (token !== feedbackGeneration || getUser()?.id !== expectedUser) return;
      feedback = success ? "success" : "error"; paintRefresh();
      feedbackTimer = setTimeout(() => { feedback = "idle"; paintRefresh(); }, 2000);
    }
    doc.addEventListener("toggle", (event) => {
      const disclosure = event.target;
      if (!disclosure.matches?.("[data-usage-disclosure]") || !disclosure.isConnected) return;
      expanded = disclosure.open;
      if (expanded) void refresh();
    }, true);
    doc.addEventListener("keydown", (event) => {
      const disclosure = event.target.closest?.("[data-usage-disclosure]");
      if (event.key !== "Escape" || !disclosure?.open) return;
      expanded = false; disclosure.open = false;
      disclosure.querySelector("summary").focus({ preventScroll: true });
      event.preventDefault();
    });
    doc.addEventListener("click", (event) => {
      if (event.target.closest("[data-usage-refresh]")) void manualRefresh();
      if (event.target.closest("[data-usage-upgrade]") && data?.canUpgrade && getUser()?.id === userId) { expanded = false; render(); openBilling(); }
      if (event.target.closest('[data-settings-section="usage"]')) { render(); void refresh(true); }
    });
    const timer = setInterval(() => { if (!doc.hidden) void refresh(); }, 15000);
    doc.addEventListener("visibilitychange", () => { if (!doc.hidden) void refresh(true); });
    ui.subscribe(render);
    return { disclosureHtml, sync() { void refresh(); render(); }, refresh, stop() { clearInterval(timer); resetFeedback(); generation++; pending = null; data = null; expanded = false; } };
  }
  return { create, markup };
});
