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

  const money = (value) => Number(value).toLocaleString(ui.locale(), { style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 6 });

  function dailyCosts(target) {
    const report = target.dailyReport, day = report?.through;
    const official = report?.aiCosts?.official;
    const available = official?.status === "available";
    const daily = available && Array.isArray(official.days) ? official.days : [];
    const today = daily.find((row) => row.day === day)?.amountUsd;
    const notes = ["OpenAI 官方消费", "UTC"];
    if (target.error) notes.push("无法刷新每日成本");
    else if (!report) notes.push("正在读取使用数据…");
    else if (official?.status === "not_configured") notes.push("尚未连接官方账单");
    else if (!available) notes.push("官方账单暂不可用");
    else if (!Number.isFinite(today)) notes.push("今日账单尚无数据");
    else notes.push("今日数据可能延迟");
    if (available && official.stale) notes.push("上次成功同步，当前同步暂缓");

    const dayLabel = (value) => date(value, { month: "short", day: "numeric", timeZone: "UTC" });
    const first = Date.parse(day) - 6 * 86400000;
    const recent = daily.filter((row) => row.day < day && Date.parse(row.day) >= first && Number.isFinite(row.amountUsd))
      .sort((a, b) => b.day.localeCompare(a.day));
    return `<div class="admin-daily-cost-headline">
      <strong>${Number.isFinite(today) ? esc(money(today)) : "—"}</strong>
      <small>${[...(day ? [esc(dayLabel(day))] : []), ...notes.map(label)].join(" · ")}</small>
    </div>${recent.length ? `<dl class="admin-daily-cost-days" aria-label="${label("近 7 天每日成本")}">${recent.map((row) =>
      `<div><dt><time datetime="${esc(row.day)}">${esc(dayLabel(row.day))}</time></dt><dd>${esc(money(row.amountUsd))}</dd></div>`).join("")}</dl>` : ""}`;
  }

  function costRow(data) {
    if (data.aiCosts) return ["已记录 AI 成本", money(data.aiCosts.calculatedUsd), ui.text("按返回用量计价，非官方账单")];
    return ["已记录 AI 成本", "—", ui.text("费用明细尚未接入，不使用旧估算")];
  }

  function costs(data) {
    const c = data.aiCosts;
    if (!c) return "";
    const sourceNames = { ...features, user: "用户请求", "academic-calendar": "共享校历", "product-help": "使用帮助", "health-check": "连通检测" };
    const blockedNames = { duplicate: "并发重复请求", "failure-cooldown": "连续失败暂缓", "platform-budget": "平台安全预算", "account-provider-budget": "账号实际成本预算" };
    const official = c.official;
    const status = official?.status === "available" ? money(official.amountUsd)
      : ui.text(official?.status === "not_configured" ? "尚未连接官方账单" : "官方账单暂不可用");
    const rows = [
      ["用户请求成本", money(c.userUsd)],
      ...(!data.user ? [["平台后台成本", money(c.platformUsd)], ["OpenAI 官方消费", status]] : []),
      ["待核对请求", number(c.unknownRequests)], ["进行中请求", number(c.pendingRequests)],
      ["失败调用成本", money(c.failedUsd || 0)],
    ];
    const list = c.sources.map((r) => `<li><span>${label(sourceNames[r.source] || "调用来源未标记")} · ${esc(r.model)}</span><small>${esc(money(r.calculatedUsd))} · ${esc(number(r.requests))} ${label("次请求")}${r.failedUsd ? ` · ${label("失败调用成本")} ${esc(money(r.failedUsd))}` : ""}${r.unknownRequests ? ` · ${label("待核对请求")} ${esc(number(r.unknownRequests))}` : ""}</small></li>`).join("");
    const officialItems = official?.status === "available" ? `<p class="admin-usage-note">${label("官方账单范围")}: ${esc(official.projectId)} · ${label(official.keyFiltered ? "已限定 API 密钥" : "项目全部密钥")} · ${label("读取时间")}: ${esc(date(official.fetchedAt))}</p>
      <ul class="admin-usage-list">${official.items.map((r) => `<li><span>${esc(r.label)}</span><small>${esc(money(r.amountUsd))}</small></li>`).join("")}</ul>` : "";
    return `<details class="admin-usage-days"><summary>${label("AI 费用明细与对账")}</summary>
      <p class="admin-usage-note">${label("完整费用记录开始于")}: ${esc(date(c.since))} · ${label("历史漏记不补算；当前日官方数据可能延迟。")}</p>
      ${metricRows(rows)}<p class="admin-usage-note">${label("待核对预留估算")}: ${esc(money(c.estimatedUsd))} · ${label("不计入已记录成本；平台未知费用可能没有估算。")}</p>
      ${official?.coverageLimited ? `<p class="admin-usage-note">${label("官方可获取历史起点")}: ${esc(date(official.from, {dateStyle:"medium",timeZone:"UTC"}))} · ${label("更早或缺失记录未计入官方总额；历史快照会持续保存。")}</p>` : ""}
      ${official?.stale ? `<p class="admin-usage-note" role="status">${label("官方同步暂缓，正在显示上次成功读取的数据。")}</p>` : ""}
      ${official?.retryAt ? `<p class="admin-usage-note">${label("下次可同步时间")}: ${esc(date(official.retryAt))}</p>` : ""}
      ${c.controls ? `<p class="admin-usage-note">${label("今日平台保护预算")}: ${esc(money(c.controls.spentUsd))} / ${esc(money(c.controls.budgetUsd))} · ${label("已阻止重复或异常请求")}: ${esc(number(Object.values(c.controls.blocked || {}).reduce((a,b)=>a+b,0)))} · ${label("暂缓的异常来源")}: ${esc(number(c.controls.coolingScopes))}</p>` : ""}
      ${c.controls ? `<ul class="admin-usage-list">${Object.entries(c.controls.blocked || {}).map(([reason,count])=>`<li><span>${label(blockedNames[reason] || reason)}</span><small>${esc(number(count))}</small></li>`).join("")}</ul>` : ""}
      ${c.storageFailures ? `<p role="status">${label("费用结算写入失败，部分请求需要核对。")}</p>` : ""}
      <ul class="admin-usage-list">${list}</ul>
      <p class="admin-usage-note">${label("功能分布为估算；历史未记录、工具计价和同步延迟产生的差异单独保留，不分摊到用户。")}</p>
      ${officialItems}
      ${!data.user ? `<p class="admin-usage-note">${label("充值、税费与余额尚未接入；消费金额不等于银行卡扣款。")}</p>` : ""}
      <p class="admin-usage-note">${label("个人额度与平台费用分开统计。官方消费与本地计价不可相加；充值、税费及其他程序调用须另行核对。")}</p>
    </details>`;
  }

  function costOverview(data) {
    const c = data.aiCosts, official = c.official, r = c.reconciliation;
    const available = official?.status === "available";
    const headline = metricRows([
      [available && official.coverageLimited ? "已同步的官方消费" : "总 AI 成本（官方消费）", available ? money(official.amountUsd) : "—", ui.text(available ? "官方总额包含下方各项，不再叠加" : "官方账单暂不可用；不以本地估算代替")],
      !available && Number.isFinite(c.calculatedUsd)
        ? costRow(data)
        : ["已归属功能成本", r?.status === "available" ? money(r.attributedUsd) : "—", ui.text("按调用用量计价，限同一官方覆盖范围")],
      ["历史未归属费用", r?.status === "available" ? money(r.historicalUsd) : "—", ui.text("完整账本启用日之前的官方消费")]
    ]);
    const details = r?.status === "available" ? metricRows([
      ["启用当天待核对差额", money(r.transitionDifferenceUsd), r.transitionDay],
      ["启用后待核对差额", money(r.currentDifferenceUsd), ui.text("同步延迟、计价差异或漏记，单独跟进")],
      ["调用来源未标记", money(r.unclassifiedUsd), ui.text("已记账但缺少功能标签，不能归入历史")]
    ]) + `<p class="admin-usage-note">${label("官方总额 = 已归属功能成本 + 历史未归属费用 + 启用当天待核对差额 + 启用后待核对差额 + 调用来源未标记。差额保留正负，不强行分摊。")}</p>
      ${r.outsideCoverageUsd ? `<p class="admin-usage-note">${label("官方覆盖范围外的本地记录")}: ${esc(money(r.outsideCoverageUsd))}</p>` : ""}
      <h3>${label("功能成本去向")}</h3><ul class="admin-usage-list">${r.features.map(f => `<li><span>${label(({...features,"academic-calendar":"共享校历","product-help":"使用帮助","health-check":"连通检测"})[f.source] || "调用来源未标记")} · ${esc(f.model)} · ${label(f.trigger === "background" ? "后台任务" : f.trigger === "interactive" ? "主动操作" : "早期未标记触发方式")}</span><small>${esc(money(f.amountUsd))} · ${number(f.requests)} ${label("次请求")}${f.unknownRequests ? ` · ${label("待核对请求")} ${number(f.unknownRequests)}` : ""}</small></li>`).join("")}</ul>
      <details class="admin-usage-days"><summary>${label("每日对账")}</summary><ul class="admin-usage-list">${r.daily.map(d => `<li><span>${esc(d.day)}</span><small>${label("官方消费")} ${esc(money(d.officialUsd))} · ${label("已归属")} ${esc(money(d.attributedUsd))} · ${label("未标记")} ${esc(money(d.unclassifiedUsd))} · ${label("差额")} ${esc(money(d.differenceUsd))}</small></li>`).join("")}</ul></details>`
      : `<p class="admin-usage-note">${label("等待官方每日明细；已记录调用保留在下方，不作为官方总额。")}</p>`;
    const missing = official?.coverageLimited && official.missingDays
      ? `<p class="admin-usage-note">${esc(ui.message`所选区间有 ${number(official.missingDays)} 天缺少官方数据，金额仅含已同步日期。`)}</p>` : "";
    return coverage(data) + (available ? `<p class="admin-usage-note">${label("官方覆盖范围")}: ${esc(official.from)} — ${esc(official.through)} UTC · ${label("读取时间")}: ${esc(date(official.fetchedAt))}${official.stale ? ` · ${label("上次成功同步，当前同步暂缓")}` : ""}</p>` : "") + missing + headline + details + costs(data);
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
      ["操作失败率", percent(data.failed, data.failed + data.completed), `${number(data.failed)} / ${number(data.failed + data.completed)}`]
    ]) + `<div class="admin-usage-columns"><div>${chart(data)}</div><div>${featureList(data)}</div></div>
      <p class="admin-usage-note">${label("活跃按前台交互或功能操作去重。回访仅统计目标日期已经结束的新用户。首次学习指收到课程回答或提交练习。费用统一查看上方总 AI 成本。")}</p>`;
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
    ]) + costs(data) + `<div class="admin-usage-columns"><div>${featureList(data)}
      ${modeList.length ? `<p class="admin-usage-note"><b>${label("学习模式")}</b> · ${esc(modeList.join(" · "))}</p>` : ""}</div><div>
      <h3>${label("首次学习进度")}</h3><ul class="admin-usage-list">${data.steps.map(({ key, at }) =>
        `<li><span>${label(steps[key] || key)}</span><small>${esc(at ? date(at) : ui.text("尚无完成记录"))}</small></li>`).join("")}</ul></div></div>
      <div class="admin-usage-errors"><h3>${label("近期失败记录")}</h3>${data.errors.length ?
        `<ul class="admin-usage-list">${data.errors.map((error) => `<li><span>${label(features[error.feature] || error.feature)} · ${esc(error.code)}<small>${esc(date(error.at))}</small></span>
          <code title="${label("错误编号")}" aria-label="${label("错误编号")}">${esc(error.id)}</code></li>`).join("")}</ul>` :
        `<p class="muted">${label("此时段暂无失败记录。")}</p>`}</div>`;
  }

  function controls(days, costsOnly = false) {
    return `<div class="admin-usage-controls" role="group" aria-label="${label("统计时段")}">
      ${(costsOnly ? [7, 30, 90, 180, 365, "all"] : [7, 30]).map((value) => `<button type="button" data-admin-usage-days="${value}" aria-pressed="${days === value}">${label(({ 7: "近 7 天", 30: "近 30 天", 90: "近 90 天", 180: "近 180 天", 365: "近 365 天", all: "全部" })[value])}</button>`).join("")}
      <button type="button" data-admin-usage-refresh>${label("刷新")}</button>
    </div>`;
  }

  const summaryId = (userId) => `admin-usage-summary-${userId}`;
  const toggleLabel = (expanded) => ui.text(expanded ? "收起使用摘要" : "展开使用摘要");

  function create({ api, getAdmin, root }) {
    let actor, panel, costPanel, detail, period = 7, costPeriod = 7;
    const view = (userId) => ({ days: period, userId, pending: false, request: 0 });
    function active() { return Boolean(actor && actor === getAdmin()); }

    function render(target) {
      const element = target.userId ? document.getElementById(summaryId(target.userId)) : root.querySelector(target.costsOnly ? "[data-admin-costs]" : "[data-admin-usage]");
      if (!element?.isConnected) return;
      if (target.costsOnly) element.querySelector("[data-admin-daily-cost]").innerHTML = dailyCosts(target);
      const control = element.querySelector("[data-admin-usage-controls]");
      const focused = document.activeElement?.closest(".admin-usage-controls");
      const focusSelector = focused && focused === control.firstElementChild
        ? document.activeElement.matches("[data-admin-usage-refresh]") ? "[data-admin-usage-refresh]" : `[data-admin-usage-days="${target.days}"]` : "";
      control.innerHTML = controls(target.days, target.costsOnly);
      if (focusSelector) control.querySelector(focusSelector)?.focus({ preventScroll: true });
      const content = element.querySelector("[data-admin-usage-content]");
      content.setAttribute("aria-busy", String(target.pending));
      content.innerHTML = target.pending ? `<p class="muted" role="status">${label("正在读取使用数据…")}</p>`
        : target.error ? `<p class="muted" role="status">${label("无法读取使用数据，请刷新重试。")}</p>`
          : target.data ? (target.costsOnly ? costOverview(target.data) : target.userId ? summary(target.data) : overview(target.data)) : "";
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
        const path = target.costsOnly ? "/api/admin/ai-costs" : target.userId ? `/api/admin/users/${encodeURIComponent(target.userId)}/usage` : "/api/admin/usage";
        const data = await api(`${path}?${target.costsOnly ? "period" : "days"}=${target.days}`, { signal: controller.signal });
        if (active() && request === target.request && (target === panel || target === costPanel || target === detail)) {
          target.data = data;
          if (target.costsOnly) target.dailyReport = data;
        }
      } catch {
        if (!controller.signal.aborted) target.error = true;
      } finally {
        if (active() && request === target.request && (target === panel || target === costPanel || target === detail)) {
          target.pending = false;
          render(target);
        }
      }
    }

    function onControl(event, target) {
      const button = event.target.closest("[data-admin-usage-days], [data-admin-usage-refresh]");
      if (!button || !active()) return;
      const selection = button.dataset.adminUsageDays;
      if (selection) {
        const days = selection === "all" ? "all" : Number(selection);
        if (days === target.days && !target.error) return;
        target.days = days;
        if (target.costsOnly) costPeriod = days;
        else if (!target.userId) period = days;
        target.data = null;
      }
      void load(target);
    }

    function setExpanded(userId, expanded) {
      const element = document.getElementById(summaryId(userId));
      if (!element || !root.contains(element)) return;
      element.hidden = !expanded;
      const button = element.parentElement.querySelector('[data-action="user-usage"]');
      button.setAttribute("aria-expanded", String(expanded));
      button.textContent = toggleLabel(expanded);
      return element;
    }

    function closeDetail() {
      if (!detail) return;
      const previous = detail;
      detail = null;
      previous.controller?.abort();
      const element = setExpanded(previous.userId, false);
      if (!element) return;
      element.onclick = null;
      element.querySelector("[data-admin-usage-controls]").replaceChildren();
      element.querySelector("[data-admin-usage-content]").replaceChildren();
    }

    function toggle(userId) {
      if (!active()) return;
      const wasOpen = detail?.userId === userId;
      closeDetail();
      if (wasOpen) return;
      const element = setExpanded(userId, true);
      if (!element) return;
      const target = view(userId);
      detail = target;
      element.onclick = (event) => onControl(event, target);
      void load(target);
    }

    function sync() {
      const current = getAdmin(), host = root.querySelector("[data-admin-usage]");
      if (actor !== current || !host) {
        panel?.controller?.abort();
        panel = null;
        costPanel?.controller?.abort(); costPanel = null;
        closeDetail();
        actor = current;
      }
      if (!current || !host) return;
      const costHost = root.querySelector("[data-admin-costs]");
      if (costHost) {
        costHost.onclick = (event) => onControl(event, costPanel);
        if (!costPanel) { costPanel = { ...view(), days: costPeriod, costsOnly: true }; void load(costPanel); }
        else render(costPanel);
      }
      host.onclick = (event) => onControl(event, panel);
      if (!panel) {
        panel = view();
        void load(panel);
      } else render(panel);
      if (detail) {
        const target = detail;
        const element = setExpanded(target.userId, true);
        if (element) {
          element.onclick = (event) => onControl(event, target);
          render(target);
        } else closeDetail();
      }
    }

    return {
      html: () => `<section class="admin-usage" data-admin-costs aria-label="${label("AI 成本")}">
        <div class="admin-daily-cost">
          <div class="admin-usage-heading"><h2>${label("今日 AI 成本")}</h2></div>
          <div data-admin-daily-cost role="status"></div>
        </div>
        <div class="admin-usage-heading"><h2>${label("总 AI 成本")}</h2><div data-admin-usage-controls></div></div>
        <div data-admin-usage-content></div>
      </section><section class="admin-usage" data-admin-usage aria-labelledby="adminUsageTitle">
        <div class="admin-usage-heading"><h2 id="adminUsageTitle">${label("使用概况")}</h2><div data-admin-usage-controls></div></div>
        <div data-admin-usage-content></div>
      </section>`,
      buttonHtml: (userId) => `<button type="button" class="admin-usage-toggle" data-action="user-usage" data-id="${esc(userId)}" aria-expanded="false" aria-controls="${esc(summaryId(userId))}">${esc(toggleLabel(false))}</button>`,
      summaryHtml: (userId) => `<div class="admin-usage-inline" id="${esc(summaryId(userId))}" hidden>
        <div data-admin-usage-controls></div><div data-admin-usage-content></div>
      </div>`,
      toggle, sync
    };
  }

  globalThis.StudyBridgeAdminUsage = { create };
})();
