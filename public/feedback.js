(function (root) {
  "use strict";
  const ui = root.StudyBridgeI18n;
  const { pages, operations, operation, codeLabel } = root.StudyBridgeFeedbackContext;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
  const t = (value) => escape(ui.text(value));
  const time = (value) => value ? new Date(value).toLocaleString(ui.locale(), { dateStyle: "medium", timeStyle: "medium" }) : "—";
  const areaLabel = (area, action) => [ui.text(pages[area]), ui.text(operations[action])].join(" / ");

  function create({ api, getUser, getPage, isAdmin, mount }) {
    let actor, recent, dialog, banner, admin, generation = 0;
    const linkKey = "studybridge.feedback-return";
    const safeId = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z-[a-f0-9]{24}$/;
    const candidate = new URL(location.href).searchParams.get("feedback") || "";
    let link = safeId.test(candidate) ? candidate : "";
    try {
      if (link) sessionStorage.setItem(linkKey, JSON.stringify({ id: link, at: Date.now() }));
      else {
        const pending = JSON.parse(sessionStorage.getItem(linkKey) || "null");
        if (safeId.test(pending?.id || "") && Date.now() - pending.at < 15 * 60000) link = pending.id;
        else sessionStorage.removeItem(linkKey);
      }
    } catch { /* The direct link works without session storage. */ }

    let dismissed = null, paintedError = null, bannerLanguage = "";
    const active = () => actor && actor === getUser()?.id;
    const match = (entry) => entry && Date.now() - Date.parse(entry.occurredAt) < 30 * 60000 && entry.page === getPage();
    const currentError = () => match(recent) ? recent : null;

    function syncBanner() {
      const error = active() && !document.hidden ? currentError() : null;
      if (!error || dismissed === error || dialog) { banner?.remove(); banner = null; return; }
      if (!banner) {
        banner = document.createElement("aside");
        banner.className = "feedback-banner";
        document.body.append(banner);
        banner.addEventListener("click", (event) => {
          if (event.target.closest("[data-feedback-dismiss]")) { dismissed = recent; syncBanner(); }
          if (event.target.closest("[data-feedback-open]")) open();
        });
      }
      if (paintedError === error && bannerLanguage === ui.getLanguage() && banner.hasChildNodes()) return;
      paintedError = error;
      bannerLanguage = ui.getLanguage();
      banner.innerHTML = `<span role="status">${t(codeLabel(error.code))}</span>
        <button type="button" data-feedback-open>${t("反馈这次错误")}</button>
        <button type="button" data-feedback-dismiss aria-label="${t("关闭")}">×</button>`;
    }

    function remember({ path, method = "GET", status, requestId, userId, page, stream = false }) {
      if (!userId || userId !== getUser()?.id || page !== getPage() || document.hidden || isAdmin()) return;
      if (![0, 400, 403, 404, 409, 413, 422, 429, 500, 501, 502, 503, 504].includes(status)) return;
      if (path.startsWith("/api/feedback") || path.startsWith("/api/admin/") || path.startsWith("/api/me/activity")) return;
      const [area, action] = operation(path, method, page);
      if (action === "other") return;
      recent = { area, action, page, requestId, occurredAt: new Date().toISOString(),
        code: status ? `HTTP-${status}` : stream ? "STREAM" : "CONNECTION" };
      syncBanner();
    }

    function open() {
      if (!active() || dialog) return;
      const error = currentError(), reportingUser = actor;
      const body = error || { area: Object.hasOwn(pages, getPage()) ? getPage() : "other", action: "other", code: "MANUAL" };
      const clientId = crypto.randomUUID();
      const opener = document.activeElement;
      const element = document.createElement("dialog");
      dialog = element;
      element.className = "feedback-dialog";
      element.setAttribute("aria-labelledby", "feedbackTitle");
      element.innerHTML = `<header class="dialog-heading"><h2 id="feedbackTitle">${t("反馈问题")}</h2>
        <form method="dialog"><button type="submit" aria-label="${t("关闭")}">×</button></form></header>
        <form class="feedback-form">
          <div class="dialog-body">
            ${error ? `<div class="feedback-diagnostic"><b>${escape(areaLabel(body.area, body.action))}</b><p>${t(codeLabel(body.code))} · ${escape(body.code)}</p>
              ${body.requestId ? `<code>${escape(body.requestId)}</code>` : ""}</div>` : ""}
            <label for="feedbackNote">${t("当时发生了什么？")}</label>
            <textarea id="feedbackNote" rows="4" maxlength="1000" placeholder="${t("例如：我在上传资料时，页面提示读取失败。")}" ${error ? "" : "required"}></textarea>
            <p class="muted">${t("开发者会收到你的账号和本次诊断信息。请避免填写密码、邮件正文或课程内容。")}</p>
          </div>
          <div class="dialog-footer feedback-footer"><p role="status"></p><button class="primary" type="submit">${t("提交反馈")}</button></div>
        </form>`;
      element.addEventListener("close", () => {
        element.remove();
        if (dialog === element) dialog = null;
        syncBanner();
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        else if (active()) (banner?.querySelector("[data-feedback-open]") || mount.querySelector(".feedback-link"))?.focus({ preventScroll: true });
      }, { once: true });
      element.querySelector(".feedback-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!active() || actor !== reportingUser) return;
        const button = event.target.querySelector("button"), field = event.target.querySelector("textarea");
        if (button.disabled) return;
        const note = field.value.trim(), status = event.target.querySelector("[role=status]");
        if (!note && !error) { status.textContent = ui.text("请描述你遇到的问题。"); field.focus(); return; }
        button.disabled = true;
        field.readOnly = true;
        status.textContent = ui.text("正在提交反馈…");
        try {
          const result = await api("/api/feedback", { method: "POST", body: {
            userId: reportingUser, clientId, area: body.area, action: body.action, code: body.code,
            requestId: body.requestId, occurredAt: body.occurredAt, note
          } });
          if (element !== dialog || !active() || actor !== reportingUser) return;
          status.textContent = ui.message`已提交反馈。编号 ${result.id}`;
          button.hidden = true;
          dismissed = error;
        } catch (failure) {
          if (element !== dialog || !active() || actor !== reportingUser) return;
          status.textContent = failure.status === 429 ? ui.text("反馈次数已达上限，请稍后再试。") : ui.text("暂未提交，描述已保留，请重试。");
          field.readOnly = false;
          button.disabled = false;
        }
      });
      document.body.append(element);
      syncBanner();
      element.showModal();
    }

    const mailLabel = (state) => ({
      queued: "等待发信", sending: "正在发信", sent: "已发送邮件",
      failed: "邮件发送失败", unconfigured: "邮件通知未配置"
    })[state];
    const kindLabel = (kind) => ({ timeout: "请求超时", quota: "AI 额度或服务限制", storage: "存储写入冲突" })[kind];
    const detail = (name, value) => value !== "" && value != null ? `<div><dt>${t(name)}</dt><dd>${escape(value)}</dd></div>` : "";

    function issueHtml(issue) {
      const { user, diagnostics, mail } = issue;
      const resolved = issue.status === "resolved";
      return `<article class="feedback-issue" id="feedback-${escape(issue.id)}">
        <details data-feedback-issue="${escape(issue.id)}" ${admin.expanded.has(issue.id) ? "open" : ""}>
          <summary>
            <span><b>${escape(user.name || user.email)}</b><span> · ${escape(areaLabel(issue.area, issue.action))}</span></span>
            <span class="feedback-row-meta">${t(codeLabel(issue.code))} · <code>${escape(issue.code)}</code></span>
            <span class="feedback-row-meta">${escape(time(issue.lastAt))} · ${t(resolved ? "已处理" : "待处理")} · ${t(mailLabel(mail.state))}</span>
          </summary>
          <dl class="feedback-facts">
            ${detail("账号邮箱", user.email)}${detail("账号编号", user.id)}
            ${detail("反馈编号", issue.id)}${detail("错误编号", diagnostics.requestId)}
            ${detail("首次发生", time(diagnostics.occurredAt || issue.firstAt))}${detail(issue.source === "user" ? "提交时间" : "最近发生", time(issue.lastAt))}
            ${detail("发生次数", issue.count)}${detail("反馈来源", ui.text(diagnostics.background ? "后台任务故障" : issue.source === "automatic" ? "系统自动记录" : "用户提交"))}
            ${detail("浏览器与系统", `${diagnostics.browser} / ${diagnostics.device}`)}
            ${detail("当前版本", diagnostics.version)}${detail("请求耗时", Number.isFinite(diagnostics.durationMs) ? `${diagnostics.durationMs} ms` : "")}
            ${detail("诊断说明", kindLabel(diagnostics.kind) ? ui.text(kindLabel(diagnostics.kind)) : "")}
          </dl>
          ${issue.note ? `<div class="feedback-note"><b>${t("用户描述")}</b><p>${escape(issue.note)}</p></div>` : ""}
          <div class="feedback-actions">
            <button type="button" data-feedback-action="${resolved ? "reopen" : "resolve"}">${t(resolved ? "重新打开" : "标记已处理")}</button>
            ${["failed", "unconfigured"].includes(mail.state) ? `<button type="button" data-feedback-action="retry-mail">${t("重试邮件")}</button>` : ""}
            <span role="status"></span>
          </div>
        </details>
      </article>`;
    }

    function paint() {
      const inbox = mount.querySelector("[data-feedback-inbox]");
      if (!admin || !inbox) return;
      inbox.open = admin.open;
      const content = inbox.querySelector("[data-feedback-list]");
      content.setAttribute("aria-busy", String(admin.loading));
      content.innerHTML = `${admin.issues.map(issueHtml).join("")}
        ${admin.loading ? `<p class="muted" role="status">${t("正在读取问题反馈…")}</p>`
          : admin.error ? `<p class="muted" role="status">${t("无法读取问题反馈，请重试。")}</p>`
          : admin.linkMissing ? `<p class="muted">${t("链接中的问题反馈已不存在。")}</p>`
          : admin.loaded && !admin.issues.length ? `<p class="muted">${t("暂无问题反馈。")}</p>` : ""}
        <div class="feedback-actions"><button type="button" data-feedback-refresh>${t("刷新")}</button>
        ${admin.before ? `<button type="button" data-feedback-next ${admin.loading ? "disabled" : ""}>${t("加载更多")}</button>` : ""}</div>`;
    }

    async function load({ append = false, focusId = "" } = {}) {
      if (!active() || !admin || admin.loading) return;
      const target = admin, turn = generation;
      target.loading = true;
      target.error = false;
      paint();
      try {
        const query = append && target.before ? `?before=${encodeURIComponent(target.before)}` : "";
        const results = await api("/api/admin/feedback" + query);
        if (target !== admin || turn !== generation || !active()) return;
        target.before = results.nextBefore;
        const issues = new Map((append ? target.issues : []).map(issue => [issue.id, issue]));
        for (const issue of results.issues) issues.set(issue.id, issue);
        if (focusId && !issues.has(focusId)) {
          try {
            const { issue } = await api("/api/admin/feedback/" + encodeURIComponent(focusId));
            if (target !== admin || turn !== generation || !active()) return;
            issues.set(issue.id, issue);
          } catch (error) {
            if (target !== admin || turn !== generation || !active()) return;
            if (error.status !== 404) throw error;
            target.linkMissing = true;
          }
        }
        if (focusId && issues.has(focusId)) target.expanded.add(focusId);
        target.issues = [...issues.values()];
        target.loaded = true;
      } catch {
        if (target === admin && turn === generation) target.error = true;
      } finally {
        if (target === admin && turn === generation && active()) {
          target.loading = false;
          paint();
          if (focusId && target.expanded.has(focusId)) document.getElementById("feedback-" + focusId)?.scrollIntoView({ block: "nearest" });
        }
      }
    }

    async function act(button) {
      const target = admin, issueId = button.closest("[data-feedback-issue]")?.dataset.feedbackIssue;
      if (!active() || !target || !issueId || button.disabled) return;
      const current = actor;
      const action = button.dataset.feedbackAction;
      button.disabled = true;
      try {
        const { issue } = await api("/api/admin/feedback/" + encodeURIComponent(issueId), { method: "PATCH", body: { actorId: current, action } });
        if (admin !== target || actor !== current || !active()) return;
        target.issues = target.issues.map(item => item.id === issue.id ? issue : item);
        paint();
        document.getElementById("feedback-" + issue.id)?.querySelector("summary")?.focus({ preventScroll: true });
      } catch {
        if (button.isConnected && admin === target && active()) {
          button.disabled = false;
          button.parentElement.querySelector("[role=status]").textContent = ui.text("未能更新问题反馈，请重试。");
        }
      }
    }

    function mountInbox(element) {
      element.addEventListener("toggle", (event) => {
        if (!admin || !event.target.isConnected) return;
        if (event.target === element) {
          admin.open = element.open;
          if (admin.open && !admin.loaded && !admin.loading && !admin.error) void load();
        } else {
          const id = event.target.dataset.feedbackIssue;
          if (id) {
            if (event.target.open) admin.expanded.add(id);
            else admin.expanded.delete(id);
          }
        }
      }, true);
      element.onclick = (event) => {
        if (event.target.closest("[data-feedback-refresh]")) void load();
        if (event.target.closest("[data-feedback-next]")) void load({ append: true });
        const button = event.target.closest("[data-feedback-action]");
        if (button) void act(button);
      };
    }

    function sync() {
      const userId = getUser()?.id;
      if (actor !== userId) {
        actor = userId;
        generation++;
        admin = null;
        recent = dismissed = null;
        dialog?.close();
      }
      syncBanner();
      const inbox = mount.querySelector("[data-feedback-inbox]");
      if (!active() || !isAdmin() || !inbox) { if (admin) { admin = null; generation++; } return; }
      admin ||= { open: Boolean(link), expanded: new Set(), issues: [], before: "" };
      if (admin.element === inbox) return;
      admin.element = inbox;
      mountInbox(inbox);
      paint();
      if (link) {
        const focusId = link;
        link = "";
        try { sessionStorage.removeItem(linkKey); } catch {}
        void load({ focusId });
      }
    }

    document.addEventListener("visibilitychange", syncBanner);
    return { open, remember, sync, hasLink: () => Boolean(link),
      html: () => `<details class="feedback-inbox" data-feedback-inbox id="admin-feedback">
        <summary>${t("问题反馈")}</summary><div data-feedback-list></div>
      </details>`
    };
  }

  root.StudyBridgeFeedback = { create };
})(globalThis);
