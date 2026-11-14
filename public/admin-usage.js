(function () {
  "use strict";

  const ui = globalThis.StudyBridgeI18n;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
  const label = (source) => esc(ui.text(source));
  const number = (value) => Number(value).toLocaleString(ui.locale());
  const date = (value, options = { dateStyle: "medium", timeStyle: "short" }) =>
    value ? new Date(value).toLocaleString(ui.locale(), options) : ui.text("暂无记录");
  const percent = (numerator, denominator) => denominator
    ? (numerator / denominator).toLocaleString(ui.locale(), { style: "percent", maximumFractionDigits: 1 }) : "—";
  const features = { study: "学习", schedule: "日程", grades: "成绩规划", mailbox: "邮箱助手",
    office: "办公工具", community: "社区", classmates: "同学" };
  const steps = { course: "创建课程", material: "上传课程资料", question: "发送学习提问", firstStudy: "完成首次学习" };
  const metricRows = (rows) => '<dl class="admin-usage-metrics">' + rows.map(([name, value, note]) =>
    `<div><dt>${label(name)}</dt><dd>${esc(value)}${note ? `<small>${esc(note)}</small>` : ""}</dd></div>`).join("") + "</dl>";

  function featureList(data) {
    const list = data.features.length ? data.features.map(({ feature, users, actions }) =>
      `<li><span>${label(features[feature] || feature)}</span><small>${esc(data.user ? ui.message`${number(actions)} 次操作` : ui.message`${number(users)} 人 · ${number(actions)} 次操作`)}</small></li>`).join("") : "";
    return `<h3>${label("功能使用")}</h3>${list ? `<ul class="admin-usage-list">${list}</ul>` : `<p class="muted">${label("此时段暂无操作记录。")}</p>`}`;
  }

  function costRow(data) {
    const value = data.aiRequests
      ? data.costUsd.toLocaleString(ui.locale(), { style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 6 })
      : "—";
    return ["AI 估算成本", value, data.estimatedRequests
      ? ui.message`其中 ${number(data.estimatedRequests)} 次按预留用量估算` : ""];
  }

  function coverage(data) {
    const day = (value) => date(value, { dateStyle: "medium", timeZone: "UTC" });
    return `<p class="admin-usage-note">${esc(ui.message`统计区间：${day(data.from)} 至 ${day(data.through)}（UTC）。数据从 ${date(data.since)} 开始记录。`)}</p>`;
  }

  function chart(data) {
    const peak = Math.max(1, ...data.trend.map((point) => point.activeUsers));
    const shortDate = (day) => date(day, { month: "short", day: "numeric", timeZone: "UTC" });
    const bars = data.trend.map(({ day, activeUsers }) => `<div class="admin-usage-track" title="${esc(ui.message`${shortDate(day)} · ${number(activeUsers)} 人`)}"><span style="--bar-height:${activeUsers / peak * 100}%"></span></div>`).join("");
    const dates = data.trend.map(({ day, activeUsers }) => `<li><span>${esc(shortDate(day))}</span><small>${number(activeUsers)}</small></li>`).join("");
    const first = data.trend[0]?.day, last = data.trend.at(-1)?.day;
    return `<h3>${label("每日活跃人数")}</h3><div class="admin-usage-chart" aria-hidden="true">${bars}</div>
      <div class="admin-usage-chart-axis" aria-hidden="true"><span>${esc(first ? shortDate(first) : "")}</span><span>${first !== last ? esc(shortDate(last)) : ""}</span></div>
      <details class="admin-usage-days"><summary>${label("查看每日人数")}</summary><ul class="admin-usage-list">${dates}</ul></details>`;
  }

  function overview(data) {
    const rate = ({ reached, eligible }) => [percent(reached, eligible), eligible ? `${number(reached)} / ${number(eligible)}` : ui.text("样本不足")];
    return coverage(data) + metricRows([
      ["活跃用户", number(data.activeUsers)],
      ["首次学习完成率", ...rate(data.firstStudy)],
      ["次日回访率", ...rate(data.retention.day1)],
      ["第七日回访率", ...rate(data.retention.day7)],
      ["操作失败率", percent(data.failed, data.failed + data.completed), `${number(data.failed)} / ${number(data.failed + data.completed)}`],
      costRow(data)
    ]) + `<div class="admin-usage-columns"><div>${chart(data)}</div><div>${featureList(data)}</div></div>
      <p class="admin-usage-note">${label("活跃按前台交互或功能操作去重。回访仅统计目标日期已经结束的新用户。首次学习指收到课程回答或提交练习。AI 成本为估算。")}</p>`;
  }

  function summary(data) {
    const { user } = data;
    const modeList = Object.entries(data.modes).sort((a, b) => b[1] - a[1]).map(([key, count]) =>
      `${ui.text(key === "general" ? "自由问答" : globalThis.StudyBridgeStudyModes.getMode(key)?.label || key)} ${number(count)}`);
    return coverage(data) + metricRows([
      ["注册时间", date(user.createdAt)],
      ["账号类型", ui.text(user.membershipTier === "plus" ? "Plus 用户" : "普通用户")],
      ["最近活跃时间", date(user.lastSeenAt)],
      ["活跃天数", number(data.activeDays)],
      ["创建课程数", number(data.courses)],
      ["资料上传数", number(data.materials)],
      ["成功操作数", number(data.completed)],
      ["失败操作数", number(data.failed)],
      ["AI 请求数", number(data.aiRequests), ui.message`${number(data.usageReports)} 次返回用量`],
      ["输入 Token", number(data.inputTokens)],
      ["输出 Token", number(data.outputTokens)],
      costRow(data)
    ]) + `<div class="admin-usage-columns"><div>${featureList(data)}
      ${modeList.length ? `<p class="admin-usage-note"><b>${label("学习模式")}</b> · ${esc(modeList.join(" · "))}</p>` : ""}</div><div>
      <h3>${label("首次学习进度")}</h3><ul class="admin-usage-list">${data.steps.map(({ key, at }) =>
        `<li><span>${label(steps[key] || key)}</span><small>${esc(at ? date(at) : ui.text("尚无完成记录"))}</small></li>`).join("")}</ul></div></div>
      <div class="admin-usage-errors"><h3>${label("近期失败记录")}</h3>${data.errors.length ?
        `<ul class="admin-usage-list">${data.errors.map((error) => `<li><span>${label(features[error.feature] || error.feature)} · ${esc(error.code)}<small>${esc(date(error.at))}</small></span>
          <code title="${label("错误编号")}" aria-label="${label("错误编号")}">${esc(error.id)}</code></li>`).join("")}</ul>` :
        `<p class="muted">${label("此时段暂无失败记录。")}</p>`}</div>`;
  }

  function controls(days) {
    return `<div class="admin-usage-controls" role="group" aria-label="${label("统计时段")}">
      ${[7, 30].map((value) => `<button type="button" data-admin-usage-days="${value}" aria-pressed="${days === value}">${label(value === 7 ? "近 7 天" : "近 30 天")}</button>`).join("")}
      <button type="button" data-admin-usage-refresh>${label("刷新")}</button>
    </div>`;
  }

  function create({ api, getAdmin, root }) {
    let actor, panel, detail, period = 7;
    const view = (userId) => ({ days: period, userId, pending: false, request: 0 });
    function active() { return Boolean(actor && actor === getAdmin()); }

    function render(target) {
      const element = target.userId ? target.dialog : root.querySelector("[data-admin-usage]");
      if (!element?.isConnected) return;
      const control = element.querySelector("[data-admin-usage-controls]");
      const focused = document.activeElement?.closest(".admin-usage-controls");
      const focusSelector = focused && focused === control.firstElementChild
        ? document.activeElement.matches("[data-admin-usage-refresh]") ? "[data-admin-usage-refresh]" : `[data-admin-usage-days="${target.days}"]` : "";
      control.innerHTML = controls(target.days);
      if (focusSelector) control.querySelector(focusSelector)?.focus({ preventScroll: true });
      const content = element.querySelector("[data-admin-usage-content]");
      content.setAttribute("aria-busy", String(target.pending));
      content.innerHTML = target.pending ? `<p class="muted" role="status">${label("正在读取使用数据…")}</p>`
        : target.error ? `<p class="muted" role="status">${label("无法读取使用数据，请刷新重试。")}</p>`
          : target.data ? (target.userId ? summary(target.data) : overview(target.data)) : "";
      if (target.userId && target.data) {
        element.querySelector("#adminUsageAccount").textContent = target.data.user.name;
        element.querySelector("#adminUsageAccount").hidden = false;
      }
    }

    async function load(target) {
      target.controller?.abort();
      const controller = new AbortController();
      target.controller = controller;
      target.pending = true;
      target.error = false;
      const request = ++target.request;
      render(target);
      try {
        const path = target.userId ? `/api/admin/users/${encodeURIComponent(target.userId)}/usage` : "/api/admin/usage";
        const data = await api(`${path}?days=${target.days}`, { signal: controller.signal });
        if (active() && request === target.request && (target === panel || target === detail)) target.data = data;
      } catch {
        if (!controller.signal.aborted) target.error = true;
      } finally {
        if (active() && request === target.request && (target === panel || target === detail)) {
          target.pending = false;
          render(target);
        }
      }
    }

    function onControl(event, target) {
      const button = event.target.closest("[data-admin-usage-days], [data-admin-usage-refresh]");
      if (!button || !active()) return;
      if (button.dataset.usageDays) {
        const days = Number(button.dataset.usageDays);
        if (days === target.days && !target.error) return;
        target.days = days;
        if (!target.userId) period = days;
        target.data = null;
      }
      void load(target);
    }

    function closeDetail(restoreFocus = true) {
      if (!detail) return;
      const previous = detail;
      detail = null;
      previous.controller?.abort();
      previous.dialog.close();
      previous.dialog.remove();
      if (restoreFocus && active()) {
        Array.from(root.querySelectorAll('[data-action="user-usage"]')).find((button) => button.dataset.id === previous.userId)?.focus({ preventScroll: true });
      }
    }

    function open(userId) {
      if (!active()) return;
      closeDetail(false);
      const target = view(userId);
      detail = target;
      target.language = ui.getLanguage();
      const dialog = document.createElement("dialog");
      target.dialog = dialog;
      dialog.className = "admin-usage-dialog";
      dialog.setAttribute("aria-labelledby", "adminUsageUserTitle");
      dialog.innerHTML = `<header class="dialog-heading"><div><h2 id="adminUsageUserTitle">${label("使用摘要")}</h2><p id="adminUsageAccount" hidden></p></div>
        <button type="button" data-admin-usage-close aria-label="${label("关闭")}" autofocus>×</button></header>
        <div class="dialog-body"><div data-admin-usage-controls></div><div data-admin-usage-content></div></div>`;
      dialog.addEventListener("click", (event) => event.target.closest("[data-admin-usage-close]") ? closeDetail() : onControl(event, target));
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDetail(); });
      document.body.append(dialog);
      dialog.showModal();
      void load(target);
    }

    function sync() {
      const current = getAdmin(), host = root.querySelector("[data-admin-usage]");
      if (actor !== current || !host) {
        panel?.controller?.abort();
        panel = null;
        closeDetail(false);
        actor = current;
      }
      if (!current || !host) return;
      host.onclick = (event) => onControl(event, panel);
      if (!panel) {
        panel = view();
        void load(panel);
      } else render(panel);
      if (detail && detail.language !== ui.getLanguage()) {
        detail.language = ui.getLanguage();
        detail.dialog.querySelector("h2").textContent = ui.text("使用摘要");
        detail.dialog.querySelector("[data-admin-usage-close]").setAttribute("aria-label", ui.text("关闭"));
        render(detail);
      }
    }

    return {
      html: () => `<section class="admin-usage" data-admin-usage aria-labelledby="adminUsageTitle">
        <div class="admin-usage-heading"><h2 id="adminUsageTitle">${label("使用概况")}</h2><div data-admin-usage-controls></div></div>
        <div data-admin-usage-content></div>
      </section>`, open, sync
    };
  }

  globalThis.StudyBridgeAdminUsage = { create };
})();
