(() => {
  window.__studybridgeNavDashboardStabilityDisabled = "20261008-1.0.81";

  const STYLE_ID = "studybridge-composer-layout-stability";
  const DEV_STYLE_ID = "studybridge-developer-dashboard-restore";

  function installComposerLayout() {
    let style = document.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm,
      body.sb-study-mode #chatForm {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) 86px !important;
        align-items: end !important;
        gap: 10px !important;
      }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready,
      body.sb-study-mode #chatForm.study-attachment-ready {
        grid-template-columns: 44px minmax(0, 1fr) 86px !important;
      }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm .study-attachment-button,
      body.sb-study-mode #chatForm .study-attachment-button {
        grid-column: 1 !important;
        grid-row: 1 !important;
        align-self: end !important;
        width: 44px !important;
        height: 52px !important;
      }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm #messageInput,
      body.sb-study-mode #chatForm #messageInput {
        grid-column: 1 !important;
        grid-row: 1 !important;
        min-width: 0 !important;
      }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready #messageInput,
      body.sb-study-mode #chatForm.study-attachment-ready #messageInput {
        grid-column: 2 !important;
      }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm #sendButton,
      body.sb-study-mode #chatForm #sendButton {
        grid-column: 2 !important;
        grid-row: 1 !important;
        align-self: end !important;
        width: 86px !important;
        min-width: 86px !important;
        height: 52px !important;
      }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready #sendButton,
      body.sb-study-mode #chatForm.study-attachment-ready #sendButton {
        grid-column: 3 !important;
      }
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm .study-attachment-tray,
      body.sb-study-mode #chatForm .study-attachment-tray {
        grid-column: 1 / -1 !important;
        grid-row: 2 !important;
      }
      @media (max-width: 560px) {
        body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready,
        body.sb-study-mode #chatForm.study-attachment-ready {
          grid-template-columns: 44px minmax(0, 1fr) !important;
        }
        body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready #sendButton,
        body.sb-study-mode #chatForm.study-attachment-ready #sendButton {
          grid-column: 1 / -1 !important;
          grid-row: 2 !important;
          width: 100% !important;
        }
        body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready .study-attachment-tray,
        body.sb-study-mode #chatForm.study-attachment-ready .study-attachment-tray {
          grid-row: 3 !important;
        }
      }
    `;
  }

  function installDeveloperStyle() {
    if (document.querySelector(`#${DEV_STYLE_ID}`)) return;
    const style = document.createElement("style");
    style.id = DEV_STYLE_ID;
    style.textContent = `
      .sb-dev-status-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
      .sb-dev-card,.sb-dev-invite,.sb-dev-user,.sb-dev-reset { border:1px solid #d6e0ee; border-radius:8px; background:rgba(255,255,255,.92); padding:14px; }
      .sb-dev-invite,.sb-dev-user,.sb-dev-reset { margin-top:10px; }
      .sb-dev-card strong,.sb-dev-invite strong,.sb-dev-user strong { display:block; color:#08245c; }
      .sb-dev-card p,.sb-dev-invite p,.sb-dev-user p,.sb-dev-reset p { margin:6px 0 0; color:#40577d; line-height:1.4; }
      .sb-dev-dot { display:inline-block; width:9px; height:9px; border-radius:999px; margin-right:8px; background:#d9901f; vertical-align:1px; }
      .sb-dev-dot.ok { background:#2f8b6b; }
      .sb-dev-dot.bad { background:#c14646; }
      .sb-dev-split { display:grid; grid-template-columns:minmax(320px,.95fr) minmax(340px,1fr); gap:14px; margin-top:14px; }
      .sb-dev-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .sb-dev-actions,.sb-dev-pills { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
      .sb-dev-pill { display:inline-flex; align-items:center; justify-content:center; min-width:76px; padding:5px 10px; border-radius:999px; background:#eaf3f0; color:#0b6c53; font-weight:800; }
      .sb-dev-muted { color:#566b8d; }
      @media (max-width:900px) { .sb-dev-split { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }

  function authToken() {
    return localStorage.getItem("studybridge_token") || localStorage.getItem("studybridge-token") || localStorage.getItem("token") || "";
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = authToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
  }

  function esc(value) {
    return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function time(value) {
    if (!value) return "暂未检测到";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12:false });
  }

  function statusCard(title, value, detail, level = "warn") {
    return `<div class="sb-dev-card"><strong><span class="sb-dev-dot ${level}"></span>${esc(title)}</strong><h4 style="margin:8px 0 0;color:#08245c">${esc(value || "未检测到")}</h4><p>${esc(detail || "")}</p></div>`;
  }

  function statusCards(system) {
    const version = system.version || {};
    const deploy = system.deploy || {};
    const database = system.database || {};
    const backup = system.backup || {};
    const ai = system.ai || {};
    const google = system.google || {};
    const email = system.email || {};
    const autoSync = system.autoSync || {};
    return [
      statusCard("当前版本", version.app || "StudyBridge", `Node ${version.node || ""}`.trim(), version.app ? "ok" : "warn"),
      statusCard("最后部署时间", time(deploy.lastCodeUpdateAt || deploy.serverStartedAt), "按服务器文件时间显示。", deploy.lastCodeUpdateAt ? "ok" : "warn"),
      statusCard("数据库模式", database.mode || "local", database.note || (database.ready ? "数据库可读取。" : "数据库状态未确认。"), database.ready ? "ok" : "bad"),
      statusCard("本地备份", backup.ready ? "已启用" : backup.configured ? "待确认" : "未启用", backup.note || "本地文件数据库建议保持自动备份。", backup.ready ? "ok" : "warn"),
      statusCard("AI 是否正常", ai.ok ? "正常" : ai.configured ? "已配置，待确认" : "未配置", ai.detail || `当前模型 ${ai.simpleModel || "gpt-4o-mini"}。`, ai.ok ? "ok" : ai.configured ? "warn" : "bad"),
      statusCard("Google 登录", google.enabled ? "已启用" : "未配置", google.enabled ? "Google 登录可用。" : "普通邮箱注册仍可用。", google.enabled ? "ok" : "warn"),
      statusCard("邮箱验证码", email.sendingConfigured ? "已启用真实发信" : email.verificationRequired ? "需要验证码" : "非必需", email.sendingConfigured ? "可以发送邮箱验证码。" : "当前仍由邀请码控制注册，暂不强制邮箱发信。", email.sendingConfigured || !email.verificationRequired ? "ok" : "warn"),
      statusCard("服务器自动同步", autoSync.configured ? "已检测到" : "未确认", autoSync.note || "如果页面最近已自动更新，说明同步机制正在工作。", autoSync.configured ? "ok" : "warn"),
      statusCard("管理接口", "正常", "可以读取用户、邀请码和重置申请。", "ok")
    ].join("");
  }

  function inviteStatus(invite) {
    const used = invite.usedCount ?? invite.uses ?? 0;
    const max = invite.maxUses ?? 1;
    return `${invite.active === false ? "已停用" : "可用"} · ${used}/${max} used`;
  }

  function renderInvites(invites) {
    if (!invites.length) return `<p class="sb-dev-muted">还没有邀请码。</p>`;
    return invites.map((invite) => `<div class="sb-dev-invite"><div><strong>${esc(invite.code || "")}</strong><p>${esc(invite.label || "未备注")} · ${esc(inviteStatus(invite))}</p></div><div class="sb-dev-actions"><button class="sb-btn" type="button" data-copy-code="${esc(invite.code || "")}">复制</button><button class="sb-btn" type="button" data-toggle-invite="${esc(invite.id || "")}" data-next-active="${invite.active === false ? "true" : "false"}">${invite.active === false ? "启用" : "停用"}</button></div></div>`).join("");
  }

  function stat(user, key) {
    const stats = user.stats || {};
    if (key === "courses") return stats.courses ?? user.courseCount ?? 0;
    if (key === "docs") return stats.documents ?? stats.docs ?? user.documentCount ?? 0;
    if (key === "chats") return stats.messages ?? stats.chats ?? user.chatCount ?? 0;
    return 0;
  }

  function renderUsers(users) {
    if (!users.length) return `<p class="sb-dev-muted">暂无用户数据。</p>`;
    return users.map((user) => `<div class="sb-dev-user"><strong>${esc(user.name || user.email || "用户")}</strong><p>${esc(user.email || "")} · ${esc(user.role || "student")}</p><div class="sb-dev-pills"><span class="sb-dev-pill">${esc(stat(user,"courses"))} courses</span><span class="sb-dev-pill">${esc(stat(user,"docs"))} docs</span><span class="sb-dev-pill">${esc(stat(user,"chats"))} chats</span></div></div>`).join("");
  }

  function renderResets(resetRequests) {
    if (!resetRequests?.length) return `<p class="sb-dev-muted">还没有密码重置申请。</p>`;
    return resetRequests.map((request) => `<div class="sb-dev-reset"><strong>${esc(request.name || request.email || "重置申请")}</strong><p>${esc(request.email || "")} · ${esc(request.status || "pending")}</p></div>`).join("");
  }

  function directPage() {
    let page = document.querySelector("#sbDirectPage");
    if (!page) {
      page = document.createElement("section");
      page.id = "sbDirectPage";
      document.querySelector("#appShell")?.appendChild(page);
    }
    document.body.classList.add("studybridge-secondary-page", "sb-direct-mode");
    document.body.classList.remove("sb-study-mode", "creator-clean-mode");
    document.body.dataset.studybridgeActivePage = "developer";
    page.hidden = false;
    document.querySelectorAll(".topbar,#scheduleDashboard,#chatArea,#quickPrompts,#chatForm,#developerPanel").forEach((node) => { node.hidden = true; });
    return page;
  }

  async function renderDeveloper() {
    installDeveloperStyle();
    const page = directPage();
    page.innerHTML = `<div class="sb-head"><div><p class="sb-muted" style="margin:0;font-weight:900">CREATOR CONSOLE</p><h1>开发者端</h1><p>管理邀请码、用户、系统状态和密码重置申请。</p></div><button class="sb-btn" type="button" data-sb-route="study">返回学习区</button></div><div class="sb-body"><section class="sb-card">正在读取开发者数据...</section></div>`;
    const body = page.querySelector(".sb-body");
    const [overview, system] = await Promise.all([
      api("/api/admin/overview").catch((error) => ({ error:error.message, invites:[], users:[], resetRequests:[] })),
      api("/api/admin/system-status").catch((error) => ({ error:error.message }))
    ]);
    const invites = overview.invites || [];
    const users = overview.users || [];
    const resets = overview.resetRequests || [];
    body.innerHTML = `<section class="sb-card"><div class="sb-dev-row"><div><h3 style="margin:0">系统状态</h3><p class="sb-dev-muted" style="margin:4px 0 0">检测完成：${esc(new Date().toLocaleString("zh-CN", { hour12:false }))}</p></div><button class="sb-btn" type="button" id="sbDevRefresh">检测</button></div><div class="sb-dev-status-grid" style="margin-top:12px">${statusCards(system)}</div></section><section class="sb-dev-split"><article class="sb-card"><h3 style="margin-top:0">邀请码</h3><form class="sb-row" id="sbInviteRestoreForm"><input name="label" placeholder="备注：例如 Kevin / ECO101 小组"><input name="maxUses" type="number" min="1" max="100" value="1" style="max-width:120px"><select name="role" style="max-width:150px"><option value="student">普通用户</option><option value="co-admin">co-admin</option></select><button class="sb-btn primary" type="submit">生成邀请码</button></form><div class="sb-list" style="margin-top:12px">${renderInvites(invites)}</div></article><article class="sb-card"><h3 style="margin-top:0">用户</h3><div class="sb-list">${renderUsers(users)}</div></article></section><section class="sb-card" style="margin-top:14px"><h3 style="margin-top:0">密码重置申请</h3>${renderResets(resets)}</section>`;
  }

  async function copyText(text) {
    try { await navigator.clipboard?.writeText(text); return true; }
    catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    }
  }

  installComposerLayout();
  new MutationObserver(installComposerLayout).observe(document.documentElement, { childList:true, subtree:true });

  document.addEventListener("click", async (event) => {
    const developerTarget = event.target.closest?.('[data-sb-route="developer"],#creatorViewButton');
    if (developerTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      renderDeveloper().catch(console.error);
      return;
    }
    const refresh = event.target.closest?.("#sbDevRefresh");
    if (refresh) {
      event.preventDefault();
      refresh.textContent = "检测中...";
      renderDeveloper().catch(console.error);
      return;
    }
    const copy = event.target.closest?.("[data-copy-code]");
    if (copy) {
      event.preventDefault();
      await copyText(copy.dataset.copyCode || "");
      copy.textContent = "已复制";
      return;
    }
    const toggle = event.target.closest?.("[data-toggle-invite]");
    if (toggle) {
      event.preventDefault();
      toggle.disabled = true;
      await api(`/api/admin/invites/${encodeURIComponent(toggle.dataset.toggleInvite || "")}`, { method:"PATCH", body:JSON.stringify({ active: toggle.dataset.nextActive === "true" }) });
      await renderDeveloper();
    }
  }, true);

  document.addEventListener("submit", async (event) => {
    if (event.target?.id !== "sbInviteRestoreForm") return;
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    await api("/api/admin/invites", { method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) });
    await renderDeveloper();
  }, true);
})();
