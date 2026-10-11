(() => {
  const VERSION = "20261008-rescue-router-1.1.7";
  if (window.__studybridgeRescueRouter === VERSION) return;
  window.__studybridgeRescueRouter = VERSION;

  const ROUTE_KEY = "studybridge.route.v2";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const routes = [
    ["community", "社", "社区", "全部、学校和专业频道"],
    ["classmates", "友", "同学", "SB ID 申请和聊天"],
    ["email", "信", "邮件助手", "理解邮件并生成英文回复"],
    ["schedule", "时", "时间表", "Deadline 和课程提醒"],
    ["study", "学", "学习区", "课程资料、AI 对话和复习计划"],
    ["tools", "工", "工具", "SB Docs、Sheets、Slides"]
  ];

  let user = null;
  let currentRoute = "";
  let classmateId = "";
  let typingTimer = null;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readProfileImageFile(input, existingValue = "") {
    const file = input?.files?.[0];
    if (!file) return Promise.resolve(existingValue || "");
    if (!String(file.type || "").startsWith("image/")) {
      return Promise.reject(new Error("请上传图片文件。"));
    }
    if (file.size > 2 * 1024 * 1024) {
      return Promise.reject(new Error("图片太大，请选择 2MB 以下图片。"));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("图片读取失败，请重新选择。"));
      reader.readAsDataURL(file);
    });
  }

  function initial(name) {
    return String(name || "S").trim().slice(0, 1).toUpperCase() || "S";
  }

  function isAdmin() {
    const role = String(user?.role || "").toLowerCase();
    return role === "admin" || role === "co-admin";
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "include",
      cache: "no-store",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { error: text || "Request failed." };
    }
    if (!response.ok) throw new Error(body.error || "Request failed.");
    return body;
  }

  function installStyle() {
    if ($("#rescueRouterStyle")) return;
    const style = document.createElement("style");
    style.id = "rescueRouterStyle";
    style.textContent = `
      html, body { height: auto !important; min-height: 100%; overflow-y: auto !important; scroll-behavior: auto !important; }
      body.sb-rescue #appShell { min-height: 100vh !important; height: auto !important; overflow: visible !important; align-items: stretch !important; }
      body.sb-rescue .sidebar { min-height: 100vh !important; height: auto !important; max-height: none !important; overflow-y: auto !important; scroll-behavior: auto !important; }
      body.sb-rescue #workspacePage { min-height: 100vh !important; height: auto !important; max-height: none !important; overflow: visible !important; }
      body.sb-page-mode #workspacePage { display: block !important; }
      body.sb-study-mode #workspacePage { display: grid !important; grid-template-rows: auto minmax(540px, auto) auto auto !important; }
      body.sb-study-mode #chatArea { min-height: 540px !important; height: auto !important; max-height: none !important; overflow: visible !important; padding-bottom: 32px !important; }
      .rescue-nav { display: grid; gap: 10px; margin: 14px 0; }
      .rescue-nav-button {
        display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 12px; align-items: center;
        width: 100%; min-height: 54px; padding: 10px 12px; border: 1px solid var(--line, #d8dee8);
        border-radius: 8px; background: #fff; color: var(--ink, #071b3a); text-align: left; cursor: pointer;
      }
      .rescue-nav-button:hover, .rescue-nav-button.active { border-color: var(--green, #2f7d62); background: rgba(47, 125, 98, .05); }
      .rescue-nav-icon {
        display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px; color: #fff;
        background: linear-gradient(145deg, var(--navy, #224966), var(--green, #2f7d62)); font-weight: 900;
      }
      .rescue-nav-title { display: block; font-size: 15px; font-weight: 900; line-height: 1.2; }
      .rescue-nav-subtitle { display: block; margin-top: 2px; color: var(--muted, #5d6d86); font-size: 12px; line-height: 1.25; }
      .rescue-page { min-height: 100vh; padding: 28px; }
      .rescue-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 16px; margin-bottom: 18px; border-bottom: 1px solid var(--line, #d8dee8); }
      .rescue-header h2 { margin: 2px 0 5px; font-size: 30px; line-height: 1.05; }
      .rescue-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .rescue-card { border: 1px solid var(--line, #d8dee8); border-radius: 8px; background: rgba(255,255,255,.95); padding: 16px; box-shadow: 0 8px 26px rgba(25,36,58,.05); }
      .rescue-stack { display: grid; gap: 10px; }
      .rescue-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
      .rescue-list { display: grid; gap: 8px; }
      .rescue-item { border: 1px solid #dfe7f1; border-radius: 8px; background: #fff; padding: 12px; text-align: left; color: inherit; }
      button.rescue-item { cursor: pointer; }
      .rescue-item.active { border-color: var(--green, #2f7d62); background: rgba(47,125,98,.05); }
      .rescue-muted { color: var(--muted, #5d6d86); font-size: 13px; line-height: 1.5; }
      .rescue-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
      .rescue-chip { border-radius: 999px; background: #ecf6f2; color: #07533e; padding: 5px 10px; font-size: 12px; font-weight: 800; }
      .rescue-cover { min-height: 150px; border-radius: 8px; background: linear-gradient(135deg, var(--navy, #224966), var(--green, #2f7d62)); background-size: cover; background-position: center; }
      .rescue-avatar {
        display: grid; place-items: center; width: 72px; height: 72px; margin: -36px 0 0 16px; border: 4px solid #fff;
        border-radius: 8px; background: linear-gradient(145deg, var(--navy, #224966), var(--green, #2f7d62)); background-size: cover; background-position: center; color: #fff; font-weight: 900;
      }
      .rescue-messages { display: grid; gap: 10px; align-content: end; min-height: 380px; max-height: 560px; overflow-y: auto; padding: 14px; border: 1px solid #dfe7f1; border-radius: 8px; background: #f8fbff; }
      .rescue-dm { width: min(72%, 560px); padding: 10px 12px; border: 1px solid #d8dee8; border-radius: 8px; background: #fff; line-height: 1.45; }
      .rescue-dm.mine { justify-self: end; border-color: #cbd8f4; background: #eef4ff; }
      .rescue-dm-time { display: block; margin-top: 6px; color: var(--muted, #5d6d86); font-size: 11px; text-align: right; }
      .rescue-editor { min-height: 320px; font-size: 15px; line-height: 1.65; }
      @media (max-width: 980px) { .rescue-grid { grid-template-columns: 1fr; } .rescue-page { padding: 18px; } }
    `;
    document.head.appendChild(style);
  }

  async function refreshUser() {
    user = (await api("/api/me")).user;
    return user;
  }

  function pageHost() {
    const workspace = $("#workspacePage");
    if (!workspace) return null;
    let host = $("#rescuePage", workspace);
    if (!host) {
      host = document.createElement("section");
      host.id = "rescuePage";
      host.className = "rescue-page";
      workspace.appendChild(host);
    }
    $$("#rescuePage", workspace).forEach((node, index) => {
      if (index > 0) node.remove();
    });
    return host;
  }

  function studyNodes() {
    const workspace = $("#workspacePage");
    if (!workspace) return [];
    return [".topbar", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"]
      .map((selector) => workspace.querySelector(`:scope > ${selector}`))
      .filter(Boolean);
  }

  function setStudyVisible(visible) {
    const workspace = $("#workspacePage");
    if (!workspace) return;
    workspace.hidden = false;
    studyNodes().forEach((node) => {
      node.hidden = !visible;
      node.style.display = visible ? "" : "none";
    });
    const dev = $("#developerPanel");
    if (dev) dev.hidden = true;
    const host = pageHost();
    if (host) {
      host.hidden = visible;
      host.style.display = visible ? "none" : "block";
    }
  }

  function header(kicker, title, subtitle, back = true) {
    return `
      <header class="rescue-header">
        <div>
          <p class="eyebrow">${esc(kicker)}</p>
          <h2>${esc(title)}</h2>
          <p class="rescue-muted">${esc(subtitle)}</p>
        </div>
        ${back ? `<button class="small-button" type="button" data-rescue-route="study">返回学习区</button>` : ""}
      </header>
    `;
  }

  function installNav() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    $$("#sbStableNav, #sbDirectNav, #sbSixZoneNav, .sb-direct-nav, .six-zone-nav").forEach((node) => node.remove());
    let nav = $("#rescueNav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "rescueNav";
      nav.className = "rescue-nav";
      $("#profileCard")?.insertAdjacentElement("afterend", nav) || sidebar.prepend(nav);
    }
    const visibleRoutes = [...routes, ...(isAdmin() ? [["developer", "管", "开发者端", "邀请码、用户和系统状态"]] : [])];
    nav.innerHTML = visibleRoutes.map(([id, icon, title, subtitle]) => `
      <button class="rescue-nav-button ${id === currentRoute ? "active" : ""}" type="button" data-rescue-route="${id}">
        <span class="rescue-nav-icon">${esc(icon)}</span>
        <span>
          <span class="rescue-nav-title">${esc(title)}</span>
          <span class="rescue-nav-subtitle">${esc(subtitle)}</span>
        </span>
      </button>
    `).join("");
    const roleSwitch = $("#roleSwitch");
    if (roleSwitch) roleSwitch.hidden = !isAdmin();
  }

  function setActive(route) {
    currentRoute = route;
    $$("#rescueNav [data-rescue-route]").forEach((button) => {
      button.classList.toggle("active", button.dataset.rescueRoute === route);
    });
  }

  function schoolInfo(school) {
    const key = String(school || "").toLowerCase();
    if (!school) return null;
    if (key.includes("toronto")) return {
      title: "University of Toronto 概览",
      rows: ["QS 2026: #29", "Toronto, Ontario, Canada"],
      bullets: ["加拿大顶尖研究型大学", "St. George 市中心资源强", "适合科研、商科、CS、生命科学等方向"]
    };
    if (key.includes("centennial")) return {
      title: "Centennial College 概览",
      rows: ["Toronto, Ontario", "Career focused"],
      bullets: ["应用型课程较多", "适合就业导向项目", "建议结合项目页面确认 coop、placement 和课程要求"]
    };
    return {
      title: `${school} 概览`,
      rows: ["地点和排名待补充", "以学校官网为准"],
      bullets: ["StudyBridge 会把学校写入 AI 学习上下文", "回答会优先贴近学校、课程和学习需求", "之后可以继续补充院系、专业和课程代码"]
    };
  }

  async function showStudy() {
    await refreshUser();
    document.body.classList.add("sb-rescue", "sb-study-mode");
    document.body.classList.remove("sb-page-mode");
    setStudyVisible(true);
    installNav();
    setActive("study");
    localStorage.setItem(ROUTE_KEY, "study");
    const status = $("#statusLine");
    if (status) status.textContent = "对话已保存到云端。";
  }

  async function openRoute(route, options = {}) {
    try {
      await refreshUser();
      if (route === "developer" && !isAdmin()) route = "study";
      const valid = new Set([...routes.map((item) => item[0]), "profile", "developer"]);
      if (!valid.has(route)) route = "study";
      if (route === "study") {
        await showStudy();
        return;
      }
      document.body.classList.add("sb-rescue", "sb-page-mode");
      document.body.classList.remove("sb-study-mode");
      setStudyVisible(false);
      installNav();
      setActive(route);
      localStorage.setItem(ROUTE_KEY, route);
      const host = pageHost();
      host.innerHTML = `${header("StudyBridge", "正在打开", "正在准备这个页面...", true)}<section class="rescue-card">Loading...</section>`;
      const render = {
        profile: renderProfile,
        community: () => renderCommunity(options.channel || "all"),
        classmates: renderClassmates,
        email: renderEmail,
        schedule: renderSchedule,
        tools: renderTools,
        developer: renderDeveloper
      }[route];
      host.innerHTML = await render();
      bindPageEvents(route);
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (error) {
      const host = pageHost();
      if (host) {
        host.hidden = false;
        host.style.display = "block";
        host.innerHTML = `${header("StudyBridge", "页面没有打开成功", "这次不会让整站空白，错误会显示在这里。", true)}<section class="rescue-card"><strong>${esc(error.message)}</strong></section>`;
      }
    }
  }

  async function renderProfile() {
    const p = user.profile || {};
    const info = schoolInfo(p.school);
    return `
      ${header("Personal Profile", "个人资料", "头像、背景、学校、专业和 SB ID 都在这里管理。")}
      <section class="rescue-grid">
        <article class="rescue-card">
          <div class="rescue-cover" style="${p.backgroundUrl ? `background-image:url('${esc(p.backgroundUrl)}')` : ""}"></div>
          <div class="rescue-avatar" style="${p.avatarUrl ? `background-image:url('${esc(p.avatarUrl)}')` : ""}">${p.avatarUrl ? "" : esc(initial(user.name))}</div>
          <h3>${esc(user.name)}</h3>
          <p class="rescue-muted">${esc(p.school || "未填写学校")}${p.major ? ` · ${esc(p.major)}` : ""}</p>
          <p><strong>专业</strong> ${esc(p.major || "未填写")}</p>
          <p><strong>SB ID:</strong> ${esc(p.sbId || "系统会自动生成")}</p>
          ${info ? `<div class="rescue-item"><strong>${esc(info.title)}</strong><div class="rescue-chip-row" style="margin:10px 0">${info.rows.map((row) => `<span class="rescue-chip">${esc(row)}</span>`).join("")}</div><ul>${info.bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><p class="rescue-muted">学校信息是学习辅助参考，具体申请、专业和课程要求以学校官网为准。</p></div>` : ""}
        </article>
        <article class="rescue-card">
          <h3>编辑资料</h3>
          <form class="rescue-stack" id="rescueProfileForm">
            <label>姓名<input name="name" value="${esc(user.name || "")}" required></label>
            <label>学校<input name="school" value="${esc(p.school || "")}" placeholder="University of Toronto"></label>
            <label>专业<input name="major" value="${esc(p.major || "")}" placeholder="Finance / Computer Science / Business"></label>
            <label>SB ID<input name="sbId" value="${esc(p.sbId || "")}" placeholder="注册后只有一次自定义机会"></label>
            <label>头像图片上传<input name="avatarFile" type="file" accept="image/*"></label>
            <input name="avatarUrl" type="hidden" value="${esc(p.avatarUrl || "")}">
            <label>背景图片上传<input name="backgroundFile" type="file" accept="image/*"></label>
            <input name="backgroundUrl" type="hidden" value="${esc(p.backgroundUrl || "")}">
            <p class="rescue-muted">选择图片后点击保存；不选择会保留当前图片。</p>
            <button class="primary-button" type="submit">保存资料</button>
            <p class="form-message" id="rescueProfileMessage"></p>
          </form>
        </article>
      </section>
    `;
  }

  async function renderCommunity(channel) {
    const data = await api(`/api/community?channel=${encodeURIComponent(channel)}`).catch((error) => ({
      channel: { type: channel, label: channel },
      posts: [],
      error: error.message
    }));
    const posts = data.posts || [];
    return `
      ${header("Community", "社区", "全部社区默认开放，也可以进入学校或专业频道查看大家在聊什么。")}
      <section class="rescue-grid">
        <article class="rescue-card">
          <h3>频道</h3>
          <div class="rescue-list">
            ${["all", "school", "major"].map((item) => `
              <button class="rescue-item ${data.channel?.type === item ? "active" : ""}" type="button" data-community-channel="${item}">
                <strong>${item === "all" ? "全部社区" : item === "school" ? "学校社区" : "专业社区"}</strong>
                <p class="rescue-muted">${item === "school" ? (user.profile?.school || "先在 Profile 填学校") : item === "major" ? (user.profile?.major || "先在 Profile 填专业") : "所有公开讨论"}</p>
              </button>
            `).join("")}
          </div>
        </article>
        <article class="rescue-card">
          <h3>发布</h3>
          <form class="rescue-stack" id="rescueCommunityForm">
            <input name="topic" placeholder="主题，例如 ECO101 / 租房 / 作业">
            <textarea name="content" placeholder="写下你想问或分享的内容"></textarea>
            <label><input type="checkbox" name="anonymous" value="1"> 匿名发布</label>
            <button class="primary-button" type="submit">发布</button>
            <p class="form-message" id="rescueCommunityMessage">${data.error ? esc(data.error) : ""}</p>
          </form>
        </article>
      </section>
      <section class="rescue-card" style="margin-top:16px">
        <h3>${esc(data.channel?.label || "StudyBridge")}</h3>
        <div class="rescue-list">${posts.length ? posts.map((post) => `
          <article class="rescue-item">
            <strong>${esc(post.topic || "讨论")}</strong>
            <p class="rescue-muted">${esc(post.authorName || "同学")} · ${formatTime(post.createdAt)} · ${esc(post.channelLabel || "")}</p>
            <p>${esc(post.content || "")}</p>
          </article>
        `).join("") : `<p class="rescue-muted">还没有帖子，可以先发第一条。</p>`}</div>
      </section>
    `;
  }

  async function renderClassmates() {
    const data = await api("/api/classmates");
    const classmates = data.classmates || [];
    if (!classmateId && classmates[0]) classmateId = classmates[0].id;
    const selected = classmates.find((item) => item.id === classmateId);
    const messages = selected ? (await api(`/api/classmates/${encodeURIComponent(selected.id)}/messages`).catch(() => ({ messages: [] }))).messages || [] : [];
    const incoming = data.requests?.incoming || [];
    const outgoing = data.requests?.outgoing || [];
    return `
      ${header("Classmates", "同学", "通过 SB ID 发送好友申请，通过后可以聊天。")}
      <section class="rescue-grid">
        <article class="rescue-card">
          <h3>添加同学</h3>
          <p class="rescue-muted">当前学校：${esc(data.school || "未填写")}</p>
          <form class="rescue-row" id="rescueAddClassmateForm">
            <input name="sbId" placeholder="输入 SB ID，例如 adam2026" autocomplete="off">
            <button class="primary-button" type="submit">发送申请</button>
          </form>
          <p class="form-message" id="rescueClassmateMessage"></p>
          <details>
            <summary><strong>申请列表</strong>${incoming.length ? ` · ${incoming.length} 个待处理` : ""}</summary>
            <div class="rescue-list" style="margin-top:10px">
              ${incoming.length ? incoming.map((req) => `<div class="rescue-item"><strong>${esc(req.from?.name || "同学")}</strong><p class="rescue-muted">SB ID: ${esc(req.from?.sbId || "")}</p><button class="small-button" type="button" data-request-id="${esc(req.id)}" data-request-action="accept">通过</button> <button class="ghost-button" type="button" data-request-id="${esc(req.id)}" data-request-action="ignore">忽略</button></div>`).join("") : `<p class="rescue-muted">还没有好友申请。</p>`}
              ${outgoing.length ? `<p class="rescue-muted">已发送：${outgoing.map((req) => esc(req.to?.name || req.to?.sbId || "同学")).join("、")}</p>` : ""}
            </div>
          </details>
          <h3 style="margin-top:16px">同学列表</h3>
          <div class="rescue-list">${classmates.length ? classmates.map((item) => `
            <button class="rescue-item ${item.id === classmateId ? "active" : ""}" type="button" data-classmate-id="${esc(item.id)}">
              <strong>${esc(item.peer?.name || "同学")}</strong>
              <p class="rescue-muted">SB ID: ${esc(item.peer?.sbId || "")}</p>
              <p>${esc(item.lastMessage?.content || "")}</p>
            </button>
          `).join("") : `<p class="rescue-muted">还没有添加同学。输入对方的 SB ID 开始。</p>`}</div>
        </article>
        <article class="rescue-card">
          <p class="eyebrow">Direct Chat</p>
          <h3>${selected ? esc(selected.peer?.name || "同学") : "请选择一位同学"}</h3>
          ${selected ? `<p class="rescue-muted">${esc(selected.peer?.school || "")}${selected.peer?.major ? ` · ${esc(selected.peer.major)}` : ""} · SB ID: ${esc(selected.peer?.sbId || "")}</p>` : ""}
          <div class="rescue-messages">${messages.length ? messages.map((msg) => `
            <div class="rescue-dm ${msg.mine ? "mine" : ""}">${esc(msg.content || "")}<span class="rescue-dm-time">${formatTime(msg.createdAt)}</span></div>
          `).join("") : `<p class="rescue-muted">选择同学后，这里会显示聊天。</p>`}</div>
          <form class="rescue-row" id="rescueDirectMessageForm" style="margin-top:10px">
            <input name="content" placeholder="写一句话给同学" ${selected ? "" : "disabled"}>
            <button class="primary-button" type="submit" ${selected ? "" : "disabled"}>发送</button>
          </form>
        </article>
      </section>
    `;
  }

  async function ensureHelperCourse(name) {
    const data = await api("/api/courses");
    let course = (data.courses || []).find((item) => item.name === name);
    if (!course) course = (await api("/api/courses", { method: "POST", body: { name } })).course;
    return course;
  }

  async function askAi(message, mode = "assignment") {
    const course = await ensureHelperCourse("StudyBridge Tools");
    const result = await api(`/api/courses/${course.id}/chat`, { method: "POST", body: { mode, message } });
    return result.messages?.find((msg) => msg.role === "assistant")?.content || "没有生成内容。";
  }

  async function renderEmail() {
    return `
      ${header("Email Coach", "邮件回复助手", "粘贴邮件内容，StudyBridge 会帮你看懂并起草回复。")}
      <section class="rescue-grid">
        <article class="rescue-card rescue-stack">
          <h3>收到的邮件</h3>
          <textarea class="rescue-editor" id="rescueEmailSource" placeholder="把老师、TA、学校办公室或同学发来的邮件粘贴在这里"></textarea>
          <textarea id="rescueEmailIntent" placeholder="你想怎么回复，例如：申请延期 / 确认 meeting time / 解释会晚交"></textarea>
          <button class="primary-button" id="rescueEmailGenerate" type="button">生成回复</button>
        </article>
        <article class="rescue-card rescue-stack">
          <div class="rescue-row"><h3>建议回复</h3><button class="small-button" type="button" data-copy-target="rescueEmailOutput">复制</button></div>
          <textarea class="rescue-editor" id="rescueEmailOutput" placeholder="生成后会显示邮件重点和英文回复。"></textarea>
        </article>
      </section>
    `;
  }

  async function renderSchedule() {
    const courses = (await api("/api/courses")).courses || [];
    const docsByCourse = await Promise.all(courses.map(async (course) => {
      const docs = (await api(`/api/courses/${course.id}/documents`).catch(() => ({ documents: [] }))).documents || [];
      return docs
        .filter((doc) => /schedule|deadline|ddl|due/i.test(`${doc.title} ${doc.type} ${doc.text}`))
        .map((doc) => ({ ...doc, courseName: course.name }));
    }));
    const items = docsByCourse.flat();
    return `
      ${header("Schedule", "时间表", "手动记录课程、作业和 deadline，完成后可以移到已完成列表。")}
      <section class="rescue-grid">
        <article class="rescue-card">
          <h3>新增提醒</h3>
          <form class="rescue-stack" id="rescueScheduleForm">
            <input name="courseName" placeholder="课程，例如 ECO101">
            <input name="title" placeholder="任务，例如 Essay 1">
            <input name="dueAt" type="datetime-local">
            <input name="source" placeholder="来源，例如 Quercus / syllabus">
            <button class="primary-button" type="submit">加入时间表</button>
            <p class="form-message" id="rescueScheduleMessage"></p>
          </form>
        </article>
        <article class="rescue-card">
          <h3>全部提醒</h3>
          <div class="rescue-list">${items.length ? items.map((item) => `<div class="rescue-item"><strong>${esc(item.title)}</strong><p class="rescue-muted">${esc(item.courseName)} · ${esc(item.type || "Schedule")} · ${formatTime(item.createdAt)}</p><p>${esc(item.text || "")}</p><button class="small-button" type="button">已完成</button></div>`).join("") : `<p class="rescue-muted">暂时没有提醒。你可以手动添加，或上传 syllabus 后整理。</p>`}</div>
        </article>
      </section>
    `;
  }

  async function renderTools() {
    return `
      ${header("Study Tools", "工具", "像文档、表格和演示一样可以手动制作，AI 只是旁边的辅助工具。")}
      <section class="rescue-grid">
        <article class="rescue-card rescue-stack">
          <div class="rescue-chip-row">
            <button class="small-button active" type="button" data-tool-kind="docs">SB Docs</button>
            <button class="small-button" type="button" data-tool-kind="sheets">SB Sheets</button>
            <button class="small-button" type="button" data-tool-kind="slides">SB Slides</button>
          </div>
          <h3 id="rescueToolTitle">SB Docs</h3>
          <textarea class="rescue-editor" id="rescueToolEditor" placeholder="你可以直接在这里写 essay、report 或 reading response。"></textarea>
        </article>
        <article class="rescue-card rescue-stack">
          <h3>AI 助手</h3>
          <textarea id="rescueToolPrompt" placeholder="例如：帮我把左边这段改成 academic tone，或者生成 thesis 和 outline。"></textarea>
          <button class="primary-button" id="rescueToolAsk" type="button">调用 AI</button>
          <textarea class="rescue-editor" id="rescueToolOutput" placeholder="AI 结果会在这里，可以继续修改。"></textarea>
        </article>
      </section>
    `;
  }

  async function renderDeveloper() {
    if (!isAdmin()) throw new Error("只有开发者可以进入这个页面。");
    const [overview, status] = await Promise.all([
      api("/api/admin/overview"),
      api("/api/admin/system-status").catch(() => null)
    ]);
    const statusCards = status ? [
      ["当前版本", status.version?.app || "unknown", `Node ${status.version?.node || ""}`],
      ["最后部署时间", status.deploy?.lastCodeUpdateAt ? formatTime(status.deploy.lastCodeUpdateAt) : "未检测到", "按服务器文件时间显示。"],
      ["数据库模式", status.database?.mode || "local", status.database?.ok ? "Local database is readable and writable." : "数据库需要检查。"],
      ["AI 是否正常", status.ai?.ok ? "正常" : "未确认", status.ai?.model ? `Current model ${status.ai.model}` : "检测接口未返回模型。"],
      ["Google 登录", status.google?.enabled ? "已配置" : "未配置", "普通邮箱注册仍可用。"],
      ["邮箱验证码", status.email?.verificationRequired ? "需要" : "非必需", status.email?.sendingConfigured ? "真实发送已配置。" : "当前暂不强制邮箱发送。"],
      ["服务器自动同步", status.autoSync?.detected ? "已检测到" : "未确认", status.autoSync?.detected ? "Server auto-sync script was detected." : "需要检查服务器同步脚本。"],
      ["管理接口", "正常", "可以读取用户、邀请码和重置申请。"]
    ] : [["系统状态", "暂时读取失败", "请稍后重新检测。"]];
    return `
      ${header("Creator Console", "开发者端", "只负责监管、邀请码、用户、系统状态和密码重置。")}
      <section class="rescue-card">
        <div class="rescue-row"><h3>系统状态</h3><button class="small-button" type="button" data-admin-refresh>检测</button></div>
        <div class="rescue-grid">${statusCards.map(([a, b, c]) => `<div class="rescue-item"><p class="eyebrow">${esc(a)}</p><strong>${esc(b)}</strong><p class="rescue-muted">${esc(c)}</p></div>`).join("")}</div>
      </section>
      <section class="rescue-grid" style="margin-top:16px">
        <article class="rescue-card">
          <h3>邀请码</h3>
          <form class="rescue-stack" id="rescueInviteForm">
            <input name="label" placeholder="备注：例如 Kevin / ECO101 小组">
            <div class="rescue-row"><input name="maxUses" type="number" min="1" max="100" value="1"><select name="role"><option value="student">普通用户</option><option value="admin">Co-admin</option></select></div>
            <button class="primary-button" type="submit">生成邀请码</button>
            <p class="form-message" id="rescueAdminMessage"></p>
          </form>
          <div class="rescue-list" style="margin-top:14px">${(overview.invites || []).map((invite) => `<div class="rescue-item"><strong>${esc(invite.code)}</strong><p class="rescue-muted">${esc(invite.role)} · ${esc(invite.label || "")} · ${invite.uses}/${invite.maxUses} used</p><button class="small-button" type="button" data-copy="${esc(invite.code)}">复制</button> <button class="ghost-button" type="button" data-invite-toggle="${esc(invite.id)}" data-active="${invite.active}">${invite.active ? "停用" : "启用"}</button></div>`).join("")}</div>
        </article>
        <article class="rescue-card">
          <h3>用户</h3>
          <div class="rescue-list">${(overview.users || []).map((u) => `<div class="rescue-item"><strong>${esc(u.name)}</strong><p class="rescue-muted">${esc(u.email)} · ${esc(u.role)}${u.inviteCode ? ` · 邀请码: ${esc(u.inviteCode)}` : ""}</p><div class="rescue-chip-row"><span class="rescue-chip">${u.stats?.courses || 0} courses</span><span class="rescue-chip">${u.stats?.documents || 0} docs</span><span class="rescue-chip">${u.stats?.messages || 0} chats</span></div></div>`).join("")}</div>
        </article>
      </section>
    `;
  }

  function bindPageEvents(route) {
    if (route === "profile") {
      $("#rescueProfileForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = $("#rescueProfileMessage");
        if (message) message.textContent = "正在保存...";
        try {
          const body = Object.fromEntries(new FormData(event.currentTarget).entries());
          body.avatarUrl = await readProfileImageFile(event.currentTarget.elements.avatarFile, body.avatarUrl || "");
          body.backgroundUrl = await readProfileImageFile(event.currentTarget.elements.backgroundFile, body.backgroundUrl || "");
          delete body.avatarFile;
          delete body.backgroundFile;
          const result = await api("/api/me/profile", { method: "PUT", body });
          user = result.user;
          if (message) message.textContent = "已保存。";
          await openRoute("profile");
        } catch (error) {
          if (message) message.textContent = error.message;
        }
      });
    }
    if (route === "community") {
      $$("[data-community-channel]").forEach((button) => button.addEventListener("click", () => openRoute("community", { channel: button.dataset.communityChannel })));
      $("#rescueCommunityForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(event.currentTarget).entries());
        body.anonymous = Boolean(body.anonymous);
        body.channel = $("[data-community-channel].active")?.dataset.communityChannel || "all";
        await api("/api/community/posts", { method: "POST", body });
        await openRoute("community", { channel: body.channel });
      });
    }
    if (route === "classmates") {
      $("#rescueAddClassmateForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = $("#rescueClassmateMessage");
        if (message) message.textContent = "正在发送申请...";
        try {
          const result = await api("/api/classmates", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget).entries()) });
          if (message) message.textContent = result.status === "pending" ? "申请已发送，等待对方通过。" : "已经是同学了。";
          window.setTimeout(() => openRoute("classmates"), 500);
        } catch (error) {
          if (message) message.textContent = error.message;
        }
      });
      $$("[data-request-id]").forEach((button) => button.addEventListener("click", async () => {
        await api(`/api/classmate-requests/${button.dataset.requestId}`, { method: "PATCH", body: { action: button.dataset.requestAction } });
        await openRoute("classmates");
      }));
      $$("[data-classmate-id]").forEach((button) => button.addEventListener("click", () => {
        classmateId = button.dataset.classmateId;
        openRoute("classmates");
      }));
      $("#rescueDirectMessageForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const content = String(new FormData(event.currentTarget).get("content") || "").trim();
        if (!classmateId || !content) return;
        await api(`/api/classmates/${encodeURIComponent(classmateId)}/messages`, { method: "POST", body: { content } });
        await openRoute("classmates");
      });
    }
    if (route === "email") {
      $("#rescueEmailGenerate")?.addEventListener("click", async () => {
        const output = $("#rescueEmailOutput");
        const source = $("#rescueEmailSource")?.value || "";
        const intent = $("#rescueEmailIntent")?.value || "";
        if (!source.trim()) {
          output.value = "先把邮件内容贴进左边。";
          return;
        }
        output.value = "正在生成...";
        output.value = await askAi(`请帮我理解并回复这封邮件。\n\n邮件原文:\n${source}\n\n我想表达:\n${intent}`);
      });
    }
    if (route === "schedule") {
      $("#rescueScheduleForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        const course = await ensureHelperCourse(data.courseName || "Schedule & Deadlines");
        await api(`/api/courses/${course.id}/documents`, {
          method: "POST",
          body: {
            title: `[SCHEDULE_ITEM] ${data.title || "Deadline"}`,
            type: "Schedule",
            text: `Course: ${data.courseName || course.name}\nTask: ${data.title || "Deadline"}\nDue: ${data.dueAt || "Unknown"}\nSource: ${data.source || "Manual"}`
          }
        });
        await openRoute("schedule");
      });
    }
    if (route === "tools") {
      const labels = {
        docs: ["SB Docs", "你可以直接在这里写 essay、report 或 reading response。"],
        sheets: ["SB Sheets", "你可以用文字表格或 CSV 的方式整理计划、分数和任务。"],
        slides: ["SB Slides", "你可以写每页 PPT 的标题、要点和讲稿。"]
      };
      $$("[data-tool-kind]").forEach((button) => button.addEventListener("click", () => {
        $$("[data-tool-kind]").forEach((item) => item.classList.toggle("active", item === button));
        const [title, placeholder] = labels[button.dataset.toolKind] || labels.docs;
        $("#rescueToolTitle").textContent = title;
        $("#rescueToolEditor").placeholder = placeholder;
      }));
      $("#rescueToolAsk")?.addEventListener("click", async () => {
        const output = $("#rescueToolOutput");
        output.value = "正在生成...";
        output.value = await askAi(`${$("#rescueToolPrompt")?.value || ""}\n\n当前草稿:\n${$("#rescueToolEditor")?.value || ""}`);
      });
    }
    if (route === "developer") {
      $("[data-admin-refresh]")?.addEventListener("click", () => openRoute("developer"));
      $("#rescueInviteForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const result = await api("/api/admin/invites", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget).entries()) });
        const msg = $("#rescueAdminMessage");
        if (msg) msg.textContent = `已生成：${result.invite.code}`;
        window.setTimeout(() => openRoute("developer"), 500);
      });
      $$("[data-invite-toggle]").forEach((button) => button.addEventListener("click", async () => {
        await api(`/api/admin/invites/${button.dataset.inviteToggle}`, { method: "PATCH", body: { active: button.dataset.active !== "true" } });
        await openRoute("developer");
      }));
    }
    $$("[data-copy]").forEach((button) => button.addEventListener("click", () => navigator.clipboard?.writeText(button.dataset.copy || "")));
    $$("[data-copy-target]").forEach((button) => button.addEventListener("click", () => {
      const value = document.getElementById(button.dataset.copyTarget)?.value || "";
      navigator.clipboard?.writeText(value);
    }));
  }

  function installEvents() {
    if (window.__studybridgeRescueEvents) return;
    window.__studybridgeRescueEvents = true;
    document.addEventListener("click", (event) => {
      const routeButton = event.target.closest?.("[data-rescue-route]");
      if (routeButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openRoute(routeButton.dataset.rescueRoute);
        return;
      }
      if (event.target.closest?.("#profileCard, #editProfileButton")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openRoute("profile");
      }
    }, true);
    $("#studentViewButton")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openRoute("study");
    }, true);
    $("#creatorViewButton")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openRoute("developer");
    }, true);
  }

  function typeLastAssistantMessage() {
    if (typingTimer) window.clearInterval(typingTimer);
    const messages = $$("#chatArea .message.assistant .message-content, #chatArea .assistant .message-content, #chatArea .ai-message, #chatArea .message-bubble");
    const last = messages[messages.length - 1];
    if (!last || last.dataset.typed === "1") return;
    const full = last.textContent || "";
    if (full.length < 20) return;
    last.dataset.typed = "1";
    last.textContent = "";
    let index = 0;
    typingTimer = window.setInterval(() => {
      index += Math.max(1, Math.ceil(full.length / 120));
      last.textContent = full.slice(0, index);
      if (index >= full.length) window.clearInterval(typingTimer);
    }, 18);
  }

  async function boot() {
    const shell = $("#appShell");
    if (!shell || shell.hidden) return false;
    installStyle();
    try {
      await refreshUser();
    } catch {
      return false;
    }
    document.body.classList.add("sb-rescue");
    installNav();
    installEvents();
    const saved = localStorage.getItem(ROUTE_KEY) || "study";
    await openRoute(saved === "developer" && !isAdmin() ? "study" : saved);
    return true;
  }

  function start() {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      if ((await boot()) || attempts > 60) return;
      window.setTimeout(tick, 250);
    };
    tick();
    const chat = $("#chatArea");
    if (chat) new MutationObserver(typeLastAssistantMessage).observe(chat, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
