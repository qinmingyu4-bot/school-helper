(function () {
  "use strict";

  const VERSION = "1.1.87";
  const creativeTools = window.StudyBridgeCreativeTools;
  const officeTools = window.StudyBridgeOffice;
  const chatSpaces = window.StudyBridgeChatSpaces;
  const isGeneralChat = () => state.activeCourseId === chatSpaces.general.id;
  const studyModes = window.StudyBridgeStudyModes;
  const scheduleImport = window.StudyBridgeScheduleImport;
  const userActivity = window.StudyBridgeUserActivity;
  const learningStyle = window.StudyBridgeLearningStyle;
  let learningStyleEditor = null;
  let learningStyleTimer = 0;
  let lastInteractionAt = Date.now();
  let activityReport = { userId: "", time: 0, pending: false };
  const STUDENT_PAGES = ["community", "classmates", "schedule", "study", "tools", "profile"];
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
  const appearanceController = window.StudyBridgeAppearance.createController({
    load: async () => (await api("/api/me/appearance")).appearance,
    save: async (_userId, appearance) => { await api("/api/me/appearance", { method: "PUT", body: appearance }); },
    createSettingsView: (appearance) => window.StudyBridgeSettings.createView({ ...appearance, version: VERSION,
      getUser: () => state.user, getContext: () => ({ courseCount: state.courses.length }),
      learning: {
        snapshot: () => getLearningStyleEditor().saver.snapshot(),
        setDraft: (draft) => {
          getLearningStyleEditor().saver.setDraft(draft);
          for (const key of ["englishTerms", "englishAnswers", "chineseExplanations"]) if ($(key)) $(key).checked = draft[key];
          if ($("customInstruction")) $("customInstruction").value = draft.customInstruction;
        },
        flush: async () => { await settingsProfileSave.catch(() => {}); await getLearningStyleEditor().saver.flush(); }
      },
      saveProfile: (values) => {
        const userId = state.user.id;
        settingsProfileSave = settingsProfileSave.catch(() => {}).then(async () => {
          await getLearningStyleEditor().saver.flush();
          if (state.user?.id !== userId) throw new Error("登录状态已变更，请重新登录。");
          const data = await api("/api/me/profile", { method: "PUT", body: { ...values,
            avatarUrl: profile().avatarUrl || "", backgroundUrl: profile().backgroundUrl || "" } });
          if (state.user?.id !== userId) return;
          state.user = data.user; render();
        });
        return settingsProfileSave;
      },
      requestPasswordReset: () => api("/api/auth/request-manual-reset", { method: "POST", body: { email: state.user.email } }),
      logout: () => handleAction({ dataset: { action: "logout" } }),
      navigate: (page) => loadPage(page)
    })
  });
  let settingsProfileSave = Promise.resolve();
  const emailDraft = {};
  const studyReplies = new Map();
  const uploadPreviewUrls = new Map();
  const pdfReturnDrafts = new Map();
  let nextStudyReplyId = 0;
  const replyPhases = {
    reading: "读取附件中", preparing: "整合课程资料中", thinking: "思考中",
    searching: "检索中", integrating: "整合中", writing: "正在回答", saving: "保存中"
  };
  const studyReplyKey = (userId = state.user?.id, courseId = state.activeCourseId) => `${userId}:${courseId}`;
  const activeStudyReply = () => studyReplies.get(studyReplyKey());
  let classmatesEvents = null;
  let classmatesPoll = null;
  let classmatesSyncing = false;
  let classmatesSyncQueued = false;
  let classmatesGeneration = 0;
  let pageLoadGeneration = 0;
  let classmateListScroll = 0;
  let classmateListDraft = "";
  let classmateRequestsOpen = false;
  let classmateProfileChatScroll = 0;
  let classmateProfileChatAtBottom = true;
  const classmateReadPending = new Set();
  const state = {
    version: VERSION,
    user: null,
    mode: "student",
    page: "study",
    courses: [],
    activeCourseId: "",
    studyMode: studyModes.defaultMode,
    docs: [],
    messages: [],
    allDocs: [],
    scheduleItems: [],
    scheduleDrafts: [],
    scheduleSource: "",
    scheduleImportBusy: false,
    scheduleImportStatus: "",
    scheduleManualOpen: false,
    scheduleManualDraft: {},
    communityChannel: "all",
    community: null,
    communitySelections: { school: null, major: null },
    communityChoices: null,
    communityError: "",
    communityDraft: { topic: "", content: "", anonymous: false },
    classmates: null,
    activeClassmateId: "",
    classmateChatOpen: false,
    classmateProfileOpen: false,
    directMessageDrafts: {},
    directMessages: [],
    directMessageReadIds: [],
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
    schedule: ["时", "时间表", "Deadline 和课程提醒"],
    study: ["学", "学习区", "课程资料、AI 对话和复习计划"],
    tools: ["工", "工具", "Docs、Sheets、Slides、邮件助手"],
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
    if (!response.ok) throw Object.assign(new Error(data.error || data.message || `请求失败 (${response.status})`), { status: response.status });
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
    if (state.mode !== "admin" && page === "email") {
      page = "tools";
      state.tool = "email";
      localStorage.setItem("studybridge.tool", "email");
    }
    if (state.mode === "admin") page = "admin";
    if (state.mode !== "admin" && !STUDENT_PAGES.includes(page)) page = "study";
    state.page = page;
    if (page !== "classmates") {
      state.classmateChatOpen = false;
      state.classmateProfileOpen = false;
    }
    if (page !== "classmates") stopClassmatesLive();
    if (page !== "tools") creativeTools.stop();
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
    const minutes = Math.max(1, Math.ceil(diff / 60000));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    if (days > 0) return `${days}天${restHours}小时`;
    return hours ? `${hours}小时${minutes % 60}分钟` : `${minutes}分钟`;
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
    const navOrder = ["community", "classmates", "schedule", "study", "tools"];
    const userNav = navOrder.map((page) => navButton(page)).join("");
    const devSwitch = isAdmin()
      ? `<div class="mode-switch">
          <button class="${state.mode === "student" ? "active" : ""}" data-action="mode-student">普通用户端</button>
          <button class="${state.mode === "admin" ? "active" : ""}" data-action="mode-admin">开发者端</button>
        </div>`
      : "";
    return `
      <aside class="sidebar" data-sidebar-context="${esc(`${state.user.id}:${state.mode}:${state.page}`)}">
        <header class="side-head">
          <div class="brand-mark">SB</div>
          <div><strong>StudyBridge</strong><span>${esc(state.user.name)} | ${esc(state.user.email)}</span></div>
          <button data-action="settings" aria-haspopup="dialog" title="Settings">设置</button>
        </header>
        ${state.mode === "student" ? `
          <button class="profile-card ${state.page === "profile" ? "active" : ""}" data-page="profile">
            <div class="cover" style="${p.backgroundUrl ? `background-image:url('${esc(p.backgroundUrl)}')` : ""}">
              ${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<b>${esc(initials(state.user.name))}</b>`}
            </div>
            <div class="profile-card-info">
              <h3>${esc(state.user.name)}</h3>
              <p>${esc([p.school, p.major].filter(Boolean).join(" · ") || "完善学校和专业")}</p>
              <strong>SB ID: ${esc(profileSbId() || "未设置")}</strong>
            </div>
            <span class="profile-card-arrow" aria-hidden="true">↗</span>
          </button>
          <nav class="side-nav">${userNav}</nav>
        ` : ""}
        ${devSwitch}
        ${state.mode === "admin" ? adminSideHint() : state.page === "study" ? studySidebarHtml() : ""}
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
        <div class="section-title"><b>对话与课程</b><button data-action="add-course">新增</button></div>
        <div class="course-list">
          <button class="course-item ${isGeneralChat() ? "active" : ""}" data-action="select-course" data-id="${chatSpaces.general.id}">
            <b>${chatSpaces.general.name}</b><small>${chatSpaces.general.term}</small>
          </button>
          ${state.courses.length ? state.courses.map((course) => `
            <button class="course-item ${course.id === state.activeCourseId ? "active" : ""}" data-action="select-course" data-id="${esc(course.id)}">
              <b>${esc(course.name)}</b><small>${esc(course.term || "Current term")}</small>
              <span data-action="delete-course" data-id="${esc(course.id)}">×</span>
            </button>
          `).join("") : `<p class="muted">还没有课程。可以新增课程后开始保存资料。</p>`}
        </div>
      </section>
      ${isGeneralChat() ? "" : `<section class="side-section">
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
      </section>`}
      <section class="side-section">
        <div class="section-title"><b>Learning Style</b><span data-learning-style-status role="status">${learningStyleStatus()}</span></div>
        ${prefBox("englishTerms", "保留 English terms")}
        ${prefBox("englishAnswers", "英文作答 / 英文草稿")}
        ${prefBox("chineseExplanations", "中文拆解 reasoning")}
        <p class="muted" data-learning-style-summary>${esc(learningStyle.summary(getLearningStyleEditor().saver.snapshot().draft))}</p>
        <textarea id="customInstruction" maxlength="500" placeholder="补充要求，例如：先给英文考试答案，再用中文解释每一步。自定义说明优先于勾选项。">${esc(getLearningStyleEditor().saver.snapshot().draft.customInstruction)}</textarea>
        <p class="muted">修改后自动保存；发送前会确认保存。明确的本次要求优先。</p>
        <button data-action="save-prefs">保存偏好</button>
      </section>
    `;
  }

  function prefBox(key, label) {
    const checked = getLearningStyleEditor().saver.snapshot().draft[key] ? "checked" : "";
    return `<label class="check"><input id="${key}" type="checkbox" ${checked}>${esc(label)}</label>`;
  }

  function getLearningStyleEditor() {
    if (!learningStyleEditor || learningStyleEditor.userId !== state.user.id) {
      learningStyleEditor?.saver.dispose();
      clearTimeout(learningStyleTimer);
      const userId = state.user.id;
      const saver = learningStyle.createSaver({ initial: state.user.preferences,
        save: async (preferences) => {
          if (state.user?.id !== userId) throw new Error("登录状态已变更，请重新登录。");
          const data = await api("/api/me/preferences", { method: "PUT", body: preferences });
          if (state.user?.id === userId) state.user = data.user;
          return data.user.preferences;
        },
        onChange: () => {
          if (state.user?.id !== userId) return;
          const badge = root.querySelector("[data-learning-style-status]");
          if (badge) badge.textContent = learningStyleStatus();
          const summary = root.querySelector("[data-learning-style-summary]");
          if (summary) summary.textContent = learningStyle.summary(learningStyleEditor.saver.snapshot().draft);
          appearanceController.refreshLearning();
        }
      });
      learningStyleEditor = { userId, saver };
    }
    return learningStyleEditor;
  }

  function learningStyleStatus() {
    return { saved: "已保存", unsaved: "未保存", saving: "保存中…", error: "保存失败" }[getLearningStyleEditor().saver.snapshot().status];
  }

  function captureLearningStyle() {
    const editor = getLearningStyleEditor();
    if ($("englishTerms")) editor.saver.setDraft({ englishTerms: $("englishTerms").checked, englishAnswers: $("englishAnswers").checked,
      chineseExplanations: $("chineseExplanations").checked, customInstruction: $("customInstruction").value });
    return editor;
  }

  function scheduleLearningStyleSave() {
    const editor = captureLearningStyle();
    clearTimeout(learningStyleTimer);
    learningStyleTimer = setTimeout(() => void editor.saver.flush().catch(() => {}), 400);
  }

  function adminSideHint() {
    return `<section class="side-section"><p class="muted">开发者端只保留监管、邀请码、用户、系统状态和密码重置。</p></section>`;
  }

  function shellHtml(content) {
    const fullChat = state.mode !== "admin" && state.page === "classmates" && state.classmateChatOpen;
    const admin = state.mode === "admin";
    return `
      <div class="app-shell${fullChat ? " classmate-chat-shell" : ""}${admin ? " admin-shell" : ""}">
        ${fullChat ? "" : sidebarHtml()}
        <main class="workspace${state.mode !== "admin" && state.page === "study" ? " study-workspace" : ""}${state.mode !== "admin" && state.page === "classmates" ? " classmates-workspace" : ""}${fullChat ? " classmate-chat-workspace" : ""}${admin ? " admin-workspace" : ""}" id="workspace" data-course-id="${esc(state.activeCourseId)}">
          ${content}
        </main>
      </div>
    `;
  }

  function pageHeader(kicker, title, subtitle, back = true) {
    return `
      <header class="page-header">
        <div><h1 title="${esc(subtitle || title)}" aria-describedby="pageDescription">${esc(title)}</h1><p id="pageDescription">${esc(subtitle)}</p></div>
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
      schedule: schedulePage,
      tools: toolsPage,
      profile: profilePage
    };
    return shellHtml((pages[state.page] || studyPage)());
  }

  function studyPage() {
    const course = isGeneralChat() ? chatSpaces.general : state.courses.find((item) => item.id === state.activeCourseId);
    return `
      <header class="page-header"><div><h1 title="${esc(course?.name || "请选择课程")}">${esc(course?.name || "请选择课程")}</h1></div></header>
      ${upcomingBanner()}
      <section class="chat-area">
        <div class="messages" id="messages">
          ${state.messages.length ? state.messages.map(messageHtml).join("") : `<div class="message ai"><b>AI</b><div>${isGeneralChat() ? "你好，有什么想问的？" : "欢迎回来。先保存课程资料，然后问我预习、复习、deadline、作业要求或模拟考试。"}</div></div>`}
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
        <strong><span data-countdown="${esc(due.startsAt)}">${esc(dueText(due.startsAt))}</span><small>${scheduleImport.kind(due.kind) === "DDL" ? "后截止" : "后开始"}</small></strong>
      </section>
    `;
  }

  const studyModeStorageKey = () => `studybridge.studyMode.${state.user.id}.${state.activeCourseId}`;

  function loadStudyMode() {
    if (isGeneralChat()) { state.studyMode = "general"; return; }
    let saved = "";
    try { saved = localStorage.getItem(studyModeStorageKey()); } catch { /* Storage may be disabled. */ }
    state.studyMode = studyModes.getMode(saved) ? saved : studyModes.defaultMode;
  }

  function quickPromptsHtml() {
    if (isGeneralChat()) return chatSpaces.prompts.map(([label, prompt]) => `<button data-action="quick-prompt" data-prompt="${esc(prompt)}" title="${esc(prompt)}">${esc(label)}</button>`).join("");
    const selected = studyModes.getMode(state.studyMode) || studyModes.getMode(studyModes.defaultMode);
    return (state.studyMode === "cheatsheet" ? '<button data-action="cheatsheet-pdf" title="制作可打印的 PDF">制作 PDF</button>' : "") + [...selected.prompts, ...studyModes.globalPrompts]
      .map(([label, prompt]) => `<button data-action="quick-prompt" data-prompt="${esc(prompt)}" title="${esc(prompt)}">${esc(label)}</button>`).join("");
  }

  function composerHtml() {
    return `
      <footer class="composer" data-chat-dropzone="true">
        <div class="study-toolbar${isGeneralChat() ? " general-toolbar" : ""}">
          ${isGeneralChat() ? "" : `<select id="studyMode" aria-label="学习模式" title="学习模式">
            ${Object.entries(studyModes.modes).map(([id, mode]) => `<option value="${id}" ${state.studyMode === id ? "selected" : ""}>${esc(mode.label)}</option>`).join("")}
          </select>`}
          <div class="quick-prompts" aria-label="${isGeneralChat() ? "自由问答快捷问题" : "学习快捷指令"}">${quickPromptsHtml()}</div>
        </div>
        <div class="compose-row">
          <button class="attach" data-action="pick-chat-file" aria-label="上传附件" title="上传附件；也可拖放文件，或在输入框按 Ctrl+V 粘贴截图">+</button>
          <input id="chatFile" class="hidden" type="file" multiple accept="${SUPPORTED_UPLOAD_ACCEPT},*/*">
          <textarea id="chatInput" rows="1" placeholder="输入问题，可 Ctrl+V 粘贴截图..." aria-label="问题"></textarea>
          <button class="send" data-action="${activeStudyReply() ? "stop-chat" : "send-chat"}" ${state.busy ? "disabled" : ""} ${activeStudyReply() ? 'title="停止生成" aria-label="停止生成"' : 'aria-label="发送"'}>${activeStudyReply() ? '<svg aria-hidden="true"><use href="/classmates-icons.svg#stop"></use></svg>' : "发送"}</button>
        </div>
        ${selectedUploadFilesHtml()}
      </footer>
    `;
  }

  function selectedUploadFilesHtml() {
    for (const [file, url] of uploadPreviewUrls) {
      if (!state.uploadFiles.includes(file)) { URL.revokeObjectURL(url); uploadPreviewUrls.delete(file); }
    }
    if (!state.uploadFiles.length) {
      return "";
    }
    return `
      <div class="upload-list">
        ${state.uploadFiles.map((file, index) => `
          <span class="upload-pill">
            ${uploadImagePreview(file)}
            <b>${esc(file.name)}</b>
            <small>${esc(formatFileSize(file.size))}</small>
            <button data-action="remove-chat-file" data-index="${index}" aria-label="移除 ${esc(file.name)}">×</button>
          </span>
        `).join("")}
      </div>
    `;
  }

  function uploadImagePreview(file) {
    if (!/^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(file.type)) return "";
    if (!uploadPreviewUrls.has(file)) uploadPreviewUrls.set(file, URL.createObjectURL(file));
    return `<img class="upload-image-preview" src="${esc(uploadPreviewUrls.get(file))}" alt="待发送图片：${esc(file.name)}">`;
  }

  function messageHtml(message) {
    const mine = message.role === "user";
    return `<div class="message ${mine ? "user" : "ai"}" ${message.clientReplyId ? `data-reply-id="${esc(message.clientReplyId)}" aria-busy="${Boolean(message.pending)}"` : ""}><b>${mine ? "你" : "AI"}</b><div>${mine ? userMessageBody(message) : replyBodyHtml(message)}</div></div>`;
  }

  function userMessageBody(message) {
    return formatText(message.displayText ?? message.content) + window.StudyBridgeChatAttachments.render(message.attachments);
  }

  function showChatImage(url, name) {
    if (!window.StudyBridgeChatAttachments.isPreviewUrl(url)) return;
    const dialog = document.createElement("dialog");
    dialog.className = "chat-image-dialog";
    dialog.setAttribute("aria-label", "图片预览");
    dialog.innerHTML = `<header><strong>${esc(name || "图片")}</strong><button type="button" aria-label="关闭图片预览">关闭</button></header><img src="${esc(url)}" alt="${esc(name || "图片")}"><p role="status"></p>`;
    dialog.querySelector("button").addEventListener("click", () => dialog.close());
    dialog.querySelector("img").addEventListener("error", () => { dialog.querySelector("p").textContent = "图片暂时无法加载，请重新登录或稍后重试。"; });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  function replyBodyHtml(message) {
    const content = message.content || message.pending ? `<div class="reply-content">${window.StudyBridgeMarkdown.render(message.content)}</div>` : "";
    const status = message.pending
      ? `<div class="reply-status" role="status"><span class="reply-spinner" aria-hidden="true"></span><span>${esc(replyPhases[message.phase] || replyPhases.thinking)}</span></div>`
      : message.interrupted ? '<div class="reply-notice" role="status">回复已中断，可重新提问。</div>' : "";
    return content + status;
  }

  function updateStudyReply(reply) {
    if (state.page !== "study" || state.mode !== "student" || studyReplyKey() !== reply.key) return;
    const message = root.querySelector(`[data-reply-id="${reply.assistant.clientReplyId}"]`);
    const chat = root.querySelector(".study-workspace .chat-area");
    if (!message || !chat) return;
    const followLatest = chat.scrollHeight - chat.clientHeight - chat.scrollTop < 48
      || (!reply.hasDisplayedText && Boolean(reply.assistant.content));
    const question = root.querySelector(`[data-reply-id="${reply.user.clientReplyId}"] > div`);
    if (question && reply.userNeedsRender) {
      question.innerHTML = userMessageBody(reply.user);
      reply.userNeedsRender = false;
    }
    message.setAttribute("aria-busy", String(Boolean(reply.assistant.pending)));
    const body = message.querySelector(":scope > div");
    let content = body.querySelector(".reply-content");
    if (!content) {
      body.insertAdjacentHTML("afterbegin", '<div class="reply-content"></div>');
      content = body.querySelector(".reply-content");
    }
    content.innerHTML = window.StudyBridgeMarkdown.render(reply.assistant.content);
    if (reply.assistant.content) reply.hasDisplayedText = true;
    const status = body.querySelector(".reply-status");
    if (reply.assistant.pending && status) status.lastElementChild.textContent = replyPhases[reply.assistant.phase] || replyPhases.thinking;
    if (!reply.assistant.pending) {
      status?.remove();
      if (reply.assistant.interrupted && !body.querySelector(".reply-notice")) body.insertAdjacentHTML("beforeend", '<div class="reply-notice" role="status">回复已中断，可重新提问。</div>');
    }
    if (followLatest) chat.scrollTop = chat.scrollHeight;
    const send = root.querySelector(".compose-row .send");
    const pending = Boolean(activeStudyReply());
    send.dataset.action = pending ? "stop-chat" : "send-chat";
    send.title = pending ? "停止生成" : "发送";
    send.setAttribute("aria-label", send.title);
    send.disabled = state.busy;
    send.innerHTML = pending ? '<svg aria-hidden="true"><use href="/classmates-icons.svg#stop"></use></svg>' : "发送";
  }

  function scheduleStudyReply(reply) {
    if (reply.frame) return;
    reply.frame = requestAnimationFrame(() => {
      reply.frame = 0;
      updateStudyReply(reply);
    });
  }

  function mergeStudyReply(messages, reply) {
    if (!reply || (!reply.started && !reply.assistant.pending)) return messages;
    const ids = new Set([reply.user.id, reply.assistant.id].filter(Boolean));
    return messages.filter((message) => !ids.has(message.id)).concat(reply.user, reply.assistant);
  }

  async function sendStudyChat() {
    if (state.busy || activeStudyReply()) return;
    if (!state.activeCourseId) throw new Error("请先选择或新增课程，然后再提问。");
    const input = $("chatInput");
    const text = input?.value || "";
    const files = [...state.uploadFiles];
    if (!text.trim() && !files.length) throw new Error("请输入问题或上传文件。");
    const preferenceEditor = captureLearningStyle();
    const previewUrls = [];
    const previews = files.map((file) => {
      const image = /^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(file.type);
      const url = image ? URL.createObjectURL(file) : null;
      if (url) previewUrls.push(url);
      return { name: file.name, kind: image ? "image" : "file", ...(url ? { url } : {}) };
    });
    const reply = {
      key: studyReplyKey(), courseId: state.activeCourseId, mode: state.studyMode,
      controller: new AbortController(), frame: 0, started: false,
      user: { role: "user", content: text || "请分析我上传的文件。", clientReplyId: `question-${nextStudyReplyId + 1}`, attachments: previews },
      assistant: { role: "assistant", content: "", clientReplyId: `reply-${++nextStudyReplyId}`, pending: true, phase: files.length ? "reading" : "preparing" }
    };
    studyReplies.set(reply.key, reply);
    state.messages.push(reply.user, reply.assistant);
    state.uploadFiles = [];
    if (input) input.value = "";
    render();
    try {
      const attachments = await readFiles(files);
      clearTimeout(learningStyleTimer);
      try { await preferenceEditor.saver.flush(); }
      catch { throw new Error("偏好保存失败，尚未发送问题。请点击保存偏好后重试。"); }
      reply.learningStyle = preferenceEditor.saver.snapshot().draft;
      reply.controller.signal.throwIfAborted();
      reply.assistant.phase = "preparing";
      scheduleStudyReply(reply);
      const response = await fetch(`/api/courses/${reply.courseId}/chat`, {
        method: "POST", credentials: "same-origin", signal: reply.controller.signal,
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ message: text, mode: reply.mode, attachments, learningStyle: reply.learningStyle, stream: true })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `请求失败 (${response.status})`);
      }
      let completed = false;
      if (!(response.headers.get("content-type") || "").includes("text/event-stream")) {
        // Keep compatibility with a server that has not yet received the update.
        const data = await response.json();
        if (data.messages?.length !== 2) throw new Error("没有收到完整回复，请重试。");
        Object.assign(reply.user, data.messages[0]);
        reply.userNeedsRender = true;
        Object.assign(reply.assistant, data.messages[1]);
        reply.started = true;
        completed = true;
      } else {
        await window.StudyBridgeChatStream.readEvents(response, ({ event, data }) => {
          const packet = JSON.parse(data);
          if (event === "start") {
            Object.assign(reply.user, packet.message);
            reply.userNeedsRender = true;
            reply.started = true;
          }
          if (event === "status" && replyPhases[packet.phase]) reply.assistant.phase = packet.phase;
          if (event === "delta" && typeof packet.text === "string") {
            reply.assistant.content += packet.text;
            reply.assistant.phase = "writing";
          }
          if (event === "done" || event === "error") {
            if (packet.messages?.[0]) { Object.assign(reply.user, packet.messages[0]); reply.userNeedsRender = true; reply.started = true; }
            if (packet.messages?.[1]) Object.assign(reply.assistant, packet.messages[1]);
            if (event === "error") throw new Error(packet.error || "回复已中断，请重试。");
            completed = true;
            return false;
          }
          scheduleStudyReply(reply);
        });
      }
      if (!completed) throw new Error("连接已中断，请重新提问。");
    } catch (error) {
      if (reply.started) {
        reply.assistant.interrupted = true;
      } else if (studyReplyKey() === reply.key) {
        state.messages = state.messages.filter((message) => message !== reply.user && message !== reply.assistant);
        state.uploadFiles.unshift(...files);
        render();
        if ($("chatInput") && !$("chatInput").value) $("chatInput").value = text;
      }
      if (!reply.controller.signal.aborted && studyReplyKey() === reply.key) {
        setToast(error.message);
        root.querySelector(".toast")?.remove();
        root.insertAdjacentHTML("beforeend", `<div class="toast">${esc(error.message)}</div>`);
      }
    } finally {
      reply.assistant.pending = false;
      studyReplies.delete(reply.key);
      cancelAnimationFrame(reply.frame);
      reply.frame = 0;
      updateStudyReply(reply);
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      // Before the server accepts a request there may be no reply bubble to patch.
      if (!reply.started && studyReplyKey() === reply.key) render();
    }
  }

  function profilePage() {
    const p = profile();
    return `
      ${pageHeader("PERSONAL PROFILE", "个人资料", "头像、背景、学校、专业和 SB ID 都在这里管理。")}
      <section class="profile-layout">
        <div class="profile-overview">
        <article class="profile-preview card">
          <div class="cover large" style="${p.backgroundUrl ? `background-image:url('${esc(p.backgroundUrl)}')` : ""}">
            ${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<b>${esc(initials(state.user.name))}</b>`}
          </div>
          <div class="profile-identity">
            <h2>${esc(state.user.name)}</h2>
            <p>${esc(p.school || "还没有填写学校")}</p>
            <p class="profile-major">${esc(p.major || "还没有填写专业")}</p>
            <span class="profile-id">SB ID <strong>${esc(profileSbId() || "未设置")}</strong></span>
          </div>
        </article>
        ${schoolInfoHtml(p.school)}
        </div>
        <article class="card profile-editor">
          <header class="profile-editor-heading"><h2>编辑资料</h2><p>让同学更容易认识你。</p></header>
          <section class="profile-form-section">
          <h3>基本信息</h3>
          <div class="profile-fields">
          <label>姓名<input id="profileName" value="${esc(state.user.name)}"></label>
          <label>学校<input id="profileSchool" list="schoolOptions" value="${esc(p.school || "")}"></label>
          <datalist id="schoolOptions">${schoolOptions().map((item) => `<option value="${esc(item)}"></option>`).join("")}</datalist>
          <label>专业<input id="profileMajor" list="majorOptions" value="${esc(p.major || "")}"></label>
          <datalist id="majorOptions">${["Finance", "Economics", "Business", "Computer Science", "Engineering", "Nursing", "Mathematics", "Statistics", "Psychology", "Biology"].map((item) => `<option value="${item}"></option>`).join("")}</datalist>
          <label>SB ID<input id="profileSbId" value="${esc(profileSbId())}" placeholder="例如 adam2026"></label>
          </div>
          </section>
          <section class="profile-form-section">
          <h3>头像与封面</h3>
          <div class="profile-uploads">
          <label>头像<input id="profileAvatarFile" type="file" accept="image/*"></label>
          <input id="profileAvatar" type="hidden" value="${esc(p.avatarUrl || "")}">
          <label>封面<input id="profileCoverFile" type="file" accept="image/*"></label>
          <input id="profileCover" type="hidden" value="${esc(p.backgroundUrl || "")}">
          </div>
          <p class="profile-upload-note">选择图片后保存，未选择的图片会保留。</p>
          </section>
          <footer class="profile-editor-footer"><button class="primary" data-action="save-profile">保存资料</button></footer>
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

  function communityValue() {
    return state.communityChannel === "all" ? "" : state.communitySelections[state.communityChannel] ?? profile()[state.communityChannel] ?? "";
  }

  function communityQuery() {
    const query = new URLSearchParams({ channel: state.communityChannel });
    if (state.communityChannel !== "all") query.set("value", communityValue());
    return query.toString();
  }

  function communityPage() {
    const data = state.community;
    const posts = data?.posts || [];
    const channel = state.communityChannel;
    const channelName = channel === "all" ? "全部社区" : communityValue() || (channel === "school" ? "请选择学校" : "请选择专业");
    const canPost = !state.busy && !state.communityError && (channel === "all" || Boolean(communityValue().trim()));
    const kind = channel === "school" ? "学校" : "专业";
    const choices = [...new Set([profile()[channel], communityValue(), ...(channel === "school" ? schoolOptions() : ["Finance", "Economics", "Business", "Computer Science", "Engineering", "Nursing", "Mathematics", "Statistics", "Psychology", "Biology"]), ...(state.communityChoices?.[channel === "school" ? "schools" : "majors"] || [])].filter(Boolean))];
    const conversationIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3V11.5A7.5 7.5 0 0 1 9.5 4h3a7.5 7.5 0 0 1 7.5 7.5Z"/><path d="M7 10h8M7 14h5"/></svg>`;
    return `
      ${pageHeader("COMMUNITY", "社区", "与同学交流想法，一起找到答案。")}
      <div class="community-layout">
        <section class="community-discussions" aria-labelledby="communityFeedTitle">
          <div class="community-intro"><span class="community-kicker">一起学习 · 一起交流</span><h2>在这里，遇见同路的同学</h2><p>聊聊选课、分享经验，或把卡住你的问题交给大家。</p></div>
          <nav class="community-tabs" aria-label="社区频道">
            ${["all", "school", "major"].map((item) => `<button type="button" class="${channel === item ? "active" : ""}" aria-pressed="${channel === item}" data-action="community-channel" data-channel="${item}">${item === "all" ? "全部社区" : item === "school" ? "学校社区" : "专业社区"}</button>`).join("")}
          </nav>
          ${channel !== "all" ? `<div class="community-channel-picker"><label for="communityChannelValue">选择${kind}</label><div class="community-picker-row"><input id="communityChannelValue" list="communityChannelChoices" maxlength="90" value="${esc(communityValue())}" placeholder="选择或输入${kind}名称"><datalist id="communityChannelChoices">${choices.map((item) => `<option value="${esc(item)}"></option>`).join("")}</datalist><button type="button" data-action="community-select">查看</button></div><div class="community-picker-hint"><span>可从列表选择，也可以输入其他${kind}名称。</span>${profile()[channel] ? `<button type="button" data-action="community-default">我的${kind}</button>` : ""}</div></div>` : ""}
          <div class="community-feed-heading"><h3 id="communityFeedTitle">${esc(channelName)}</h3><span>${posts.length} 条讨论</span></div>
          <div class="community-feed">
            ${state.busy ? `<p class="community-feed-status" role="status">正在加载讨论…</p>` : state.communityError ? `<div class="community-feed-status" role="alert"><p>${esc(state.communityError)}</p><button type="button" data-action="community-retry">重新加载</button></div>` : channel !== "all" && !communityValue().trim() ? `<p class="community-feed-status">先选择或输入一个${kind}，看看大家在聊什么。</p>` : posts.length ? posts.map((post) => `
              <article class="community-post">
                <div class="community-post-meta"><span class="community-avatar" aria-hidden="true">${esc((post.authorName || "同").slice(0, 1))}</span><div><b>${esc(post.authorName)}</b><time datetime="${esc(post.createdAt)}">${esc(formatDate(post.createdAt))}</time></div><span class="community-channel-badge">${esc(post.channelLabel || "全部社区")}</span></div>
                <h4>${esc(post.topic)}</h4>
                <div class="formatted-text">${formatText(post.content)}</div>
                <footer><button type="button" class="community-like ${post.likedByMe ? "is-liked" : ""}" aria-pressed="${Boolean(post.likedByMe)}" aria-label="${post.likedByMe ? "取消赞同" : "赞同"}" data-action="community-like" data-id="${esc(post.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11H3V10h4Zm0 0 5-7c2 0 3 1 2 4l-1 3h5a2 2 0 0 1 2 2l-1 7a2 2 0 0 1-2 2H7"/></svg>赞同 <span>${post.likeCount || 0}</span></button></footer>
              </article>`).join("") : `<div class="community-empty"><span class="community-empty-icon">${conversationIcon}</span><h4>第一条讨论，从你开始</h4><p>这里还没有讨论。一个问题、一点经验，<br>都可能成为帮助同学的开始。</p><div class="community-topic-hints"><span>选课交流</span><span>作业求助</span><span>学习搭子</span></div><button type="button" data-action="community-compose">发起第一条讨论 <span aria-hidden="true">↗</span></button></div>`}
          </div>
        </section>
        <aside class="community-compose-column" aria-labelledby="communityComposeTitle">
          <section class="community-composer-card">
            <div class="community-compose-heading"><span>${conversationIcon}</span><div><h3 id="communityComposeTitle">发起讨论</h3><p>让交流从一个想法开始</p></div></div>
            <div class="community-destination"><span>发布到</span><strong>${esc(channelName)}</strong></div>
            <label for="postTopic">讨论主题</label>
            <input id="postTopic" maxlength="40" value="${esc(state.communityDraft.topic)}" placeholder="例如 ECO101 / 选课建议">
            <label for="postContent">想和大家聊什么？</label>
            <textarea id="postContent" maxlength="1600" placeholder="写下你的问题，或分享一段学习经验……">${esc(state.communityDraft.content)}</textarea>
            <div class="community-compose-footer"><label class="community-anonymous"><input id="postAnon" type="checkbox" ${state.communityDraft.anonymous ? "checked" : ""}>匿名发布</label><button type="button" class="primary" data-action="community-post" ${canPost ? "" : "disabled"}>发布讨论 <span aria-hidden="true">↗</span></button></div>
          </section>
          <p class="community-guidance">友善交流，尊重每一种声音。<br>分享时请留意自己和他人的隐私。</p>
        </aside>
      </div>
    `;
  }

  function classmatesPage() {
    const classmates = state.classmates?.classmates || [];
    const requests = state.classmates?.requests || { incoming: [], outgoing: [] };
    const active = classmates.find((item) => item.id === state.activeClassmateId) || null;
    if (state.classmateChatOpen) return state.classmateProfileOpen ? classmateProfilePage(active?.peer) : classmateChatPage(active);
    return `
      ${pageHeader("CLASSMATES", "同学", "")}
      <section class="two-col classmates-layout">
        <aside class="classmates-sidebar" aria-label="同学列表">
          <h2>添加同学</h2>
          <p class="muted">当前学校：${esc(state.classmates?.school || profile().school || "未填写")}</p>
          <div class="inline-fields">
            <input id="classmateSbId" aria-label="同学的 SB ID" placeholder="输入 SB ID" value="${esc(classmateListDraft)}">
            <button data-action="add-classmate">发送申请</button>
          </div>
          <details class="request-box" ${classmateRequestsOpen ? "open" : ""}>
            <summary>申请列表 ${(requests.incoming || []).length ? `<span class="dot"></span>` : ""}</summary>
            ${(requests.incoming || []).length ? requests.incoming.map((req) => `
              <div class="mini-row"><b>${esc(req.from?.name || "同学")}</b><small>SB ID: ${esc(req.from?.sbId || "")}</small><button data-action="friend-accept" data-id="${esc(req.id)}">通过</button><button data-action="friend-ignore" data-id="${esc(req.id)}">忽略</button></div>
            `).join("") : `<p class="muted">还没有好友申请。</p>`}
            ${(requests.outgoing || []).length ? `<h3>已发送</h3>${requests.outgoing.map((req) => `<div class="mini-row"><b>${esc(req.to?.name || "同学")}</b><small>等待对方通过</small></div>`).join("")}` : ""}
          </details>
          <h2>同学列表</h2>
          <div class="friend-list">
          ${classmates.length ? classmates.map((mate) => `
            <button class="friend-row ${mate.id === state.activeClassmateId ? "active" : ""}" data-action="select-classmate" data-id="${esc(mate.id)}">
              <span class="classmate-avatar" aria-hidden="true">${mate.peer?.avatarUrl ? `<img src="${esc(mate.peer.avatarUrl)}" alt="">` : esc(initials(mate.peer?.name))}</span>
              <span class="friend-info"><b>${esc(mate.peer?.name || "同学")}</b>
              <small>SB ID: ${esc(mate.peer?.sbId || "")}</small>
              ${mate.lastMessage ? `<span class="friend-preview">${esc(mate.lastMessage.mine ? "你：" : "")}${esc(mate.lastMessage.content || "")}</span>` : ""}</span>
              ${mate.unreadCount > 0 ? `<span class="friend-unread" aria-label="${esc(mate.unreadCount)} 条未读消息">${mate.unreadCount > 99 ? "99+" : esc(mate.unreadCount)}</span>` : ""}
            </button>
          `).join("") : `<p class="muted">还没有添加同学。</p>`}
          </div>
        </aside>
      </section>
    `;
  }

  function classmateChatPage(active) {
    return `
      <section class="classmates-chat-view">
        <article class="chat-panel" data-chat-id="${esc(active?.id || "")}" aria-label="同学聊天">
          <header class="dm-header">
            <button class="dm-icon-button" data-action="back-classmates" title="返回同学列表" aria-label="返回同学列表"><svg aria-hidden="true"><use href="/classmates-icons.svg#back"></use></svg></button>
            ${active ? classmateProfileAvatar(active.peer) : ""}
            <div class="dm-peer"><h2>${esc(active?.peer?.name || "请选择一位同学")}</h2>${active ? `<p>SB ID: ${esc(active.peer?.sbId || "")}${active.peer?.school ? ` · ${esc(active.peer.school)}` : ""}</p>` : ""}</div>
            <button class="dm-icon-button" data-action="refresh-classmates" title="刷新聊天" aria-label="刷新聊天"><svg aria-hidden="true"><use href="/classmates-icons.svg#refresh"></use></svg></button>
          </header>
          <div class="dm-list" role="log" aria-label="聊天记录">${state.directMessages.length ? state.directMessages.map((msg) => `<div class="dm-row ${msg.mine ? "mine" : ""}">${!msg.mine && active ? classmateProfileAvatar(active.peer) : ""}<div class="dm ${msg.mine ? "mine" : ""}">${!msg.mine ? `<span class="dm-sender">${esc(active?.peer?.name || "同学")}</span>` : ""}<div class="dm-content">${esc(msg.content)}</div><small>${esc(formatDate(msg.createdAt))}</small></div></div>`).join("") : `<p class="empty">${active ? "还没有聊天记录。先打个招呼吧。" : "选择同学后，这里会显示你们的聊天。"}</p>`}</div>
          <form class="compose-row dm-compose"><input id="dmInput" aria-label="聊天消息" autocomplete="off" maxlength="1200" placeholder="写一句话给同学" value="${esc(state.directMessageDrafts[state.activeClassmateId] || "")}" ${active ? "" : "disabled"}><button class="send dm-icon-button" data-action="send-dm" type="submit" title="发送消息" aria-label="发送消息" ${active ? "" : "disabled"}><svg aria-hidden="true"><use href="/classmates-icons.svg#send"></use></svg></button></form>
        </article>
      </section>
    `;
  }

  function classmateProfileAvatar(peer) {
    const label = `查看${peer?.name || "同学"}的主页`;
    return `<button type="button" class="classmate-avatar peer-avatar-button" data-action="view-classmate-profile" title="${esc(label)}" aria-label="${esc(label)}">${peer?.avatarUrl ? `<img src="${esc(peer.avatarUrl)}" alt="">` : esc(initials(peer?.name))}</button>`;
  }

  function classmateProfilePage(peer) {
    return `
      <section class="classmates-chat-view peer-profile-page">
        <header class="dm-header">
          <button class="dm-icon-button" data-action="back-classmate-chat" title="返回聊天" aria-label="返回聊天"><svg aria-hidden="true"><use href="/classmates-icons.svg#back"></use></svg></button>
          <div class="dm-peer"><h2>${esc(peer?.name || "同学")}的主页</h2></div>
        </header>
        <div class="peer-profile-body">
          <div class="peer-profile-cover">${peer?.backgroundUrl ? `<img src="${esc(peer.backgroundUrl)}" alt="${esc(peer.name)}的背景图片">` : ""}</div>
          <div class="peer-profile-info">
            <div class="peer-profile-summary">
              <span class="classmate-avatar peer-profile-avatar">${peer?.avatarUrl ? `<img src="${esc(peer.avatarUrl)}" alt="${esc(peer.name)}的头像">` : esc(initials(peer?.name))}</span>
              <div><h1>${esc(peer?.name || "同学")}</h1><p>SB ID: ${esc(peer?.sbId || "未设置")}</p></div>
            </div>
            <dl class="peer-profile-facts">
              <div><dt>学校</dt><dd>${esc(peer?.school || "未填写")}</dd></div>
              <div><dt>专业</dt><dd>${esc(peer?.major || "未填写")}</dd></div>
            </dl>
            <button class="primary" data-action="back-classmate-chat">发消息</button>
          </div>
        </div>
      </section>
    `;
  }

  function emailPage() {
    return `
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
    const pending = items.filter((item) => !item.completedAt).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    const done = items.filter((item) => item.completedAt);
    return `
      ${pageHeader("SCHEDULE", "时间表", "你的 DDL、Lecture 和 Tutorial，一处掌握。")}
      <section class="schedule-layout">
        <article class="card schedule-upload">
          <div class="schedule-upload-intro">
            <span class="schedule-kicker">AI IMPORT</span>
            <h2>把课程文件变成时间表</h2>
            <p>上传 syllabus 或课程表，AI 提取时间，你确认后再加入提醒。</p>
            <div class="schedule-steps" aria-label="导入步骤"><span><b>1</b> 上传文件</span><span><b>2</b> 核对时间</span><span><b>3</b> 开始倒计时</span></div>
          </div>
          <div class="schedule-upload-controls">
            <label class="schedule-file-picker ${state.scheduleImportBusy || state.scheduleDrafts.length ? "is-disabled" : ""}">
              <input id="scheduleFile" aria-label="选择课程文件" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json" ${state.scheduleImportBusy || state.scheduleDrafts.length ? "disabled" : ""}>
              <span class="schedule-file-symbol" aria-hidden="true">↑</span>
              <span><strong id="scheduleFileName">选择课程文件</strong><small>PDF、Word、PPT、Excel 或文字文件</small></span>
            </label>
            <div class="schedule-upload-bottom"><small>PDF ≤ 8 MB · 其他文件 ≤ 12 MB</small><button class="primary" data-action="extract-schedule" ${state.scheduleImportBusy || state.scheduleDrafts.length ? "disabled" : ""}>${state.scheduleImportBusy ? "处理中…" : "AI 提取时间"}</button></div>
          </div>
          ${state.scheduleImportStatus ? `<p class="schedule-import-status" role="status" aria-live="polite">${esc(state.scheduleImportStatus)}</p>` : ""}
        </article>
        ${scheduleReviewHtml()}
        <details class="card schedule-manual" id="scheduleManual" ${state.scheduleManualOpen ? "open" : ""}>
          <summary><span><b>＋ 手动添加提醒</b><small>直接填写一条 DDL、LEC 或 TUT</small></span><span class="schedule-disclosure" aria-hidden="true">⌄</span></summary>
          <div class="schedule-manual-form">
            <label class="schedule-field-wide">标题<input id="scheduleTitle" data-manual-field="title" value="${esc(state.scheduleManualDraft.title || "")}" placeholder="例如 ECO101 Essay 1"></label>
            <label>类型<select id="scheduleKind" data-manual-field="kind">${["DDL", "LEC", "TUT"].map((kind) => `<option ${state.scheduleManualDraft.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label>
            <label>日期与时间<input id="scheduleTime" data-manual-field="startsAt" type="datetime-local" value="${esc(state.scheduleManualDraft.startsAt || "")}"></label>
            <label>课程<input id="scheduleCourse" data-manual-field="course" value="${esc(state.scheduleManualDraft.course || "")}" placeholder="例如 ECO101"></label>
            <label>地点 / 链接<input id="scheduleLocation" data-manual-field="location" value="${esc(state.scheduleManualDraft.location || "")}" placeholder="教室或提交入口"></label>
            <label class="schedule-field-wide">备注（选填）<textarea id="scheduleNotes" data-manual-field="notes" placeholder="补充要求或备注">${esc(state.scheduleManualDraft.notes || "")}</textarea></label>
            <div class="schedule-field-wide schedule-form-actions"><button class="primary" data-action="add-schedule">添加提醒</button></div>
          </div>
        </details>
        <article class="card schedule-reminders">
          <div class="schedule-list-header"><div><h2>待办与课程</h2><p>${pending.length ? `${pending.length} 条提醒 · 按时间排序` : "确认后的时间点会显示在这里"}</p></div>
          <div class="schedule-type-legend"><span>DDL 截止</span><span>LEC 讲座</span><span>TUT 辅导课</span></div></div>
          ${pending.length ? `<div class="schedule-list-rows">${pending.map((item) => scheduleItemHtml(item)).join("")}</div>` : `<div class="schedule-empty"><span aria-hidden="true">◷</span><b>时间表还空着</b><p>上传一份课程文件，或手动添加第一条提醒。</p></div>`}
          ${done.length ? `<details class="schedule-completed"><summary>已完成 <span>${done.length}</span></summary>${done.map((item) => `<div class="mini-row done"><b>${esc(item.title)}</b><small>${esc(formatDate(item.startsAt))}</small></div>`).join("")}</details>` : ""}
        </article>
        <p class="schedule-timezone">时区：${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)} · 不确定的时间将在确认时标出</p>
      </section>
    `;
  }

  function scheduleItemHtml(item) {
    return `
      <div class="schedule-item">
        <span>${esc(scheduleImport.kind(item.kind) || item.kind || "DDL")}</span>
        <div><b>${esc(item.title)}</b><small>${esc([item.course, formatDate(item.startsAt), item.location].filter(Boolean).join(" · "))}</small></div>
        <strong data-countdown="${esc(item.startsAt)}">${esc(dueText(item.startsAt))}</strong>
        <button data-action="complete-schedule" data-course="${esc(item.courseId)}" data-doc="${esc(item.docId)}">已完成</button>
      </div>
    `;
  }

  function scheduleReviewHtml() {
    if (!state.scheduleDrafts.length) return "";
    return `<article class="card schedule-review"><h2>核对提取结果（${state.scheduleDrafts.length} 条）</h2>
      <p>${esc(state.scheduleSource)} · 尚未加入时间表。请核对时间及班号，只勾选你需要的项目。</p>
      <fieldset ${state.scheduleImportBusy ? "disabled" : ""}>
      ${state.scheduleDrafts.map((item, index) => `<section class="schedule-draft" data-draft="${index}">
        <label class="schedule-select"><input type="checkbox" data-draft-field="selected" ${item.selected ? "checked" : ""}>加入时间表</label>
        <div class="inline-fields"><label>类型<select data-draft-field="kind">${["DDL", "LEC", "TUT"].map((kind) => `<option ${item.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label>
        <label>日期与时间<input type="datetime-local" data-draft-field="startsAt" value="${esc(item.startsAt)}"></label></div>
        <label>标题<input data-draft-field="title" value="${esc(item.title)}" maxlength="160"></label>
        <div class="inline-fields"><label>课程<input data-draft-field="course" value="${esc(item.course)}"></label><label>地点 / 链接<input data-draft-field="location" value="${esc(item.location)}"></label></div>
        <label>备注<textarea data-draft-field="notes">${esc(item.notes)}</textarea></label>
        ${item.evidence ? `<p class="muted">原文：${esc(item.evidence)}</p>` : ""}
        ${item.warning ? `<p class="schedule-warning">需核对：${esc(item.warning)}</p>` : ""}
      </section>`).join("")}
      <div class="inline-fields"><button class="primary" data-action="confirm-schedule">确认并添加所选项目</button><button data-action="cancel-schedule">取消导入</button></div>
      </fieldset></article>`;
  }

  async function extractScheduleFile() {
    if (state.scheduleImportBusy || state.scheduleDrafts.length) return;
    const file = $("scheduleFile")?.files?.[0];
    if (!file) throw new Error("请先选择一个文件。");
    validateUploadFile(file);
    if (/\.pdf$/i.test(file.name) && file.size > 8 * 1024 * 1024) throw new Error("PDF 最大支持 8 MB。");
    state.scheduleImportBusy = true;
    state.scheduleImportStatus = "正在读取文件并提取 DDL / LEC / TUT…";
    render();
    try {
      const [payload] = await readFiles([file]);
      const result = await api("/api/schedule/extract", { method: "POST", body: { ...payload, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      state.scheduleDrafts = result.items;
      state.scheduleSource = result.fileName;
      state.scheduleImportStatus = result.items.length ? `提取到 ${result.items.length} 条，请在下方核对并确认。` : "未找到可提取的时间点。请尝试更清晰的文件或分批上传，也可以手动添加。";
    } catch (error) { state.scheduleImportStatus = error.message; }
    finally { state.scheduleImportBusy = false; render(); }
  }

  async function confirmScheduleImport() {
    if (state.scheduleImportBusy) return;
    const selected = state.scheduleDrafts.filter((item) => item.selected);
    if (!selected.length) throw new Error("请至少勾选一个项目。");
    if (selected.some((item) => !item.title.trim() || !scheduleImport.validTime(item.startsAt))) throw new Error("请为所选项目补全有效的标题、日期和时间。");
    state.scheduleImportBusy = true;
    state.scheduleImportStatus = "正在保存已确认的项目…";
    render();
    let saved = 0, duplicates = 0;
    try {
      await loadScheduleItems(true, true);
      const seen = new Set(state.scheduleItems.map(scheduleImport.fingerprint));
      const course = await ensureScheduleCourse();
      for (const item of selected) {
        const key = scheduleImport.fingerprint(item);
        if (seen.has(key)) { duplicates++; }
        else {
          const payload = { ...item, startsAt: new Date(item.startsAt).toISOString(), completedAt: "", source: state.scheduleSource };
          delete payload.selected;
          await api(`/api/courses/${course.id}/documents`, { method: "POST", body: { title: `${SCHEDULE_PREFIX} ${item.title}`, type: "Schedule", text: JSON.stringify(payload) } });
          seen.add(key);
          saved++;
        }
        state.scheduleDrafts = state.scheduleDrafts.filter((draft) => draft !== item);
      }
      state.scheduleDrafts = [];
      state.scheduleImportStatus = `已添加 ${saved} 条倒计时提醒${duplicates ? `，跳过 ${duplicates} 条重复项目` : ""}。`;
    } catch (error) { state.scheduleImportStatus = `已保存 ${saved} 条，其余项目仍待确认。${error.message}`; }
    finally {
      await loadScheduleItems().catch(() => {});
      state.scheduleImportBusy = false;
      render();
    }
  }

  function toolsPage() {
    return `
      ${pageHeader("STUDY TOOLS", "工具", state.tool === "email" ? "粘贴邮件内容，StudyBridge 会帮你看懂并起草回复。" : "文档、表格、演示和图片")}
      <section class="tools-tabs" aria-label="工具选择">
        ${["docs", "sheets", "slides", "images", "cheatsheet", "email", "video"].map((tool) => `<button class="${(state.tool || "docs") === tool ? "active" : ""}" aria-pressed="${(state.tool || "docs") === tool}" data-action="tool-mode" data-tool="${tool}" ${tool === "video" && !creativeTools.videoEnabled() ? 'disabled title="视频生成暂未开放"' : ""}>${({ docs: "SB Docs", sheets: "SB Sheets", slides: "SB Slides", images: "图片", cheatsheet: "Cheatsheet PDF", email: "邮件助手", video: creativeTools.videoEnabled() ? "视频" : "视频 · 未开放" })[tool]}</button>`).join("")}
      </section>
      ${officeTools.supports(state.tool || "docs") ? `<nav class="office-view-switch" aria-label="工作方式"><button data-action="office-view-edit" aria-pressed="${state.toolView !== "generate"}">自主编辑</button><button data-action="office-view-generate" aria-pressed="${state.toolView === "generate"}">AI 文件生成</button></nav>` : ""}
      ${state.tool === "email" ? emailPage() : officeTools.supports(state.tool || "docs") && state.toolView !== "generate" ? officeTools.html(state.tool || "docs") : creativeTools.html(creativeContext())}
    `;
  }

  function creativeContext() {
    const userId = state.user?.id, tool = state.tool || "docs";
    let savedCourse = "";
    try { savedCourse = localStorage.getItem(`studybridge.cheatsheetCourse.${userId}`) || ""; } catch { /* Storage may be disabled. */ }
    const courseId = state.courses.some((course) => course.id === state.activeCourseId) ? state.activeCourseId : state.courses.some((course) => course.id === savedCourse) ? savedCourse : state.courses[0]?.id || "";
    return { userId, tool, courseId, courses: state.courses, api, readFiles, esc, render,
      beforeGenerate: async () => { if (tool === "cheatsheet") { clearTimeout(learningStyleTimer); await getLearningStyleEditor().saver.flush(); } },
      visible: () => state.user?.id === userId && state.mode !== "admin" && state.page === "tools" && state.tool !== "email" && (!officeTools.supports(state.tool || "docs") || state.toolView === "generate") };
  }

  function adminPage() {
    const overview = state.admin;
    const invites = overview?.invites || [];
    const users = overview?.users || [];
    const roleLabel = (role) => ["admin", "co-admin"].includes(String(role).toLowerCase()) ? "管理员" : "普通用户";
    return `
      ${pageHeader("CREATOR CONSOLE", "开发者端", "管理邀请码、用户、系统状态和密码重置申请。", false)}
      ${adminStatusHtml()}
      <section class="admin-management">
        <article class="admin-section" aria-labelledby="adminInvitesTitle">
          <div class="section-title"><h2 id="adminInvitesTitle">邀请码</h2><small>共 ${invites.length} 个</small></div>
          <div class="admin-invite-form">
            <label class="admin-invite-label" for="inviteLabel">备注<input id="inviteLabel" placeholder="例如 Kevin / ECO101 小组"></label>
            <label for="inviteRole">用户角色<select id="inviteRole"><option value="student">普通用户</option><option value="admin">Co-admin</option></select></label>
            <button class="primary" data-action="generate-invite">生成邀请码</button>
          </div>
          <div class="admin-list">${invites.length ? invites.map((invite) => `<div class="invite-row">
            <div class="admin-record-details"><b class="admin-invite-code">${esc(invite.code)}</b><div class="admin-record-meta"><span>${roleLabel(invite.role)}</span><span>仅限一次</span><span class="admin-invite-status ${invite.uses > 0 || !invite.active ? "is-disabled" : "is-active"}">${invite.uses > 0 ? "已使用" : invite.active ? "未使用" : "已停用"}</span></div>${invite.label ? `<p class="admin-record-note">${esc(invite.label)}</p>` : ""}</div>
            <div class="admin-row-actions"><button data-copy="${esc(invite.code)}" aria-label="复制邀请码 ${esc(invite.code)}">复制</button><button data-action="toggle-invite" data-id="${esc(invite.id)}" data-active="${invite.active ? "false" : "true"}" ${invite.uses > 0 ? "disabled" : ""}>${invite.uses > 0 ? "已使用" : invite.active ? "停用" : "启用"}</button><button class="admin-delete-invite" data-action="delete-invite" data-id="${esc(invite.id)}" data-code="${esc(invite.code)}" aria-label="删除邀请码 ${esc(invite.code)}">删除</button></div>
          </div>`).join("") : `<p class="muted admin-empty">暂无邀请码。</p>`}</div>
        </article>
        <article class="admin-section" aria-labelledby="adminUsersTitle">
          <div class="section-title"><h2 id="adminUsersTitle">用户</h2><small>共 ${users.length} 人</small></div>
          <div class="admin-list">${users.length ? users.map((user) => `<div class="user-row">
            <div class="admin-record-details"><b>${esc(user.name)}</b><p class="admin-record-note">${esc(user.email)}</p><div class="admin-record-meta"><span>${roleLabel(user.role)}</span>${user.inviteCode ? `<span>邀请码 <span class="admin-invite-code">${esc(user.inviteCode)}</span></span>` : ""}</div><p class="admin-record-note">最近在线：<time data-last-seen-user="${esc(user.id)}" ${user.lastSeenAt ? `datetime="${esc(user.lastSeenAt)}" title="${esc(new Date(user.lastSeenAt).toLocaleString())}"` : ""}>${userActivity.relativeTime(user.lastSeenAt)}</time></p></div>
            <dl class="admin-user-stats"><div><dt>课程</dt><dd>${user.stats?.courses || 0}</dd></div><div><dt>文档</dt><dd>${user.stats?.documents || 0}</dd></div><div><dt>聊天</dt><dd>${user.stats?.messages || 0}</dd></div></dl>
          </div>`).join("") : `<p class="muted admin-empty">暂无用户。</p>`}</div>
        </article>
      </section>
      <section class="card"><h2>密码重置申请</h2>${(overview?.resetRequests || []).length ? overview.resetRequests.map((req) => `<div class="mini-row"><b>${esc(req.email)}</b><small>${esc(req.status)}</small><button data-action="reset-password" data-id="${esc(req.id)}">生成临时密码</button></div>`).join("") : `<p class="muted">还没有密码重置申请。</p>`}</section>
    `;
  }

  function confirmInviteDeletion(code) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "admin-delete-dialog";
      dialog.setAttribute("aria-labelledby", "deleteInviteTitle");
      dialog.setAttribute("aria-describedby", "deleteInviteDescription");
      dialog.innerHTML = `<h2 id="deleteInviteTitle">删除邀请码？</h2><p class="admin-invite-code">${esc(code)}</p><p id="deleteInviteDescription">删除后，该邀请码将无法再用于注册。已注册的用户不受影响。</p><form method="dialog"><button value="cancel" autofocus>取消</button><button class="admin-confirm-delete" value="delete">删除邀请码</button></form>`;
      dialog.addEventListener("close", () => {
        const confirmed = dialog.returnValue === "delete";
        dialog.remove();
        resolve(confirmed);
      }, { once: true });
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  function adminStatusHtml() {
    const s = state.status;
    const cards = s ? [
      ["当前版本", s.version?.app || VERSION, `Node ${s.version?.node || ""}`],
      ["最后部署时间", formatDate(s.deploy?.lastCodeUpdateAt), "按服务器文件时间显示。"],
      ["数据库模式", s.database?.mode || "local", s.database?.ready ? "数据库可读取。" : "需要检查数据库。"],
      ["普通任务模型", s.ai?.simpleModel || "待检测", "普通任务的模型配置。"],
      ["复杂任务模型", s.ai?.complexModel || "待检测", s.ai?.routing === "task-complexity" ? "复杂任务固定使用此模型。" : `复杂任务分流比例：${s.ai?.complexRoutePercent ?? 0}%。`],
      ["联网模型分流", s.ai?.webSearchEnabled ? "沿用任务模型" : "联网已关闭", "联网、兼容重试和回退均保留普通／复杂任务的模型选择。"],
      ["最近完成的 AI 请求", s.ai?.lastRequest?.model || "暂无记录", s.ai?.lastRequest ? `${s.ai.lastRequest.api} · ${formatDate(s.ai.lastRequest.completedAt)}` : "仅记录本次服务启动后的模型和接口，不记录问题内容。"],
      ["AI 连通检测", s.ai?.configured === false ? "未配置" : s.ai?.ok ? "正常" : "异常", `仅检测普通任务模型。${s.ai?.detail || "等待检测。"}`],
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
      course: data.course || (course.name === SCHEDULE_COURSE ? "" : course.name),
      startsAt: data.startsAt || doc.createdAt,
      location: data.location || "",
      notes: data.notes || "",
      completedAt: data.completedAt || ""
    };
  }

  async function loadStudy() {
    const coursesData = await api("/api/courses");
    state.courses = coursesData.courses || [];
    if (!state.activeCourseId) {
      try { state.activeCourseId = localStorage.getItem(`studybridge.chatSpace.${state.user.id}`) || ""; } catch { /* Storage may be disabled. */ }
    }
    if (!isGeneralChat() && !state.courses.some((c) => c.id === state.activeCourseId)) {
      state.activeCourseId = state.courses[0]?.id || chatSpaces.general.id;
    }
    loadStudyMode();
    if (state.activeCourseId) {
      const courseId = state.activeCourseId;
      const replyAtLoad = activeStudyReply();
      const [docsData, messagesData] = await Promise.all([
        isGeneralChat() ? Promise.resolve({ documents: [] }) : api(`/api/courses/${courseId}/documents`),
        api(`/api/courses/${courseId}/messages`)
      ]);
      if (courseId !== state.activeCourseId) return;
      state.docs = docsData.documents || [];
      state.messages = mergeStudyReply(messagesData.messages || [], activeStudyReply() || replyAtLoad);
    } else {
      state.docs = [];
      state.messages = [];
    }
    await loadScheduleItems(false);
  }

  async function loadScheduleItems(refreshCourses = true, strict = false) {
    if (refreshCourses) {
      const coursesData = await api("/api/courses");
      state.courses = coursesData.courses || [];
    }
    const allDocs = [];
    for (const course of state.courses) {
      const data = await api(`/api/courses/${course.id}/documents`).catch((error) => {
        if (strict) throw error;
        return { documents: [] };
      });
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
    const pageGeneration = ++pageLoadGeneration;
    const generation = ++classmatesGeneration;
    setPage(page);
    state.busy = true;
    if (page === "community") { state.community = null; state.communityError = ""; }
    render();
    try {
      if (page === "study") await loadStudy();
      if (page === "community") {
        const query = communityQuery();
        const hasSelection = state.communityChannel === "all" || Boolean(communityValue().trim());
        const [data, choices] = await Promise.all([
          hasSelection ? api(`/api/community?${query}`) : Promise.resolve(null),
          state.communityChoices || api("/api/community/channels").catch(() => null)
        ]);
        if (pageGeneration !== pageLoadGeneration) return;
        state.community = data;
        state.communityChoices = choices;
      }
      if (page === "classmates") {
        const data = await api("/api/classmates");
        if (generation !== classmatesGeneration) return;
        state.classmates = data;
        const classmates = state.classmates.classmates || [];
        if (state.activeClassmateId && !classmates.some((item) => item.id === state.activeClassmateId)) {
          state.activeClassmateId = "";
          state.classmateChatOpen = false;
        }
        if (state.classmateChatOpen && state.activeClassmateId) {
          const dm = await api(`/api/classmates/${state.activeClassmateId}/messages`);
          if (generation !== classmatesGeneration) return;
          state.directMessages = dm.messages || [];
          state.directMessageReadIds = dm.readMessageIds || [];
        } else {
          state.directMessages = [];
          state.directMessageReadIds = [];
        }
      }
      if (page === "schedule") await loadScheduleItems();
      if (page === "tools" && state.tool !== "email") {
        const data = await api("/api/courses");
        state.courses = data.courses || [];
        if (!officeTools.supports(state.tool || "docs") || state.toolView === "generate") await creativeTools.load(creativeContext());
      }
      if (page === "admin") {
        state.admin = await api("/api/admin/overview");
        state.status = await api("/api/admin/system-status").catch(() => state.status);
      }
    } catch (error) {
      if (page === "community") {
        if (pageGeneration !== pageLoadGeneration) return;
        state.communityError = error.message;
      }
      setToast(error.message);
    } finally {
      if ((page !== "classmates" || generation === classmatesGeneration)
        && (page !== "community" || pageGeneration === pageLoadGeneration)) {
        state.busy = false;
        render();
        if (state.page === "classmates") void syncClassmatesLive();
      }
    }
  }

  function stopClassmatesLive() {
    classmatesEvents?.close();
    classmatesEvents = null;
    clearInterval(classmatesPoll);
    classmatesPoll = null;
    classmatesSyncQueued = false;
    classmatesGeneration += 1;
  }

  function startClassmatesLive() {
    if (!state.user || state.mode === "admin" || state.page !== "classmates") {
      stopClassmatesLive();
      return;
    }
    if (classmatesPoll) return;
    if (typeof EventSource !== "undefined") {
      classmatesEvents = new EventSource("/api/classmates/events");
      classmatesEvents.addEventListener("open", () => void syncClassmatesLive());
      classmatesEvents.addEventListener("classmates", () => void syncClassmatesLive());
    }
    // Reconcile missed events, including updates handled by another server instance.
    classmatesPoll = setInterval(() => void syncClassmatesLive(), 5000);
  }

  async function syncClassmatesLive() {
    if (!state.user || state.mode === "admin" || state.page !== "classmates" || document.hidden) return;
    if (classmatesSyncing || state.busy) {
      classmatesSyncQueued = true;
      return;
    }
    classmatesSyncing = true;
    classmatesSyncQueued = false;
    const generation = classmatesGeneration;
    const chatId = state.activeClassmateId;
    const chatOpen = state.classmateChatOpen;
    try {
      const classmates = await api("/api/classmates");
      const selected = classmates.classmates.find((mate) => mate.id === chatId);
      const dm = chatOpen && selected ? await api(`/api/classmates/${selected.id}/messages`) : { messages: [], readMessageIds: [] };
      if (generation !== classmatesGeneration || state.page !== "classmates" || state.busy || chatId !== state.activeClassmateId || chatOpen !== state.classmateChatOpen) return;
      state.classmates = classmates;
      state.activeClassmateId = selected?.id || "";
      if (!selected) state.classmateChatOpen = false;
      state.directMessages = dm.messages || [];
      state.directMessageReadIds = dm.readMessageIds || [];
      updateClassmatesLiveView();
      requestAnimationFrame(acknowledgeClassmateRead);
    } catch (error) {
      if (generation === classmatesGeneration && error.status === 401) stopClassmatesLive();
    } finally {
      classmatesSyncing = false;
      if (classmatesSyncQueued) {
        classmatesSyncQueued = false;
        void syncClassmatesLive();
      }
    }
  }

  function updateClassmatesLiveView() {
    if (state.classmateChatOpen && state.classmateProfileOpen) {
      const current = root.querySelector(".peer-profile-body");
      if (!current) {
        render();
        return;
      }
      const template = document.createElement("template");
      template.innerHTML = classmatesPage();
      for (const selector of [".dm-header", ".peer-profile-body"]) {
        const element = root.querySelector(selector);
        const next = template.content.querySelector(selector);
        if (element.innerHTML !== next.innerHTML) element.innerHTML = next.innerHTML;
      }
      return;
    }
    const panel = root.querySelector(".chat-panel");
    if (state.classmateChatOpen ? !panel || panel.dataset.chatId !== state.activeClassmateId : Boolean(panel || root.querySelector(".peer-profile-page"))) {
      render();
      return;
    }
    const template = document.createElement("template");
    template.innerHTML = classmatesPage();
    const selectors = state.classmateChatOpen ? [".dm-header"] : [".friend-list", ".request-box"];
    for (const selector of selectors) {
      const current = root.querySelector(selector);
      const next = template.content.querySelector(selector);
      if (current.innerHTML === next.innerHTML) continue;
      if (selector === ".request-box") next.open = current.open;
      current.replaceWith(next);
    }
    if (!panel) return;
    const list = panel.querySelector(".dm-list");
    const nextList = template.content.querySelector(".dm-list");
    if (list.innerHTML === nextList.innerHTML) return;
    const nearBottom = list.scrollHeight - list.clientHeight - list.scrollTop < 64;
    const scrollTop = list.scrollTop;
    list.innerHTML = nextList.innerHTML;
    list.scrollTop = nearBottom ? list.scrollHeight : scrollTop;
  }

  async function acknowledgeClassmateRead() {
    if (document.hidden || state.page !== "classmates" || !state.classmateChatOpen || state.classmateProfileOpen || state.busy) return;
    const chatId = state.activeClassmateId;
    if (root.querySelector(".chat-panel")?.dataset.chatId !== chatId) return;
    const messageIds = state.directMessageReadIds.filter((id) => !classmateReadPending.has(id)).slice(0, 10000);
    if (!messageIds.length) return;
    messageIds.forEach((id) => classmateReadPending.add(id));
    try {
      const result = await api(`/api/classmates/${chatId}/read`, { method: "POST", body: { messageIds } });
      const mate = state.classmates?.classmates.find((item) => item.id === chatId);
      if (mate) mate.unreadCount = result.unreadCount;
      if (state.activeClassmateId === chatId) {
        const read = new Set(messageIds);
        state.directMessageReadIds = state.directMessageReadIds.filter((id) => !read.has(id));
      }
      if (state.page === "classmates") updateClassmatesLiveView();
    } catch {
      // Retry acknowledgement on the next automatic sync after a connection failure.
    } finally {
      messageIds.forEach((id) => classmateReadPending.delete(id));
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
    incoming.forEach(validateUploadFile);
    const seen = new Set(state.uploadFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    for (const file of incoming) {
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
    if (isGeneralChat()) throw new Error("请在对话输入区上传附件，或选择课程后上传课程资料。");
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
      if (action === "view-chat-image") { showChatImage(button.dataset.imageUrl, button.dataset.imageName); return; }
      if (action.startsWith("creative-")) { await creativeTools.handle(button, creativeContext()); return; }
      if (action === "cheatsheet-pdf") {
        if (isGeneralChat() || !state.activeCourseId) throw new Error("请先选择课程。");
        clearTimeout(learningStyleTimer);
        await captureLearningStyle().saver.flush();
        const prompt = $("chatInput")?.value || "";
        pdfReturnDrafts.set(studyReplyKey(), prompt);
        creativeTools.prepareCheatsheet({ ...creativeContext(), courseId: state.activeCourseId }, prompt.trim(), state.uploadFiles);
        state.tool = "cheatsheet";
        localStorage.setItem(`studybridge.cheatsheetCourse.${state.user.id}`, state.activeCourseId);
        localStorage.setItem("studybridge.tool", state.tool);
        await loadPage("tools");
        return;
      }
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
      if (action === "settings") {
        clearTimeout(learningStyleTimer);
        if ($("englishTerms")) void captureLearningStyle().saver.flush().catch(() => {});
        appearanceController.open();
        return;
      }
      if (action === "logout") {
        appearanceController.reset();
        for (const url of uploadPreviewUrls.values()) URL.revokeObjectURL(url);
        uploadPreviewUrls.clear();
        clearTimeout(learningStyleTimer);
        learningStyleEditor?.saver.dispose();
        learningStyleEditor = null;
        for (const reply of studyReplies.values()) reply.controller.abort();
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
        if (state.activeCourseId !== button.dataset.id) { state.messages = []; state.docs = []; }
        state.activeCourseId = button.dataset.id;
        try { localStorage.setItem(`studybridge.chatSpace.${state.user.id}`, state.activeCourseId); } catch { /* Storage may be disabled. */ }
        await loadPage("study");
        return;
      }
      if (action === "delete-course") {
        if (!confirm("确定删除这门课程吗？")) return;
        studyReplies.get(studyReplyKey(state.user.id, button.dataset.id))?.controller.abort();
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
        clearTimeout(learningStyleTimer);
        await captureLearningStyle().saver.flush();
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
        if (input) {
          input.value = button.dataset.prompt || "";
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
        return;
      }
      if (action === "send-chat") {
        await sendStudyChat();
        return;
      }
      if (action === "stop-chat") {
        activeStudyReply()?.controller.abort();
        return;
      }
      if (action === "save-profile") {
        const data = await api("/api/me/profile", { method: "PUT", body: { name: $("profileName")?.value || "", school: $("profileSchool")?.value || "", major: $("profileMajor")?.value || "", sbId: $("profileSbId")?.value || "", avatarUrl: await readProfileImageFile($("profileAvatarFile"), $("profileAvatar")?.value || ""), backgroundUrl: await readProfileImageFile($("profileCoverFile"), $("profileCover")?.value || "") } });
        state.user = data.user;
        setToast("资料已保存。");
        await loadPage("profile");
        return;
      }
      if (action === "community-compose") {
        $("postTopic")?.focus();
        $("postTopic")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (action === "community-select" || action === "community-default") {
        const value = action === "community-default" ? profile()[state.communityChannel] : $("communityChannelValue")?.value.trim();
        if (!value) throw new Error("请先选择或输入频道名称。");
        state.communitySelections[state.communityChannel] = value;
        await loadPage("community");
        return;
      }
      if (action === "community-retry") {
        await loadPage("community");
        return;
      }
      if (action === "community-channel") {
        state.communityChannel = button.dataset.channel || "all";
        await loadPage("community");
        return;
      }
      if (action === "community-post") {
        if (state.busy || state.communityError) return;
        await api("/api/community/posts", { method: "POST", body: { channel: state.communityChannel, channelValue: communityValue(), topic: $("postTopic")?.value || "Question", content: $("postContent")?.value || "", anonymous: $("postAnon")?.checked } });
        state.communityDraft = { topic: "", content: "", anonymous: false };
        state.communityChoices = null;
        await loadPage("community");
        return;
      }
      if (action === "community-like") {
        await api(`/api/community/posts/${button.dataset.id}/like?${communityQuery()}`, { method: "PATCH" });
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
        const chatId = button.dataset.id;
        classmateListScroll = window.scrollY;
        classmateListDraft = $("classmateSbId")?.value || "";
        classmateRequestsOpen = root.querySelector(".request-box")?.open || false;
        state.activeClassmateId = chatId;
        state.classmateChatOpen = true;
        state.classmateProfileOpen = false;
        state.directMessages = [];
        state.directMessageReadIds = [];
        await loadPage("classmates");
        if (state.classmateChatOpen && state.activeClassmateId === chatId) window.scrollTo(0, 0);
        return;
      }
      if (action === "back-classmates") {
        classmatesGeneration += 1;
        state.busy = false;
        state.classmateChatOpen = false;
        state.classmateProfileOpen = false;
        render();
        window.scrollTo(0, classmateListScroll);
        root.querySelector(`.friend-row[data-id="${CSS.escape(state.activeClassmateId)}"]`)?.focus({ preventScroll: true });
        void syncClassmatesLive();
        return;
      }
      if (action === "view-classmate-profile") {
        const list = root.querySelector(".dm-list");
        if (!list || !state.classmateChatOpen) return;
        classmateProfileChatScroll = list.scrollTop;
        classmateProfileChatAtBottom = list.scrollHeight - list.clientHeight - list.scrollTop < 64;
        state.classmateProfileOpen = true;
        render();
        root.querySelector("[data-action='back-classmate-chat']")?.focus({ preventScroll: true });
        return;
      }
      if (action === "back-classmate-chat") {
        state.classmateProfileOpen = false;
        render();
        const list = root.querySelector(".dm-list");
        if (list) list.scrollTop = classmateProfileChatAtBottom ? list.scrollHeight : classmateProfileChatScroll;
        root.querySelector(".dm-header .peer-avatar-button")?.focus({ preventScroll: true });
        void syncClassmatesLive();
        return;
      }
      if (action === "send-dm") {
        if (!state.activeClassmateId) throw new Error("请先选择一位同学。");
        const chatId = state.activeClassmateId;
        const input = $("dmInput");
        const content = input?.value.trim() || "";
        if (!content || button.disabled) return;
        button.disabled = true;
        try {
          await api(`/api/classmates/${chatId}/messages`, { method: "POST", body: { content } });
        } finally {
          button.disabled = false;
        }
        input.value = "";
        state.directMessageDrafts[chatId] = "";
        if (!state.classmateChatOpen || state.activeClassmateId !== chatId) return;
        await loadPage("classmates");
        const list = root.querySelector(".dm-list");
        if (list) list.scrollTop = list.scrollHeight;
        $("dmInput")?.focus({ preventScroll: true });
        return;
      }
      if (action === "draft-email") {
        const prompt = `请帮我处理这封邮件。\n邮件原文：${$("emailOriginal")?.value || ""}\n我想怎么回复：${$("emailGoal")?.value || ""}\n语气：${$("emailTone")?.value || ""}\n输出：${$("emailOutput")?.value || ""}`;
        const output = $("toolOutput");
        output.textContent = "正在生成...";
        const course = state.activeCourseId || (state.courses[0]?.id);
        if (!course) throw new Error("请先在学习区新增一门课程，用来保存 AI 对话。");
        const data = await api(`/api/courses/${course}/chat`, { method: "POST", body: { message: prompt, mode: "email" } });
        emailDraft.output = formatText((data.messages || []).at(-1)?.content || "");
        if ($("emailOriginal")) $("toolOutput").innerHTML = emailDraft.output;
        return;
      }
      if (action === "add-schedule") {
        if (button.disabled) return;
        const startsAt = $("scheduleTime")?.value || "";
        const title = $("scheduleTitle")?.value.trim() || "";
        if (!title || !scheduleImport.validTime(startsAt)) throw new Error("请填写标题和有效日期、时间。");
        button.disabled = true;
        try {
        const course = await ensureScheduleCourse();
        const payload = { title, kind: $("scheduleKind")?.value || "DDL", course: $("scheduleCourse")?.value || "", startsAt: new Date(startsAt).toISOString(), location: $("scheduleLocation")?.value || "", notes: $("scheduleNotes")?.value || "", completedAt: "" };
        await api(`/api/courses/${course.id}/documents`, { method: "POST", body: { title: `${SCHEDULE_PREFIX} ${payload.title}`, type: "Schedule", text: JSON.stringify(payload) } });
        state.scheduleManualDraft = {};
        await loadPage("schedule");
        } finally { button.disabled = false; }
        return;
      }
      if (action === "extract-schedule") { await extractScheduleFile(); return; }
      if (action === "confirm-schedule") { await confirmScheduleImport(); return; }
      if (action === "cancel-schedule") {
        if (state.scheduleImportBusy) return;
        state.scheduleDrafts = [];
        state.scheduleImportStatus = "已取消，未添加待确认项目。";
        render(); return;
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
        if (button.dataset.tool === "video" && !creativeTools.videoEnabled()) return;
        creativeTools.capture();
        officeTools.capture();
        state.tool = button.dataset.tool || "docs";
        state.toolView = "edit";
        localStorage.setItem("studybridge.tool", state.tool);
        render();
        if (state.tool !== "email" && !officeTools.supports(state.tool)) { await creativeTools.load(creativeContext()); render(); }
        return;
      }
      if (action === "office-view-edit" || action === "office-view-generate") {
        officeTools.capture();
        creativeTools.capture();
        state.toolView = action === "office-view-generate" ? "generate" : "edit";
        render();
        if (state.toolView === "generate") { await creativeTools.load(creativeContext()); render(); }
        return;
      }
      if (action === "copy-output") {
        await window.StudyBridgeClipboard.copyText($("toolOutput")?.innerText || "");
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
        await api("/api/admin/invites", { method: "POST", body: { label: $("inviteLabel")?.value || "", role: $("inviteRole")?.value || "student" } });
        await loadPage("admin");
        return;
      }
      if (action === "toggle-invite") {
        await api(`/api/admin/invites/${button.dataset.id}`, { method: "PATCH", body: { active: button.dataset.active === "true" } });
        await loadPage("admin");
        return;
      }
      if (action === "delete-invite") {
        if (!await confirmInviteDeletion(button.dataset.code)) return;
        button.disabled = true;
        try {
          await api(`/api/admin/invites/${button.dataset.id}`, { method: "DELETE" });
          setToast("邀请码已删除。");
          await loadPage("admin");
        } finally {
          button.disabled = false;
        }
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

  function keepLatestAfterFontLoad(list) {
    if (!document.fonts || document.fonts.status === "loaded"
      || list.scrollHeight - list.clientHeight - list.scrollTop > 2) return;
    // Intentional history reading takes priority over following a late font swap.
    let interrupted = false;
    const interrupt = () => { interrupted = true; };
    const events = ["wheel", "touchmove", "pointerdown", "keydown"];
    for (const event of events) list.addEventListener(event, interrupt, { passive: true });
    document.fonts.ready.then(() => {
      for (const event of events) list.removeEventListener(event, interrupt);
      if (list.isConnected && !interrupted) {
        list.scrollTop = list.scrollHeight;
        if (list.classList.contains("dm-list")) acknowledgeClassmateRead();
      }
    });
  }

  function render() {
    appearanceController.sync(state.user);
    officeTools.capture();
    creativeTools.capture();
    const previousAdminWorkspace = root.querySelector(".admin-workspace");
    const previousAdminScroll = previousAdminWorkspace?.scrollTop || 0;
    const previousSidebar = root.querySelector(".sidebar");
    const previousSidebarContext = previousSidebar?.dataset.sidebarContext;
    const previousSidebarScroll = previousSidebar?.scrollTop || 0;
    const sidebarUsesPageScroll = previousSidebar
      && previousSidebar.scrollHeight <= previousSidebar.clientHeight;
    const previousPageScroll = { x: window.scrollX, y: window.scrollY };
    for (const id of ["emailOriginal", "emailGoal", "emailTone", "emailOutput"]) {
      if ($(id)) emailDraft[id] = $(id).value;
    }
    if ($("emailOriginal")) emailDraft.output = $("toolOutput")?.innerHTML || "";
    const previousDm = root.querySelector(".dm-list");
    const previousDmId = previousDm?.parentElement.dataset.chatId;
    const previousDmMessages = previousDm?.innerHTML;
    const previousDmScroll = previousDm?.scrollTop || 0;
    const previousDmDraft = $("dmInput")?.value || "";
    if (state.user && previousDmId) state.directMessageDrafts[previousDmId] = previousDmDraft;
    const previousChat = root.querySelector(".study-workspace .chat-area");
    const previousCourseId = previousChat?.parentElement.dataset.courseId;
    const previousMessages = previousChat?.querySelector(".messages")?.innerHTML;
    const previousScrollTop = previousChat?.scrollTop || 0;
    const previousChatDraft = $("chatInput")?.value || "";
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
    for (const id of ["emailOriginal", "emailGoal", "emailTone", "emailOutput"]) {
      if ($(id) && emailDraft[id] !== undefined) $(id).value = emailDraft[id];
    }
    if ($("emailOriginal") && emailDraft.output) $("toolOutput").innerHTML = emailDraft.output;
    creativeTools.restoreFocus();
    void officeTools.mount(creativeContext());
    if (state.toast && state.user) root.insertAdjacentHTML("beforeend", `<div class="toast">${esc(state.toast)}</div>`);
    const sidebar = root.querySelector(".sidebar");
    if (sidebar && sidebar.dataset.sidebarContext === previousSidebarContext) {
      // Mobile sidebars scroll with the page instead of their own container.
      sidebar.scrollTop = previousSidebarScroll;
      if (sidebarUsesPageScroll) window.scrollTo(previousPageScroll.x, previousPageScroll.y);
    }
    const adminWorkspace = root.querySelector(".admin-workspace");
    if (previousAdminWorkspace && adminWorkspace && sidebar?.dataset.sidebarContext === previousSidebarContext) {
      adminWorkspace.scrollTop = previousAdminScroll;
    }
    const chat = root.querySelector(".study-workspace .chat-area");
    if (chat) {
      if (previousCourseId === state.activeCourseId) $("chatInput").value = previousChatDraft;
      else if (pdfReturnDrafts.has(studyReplyKey())) {
        $("chatInput").value = pdfReturnDrafts.get(studyReplyKey());
        pdfReturnDrafts.delete(studyReplyKey());
      }
      const showLatest = !previousChat || previousCourseId !== state.activeCourseId
        || previousMessages !== chat.querySelector(".messages")?.innerHTML;
      chat.scrollTop = showLatest ? chat.scrollHeight : previousScrollTop;
      keepLatestAfterFontLoad(chat);
    }
    const dm = root.querySelector(".dm-list");
    if (dm) {
      const sameChat = previousDmId === dm.parentElement.dataset.chatId;
      dm.scrollTop = !sameChat || previousDmMessages !== dm.innerHTML ? dm.scrollHeight : previousDmScroll;
      keepLatestAfterFontLoad(dm);
      if (sameChat) $("dmInput").value = previousDmDraft;
    }
    startClassmatesLive();
    requestAnimationFrame(acknowledgeClassmateRead);
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
      void reportUserActivity();
      const savedTool = localStorage.getItem("studybridge.tool");
      state.tool = ["docs", "sheets", "slides", "images", "cheatsheet", "email"].includes(savedTool) ? savedTool : "docs";
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
      try {
        await window.StudyBridgeClipboard.copyText(copyTarget.dataset.copy || "");
        setToast("邀请码已复制。");
      } catch (error) {
        setToast(error.message || "复制失败，请直接选中邀请码手动复制。");
      }
      root.querySelector(".toast")?.remove();
      root.insertAdjacentHTML("beforeend", `<div class="toast" role="status" aria-live="polite">${esc(state.toast)}</div>`);
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      event.preventDefault();
      await handleAction(actionTarget);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "postAnon") { state.communityDraft.anonymous = event.target.checked; return; }
    if (["englishTerms", "englishAnswers", "chineseExplanations"].includes(event.target?.id)) { scheduleLearningStyleSave(); return; }
    if (event.target?.id === "scheduleFile") {
      const name = $("scheduleFileName");
      if (name) name.textContent = event.target.files?.[0]?.name || "选择课程文件";
      return;
    }
    if (event.target?.id === "studyMode") {
      const mode = event.target.value;
      if (!studyModes.getMode(mode)) return;
      state.studyMode = mode;
      try { localStorage.setItem(studyModeStorageKey(), mode); } catch { /* Keep the selection for this session. */ }
      root.querySelector(".quick-prompts").innerHTML = quickPromptsHtml();
      return;
    }
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

  document.addEventListener("input", (event) => {
    if (event.target?.id === "postTopic") { state.communityDraft.topic = event.target.value; return; }
    if (event.target?.id === "postContent") { state.communityDraft.content = event.target.value; return; }
    if (event.target?.id === "customInstruction") { scheduleLearningStyleSave(); return; }
    const manualField = event.target.dataset?.manualField;
    if (manualField) { state.scheduleManualDraft[manualField] = event.target.value; return; }
    const field = event.target.dataset?.draftField;
    if (!field) return;
    const item = state.scheduleDrafts[Number(event.target.closest("[data-draft]")?.dataset.draft)];
    if (item) item[field] = field === "selected" ? event.target.checked : event.target.value;
  });

  document.addEventListener("keydown", (event) => {
    if (event.target?.id === "communityChannelValue" && event.key === "Enter") {
      event.preventDefault();
      root.querySelector('[data-action="community-select"]')?.click();
    }
  });

  document.addEventListener("toggle", (event) => {
    if (event.target?.id === "scheduleManual") state.scheduleManualOpen = event.target.open;
  }, true);

  async function reportUserActivity() {
    const userId = state.user?.id;
    if (!userId) return;
    if (activityReport.userId !== userId) activityReport = { userId, time: 0, pending: false };
    const report = activityReport;
    if (report.pending || !userActivity.shouldReport({ visible: !document.hidden, lastInteractionAt, lastReportedAt: report.time })) return;
    report.pending = true;
    report.time = Date.now();
    try {
      await api("/api/me/activity", { method: "POST" });
      report.time = Date.now();
    } catch { /* Presence failures must not interrupt studying. */ }
    finally { report.pending = false; }
  }

  function updateAdminActivityLabels() {
    const users = new Map((state.admin?.users || []).map((user) => [user.id, user]));
    root.querySelectorAll("[data-last-seen-user]").forEach((element) => {
      const value = users.get(element.dataset.lastSeenUser)?.lastSeenAt;
      element.textContent = userActivity.relativeTime(value);
      if (value) {
        element.dateTime = value;
        element.title = new Date(value).toLocaleString();
      }
    });
  }

  for (const event of ["pointerdown", "keydown", "scroll"]) {
    document.addEventListener(event, () => { lastInteractionAt = Date.now(); void reportUserActivity(); }, { passive: true, capture: true });
  }
  setInterval(() => void reportUserActivity(), 15000);
  let adminActivityRefreshing = false;
  setInterval(async () => {
    if (document.hidden || !state.user || state.page !== "admin" || adminActivityRefreshing) return;
    const userId = state.user.id;
    adminActivityRefreshing = true;
    try {
      const overview = await api("/api/admin/overview");
      if (state.user?.id === userId && state.page === "admin") {
        const latest = new Map(overview.users.map((user) => [user.id, user.lastSeenAt]));
        for (const user of state.admin?.users || []) user.lastSeenAt = latest.get(user.id) || null;
        updateAdminActivityLabels();
      }
    } catch { /* Retain the last successful status during connection failures. */ }
    finally { adminActivityRefreshing = false; }
  }, 60000);

  setInterval(() => {
    updateAdminActivityLabels();
    root.querySelectorAll("[data-countdown]").forEach((element) => {
      element.textContent = dueText(element.dataset.countdown);
    });
  }, 15000);

  document.addEventListener("submit", async (event) => {
    if (!event.target.matches(".dm-compose")) return;
    event.preventDefault();
    await handleAction(event.target.querySelector("button[type='submit']"));
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      lastInteractionAt = Date.now();
      void reportUserActivity();
      void syncClassmatesLive();
    }
  });
  window.addEventListener("online", () => void syncClassmatesLive());
  window.addEventListener("pagehide", stopClassmatesLive);
  window.addEventListener("pageshow", startClassmatesLive);

  document.addEventListener("paste", (event) => {
    if (!state.user || state.page !== "study" || event.target?.id !== "chatInput") return;
    const files = window.StudyBridgeChatAttachments.clipboardImages(event.clipboardData);
    if (!files.length) return; // Let the browser paste ordinary text normally.
    event.preventDefault();
    const input = event.target;
    let start = input.selectionStart, end = input.selectionEnd;
    try {
      addChatFiles(files);
      const text = event.clipboardData.getData("text/plain");
      if (text) input.setRangeText(text, start, end, "end");
      start = input.selectionStart;
      end = input.selectionEnd;
    } catch (error) {
      setToast(error.message || "截图读取失败，请重试或选择图片文件。");
    }
    render();
    const restored = $("chatInput");
    restored?.focus();
    restored?.setSelectionRange(start, end);
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
