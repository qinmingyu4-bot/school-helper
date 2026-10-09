(() => {
  "use strict";

  const root = document.getElementById("root");
  const VERSION = "1.1.16";
  const state = {
    user: null,
    page: localStorage.getItem("sb_page") || "study",
    mode: "user",
    courses: [],
    courseId: localStorage.getItem("sb_course") || "",
    docs: [],
    messages: [],
    classmates: null,
    mateId: "",
    dm: [],
    community: null,
    admin: null,
    status: null,
    notice: "",
    error: ""
  };

  const nav = [
    ["community", "社", "社区", "全部、学校和专业频道"],
    ["classmates", "友", "同学", "SB ID 申请和聊天"],
    ["email", "信", "邮件助手", "理解邮件并生成英文回复"],
    ["schedule", "时", "时间表", "Deadline 和课程提醒"],
    ["study", "学", "学习区", "课程资料、AI 对话和复习计划"],
    ["tools", "工", "工具", "SB Docs、Sheets、Slides"]
  ];

  const $ = (s, b = document) => b.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const fmt = (v) => {
    const d = new Date(v || "");
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("zh-CN", { hour12: false });
  };
  const prof = () => state.user?.profile || {};
  const admin = () => state.user?.role === "admin";
  const course = () => state.courses.find((c) => c.id === state.courseId) || state.courses[0] || null;

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `请求失败 ${res.status}`);
    return data;
  }

  async function boot() {
    try {
      state.user = (await api("/api/me")).user;
      await loadCourses();
      draw();
      await loadPage();
    } catch {
      drawLogin();
    }
  }

  async function loadCourses() {
    const data = await api("/api/courses").catch(() => ({ courses: [] }));
    state.courses = data.courses || [];
    if (!state.courseId && state.courses[0]) state.courseId = state.courses[0].id;
    if (state.courseId && !state.courses.some((c) => c.id === state.courseId)) state.courseId = state.courses[0]?.id || "";
    localStorage.setItem("sb_course", state.courseId || "");
  }

  async function loadPage() {
    try {
      state.error = "";
      if (state.page === "study") await loadStudy();
      if (state.page === "community") state.community = await api("/api/community?channel=all");
      if (state.page === "classmates") {
        state.classmates = await api("/api/classmates");
        if (!state.mateId) state.mateId = state.classmates.classmates?.[0]?.id || "";
        await loadDm();
      }
      if (state.page === "admin" && admin()) {
        state.admin = await api("/api/admin/overview");
        state.status = await api("/api/admin/system-status").catch(() => null);
      }
      draw();
    } catch (e) {
      state.error = e.message;
      draw();
    }
  }

  async function loadStudy() {
    const c = course();
    if (!c) {
      state.docs = [];
      state.messages = [];
      return;
    }
    const [docs, messages] = await Promise.all([
      api(`/api/courses/${c.id}/documents`).catch(() => ({ documents: [] })),
      api(`/api/courses/${c.id}/messages`).catch(() => ({ messages: [] }))
    ]);
    state.docs = docs.documents || [];
    state.messages = messages.messages || [];
  }

  async function loadDm() {
    if (!state.mateId) {
      state.dm = [];
      return;
    }
    state.dm = (await api(`/api/classmates/${state.mateId}/messages`).catch(() => ({ messages: [] }))).messages || [];
  }

  function drawLogin() {
    root.innerHTML = `
      <main class="auth-page">
        <section class="auth-card">
          <div class="auth-brand"><div class="brand-mark">SB</div><div><span>STUDYBRIDGE CLOUD</span><strong>StudyBridge</strong></div></div>
          <div class="auth-tabs"><button class="active" data-tab="login">登录</button><button data-tab="register">注册</button></div>
          <form id="loginForm" data-kind="login" class="auth-form">
            <label data-reg hidden>姓名<input name="name" placeholder="你的名字"></label>
            <label>Email<input name="email" placeholder="you@example.com"></label>
            <label>密码<input name="password" type="password" placeholder="至少 8 位"></label>
            <label data-reg hidden>确认密码<input name="passwordConfirm" type="password" placeholder="再次输入密码"></label>
            <label data-reg hidden>邀请码<input name="inviteCode" placeholder="向创建者索取邀请码"></label>
            <button class="primary-btn">登录</button>
            <p class="muted">Google 登录待配置。普通邮箱登录和邀请码注册可用。</p>
            <p id="authErr" class="error-text"></p>
          </form>
        </section>
      </main>`;
  }

  function draw() {
    if (!state.user) return drawLogin();
    const developer = state.mode === "admin" && admin();
    root.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">${developer ? adminSide() : userSide()}</aside>
        <main class="main-content">${developer ? adminPage() : currentPage()}</main>
      </div>`;
  }

  function userSide() {
    const p = prof();
    return `
      <div class="side-brand"><div class="brand-mark">SB</div><div><strong>StudyBridge</strong><span>${esc(state.user.name)} | ${esc(state.user.email)}</span></div><button data-act="logout">退出</button></div>
      <section class="profile-tile ${state.page === "profile" ? "active" : ""}" data-go="profile">
        <div class="profile-cover">${p.avatarUrl ? `<img class="avatar-img" src="${esc(p.avatarUrl)}">` : ""}</div>
        <div class="profile-row"><div><strong>${esc(state.user.name)}</strong><span>${esc(p.school || "还没有填写学校")}${p.major ? " · " + esc(p.major) : ""}</span><span>SB ID: ${esc(p.sbId || "未设置")}</span></div><button data-go="profile">打开</button></div>
      </section>
      <nav class="side-nav">${nav.map(([id, icon, title, sub]) => `<button class="nav-card ${state.page === id ? "active" : ""}" data-go="${id}"><span class="nav-icon">${icon}</span><span><strong>${title}</strong><small>${sub}</small></span></button>`).join("")}</nav>
      ${admin() ? `<div class="mode-switch"><button class="active" data-mode="user">普通用户端</button><button data-mode="admin">开发者端</button></div>` : ""}
      <section class="side-panel"><div class="panel-title"><strong>课程</strong><button data-act="addCourse">新增</button></div>${state.courses.map((c) => `<button class="course-item ${c.id === state.courseId ? "active" : ""}" data-course="${esc(c.id)}"><strong>${esc(c.name)}</strong><small>${esc(c.term || "Current term")}</small></button>`).join("") || `<p class="muted">还没有课程。</p>`}</section>
      <section class="side-panel"><div class="panel-title"><strong>课程资料</strong><span>${state.docs.length}</span></div><textarea id="docText" placeholder="粘贴 syllabus、lecture notes、rubric、deadline 或样卷文字"></textarea><input id="docTitle" placeholder="资料标题"><button data-act="saveDoc">保存</button></section>`;
  }

  function adminSide() {
    return `<div class="side-brand"><div class="brand-mark">SB</div><div><strong>StudyBridge</strong><span>${esc(state.user.name)} | ${esc(state.user.email)}</span></div><button data-act="logout">退出</button></div><div class="mode-switch"><button data-mode="user">普通用户端</button><button class="active" data-mode="admin">开发者端</button></div>`;
  }

  function header(label, title, sub) {
    return `<header class="page-header"><div><span>${label}</span><h1>${title}</h1><p>${sub}</p></div><button data-go="study">返回学习区</button></header>${state.error ? `<div class="notice error">${esc(state.error)}</div>` : ""}${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}`;
  }

  function currentPage() {
    if (state.page === "community") return communityPage();
    if (state.page === "classmates") return classmatesPage();
    if (state.page === "email") return emailPage();
    if (state.page === "schedule") return schedulePage();
    if (state.page === "tools") return toolsPage();
    if (state.page === "profile") return profilePage();
    return studyPage();
  }

  function studyPage() {
    const c = course();
    const msgs = state.messages.length ? state.messages : [{ role: "assistant", content: "欢迎回来。先保存课程资料，然后问我预习、复习、deadline、作业要求或模拟考试。" }];
    return `
      <section class="study-page"><header class="study-head"><div><span>ACADEMIC COACH</span><h1>${esc(c?.name || "请选择课程")}</h1><p>对话已经保存到云端。</p></div><select><option>预习</option><option>复习</option></select></header>
      <div class="chat-area"><div class="messages">${c ? msgs.map((m) => `<div class="msg ${m.role === "user" ? "mine" : "ai"}"><span>${m.role === "user" ? "你" : "AI"}</span><div class="bubble">${esc(m.content).replace(/\n/g, "<br>")}</div></div>`).join("") : `<div class="empty-state">还没有选择课程。请先在左侧新增或选择课程。</div>`}</div></div>
      <form id="chatForm" class="chat-compose"><div class="quick-row">${["预习下一节", "课前关键词", "上课问题", "10 分钟预习", "课程介绍", "Deadline 汇总", "制作 Cheatsheet"].map((x) => `<button type="button" data-quick="${x}">${x}</button>`).join("")}</div><div class="compose-row"><button type="button" data-act="attach">+</button><input id="chatInput" ${c ? "" : "disabled"} placeholder="问：帮我根据这门课资料做一个 final 复习计划"><button class="primary-btn" ${c ? "" : "disabled"}>发送</button></div></form></section>`;
  }

  function communityPage() {
    const posts = state.community?.posts || [];
    return `${header("COMMUNITY", "社区", "全部同学都可以看的社区，学校和专业是分类。")}<section class="grid-two"><div class="card"><h2>发布讨论</h2><input id="postTopic" placeholder="主题"><textarea id="postContent" placeholder="写下你想讨论的问题"></textarea><button class="primary-btn" data-act="post">发布</button></div><div class="card"><h2>讨论区</h2>${posts.map((p) => `<article class="list-item"><strong>${esc(p.topic || "Question")}</strong><p>${esc(p.content)}</p><small>${esc(p.authorName || "同学")} · ${fmt(p.createdAt)}</small></article>`).join("") || `<p class="muted">还没有帖子。</p>`}</div></section>`;
  }

  function classmatesPage() {
    const d = state.classmates || {};
    const mates = d.classmates || [];
    const active = mates.find((m) => m.id === state.mateId) || mates[0];
    return `${header("CLASSMATES", "同学", "通过 SB ID 发送好友申请，通过后可以聊天。")}<section class="grid-two"><div class="card"><h2>添加同学</h2><div class="row"><input id="sbIdInput" placeholder="输入 SB ID，例如 adam2026"><button data-act="addMate">发送申请</button></div><details><summary>申请列表 ${(d.requests?.incoming || []).length ? "•" : ""}</summary>${(d.requests?.incoming || []).map((r) => `<div class="list-item"><strong>${esc(r.from?.name)}</strong><small>SB ID: ${esc(r.from?.sbId)}</small><button data-req="${r.id}" data-act="accept">通过</button><button data-req="${r.id}" data-act="ignore">忽略</button></div>`).join("") || `<p class="muted">还没有好友申请。</p>`}</details><h2>同学列表</h2>${mates.map((m) => `<button class="list-item wide ${m.id === state.mateId ? "active" : ""}" data-mate="${m.id}"><strong>${esc(m.peer?.name || m.name || "同学")}</strong><small>SB ID: ${esc(m.peer?.sbId || m.sbId || "")}</small></button>`).join("") || `<p class="muted">还没有同学。</p>`}</div><div class="card chat-card"><div class="panel-title"><div><span>DIRECT CHAT</span><h2>${esc(active?.peer?.name || active?.name || "请选择一位同学")}</h2></div><button data-act="refreshMate">刷新</button></div><div class="direct-messages">${state.dm.map((m) => `<div class="dm ${m.mine ? "mine" : ""}"><p>${esc(m.content)}</p><small>${fmt(m.createdAt)}</small></div>`).join("")}</div><div class="row"><input id="dmInput" placeholder="写一句话给同学"><button data-act="sendDm">发送</button></div></div></section>`;
  }

  function emailPage() {
    return `${header("EMAIL COACH", "邮件助手", "粘贴邮件内容，StudyBridge 会帮你看重点并起草英文回复。")}<section class="grid-two"><div class="card"><h2>收到的邮件</h2><textarea id="emailText" placeholder="把邮件粘贴在这里"></textarea><textarea id="emailGoal" placeholder="你想怎么回复"></textarea><button class="primary-btn" data-act="draftEmail">生成回复</button></div><div class="card"><h2>建议回复</h2><div id="emailOut" class="output-box">生成后显示在这里。</div></div></section>`;
  }

  function schedulePage() {
    return `${header("SCHEDULE", "时间表", "记录课程、作业 deadline 和提醒。")}<section class="grid-two"><div class="card"><h2>新增提醒</h2><input id="deadlineTitle" placeholder="例如 ECO101 Essay 1"><input id="deadlineAt" type="datetime-local"><button class="primary-btn" data-act="addDeadline">保存提醒</button></div><div class="card"><h2>全部提醒</h2>${state.docs.filter((d) => /SCHEDULE|deadline|due/i.test(d.title + d.text)).map((d) => `<div class="list-item"><strong>${esc(d.title)}</strong><small>${fmt(d.createdAt)}</small></div>`).join("") || `<p class="muted">还没有提醒。</p>`}</div></section>`;
  }

  function toolsPage() {
    return `${header("STUDY TOOLS", "工具", "Docs、Sheets、Slides 可以手动编辑，旁边再调用 AI。")}<section class="grid-two"><div class="card"><h2>SB Docs</h2><textarea class="big-editor" placeholder="在这里写 essay、report 或 reading response。"></textarea><button>让 AI 帮我优化</button></div><div class="card"><h2>SB Sheets / Slides</h2><textarea class="big-editor" placeholder="表格计划、数据、PPT 大纲都可以先手动写在这里。"></textarea><button>让 AI 帮我整理</button></div></section>`;
  }

  function profilePage() {
    const p = prof();
    return `${header("PERSONAL PROFILE", "个人资料", "头像、背景、学校、专业和 SB ID 都在这里管理。")}<section class="grid-two"><div class="card"><div class="profile-cover large"></div><h2>${esc(state.user.name)}</h2><p>${esc(p.school || "未填写学校")}${p.major ? " · " + esc(p.major) : ""}</p><p><strong>SB ID:</strong> ${esc(p.sbId || "未设置")}</p><div class="school-box"><strong>${esc(p.school || "学校")} 概览</strong><p>填写学校后，这里会用于 AI 个性化学习建议。</p></div></div><form class="card" id="profileForm"><h2>编辑资料</h2><label>姓名<input name="name" value="${esc(state.user.name)}"></label><label>学校<input name="school" value="${esc(p.school || "")}"></label><label>专业<input name="major" value="${esc(p.major || "")}"></label><label>SB ID<input name="sbId" value="${esc(p.sbId || "")}"></label><label>头像图片链接<input name="avatarUrl" value="${esc(p.avatarUrl || "")}"></label><label>背景图片链接<input name="backgroundUrl" value="${esc(p.backgroundUrl || "")}"></label><button class="primary-btn">保存资料</button></form></section>`;
  }

  function adminPage() {
    const users = state.admin?.users || [];
    const invites = state.admin?.invites || [];
    return `${header("CREATOR CONSOLE", "开发者端", "管理邀请码、用户、系统状态和密码重置申请。")}<section class="card"><div class="panel-title"><h2>系统状态</h2><button data-act="status">检测</button></div>${state.status ? `<pre>${esc(JSON.stringify(state.status, null, 2))}</pre>` : `<p class="muted">点击检测查看系统状态。</p>`}</section><section class="grid-two"><div class="card"><h2>邀请码</h2><input id="inviteLabel" placeholder="备注"><div class="row"><input id="inviteUses" type="number" value="1"><select id="inviteRole"><option value="student">普通用户</option><option value="admin">Co-admin</option></select><button data-act="invite">生成邀请码</button></div>${invites.map((i) => `<div class="list-item"><strong>${esc(i.code)}</strong><small>${esc(i.role)} · ${esc(i.label || "")} · ${i.usedCount || 0}/${i.maxUses || 1} used</small><button data-copy="${esc(i.code)}">复制</button><button data-invite="${i.id}" data-active="${i.active ? "0" : "1"}" data-act="toggleInvite">${i.active ? "停用" : "启用"}</button></div>`).join("")}</div><div class="card"><h2>用户</h2>${users.map((u) => `<div class="list-item"><strong>${esc(u.name)}</strong><small>${esc(u.email)} · ${esc(u.role)} · 邀请码：${esc(u.inviteCode || "无")}</small><div class="pill-row"><span>${u.stats?.courses || 0} courses</span><span>${u.stats?.docs || 0} docs</span><span>${u.stats?.chats || 0} chats</span></div></div>`).join("")}</div></section>`;
  }

  async function go(page) {
    state.page = page;
    localStorage.setItem("sb_page", page);
    if (state.mode === "admin" && page !== "admin") state.mode = "user";
    draw();
    await loadPage();
  }

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-go],[data-mode],[data-act],[data-course],[data-quick],[data-mate],[data-copy]");
    if (!t) return;
    e.preventDefault();
    try {
      if (t.dataset.go) return go(t.dataset.go);
      if (t.dataset.mode) {
        state.mode = t.dataset.mode;
        state.page = state.mode === "admin" ? "admin" : "study";
        draw();
        return loadPage();
      }
      if (t.dataset.course) {
        state.courseId = t.dataset.course;
        localStorage.setItem("sb_course", state.courseId);
        return go("study");
      }
      if (t.dataset.quick) {
        const input = $("#chatInput");
        if (input) input.value = t.dataset.quick;
        return;
      }
      if (t.dataset.mate) {
        state.mateId = t.dataset.mate;
        await loadDm();
        return draw();
      }
      if (t.dataset.copy) {
        await navigator.clipboard?.writeText(t.dataset.copy);
        state.notice = "已复制。";
        return draw();
      }
      await action(t);
    } catch (err) {
      state.error = err.message;
      draw();
    }
  });

  async function action(t) {
    const a = t.dataset.act;
    if (a === "logout") {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      return location.reload();
    }
    if (a === "addCourse") {
      const name = prompt("课程名称，例如 ECO364");
      if (!name) return;
      const out = await api("/api/courses", { method: "POST", body: JSON.stringify({ name }) });
      state.courseId = out.course.id;
      await loadCourses();
      return go("study");
    }
    if (a === "saveDoc") {
      if (!course()) throw new Error("请先选择课程。");
      await api(`/api/courses/${course().id}/documents`, { method: "POST", body: JSON.stringify({ title: $("#docTitle")?.value || "Course note", text: $("#docText")?.value || "" }) });
      state.notice = "课程资料已保存。";
      await loadStudy();
      return draw();
    }
    if (a === "post") {
      await api("/api/community/posts", { method: "POST", body: JSON.stringify({ topic: $("#postTopic")?.value || "Question", content: $("#postContent")?.value || "", channel: "all" }) });
      state.community = await api("/api/community?channel=all");
      return draw();
    }
    if (a === "addMate") {
      await api("/api/classmates", { method: "POST", body: JSON.stringify({ sbId: $("#sbIdInput")?.value || "" }) });
      state.notice = "好友申请已发送。";
      state.classmates = await api("/api/classmates");
      return draw();
    }
    if (a === "accept" || a === "ignore") {
      await api(`/api/classmate-requests/${t.dataset.req}`, { method: "PATCH", body: JSON.stringify({ action: a === "accept" ? "accept" : "ignore" }) });
      state.classmates = await api("/api/classmates");
      return draw();
    }
    if (a === "refreshMate") {
      state.classmates = await api("/api/classmates");
      await loadDm();
      return draw();
    }
    if (a === "sendDm") {
      if (!state.mateId) throw new Error("请先选择同学。");
      await api(`/api/classmates/${state.mateId}/messages`, { method: "POST", body: JSON.stringify({ content: $("#dmInput")?.value || "" }) });
      await loadDm();
      return draw();
    }
    if (a === "draftEmail") {
      $("#emailOut").textContent = "建议：先确认对方邮件重点，再礼貌说明你的请求。英文草稿功能会继续接入 AI。";
    }
    if (a === "addDeadline") {
      if (!course()) throw new Error("请先选择课程。");
      await api(`/api/courses/${course().id}/documents`, { method: "POST", body: JSON.stringify({ title: `[SCHEDULE ITEM] ${$("#deadlineTitle")?.value || "Deadline"}`, type: "Schedule", text: $("#deadlineAt")?.value || "" }) });
      await loadStudy();
      return draw();
    }
    if (a === "status") {
      state.status = await api("/api/admin/system-status");
      return draw();
    }
    if (a === "invite") {
      await api("/api/admin/invites", { method: "POST", body: JSON.stringify({ label: $("#inviteLabel")?.value || "Friend invite", maxUses: $("#inviteUses")?.value || 1, role: $("#inviteRole")?.value || "student" }) });
      state.admin = await api("/api/admin/overview");
      return draw();
    }
    if (a === "toggleInvite") {
      await api(`/api/admin/invites/${t.dataset.invite}`, { method: "PATCH", body: JSON.stringify({ active: t.dataset.active === "1" }) });
      state.admin = await api("/api/admin/overview");
      return draw();
    }
  }

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (e.target.id === "loginForm") {
        const body = Object.fromEntries(new FormData(e.target).entries());
        const path = e.target.dataset.kind === "register" ? "/api/auth/register" : "/api/auth/login";
        state.user = (await api(path, { method: "POST", body: JSON.stringify(body) })).user;
        await loadCourses();
        return go("study");
      }
      if (e.target.id === "chatForm") {
        if (!course()) throw new Error("还没有选择课程。请先新增或选择课程。");
        const message = $("#chatInput")?.value.trim();
        if (!message) return;
        $("#chatInput").value = "";
        state.messages.push({ role: "user", content: message }, { role: "assistant", content: "正在根据云端课程资料思考..." });
        draw();
        const out = await api(`/api/courses/${course().id}/chat`, { method: "POST", body: JSON.stringify({ message, mode: "preview" }) });
        state.messages = out.messages || state.messages;
        return draw();
      }
      if (e.target.id === "profileForm") {
        state.user = (await api("/api/me/profile", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) })).user;
        state.notice = "资料已保存。";
        return draw();
      }
    } catch (err) {
      state.error = err.message;
      draw();
    }
  });

  root.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (!tab) return;
    const mode = tab.dataset.tab;
    const form = $("#loginForm");
    form.dataset.kind = mode;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === tab));
    document.querySelectorAll("[data-reg]").forEach((el) => (el.hidden = mode !== "register"));
    $(".primary-btn", form).textContent = mode === "register" ? "创建账号" : "登录";
  });

  boot();
})();