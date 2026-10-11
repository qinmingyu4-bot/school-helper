(() => {
  const VERSION = "20261008-final-nav-rescue-1.0.57";
  if (window.__studybridgeNavigationRescueV2 === VERSION) return;
  window.__studybridgeNavigationRescueV2 = VERSION;

  const routeMap = {
    profile: ["#profileCard", "#editProfileButton", ".profile-card"],
    community: ["#openSchoolCommunityButton", ".community-entry"],
    classmates: ["#openClassmatesButton", ".classmates-entry"],
    email: ["#openEmailReplyButton", ".email-helper-entry"],
    schedule: ["#openScheduleButton", ".schedule-entry", "#scheduleDashboard", ".schedule-dashboard"],
    study: ["#openStudyAreaButton", ".study-entry", "#studentViewButton"],
    developer: ["#creatorViewButton"]
  };

  const pageTitles = {
    profile: ["PERSONAL PROFILE", "个人资料", "管理头像、背景、学校、专业和 SB ID。"],
    community: ["COMMUNITY", "社区", "全部社区、学校频道和专业频道。"],
    classmates: ["CLASSMATES", "同学", "通过 SB ID 申请好友，通过后聊天。"],
    email: ["EMAIL COACH", "邮件回复助手", "粘贴邮件内容，生成英文回复。"],
    schedule: ["SCHEDULE", "时间表", "管理课程、考试、作业和 deadline。"],
    developer: ["CREATOR CONSOLE", "开发者端", "管理邀请码、用户、数据和系统状态。"]
  };

  let token = 0;

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function html(value) {
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "Request failed.");
    return data;
  }

  function installCss() {
    if ($("#studybridge-rescue-router-css")) return;
    const style = document.createElement("style");
    style.id = "studybridge-rescue-router-css";
    style.textContent = `
      body.sb-rescue-secondary #workspacePage > .topbar,
      body.sb-rescue-secondary #scheduleDashboard,
      body.sb-rescue-secondary #chatArea,
      body.sb-rescue-secondary #quickPrompts,
      body.sb-rescue-secondary #chatForm,
      body.sb-rescue-secondary #developerPanel { display:none !important; }
      body.sb-rescue-dev #workspacePage > .topbar,
      body.sb-rescue-dev #scheduleDashboard,
      body.sb-rescue-dev #chatArea,
      body.sb-rescue-dev #quickPrompts,
      body.sb-rescue-dev #chatForm,
      body.sb-rescue-dev #sbRescuePage { display:none !important; }
      #workspacePage { min-height:100dvh !important; overflow-y:auto !important; overflow-x:hidden !important; }
      #sbRescuePage { min-height:100dvh; padding:28px; background:linear-gradient(rgba(226,236,246,.72) 1px,transparent 1px),linear-gradient(90deg,rgba(226,236,246,.72) 1px,transparent 1px),#f4f7fb; background-size:34px 34px; color:#0b2344; }
      #sbRescuePage[hidden] { display:none !important; }
      .sb-page-head { display:flex; justify-content:space-between; gap:14px; max-width:1160px; margin:0 auto 18px; padding-bottom:16px; border-bottom:1px solid #d7e0ec; }
      .sb-page-head p { margin:0; color:#2f7d62; font-size:12px; font-weight:900; }
      .sb-page-head h2 { margin:4px 0; font-size:26px; line-height:1.1; }
      .sb-page-head span,.sb-muted { color:#52617a; font-size:13px; }
      .sb-body { display:grid; gap:14px; max-width:1160px; margin:0 auto; padding-bottom:56px; }
      .sb-card { padding:16px; border:1px solid #d7e0ec; border-radius:8px; background:rgba(255,255,255,.96); box-shadow:0 12px 30px rgba(25,36,58,.05); }
      .sb-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:14px; }
      .sb-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .sb-list { display:grid; gap:9px; }
      .sb-item { display:grid; gap:4px; padding:11px 12px; border:1px solid #dfe7f1; border-radius:8px; background:#fbfdff; }
      .sb-form { display:grid; gap:10px; }
      .sb-form label { display:grid; gap:5px; color:#52617a; font-size:12px; font-weight:850; }
      .sb-form input,.sb-form textarea,.sb-form select,.sb-row input { width:100%; border:1px solid #d7e0ec; border-radius:8px; padding:11px 12px; font:inherit; color:#0b2344; background:white; }
      .sb-form textarea { min-height:110px; resize:vertical; }
      .sb-btn { display:inline-grid; place-items:center; min-height:40px; padding:0 14px; border:1px solid #d7e0ec; border-radius:8px; background:white; color:#0b2344; font:inherit; font-weight:850; cursor:pointer; }
      .sb-btn.primary { border-color:transparent; color:white; background:linear-gradient(135deg,#1f3a5f,#2f7d62); }
      .sb-pill { display:inline-grid; place-items:center; min-height:24px; padding:0 9px; border-radius:999px; background:rgba(47,125,98,.1); color:#2f7d62; font-size:12px; font-weight:850; }
      .sb-hero { min-height:140px; border-radius:8px; background:linear-gradient(135deg,#1f3a5f,#65ad8d); }
      .sb-avatar { width:72px; height:72px; border:4px solid white; border-radius:10px; background:linear-gradient(135deg,#1f3a5f,#2f7d62); color:white; display:grid; place-items:center; font-size:24px; font-weight:900; overflow:hidden; }
      .sb-avatar img { width:100%; height:100%; object-fit:cover; }
      .community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton { pointer-events:auto !important; cursor:pointer !important; }
      .community-entry.active,.classmates-entry.active,.email-helper-entry.active,.schedule-entry.active,.study-entry.active,#creatorViewButton.active,#studentViewButton.active { border-color:#2f7d62 !important; }
    `;
    document.head.appendChild(style);
  }

  function workspace() {
    return $("#workspacePage") || $(".workspace");
  }

  function page() {
    const root = workspace();
    if (!root) return null;
    let node = $("#sbRescuePage", root);
    if (!node) {
      node = document.createElement("section");
      node.id = "sbRescuePage";
      root.appendChild(node);
    }
    return node;
  }

  function setActive(route) {
    all(".community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton,#creatorViewButton,#studentViewButton")
      .forEach((button) => button.classList.remove("active"));
    (routeMap[route] || []).forEach((selector) => all(selector).forEach((button) => button.classList.add("active")));
  }

  function setStudyVisible(show) {
    const root = workspace();
    ["#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"].forEach((selector) => {
      const node = $(selector, root) || $(selector);
      if (node) {
        node.hidden = !show;
        node.style.display = show ? "" : "none";
      }
    });
    const topbar = $(".topbar", root) || $(".topbar");
    if (topbar) {
      topbar.hidden = !show;
      topbar.style.display = show ? "" : "none";
    }
  }

  function skeleton(route, body) {
    const node = page();
    const [eyebrow, title, subtitle] = pageTitles[route] || pageTitles.profile;
    if (!node) return null;
    node.hidden = false;
    node.innerHTML = `
      <header class="sb-page-head">
        <div><p>${html(eyebrow)}</p><h2>${html(title)}</h2><span>${html(subtitle)}</span></div>
        <button class="sb-btn" type="button" data-sb-route="study">返回学习区</button>
      </header>
      <div class="sb-body">${body}</div>
    `;
    return node;
  }

  async function openRoute(route) {
    const current = ++token;
    installCss();
    localStorage.setItem("studybridge:lastRoute", route);
    setActive(route);
    const rescue = page();
    if (rescue) rescue.hidden = route === "study" || route === "developer";
    document.body.classList.toggle("sb-rescue-secondary", route !== "study" && route !== "developer");
    document.body.classList.toggle("sb-rescue-dev", route === "developer");
    setStudyVisible(route === "study");
    const dev = $("#developerPanel");
    if (dev) {
      dev.hidden = route !== "developer";
      dev.style.display = route === "developer" ? "block" : "none";
    }
    if (route === "study") return;
    if (route === "developer") return renderDeveloper(current);
    skeleton(route, `<div class="sb-card">正在打开...</div>`);
    try {
      if (route === "profile") await renderProfile(current);
      if (route === "community") await renderCommunity(current, "all");
      if (route === "classmates") await renderClassmates(current);
      if (route === "email") await renderEmail(current);
      if (route === "schedule") await renderSchedule(current);
    } catch (error) {
      if (current === token) skeleton(route, `<div class="sb-card"><strong>页面加载失败</strong><p class="sb-muted">${html(error.message || error)}</p></div>`);
    }
  }

  async function renderProfile(current) {
    const data = await api("/api/me");
    if (current !== token) return;
    const user = data.user || {};
    const profile = user.profile || {};
    const avatar = profile.avatarUrl ? `<img src="${html(profile.avatarUrl)}" alt="">` : html((user.name || "S").slice(0, 1).toUpperCase());
    const cover = profile.backgroundUrl ? ` style="background-image:url('${html(profile.backgroundUrl)}');background-size:cover;background-position:center"` : "";
    const node = skeleton("profile", `
      <section class="sb-grid">
        <article class="sb-card">
          <div class="sb-hero"${cover}></div>
          <div class="sb-row" style="margin-top:-38px;align-items:flex-end">
            <div class="sb-avatar">${avatar}</div>
            <div><h3 style="margin:0">${html(user.name || "StudyBridge Student")}</h3><p class="sb-muted">${html(profile.school || "未填写学校")} · ${html(profile.major || "未填写专业")}</p><p><strong>SB ID:</strong> ${html(profile.sbId || "未设置")}</p></div>
          </div>
        </article>
        <article class="sb-card">
          <h3 style="margin-top:0">编辑资料</h3>
          <form class="sb-form" id="sbProfileForm">
            <label>名字<input name="name" value="${html(user.name || "")}"></label>
            <label>学校<input name="school" value="${html(profile.school || "")}"></label>
            <label>专业<input name="major" value="${html(profile.major || "")}"></label>
            <label>SB ID<input name="sbId" value="${html(profile.sbId || "")}"></label>
            <label>头像图片链接<input name="avatarUrl" value="${html(profile.avatarUrl || "")}"></label>
            <label>背景图片链接<input name="backgroundUrl" value="${html(profile.backgroundUrl || "")}"></label>
            <button class="sb-btn primary" type="submit">保存资料</button><p class="sb-muted" id="sbProfileMsg"></p>
          </form>
        </article>
      </section>
    `);
    $("#sbProfileForm", node).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      $("#sbProfileMsg", node).textContent = "保存中...";
      try {
        await api("/api/me/profile", { method: "PUT", body: Object.fromEntries(form.entries()) });
        $("#sbProfileMsg", node).textContent = "已保存。";
        setTimeout(() => openRoute("profile"), 250);
      } catch (error) {
        $("#sbProfileMsg", node).textContent = error.message || "保存失败。";
      }
    });
  }

  async function renderCommunity(current, channel) {
    const data = await api(`/api/community?channel=${encodeURIComponent(channel)}`);
    if (current !== token) return;
    const posts = data.posts || data.items || [];
    const user = data.user || {};
    const node = skeleton("community", `
      <section class="sb-grid">
        <article class="sb-card">
          <h3 style="margin-top:0">频道</h3>
          <div class="sb-list">
            <button class="sb-btn" type="button" data-channel="all">全部社区</button>
            <button class="sb-btn" type="button" data-channel="school">学校社区：${html(user.profile?.school || "未填写学校")}</button>
            <button class="sb-btn" type="button" data-channel="major">专业社区：${html(user.profile?.major || "未填写专业")}</button>
          </div>
        </article>
        <article class="sb-card">
          <h3 style="margin-top:0">发布</h3>
          <form class="sb-form" id="sbPostForm"><input name="title" placeholder="标题"><textarea name="content" placeholder="写下你想讨论的内容"></textarea><button class="sb-btn primary" type="submit">发布</button><p class="sb-muted" id="sbPostMsg"></p></form>
        </article>
      </section>
      <section class="sb-card"><h3 style="margin-top:0">帖子</h3><div class="sb-list">${posts.length ? posts.map((post) => `<article class="sb-item"><strong>${html(post.title || "社区帖子")}</strong><span class="sb-muted">${html(post.authorName || post.author?.name || "StudyBridge user")}</span><p>${html(post.content || "")}</p></article>`).join("") : `<p class="sb-muted">当前频道还没有帖子。</p>`}</div></section>
    `);
    all("[data-channel]", node).forEach((button) => button.addEventListener("click", () => renderCommunity(++token, button.dataset.channel)));
    $("#sbPostForm", node).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        await api("/api/community/posts", { method: "POST", body: { title: form.get("title"), content: form.get("content"), channel } });
        renderCommunity(++token, channel);
      } catch (error) {
        $("#sbPostMsg", node).textContent = error.message || "发布失败。";
      }
    });
  }

  async function renderClassmates(current, selectedId = "") {
    const data = await api("/api/classmates");
    if (current !== token) return;
    const mates = data.classmates || [];
    const incoming = data.requests?.incoming || [];
    const outgoing = data.requests?.outgoing || [];
    const selected = mates.find((mate) => mate.id === selectedId) || mates[0];
    const chat = selected ? await classmateChat(selected) : `<p class="sb-muted">请选择一位同学开始聊天。</p>`;
    const node = skeleton("classmates", `
      <section class="sb-grid">
        <article class="sb-card">
          <h3 style="margin-top:0">添加同学</h3>
          <form class="sb-row" id="sbAddMate"><input name="sbId" placeholder="输入 SB ID，例如 adam2026" style="flex:1;min-width:180px"><button class="sb-btn primary" type="submit">发送申请</button></form><p class="sb-muted" id="sbMateMsg"></p>
          <details style="margin-top:12px"><summary><strong>申请列表</strong> ${incoming.length ? `<span class="sb-pill">${incoming.length}</span>` : ""}</summary><div class="sb-list" style="margin-top:10px">${incoming.length ? incoming.map((req) => `<article class="sb-item"><strong>${html(req.from?.name || "StudyBridge user")}</strong><span class="sb-muted">SB ID: ${html(req.from?.sbId || "")}</span><span class="sb-row"><button class="sb-btn primary" data-request-id="${html(req.id)}" data-action="accept">通过</button><button class="sb-btn" data-request-id="${html(req.id)}" data-action="ignore">忽略</button></span></article>`).join("") : `<p class="sb-muted">暂时没有好友申请。</p>`}${outgoing.length ? `<p class="sb-muted">已发送 ${outgoing.length} 个申请。</p>` : ""}</div></details>
          <h3>同学列表</h3><div class="sb-list">${mates.length ? mates.map((mate) => `<button class="sb-btn" type="button" data-mate="${html(mate.id)}" style="justify-content:flex-start;text-align:left"><strong>${html(mate.name || mate.peer?.name || "同学")}</strong><span class="sb-muted">SB ID: ${html(mate.sbId || mate.peer?.sbId || "")}</span></button>`).join("") : `<p class="sb-muted">还没有添加同学。</p>`}</div>
        </article>
        <article class="sb-card">${chat}</article>
      </section>
    `);
    $("#sbAddMate", node).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        await api("/api/classmates", { method: "POST", body: { sbId: form.get("sbId") } });
        renderClassmates(++token);
      } catch (error) {
        $("#sbMateMsg", node).textContent = error.message || "发送失败。";
      }
    });
    all("[data-request-id]", node).forEach((button) => button.addEventListener("click", async () => {
      await api(`/api/classmate-requests/${encodeURIComponent(button.dataset.requestId)}`, { method: "PATCH", body: { action: button.dataset.action } });
      renderClassmates(++token);
    }));
    all("[data-mate]", node).forEach((button) => button.addEventListener("click", () => renderClassmates(++token, button.dataset.mate)));
    const chatForm = $("#sbChatForm", node);
    if (chatForm && selected) {
      chatForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await api(`/api/classmates/${encodeURIComponent(selected.id)}/messages`, { method: "POST", body: { content: form.get("content") } });
        renderClassmates(++token, selected.id);
      });
    }
  }

  async function classmateChat(mate) {
    let messages = [];
    try {
      messages = (await api(`/api/classmates/${encodeURIComponent(mate.id)}/messages`)).messages || [];
    } catch {}
    return `<p style="margin:0;color:#2f7d62;font-size:12px;font-weight:900">DIRECT CHAT</p><h3 style="margin-top:4px">${html(mate.name || mate.peer?.name || "同学")}</h3><div class="sb-list" style="min-height:260px;margin:14px 0">${messages.length ? messages.map((msg) => `<div class="sb-item" style="max-width:78%;${msg.mine ? "margin-left:auto;background:#eef4ff" : ""}"><span>${html(msg.content)}</span><span class="sb-muted">${html(msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "")}</span></div>`).join("") : `<p class="sb-muted">还没有聊天记录。</p>`}</div><form class="sb-row" id="sbChatForm"><input name="content" placeholder="写一句话给同学" style="flex:1;min-width:200px"><button class="sb-btn primary" type="submit">发送</button></form>`;
  }

  async function firstCourse() {
    const data = await api("/api/courses");
    return (data.courses || [])[0] || null;
  }

  async function renderEmail(current) {
    if (current !== token) return;
    const node = skeleton("email", `<section class="sb-grid"><article class="sb-card"><h3 style="margin-top:0">收到的邮件</h3><form class="sb-form" id="sbEmailForm"><label>邮件原文<textarea name="emailText" placeholder="把邮件粘贴在这里"></textarea></label><label>你想怎么回复<textarea name="goal" placeholder="例如：礼貌申请延期 / 确认 meeting time"></textarea></label><button class="sb-btn primary" type="submit">生成回复</button><p class="sb-muted" id="sbEmailMsg"></p></form></article><article class="sb-card"><h3 style="margin-top:0">建议回复</h3><div id="sbEmailDraft" class="sb-muted" style="white-space:pre-wrap">生成后会显示邮件重点和英文回复。</div></article></section>`);
    $("#sbEmailForm", node).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      $("#sbEmailMsg", node).textContent = "生成中...";
      try {
        const course = await firstCourse();
        if (!course) throw new Error("请先创建一门课程，邮件助手会借用学习区 AI。");
        const result = await api(`/api/courses/${encodeURIComponent(course.id)}/chat`, { method: "POST", body: { mode: "email", message: `请帮我理解这封邮件并写一版专业自然的英文回复。\n\n邮件内容：${form.get("emailText")}\n\n我的回复目标：${form.get("goal")}\n\n请先中文总结重点，再给英文回复。` } });
        $("#sbEmailDraft", node).textContent = (result.messages || []).find((item) => item.role === "assistant")?.content || "没有收到 AI 回复。";
        $("#sbEmailMsg", node).textContent = "已生成。";
      } catch (error) {
        $("#sbEmailMsg", node).textContent = error.message || "生成失败。";
      }
    });
  }

  async function scheduleCourse(create) {
    const courses = await api("/api/courses");
    let course = (courses.courses || []).find((item) => item.name === "Schedule & Deadlines");
    if (!course && create) course = (await api("/api/courses", { method: "POST", body: { name: "Schedule & Deadlines", term: "StudyBridge planner" } })).course;
    return course;
  }

  function parseSchedule(doc) {
    try {
      return { ...JSON.parse(doc.text || "{}"), id: doc.id, documentId: doc.id };
    } catch {
      return null;
    }
  }

  async function loadSchedule() {
    const course = await scheduleCourse(false);
    if (!course) return { course: null, items: [] };
    const docs = await api(`/api/courses/${encodeURIComponent(course.id)}/documents`);
    return {
      course,
      items: (docs.documents || []).filter((doc) => String(doc.title || "").startsWith("[SCHEDULE_ITEM]") || doc.type === "Schedule").map(parseSchedule).filter(Boolean)
    };
  }

  async function renderSchedule(current) {
    const { course, items } = await loadSchedule();
    if (current !== token) return;
    const active = items.filter((item) => !item.completedAt);
    const done = items.filter((item) => item.completedAt);
    const node = skeleton("schedule", `<section class="sb-grid"><article class="sb-card"><h3 style="margin-top:0">新增提醒</h3><form class="sb-form" id="sbScheduleForm"><label>类型<select name="kind"><option value="deadline">Deadline</option><option value="exam">考试</option><option value="class">上课</option><option value="meeting">会议</option></select></label><label>标题<input name="title" placeholder="例如 ECO101 Essay 1"></label><label>课程<input name="course" placeholder="ECO101"></label><label>时间<input type="datetime-local" name="startsAt"></label><label>地点 / 提交入口<input name="location" placeholder="Quercus / 教室 / Zoom"></label><label>备注<textarea name="notes"></textarea></label><button class="sb-btn primary" type="submit">保存提醒</button><p class="sb-muted" id="sbScheduleMsg"></p></form></article><article class="sb-card"><h3 style="margin-top:0">未完成</h3><div class="sb-list">${active.length ? active.map((item) => scheduleItem(item, false)).join("") : `<p class="sb-muted">还没有未完成提醒。</p>`}</div><h3>已完成</h3><div class="sb-list">${done.length ? done.map((item) => scheduleItem(item, true)).join("") : `<p class="sb-muted">完成 deadline 后会进入这里。</p>`}</div></article></section>`);
    $("#sbScheduleForm", node).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const courseNow = course || await scheduleCourse(true);
      const item = Object.fromEntries(form.entries());
      item.completedAt = "";
      await api(`/api/courses/${encodeURIComponent(courseNow.id)}/documents`, { method: "POST", body: { title: `[SCHEDULE_ITEM] ${item.startsAt || ""} ${item.title || "Schedule item"}`, text: JSON.stringify(item), type: "Schedule" } });
      renderSchedule(++token);
    });
    all("[data-complete-schedule]", node).forEach((button) => button.addEventListener("click", async () => {
      const loaded = await loadSchedule();
      const item = loaded.items.find((row) => row.id === button.dataset.completeSchedule);
      if (!loaded.course || !item) return;
      item.completedAt = new Date().toISOString();
      await api(`/api/courses/${encodeURIComponent(loaded.course.id)}/documents/${encodeURIComponent(item.documentId)}`, { method: "PUT", body: { title: `[SCHEDULE_ITEM] ${item.startsAt || ""} ${item.title || "Schedule item"}`, text: JSON.stringify(item), type: "Schedule" } });
      renderSchedule(++token);
    }));
  }

  function scheduleItem(item, done) {
    return `<article class="sb-item"><div class="sb-row" style="justify-content:space-between"><div><strong>${html(item.title || "Schedule item")}</strong><span class="sb-muted">${html(item.course || "")} ${html(item.startsAt ? new Date(item.startsAt).toLocaleString() : "")} ${html(item.location || "")}</span></div>${done ? `<span class="sb-pill">已完成</span>` : `<button class="sb-btn primary" data-complete-schedule="${html(item.id)}">已完成</button>`}</div>${item.notes ? `<p class="sb-muted">${html(item.notes)}</p>` : ""}</article>`;
  }

  async function renderDeveloper(current) {
    const panel = $("#developerPanel");
    if (!panel) return;
    panel.hidden = false;
    panel.style.display = "block";
    panel.innerHTML = `<div class="panel-title"><div><p class="eyebrow">Creator Console</p><h3>开发者端</h3></div><button class="small-button" id="sbAdminRefresh" type="button">检测</button></div><section class="sb-card" style="margin:14px 0"><h3 style="margin-top:0">系统状态</h3><div class="sb-grid" id="sbAdminStatus"></div></section><section class="sb-grid"><article class="sb-card"><h3 style="margin-top:0">生成邀请码</h3><form class="sb-form" id="sbInviteForm"><input name="label" placeholder="备注：例如 Kevin / ECO101 小组"><select name="role"><option value="student">普通用户</option><option value="admin">Co-admin</option></select><input type="number" name="maxUses" min="1" max="100" value="1"><button class="sb-btn primary" type="submit">生成邀请码</button><p class="sb-muted" id="sbAdminMsg"></p></form><div class="sb-list" id="sbInviteList"></div></article><article class="sb-card"><h3 style="margin-top:0">学生数据</h3><div class="sb-list" id="sbUserList"></div></article></section>`;
    const load = async () => {
      const [status, overview] = await Promise.all([api("/api/admin/system-status"), api("/api/admin/overview")]);
      if (current !== token) return;
      $("#sbAdminStatus", panel).innerHTML = [
        ["当前版本", status.version?.app || "StudyBridge", status.version?.node || ""],
        ["数据库模式", status.database?.mode || "local", status.database?.note || ""],
        ["AI 是否正常", status.ai?.ok ? "正常" : "未确认", status.ai?.detail || ""],
        ["自动备份", status.backup?.ready ? "已启用" : "需要确认", status.backup?.note || ""],
        ["服务器自动同步", status.autoSync?.configured ? "已检测到" : "未确认", status.autoSync?.note || ""]
      ].map(([a,b,c]) => `<article class="sb-item"><span class="sb-muted">${html(a)}</span><strong>${html(b)}</strong><span class="sb-muted">${html(c)}</span></article>`).join("");
      $("#sbInviteList", panel).innerHTML = (overview.invites || []).map((invite) => `<article class="sb-item"><div class="sb-row" style="justify-content:space-between"><strong>${html(invite.code)}</strong><button class="sb-btn" data-copy="${html(invite.code)}">复制</button></div><span class="sb-muted">${html(invite.role || "user")} · ${html(invite.label || "")} · ${html(invite.used || 0)}/${html(invite.maxUses || 1)} used</span></article>`).join("") || `<p class="sb-muted">还没有邀请码。</p>`;
      $("#sbUserList", panel).innerHTML = (overview.users || []).map((user) => `<article class="sb-item"><strong>${html(user.name || "StudyBridge user")}</strong><span class="sb-muted">${html(user.email || "")} · ${html(user.role || "student")}</span><span class="sb-muted">${html(user.courseCount || 0)} courses · ${html(user.documentCount || 0)} docs · ${html(user.messageCount || 0)} chats</span></article>`).join("") || `<p class="sb-muted">还没有用户。</p>`;
      all("[data-copy]", panel).forEach((button) => button.addEventListener("click", async () => {
        await navigator.clipboard?.writeText(button.dataset.copy).catch(() => {});
        button.textContent = "已复制";
      }));
    };
    $("#sbAdminRefresh", panel).addEventListener("click", load);
    $("#sbInviteForm", panel).addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api("/api/admin/invites", { method: "POST", body: { label: form.get("label"), role: form.get("role"), maxUses: Number(form.get("maxUses") || 1) } });
      await load();
    });
    load().catch((error) => {
      $("#sbAdminStatus", panel).innerHTML = `<article class="sb-item"><strong>开发者端加载失败</strong><span class="sb-muted">${html(error.message || error)}</span></article>`;
    });
  }

  function routeFromTarget(target) {
    if (!target?.closest) return "";
    for (const [route, selectors] of Object.entries(routeMap)) {
      if (selectors.some((selector) => target.closest(selector))) return route;
    }
    return target.closest("[data-sb-route]")?.dataset.sbRoute || "";
  }

  function onNavigate(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  function init() {
    installCss();
    document.addEventListener("click", onNavigate, true);
    document.addEventListener("pointerup", onNavigate, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") onNavigate(event);
    }, true);
    window.studybridgeNavigationRescueOpen = openRoute;
    window.studybridgeDirectOpen = openRoute;
    const last = localStorage.getItem("studybridge:lastRoute");
    if (last && last !== "study") setTimeout(() => openRoute(last), 120);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
