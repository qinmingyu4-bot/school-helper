(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeMailbox = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const providerName = (provider) => provider === "gmail" ? "Gmail" : "Outlook";
  function create({ api, getUser, onChange, notice }) {
    let userId = "", data = null, error = "", generation = 0, busy = false, banner = "";
    const edits = new Map();
    function account() {
      const id = getUser()?.id || "";
      if (id !== userId) { userId = id; data = null; error = ""; banner = ""; edits.clear(); ++generation; busy = false; }
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
    function html() {
      account();
      const connections = data?.connections || [], connected = connections.filter((row) => row.connected), pending = (data?.drafts || []).filter((row) => row.status === "pending");
      return `<section class="mailbox-assistant" aria-label="学习邮件收件箱"><article class="card mailbox-overview"><div class="section-title"><div><span>LEARNING INBOX</span><h2>学习邮件</h2></div><button data-action="mailbox-settings">管理邮箱授权</button></div>
        <p class="muted">自动识别教授通知、作业截止和学习活动，核对后加入日程。</p>
        ${banner ? `<p class="mailbox-feedback" role="status">${esc(banner)}</p>` : ""}${error ? `<p class="mailbox-warning" role="alert">${esc(error)}</p>` : ""}
        ${!data && !error ? '<p class="muted" role="status">正在读取邮箱状态…</p>' : ""}
        <div class="mailbox-connections">${connections.map((row) => `<div class="mailbox-connection"><div><strong>${providerName(row.provider)}</strong><small>${esc(row.connected ? row.email : row.configured ? "尚未绑定" : "授权接入准备中")}</small></div>
          ${row.connected ? `<button data-action="mailbox-sync" data-provider="${row.provider}" ${busy || row.syncing || row.reconnectRequired ? "disabled" : ""}>${row.syncing ? "正在识别…" : "立即同步"}</button>` : `<button data-action="mailbox-settings">前往设置</button>`}
          ${row.error ? `<p class="mailbox-warning">${esc(row.error)}</p>` : row.connected ? `<p class="mailbox-sync-time">${row.lastSyncedAt ? `上次处理：${esc(new Date(row.lastSyncedAt).toLocaleString())}` : "首次同步将检查最近 7 天的收件箱邮件。"}</p>` : ""}</div>`).join("")}</div>
        <div class="mailbox-actions"><span class="muted">${connected.length ? `已连接 ${connected.length} 个邮箱 · 本页 ${pending.length} 封待确认` : "在设置中选择 Gmail 或 Outlook，并授权读取收件箱。"}</span><button data-action="mailbox-refresh" ${busy ? "disabled" : ""}>刷新结果</button></div><p class="mailbox-footnote">后台定期同步；识别结果在这里等待确认。附件暂不识别，邮件中模糊的日期或时间需要补充。</p></article>
        <div class="mailbox-messages">${(data?.drafts || []).map(card).join("")}${data && !data.drafts.length ? '<article class="card mailbox-empty"><h3>学习通知会出现在这里</h3><p class="muted">连接邮箱后，系统会自动筛选新邮件。没有识别到学习通知时，这里保持为空。</p></article>' : ""}</div>
        ${data?.nextBefore ? '<button data-action="mailbox-more">读取更早邮件</button>' : ""}</section>`;
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
      if (busy) return;
      busy = true;
      button.disabled = true;
      const current = () => id === getUser()?.id;
      try {
        if (action === "mailbox-refresh" || action === "mailbox-more") await load({ before: action === "mailbox-more" ? data?.nextBefore : "" });
        else if (action === "mailbox-sync") {
          await api(`/api/mailbox/${button.dataset.provider}/sync`, { method: "POST", headers: { "x-csrf-token": data.csrfToken }, body: { userId: id } });
          if (!current()) return;
          banner = "已请求后台同步，识别结果会自动更新。";
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
    return { html, load, input, action, setBanner(value) { account(); banner = value; }, reset() { userId = ""; data = null; edits.clear(); ++generation; },
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
