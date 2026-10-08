(() => {
  const VERSION = "20261008-direct-pages-1.0.83";
  if (window.__studybridgeDirectPagesVersion === VERSION) return;
  window.__studybridgeDirectPagesVersion = VERSION;

  const routes = {
    profile: ["个", "Profile", "个人资料、学校、专业和 SB ID"],
    community: ["社", "社区", "全部、学校和专业频道"],
    classmates: ["友", "同学", "SB ID 申请和聊天"],
    email: ["信", "邮件助手", "理解邮件并生成英文回复"],
    schedule: ["时", "时间表", "Deadline 和课程提醒"],
    study: ["学", "学习区", "课程资料、AI 对话和复习计划"],
    developer: ["创", "开发者端", "邀请码、用户和系统状态"]
  };

  let activeRoute = "study";
  let selectedClassmateId = "";
  let classmatePoll = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));

  function authToken() {
    return localStorage.getItem("studybridge_token") || localStorage.getItem("studybridge-token") || localStorage.getItem("token") || "";
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    const token = authToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, Object.assign({}, options, { headers, credentials: "include" }));
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (!response.ok) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
    return data;
  }

  function installStyle() {
    let style = $("#studybridgeDirectStyle");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridgeDirectStyle";
      document.head.appendChild(style);
    }
    style.textContent = `
      html, body { scroll-behavior:auto !important; }
      .sidebar { overflow-y:auto !important; scroll-behavior:auto !important; }
      .sb-direct-nav { display:grid; gap:10px; margin:14px 0; }
      .sb-nav-card { width:100%; min-height:54px; display:grid; grid-template-columns:36px minmax(0,1fr); align-items:center; gap:10px; padding:9px 12px; border:1px solid #d7e0ec; border-radius:8px; background:#fff; color:#0b2344; text-align:left; font:inherit; cursor:pointer; }
      .sb-nav-card:hover,.sb-nav-card.is-active { border-color:#2f7d62; background:#fbfffd; }
      .sb-nav-icon { width:36px; height:36px; display:grid; place-items:center; border-radius:8px; color:#fff; background:linear-gradient(135deg,#1f3a5f,#2f7d62); font-weight:900; }
      .sb-nav-card strong { display:block; line-height:1.15; }
      .sb-nav-card small { display:block; margin-top:2px; color:#52617a; line-height:1.25; }
      #sbDirectPage { min-height:100vh; padding:28px; color:#0b2344; overflow-y:auto; }
      #sbDirectPage[hidden] { display:none !important; }
      .sb-page-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; max-width:1180px; margin:0 auto 18px; padding-bottom:16px; border-bottom:1px solid #d7e0ec; }
      .sb-page-head p { margin:0; color:#2f7d62; font-size:12px; font-weight:900; text-transform:uppercase; }
      .sb-page-head h2 { margin:4px 0; font-size:28px; line-height:1.1; }
      .sb-muted { color:#52617a; font-size:13px; }
      .sb-body { max-width:1180px; margin:0 auto; display:grid; gap:14px; padding-bottom:90px; }
      .sb-card { border:1px solid #d7e0ec; border-radius:8px; background:rgba(255,255,255,.96); padding:16px; box-shadow:0 12px 28px rgba(25,36,58,.05); }
      .sb-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }
      .sb-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .sb-list { display:grid; gap:9px; }
      .sb-item { display:grid; gap:4px; padding:11px 12px; border:1px solid #dfe7f1; border-radius:8px; background:#fbfdff; text-align:left; }
      .sb-item.clickable { cursor:pointer; }
      .sb-item.active { border-color:#2f7d62; box-shadow:inset 3px 0 0 #2f7d62; }
      .sb-field,.sb-form input,.sb-form textarea,.sb-form select,.sb-row input,.sb-row select { width:100%; min-height:42px; border:1px solid #d7e0ec; border-radius:8px; padding:10px 12px; font:inherit; color:#0b2344; background:#fff; }
      .sb-form { display:grid; gap:10px; }
      .sb-form label { display:grid; gap:6px; font-size:12px; font-weight:850; color:#52617a; }
      .sb-form textarea { min-height:130px; resize:vertical; }
      .sb-btn { display:inline-grid; place-items:center; min-height:40px; padding:0 14px; border:1px solid #d7e0ec; border-radius:8px; background:#fff; color:#0b2344; font:inherit; font-weight:850; cursor:pointer; }
      .sb-btn.primary { border-color:transparent; color:#fff; background:linear-gradient(135deg,#1f3a5f,#2f7d62); }
      .sb-pill { display:inline-grid; place-items:center; min-height:24px; padding:0 9px; border-radius:999px; background:rgba(47,125,98,.1); color:#2f7d62; font-size:12px; font-weight:850; }
      .sb-cover,.sb-profile-cover { min-height:150px; border-radius:8px; background:linear-gradient(135deg,#1f3a5f,#65ad8d); background-size:cover; background-position:center; }
      .sb-avatar { width:76px; height:76px; border:4px solid #fff; border-radius:10px; background:linear-gradient(135deg,#1f3a5f,#2f7d62); color:#fff; display:grid; place-items:center; font-size:24px; font-weight:900; overflow:hidden; }
      .sb-avatar img { width:100%; height:100%; object-fit:cover; }
      .sb-peer-profile { overflow:hidden; padding:0; }
      .sb-peer-profile .sb-profile-cover { min-height:88px; border-radius:8px 8px 0 0; }
      .sb-peer-profile-body { display:flex; align-items:end; gap:14px; padding:0 14px 14px; margin-top:-34px; }
      .sb-peer-profile .sb-avatar { width:62px; height:62px; font-size:20px; }
      .sb-chat-box { display:grid; grid-template-rows:auto auto minmax(280px,1fr) auto; min-height:560px; }
      .sb-messages { display:flex; flex-direction:column; gap:10px; overflow-y:auto; padding:12px; background:#f7faff; border:1px solid #dfe7f1; border-radius:8px; }
      .sb-message { max-width:72%; padding:10px 12px; border:1px solid #d7e0ec; border-radius:8px; background:#fff; }
      .sb-message.mine { margin-left:auto; background:#eef4ff; }
      .sb-message p { margin:0 0 6px; white-space:pre-wrap; line-height:1.45; }
      .sb-chat-form { display:grid; grid-template-columns:minmax(0,1fr) 86px; gap:10px; margin-top:10px; }
      .sb-dev-status-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
      .sb-dev-dot { display:inline-block; width:9px; height:9px; border-radius:999px; margin-right:8px; background:#d9901f; vertical-align:1px; }
      .sb-dev-dot.ok { background:#2f8b6b; } .sb-dev-dot.bad { background:#c14646; }
      body.sb-direct-mode #workspacePage { display:block !important; height:100vh !important; overflow-y:auto !important; }
      body.sb-study-mode #workspacePage { display:grid !important; grid-template-rows:auto minmax(0,1fr) auto auto !important; height:100vh !important; overflow:hidden !important; }
      body.sb-study-mode #chatArea { min-height:0 !important; overflow-y:auto !important; padding-bottom:36px !important; }
      @media (max-width:900px) { #sbDirectPage { padding:16px; } .sb-page-head { flex-direction:column; } }
    `;
  }

  function workspace() { return $("#workspacePage"); }

  function ensureDirectPage() {
    const root = workspace();
    if (!root) return null;
    let page = $("#sbDirectPage", root);
    if (!page) {
      page = document.createElement("section");
      page.id = "sbDirectPage";
      page.hidden = true;
      root.appendChild(page);
    }
    return page;
  }

  function setStatus(text) {
    const node = $("#statusLine");
    if (node) node.textContent = text;
  }

  function mark(route) {
    activeRoute = route;
    $$("[data-sb-route]").forEach((node) => node.classList.toggle("is-active", node.dataset.sbRoute === route));
  }

  function ensureNav() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    $$(".sb-direct-nav", sidebar).forEach((nav, index) => { if (index > 0) nav.remove(); });
    let nav = $("#sbDirectNav", sidebar);
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "sbDirectNav";
      nav.className = "sb-direct-nav";
      nav.innerHTML = ["community", "classmates", "email", "schedule", "study"].map((route) => {
        const [icon, title, subtitle] = routes[route];
        return `<button class="sb-nav-card" type="button" data-sb-route="${route}"><span class="sb-nav-icon">${esc(icon)}</span><span><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span></button>`;
      }).join("");
      const roleSwitch = $("#roleSwitch", sidebar);
      const profile = $("#openProfilePageButton", sidebar) || $(".profile-card", sidebar);
      if (roleSwitch) sidebar.insertBefore(nav, roleSwitch);
      else if (profile?.nextSibling) sidebar.insertBefore(nav, profile.nextSibling);
      else sidebar.appendChild(nav);
    }
    const profileButton = $("#openProfilePageButton") || $("#profileCard") || $(".profile-card");
    if (profileButton) profileButton.dataset.sbRoute = "profile";
    const studentButton = $("#studentViewButton");
    if (studentButton) studentButton.dataset.sbRoute = "study";
    const developerButton = $("#creatorViewButton");
    if (developerButton) developerButton.dataset.sbRoute = "developer";
    mark(activeRoute);
  }

  function showStudy() {
    clearInterval(classmatePoll);
    const root = workspace();
    const page = ensureDirectPage();
    if (!root) return;
    if (page) { page.hidden = true; page.innerHTML = ""; }
    Array.from(root.children).forEach((child) => { if (child.id !== "sbDirectPage") child.style.display = ""; });
    const developerPanel = $("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    document.body.classList.remove("sb-direct-mode");
    document.body.classList.add("sb-study-mode");
    mark("study");
    localStorage.setItem("studybridgeLastRoute", "study");
    setStatus("Workspace is ready.");
  }

  function shell(route, title, subtitle, html) {
    clearInterval(classmatePoll);
    const root = workspace();
    const page = ensureDirectPage();
    if (!root || !page) return null;
    Array.from(root.children).forEach((child) => { if (child.id !== "sbDirectPage") child.style.display = "none"; });
    document.body.classList.add("sb-direct-mode");
    document.body.classList.remove("sb-study-mode");
    page.hidden = false;
    page.innerHTML = `<header class="sb-page-head"><div><p>${esc(routes[route]?.[1] || "StudyBridge")}</p><h2>${esc(title)}</h2><span class="sb-muted">${esc(subtitle)}</span></div><button class="sb-btn" type="button" data-sb-route="study">返回学习区</button></header><div class="sb-body">${html}</div>`;
    mark(route);
    localStorage.setItem("studybridgeLastRoute", route);
    setStatus("Page opened.");
    root.scrollTop = 0;
    return page;
  }

  function errorPage(route, error) {
    shell(route, routes[route]?.[1] || "页面", "页面加载时遇到问题。", `<section class="sb-card"><strong>页面加载失败</strong><p class="sb-muted">${esc(error.message || error)}</p></section>`);
  }

  function peerOf(mate) { return mate?.peer || mate?.user || mate?.profile || mate || {}; }
  function peerName(mate) {
    const peer = peerOf(mate);
    return peer.name || mate?.name || peer.email || mate?.email || peer.sbId || mate?.sbId || "同学";
  }
  function peerSbId(mate) {
    const peer = peerOf(mate);
    return peer.sbId || mate?.sbId || mate?.studentId || "未设置";
  }
  function peerSchoolMajor(mate) {
    const peer = peerOf(mate);
    return [peer.school, peer.major].filter(Boolean).join(" · ") || "未填写学校和专业";
  }
  function peerAvatar(mate) {
    const peer = peerOf(mate);
    return peer.avatarUrl ? `<img src="${esc(peer.avatarUrl)}" alt="">` : esc(peerName(mate).slice(0, 1).toUpperCase());
  }
  function peerCover(mate) {
    const peer = peerOf(mate);
    return peer.backgroundUrl ? `style="background-image:url('${esc(peer.backgroundUrl)}')"` : "";
  }
  function requestPerson(req) { return req?.from || req?.fromUser || req?.sender || req?.user || req || {}; }
  function messageText(msg) {
    return msg?.content ?? msg?.text ?? msg?.message ?? msg?.body ?? msg?.payload?.content ?? msg?.data?.content ?? "";
  }
  function displayTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12:false });
  }

  async function renderProfile() {
    const page = shell("profile", "个人资料", "头像、背景、学校、专业和 SB ID 都在这里管理。", `<section class="sb-card">正在读取资料...</section>`);
    try {
      const data = await api("/api/me");
      const user = data.user || {};
      const profile = user.profile || {};
      const avatar = profile.avatarUrl ? `<img src="${esc(profile.avatarUrl)}" alt="">` : esc((user.name || "S").slice(0, 1).toUpperCase());
      const cover = profile.backgroundUrl ? `style="background-image:url('${esc(profile.backgroundUrl)}')"` : "";
      $(".sb-body", page).innerHTML = `<section class="sb-grid"><article class="sb-card"><div class="sb-cover" ${cover}></div><div class="sb-row" style="margin-top:-42px;align-items:flex-end"><div class="sb-avatar">${avatar}</div><div><h3 style="margin:0">${esc(user.name || "StudyBridge Student")}</h3><p class="sb-muted">${esc(profile.school || "未填写学校")} · ${esc(profile.major || "未填写专业")}</p><p><strong>SB ID:</strong> ${esc(profile.sbId || "未设置")}</p></div></div></article><article class="sb-card"><h3 style="margin-top:0">编辑资料</h3><form class="sb-form" id="sbProfileForm"><label>姓名<input name="name" value="${esc(user.name || "")}"></label><label>学校<input name="school" value="${esc(profile.school || "")}"></label><label>专业<input name="major" value="${esc(profile.major || "")}"></label><label>SB ID<input name="sbId" value="${esc(profile.sbId || "")}"></label><label>头像图片链接<input name="avatarUrl" value="${esc(profile.avatarUrl || "")}"></label><label>背景图片链接<input name="backgroundUrl" value="${esc(profile.backgroundUrl || "")}"></label><button class="sb-btn primary" type="submit">保存资料</button><p class="sb-muted" id="sbProfileMsg"></p></form></article></section>`;
      $("#sbProfileForm", page).addEventListener("submit", async (event) => {
        event.preventDefault();
        const msg = $("#sbProfileMsg", page);
        msg.textContent = "保存中...";
        await api("/api/me/profile", { method:"PUT", body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
        msg.textContent = "已保存。";
        setTimeout(renderProfile, 250);
      });
    } catch (error) { errorPage("profile", error); }
  }

  async function renderCommunity() {
    const page = shell("community", "社区", "全部社区、学校频道和专业频道都可以查看。", `<section class="sb-card">正在读取社区...</section>`);
    try {
      const [me, community] = await Promise.all([api("/api/me").catch(() => ({})), api("/api/community").catch(() => ({ posts: [] }))]);
      const profile = me.user?.profile || {};
      const posts = community.posts || community.items || [];
      const schools = [...new Set([profile.school, "University of Toronto", "Centennial College", "University of British Columbia", "University of Waterloo", "New York University", "UCLA"].filter(Boolean))];
      const majors = [...new Set([profile.major, "Business", "Engineering", "Computer Science", "Finance", "Economics", "Nursing"].filter(Boolean))];
      $(".sb-body", page).innerHTML = `<section class="sb-grid"><article class="sb-card"><h3 style="margin-top:0">选择频道</h3><div class="sb-list"><div class="sb-item"><strong>全部社区</strong><span class="sb-muted">所有公开讨论</span></div><label class="sb-form">学校社区<select>${schools.map((item) => `<option>${esc(item)}</option>`).join("")}</select></label><label class="sb-form">专业社区<select>${majors.map((item) => `<option>${esc(item)}</option>`).join("")}</select></label></div></article><article class="sb-card"><h3 style="margin-top:0">发布</h3><form class="sb-form" id="sbCommunityForm"><input name="topic" placeholder="标题 / 主题"><textarea name="content" placeholder="你想和大家聊什么？"></textarea><button class="sb-btn primary" type="submit">发布</button><p class="sb-muted" id="sbCommunityMsg"></p></form></article></section><section class="sb-card"><h3 style="margin-top:0">最新帖子</h3><div class="sb-list">${posts.length ? posts.map((post) => `<article class="sb-item"><strong>${esc(post.topic || post.title || "社区讨论")}</strong><span class="sb-muted">${esc(post.authorName || post.author || "StudyBridge")} · ${esc(post.channel || post.channelLabel || "全部社区")}</span><p>${esc(post.content || post.body || post.text || "")}</p></article>`).join("") : `<p class="sb-muted">还没有帖子，先发一个开始讨论。</p>`}</div></section>`;
      $("#sbCommunityForm", page).addEventListener("submit", async (event) => {
        event.preventDefault();
        $("#sbCommunityMsg", page).textContent = "发布中...";
        await api("/api/community/posts", { method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
        renderCommunity();
      });
    } catch (error) { errorPage("community", error); }
  }

  async function renderClassmates() {
    const page = shell("classmates", "同学", "通过 SB ID 发送好友申请，通过后可以聊天。", `<section class="sb-card">正在读取同学列表...</section>`);
    try {
      const data = await api("/api/classmates");
      const classmates = data.classmates || data.friends || [];
      const incoming = Array.isArray(data.requests) ? data.requests : (data.requests?.incoming || data.incomingRequests || []);
      const outgoing = data.requests?.outgoing || data.outgoingRequests || [];
      const candidates = data.candidates || [];
      const selected = classmates.find((item) => String(item.id) === String(selectedClassmateId)) || classmates[0] || null;
      if (selected) selectedClassmateId = selected.id;
      $(".sb-body", page).innerHTML = `<section class="sb-grid" style="grid-template-columns:minmax(300px,.9fr) minmax(420px,1.55fr)"><article class="sb-card"><h3 style="margin-top:0">添加同学</h3><p class="sb-muted">当前学校：${esc(data.school || "未填写")}</p><form class="sb-chat-form" id="sbClassmateAddForm"><input name="sbId" placeholder="输入 SB ID，例如 adam2026"><button class="sb-btn primary" type="submit">发送申请</button></form><details style="margin-top:12px"><summary><strong>申请列表</strong>${incoming.length ? ` <span class="sb-pill">${incoming.length}</span>` : ""}</summary><div class="sb-list" style="margin-top:10px">${incoming.length ? incoming.map((req) => { const person = requestPerson(req); return `<div class="sb-item"><strong>${esc(person.name || person.email || person.sbId || "同学")}</strong><span class="sb-muted">SB ID: ${esc(person.sbId || req.sbId || "未设置")}</span><div class="sb-row"><button class="sb-btn primary" data-request-action="accept" data-request-id="${esc(req.id)}" type="button">通过</button><button class="sb-btn" data-request-action="ignore" data-request-id="${esc(req.id)}" type="button">忽略</button></div></div>`; }).join("") : `<p class="sb-muted">暂无好友申请。</p>`}${outgoing.length ? `<p class="sb-muted">已发送 ${outgoing.length} 个申请，等待对方通过。</p>` : ""}</div></details><h3>同学列表</h3><div class="sb-list">${classmates.length ? classmates.map((mate) => `<button class="sb-item clickable ${String(mate.id) === String(selectedClassmateId) ? "active" : ""}" type="button" data-classmate-id="${esc(mate.id)}"><strong>${esc(peerName(mate))}</strong><span class="sb-muted">SB ID: ${esc(peerSbId(mate))}</span>${mate.lastMessage?.content ? `<span class="sb-muted">${esc(mate.lastMessage.content)}</span>` : ""}</button>`).join("") : `<p class="sb-muted">还没有同学。输入对方 SB ID 发送申请。</p>`}</div>${candidates.length ? `<h3>同校用户</h3><div class="sb-list">${candidates.map((item) => `<div class="sb-item"><strong>${esc(item.name || "同学")}</strong><span class="sb-muted">SB ID: ${esc(item.sbId || "未设置")}</span></div>`).join("")}</div>` : ""}</article><article class="sb-card sb-chat-box"><div class="sb-row" style="justify-content:space-between"><div><p class="sb-muted" style="margin:0;font-weight:900">DIRECT CHAT</p><h3 style="margin:0">${esc(selected ? peerName(selected) : "请选择一位同学")}</h3></div><button class="sb-btn" type="button" id="sbClassmateRefresh">刷新</button></div>${selected ? `<article class="sb-peer-profile"><div class="sb-profile-cover" ${peerCover(selected)}></div><div class="sb-peer-profile-body"><div class="sb-avatar">${peerAvatar(selected)}</div><div><h3 style="margin:0">${esc(peerName(selected))}</h3><p class="sb-muted" style="margin:4px 0">${esc(peerSchoolMajor(selected))}</p><span class="sb-pill">SB ID: ${esc(peerSbId(selected))}</span></div></div></article>` : ""}<div class="sb-messages" id="sbClassmateMessages"></div><form class="sb-chat-form" id="sbClassmateChatForm"><input name="content" placeholder="写一句话给同学" ${selected ? "" : "disabled"}><button class="sb-btn primary" type="submit" ${selected ? "" : "disabled"}>发送</button></form></article></section>`;
      async function loadMessages() {
        const box = $("#sbClassmateMessages", page);
        if (!box || !selectedClassmateId) return;
        const chat = await api(`/api/classmates/${encodeURIComponent(selectedClassmateId)}/messages`).catch(() => ({ messages: [] }));
        const messages = chat.messages || [];
        box.innerHTML = messages.length ? messages.map((msg) => { const text = messageText(msg); return `<div class="sb-message ${msg.mine || msg.sender === "me" ? "mine" : ""}"><p>${esc(text || "（这条历史消息没有保存正文）")}</p><span class="sb-muted">${esc(displayTime(msg.createdAt || msg.time || msg.timestamp))}</span></div>`; }).join("") : `<p class="sb-muted">还没有聊天记录。</p>`;
        box.scrollTop = box.scrollHeight;
      }
      await loadMessages();
      classmatePoll = window.setInterval(loadMessages, 5000);
      page.addEventListener("click", async (event) => {
        const mate = event.target.closest("[data-classmate-id]");
        if (mate) { selectedClassmateId = mate.dataset.classmateId; renderClassmates(); return; }
        const refresh = event.target.closest("#sbClassmateRefresh");
        if (refresh) { renderClassmates(); return; }
        const action = event.target.closest("[data-request-action]");
        if (action) {
          await api(`/api/classmate-requests/${encodeURIComponent(action.dataset.requestId)}`, { method:"PATCH", body:JSON.stringify({ action:action.dataset.requestAction }) });
          renderClassmates();
        }
      });
      $("#sbClassmateAddForm", page).addEventListener("submit", async (event) => {
        event.preventDefault();
        await api("/api/classmates", { method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
        event.currentTarget.reset();
        renderClassmates();
      });
      $("#sbClassmateChatForm", page).addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(event.currentTarget).entries());
        if (!body.content || !selectedClassmateId) return;
        await api(`/api/classmates/${encodeURIComponent(selectedClassmateId)}/messages`, { method:"POST", body:JSON.stringify(body) });
        event.currentTarget.reset();
        loadMessages();
      });
    } catch (error) { errorPage("classmates", error); }
  }

  async function renderEmail() {
    const page = shell("email", "邮件回复助手", "粘贴邮件内容，StudyBridge 会帮你整理英文回复。", `<section class="sb-grid"><article class="sb-card"><h3 style="margin-top:0">收到的邮件</h3><form class="sb-form" id="sbEmailForm"><label>邮件原文<textarea name="email" placeholder="把老师、TA、学校办公室或同学发来的邮件粘贴在这里"></textarea></label><label>你想怎么回复<textarea name="intent" placeholder="例如：我想礼貌申请延期 / 确认 meeting time / 解释我会晚交"></textarea></label><label>语气<select name="tone"><option>专业、自然</option><option>礼貌、正式</option><option>简短直接</option></select></label><button class="sb-btn primary" type="submit">生成回复</button></form></article><article class="sb-card"><h3 style="margin-top:0">建议回复</h3><textarea id="sbEmailOutput" class="sb-field" style="min-height:360px" placeholder="生成后会显示邮件重点和英文回复。"></textarea></article></section>`);
    $("#sbEmailForm", page).addEventListener("submit", async (event) => {
      event.preventDefault();
      const output = $("#sbEmailOutput", page);
      output.value = "正在整理回复...";
      try {
        const form = Object.fromEntries(new FormData(event.currentTarget).entries());
        const courses = await api("/api/courses").catch(() => ({ courses: [] }));
        const course = (courses.courses || [])[0];
        if (!course) { output.value = "请先创建一个课程，邮件助手会借用学习区 AI 来生成回复。"; return; }
        const reply = await api(`/api/courses/${encodeURIComponent(course.id)}/chat`, { method:"POST", body:JSON.stringify({ mode:"assignment", message:`请帮我回复这封邮件。语气：${form.tone}\n我想表达：${form.intent}\n邮件原文：\n${form.email}` }) });
        output.value = reply.reply || reply.message || "暂时没有生成内容。";
      } catch (error) { output.value = `生成失败：${error.message}`; }
    });
  }

  async function renderSchedule() {
    const page = shell("schedule", "时间表", "管理课程、作业、考试和 deadline。", `<section class="sb-card">正在读取时间表...</section>`);
    try {
      const courses = await api("/api/courses").catch(() => ({ courses: [] }));
      const scheduleCourse = (courses.courses || []).find((course) => /schedule/i.test(course.name || course.title || ""));
      let documents = [];
      if (scheduleCourse) {
        const data = await api(`/api/courses/${encodeURIComponent(scheduleCourse.id)}/documents`).catch(() => ({ documents: [] }));
        documents = data.documents || [];
      }
      const items = documents.filter((doc) => /^\[SCHEDULE_ITEM\]/.test(doc.title || ""));
      $(".sb-body", page).innerHTML = `<section class="sb-grid"><article class="sb-card"><h3 style="margin-top:0">新增提醒</h3><form class="sb-form" id="sbScheduleForm"><label>标题<input name="title" placeholder="ECO101 Essay 1"></label><label>课程<input name="course" placeholder="ECO101"></label><label>截止时间<input name="dueAt" type="datetime-local"></label><label>平台/地点<input name="platform" placeholder="Quercus / Classroom / Online"></label><button class="sb-btn primary" type="submit">保存提醒</button><p class="sb-muted" id="sbScheduleMsg"></p></form></article><article class="sb-card"><h3 style="margin-top:0">未完成</h3><div class="sb-list">${items.length ? items.map((doc) => `<div class="sb-item"><strong>${esc((doc.title || "").replace("[SCHEDULE_ITEM]", "").trim() || "提醒")}</strong><span class="sb-muted">${esc(doc.type || "Schedule")}</span><p>${esc(doc.content || "")}</p></div>`).join("") : `<p class="sb-muted">暂时没有 upcoming deadline。添加作业、考试或课程提醒后会显示在这里。</p>`}</div></article></section>`;
      $("#sbScheduleForm", page).addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = Object.fromEntries(new FormData(event.currentTarget).entries());
        $("#sbScheduleMsg", page).textContent = "保存中...";
        let target = scheduleCourse;
        if (!target) {
          const created = await api("/api/courses", { method:"POST", body:JSON.stringify({ name:"Schedule & Deadlines", term:"StudyBridge planner" }) });
          target = created.course;
        }
        await api(`/api/courses/${encodeURIComponent(target.id)}/documents`, { method:"POST", body:JSON.stringify({ title:`[SCHEDULE_ITEM] ${form.title || "Reminder"}`, text:`Course: ${form.course || ""}\nTask: ${form.title || ""}\nDue: ${form.dueAt || ""}\nPlatform: ${form.platform || ""}\nStatus: pending`, type:"Schedule" }) });
        renderSchedule();
      });
    } catch (error) { errorPage("schedule", error); }
  }

  function statusCard(title, value, detail, level = "warn") {
    return `<div class="sb-item"><strong><span class="sb-dev-dot ${level}"></span>${esc(title)}</strong><h4 style="margin:4px 0;color:#08245c">${esc(value || "未检测到")}</h4><p class="sb-muted">${esc(detail || "")}</p></div>`;
  }
  function statusCards(system = {}) {
    const version = system.version || {}, deploy = system.deploy || {}, database = system.database || {}, backup = system.backup || {}, ai = system.ai || {}, google = system.google || {}, email = system.email || {}, autoSync = system.autoSync || {};
    return [statusCard("当前版本", version.app || "StudyBridge", `Node ${version.node || ""}`.trim(), version.app ? "ok" : "warn"), statusCard("最后部署时间", displayTime(deploy.lastCodeUpdateAt || deploy.serverStartedAt), "按服务器文件时间显示。", deploy.lastCodeUpdateAt ? "ok" : "warn"), statusCard("数据库模式", database.mode || "local", database.note || (database.ready ? "数据库可读取。" : "数据库状态未确认。"), database.ready ? "ok" : "bad"), statusCard("本地备份", backup.ready ? "已启用" : backup.configured ? "待确认" : "未启用", backup.note || "本地文件数据库建议保持自动备份。", backup.ready ? "ok" : "warn"), statusCard("AI 是否正常", ai.ok ? "正常" : ai.configured ? "已配置，待确认" : "未配置", ai.detail || `当前模型 ${ai.simpleModel || "gpt-4o-mini"}。`, ai.ok ? "ok" : ai.configured ? "warn" : "bad"), statusCard("Google 登录", google.enabled ? "已启用" : "未配置", google.enabled ? "Google 登录可用。" : "普通邮箱注册仍可用。", google.enabled ? "ok" : "warn"), statusCard("邮箱验证码", email.sendingConfigured ? "已启用真实发信" : email.verificationRequired ? "需要验证码" : "非必需", email.sendingConfigured ? "可以发送邮箱验证码。" : "当前仍由邀请码控制注册。", email.sendingConfigured || !email.verificationRequired ? "ok" : "warn"), statusCard("服务器自动同步", autoSync.configured ? "已检测到" : "未确认", autoSync.note || "如果页面最近已自动更新，说明同步机制正在工作。", autoSync.configured ? "ok" : "warn"), statusCard("管理接口", "正常", "可以读取用户、邀请码和重置申请。", "ok")].join("");
  }

  async function renderDeveloper() {
    const page = shell("developer", "开发者端", "管理邀请码、用户、系统状态和密码重置申请。", `<section class="sb-card">正在读取开发者数据...</section>`);
    try {
      const [overview, system] = await Promise.all([api("/api/admin/overview").catch((error) => ({ error:error.message, invites:[], users:[], resetRequests:[] })), api("/api/admin/system-status").catch((error) => ({ error:error.message }))]);
      const invites = overview.invites || [];
      const users = overview.users || [];
      $(".sb-body", page).innerHTML = `<section class="sb-card"><div class="sb-row" style="justify-content:space-between"><div><h3 style="margin:0">系统状态</h3><p class="sb-muted" style="margin:4px 0 0">检测完成：${esc(new Date().toLocaleString("zh-CN", { hour12:false }))}</p></div><button class="sb-btn" type="button" id="sbDevRefresh">检测</button></div><div class="sb-dev-status-grid" style="margin-top:12px">${statusCards(system)}</div></section><section class="sb-grid"><article class="sb-card"><h3 style="margin-top:0">邀请码</h3><form class="sb-form" id="sbInviteForm"><input name="label" placeholder="备注：例如 Kevin / ECO101 小组"><div class="sb-row"><input name="maxUses" type="number" min="1" max="100" value="1" style="max-width:120px"><select name="role" style="max-width:150px"><option value="student">普通用户</option><option value="co-admin">co-admin</option></select><button class="sb-btn primary" type="submit">生成邀请码</button></div></form><div class="sb-list" style="margin-top:12px">${invites.length ? invites.map((invite) => `<div class="sb-item"><strong>${esc(invite.code || "")}</strong><span class="sb-muted">${esc(invite.role || "user")} · ${esc(invite.label || "")} · ${esc(invite.usedCount ?? invite.uses ?? 0)}/${esc(invite.maxUses ?? 1)} used</span><div class="sb-row"><button class="sb-btn" data-copy-code="${esc(invite.code || "")}" type="button">复制</button><button class="sb-btn" data-toggle-invite="${esc(invite.id || "")}" data-next-active="${invite.active === false ? "true" : "false"}" type="button">${invite.active === false ? "启用" : "停用"}</button></div></div>`).join("") : `<p class="sb-muted">还没有邀请码。</p>`}</div></article><article class="sb-card"><h3 style="margin-top:0">用户</h3><div class="sb-list">${users.length ? users.map((user) => { const stats = user.stats || {}; return `<div class="sb-item"><strong>${esc(user.name || user.email || "用户")}</strong><span class="sb-muted">${esc(user.email || "")} · ${esc(user.role || "student")}</span><div class="sb-row"><span class="sb-pill">${esc(stats.courses ?? user.courseCount ?? 0)} courses</span><span class="sb-pill">${esc(stats.documents ?? stats.docs ?? user.documentCount ?? 0)} docs</span><span class="sb-pill">${esc(stats.messages ?? stats.chats ?? user.chatCount ?? 0)} chats</span></div></div>`; }).join("") : `<p class="sb-muted">暂无用户数据。</p>`}</div></article></section><section class="sb-card"><h3 style="margin-top:0">密码重置申请</h3><div class="sb-list">${(overview.resetRequests || []).length ? overview.resetRequests.map((item) => `<div class="sb-item"><strong>${esc(item.name || item.email || "重置申请")}</strong><span class="sb-muted">${esc(item.email || "")} · ${esc(item.status || "pending")}</span></div>`).join("") : `<p class="sb-muted">还没有密码重置申请。</p>`}</div></section>`;
      $("#sbDevRefresh", page).addEventListener("click", renderDeveloper);
      $("#sbInviteForm", page).addEventListener("submit", async (event) => { event.preventDefault(); await api("/api/admin/invites", { method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) }); renderDeveloper(); });
      page.addEventListener("click", async (event) => {
        const copy = event.target.closest("[data-copy-code]");
        if (copy) { await navigator.clipboard?.writeText(copy.dataset.copyCode || ""); copy.textContent = "已复制"; return; }
        const toggle = event.target.closest("[data-toggle-invite]");
        if (toggle) { await api(`/api/admin/invites/${encodeURIComponent(toggle.dataset.toggleInvite || "")}`, { method:"PATCH", body:JSON.stringify({ active:toggle.dataset.nextActive === "true" }) }); renderDeveloper(); }
      });
    } catch (error) { errorPage("developer", error); }
  }

  function routeFromTarget(target) {
    const node = target.closest?.("[data-sb-route],#openProfilePageButton,#profileCard,#editProfileButton,#studentViewButton,#creatorViewButton,.profile-entry,.profile-card");
    if (!node) return "";
    if (node.dataset.sbRoute) return node.dataset.sbRoute;
    if (node.id === "creatorViewButton") return "developer";
    if (node.id === "studentViewButton") return "study";
    if (node.id === "openProfilePageButton" || node.id === "profileCard" || node.id === "editProfileButton" || node.classList.contains("profile-entry") || node.classList.contains("profile-card")) return "profile";
    return "";
  }

  function openRoute(route) {
    if (!route) return;
    setStatus("Opening page...");
    Promise.resolve().then(() => {
      if (route === "study") return showStudy();
      if (route === "profile") return renderProfile();
      if (route === "community") return renderCommunity();
      if (route === "classmates") return renderClassmates();
      if (route === "email") return renderEmail();
      if (route === "schedule") return renderSchedule();
      if (route === "developer") return renderDeveloper();
      return showStudy();
    }).catch((error) => { console.error("[StudyBridge navigation]", error); errorPage(route, error); });
  }

  function clickHandler(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  function init() {
    installStyle();
    ensureNav();
    document.addEventListener("click", clickHandler, true);
    new MutationObserver(ensureNav).observe(document.body, { childList:true, subtree:true });
    window.studybridgeDirectOpen = openRoute;
    window.studybridgeNavigationSelfTest = () => ({ version:VERSION, navCount:$$("#sbDirectNav").length, pageReady:Boolean($("#sbDirectPage")), activeRoute });
    window.setTimeout(() => {
      ensureNav();
      const remembered = localStorage.getItem("studybridgeLastRoute");
      if (remembered && remembered !== "study") openRoute(remembered);
      else showStudy();
    }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();