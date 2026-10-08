(() => {
  const VERSION = "20261008-direct-pages-1.0.59";
  if (window.__studybridgeDirectPages === VERSION) return;
  window.__studybridgeDirectPages = VERSION;

  const routeSelectors = [
    ["profile", "#profileCard,#editProfileButton,#openProfilePageButton,.profile-card"],
    ["community", "#openSchoolCommunityButton,.community-entry"],
    ["classmates", "#openClassmatesButton,.classmates-entry"],
    ["email", "#openEmailReplyButton,.email-helper-entry"],
    ["schedule", "#openScheduleButton,.schedule-entry"],
    ["study", "#openStudyAreaButton,.study-entry,#studentViewButton"],
    ["developer", "#creatorViewButton"]
  ];

  const pageMeta = {
    profile: ["PERSONAL PROFILE", "个人资料", "头像、背景、学校、专业和 SB ID 都在这里管理。"],
    community: ["COMMUNITY", "社区", "查看全部社区，也可以按学校或专业进入频道。"],
    classmates: ["CLASSMATES", "同学", "通过 SB ID 发送好友申请，通过后可以聊天。"],
    email: ["EMAIL COACH", "邮件助手", "粘贴邮件内容，StudyBridge 会帮你整理英文回复。"],
    schedule: ["SCHEDULE", "时间表", "管理课程、作业、考试和 deadline。"],
    developer: ["CREATOR CONSOLE", "开发者端", "管理邀请码、用户、系统状态和密码重置申请。"]
  };

  const sidebarEntries = [
    ["community", "社", "社区", "全部、学校和专业频道"],
    ["classmates", "友", "同学", "SB ID 申请和聊天"],
    ["email", "信", "邮件助手", "理解邮件并生成英文回复"],
    ["schedule", "时", "时间表", "Deadline 和课程提醒"],
    ["study", "学", "学习区", "课程资料、AI 对话和复习计划"]
  ];

  let activeRoute = "";
  let renderToken = 0;
  let classmateState = { selectedId: "", timer: 0 };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || "Request failed.");
    return payload;
  }

  function installStyles() {
    if ($("#studybridge-direct-pages-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-direct-pages-style";
    style.textContent = `
      html, body { scroll-behavior: auto !important; }
      .app-shell { overflow: hidden !important; }
      .sidebar {
        overflow-y: auto !important;
        scroll-behavior: auto !important;
        overscroll-behavior: contain !important;
      }
      .workspace {
        min-width: 0 !important;
        overflow: hidden !important;
      }
      body.sb-direct-page #workspacePage {
        display: block !important;
        height: 100vh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        background:
          linear-gradient(rgba(226,236,246,.72) 1px, transparent 1px),
          linear-gradient(90deg, rgba(226,236,246,.72) 1px, transparent 1px),
          #f4f7fb !important;
        background-size: 34px 34px !important;
      }
      body.sb-direct-page #workspacePage > .topbar,
      body.sb-direct-page #workspacePage > #scheduleDashboard,
      body.sb-direct-page #workspacePage > #chatArea,
      body.sb-direct-page #workspacePage > #quickPrompts,
      body.sb-direct-page #workspacePage > #chatForm,
      body.sb-direct-page #workspacePage > #developerPanel {
        display: none !important;
      }
      body.sb-direct-study #workspacePage {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto !important;
        height: 100vh !important;
        overflow: hidden !important;
      }
      body.sb-direct-study #workspacePage > .topbar,
      body.sb-direct-study #workspacePage > #scheduleDashboard,
      body.sb-direct-study #workspacePage > #chatArea,
      body.sb-direct-study #workspacePage > #quickPrompts,
      body.sb-direct-study #workspacePage > #chatForm {
        display: revert !important;
        visibility: visible !important;
      }
      body.sb-direct-study #workspacePage > #chatArea {
        display: flex !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        padding-bottom: 28px !important;
      }
      #sbDirectPage {
        display: block;
        min-height: 100vh;
        padding: 28px;
        color: #0b2344;
      }
      #sbDirectPage[hidden] { display: none !important; }
      .sb-direct-head {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        max-width: 1180px;
        margin: 0 auto 18px;
        padding-bottom: 16px;
        border-bottom: 1px solid #d7e0ec;
      }
      .sb-direct-head p { margin: 0; color: #2f7d62; font-size: 12px; font-weight: 900; text-transform: uppercase; }
      .sb-direct-head h2 { margin: 3px 0; font-size: 28px; line-height: 1.1; }
      .sb-direct-head span, .sb-muted { color: #52617a; font-size: 13px; }
      .sb-direct-body {
        display: grid;
        gap: 14px;
        max-width: 1180px;
        margin: 0 auto;
        padding-bottom: 80px;
      }
      .sb-card {
        border: 1px solid #d7e0ec;
        border-radius: 8px;
        background: rgba(255,255,255,.96);
        box-shadow: 0 12px 28px rgba(25,36,58,.05);
        padding: 16px;
      }
      .sb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
      .sb-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .sb-list { display: grid; gap: 9px; }
      .sb-item {
        display: grid;
        gap: 4px;
        padding: 11px 12px;
        border: 1px solid #dfe7f1;
        border-radius: 8px;
        background: #fbfdff;
      }
      .sb-item.clickable { cursor: pointer; }
      .sb-item.active { border-color: #2f7d62; box-shadow: inset 3px 0 0 #2f7d62; }
      .sb-form { display: grid; gap: 10px; }
      .sb-form label { display: grid; gap: 5px; color: #52617a; font-size: 12px; font-weight: 850; }
      .sb-form input, .sb-form textarea, .sb-form select, .sb-row input, .sb-row select {
        width: 100%;
        min-height: 42px;
        border: 1px solid #d7e0ec;
        border-radius: 8px;
        padding: 10px 12px;
        font: inherit;
        color: #0b2344;
        background: white;
      }
      .sb-form textarea { min-height: 120px; resize: vertical; }
      .sb-btn {
        display: inline-grid;
        place-items: center;
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid #d7e0ec;
        border-radius: 8px;
        background: white;
        color: #0b2344;
        font: inherit;
        font-weight: 850;
        cursor: pointer;
      }
      .sb-btn.primary { border-color: transparent; color: white; background: linear-gradient(135deg,#1f3a5f,#2f7d62); }
      .sb-btn.danger { color: #b42318; }
      .sb-pill { display: inline-grid; place-items: center; min-height: 24px; padding: 0 9px; border-radius: 999px; background: rgba(47,125,98,.1); color: #2f7d62; font-size: 12px; font-weight: 850; }
      .sb-cover { min-height: 150px; border-radius: 8px; background: linear-gradient(135deg,#1f3a5f,#65ad8d); background-size: cover; background-position: center; }
      .sb-avatar { width: 76px; height: 76px; border: 4px solid white; border-radius: 10px; background: linear-gradient(135deg,#1f3a5f,#2f7d62); color: white; display: grid; place-items: center; font-size: 24px; font-weight: 900; overflow: hidden; }
      .sb-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .sb-chat-box { display: grid; grid-template-rows: minmax(320px, 1fr) auto; min-height: 560px; }
      .sb-messages { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding: 12px; background: #f7faff; border: 1px solid #dfe7f1; border-radius: 8px; }
      .sb-message { max-width: 72%; padding: 10px 12px; border: 1px solid #d7e0ec; border-radius: 8px; background: white; }
      .sb-message.mine { margin-left: auto; background: #eef4ff; }
      .sb-route-entry, #profileCard, #editProfileButton, #studentViewButton, #creatorViewButton {
        cursor: pointer !important;
        pointer-events: auto !important;
      }
      .sb-route-entry.active, #profileCard.active, #studentViewButton.active, #creatorViewButton.active {
        border-color: #2f7d62 !important;
      }
      .sb-direct-nav {
        display: grid;
        gap: 10px;
        margin: 14px 0;
      }
      .sb-direct-nav-card {
        width: 100%;
        min-height: 54px;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        padding: 9px 12px;
        border: 1px solid #d7e0ec;
        border-radius: 8px;
        background: #fff;
        color: #0b2344;
        text-align: left;
        font: inherit;
      }
      .sb-direct-nav-card:hover,
      .sb-direct-nav-card.active {
        border-color: #2f7d62;
      }
      .sb-direct-nav-icon {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        color: white;
        background: linear-gradient(135deg, #1f3a5f, #2f7d62);
        font-weight: 900;
      }
      .sb-direct-nav-card strong {
        display: block;
        line-height: 1.12;
      }
      .sb-direct-nav-card span {
        display: block;
        margin-top: 2px;
        color: #52617a;
        font-size: 12px;
        line-height: 1.25;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureSidebarNav() {
    const sidebar = $(".sidebar");
    if (!sidebar || $("#sbDirectNav", sidebar)) return;
    const nav = document.createElement("nav");
    nav.id = "sbDirectNav";
    nav.className = "sb-direct-nav";
    nav.setAttribute("aria-label", "StudyBridge 功能区");
    nav.innerHTML = sidebarEntries.map(([route, icon, title, subtitle]) => `
      <button class="sb-direct-nav-card sb-route-entry ${route}-entry" type="button" data-sb-direct-route="${route}">
        <span class="sb-direct-nav-icon">${escapeHtml(icon)}</span>
        <span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></span>
      </button>
    `).join("");

    const roleSwitch = $("#roleSwitch", sidebar);
    const profileCard = $("#profileCard", sidebar);
    if (roleSwitch) sidebar.insertBefore(nav, roleSwitch);
    else if (profileCard?.nextSibling) sidebar.insertBefore(nav, profileCard.nextSibling);
    else sidebar.appendChild(nav);
  }

  function workspace() {
    const root = $("#workspacePage") || $(".workspace");
    if (!root) return null;
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.visibility = "visible";
    root.style.opacity = "1";
    return root;
  }

  function directPage() {
    const root = workspace();
    if (!root) return null;
    let page = $("#sbDirectPage", root);
    if (!page) {
      page = document.createElement("section");
      page.id = "sbDirectPage";
      root.appendChild(page);
    }
    return page;
  }

  function setStatus(message) {
    const status = $("#statusLine");
    if (status) status.textContent = message;
  }

  function setActive(route) {
    activeRoute = route;
    routeSelectors.forEach(([name, selector]) => {
      $$(selector).forEach((node) => {
        node.classList.toggle("active", name === route);
        node.classList.add("sb-route-entry");
        node.dataset.sbRoute = name;
        if (node.tagName !== "BUTTON") node.setAttribute("role", "button");
        if (node.tagName !== "BUTTON" && !node.hasAttribute("tabindex")) node.setAttribute("tabindex", "0");
      });
    });
    $("#studentViewButton")?.classList.toggle("active", route !== "developer");
    $("#creatorViewButton")?.classList.toggle("active", route === "developer");
  }

  function skeleton(route, bodyHtml) {
    const page = directPage();
    const meta = pageMeta[route] || pageMeta.profile;
    if (!page) return null;
    page.hidden = false;
    page.innerHTML = `
      <header class="sb-direct-head">
        <div>
          <p>${escapeHtml(meta[0])}</p>
          <h2>${escapeHtml(meta[1])}</h2>
          <span>${escapeHtml(meta[2])}</span>
        </div>
        <button class="sb-btn" type="button" data-sb-direct-route="study">返回学习区</button>
      </header>
      <div class="sb-direct-body">${bodyHtml}</div>
    `;
    return page;
  }

  function showDirectShell(route) {
    clearInterval(classmateState.timer);
    document.body.classList.add("sb-direct-page");
    document.body.classList.remove("sb-direct-study");
    const page = directPage();
    if (page) page.hidden = false;
    setActive(route);
    setStatus("Page opened.");
    localStorage.setItem("studybridgeLastRoute", route);
  }

  function openStudy() {
    clearInterval(classmateState.timer);
    const page = directPage();
    if (page) page.hidden = true;
    document.body.classList.remove("sb-direct-page");
    document.body.classList.add("sb-direct-study");
    workspace();
    ["#workspacePage > .topbar", "#workspacePage > #scheduleDashboard", "#workspacePage > #chatArea", "#workspacePage > #quickPrompts", "#workspacePage > #chatForm"].forEach((selector) => {
      const node = $(selector);
      if (node) {
        node.hidden = false;
        node.removeAttribute("hidden");
        node.style.display = "";
        node.style.visibility = "visible";
      }
    });
    const dev = $("#developerPanel");
    if (dev) {
      dev.hidden = true;
      dev.style.display = "none";
    }
    setActive("study");
    setStatus("Workspace is ready.");
    localStorage.setItem("studybridgeLastRoute", "study");
  }

  async function openProfile() {
    const token = ++renderToken;
    showDirectShell("profile");
    skeleton("profile", `<div class="sb-card">正在读取资料...</div>`);
    const data = await api("/api/me");
    if (token !== renderToken) return;
    const user = data.user || {};
    const profile = user.profile || {};
    const avatar = profile.avatarUrl ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="">` : escapeHtml((user.name || "S").slice(0, 1).toUpperCase());
    const coverStyle = profile.backgroundUrl ? `style="background-image:url('${escapeHtml(profile.backgroundUrl)}')"` : "";
    const page = skeleton("profile", `
      <section class="sb-grid">
        <article class="sb-card">
          <div class="sb-cover" ${coverStyle}></div>
          <div class="sb-row" style="margin-top:-42px;align-items:flex-end">
            <div class="sb-avatar">${avatar}</div>
            <div>
              <h3 style="margin:0">${escapeHtml(user.name || "StudyBridge Student")}</h3>
              <p class="sb-muted">${escapeHtml(profile.school || "未填写学校")} · ${escapeHtml(profile.major || "未填写专业")}</p>
              <p><strong>SB ID:</strong> ${escapeHtml(profile.sbId || "未设置")}</p>
            </div>
          </div>
        </article>
        <article class="sb-card">
          <h3 style="margin-top:0">编辑资料</h3>
          <form class="sb-form" id="sbDirectProfileForm">
            <label>姓名<input name="name" value="${escapeHtml(user.name || "")}"></label>
            <label>学校<input name="school" value="${escapeHtml(profile.school || "")}"></label>
            <label>专业<input name="major" value="${escapeHtml(profile.major || "")}"></label>
            <label>SB ID<input name="sbId" value="${escapeHtml(profile.sbId || "")}"></label>
            <label>头像图片链接<input name="avatarUrl" value="${escapeHtml(profile.avatarUrl || "")}"></label>
            <label>背景图片链接<input name="backgroundUrl" value="${escapeHtml(profile.backgroundUrl || "")}"></label>
            <button class="sb-btn primary" type="submit">保存资料</button>
            <p class="sb-muted" id="sbDirectProfileMessage"></p>
          </form>
        </article>
      </section>
    `);
    $("#sbDirectProfileForm", page)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const msg = $("#sbDirectProfileMessage", page);
      msg.textContent = "保存中...";
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      await api("/api/me/profile", { method: "PUT", body });
      msg.textContent = "已保存。";
      setTimeout(openProfile, 300);
    });
  }

  async function openCommunity() {
    const token = ++renderToken;
    showDirectShell("community");
    skeleton("community", `<div class="sb-card">正在读取社区...</div>`);
    const [me, community] = await Promise.all([
      api("/api/me").catch(() => ({})),
      api("/api/community").catch(() => ({ posts: [] }))
    ]);
    if (token !== renderToken) return;
    const profile = me.user?.profile || {};
    const posts = community.posts || community.items || [];
    const schools = [...new Set([profile.school, "University of Toronto", "Centennial College", "University of British Columbia", "University of Waterloo"].filter(Boolean))];
    const majors = [...new Set([profile.major, "Business", "Engineering", "Computer Science", "Finance", "Economics"].filter(Boolean))];
    const page = skeleton("community", `
      <section class="sb-grid">
        <article class="sb-card">
          <h3 style="margin-top:0">选择频道</h3>
          <div class="sb-list">
            <button class="sb-item clickable active" type="button" data-channel="all"><strong>全部社区</strong><span class="sb-muted">所有公开讨论</span></button>
            <label class="sb-form">学校社区<select id="sbCommunitySchool">${schools.map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select></label>
            <label class="sb-form">专业社区<select id="sbCommunityMajor">${majors.map((m) => `<option>${escapeHtml(m)}</option>`).join("")}</select></label>
          </div>
        </article>
        <article class="sb-card">
          <h3 style="margin-top:0">发布</h3>
          <form class="sb-form" id="sbCommunityPostForm">
            <input name="title" placeholder="标题">
            <textarea name="content" placeholder="你想和大家聊什么？"></textarea>
            <button class="sb-btn primary" type="submit">发布</button>
            <p class="sb-muted" id="sbCommunityMessage"></p>
          </form>
        </article>
      </section>
      <section class="sb-card">
        <h3 style="margin-top:0">最新帖子</h3>
        <div class="sb-list">
          ${posts.length ? posts.map((post) => `<div class="sb-item"><strong>${escapeHtml(post.title || post.content || "社区讨论")}</strong><span class="sb-muted">${escapeHtml(post.authorName || post.author || "StudyBridge")} · ${escapeHtml(post.channel || post.school || post.major || "全部")}</span><p>${escapeHtml(post.content || "")}</p></div>`).join("") : `<p class="sb-muted">还没有帖子，先发一个开始讨论。</p>`}
        </div>
      </section>
    `);
    $("#sbCommunityPostForm", page)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      $("#sbCommunityMessage", page).textContent = "发布中...";
      await api("/api/community/posts", { method: "POST", body });
      $("#sbCommunityMessage", page).textContent = "已发布。";
      setTimeout(openCommunity, 250);
    });
  }

  async function openClassmates() {
    const token = ++renderToken;
    showDirectShell("classmates");
    skeleton("classmates", `<div class="sb-card">正在读取同学列表...</div>`);
    const data = await api("/api/classmates").catch((error) => ({ error: error.message, classmates: [], requests: [] }));
    if (token !== renderToken) return;
    const classmates = data.classmates || data.friends || [];
    const requests = data.requests || data.incomingRequests || [];
    const outgoing = data.outgoingRequests || [];
    const selected = classmates.find((item) => String(item.id) === String(classmateState.selectedId)) || classmates[0];
    if (selected) classmateState.selectedId = selected.id;
    const page = skeleton("classmates", `
      <section class="sb-grid" style="grid-template-columns:minmax(280px,.9fr) minmax(380px,1.5fr)">
        <article class="sb-card">
          <h3 style="margin-top:0">添加同学</h3>
          <form class="sb-row" id="sbClassmateRequestForm">
            <input name="sbId" placeholder="输入 SB ID，例如 adam2026">
            <button class="sb-btn primary" type="submit">发送申请</button>
          </form>
          <details style="margin-top:12px">
            <summary><strong>申请列表</strong>${requests.length ? ` <span class="sb-pill">${requests.length}</span>` : ""}</summary>
            <div class="sb-list" style="margin-top:10px">
              ${requests.length ? requests.map((req) => `<div class="sb-item"><strong>${escapeHtml(req.fromName || req.name || req.sbId || "同学")}</strong><div class="sb-row"><button class="sb-btn primary" data-accept-request="${escapeHtml(req.id)}" type="button">通过</button><button class="sb-btn" data-ignore-request="${escapeHtml(req.id)}" type="button">忽略</button></div></div>`).join("") : `<p class="sb-muted">暂无好友申请。</p>`}
              ${outgoing.length ? `<p class="sb-muted">已发送 ${outgoing.length} 个申请，等待对方通过。</p>` : ""}
            </div>
          </details>
          <h3>同学列表</h3>
          <div class="sb-list">
            ${classmates.length ? classmates.map((mate) => `<button class="sb-item clickable ${String(mate.id) === String(classmateState.selectedId) ? "active" : ""}" type="button" data-select-classmate="${escapeHtml(mate.id)}"><strong>${escapeHtml(mate.name || mate.sbId || "同学")}</strong><span class="sb-muted">SB ID: ${escapeHtml(mate.sbId || "")}</span></button>`).join("") : `<p class="sb-muted">还没有同学。输入对方 SB ID 发送申请。</p>`}
          </div>
        </article>
        <article class="sb-card sb-chat-box">
          <div>
            <p class="sb-muted" style="margin:0;font-weight:900">DIRECT CHAT</p>
            <h3 style="margin-top:0">${escapeHtml(selected?.name || "请选择一位同学")}</h3>
          </div>
          <div class="sb-messages" id="sbClassmateMessages"></div>
          <form class="sb-row" id="sbClassmateChatForm" style="margin-top:10px">
            <input name="message" placeholder="写一句话给同学" ${selected ? "" : "disabled"}>
            <button class="sb-btn primary" type="submit" ${selected ? "" : "disabled"}>发送</button>
          </form>
        </article>
      </section>
    `);

    async function loadMessages() {
      const box = $("#sbClassmateMessages", page);
      if (!box || !classmateState.selectedId) return;
      const chat = await api(`/api/classmates/${encodeURIComponent(classmateState.selectedId)}/messages`).catch(() => ({ messages: [] }));
      const messages = chat.messages || [];
      box.innerHTML = messages.length ? messages.map((msg) => `<div class="sb-message ${msg.mine || msg.sender === "me" ? "mine" : ""}"><div>${escapeHtml(msg.text || msg.message || "")}</div><span class="sb-muted">${escapeHtml(msg.createdAt ? new Date(msg.createdAt).toLocaleString("zh-CN") : "")}</span></div>`).join("") : `<p class="sb-muted">添加同学后，这里会显示你们的聊天。</p>`;
      box.scrollTop = box.scrollHeight;
    }
    await loadMessages();
    clearInterval(classmateState.timer);
    classmateState.timer = window.setInterval(loadMessages, 5000);

    page.addEventListener("click", async (event) => {
      const select = event.target.closest("[data-select-classmate]");
      if (select) {
        classmateState.selectedId = select.dataset.selectClassmate;
        openClassmates();
        return;
      }
      const accept = event.target.closest("[data-accept-request]");
      const ignore = event.target.closest("[data-ignore-request]");
      const id = accept?.dataset.acceptRequest || ignore?.dataset.ignoreRequest;
      if (id) {
        await api(`/api/classmate-requests/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: accept ? "accepted" : "ignored" } });
        openClassmates();
      }
    });
    $("#sbClassmateRequestForm", page)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      await api("/api/classmates", { method: "POST", body });
      openClassmates();
    });
    $("#sbClassmateChatForm", page)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (!body.message || !classmateState.selectedId) return;
      await api(`/api/classmates/${encodeURIComponent(classmateState.selectedId)}/messages`, { method: "POST", body });
      event.currentTarget.reset();
      loadMessages();
    });
  }

  async function openEmail() {
    showDirectShell("email");
    skeleton("email", `
      <section class="sb-grid">
        <article class="sb-card">
          <h3 style="margin-top:0">收到的邮件</h3>
          <form class="sb-form" id="sbEmailForm">
            <label>邮件原文<textarea name="email" placeholder="把老师、TA、学校办公室或同学发来的邮件粘贴在这里"></textarea></label>
            <label>你想怎么回复<textarea name="intent" placeholder="例如：我想礼貌申请延期 / 确认 meeting time / 解释我会晚交"></textarea></label>
            <label>语气<select name="tone"><option>专业、自然</option><option>礼貌、正式</option><option>简短直接</option></select></label>
            <button class="sb-btn primary" type="submit">生成回复</button>
          </form>
        </article>
        <article class="sb-card">
          <h3 style="margin-top:0">建议回复</h3>
          <textarea id="sbEmailOutput" style="width:100%;min-height:340px;border:1px solid #d7e0ec;border-radius:8px;padding:12px" placeholder="生成后会显示：邮件重点、需要注意的地方，以及一版可以直接修改发送的英文回复。"></textarea>
        </article>
      </section>
    `);
    $("#sbEmailForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = Object.fromEntries(new FormData(event.currentTarget).entries());
      const output = $("#sbEmailOutput");
      output.value = "正在整理回复...";
      const courses = await api("/api/courses").catch(() => ({ courses: [] }));
      const course = (courses.courses || [])[0];
      if (!course) {
        output.value = "请先创建一个课程，邮件助手会借用学习区 AI 来生成回复。";
        return;
      }
      const reply = await api(`/api/courses/${encodeURIComponent(course.id)}/chat`, {
        method: "POST",
        body: {
          mode: "assignment",
          message: `请帮我回复这封邮件。语气：${form.tone}\n我想表达：${form.intent}\n邮件原文：\n${form.email}`
        }
      });
      output.value = reply.reply || reply.message || "暂时没有生成内容。";
    });
  }

  async function openSchedule() {
    const token = ++renderToken;
    showDirectShell("schedule");
    skeleton("schedule", `<div class="sb-card">正在读取时间表...</div>`);
    const courses = await api("/api/courses").catch(() => ({ courses: [] }));
    if (token !== renderToken) return;
    const scheduleCourse = (courses.courses || []).find((course) => /schedule/i.test(course.title || ""));
    let docs = [];
    if (scheduleCourse) {
      const data = await api(`/api/courses/${encodeURIComponent(scheduleCourse.id)}/documents`).catch(() => ({ documents: [] }));
      docs = data.documents || [];
    }
    const items = docs.filter((doc) => /^\[SCHEDULE_ITEM\]/.test(doc.title || ""));
    const page = skeleton("schedule", `
      <section class="sb-grid">
        <article class="sb-card">
          <h3 style="margin-top:0">新增提醒</h3>
          <form class="sb-form" id="sbScheduleForm">
            <label>标题<input name="title" placeholder="ECO101 Essay 1"></label>
            <label>课程<input name="course" placeholder="ECO101"></label>
            <label>截止时间<input name="dueAt" type="datetime-local"></label>
            <label>平台/地点<input name="platform" placeholder="Quercus / Classroom / Online"></label>
            <button class="sb-btn primary" type="submit">保存提醒</button>
            <p class="sb-muted" id="sbScheduleMessage"></p>
          </form>
        </article>
        <article class="sb-card">
          <h3 style="margin-top:0">未完成</h3>
          <div class="sb-list">
            ${items.length ? items.map((doc) => `<div class="sb-item"><strong>${escapeHtml((doc.title || "").replace("[SCHEDULE_ITEM]", "").trim() || "提醒")}</strong><span class="sb-muted">${escapeHtml(doc.type || "Schedule")} · ${escapeHtml(doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("zh-CN") : "")}</span><p>${escapeHtml(doc.content || "")}</p></div>`).join("") : `<p class="sb-muted">暂时没有 upcoming deadline。添加作业、考试或课程提醒后会显示在这里。</p>`}
          </div>
        </article>
      </section>
    `);
    $("#sbScheduleForm", page)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = Object.fromEntries(new FormData(event.currentTarget).entries());
      const msg = $("#sbScheduleMessage", page);
      msg.textContent = "保存中...";
      let target = scheduleCourse;
      if (!target) {
        const created = await api("/api/courses", { method: "POST", body: { title: "Schedule & Deadlines", term: "StudyBridge planner" } });
        target = created.course;
      }
      const content = `Course: ${form.course || ""}\nTask: ${form.title || ""}\nDue: ${form.dueAt || ""}\nPlatform: ${form.platform || ""}\nStatus: pending`;
      await api(`/api/courses/${encodeURIComponent(target.id)}/documents`, {
        method: "POST",
        body: { title: `[SCHEDULE_ITEM] ${form.title || "Reminder"}`, content, type: "Schedule" }
      });
      msg.textContent = "已保存。";
      setTimeout(openSchedule, 250);
    });
  }

  async function openDeveloper() {
    const token = ++renderToken;
    showDirectShell("developer");
    skeleton("developer", `<div class="sb-card">正在读取开发者数据...</div>`);
    const [overview, status] = await Promise.all([
      api("/api/admin/overview").catch((error) => ({ error: error.message, invites: [], users: [] })),
      api("/api/admin/system-status").catch((error) => ({ error: error.message }))
    ]);
    if (token !== renderToken) return;
    const invites = overview.invites || [];
    const users = overview.users || [];
    const cards = status.cards || status.checks || [];
    const page = skeleton("developer", `
      <section class="sb-card">
        <div class="sb-row" style="justify-content:space-between">
          <h3 style="margin:0">系统状态</h3>
          <button class="sb-btn" type="button" id="sbDevRefresh">检测</button>
        </div>
        <div class="sb-grid" style="margin-top:12px">
          ${cards.length ? cards.map((card) => `<div class="sb-item"><strong>${escapeHtml(card.title || card.name || "检查项")}</strong><span class="sb-muted">${escapeHtml(card.status || card.value || "")}</span><p>${escapeHtml(card.detail || card.message || "")}</p></div>`).join("") : `<div class="sb-item"><strong>${overview.error || status.error ? "部分接口未读取成功" : "系统可访问"}</strong><span class="sb-muted">${escapeHtml(status.error || overview.error || "管理接口正常")}</span></div>`}
        </div>
      </section>
      <section class="sb-grid">
        <article class="sb-card">
          <h3 style="margin-top:0">邀请码</h3>
          <form class="sb-row" id="sbInviteForm">
            <input name="label" placeholder="备注：例如 Kevin / ECO101 小组">
            <input name="maxUses" type="number" min="1" max="100" value="1" style="max-width:120px">
            <select name="role" style="max-width:150px"><option value="student">普通用户</option><option value="co-admin">co-admin</option></select>
            <button class="sb-btn primary" type="submit">生成邀请码</button>
          </form>
          <div class="sb-list" style="margin-top:12px">
            ${invites.length ? invites.map((invite) => `<div class="sb-item"><strong>${escapeHtml(invite.code || "")}</strong><span class="sb-muted">${escapeHtml(invite.role || "user")} · ${escapeHtml(invite.label || "")} · ${escapeHtml(invite.usedCount ?? invite.uses ?? 0)}/${escapeHtml(invite.maxUses ?? 1)} used</span><div class="sb-row"><button class="sb-btn" data-copy="${escapeHtml(invite.code || "")}" type="button">复制</button></div></div>`).join("") : `<p class="sb-muted">还没有邀请码。</p>`}
          </div>
        </article>
        <article class="sb-card">
          <h3 style="margin-top:0">用户</h3>
          <div class="sb-list">
            ${users.length ? users.map((user) => `<div class="sb-item"><strong>${escapeHtml(user.name || user.email || "用户")}</strong><span class="sb-muted">${escapeHtml(user.email || "")} · ${escapeHtml(user.role || "student")}</span><span class="sb-pill">${escapeHtml(user.courseCount ?? 0)} courses</span></div>`).join("") : `<p class="sb-muted">暂无用户数据。</p>`}
          </div>
        </article>
      </section>
    `);
    $("#sbDevRefresh", page)?.addEventListener("click", openDeveloper);
    $("#sbInviteForm", page)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      await api("/api/admin/invites", { method: "POST", body });
      openDeveloper();
    });
    page.addEventListener("click", async (event) => {
      const copy = event.target.closest("[data-copy]");
      if (!copy) return;
      await navigator.clipboard?.writeText(copy.dataset.copy);
      copy.textContent = "已复制";
    });
  }

  function routeFromTarget(target) {
    const node = target.closest?.("[data-sb-direct-route],[data-sb-route],#profileCard,#editProfileButton,#openProfilePageButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton,#studentViewButton,#creatorViewButton,.profile-card,.community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry,.role-switch-button");
    if (!node) return "";
    if (node.dataset.sbDirectRoute) return node.dataset.sbDirectRoute;
    if (node.dataset.sbRoute) return node.dataset.sbRoute;
    if (node.id === "profileCard" || node.id === "editProfileButton" || node.id === "openProfilePageButton") return "profile";
    if (node.id === "openSchoolCommunityButton" || node.classList.contains("community-entry")) return "community";
    if (node.id === "openClassmatesButton" || node.classList.contains("classmates-entry")) return "classmates";
    if (node.id === "openEmailReplyButton" || node.classList.contains("email-helper-entry")) return "email";
    if (node.id === "openScheduleButton" || node.classList.contains("schedule-entry")) return "schedule";
    if (node.id === "openStudyAreaButton" || node.id === "studentViewButton" || node.classList.contains("study-entry")) return "study";
    if (node.id === "creatorViewButton") return "developer";
    return "";
  }

  function openRoute(route) {
    setStatus("Opening page...");
    Promise.resolve()
      .then(() => {
        if (route === "study") return openStudy();
        if (route === "profile") return openProfile();
        if (route === "community") return openCommunity();
        if (route === "classmates") return openClassmates();
        if (route === "email") return openEmail();
        if (route === "schedule") return openSchedule();
        if (route === "developer") return openDeveloper();
      })
      .catch((error) => {
        console.error("[StudyBridge direct pages]", error);
        showDirectShell(route || "profile");
        skeleton(route || "profile", `<div class="sb-card"><strong>页面加载失败</strong><p class="sb-muted">${escapeHtml(error.message || error)}</p></div>`);
      });
  }

  function handleClick(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  function handleKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    openRoute(route);
  }

  function decorate() {
    ensureSidebarNav();
    routeSelectors.forEach(([route, selector]) => {
      $$(selector).forEach((node) => {
        node.dataset.sbDirectRoute = route;
        node.classList.add("sb-route-entry");
        if (node.tagName !== "BUTTON") node.setAttribute("role", "button");
        if (node.tagName !== "BUTTON" && !node.hasAttribute("tabindex")) node.setAttribute("tabindex", "0");
      });
    });
    if (activeRoute) setActive(activeRoute);
  }

  function init() {
    installStyles();
    decorate();
    document.addEventListener("click", handleClick, true);
    document.addEventListener("pointerup", handleClick, true);
    document.addEventListener("keydown", handleKey, true);
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.studybridgeOpenDirectPage = openRoute;
    window.studybridgeDirectOpen = openRoute;

    const remembered = localStorage.getItem("studybridgeLastRoute");
    if (remembered && remembered !== "study") {
      window.setTimeout(() => openRoute(remembered), 600);
    } else {
      window.setTimeout(() => {
        document.body.classList.add("sb-direct-study");
        decorate();
      }, 600);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
