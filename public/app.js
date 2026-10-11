(function () {
  "use strict";

  const VERSION = "1.1.50";
  const STUDENT_PAGES = ["community", "classmates", "email", "schedule", "study", "tools", "profile"];
  const ADMIN_PAGES = ["admin"];
  const SCHEDULE_COURSE = "Schedule & Deadlines";
  const SCHEDULE_PREFIX = "[SCHEDULE_ITEM]";
  const SUPPORTED_UPLOAD_ACCEPT = [
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".txt", ".md", ".csv", ".json",
    ".png", ".jpg", ".jpeg", ".webp", ".gif"
  ].join(",");
  const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

  const root = document.getElementById("root");
  const state = {
    version: VERSION,
    user: null,
    mode: "student",
    page: "study",
    courses: [],
    activeCourseId: "",
    docs: [],
    messages: [],
    allDocs: [],
    scheduleItems: [],
    communityChannel: "all",
    community: null,
    classmates: null,
    activeClassmateId: "",
    directMessages: [],
    admin: null,
    status: null,
    googleEnabled: false,
    toast: "",
    busy: false,
    uploadFiles: []
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const readProfileImageFile = (input, existingValue = "") =>
    new Promise((resolve, reject) => {
      const file = input?.files?.[0];
      if (!file) return resolve(existingValue || "");
      if (!file.type.startsWith("image/")) return reject(new Error("请上传图片文件。"));
      if (file.size > 2 * 1024 * 1024) return reject(new Error("图片太大，请选择 2 MB 以内的图片。"));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("图片读取失败，请换一个文件再试。"));
      reader.readAsDataURL(file);
    });
  const initials = (name) => String(name || "SB").trim().slice(0, 1).toUpperCase() || "S";
  const isAdmin = () => ["admin", "co-admin"].includes(String(state.user?.role || "").toLowerCase());
  const profile = () => state.user?.profile || {};
  const profileSbId = (user = state.user) => String(user?.profile?.sbId || "").trim();
  const hasProfileSchool = () => Boolean(String(profile().school || "").trim());
  const formatFileSize = (size = 0) => {
    const bytes = Number(size) || 0;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${bytes} B`;
  };

  const pageLabels = {
    community: ["社", "社区", "全部、学校和专业频道"],
    classmates: ["友", "同学", "SB ID 申请和聊天"],
    email: ["信", "邮件助手", "理解邮件并生成英文回复"],
    schedule: ["时", "时间表", "Deadline 和课程提醒"],
    study: ["学", "学习区", "课程资料、AI 对话和复习计划"],
    tools: ["工", "工具", "SB Docs、Sheets、Slides"],
    profile: ["人", "个人资料", "头像、学校、专业和 SB ID"],
    admin: ["管", "开发者端", "邀请码、用户和系统状态"]
  };

  const schoolFacts = {
    "university of toronto": {
      name: "University of Toronto",
      rank: "QS 2026: #29",
      place: "Toronto, Ontario, Canada",
      points: ["加拿大顶尖研究型大学", "St. George 市中心资源强", "适合科研、商科、CS、生命科学等方向"]
    },
    "centennial college": {
      name: "Centennial College",
      rank: "College",
      place: "Toronto, Ontario, Canada",
      points: ["偏应用和就业导向", "课程常包含项目、实习和行业训练", "适合需要技能型路径的学生"]
    },
    "university of british columbia": {
      name: "University of British Columbia",
      rank: "QS 2026: Top 50",
      place: "Vancouver / Kelowna, BC, Canada",
      points: ["研究实力强", "校园资源和国际学生支持丰富", "适合科研、工程、商科、环境方向"]
    },
    "university of waterloo": {
      name: "University of Waterloo",
      rank: "QS 2026: Top 120",
      place: "Waterloo, Ontario, Canada",
      points: ["Co-op 实习体系非常强", "CS、工程、数学和创业氛围突出", "适合重视实习和就业的学生"]
    }
  };

  async function api(path, options = {}) {
    const init = { credentials: "same-origin", ...options };
    if (init.body && typeof init.body !== "string" && !(init.body instanceof FormData)) {
      init.headers = { "content-type": "application/json", ...(init.headers || {}) };
      init.body = JSON.stringify(init.body);
    }
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `请求失败 (${response.status})`);
    return data;
  }

  function setToast(message) {
    state.toast = message || "";
    if (message) window.setTimeout(() => {
      if (state.toast === message) {
        state.toast = "";
        if (state.user) root.querySelector(".toast")?.remove();
        else render();
      }
    }, 2600);
  }

  function setPage(page) {
    if (state.mode === "admin") page = "admin";
    if (state.mode !== "admin" && !STUDENT_PAGES.includes(page)) page = "study";
    state.page = page;
    localStorage.setItem("studybridge.page", page);
    history.replaceState(null, "", `${location.pathname}?page=${encodeURIComponent(page)}&v=${VERSION}`);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function dueText(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const diff = date.getTime() - Date.now();
    if (diff <= 0) return "已到期";
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    if (days > 0) return `${days}天${restHours}小时`;
    return `${Math.max(1, restHours)}小时`;
  }

  function formatInlineText(text) {
    let safe = esc(text || "");
    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    safe = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
    return safe;
  }

  function parseMarkdownTable(lines, start) {
    const header = lines[start];
    const divider = lines[start + 1];
    if (!header || !divider) return null;
    const hasTableShape = (line) => {
      const trimmed = String(line || "").trim();
      return trimmed.startsWith("|") && trimmed.endsWith("|") && (trimmed.match(/\|/g) || []).length >= 2;
    };
    const isDivider = (line) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(String(line || "").trim());
    if (!hasTableShape(header) || !hasTableShape(divider) || !isDivider(divider)) return null;

    const rows = [];
    let index = start;
    while (index < lines.length && hasTableShape(lines[index])) {
      if (!isDivider(lines[index])) {
        rows.push(lines[index].trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
      }
      index += 1;
    }
    if (rows.length < 2) return null;
    const head = rows[0];
    const body = rows.slice(1);
    const html = `
      <div class="markdown-table-wrap">
        <table class="markdown-table">
          <thead><tr>${head.map((cell) => `<th>${formatInlineText(cell)}</th>`).join("")}</tr></thead>
          <tbody>${body.map((row) => `<tr>${head.map((_, cellIndex) => `<td>${formatInlineText(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    `;
    return { html, next: index };
  }

  function formatText(text) {
    const lines = String(text || "").split(/\r?\n/);
    const blocks = [];
    let paragraph = [];
    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(`<p>${paragraph.map(formatInlineText).join("<br>")}</p>`);
      paragraph = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
      const table = parseMarkdownTable(lines, index);
      if (table) {
        flushParagraph();
        blocks.push(table.html);
        index = table.next - 1;
        continue;
      }

      if (!lines[index].trim()) {
        flushParagraph();
        continue;
      }
      paragraph.push(lines[index]);
    }
    flushParagraph();
    return blocks.join("");
  }

  function authHtml(mode = "login") {
    const register = mode === "register";
    return `
      <main class="auth-shell">
        <section class="auth-card">
          <div class="brand-row">
            <div class="brand-mark">SB</div>
            <div><span>STUDYBRIDGE CLOUD</span><strong>StudyBridge</strong></div>
          </div>
          <div class="segmented">
            <button data-action="auth-tab" data-tab="login" class="${register ? "" : "active"}">登录</button>
            <button data-action="auth-tab" data-tab="register" class="${register ? "active" : ""}">注册</button>
          </div>
          ${register ? `<label>姓名<input id="authName" placeholder="你的名字"></label>` : ""}
          <label>Email<input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
          <label>密码<input id="authPassword" type="password" autocomplete="${register ? "new-password" : "current-password"}" placeholder="至少 8 位"></label>
          ${register ? `
            <label>确认密码<input id="authPasswordConfirm" type="password" autocomplete="new-password" placeholder="再输入一次密码"></label>
            <label>邀请码<input id="authInvite" placeholder="向创作者索取邀请码"></label>
            <div class="inline-fields">
              <input id="authEmailCode" placeholder="邮箱验证码（可先不填）">
              <button data-action="send-email-code">发送验证码</button>
            </div>
          ` : ""}
          <div class="or-line"><span>or</span></div>
          <button class="ghost wide" data-action="google-login" ${state.googleEnabled ? "" : "disabled"}>Google 登录${state.googleEnabled ? "" : "待配置"}</button>
          <button class="primary wide" data-action="${register ? "register" : "login"}">${register ? "创建账号" : "登录"}</button>
          ${register ? "" : `<button class="link-button" data-action="forgot-password">忘记密码？</button>`}
          ${state.toast ? `<p class="notice">${esc(state.toast)}</p>` : ""}
        </section>
      </main>
    `;
  }

  function sidebarHtml() {
    const p = profile();
    const navOrder = ["community", "classmates", "email", "schedule", "study", "tools"];
    const userNav = navOrder.map((page) => navButton(page)).join("");
    const devSwitch = isAdmin()
      ? `<div class="mode-switch">
          <button class="${state.mode === "student" ? "active" : ""}" data-action="mode-student">普通用户端</button>
          <button class="${state.mode === "admin" ? "active" : ""}" data-action="mode-admin">开发者端</button>
        </div>`
      : "";
    return `
      <aside class="sidebar">
        <header class="side-head">
          <div class="brand-mark">SB</div>
          <div><strong>StudyBridge</strong><span>${esc(state.user.name)} | ${esc(state.user.email)}</span></div>
          <button data-action="logout">退出</button>
        </header>
        ${state.mode === "student" ? `
          <button class="profile-card ${state.page === "profile" ? "active" : ""}" data-page="profile">
            <div class="cover" style="${p.backgroundUrl ? `background-image:url('${esc(p.backgroundUrl)}')` : ""}">
              ${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<b>${esc(initials(state.user.name))}</b>`}
            </div>
            <div>
              <h3>${esc(state.user.name)}</h3>
              <p>${esc([p.school, p.major].filter(Boolean).join(" · ") || "完善学校和专业")}</p>
              <strong>SB ID: ${esc(profileSbId() || "未设置")}</strong>
            </div>
            <span>打开</span>
          </button>
          <nav class="side-nav">${userNav}</nav>
        ` : ""}
        ${devSwitch}
        ${state.mode === "student" ? studySidebarHtml() : adminSideHint()}
      </aside>
    `;
  }

  function navButton(page) {
    const [icon, title, sub] = pageLabels[page];
    const active = state.page === page ? "active" : "";
    return `
      <button class="nav-card ${active}" data-page="${page}">
        <span>${esc(icon)}</span>
        <b>${esc(title)}</b>
        <small>${esc(page === "schedule" && nextDue() ? `${nextDue().title} · 还有 ${dueText(nextDue().startsAt)}` : sub)}</small>
      </button>
    `;
  }

  function studySidebarHtml() {
    return `
      <section class="side-section" data-doc-dropzone="true">
        <div class="section-title"><b>课程</b><button data-action="add-course">新增</button></div>
        <div class="course-list">
          ${state.courses.length ? state.courses.map((course) => `
            <button class="course-item ${course.id === state.activeCourseId ? "active" : ""}" data-action="select-course" data-id="${esc(course.id)}">
              <b>${esc(course.name)}</b><small>${esc(course.term || "Current term")}</small>
              <span data-action="delete-course" data-id="${esc(course.id)}">×</span>
            </button>
          `).join("") : `<p class="muted">还没有课程。可以新增课程后开始保存资料。</p>`}
        </div>
      </section>
      <section class="side-section">
        <div class="section-title"><b>课程资料</b><span>${state.docs.length}</span></div>
        <textarea id="docText" placeholder="粘贴 syllabus、lecture notes、rubric、deadline 或样卷文字"></textarea>
        <div class="inline-fields">
          <input id="docTitle" placeholder="资料标题">
          <button data-action="save-doc">保存</button>
        </div>
        <div class="inline-fields">
          <input id="docFile" type="file" accept="${SUPPORTED_UPLOAD_ACCEPT}" multiple>
          <button data-action="upload-doc">上传文件</button>
        </div>
        ${state.docs.length ? state.docs.map((doc) => `<div class="mini-row"><b>${esc(doc.title)}</b><small>${esc(doc.type || "Note")}</small></div>`).join("") : `<p class="muted">还没有云端课程资料。</p>`}
      </section>
      <section class="side-section">
        <div class="section-title"><b>Learning Style</b><span>Saved</span></div>
        ${prefBox("englishTerms", "保留 English terms")}
        ${prefBox("englishAnswers", "英文作答 / 英文草稿")}
        ${prefBox("chineseExplanations", "中文拆解 reasoning")}
        <textarea id="customInstruction" placeholder="默认：中文问中文答，英文问英文答。需要双语时可写：请用 English answer + 中文 reasoning。">${esc(state.user.preferences?.customInstruction || "")}</textarea>
        <button data-action="save-prefs">保存偏好</button>
      </section>
    `;
  }

  function prefBox(key, label) {
    const checked = key === "englishTerms" ? (state.user.preferences?.[key] !== false ? "checked" : "") : (state.user.preferences?.[key] === true ? "checked" : "");
    return `<label class="check"><input id="${key}" type="checkbox" ${checked}>${esc(label)}</label>`;
  }

  function adminSideHint() {
    return `<section class="side-section"><p class="muted">开发者端只保留监管、邀请码、用户、系统状态和密码重置。</p></section>`;
  }

  function shellHtml(content) {
    return `
      <div class="app-shell">
        ${sidebarHtml()}
        <main class="workspace${state.mode !== "admin" && state.page === "study" ? " study-workspace" : ""}" id="workspace" data-course-id="${esc(state.activeCourseId)}">
          ${content}
        </main>
      </div>
    `;
  }

  function pageHeader(kicker, title, subtitle, back = true) {
    return `
      <header class="page-header">
        <div><span>${esc(kicker)}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
        ${back && state.page !== "study" ? `<button data-page="study">返回学习区</button>` : ""}
      </header>
    `;
  }

  function routeHtml() {
    if (!state.user) return authHtml();
    if (state.mode === "admin") return shellHtml(adminPage());
    const pages = {
      study: studyPage,
      community: communityPage,
      classmates: classmatesPage,
      email: emailPage,
      schedule: schedulePage,
      tools: toolsPage,
      profile: profilePage
    };
    return shellHtml((pages[state.page] || studyPage)());
  }

  function studyPage() {
    const course = state.courses.find((item) => item.id === state.activeCourseId);
    return `
      <header class="page-header"><div><h1>${esc(course?.name || "请选择课程")}</h1></div></header>
      ${upcomingBanner()}
      <section class="chat-area">
        <div class="messages" id="messages">
          ${state.messages.length ? state.messages.map(messageHtml).join("") : `<div class="message ai"><b>AI</b><div>欢迎回来。先保存课程资料，然后问我预习、复习、deadline、作业要求或模拟考试。</div></div>`}
        </div>
      </section>
      ${composerHtml()}
    `;
  }

  function upcomingBanner() {
    const due = nextDue();
    if (!due) return `<section class="deadline-banner"><div><span>暂无 upcoming deadline</span><b>添加作业、考试或课程提醒后，这里会显示最近时间。</b></div></section>`;
    return `
      <section class="deadline-banner" data-page="schedule">
        <div><span>最近要做</span><b>${esc(due.title)}</b><p>${esc(due.course || "")} | ${esc(formatDate(due.startsAt))} | ${esc(due.location || "")}</p></div>
        <strong>${esc(dueText(due.startsAt))}<small>后 due</small></strong>
      </section>
    `;
  }

  function composerHtml() {
    return `
      <footer class="composer" data-chat-dropzone="true">
        <div class="quick-prompts">
          <span>快捷指令</span>
          ${["预习下一节", "课前关键词", "上课问题", "10 分钟预习", "课程介绍", "Deadline 汇总", "制作 Cheatsheet"].map((item) => `<button data-action="quick-prompt" data-prompt="${esc(item)}">${esc(item)}</button>`).join("")}
        </div>
        <div class="compose-row">
          <button class="attach" data-action="pick-chat-file" aria-label="上传附件" title="上传附件，也可将 PDF、Word、PPT、Excel 或图片拖到输入区">+</button>
          <input id="chatFile" class="hidden" type="file" multiple accept="${SUPPORTED_UPLOAD_ACCEPT},*/*">
          <textarea id="chatInput" rows="1" placeholder="输入问题..." aria-label="问题"></textarea>
          <button class="send" data-action="send-chat">发送</button>
        </div>
        ${selectedUploadFilesHtml()}
      </footer>
    `;
  }

  function selectedUploadFilesHtml() {
    if (!state.uploadFiles.length) {
      return "";
    }
    return `
      <div class="upload-list">
        ${state.uploadFiles.map((file, index) => `
          <span class="upload-pill">
            <b>${esc(file.name)}</b>
            <small>${esc(formatFileSize(file.size))}</small>
            <button data-action="remove-chat-file" data-index="${index}" aria-label="移除 ${esc(file.name)}">×</button>
          </span>
        `).join("")}
      </div>
    `;
  }

  function messageHtml(message) {
    const mine = message.role === "user";
    return `<div class="message ${mine ? "user" : "ai"}"><b>${mine ? "你" : "AI"}</b><div>${formatText(message.content)}</div></div>`;
  }

  function profilePage() {
    const p = profile();
    return `
      ${pageHeader("PERSONAL PROFILE", "个人资料", "头像、背景、学校、专业和 SB ID 都在这里管理。")}
      <section class="two-col">
        <article class="profile-preview card">
          <div class="cover large" style="${p.backgroundUrl ? `background-image:url('${esc(p.backgroundUrl)}')` : ""}">
            ${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<b>${esc(initials(state.user.name))}</b>`}
          </div>
          <h2>${esc(state.user.name)}</h2>
          <p>${esc([p.school, p.major].filter(Boolean).join(" · ") || "还没有填写学校和专业")}</p>
          <strong>SB ID: ${esc(profileSbId() || "未设置")}</strong>
          ${schoolInfoHtml(p.school)}
        </article>
        <article class="card">
          <h2>编辑资料</h2>
          <label>姓名<input id="profileName" value="${esc(state.user.name)}"></label>
          <label>学校<input id="profileSchool" list="schoolOptions" value="${esc(p.school || "")}"></label>
          <datalist id="schoolOptions">${schoolOptions().map((item) => `<option value="${esc(item)}"></option>`).join("")}</datalist>
          <label>专业<input id="profileMajor" list="majorOptions" value="${esc(p.major || "")}"></label>
          <datalist id="majorOptions">${["Finance", "Economics", "Business", "Computer Science", "Engineering", "Nursing", "Mathematics", "Statistics", "Psychology", "Biology"].map((item) => `<option value="${item}"></option>`).join("")}</datalist>
          <label>SB ID<input id="profileSbId" value="${esc(profileSbId())}" placeholder="例如 adam2026"></label>
          <label>头像图片上传<input id="profileAvatarFile" type="file" accept="image/*"></label>
          <input id="profileAvatar" type="hidden" value="${esc(p.avatarUrl || "")}">
          <label>背景图片上传<input id="profileCoverFile" type="file" accept="image/*"></label>
          <input id="profileCover" type="hidden" value="${esc(p.backgroundUrl || "")}">
          <p class="muted small">&#36873;&#25321;&#22270;&#29255;&#21518;&#28857;&#20987;&#20445;&#23384;&#65307;&#19981;&#36873;&#20250;&#20445;&#30041;&#24403;&#21069;&#22270;&#29255;&#12290;</p>
          <button class="primary wide" data-action="save-profile">保存资料</button>
        </article>
      </section>
    `;
  }

  function schoolInfoHtml(school) {
    const key = String(school || "").toLowerCase().trim();
    const info = schoolFacts[key] || (school ? { name: school, rank: "信息待补充", place: "地点待补充", points: ["StudyBridge 会把学校写入 AI 学习上下文", "回答会优先贴近你的学校、课程语境和学习需求", "后续可以继续补充排名、专业和课程要求"] } : null);
    if (!info) return "";
    return `
      <div class="school-info">
        <h3>${esc(info.name)} 概览</h3>
        <div class="fact-grid"><span><b>类型 / 排名</b>${esc(info.rank)}</span><span><b>地点</b>${esc(info.place)}</span></div>
        <ul>${info.points.map((point) => `<li>${esc(point)}</li>`).join("")}</ul>
      </div>
    `;
  }

  function schoolOptions() {
    return [
      "University of Toronto", "University of British Columbia", "McGill University", "University of Waterloo", "McMaster University", "Western University", "Queen's University", "University of Alberta", "University of Calgary", "York University", "Toronto Metropolitan University", "Centennial College", "Seneca Polytechnic", "George Brown College", "Sheridan College", "University of California Berkeley", "UCLA", "University of Michigan", "New York University", "Boston University", "Northeastern University"
    ];
  }

  function communityPage() {
    const data = state.community;
    return `
      ${pageHeader("COMMUNITY", "社区", "所有人都能看全部社区，也可以切到你的学校或专业频道。")}
      <section class="card">
        <div class="tabs">
          ${["all", "school", "major"].map((channel) => `<button class="${state.communityChannel === channel ? "active" : ""}" data-action="community-channel" data-channel="${channel}">${channel === "all" ? "全部社区" : channel === "school" ? "学校社区" : "专业社区"}</button>`).join("")}
        </div>
        <div class="inline-fields">
          <input id="postTopic" placeholder="主题，例如 ECO101 / 选课 / 作业">
          <label class="check"><input id="postAnon" type="checkbox">匿名</label>
        </div>
        <textarea id="postContent" placeholder="写下你想问或分享的内容"></textarea>
        <button class="primary" data-action="community-post">发布</button>
      </section>
      <section class="list">
        ${(data?.posts || []).length ? data.posts.map((post) => `
          <article class="card post">
            <div><b>${esc(post.topic)}</b><span>${esc(post.channelLabel || "")}</span></div>
            <div class="formatted-text">${formatText(post.content)}</div>
            <small>${esc(post.authorName)} · ${esc(formatDate(post.createdAt))}</small>
            <button data-action="community-like" data-id="${esc(post.id)}">赞 ${post.likeCount || 0}</button>
          </article>
        `).join("") : `<p class="empty">这个频道还没有内容。</p>`}
      </section>
    `;
  }

  function classmatesPage() {
    const classmates = state.classmates?.classmates || [];
    const requests = state.classmates?.requests || { incoming: [], outgoing: [] };
    const active = classmates.find((item) => item.id === state.activeClassmateId) || classmates[0] || null;
    if (active && active.id !== state.activeClassmateId) state.activeClassmateId = active.id;
    return `
      ${pageHeader("CLASSMATES", "同学", "通过 SB ID 发送好友申请，通过后可以聊天。")}
      <section class="two-col classmates-layout">
        <article class="card">
          <h2>添加同学</h2>
          <p class="muted">当前学校：${esc(state.classmates?.school || profile().school || "未填写")}</p>
          <div class="inline-fields">
            <input id="classmateSbId" placeholder="输入 SB ID，例如 adam2026">
            <button data-action="add-classmate">发送申请</button>
          </div>
          <details class="request-box">
            <summary>申请列表 ${(requests.incoming || []).length ? `<span class="dot"></span>` : ""}</summary>
            ${(requests.incoming || []).length ? requests.incoming.map((req) => `
              <div class="mini-row"><b>${esc(req.from?.name || "同学")}</b><small>SB ID: ${esc(req.from?.sbId || "")}</small><button data-action="friend-accept" data-id="${esc(req.id)}">通过</button><button data-action="friend-ignore" data-id="${esc(req.id)}">忽略</button></div>
            `).join("") : `<p class="muted">还没有好友申请。</p>`}
            ${(requests.outgoing || []).length ? `<h3>已发送</h3>${requests.outgoing.map((req) => `<div class="mini-row"><b>${esc(req.to?.name || "同学")}</b><small>等待对方通过</small></div>`).join("")}` : ""}
          </details>
          <h2>同学列表</h2>
          ${classmates.length ? classmates.map((mate) => `
            <button class="friend-row ${mate.id === state.activeClassmateId ? "active" : ""}" data-action="select-classmate" data-id="${esc(mate.id)}">
              <b>${esc(mate.peer?.name || "同学")}</b>
              <small>SB ID: ${esc(mate.peer?.sbId || "")}</small>
              ${mate.lastMessage ? `<span>${esc(mate.lastMessage.mine ? "你：" : "")}${esc(mate.lastMessage.content || "")}</span>` : ""}
            </button>
          `).join("") : `<p class="muted">还没有添加同学。</p>`}
        </article>
        <article class="card chat-panel">
          <div class="section-title"><div><span>DIRECT CHAT</span><h2>${esc(active?.peer?.name || "请选择一位同学")}</h2></div><button data-action="refresh-classmates">刷新</button></div>
          ${active ? peerCard(active.peer) : ""}
          <div class="dm-list">${state.directMessages.length ? state.directMessages.map((msg) => `<div class="dm ${msg.mine ? "mine" : ""}"><div class="formatted-text">${formatText(msg.content)}</div><small>${esc(formatDate(msg.createdAt))}</small></div>`).join("") : `<p class="empty">选择同学后，这里会显示你们的聊天。</p>`}</div>
          <div class="compose-row"><input id="dmInput" placeholder="写一句话给同学"><button class="send" data-action="send-dm">发送</button></div>
        </article>
      </section>
    `;
  }

  function peerCard(peer) {
    return `
      <div class="peer-card">
        <div class="cover" style="${peer?.backgroundUrl ? `background-image:url('${esc(peer.backgroundUrl)}')` : ""}"></div>
        <div class="avatar">${peer?.avatarUrl ? `<img src="${esc(peer.avatarUrl)}" alt="">` : esc(initials(peer?.name))}</div>
        <h3>${esc(peer?.name || "同学")}</h3>
        <p>${esc([peer?.school, peer?.major].filter(Boolean).join(" · "))}</p>
        <span>SB ID: ${esc(peer?.sbId || "")}</span>
      </div>
    `;
  }

  function emailPage() {
    return `
      ${pageHeader("EMAIL COACH", "邮件回复助手", "粘贴邮件内容，StudyBridge 会帮你看懂并起草回复。")}
      <section class="two-col">
        <article class="card">
          <h2>收到的邮件</h2>
          <textarea id="emailOriginal" placeholder="把老师、TA、学校办公室或同学发来的邮件粘贴在这里"></textarea>
          <label>你想怎么回复<textarea id="emailGoal" placeholder="例如：我想礼貌申请延期 / 确认 meeting time / 解释我会晚交"></textarea></label>
          <div class="inline-fields"><select id="emailTone"><option>专业、自然</option><option>更礼貌正式</option><option>简短直接</option></select><select id="emailOutput"><option>中文解读 + 英文回复</option><option>只要英文回复</option></select></div>
          <button class="primary" data-action="draft-email">生成回复</button>
        </article>
        <article class="card"><div class="section-title"><div><span>DRAFT</span><h2>建议回复</h2></div><button data-action="copy-output">复制</button></div><div id="toolOutput" class="output-box">生成后会显示：邮件重点、需要注意的地方，以及一版可以修改后发送的英文回复。</div></article>
      </section>
    `;
  }

  function schedulePage() {
    const items = state.scheduleItems || [];
    const pending = items.filter((item) => !item.completedAt);
    const done = items.filter((item) => item.completedAt);
    return `
      ${pageHeader("SCHEDULE", "时间表", "上传 syllabus 或手动添加作业、考试、课程提醒。")}
      <section class="two-col">
        <article class="card">
          <h2>添加提醒</h2>
          <input id="scheduleTitle" placeholder="例如 ECO101 Essay 1">
          <input id="scheduleCourse" placeholder="课程，例如 ECO101">
          <input id="scheduleTime" type="datetime-local">
          <input id="scheduleLocation" placeholder="提交位置，例如 Quercus / Room 101">
          <textarea id="scheduleNotes" placeholder="补充要求、rubric 或备注"></textarea>
          <button class="primary" data-action="add-schedule">添加提醒</button>
        </article>
        <article class="card">
          <h2>全部提醒</h2>
          ${pending.length ? pending.map((item) => scheduleItemHtml(item)).join("") : `<p class="empty">暂无未完成提醒。</p>`}
          <h2>已完成</h2>
          ${done.length ? done.map((item) => `<div class="mini-row done"><b>${esc(item.title)}</b><small>${esc(formatDate(item.startsAt))}</small></div>`).join("") : `<p class="muted">还没有已完成项目。</p>`}
        </article>
      </section>
    `;
  }

  function scheduleItemHtml(item) {
    return `
      <div class="schedule-item">
        <span>${esc(item.kind || "DDL")}</span>
        <div><b>${esc(item.title)}</b><small>${esc(item.course || "")} | ${esc(formatDate(item.startsAt))} | ${esc(item.location || "")}</small></div>
        <strong>${esc(dueText(item.startsAt))}</strong>
        <button data-action="complete-schedule" data-course="${esc(item.courseId)}" data-doc="${esc(item.docId)}">已完成</button>
      </div>
    `;
  }

  function toolsPage() {
    return `
      ${pageHeader("STUDY TOOLS", "工具", "可以手动写 Docs、做 Sheets、做 Slides，AI 只是旁边的辅助工具。")}
      <section class="tools-tabs">
        ${["docs", "sheets", "slides"].map((tool) => `<button class="${(state.tool || "docs") === tool ? "active" : ""}" data-action="tool-mode" data-tool="${tool}">SB ${tool[0].toUpperCase()}${tool.slice(1)}</button>`).join("")}
      </section>
      <section class="two-col">
        <article class="card">
          ${toolEditorHtml(state.tool || "docs")}
        </article>
        <article class="card"><div class="section-title"><div><span>AI ASSIST</span><h2>辅助生成</h2></div><button data-action="copy-output">复制</button></div><textarea id="toolPrompt" placeholder="让 AI 帮你润色、生成结构、整理表格或做 PPT 大纲"></textarea><button class="primary" data-action="generate-tool">调用 AI</button><div id="toolOutput" class="output-box">AI 输出会显示在这里，你可以再复制回左侧手动编辑。</div></article>
      </section>
    `;
  }

  function toolEditorHtml(tool) {
    if (tool === "sheets") {
      return `<h2>SB Sheets</h2><div class="sheet-wrap"><table class="sheet">${Array.from({ length: 8 }).map((_, r) => `<tr>${Array.from({ length: 5 }).map((__, c) => `<td contenteditable="true">${r === 0 ? esc(String.fromCharCode(65 + c)) : ""}</td>`).join("")}</tr>`).join("")}</table></div>`;
    }
    if (tool === "slides") {
      return `<h2>SB Slides</h2><input class="slide-title" placeholder="Slide title"><textarea class="slide-body" placeholder="Bullet points / speaker notes"></textarea><div class="slide-preview">Presentation canvas</div>`;
    }
    return `<h2>SB Docs</h2><div class="doc-editor" contenteditable="true" spellcheck="true">Start writing your essay, report, or reading response here...</div>`;
  }

  function adminPage() {
    const overview = state.admin;
    return `
      ${pageHeader("CREATOR CONSOLE", "开发者端", "管理邀请码、用户、系统状态和密码重置申请。", false)}
      ${adminStatusHtml()}
      <section class="two-col">
        <article class="card">
          <h2>邀请码</h2>
          <input id="inviteLabel" placeholder="备注：例如 Kevin / ECO101 小组">
          <div class="inline-fields"><input id="inviteMax" type="number" value="1" min="1"><select id="inviteRole"><option value="student">普通用户</option><option value="admin">Co-admin</option></select><button class="primary" data-action="generate-invite">生成邀请码</button></div>
          ${(overview?.invites || []).map((invite) => `<div class="invite-row"><b>${esc(invite.code)}</b><small>${esc(invite.role)} · ${esc(invite.label || "")} · ${invite.uses || 0}/${invite.maxUses || 1} used</small><button data-copy="${esc(invite.code)}">复制</button><button data-action="toggle-invite" data-id="${esc(invite.id)}" data-active="${invite.active ? "false" : "true"}">${invite.active ? "停用" : "启用"}</button></div>`).join("")}
        </article>
        <article class="card">
          <h2>用户</h2>
          ${(overview?.users || []).map((user) => `<div class="user-row"><b>${esc(user.name)}</b><small>${esc(user.email)} · ${esc(user.role)}${user.inviteCode ? ` · 邀请码 ${esc(user.inviteCode)}` : ""}</small><span>${user.stats?.courses || 0} courses</span><span>${user.stats?.documents || 0} docs</span><span>${user.stats?.messages || 0} chats</span></div>`).join("")}
        </article>
      </section>
      <section class="card"><h2>密码重置申请</h2>${(overview?.resetRequests || []).length ? overview.resetRequests.map((req) => `<div class="mini-row"><b>${esc(req.email)}</b><small>${esc(req.status)}</small><button data-action="reset-password" data-id="${esc(req.id)}">生成临时密码</button></div>`).join("") : `<p class="muted">还没有密码重置申请。</p>`}</section>
    `;
  }

  function adminStatusHtml() {
    const s = state.status;
    const cards = s ? [
      ["当前版本", s.version?.app || VERSION, `Node ${s.version?.node || ""}`],
      ["最后部署时间", formatDate(s.deploy?.lastCodeUpdateAt), "按服务器文件时间显示。"],
      ["数据库模式", s.database?.mode || "local", s.database?.ready ? "数据库可读取。" : "需要检查数据库。"],
      ["AI 是否正常", s.ai?.ok ? "正常" : "异常", s.ai?.model ? `Current model ${s.ai.model}` : "等待检测。"],
      ["Google 登录", s.google?.enabled ? "已配置" : "未配置", "普通邮箱注册仍可用。"],
      ["邮箱验证码", s.email?.verificationRequired ? "已启用" : "非必需", s.email?.sendingConfigured ? "可发送邮件。" : "当前不强制邮箱发信。"],
      ["服务器自动同步", s.autoSync?.configured ? "已检测到" : "未确认", "用于从 GitHub 自动拉取更新。"],
      ["管理接口", "正常", "可以读取用户、邀请码和重置申请。"]
    ] : [["系统可访问", "待检测", "点击检测读取真实状态。"]];
    return `
      <section class="card status-panel">
        <div class="section-title"><div><h2>系统状态</h2><small>${s ? `检测完成：${esc(formatDate(new Date()))}` : "还没有检测"}</small></div><button data-action="admin-refresh">检测</button></div>
        <div class="status-grid">${cards.map(([title, value, desc]) => `<div><span class="${value === "异常" ? "red" : value === "待检测" || value === "未配置" ? "orange" : "green"}"></span><b>${esc(title)}</b><strong>${esc(value || "暂未检测到")}</strong><p>${esc(desc || "")}</p></div>`).join("")}</div>
      </section>
    `;
  }

  function nextDue() {
    return (state.scheduleItems || [])
      .filter((item) => !item.completedAt && item.startsAt && new Date(item.startsAt).getTime() >= Date.now() - 60000)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0] || null;
  }

  function parseScheduleDoc(doc, course) {
    if (!doc || !(String(doc.title || "").startsWith(SCHEDULE_PREFIX) || String(doc.type || "").toLowerCase() === "schedule")) return null;
    let data = {};
    try { data = JSON.parse(doc.text || "{}"); } catch { data = {}; }
    return {
      docId: doc.id,
      courseId: course.id,
      title: data.title || String(doc.title || "").replace(SCHEDULE_PREFIX, "").trim() || "Schedule item",
      kind: data.kind || "DDL",
      course: data.course || course.name,
      startsAt: data.startsAt || doc.createdAt,
      location: data.location || "",
      notes: data.notes || "",
      completedAt: data.completedAt || ""
    };
  }

  async function loadStudy() {
    const coursesData = await api("/api/courses");
    state.courses = coursesData.courses || [];
    if (!state.activeCourseId || !state.courses.some((c) => c.id === state.activeCourseId)) {
      state.activeCourseId = state.courses[0]?.id || "";
    }
    if (state.activeCourseId) {
      const [docsData, messagesData] = await Promise.all([
        api(`/api/courses/${state.activeCourseId}/documents`),
        api(`/api/courses/${state.activeCourseId}/messages`)
      ]);
      state.docs = docsData.documents || [];
      state.messages = messagesData.messages || [];
    } else {
      state.docs = [];
      state.messages = [];
    }
    await loadScheduleItems(false);
  }

  async function loadScheduleItems(refreshCourses = true) {
    if (refreshCourses) {
      const coursesData = await api("/api/courses");
      state.courses = coursesData.courses || [];
    }
    const allDocs = [];
    for (const course of state.courses) {
      const data = await api(`/api/courses/${course.id}/documents`).catch(() => ({ documents: [] }));
      allDocs.push({ course, documents: data.documents || [] });
    }
    state.allDocs = allDocs;
    state.scheduleItems = allDocs.flatMap((entry) => entry.documents.map((doc) => parseScheduleDoc(doc, entry.course)).filter(Boolean));
  }

  async function ensureScheduleCourse() {
    if (!state.courses.length) {
      const coursesData = await api("/api/courses");
      state.courses = coursesData.courses || [];
    }
    let course = state.courses.find((item) => item.name === SCHEDULE_COURSE);
    if (!course) {
      const data = await api("/api/courses", { method: "POST", body: { name: SCHEDULE_COURSE, term: "StudyBridge planner" } });
      course = data.course;
      state.courses.unshift(course);
    }
    return course;
  }

  async function loadPage(page) {
    setPage(page);
    state.busy = true;
    render();
    try {
      if (page === "study") await loadStudy();
      if (page === "community") state.community = await api(`/api/community?channel=${encodeURIComponent(state.communityChannel)}`);
      if (page === "classmates") {
        state.classmates = await api("/api/classmates");
        const first = state.classmates.classmates?.[0];
        if (!state.activeClassmateId && first) state.activeClassmateId = first.id;
        if (state.activeClassmateId) {
          const dm = await api(`/api/classmates/${state.activeClassmateId}/messages`);
          state.directMessages = dm.messages || [];
        }
      }
      if (page === "schedule") await loadScheduleItems();
      if (page === "admin") {
        state.admin = await api("/api/admin/overview");
        state.status = await api("/api/admin/system-status").catch(() => state.status);
      }
    } catch (error) {
      setToast(error.message);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function readFiles(files) {
    const list = Array.from(files || []);
    list.forEach(validateUploadFile);
    return Promise.all(list.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ fileName: file.name, fileType: file.type, fileSize: file.size, fileData: reader.result });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
  }

  function validateUploadFile(file) {
    if (!file) throw new Error("没有读取到文件。");
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`文件太大：${file.name}。请上传 12 MB 以内的 PDF、Word、PPT、Excel、图片或文字文件。`);
    }
  }

  function filesFromDataTransfer(dataTransfer) {
    const direct = Array.from(dataTransfer?.files || []).filter(Boolean);
    if (direct.length) return direct;
    return Array.from(dataTransfer?.items || [])
      .map((item) => (item.kind === "file" && typeof item.getAsFile === "function" ? item.getAsFile() : null))
      .filter(Boolean);
  }

  function hasDataTransferFiles(dataTransfer) {
    return Array.from(dataTransfer?.types || []).includes("Files") || Array.from(dataTransfer?.items || []).some((item) => item.kind === "file") || Boolean(dataTransfer?.files?.length);
  }

  function addChatFiles(files) {
    const incoming = Array.from(files || []).filter(Boolean);
    if (!incoming.length) return false;
    const seen = new Set(state.uploadFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    for (const file of incoming) {
      validateUploadFile(file);
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!seen.has(key)) {
        state.uploadFiles.push(file);
        seen.add(key);
      }
    }
    setToast(`已添加 ${incoming.length} 个文件，发送问题时会一起上传。`);
    return true;
  }

  async function uploadCourseFiles(files) {
    if (!state.activeCourseId) throw new Error("请先选择或新增课程。");
    const payloads = await readFiles(files);
    if (!payloads.length) throw new Error("请先选择要上传的文件。");
    for (const file of payloads) {
      await api(`/api/courses/${state.activeCourseId}/documents`, { method: "POST", body: { title: file.fileName, ...file } });
    }
    setToast(`已上传 ${payloads.length} 个文件。`);
    await loadPage("study");
  }

  async function handleAction(button) {
    const action = button.dataset.action;
    if (!action) return;
    try {
      if (action === "auth-tab") {
        root.innerHTML = authHtml(button.dataset.tab);
        return;
      }
      if (action === "login") {
        const data = await api("/api/auth/login", { method: "POST", body: { email: $("authEmail")?.value || "", password: $("authPassword")?.value || "" } });
        state.user = data.user;
        state.mode = "student";
        await loadPage("study");
        return;
      }
      if (action === "register") {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: {
            name: $("authName")?.value || "",
            email: $("authEmail")?.value || "",
            password: $("authPassword")?.value || "",
            passwordConfirm: $("authPasswordConfirm")?.value || "",
            inviteCode: $("authInvite")?.value || "",
            emailCode: $("authEmailCode")?.value || ""
          }
        });
        state.user = data.user;
        state.mode = "student";
        await loadPage("profile");
        return;
      }
      if (action === "send-email-code") {
        const data = await api("/api/auth/send-verification", { method: "POST", body: { email: $("authEmail")?.value || "", inviteCode: $("authInvite")?.value || "" } });
        setToast(data.message || "验证码已处理。");
        render();
        return;
      }
      if (action === "google-login") {
        location.assign("/api/auth/google/start");
        return;
      }
      if (action === "forgot-password") {
        const email = $("authEmail")?.value || "";
        if (!email) throw new Error("请先填写邮箱。");
        await api("/api/auth/request-manual-reset", { method: "POST", body: { email } });
        setToast("已提交密码重置申请，请联系创作者。");
        render();
        return;
      }
      if (action === "logout") {
        await api("/api/auth/logout", { method: "POST" }).catch(() => null);
        localStorage.removeItem("studybridge.page");
        location.reload();
        return;
      }
      if (action === "mode-student") {
        state.mode = "student";
        localStorage.setItem("studybridge.mode", "student");
        await loadPage("study");
        return;
      }
      if (action === "mode-admin") {
        state.mode = "admin";
        localStorage.setItem("studybridge.mode", "admin");
        await loadPage("admin");
        return;
      }
      if (action === "add-course") {
        const name = prompt("课程名称，例如 ECO101");
        if (!name) return;
        const data = await api("/api/courses", { method: "POST", body: { name, term: "Current term" } });
        state.activeCourseId = data.course.id;
        await loadPage("study");
        return;
      }
      if (action === "select-course") {
        state.activeCourseId = button.dataset.id;
        await loadPage("study");
        return;
      }
      if (action === "delete-course") {
        if (!confirm("确定删除这门课程吗？")) return;
        await api(`/api/courses/${button.dataset.id}`, { method: "DELETE" });
        if (state.activeCourseId === button.dataset.id) state.activeCourseId = "";
        await loadPage("study");
        return;
      }
      if (action === "save-doc") {
        if (!state.activeCourseId) throw new Error("请先选择或新增课程。");
        const selectedFiles = $("docFile")?.files;
        if (selectedFiles?.length) {
          await uploadCourseFiles(selectedFiles);
          return;
        }
        const docText = $("docText")?.value || "";
        if (!docText.trim()) throw new Error("请先粘贴资料文字，或选择 PDF / Word / PPT / Excel 文件上传。");
        await api(`/api/courses/${state.activeCourseId}/documents`, { method: "POST", body: { title: $("docTitle")?.value || "Course note", text: docText, type: "Note" } });
        await loadPage("study");
        return;
      }
      if (action === "upload-doc") {
        await uploadCourseFiles($("docFile")?.files);
        return;
      }
      if (action === "save-prefs") {
        const data = await api("/api/me/preferences", { method: "PUT", body: { englishTerms: $("englishTerms")?.checked, englishAnswers: $("englishAnswers")?.checked, chineseExplanations: $("chineseExplanations")?.checked, customInstruction: $("customInstruction")?.value || "" } });
        state.user = data.user;
        setToast("偏好已保存。");
        render();
        return;
      }
      if (action === "pick-chat-file") {
        $("chatFile")?.click();
        return;
      }
      if (action === "remove-chat-file") {
        state.uploadFiles.splice(Number(button.dataset.index), 1);
        render();
        return;
      }
      if (action === "quick-prompt") {
        const input = $("chatInput");
        if (input) input.value = button.dataset.prompt || "";
        return;
      }
      if (action === "send-chat") {
        if (!state.activeCourseId) throw new Error("请先选择或新增课程，然后再提问。");
        const text = $("chatInput")?.value || "";
        const attachments = await readFiles(state.uploadFiles);
        if (!text.trim() && !attachments.length) throw new Error("请输入问题或上传文件。");
        state.messages.push({ role: "user", content: text || "请分析我上传的文件。" }, { role: "assistant", content: "正在根据云端课程资料思考..." });
        render();
        const data = await api(`/api/courses/${state.activeCourseId}/chat`, { method: "POST", body: { message: text, mode: $("studyMode")?.value || "guided", attachments } });
        state.uploadFiles = [];
        state.messages = state.messages.slice(0, -2).concat(data.messages || []);
        render();
        return;
      }
      if (action === "save-profile") {
        const data = await api("/api/me/profile", { method: "PUT", body: { name: $("profileName")?.value || "", school: $("profileSchool")?.value || "", major: $("profileMajor")?.value || "", sbId: $("profileSbId")?.value || "", avatarUrl: await readProfileImageFile($("profileAvatarFile"), $("profileAvatar")?.value || ""), backgroundUrl: await readProfileImageFile($("profileCoverFile"), $("profileCover")?.value || "") } });
        state.user = data.user;
        setToast("资料已保存。");
        await loadPage("profile");
        return;
      }
      if (action === "community-channel") {
        state.communityChannel = button.dataset.channel || "all";
        await loadPage("community");
        return;
      }
      if (action === "community-post") {
        await api("/api/community/posts", { method: "POST", body: { channel: state.communityChannel, topic: $("postTopic")?.value || "Question", content: $("postContent")?.value || "", anonymous: $("postAnon")?.checked } });
        await loadPage("community");
        return;
      }
      if (action === "community-like") {
        await api(`/api/community/posts/${button.dataset.id}/like?channel=${encodeURIComponent(state.communityChannel)}`, { method: "PATCH" });
        await loadPage("community");
        return;
      }
      if (action === "refresh-classmates") {
        await loadPage("classmates");
        return;
      }
      if (action === "add-classmate") {
        const data = await api("/api/classmates", { method: "POST", body: { sbId: $("classmateSbId")?.value || "" } });
        setToast(data.status === "connected" ? "已经成为同学，可以聊天了。" : "好友申请已发送，等待对方通过。");
        await loadPage("classmates");
        return;
      }
      if (action === "friend-accept" || action === "friend-ignore") {
        await api(`/api/classmate-requests/${button.dataset.id}`, { method: "PATCH", body: { action: action === "friend-accept" ? "accept" : "ignore" } });
        await loadPage("classmates");
        return;
      }
      if (action === "select-classmate") {
        state.activeClassmateId = button.dataset.id;
        await loadPage("classmates");
        return;
      }
      if (action === "send-dm") {
        if (!state.activeClassmateId) throw new Error("请先选择一位同学。");
        await api(`/api/classmates/${state.activeClassmateId}/messages`, { method: "POST", body: { content: $("dmInput")?.value || "" } });
        await loadPage("classmates");
        return;
      }
      if (action === "draft-email") {
        const prompt = `请帮我处理这封邮件。\n邮件原文：${$("emailOriginal")?.value || ""}\n我想怎么回复：${$("emailGoal")?.value || ""}\n语气：${$("emailTone")?.value || ""}\n输出：${$("emailOutput")?.value || ""}`;
        const output = $("toolOutput");
        output.textContent = "正在生成...";
        const course = state.activeCourseId || (state.courses[0]?.id);
        if (!course) throw new Error("请先在学习区新增一门课程，用来保存 AI 对话。");
        const data = await api(`/api/courses/${course}/chat`, { method: "POST", body: { message: prompt, mode: "email" } });
        output.innerHTML = formatText((data.messages || []).at(-1)?.content || "");
        return;
      }
      if (action === "add-schedule") {
        const course = await ensureScheduleCourse();
        const payload = { title: $("scheduleTitle")?.value || "Deadline", kind: "DDL", course: $("scheduleCourse")?.value || "", startsAt: $("scheduleTime")?.value || new Date().toISOString(), location: $("scheduleLocation")?.value || "", notes: $("scheduleNotes")?.value || "", completedAt: "" };
        await api(`/api/courses/${course.id}/documents`, { method: "POST", body: { title: `${SCHEDULE_PREFIX} ${payload.title}`, type: "Schedule", text: JSON.stringify(payload) } });
        await loadPage("schedule");
        return;
      }
      if (action === "complete-schedule") {
        const item = state.scheduleItems.find((entry) => entry.docId === button.dataset.doc && entry.courseId === button.dataset.course);
        if (!item) throw new Error("找不到这个提醒。");
        const updated = { ...item, completedAt: new Date().toISOString() };
        await api(`/api/courses/${item.courseId}/documents/${item.docId}`, { method: "PATCH", body: { title: `${SCHEDULE_PREFIX} ${item.title}`, type: "Schedule", text: JSON.stringify(updated) } });
        await loadPage("schedule");
        return;
      }
      if (action === "tool-mode") {
        state.tool = button.dataset.tool || "docs";
        render();
        return;
      }
      if (action === "generate-tool") {
        const output = $("toolOutput");
        output.textContent = "正在生成...";
        const course = state.activeCourseId || state.courses[0]?.id;
        if (!course) throw new Error("请先在学习区新增一门课程，用来保存 AI 对话。");
        const data = await api(`/api/courses/${course}/chat`, { method: "POST", body: { message: $("toolPrompt")?.value || "请帮我生成学习文档。", mode: `tool-${state.tool || "docs"}` } });
        output.innerHTML = formatText((data.messages || []).at(-1)?.content || "");
        return;
      }
      if (action === "copy-output") {
        await navigator.clipboard.writeText($("toolOutput")?.innerText || "");
        setToast("已复制。");
        render();
        return;
      }
      if (action === "admin-refresh") {
        state.status = await api("/api/admin/system-status");
        await loadPage("admin");
        return;
      }
      if (action === "generate-invite") {
        await api("/api/admin/invites", { method: "POST", body: { label: $("inviteLabel")?.value || "", maxUses: $("inviteMax")?.value || 1, role: $("inviteRole")?.value || "student" } });
        await loadPage("admin");
        return;
      }
      if (action === "toggle-invite") {
        await api(`/api/admin/invites/${button.dataset.id}`, { method: "PATCH", body: { active: button.dataset.active === "true" } });
        await loadPage("admin");
        return;
      }
      if (action === "reset-password") {
        const data = await api(`/api/admin/password-resets/${button.dataset.id}`, { method: "POST" });
        alert(`临时密码：${data.temporaryPassword || data.password || "请查看返回结果"}`);
        await loadPage("admin");
        return;
      }
    } catch (error) {
      setToast(error.message);
      render();
    }
  }

  function render() {
    const previousChat = root.querySelector(".study-workspace .chat-area");
    const previousCourseId = previousChat?.parentElement.dataset.courseId;
    const previousMessages = previousChat?.querySelector(".messages")?.innerHTML;
    const previousScrollTop = previousChat?.scrollTop || 0;
    try {
      root.innerHTML = routeHtml();
    } catch (error) {
      const message = esc(error.message || "页面渲染时出现问题。");
      root.innerHTML = state.user
        ? shellHtml(`
          <section class="page-header">
            <div>
              <span>StudyBridge</span>
              <h1>页面暂时打不开</h1>
              <p>${message}</p>
            </div>
          </section>
        `)
        : `<main class="auth-shell"><section class="auth-card"><h1>StudyBridge</h1><p class="notice">${message}</p><button onclick="location.reload()">刷新</button></section></main>`;
    }
    if (state.busy) root.insertAdjacentHTML("beforeend", `<div class="busy">Loading...</div>`);
    if (state.toast && state.user) root.insertAdjacentHTML("beforeend", `<div class="toast">${esc(state.toast)}</div>`);
    const chat = root.querySelector(".study-workspace .chat-area");
    if (chat) {
      const showLatest = !previousChat || previousCourseId !== state.activeCourseId
        || previousMessages !== chat.querySelector(".messages")?.innerHTML;
      chat.scrollTop = showLatest ? chat.scrollHeight : previousScrollTop;
    }
  }

  async function boot() {
    try {
      const google = await api("/api/auth/google/config").catch(() => ({ enabled: false }));
      state.googleEnabled = Boolean(google.enabled);
      const data = await api("/api/me").catch(() => null);
      if (!data?.user) {
        render();
        return;
      }
      state.user = data.user;
      state.mode = isAdmin() && localStorage.getItem("studybridge.mode") === "admin" ? "admin" : "student";
      const urlPage = new URL(location.href).searchParams.get("page");
      const savedPage = localStorage.getItem("studybridge.page");
      const page = urlPage || savedPage || "study";
      await loadPage(page);
    } catch (error) {
      root.innerHTML = `<main class="auth-shell"><section class="auth-card"><h1>StudyBridge</h1><p class="notice">${esc(error.message)}</p><button onclick="location.reload()">刷新</button></section></main>`;
    }
  }

  document.addEventListener("click", async (event) => {
    const pageTarget = event.target.closest("[data-page]");
    if (pageTarget) {
      event.preventDefault();
      await loadPage(pageTarget.dataset.page);
      return;
    }
    const copyTarget = event.target.closest("[data-copy]");
    if (copyTarget) {
      event.preventDefault();
      await navigator.clipboard.writeText(copyTarget.dataset.copy || "");
      setToast("已复制。");
      render();
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      event.preventDefault();
      await handleAction(actionTarget);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "chatFile") {
      try {
        if (addChatFiles(event.target.files)) render();
      } catch (error) {
        setToast(error.message || "文件读取失败。");
        render();
      } finally {
        event.target.value = "";
      }
    }
  });

  document.addEventListener("dragover", (event) => {
    if (!state.user || state.page !== "study") return;
    const zone = event.target.closest("[data-chat-dropzone], [data-doc-dropzone]") || $("chatInput")?.closest("[data-chat-dropzone]");
    if (!zone) return;
    event.preventDefault();
    zone.classList.add("drop-ready");
  });

  document.addEventListener("dragleave", (event) => {
    event.target.closest?.("[data-chat-dropzone], [data-doc-dropzone]")?.classList.remove("drop-ready");
  });

  document.addEventListener("drop", async (event) => {
    if (!state.user || state.page !== "study") return;
    const docZone = event.target.closest("[data-doc-dropzone]");
    const chatZone = event.target.closest("[data-chat-dropzone]") || $("chatInput")?.closest("[data-chat-dropzone]");
    const zone = docZone || chatZone;
    if (!zone) return;
    event.preventDefault();
    document.querySelectorAll("[data-chat-dropzone], [data-doc-dropzone]").forEach((item) => item.classList.remove("drop-ready"));
    const droppedFiles = filesFromDataTransfer(event.dataTransfer);
    if (!droppedFiles.length) {
      setToast("没有读取到文件。请从桌面、文件夹或 Chrome 下载列表直接拖到这里。");
      render();
      return;
    }
    try {
      if (docZone) {
        await uploadCourseFiles(droppedFiles);
        return;
      }
      if (addChatFiles(droppedFiles)) render();
    } catch (error) {
      setToast(error.message || "文件上传失败。");
      render();
    }
  });

  boot();
})();
