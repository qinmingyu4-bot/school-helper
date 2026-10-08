(() => {
  window.__studybridgeNavDashboardStabilityDisabled = "20261008-1.0.82";

  const STYLE_ID = "studybridge-stability-1082";
  let selectedClassmateId = "";
  let classmatePoll = null;

  function esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }

  function token() {
    return localStorage.getItem("studybridge_token") || localStorage.getItem("studybridge-token") || localStorage.getItem("token") || "";
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const auth = token();
    if (auth) headers.Authorization = `Bearer ${auth}`;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
  }

  function installStyle() {
    let style = document.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm,
      body.sb-study-mode #chatForm { display:grid !important; grid-template-columns:minmax(0,1fr) 86px !important; align-items:end !important; gap:10px !important; }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready,
      body.sb-study-mode #chatForm.study-attachment-ready { grid-template-columns:44px minmax(0,1fr) 86px !important; }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm .study-attachment-button,
      body.sb-study-mode #chatForm .study-attachment-button { grid-column:1 !important; grid-row:1 !important; align-self:end !important; width:44px !important; height:52px !important; }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm #messageInput,
      body.sb-study-mode #chatForm #messageInput { grid-column:1 !important; grid-row:1 !important; min-width:0 !important; }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready #messageInput,
      body.sb-study-mode #chatForm.study-attachment-ready #messageInput { grid-column:2 !important; }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm #sendButton,
      body.sb-study-mode #chatForm #sendButton { grid-column:2 !important; grid-row:1 !important; align-self:end !important; width:86px !important; min-width:86px !important; height:52px !important; }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready #sendButton,
      body.sb-study-mode #chatForm.study-attachment-ready #sendButton { grid-column:3 !important; }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm .study-attachment-tray,
      body.sb-study-mode #chatForm .study-attachment-tray { grid-column:1 / -1 !important; grid-row:2 !important; }
      .sb-stability-grid { display:grid; grid-template-columns:minmax(280px,.9fr) minmax(420px,1.6fr); gap:14px; }
      .sb-stability-list { display:flex; flex-direction:column; gap:10px; }
      .sb-stability-card { border:1px solid #d6e0ee; border-radius:8px; background:rgba(255,255,255,.94); padding:16px; }
      .sb-stability-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .sb-stability-peer { width:100%; text-align:left; border:1px solid #d6e0ee; border-radius:8px; background:white; padding:12px; cursor:pointer; }
      .sb-stability-peer.active { border-color:#2f8b6b; background:#eef7f4; }
      .sb-stability-muted { color:#526987; font-size:13px; }
      .sb-stability-profile { border:1px solid #d6e0ee; border-radius:8px; overflow:hidden; background:white; margin-bottom:12px; }
      .sb-stability-cover { height:84px; background:linear-gradient(135deg,#25496d,#63a584); }
      .sb-stability-profile-body { display:flex; align-items:end; gap:14px; padding:0 14px 14px; margin-top:-28px; }
      .sb-stability-avatar { width:56px; height:56px; border-radius:8px; border:3px solid white; background:#1d6b60; color:white; display:grid; place-items:center; font-weight:900; overflow:hidden; }
      .sb-stability-avatar img { width:100%; height:100%; object-fit:cover; }
      .sb-stability-messages { min-height:360px; max-height:52vh; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid #dfe7f1; border-radius:8px; background:#f7faff; }
      .sb-stability-message { max-width:72%; border:1px solid #d4dfed; border-radius:8px; background:white; padding:10px 12px; align-self:flex-start; }
      .sb-stability-message.mine { align-self:flex-end; background:#eef4ff; border-color:#bcd0fa; }
      .sb-stability-message p { margin:0; white-space:pre-wrap; line-height:1.45; }
      .sb-stability-form { display:grid; grid-template-columns:minmax(0,1fr) 86px; gap:10px; margin-top:10px; }
      .sb-stability-form input { min-width:0; }
      .sb-dev-status-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
      .sb-dev-card,.sb-dev-invite,.sb-dev-user,.sb-dev-reset { border:1px solid #d6e0ee; border-radius:8px; background:rgba(255,255,255,.92); padding:14px; }
      .sb-dev-invite,.sb-dev-user,.sb-dev-reset { margin-top:10px; }
      .sb-dev-dot { display:inline-block; width:9px; height:9px; border-radius:999px; margin-right:8px; background:#d9901f; vertical-align:1px; }
      .sb-dev-dot.ok { background:#2f8b6b; } .sb-dev-dot.bad { background:#c14646; }
      .sb-dev-split { display:grid; grid-template-columns:minmax(320px,.95fr) minmax(340px,1fr); gap:14px; margin-top:14px; }
      .sb-dev-row,.sb-dev-actions,.sb-dev-pills { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .sb-dev-row { justify-content:space-between; }
      .sb-dev-pill { display:inline-flex; min-width:76px; justify-content:center; padding:5px 10px; border-radius:999px; background:#eaf3f0; color:#0b6c53; font-weight:800; }
      @media (max-width:900px) { .sb-stability-grid,.sb-dev-split { grid-template-columns:1fr; } }
    `;
  }

  function setActive(route) {
    document.querySelectorAll("[data-sb-route]").forEach((node) => node.classList.toggle("is-active", node.dataset.sbRoute === route));
  }

  function pageShell(route, eyebrow, title, subtitle) {
    clearInterval(classmatePoll);
    classmatePoll = null;
    let page = document.querySelector("#sbDirectPage");
    if (!page) {
      page = document.createElement("section");
      page.id = "sbDirectPage";
      document.querySelector("#appShell")?.appendChild(page);
    }
    document.body.classList.add("studybridge-secondary-page", "sb-direct-mode");
    document.body.classList.remove("sb-study-mode", "creator-clean-mode");
    document.body.dataset.studybridgeActivePage = route;
    localStorage.setItem("studybridgeLastRoute", route);
    page.hidden = false;
    document.querySelectorAll(".topbar,#scheduleDashboard,#chatArea,#quickPrompts,#chatForm,#developerPanel").forEach((node) => { node.hidden = true; });
    setActive(route);
    page.innerHTML = `<div class="sb-head"><div><p class="sb-muted" style="margin:0;font-weight:900">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><button class="sb-btn" type="button" data-sb-route="study">返回学习区</button></div><div class="sb-body"><section class="sb-stability-card">正在读取数据...</section></div>`;
    return page;
  }

  function peerOf(mate) { return mate?.peer || mate?.user || mate || {}; }
  function peerName(mate) { const p = peerOf(mate); return p.name || mate?.name || p.sbId || mate?.sbId || "同学"; }
  function peerSbId(mate) { const p = peerOf(mate); return p.sbId || mate?.sbId || "未设置"; }
  function peerSchoolMajor(mate) { const p = peerOf(mate); return [p.school, p.major].filter(Boolean).join(" · ") || "未填写学校和专业"; }
  function peerAvatar(mate) { const p = peerOf(mate); return p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(peerName(mate).slice(0, 1).toUpperCase()); }

  async function renderClassmates() {
    installStyle();
    const page = pageShell("classmates", "CLASSMATES", "同学", "通过 SB ID 发送好友申请，通过后可以聊天。");
    const body = page.querySelector(".sb-body");
    try {
      const data = await api("/api/classmates");
      const classmates = data.classmates || data.friends || [];
      const incoming = Array.isArray(data.requests) ? data.requests : (data.requests?.incoming || data.incomingRequests || []);
      const outgoing = data.requests?.outgoing || data.outgoingRequests || [];
      const candidates = data.candidates || [];
      const selected = classmates.find((mate) => String(mate.id) === String(selectedClassmateId)) || classmates[0] || null;
      if (selected) selectedClassmateId = selected.id;
      body.innerHTML = `<section class="sb-stability-grid"><article class="sb-stability-card"><h3 style="margin-top:0">添加同学</h3><p class="sb-stability-muted">当前学校：${esc(data.school || "未填写")}</p><form class="sb-stability-form" id="sbClassmateAddForm"><input name="sbId" placeholder="输入 SB ID，例如 adam2026"><button class="sb-btn primary" type="submit">发送申请</button></form><details style="margin-top:12px"><summary><strong>申请列表</strong>${incoming.length ? ` <span class="sb-pill">${incoming.length}</span>` : ""}</summary><div class="sb-stability-list" style="margin-top:10px">${incoming.length ? incoming.map((req) => `<div class="sb-stability-peer"><strong>${esc(req.from?.name || req.fromName || "同学")}</strong><div class="sb-stability-muted">SB ID: ${esc(req.from?.sbId || req.sbId || "")}</div><div class="sb-dev-actions"><button class="sb-btn primary" data-request-action="accept" data-request-id="${esc(req.id)}" type="button">通过</button><button class="sb-btn" data-request-action="ignore" data-request-id="${esc(req.id)}" type="button">忽略</button></div></div>`).join("") : `<p class="sb-stability-muted">暂无好友申请。</p>`}${outgoing.length ? `<p class="sb-stability-muted">已发送 ${outgoing.length} 个申请，等待对方通过。</p>` : ""}</div></details><h3>同学列表</h3><div class="sb-stability-list">${classmates.length ? classmates.map((mate) => `<button class="sb-stability-peer ${String(mate.id) === String(selectedClassmateId) ? "active" : ""}" type="button" data-classmate-id="${esc(mate.id)}"><strong>${esc(peerName(mate))}</strong><div class="sb-stability-muted">SB ID: ${esc(peerSbId(mate))}</div><div class="sb-stability-muted">${esc(mate.lastMessage?.content || "")}</div></button>`).join("") : `<p class="sb-stability-muted">还没有同学。输入对方 SB ID 发送申请。</p>`}</div>${candidates.length ? `<h3>同校用户</h3><div class="sb-stability-list">${candidates.map((item) => `<div class="sb-stability-peer"><strong>${esc(item.name || "同学")}</strong><div class="sb-stability-muted">SB ID: ${esc(item.sbId || "")}</div></div>`).join("")}</div>` : ""}</article><article class="sb-stability-card"><div class="sb-stability-row"><div><p class="sb-muted" style="margin:0;font-weight:900">DIRECT CHAT</p><h3 style="margin:0">${esc(selected ? peerName(selected) : "请选择一位同学")}</h3></div><button class="sb-btn" type="button" id="sbClassmateRefresh">刷新</button></div>${selected ? `<div class="sb-stability-profile"><div class="sb-stability-cover"></div><div class="sb-stability-profile-body"><div class="sb-stability-avatar">${peerAvatar(selected)}</div><div><h3 style="margin:0">${esc(peerName(selected))}</h3><div class="sb-dev-pills"><span class="sb-dev-pill">${esc(peerSchoolMajor(selected))}</span><span class="sb-dev-pill">SB ID: ${esc(peerSbId(selected))}</span></div></div></div></div>` : ""}<div class="sb-stability-messages" id="sbClassmateMessages"></div><form class="sb-stability-form" id="sbClassmateChatForm"><input name="content" placeholder="写一句话给同学" ${selected ? "" : "disabled"}><button class="sb-btn primary" type="submit" ${selected ? "" : "disabled"}>发送</button></form></article></section>`;

      async function loadMessages() {
        const box = page.querySelector("#sbClassmateMessages");
        if (!box || !selectedClassmateId) return;
        const chat = await api(`/api/classmates/${encodeURIComponent(selectedClassmateId)}/messages`).catch(() => ({ messages: [] }));
        const messages = chat.messages || [];
        box.innerHTML = messages.length ? messages.map((msg) => `<div class="sb-stability-message ${msg.mine ? "mine" : ""}"><p>${esc(msg.content || msg.text || msg.message || "")}</p><span class="sb-stability-muted">${esc(msg.createdAt ? new Date(msg.createdAt).toLocaleString("zh-CN") : "")}</span></div>`).join("") : `<p class="sb-stability-muted">还没有聊天记录。</p>`;
        box.scrollTop = box.scrollHeight;
      }
      await loadMessages();
      classmatePoll = window.setInterval(loadMessages, 5000);
    } catch (error) {
      body.innerHTML = `<section class="sb-stability-card"><h3>同学页面读取失败</h3><p>${esc(error.message || error)}</p></section>`;
    }
  }

  function time(value) {
    if (!value) return "暂未检测到";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12:false });
  }
  function statusCard(title, value, detail, level = "warn") { return `<div class="sb-dev-card"><strong><span class="sb-dev-dot ${level}"></span>${esc(title)}</strong><h4 style="margin:8px 0 0;color:#08245c">${esc(value || "未检测到")}</h4><p>${esc(detail || "")}</p></div>`; }
  function statusCards(system) {
    const version = system.version || {}, deploy = system.deploy || {}, database = system.database || {}, backup = system.backup || {}, ai = system.ai || {}, google = system.google || {}, email = system.email || {}, autoSync = system.autoSync || {};
    return [statusCard("当前版本", version.app || "StudyBridge", `Node ${version.node || ""}`.trim(), version.app ? "ok" : "warn"), statusCard("最后部署时间", time(deploy.lastCodeUpdateAt || deploy.serverStartedAt), "按服务器文件时间显示。", deploy.lastCodeUpdateAt ? "ok" : "warn"), statusCard("数据库模式", database.mode || "local", database.note || (database.ready ? "数据库可读取。" : "数据库状态未确认。"), database.ready ? "ok" : "bad"), statusCard("本地备份", backup.ready ? "已启用" : backup.configured ? "待确认" : "未启用", backup.note || "本地文件数据库建议保持自动备份。", backup.ready ? "ok" : "warn"), statusCard("AI 是否正常", ai.ok ? "正常" : ai.configured ? "已配置，待确认" : "未配置", ai.detail || `当前模型 ${ai.simpleModel || "gpt-4o-mini"}。`, ai.ok ? "ok" : ai.configured ? "warn" : "bad"), statusCard("Google 登录", google.enabled ? "已启用" : "未配置", google.enabled ? "Google 登录可用。" : "普通邮箱注册仍可用。", google.enabled ? "ok" : "warn"), statusCard("邮箱验证码", email.sendingConfigured ? "已启用真实发信" : email.verificationRequired ? "需要验证码" : "非必需", email.sendingConfigured ? "可以发送邮箱验证码。" : "当前仍由邀请码控制注册，暂不强制邮箱发信。", email.sendingConfigured || !email.verificationRequired ? "ok" : "warn"), statusCard("服务器自动同步", autoSync.configured ? "已检测到" : "未确认", autoSync.note || "如果页面最近已自动更新，说明同步机制正在工作。", autoSync.configured ? "ok" : "warn"), statusCard("管理接口", "正常", "可以读取用户、邀请码和重置申请。", "ok")].join("");
  }
  function inviteStatus(invite) { return `${invite.active === false ? "已停用" : "可用"} · ${invite.usedCount ?? invite.uses ?? 0}/${invite.maxUses ?? 1} used`; }
  function renderInvites(invites) { return invites.length ? invites.map((invite) => `<div class="sb-dev-invite"><strong>${esc(invite.code || "")}</strong><p>${esc(invite.label || "未备注")} · ${esc(inviteStatus(invite))}</p><div class="sb-dev-actions"><button class="sb-btn" type="button" data-copy-code="${esc(invite.code || "")}">复制</button><button class="sb-btn" type="button" data-toggle-invite="${esc(invite.id || "")}" data-next-active="${invite.active === false ? "true" : "false"}">${invite.active === false ? "启用" : "停用"}</button></div></div>`).join("") : `<p class="sb-stability-muted">还没有邀请码。</p>`; }
  function userStat(user, key) { const stats = user.stats || {}; return key === "courses" ? (stats.courses ?? user.courseCount ?? 0) : key === "docs" ? (stats.documents ?? stats.docs ?? user.documentCount ?? 0) : (stats.messages ?? stats.chats ?? user.chatCount ?? 0); }
  function renderUsers(users) { return users.length ? users.map((user) => `<div class="sb-dev-user"><strong>${esc(user.name || user.email || "用户")}</strong><p>${esc(user.email || "")} · ${esc(user.role || "student")}</p><div class="sb-dev-pills"><span class="sb-dev-pill">${esc(userStat(user,"courses"))} courses</span><span class="sb-dev-pill">${esc(userStat(user,"docs"))} docs</span><span class="sb-dev-pill">${esc(userStat(user,"chats"))} chats</span></div></div>`).join("") : `<p class="sb-stability-muted">暂无用户数据。</p>`; }
  function renderResets(items) { return items?.length ? items.map((item) => `<div class="sb-dev-reset"><strong>${esc(item.name || item.email || "重置申请")}</strong><p>${esc(item.email || "")} · ${esc(item.status || "pending")}</p></div>`).join("") : `<p class="sb-stability-muted">还没有密码重置申请。</p>`; }

  async function renderDeveloper() {
    installStyle();
    const page = pageShell("developer", "CREATOR CONSOLE", "开发者端", "管理邀请码、用户、系统状态和密码重置申请。");
    const body = page.querySelector(".sb-body");
    const [overview, system] = await Promise.all([api("/api/admin/overview").catch((error) => ({ error:error.message, invites:[], users:[], resetRequests:[] })), api("/api/admin/system-status").catch((error) => ({ error:error.message }))]);
    body.innerHTML = `<section class="sb-stability-card"><div class="sb-dev-row"><div><h3 style="margin:0">系统状态</h3><p class="sb-stability-muted" style="margin:4px 0 0">检测完成：${esc(new Date().toLocaleString("zh-CN", { hour12:false }))}</p></div><button class="sb-btn" type="button" id="sbDevRefresh">检测</button></div><div class="sb-dev-status-grid" style="margin-top:12px">${statusCards(system)}</div></section><section class="sb-dev-split"><article class="sb-stability-card"><h3 style="margin-top:0">邀请码</h3><form class="sb-stability-form" id="sbInviteRestoreForm"><input name="label" placeholder="备注：例如 Kevin / ECO101 小组"><button class="sb-btn primary" type="submit">生成</button></form><div>${renderInvites(overview.invites || [])}</div></article><article class="sb-stability-card"><h3 style="margin-top:0">用户</h3>${renderUsers(overview.users || [])}</article></section><section class="sb-stability-card" style="margin-top:14px"><h3 style="margin-top:0">密码重置申请</h3>${renderResets(overview.resetRequests || [])}</section>`;
  }

  async function copyText(text) {
    try { await navigator.clipboard?.writeText(text); return true; } catch { const textarea = document.createElement("textarea"); textarea.value = text; textarea.style.position = "fixed"; textarea.style.left = "-9999px"; document.body.appendChild(textarea); textarea.select(); const ok = document.execCommand("copy"); textarea.remove(); return ok; }
  }

  installStyle();
  new MutationObserver(installStyle).observe(document.documentElement, { childList:true, subtree:true });

  document.addEventListener("click", async (event) => {
    const routeTarget = event.target.closest?.('[data-sb-route="classmates"],[data-sb-route="developer"],#creatorViewButton');
    if (routeTarget) {
      const route = routeTarget.id === "creatorViewButton" ? "developer" : routeTarget.dataset.sbRoute;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      if (route === "classmates") renderClassmates().catch(console.error);
      if (route === "developer") renderDeveloper().catch(console.error);
      return;
    }
    const mate = event.target.closest?.("[data-classmate-id]");
    if (mate) { event.preventDefault(); selectedClassmateId = mate.dataset.classmateId; renderClassmates().catch(console.error); return; }
    const refreshMate = event.target.closest?.("#sbClassmateRefresh");
    if (refreshMate) { event.preventDefault(); renderClassmates().catch(console.error); return; }
    const requestAction = event.target.closest?.("[data-request-action]");
    if (requestAction) { event.preventDefault(); await api(`/api/classmate-requests/${encodeURIComponent(requestAction.dataset.requestId || "")}`, { method:"PATCH", body:JSON.stringify({ action:requestAction.dataset.requestAction }) }); await renderClassmates(); return; }
    const refreshDev = event.target.closest?.("#sbDevRefresh");
    if (refreshDev) { event.preventDefault(); await renderDeveloper(); return; }
    const copy = event.target.closest?.("[data-copy-code]");
    if (copy) { event.preventDefault(); await copyText(copy.dataset.copyCode || ""); copy.textContent = "已复制"; return; }
    const toggle = event.target.closest?.("[data-toggle-invite]");
    if (toggle) { event.preventDefault(); await api(`/api/admin/invites/${encodeURIComponent(toggle.dataset.toggleInvite || "")}`, { method:"PATCH", body:JSON.stringify({ active:toggle.dataset.nextActive === "true" }) }); await renderDeveloper(); }
  }, true);

  document.addEventListener("submit", async (event) => {
    if (event.target?.id === "sbClassmateAddForm") { event.preventDefault(); await api("/api/classmates", { method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) }); await renderClassmates(); return; }
    if (event.target?.id === "sbClassmateChatForm") { event.preventDefault(); const body = Object.fromEntries(new FormData(event.target).entries()); if (!body.content || !selectedClassmateId) return; await api(`/api/classmates/${encodeURIComponent(selectedClassmateId)}/messages`, { method:"POST", body:JSON.stringify(body) }); event.target.reset(); await renderClassmates(); return; }
    if (event.target?.id === "sbInviteRestoreForm") { event.preventDefault(); await api("/api/admin/invites", { method:"POST", body:JSON.stringify({ maxUses:1, ...Object.fromEntries(new FormData(event.target).entries()) }) }); await renderDeveloper(); }
  }, true);
})();
