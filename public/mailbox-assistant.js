(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeMailbox = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const providerName = (provider) => provider === "gmail" ? "Gmail" : "Outlook";
  function create({ api, getUser, onChange, notice }) {
    let userId = "", data = null, error = "", generation = 0, busy = false, banner = "", view = "learning";
    const edits = new Map();
    function account() {
      const id = getUser()?.id || "";
      if (id !== userId) { userId = id; data = null; error = ""; banner = ""; view = "learning"; edits.clear(); ++generation; busy = false; }
      return id;
    }
    async function load({ before = "", isCurrent = () => true } = {}) {
      const id = account(), request = ++generation;
      try {
        const next = await api(`/api/mailbox${before ? `?before=${encodeURIComponent(before)}` : ""}`);
        if (id !== getUser()?.id || request !== generation || !isCurrent()) return;
        data = before ? { ...next, drafts: [...(data?.drafts || []), ...next.drafts.filter((draft) => !data?.drafts.some((row) => row.id === draft.id))] } : next;
        error = "";
      } catch (failure) { if (id === getUser()?.id && request === generation && isCurrent()) error = failure.message; }
    }
    function draftEdit(draft) {
      if (!edits.has(draft.id)) edits.set(draft.id, draft.items.map((item) => ({ ...item, selected: true })));
      return edits.get(draft.id);
    }
    function field(item, key, label, type = "text", required = false) {
      return `<label>${label}<input data-mailbox-field="${key}" type="${type}" value="${esc(item[key])}" ${required ? "required" : ""} ${key === "title" ? 'maxlength="160"' : ""}></label>`;
    }
    function card(draft) {
      const status = { pending: "待确认", confirmed: "已添加到日程", dismissed: draft.items.length ? "已忽略" : "已阅" }[draft.status] || "待确认";
      const items = draftEdit(draft);
      return `<article class="card mailbox-message" data-mailbox-draft="${esc(draft.id)}"><div class="section-title"><span class="mailbox-provider">${providerName(draft.provider)}</span><span class="mailbox-badge">${status}</span></div>
        <h3>${esc(draft.subject || "无主题")}</h3><p class="mailbox-source">${esc(draft.sender)} · ${esc(new Date(draft.receivedAt).toLocaleString())}</p><p class="mailbox-summary">${esc(draft.summary)}</p>
        ${draft.link ? `<a class="mailbox-source-link" href="${esc(draft.link)}" target="_blank" rel="noopener noreferrer">查看原邮件 ↗</a>` : ""}
        ${draft.status === "pending" ? `<form class="mailbox-review" data-mailbox-form="${esc(draft.id)}"><p class="mailbox-review-help">${items.length ? "核对勾选事项的日期、时间和时区；确认后才会添加到日程。" : "这封邮件有学习相关通知，没有可直接添加的日程。阅读后可在此标记已阅。"}</p>
        ${items.map((item, index) => `<fieldset data-mailbox-index="${index}"><legend><label class="mailbox-check"><input type="checkbox" data-mailbox-field="selected" ${item.selected ? "checked" : ""}>事项 ${index + 1}</label></legend>
          ${item.warning ? `<p class="mailbox-warning">${esc(item.warning)}</p>` : ""}<div class="mailbox-fields">
          ${field(item, "title", "标题", "text", true)}<label>类型<select data-mailbox-field="kind">${[["DDL", "作业 / 考试"], ["EVENT", "活动 / 会议"], ["LEC", "Lecture"], ["TUT", "Tutorial"]].map(([value, label]) => `<option value="${value}" ${item.kind === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          ${field(item, "date", "日期", "date", true)}${field(item, "time", "时间", "time", true)}${field(item, "endsAt", "结束时间（可选）", "datetime-local")}${field(item, "timeZone", "时区", "text", true)}${field(item, "course", "课程（可选）")}${field(item, "location", "地点（可选）")}</div>
          ${item.evidence ? `<blockquote class="mailbox-evidence">${esc(item.evidence)}</blockquote>` : ""}</fieldset>`).join("")}
          <p class="mailbox-card-error" role="alert"></p><div class="mailbox-actions">${items.length ? `<button class="primary" type="button" data-action="mailbox-confirm" data-id="${esc(draft.id)}" ${busy ? "disabled" : ""}>确认添加到日程</button>` : ""}<button type="button" data-action="mailbox-dismiss" data-id="${esc(draft.id)}" ${busy ? "disabled" : ""}>${items.length ? "忽略这封邮件" : "标记已阅"}</button></div></form>` : ""}</article>`;
    }
    function html(replyHtml = "") {
      account();
      const connections = data?.connections || [], connected = connections.filter((row) => row.connected), pending = (data?.drafts || []).filter((row) => row.status === "pending");
      const accounts = connections.length ? connections : ["gmail", "outlook"].map((provider) => ({ provider }));
      return `<section class="mailbox-assistant" aria-label="邮箱助手工作区">
        <button type="button" class="mailbox-account-strip" data-action="mailbox-settings" aria-label="邮箱绑定状态，前往邮箱授权设置" aria-describedby="mailbox-account-summary" title="在设置中管理邮箱授权"><span class="mailbox-account-label">邮箱状态</span><span class="mailbox-accounts" id="mailbox-account-summary" role="list">${accounts.map((row) => `<span class="mailbox-account" role="listitem" data-mailbox-provider="${row.provider}"><span class="mailbox-account-icon" aria-hidden="true">${row.provider === "gmail" ? "G" : "O"}</span><strong>${providerName(row.provider)}</strong><span class="mailbox-account-value" title="${esc(row.connected ? row.email : "")}">${esc(row.connected ? row.email : !data ? "读取中…" : "未绑定")}</span>${row.connected ? `<span class="mailbox-account-state${row.reconnectRequired ? " needs-attention" : ""}">${row.reconnectRequired ? "需重新授权" : "已绑定"}</span>` : ""}</span>`).join("")}</span><span class="mailbox-account-open" aria-hidden="true">›</span></button>
        ${banner ? `<p class="mailbox-feedback" role="status">${esc(banner)}</p>` : ""}${error ? `<p class="mailbox-warning" role="alert">${esc(error)}</p>` : ""}
        <nav class="mailbox-sections" aria-label="邮箱助手功能"><button type="button" id="mailbox-learning-button" data-action="mailbox-view" data-view="learning" aria-pressed="${view === "learning"}" aria-controls="mailbox-learning-panel">学习通知${pending.length ? `<span class="mailbox-count">${pending.length}</span>` : ""}</button><button type="button" id="mailbox-reply-button" data-action="mailbox-view" data-view="reply" aria-pressed="${view === "reply"}" aria-controls="mailbox-reply-panel">邮件解读与回复</button></nav>
        <section id="mailbox-learning-panel" aria-labelledby="mailbox-learning-button" ${view !== "learning" ? "hidden" : ""}>
          <header class="mailbox-learning-heading"><div><h2>学习通知</h2><p>${pending.length ? `${pending.length} 封邮件待确认，核对后可加入日程。` : "从学习邮件中整理需要关注的安排。"}</p></div><div class="mailbox-actions">${connected.length ? `<button type="button" data-action="mailbox-sync" ${busy || connected.every((row) => row.syncing || row.reconnectRequired) ? "disabled" : ""}>${connected.some((row) => row.syncing) ? "正在同步…" : "同步邮件"}</button>` : ""}<button type="button" data-action="mailbox-refresh" ${busy ? "disabled" : ""}>刷新通知</button></div></header>
          ${connections.filter((row) => row.connected && row.error).map((row) => `<p class="mailbox-warning" role="status">${providerName(row.provider)}：${esc(row.error)}</p>`).join("")}
          <div class="mailbox-messages">${(data?.drafts || []).map(card).join("")}${data && !data.drafts.length ? `<article class="card mailbox-empty"><span class="mailbox-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span><h3>${connected.length ? "暂无学习通知" : "还没有学习通知"}</h3><p>${connected.length ? "识别到教授通知或重要安排后，会显示在这里供你确认。" : "在设置中绑定邮箱后，学习相关通知会显示在这里。"}</p></article>` : ""}</div>
          ${!data && !error ? '<p class="muted" role="status">正在读取学习通知…</p>' : ""}${data?.nextBefore ? '<button type="button" data-action="mailbox-more">读取更早邮件</button>' : ""}</section>
        <section id="mailbox-reply-panel" class="mailbox-reply" aria-labelledby="mailbox-reply-button" ${view !== "reply" ? "hidden" : ""}>${replyHtml}</section></section>`;
    }
    function input(event) {
      const el = event.target, key = el.dataset?.mailboxField;
      const id = el.closest?.("[data-mailbox-draft]")?.dataset.mailboxDraft;
      const index = Number(el.closest?.("[data-mailbox-index]")?.dataset.mailboxIndex);
      if (!key || !id || !edits.has(id) || !edits.get(id)[index]) return;
      edits.get(id)[index][key] = key === "selected" ? el.checked : el.value;
      el.closest(".mailbox-review")?.querySelector(".mailbox-card-error")?.replaceChildren();
    }
    async function action(button) {
      account();
      const action = button.dataset.action, id = userId, draft = data?.drafts.find((row) => row.id === button.dataset.id);
      if (action === "mailbox-view") {
        if (!["reply", "learning"].includes(button.dataset.view)) return;
        view = button.dataset.view; onChange(); return;
      }
      if (busy) return;
      busy = true;
      button.disabled = true;
      const current = () => id === getUser()?.id;
      try {
        if (action === "mailbox-refresh" || action === "mailbox-more") await load({ before: action === "mailbox-more" ? data?.nextBefore : "" });
        else if (action === "mailbox-sync") {
          const targets = data.connections.filter((row) => row.connected && !row.reconnectRequired && !row.syncing);
          const results = await Promise.allSettled(targets.map((row) => api(`/api/mailbox/${row.provider}/sync`, { method: "POST", headers: { "x-csrf-token": data.csrfToken }, body: { userId: id } })));
          if (!current()) return;
          if (!targets.length) throw new Error("邮箱正在同步，或需要在设置中重新授权。");
          const failures = results.filter((row) => row.status === "rejected");
          if (failures.length === results.length) throw failures[0].reason;
          banner = failures.length ? "部分邮箱已开始同步，其余邮箱请稍后重试。" : "已开始同步邮箱，学习通知会自动更新。";
          await load();
        } else if (draft) {
          const items = draftEdit(draft).flatMap((item, index) => item.selected ? [{ index, title: item.title, kind: item.kind, course: item.course, startsAt: item.date && item.time ? `${item.date}T${item.time}` : "", endsAt: item.endsAt,
            timeZone: item.timeZone, location: item.location, notes: item.notes }] : []);
          if (action === "mailbox-confirm") {
            if (!items.length) throw new Error("请至少选择一个事项。");
            const form = button.closest("form");
            for (const fieldset of form.querySelectorAll("fieldset")) if (fieldset.querySelector('[data-mailbox-field="selected"]').checked) {
              for (const input of fieldset.querySelectorAll("input, select")) if (!input.reportValidity()) return;
            }
          }
          const result = await api(`/api/mailbox/drafts/${encodeURIComponent(draft.id)}/resolve`, { method: "POST", headers: { "x-csrf-token": data.csrfToken },
            body: { userId: id, generation: draft.generation, action: action === "mailbox-confirm" ? "confirm" : "dismiss", ...(action === "mailbox-confirm" ? { items } : {}) } });
          if (!current()) return;
          data.drafts = data.drafts.map((row) => row.id === draft.id ? result.draft : row);
          edits.delete(draft.id);
          banner = action === "mailbox-confirm" ? `已添加 ${result.saved} 项到日程${result.duplicates ? `，跳过 ${result.duplicates} 项重复安排` : ""}。` : "已处理这封邮件。";
          notice(banner);
        }
      } catch (failure) {
        if (!current()) return;
        const local = button.closest("form")?.querySelector(".mailbox-card-error");
        if (local) { local.textContent = failure.message; return; }
        error = failure.message;
      } finally { if (current()) { busy = false; button.disabled = false; } }
      if (current()) onChange();
    }
    return { html, load, input, action, setBanner(value, { showInbox = false } = {}) { account(); banner = value; if (showInbox) view = "learning"; }, reset() { userId = ""; data = null; edits.clear(); ++generation; },
      disconnected(provider) {
        account(); ++generation;
        for (const draft of data?.drafts || []) if (draft.provider === provider) edits.delete(draft.id);
        if (data) data = { ...data, drafts: data.drafts.filter((draft) => draft.provider !== provider), connections: data.connections.map((row) => row.provider === provider ? { ...row, connected: false, email: "", error: "", reconnectRequired: false, syncing: false } : row) };
        banner = "邮箱已解除绑定，提取记录已清除。已确认的日程保留。";
        onChange();
      },
      async poll() {
        account(); if (busy || (data?.drafts.length || 0) > 20 || !data?.connections.some((row) => row.connected)) return;
        const previous = JSON.stringify(data); await load(); if (JSON.stringify(data) !== previous) onChange();
      } };
  }
  return { create, providerName };
});
