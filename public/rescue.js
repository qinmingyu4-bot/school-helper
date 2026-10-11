(() => {
  "use strict";

  const VERSION = "1.1.16";
  const root = document.getElementById("root");
  const state = {
    user: null,
    page: localStorage.getItem("sb_page") || "study",
    mode: "user",
    courses: [],
    courseId: localStorage.getItem("sb_course") || "",
    documents: [],
    messages: [],
    classmates: null,
    activeClassmateId: "",
    directMessages: [],
    community: null,
    admin: null,
    status: null,
    busy: "",
    error: "",
    notice: ""
  };

  const nav = [
    ["community", "社", "社区", "全部、学校和专业频道"],
    ["classmates", "友", "同学", "SB ID 申请和聊天"],
    ["email", "信", "邮件助手", "理解邮件并生成英文回复"],
    ["schedule", "时", "时间表", "Deadline 和课程提醒"],
    ["study", "学", "学习区", "课程资料、AI 对话和复习计划"],
    ["tools", "工", "工具", "SB Docs、Sheets、Slides"]
  ];

  const qs = (sel, base = document) => base.querySelector(sel);
  const qsa = (sel, base = document) => [...base.querySelectorAll(sel)];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
  const fmt = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("zh-CN", { hour12: false });
  };
  const profile = () => state.user?.profile || {};
  const initials = (name) => String(name || "SB").trim().slice(0, 1).toUpperCase() || "S";
  const role = () => state.user?.role || "student";
  const isAdmin = () => role() === "admin";

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) throw new Error(data.error || data.message || `Request failed: ${res.status}`);
    return data;
  }

  function setPage(page) {
    state.page = page;
    localStorage.setItem("sb_page", page);
    state.error = "";
    state.notice = "";
    render();
    loadPageData();
  }

  function selectedCourse() {
    return state.courses.find((course) => course.id === state.courseId) || state.courses[0] || null;
  }

  async function init() {
    try {
      const me = await api("/api/me");
      state.user = me.user;
      if (!isAdmin() && state.page === "admin") state.page = "study";
      await loadBase();
      render();
      await loadPageData();
    } catch {
      renderAuth();
    }
  }

  async function loadBase() {
    const courses = await api("/api/courses").catch(() => ({ courses: [] }));
    state.courses = courses.courses || [];
    if (!state.courseId && state.courses[0]) state.courseId = state.courses[0].id;
    if (state.courseId && !state.courses.some((course) => course.id === state.courseId)) {
      state.courseId = state.courses[0]?.id || "";
    }
    localStorage.setItem("sb_course", state.courseId || "");
  }

  async function loadPageData() {
    if (!state.user) return;
    try {
      if (state.page === "study") await loadStudy();
      if (state.page === "community") state.community = await api("/api/community?channel=all");
      if (state.page === "classmates") state.classmates = await api("/api/classmates");
      if (state.page === "admin" && isAdmin()) {
        const [admin, status] = await Promise.all([
          api("/api/admin/overview"),
          api("/api/admin/system-status").catch(() => null)
        ]);
        state.admin = admin;
        state.status = status;
      }
      render();
    } catch (error) {
      state.error = error.message;
      render();
    }
  }

  async function loadStudy() {
    const course = selectedCourse();
    if (!course) {
      state.documents = [];
      state.messages = [];
      return;
    }
    const [docs, messages] = await Promise.all([
      api(`/api/courses/${course.id}/documents`).catch(() => ({ documents: [] })),
      api(`/api/courses/${course.id}/messages`).catch(() => ({ messages: [] }))
    ]);
    state.documents = docs.documents || [];
    state.messages = messages.messages || [];
  }

  function renderAuth() {
    root.innerHTML = `
      <main class="auth-page">
        <section class="auth-card">
          <div class="auth-brand">
            <div class="brand-mark">SB</div>
            <div><span>STUDYBRIDGE CLOUD</span><strong>StudyBridge</strong></div>
          </div>
          <div class="auth-tabs">
            <button class="active" data-auth-tab="login">登录</button>
            <button data-auth-tab="register">注册</button>
          </div>
          <form id="authForm" class="auth-form" data-mode="login">
            <label data-register-only hidden>姓名<input name="name" placeholder="你的名字" /></label>
            <label>Email<input name="email" placeholder="you@example.com" autocomplete="email" /></label>
            <label>密码<input name="password" type="password" placeholder="至少 8 位" autocomplete="current-password" /></label>
            <label data-register-only hidden>确认密码<input name="passwordConfirm" type="password" placeholder="再次输入密码" /></label>
            <label data-register-only hidden>邀请码<input name="inviteCode" placeholder="向创建者索取邀请码" /></label>
            <button class="primary-btn" type="submit">登录</button>
            <p class="muted">Google 登录暂未配置时，普通邮箱登录/注册仍可使用。</p>
            <p class="error-text" id="authError"></p>
          </form>
        </section>
      </main>`;
  }

  function render() {
    if (!state.user) return renderAuth();
    if (state.mode === "admin" && !isAdmin()) state.mode = "user";
    const adminMode = state.mode === "admin" && isAdmin();
    root.innerHTML = `
      <div class="app-shell stable-shell">
        <aside class="sidebar stable-sidebar">
          ${sidebar(adminMode)}
        </aside>
        <main class="main-content stable-main">
          ${adminMode ? adminPage() : page()}
        </main>
      </div>`;
  }

  function sidebar(adminMode) {
    if (adminMode) {
      return `
        <div class="side-brand">
          <div class="brand-mark">SB</div>
          <div><strong>StudyBridge</strong><span>${esc(state.user.name)} | ${esc(state.user.email)}</span></div>
          <button data-action="logout">退出</button>
        </div>
        <div class="mode-switch">
          <button data-mode="user">普通用户端</button>
          <button class="active" data-mode="admin">开发者端</button>
        </div>`;
    }
    const p = profile();
    return `
      <div class="side-brand">
        <div class="brand-mark">SB</div>
        <div><strong>StudyBridge</strong><span>${esc(state.user.name)} | ${esc(state.user.email)}</span></div>
        <button data-action="logout">退出</button>
      </div>
      <section class="profile-tile ${state.page === "profile" ? "active" : ""}" data-page="profile">
        <div class="profile-cover" style="${p.backgroundUrl ? `background-image:url('${esc(p.backgroundUrl)}')` : ""}">
          <div class="avatar">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : initials(state.user.name)}</div>
        </div>
        <div class="profile-row">
          <div><strong>${esc(state.user.name)}</strong><span>${esc(p.school || "还没有填写学校")}${p.major ? ` · ${esc(p.major)}` : ""}</span><span>SB ID: ${esc(p.sbId || "未设置")}</span></div>
          <button data-page="profile">打开</button>
        </div>
      </section>
      <nav class="side-nav">
        ${nav.map(([key, icon, title, desc]) => `
          <button class="nav-card ${state.page === key ? "active" : ""}" data-page="${key}">
            <span class="nav-icon">${icon}</span>
            <span><strong>${title}</strong><small>${desc}</small></span>
          </button>`).join("")}
      </nav>
      ${isAdmin() ? `
        <div class="mode-switch">
          <button class="active" data-mode="user">普通用户端</button>
          <button data-mode="admin">开发者端</button>
        </div>` : ""}
      <section class="side-panel">
        <div class="panel-title"><strong>课程</strong><button data-action="addCourse">新增</button></div>
        ${state.courses.length ? state.courses.map((course) => `
          <button class="course-item ${course.id === state.courseId ? "active" : ""}" data-course="${esc(course.id)}">
            <strong>${esc(course.name)}</strong><small>${esc(course.term || "Current term")}</small>
          </button>`).join("") : `<p class="muted">还没有课程。点击新增创建第一门课。</p>`}
      </section>
      <section class="side-panel">
        <div class="panel-title"><strong>课程资料</strong><span>${state.documents.length}</span></div>
        <textarea id="docText" placeholder="粘贴 syllabus、lecture notes、rubric、deadline 或样卷文字"></textarea>
        <div class="row"><input id="docTitle" placeholder="资料标题" /><button data-action="saveDoc">保存</button></div>
      </section>`;
  }

  function pageHeader(label, title, sub) {
    return `<header class="page-header"><div><span>${label}</span><h1>${title}</h1><p>${sub}</p></div><button data-page="study">返回学习区</button></header>${noticeBlock()}`;
  }

  function noticeBlock() {
    return `${state.error ? `<div class="notice error">${esc(state.error)}</div>` : ""}${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}`;
  }

  function page() {
    if (state.page === "community") return communityPage();
    if (state.page === "classmates") return classmatesPage();
    if (state.page === "email") return emailPage();
    if (state.page === "schedule") return schedulePage();
    if (state.page === "tools") return toolsPage();
    if (state.page === "profile") return profilePage();
    return studyPage();
  }

  function studyPage() {
    const course = selectedCourse();
    return `
      <section class="study-page">
        <header class="study-head">
          <div><span>ACADEMIC COACH</span><h1>${esc(course?.name || "请选择课程")}</h1><p>对话已经保存到云端。</p></div>
          <select id="studyMode"><option value="preview">预习</option><option value="review">复习</option><option value="exam">考试</option></select>
        </header>
        <div class="chat-area">
          ${course ? messageList() : `<div class="empty-state">还没有选择课程。请先在左侧新增或选择一门课程，然后再发送问题。</div>`}
        </div>
        <form class="chat-compose" id="chatForm">
          <div class="quick-row">
            ${["预习下一节", "课前关键词", "上课问题", "10 分钟预习", "课程介绍", "Deadline 汇总", "制作 Cheatsheet"].map((text) => `<button type="button" data-quick="${text}">${text}</button>`).join("")}
          </div>
          <div class="compose-row">
            <input id="chatInput" placeholder="问：帮我根据这门课资料做一个 final 复习计划" ${course ? "" : "disabled"} />
            <button class="primary-btn" ${course ? "" : "disabled"}>发送</button>
          </div>
        </form>
      </section>`;
  }

  function messageList() {
    const items = state.messages.length ? state.messages : [{ role: "assistant", content: "欢迎回来。先保存课程资料，然后问我预习、复习、deadline、作业要求或模拟考试。" }];
    return `<div class="messages">${items.map((msg) => `
      <div class="msg ${msg.role === "user" ? "mine" : "ai"}">
        <span>${msg.role === "user" ? "你" : "AI"}</span>
        <div class="bubble">${formatText(msg.content)}</div>
      </div>`).join("")}</div>`;
  }

  function formatText(text) {
    return esc(text).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  }

  function communityPage() {
    const data = state.community;
    return `
      ${pageHeader("COMMUNITY", "社区", "可以看全部社区，也可以按学校和专业浏览。")}
      <section class="grid-two">
        <div class="card">
          <h2>发布讨论</h2>
          <input id="postTopic" placeholder="主题，例如 Course / Housing / Exam" />
          <textarea id="postContent" placeholder="写下你想讨论的问题"></textarea>
          <button class="primary-btn" data-action="postCommunity">发布</button>
        </div>
        <div class="card">
          <h2>讨论区</h2>
          ${(data?.posts || []).map((post) => `<article class="list-item"><strong>${esc(post.topic || "Question")}</strong><p>${formatText(post.content)}</p><small>${esc(post.authorName || "同学")} · ${fmt(post.createdAt)}</small></article>`).join("") || `<p class="muted">还没有帖子。</p>`}
        </div>
      </section>`;
  }

  function classmatesPage() {
    const data = state.classmates || {};
    const mates = data.classmates || [];
    const active = mates.find((item) => item.id === state.activeClassmateId) || mates[0];
    if (active && !state.activeClassmateId) state.activeClassmateId = active.id;
    return `
      ${pageHeader("CLASSMATES", "同学", "通过 SB ID 发送好友申请，通过后可以聊天。")}
      <section class="grid-two classmates-grid">
        <div class="card">
          <h2>添加同学</h2>
          <p class="muted">当前学校：${esc(data.school || profile().school || "未填写")}</p>
          <div class="row"><input id="sbIdInput" placeholder="输入 SB ID，例如 adam2026" /><button data-action="addClassmate">发送申请</button></div>
          <details><summary>申请列表 ${((data.requests?.incoming || []).length) ? "•" : ""}</summary>
            ${(data.requests?.incoming || []).map((req) => `<div class="list-item"><strong>${esc(req.from?.name)}</strong><small>SB ID: ${esc(req.from?.sbId)}</small><button data-request="${req.id}" data-action="acceptRequest">通过</button><button data-request="${req.id}" data-action="ignoreRequest">忽略</button></div>`).join("") || `<p class="muted">还没有好友申请。</p>`}
            ${(data.requests?.outgoing || []).map((req) => `<p class="muted">已发送给 ${esc(req.to?.name || req.to?.sbId)}</p>`).join("")}
          </details>
          <h2>同学列表</h2>
          ${mates.map((mate) => `<button class="list-item wide ${mate.id === state.activeClassmateId ? "active" : ""}" data-mate="${esc(mate.id)}"><strong>${esc(mate.peer?.name || mate.name || "同学")}</strong><small>SB ID: ${esc(mate.peer?.sbId || mate.sbId || "")}</small></button>`).join("") || `<p class="muted">还没有同学。</p>`}
        </div>
        <div class="card chat-card">
          <div class="panel-title"><div><span>DIRECT CHAT</span><h2>${esc(active?.peer?.name || active?.name || "请选择一位同学")}</h2></div><button data-action="refreshClassmates">刷新</button></div>
          <div class="direct-messages">
            ${active ? state.directMessages.map((msg) => `<div class="dm ${msg.mine ? "mine" : ""}"><p>${esc(msg.content)}</p><small>${fmt(msg.createdAt)}</small></div>`).join("") : `<p class="muted">选择同学后，这里会显示你们的聊天。</p>`}
          </div>
          <div class="row"><input id="dmInput" placeholder="写一句话给同学" ${active ? "" : "disabled"} /><button data-action="sendDm" ${active ? "" : "disabled"}>发送</button></div>
        </div>
      </section>`;
  }

  function emailPage() {
    return `
      ${pageHeader("EMAIL COACH", "邮件助手", "粘贴邮件内容，StudyBridge 会帮你看重点并起草英文回复。")}
      <section class="grid-two">
        <div class="card"><h2>收到的邮件</h2><textarea id="emailText" placeholder="把老师、TA、学校办公室或同学发来的邮件粘贴在这里"></textarea><textarea id="emailGoal" placeholder="你想怎么回复，例如请假、确认 meeting time、问清作业要求"></textarea><button class="primary-btn" data-action="draftEmail">生成回复</button></div>
        <div class="card"><h2>建议回复</h2><div id="emailOutput" class="output-box">生成后会显示在这里。</div></div>
      </section>`;
  }

  function schedulePage() {
    const allDocs = state.documents.filter((doc) => /\[SCHEDULE ITEM\]|deadline|due/i.test(`${doc.title} ${doc.text}`));
    return `
      ${pageHeader("SCHEDULE", "时间表", "记录课程、作业 deadline 和提醒。")}
      <section class="grid-two">
        <div class="card"><h2>新增提醒</h2><input id="deadlineTitle" placeholder="例如 ECO101 Essay 1" /><input id="deadlineCourse" placeholder="课程，例如 ECO101" /><input id="deadlineAt" type="datetime-local" /><button class="primary-btn" data-action="addDeadline">保存提醒</button></div>
        <div class="card"><h2>全部提醒</h2>${allDocs.map((doc) => `<div class="list-item"><strong>${esc(doc.title)}</strong><small>${esc(doc.type || "Schedule")} · ${fmt(doc.createdAt)}</small></div>`).join("") || `<p class="muted">还没有提醒。添加后会显示在这里。</p>`}</div>
      </section>`;
  }

  function toolsPage() {
    return `
      ${pageHeader("STUDY TOOLS", "工具", "Docs、Sheets、Slides 可以手动编辑，旁边再调用 AI。")}
      <section class="grid-two">
        <div class="card"><h2>SB Docs</h2><textarea class="big-editor" placeholder="在这里写 essay、report 或 reading response。"></textarea><button data-action="toolAi">让 AI 帮我优化</button></div>
        <div class="card"><h2>SB Sheets / Slides</h2><textarea class="big-editor" placeholder="表格计划、数据、PPT 大纲都可以先手动写在这里。"></textarea><button data-action="toolAi">让 AI 帮我整理</button></div>
      </section>`;
  }

  function profilePage() {
    const p = profile();
    return `
      ${pageHeader("PERSONAL PROFILE", "个人资料", "头像、背景、学校、专业和 SB ID 都在这里管理。")}
      <section class="grid-two">
        <div class="card profile-preview">
          <div class="profile-cover large" style="${p.backgroundUrl ? `background-image:url('${esc(p.backgroundUrl)}')` : ""}"><div class="avatar large">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : initials(state.user.name)}</div></div>
          <h2>${esc(state.user.name)}</h2>
          <p>${esc(p.school || "未填写学校")}${p.major ? ` · ${esc(p.major)}` : ""}</p>
          <p><strong>SB ID:</strong> ${esc(p.sbId || "未设置")}</p>
          <div class="school-box"><strong>${esc(p.school || "学校")} 概览</strong><p>填写学校后，这里会用于 AI 个性化学习建议。QS 排名、地点和特色之后可以继续完善。</p></div>
        </div>
        <form class="card" id="profileForm">
          <h2>编辑资料</h2>
          <label>姓名<input name="name" value="${esc(state.user.name)}" /></label>
          <label>学校<input name="school" value="${esc(p.school || "")}" placeholder="University of Toronto" /></label>
          <label>专业<input name="major" value="${esc(p.major || "")}" placeholder="Finance / Economics / CS" /></label>
          <label>SB ID<input name="sbId" value="${esc(p.sbId || "")}" placeholder="你的唯一 ID" /></label>
          <label>头像图片链接<input name="avatarUrl" value="${esc(p.avatarUrl || "")}" /></label>
          <label>背景图片链接<input name="backgroundUrl" value="${esc(p.backgroundUrl || "")}" /></label>
          <button class="primary-btn">保存资料</button>
        </form>
      </section>`;
  }

  function adminPage() {
    const data = state.admin;
    return `
      ${pageHeader("CREATOR CONSOLE", "开发者端", "管理邀请码、用户、系统状态和密码重置申请。")}
      <section class="card">
        <div class="panel-title"><h2>系统状态</h2><button data-action="checkStatus">检测</button></div>
        ${state.status ? statusGrid() : `<p class="muted">点击检测查看系统状态。</p>`}
      </section>
      <section class="grid-two">
        <div class="card">
          <h2>邀请码</h2>
          <input id="inviteLabel" placeholder="备注：例如 Kevin / ECO101 小组" />
          <div class="row"><input id="inviteUses" type="number" min="1" value="1" /><select id="inviteRole"><option value="student">普通用户</option><option value="admin">Co-admin</option></select><button data-action="createInvite">生成邀请码</button></div>
          ${(data?.invites || []).map((invite) => `<div class="list-item"><strong>${esc(invite.code)}</strong><small>${esc(invite.role)} · ${esc(invite.label || "")} · ${invite.usedCount || 0}/${invite.maxUses || 1} used</small><button data-copy="${esc(invite.code)}">复制</button><button data-invite="${invite.id}" data-active="${invite.active ? "0" : "1"}" data-action="toggleInvite">${invite.active ? "停用" : "启用"}</button></div>`).join("")}
        </div>
        <div class="card">
          <h2>用户</h2>
          ${(data?.users || []).map((user) => `<div class="list-item"><strong>${esc(user.name)}</strong><small>${esc(user.email)} · ${esc(user.role)} · 邀请码：${esc(user.inviteCode || "无")}</small><div class="pill-row"><span>${user.stats?.courses || 0} courses</span><span>${user.stats?.docs || 0} docs</span><span>${user.stats?.chats || 0} chats</span></div></div>`).join("") || `<p class="muted">暂无用户数据。</p>`}
        </div>
      </section>`;
  }

  function statusGrid() {
    const s = state.status;
    const cards = [
      ["当前版本", s.version?.app || VERSION, `Node ${s.version?.node || ""}`, "ok"],
      ["最后部署时间", fmt(s.deploy?.lastCodeUpdateAt) || "未检测到", "按服务器文件时间显示。", s.deploy?.lastCodeUpdateAt ? "ok" : "warn"],
      ["数据库模式", s.database?.mode || "local", s.database?.ok ? "Local database is readable and writable." : "请检查数据库。", s.database?.ok ? "ok" : "bad"],
      ["AI 是否正常", s.ai?.ok ? "正常" : "未确认", s.ai?.model ? `Current model ${s.ai.model}` : "点击检测后确认。", s.ai?.ok ? "ok" : "warn"],
      ["Google 登录", s.google?.enabled ? "已配置" : "未配置", "普通邮箱注册仍可用。", s.google?.enabled ? "ok" : "warn"],
      ["邮箱验证码", s.email?.verificationRequired ? "已启用" : "非必需", s.email?.sendingConfigured ? "真实发信可用。" : "邀请码仍是主要注册控制。", "ok"],
      ["服务器自动同步", s.autoSync?.detected ? "已检测到" : "未确认", "Server auto-sync script status.", s.autoSync?.detected ? "ok" : "warn"],
      ["管理接口", "正常", "可以读取用户、邀请码和重置申请。", "ok"]
    ];
    return `<div class="status-grid">${cards.map(([title, value, desc, tone]) => `<div class="status-card ${tone}"><strong>${title}</strong><b>${value}</b><p>${desc}</p></div>`).join("")}</div>`;
  }

  async function handleClick(event) {
    const target = event.target.closest("[data-page],[data-mode],[data-action],[data-course],[data-quick],[data-mate],[data-copy]");
    if (!target) return;
    event.preventDefault();
    if (target.dataset.page) return setPage(target.dataset.page);
    if (target.dataset.mode) {
      state.mode = target.dataset.mode;
      if (state.mode === "admin") state.page = "admin";
      if (state.mode === "user" && state.page === "admin") state.page = "study";
      render();
      return loadPageData();
    }
    if (target.dataset.course) {
      state.courseId = target.dataset.course;
      localStorage.setItem("sb_course", state.courseId);
      state.page = "study";
      render();
      return loadStudy().then(render);
    }
    if (target.dataset.quick) {
      const input = qs("#chatInput");
      if (input) input.value = target.dataset.quick;
      return;
    }
    if (target.dataset.mate) {
      state.activeClassmateId = target.dataset.mate;
      await loadDirectMessages();
      return render();
    }
    if (target.dataset.copy) {
      await navigator.clipboard?.writeText(target.dataset.copy);
      state.notice = "已复制。";
      return render();
    }
    return runAction(target.dataset.action, target);
  }

  async function runAction(action, target) {
    try {
      state.error = "";
      state.notice = "";
      if (action === "logout") {
        await api("/api/auth/logout", { method: "POST", body: "{}" });
        location.reload();
      }
      if (action === "addCourse") {
        const name = prompt("课程名称，例如 ECO364");
        if (!name) return;
        const out = await api("/api/courses", { method: "POST", body: JSON.stringify({ name }) });
        state.courseId = out.course.id;
        await loadBase();
        setPage("study");
      }
      if (action === "saveDoc") {
        const course = selectedCourse();
        if (!course) throw new Error("请先选择课程。");
        await api(`/api/courses/${course.id}/documents`, { method: "POST", body: JSON.stringify({ title: qs("#docTitle")?.value || "Course note", text: qs("#docText")?.value || "" }) });
        state.notice = "课程资料已保存。";
        await loadStudy();
        render();
      }
      if (action === "postCommunity") {
        await api("/api/community/posts", { method: "POST", body: JSON.stringify({ topic: qs("#postTopic")?.value || "Question", content: qs("#postContent")?.value || "", channel: "all" }) });
        state.community = await api("/api/community?channel=all");
        render();
      }
      if (action === "addClassmate") {
        const id = qs("#sbIdInput")?.value || "";
        await api("/api/classmates", { method: "POST", body: JSON.stringify({ sbId: id }) });
        state.notice = "好友申请已发送。";
        state.classmates = await api("/api/classmates");
        render();
      }
      if (action === "acceptRequest" || action === "ignoreRequest") {
        await api(`/api/classmate-requests/${target.dataset.request}`, { method: "PATCH", body: JSON.stringify({ action: action === "acceptRequest" ? "accept" : "ignore" }) });
        state.classmates = await api("/api/classmates");
        render();
      }
      if (action === "refreshClassmates") {
        state.classmates = await api("/api/classmates");
        await loadDirectMessages();
        render();
      }
      if (action === "sendDm") {
        const text = qs("#dmInput")?.value || "";
        const mate = state.activeClassmateId || (state.classmates?.classmates || [])[0]?.id;
        if (!mate) throw new Error("请先选择一位同学。");
        await api(`/api/classmates/${mate}/messages`, { method: "POST", body: JSON.stringify({ content: text }) });
        await loadDirectMessages();
        render();
      }
      if (action === "draftEmail" || action === "toolAi") {
        const box = qs("#emailOutput");
        if (box) box.textContent = "先整理重点，再生成英文回复。这个轻量工具会继续接入 AI。";
      }
      if (action === "addDeadline") {
        const course = selectedCourse();
        if (!course) throw new Error("请先选择课程。");
        const title = qs("#deadlineTitle")?.value || "Schedule item";
        const at = qs("#deadlineAt")?.value || "";
        await api(`/api/courses/${course.id}/documents`, { method: "POST", body: JSON.stringify({ title: `[SCHEDULE ITEM] ${title}`, type: "Schedule", text: `${qs("#deadlineCourse")?.value || course.name}\n${at}` }) });
        state.notice = "提醒已保存。";
        await loadStudy();
        render();
      }
      if (action === "checkStatus") {
        state.status = await api("/api/admin/system-status");
        render();
      }
      if (action === "createInvite") {
        await api("/api/admin/invites", { method: "POST", body: JSON.stringify({ label: qs("#inviteLabel")?.value || "Friend invite", maxUses: qs("#inviteUses")?.value || 1, role: qs("#inviteRole")?.value || "student" }) });
        state.admin = await api("/api/admin/overview");
        render();
      }
      if (action === "toggleInvite") {
        await api(`/api/admin/invites/${target.dataset.invite}`, { method: "PATCH", body: JSON.stringify({ active: target.dataset.active === "1" }) });
        state.admin = await api("/api/admin/overview");
        render();
      }
    } catch (error) {
      state.error = error.message;
      render();
    }
  }

  async function loadDirectMessages() {
    const mate = state.activeClassmateId || (state.classmates?.classmates || [])[0]?.id;
    if (!mate) {
      state.directMessages = [];
      return;
    }
    state.activeClassmateId = mate;
    const out = await api(`/api/classmates/${mate}/messages`).catch(() => ({ messages: [] }));
    state.directMessages = out.messages || [];
  }

  async function handleSubmit(event) {
    if (event.target.id === "authForm") {
      event.preventDefault();
      const form = new FormData(event.target);
      const mode = event.target.dataset.mode || "login";
      const body = Object.fromEntries(form.entries());
      const err = qs("#authError");
      try {
        const out = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify(body) });
        state.user = out.user;
        await loadBase();
        setPage("study");
      } catch (error) {
        if (err) err.textContent = error.message;
      }
    }
    if (event.target.id === "chatForm") {
      event.preventDefault();
      const course = selectedCourse();
      const input = qs("#chatInput");
      const message = input?.value.trim();
      if (!course) {
        state.error = "还没有选择课程。请先新增或选择课程。";
        return render();
      }
      if (!message) return;
      input.value = "";
      state.messages.push({ role: "user", content: message }, { role: "assistant", content: "正在根据云端课程资料思考..." });
      render();
      try {
        const out = await api(`/api/courses/${course.id}/chat`, { method: "POST", body: JSON.stringify({ message, mode: qs("#studyMode")?.value || "preview" }) });
        state.messages = (state.messages || []).filter((msg) => msg.content !== "正在根据云端课程资料思考...").concat(out.messages || []);
        render();
      } catch (error) {
        state.messages = state.messages.filter((msg) => msg.content !== "正在根据云端课程资料思考...");
        state.error = error.message;
        render();
      }
    }
    if (event.target.id === "profileForm") {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.target).entries());
      const out = await api("/api/me/profile", { method: "PUT", body: JSON.stringify(body) });
      state.user = out.user;
      state.notice = "资料已保存。";
      render();
    }
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("submit", handleSubmit);
  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-auth-tab]");
    if (!tab) return;
    const form = qs("#authForm");
    const mode = tab.dataset.authTab;
    form.dataset.mode = mode;
    qsa("[data-auth-tab]").forEach((btn) => btn.classList.toggle("active", btn === tab));
    qsa("[data-register-only]").forEach((el) => { el.hidden = mode !== "register"; });
    qs(".auth-form .primary-btn").textContent = mode === "register" ? "创建账号" : "登录";
  });

  init();
})();
