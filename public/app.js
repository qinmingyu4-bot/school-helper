(function () {
  "use strict";

  const VERSION = "1.1.94";
  const creativeTools = window.StudyBridgeCreativeTools;
  const officeTools = window.StudyBridgeOffice;
  const chatSpaces = window.StudyBridgeChatSpaces;
  const courseChats = window.StudyBridgeCourseConversations;
  const isGeneralChat = () => state.activeCourseId === chatSpaces.general.id;
  const studyModes = window.StudyBridgeStudyModes;
  const scheduleImport = window.StudyBridgeScheduleImport;
  const scheduleCalendarView = window.StudyBridgeScheduleCalendar;
  const scheduleDraftDisclosure = new WeakMap();
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
  const MAX_COURSE_UPLOAD_BYTES = window.StudyBridgeUploadLimits.courseFileBytes;
  let courseUploadPending = false;
  const communityReplies = window.StudyBridgeCommunityReplies.createController({ api, getUser: () => state.user, onChange: updateCommunityThread });

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
  const studyDrafts = new Map();
  const uploadPreviewUrls = new Map();
  const pdfReturnDrafts = new Map();
  let nextStudyReplyId = 0;
  const replyPhases = {
    reading: "读取附件中", preparing: "整合课程资料中", thinking: "思考中",
    searching: "检索中", integrating: "整合中", writing: "正在回答", saving: "保存中"
  };
  const studyReplyKey = (userId = state.user?.id, courseId = state.activeCourseId, conversationId = state.activeConversationId) => courseChats.key(userId, courseId, conversationId || courseChats.DEFAULT_ID);
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
    activeConversationId: "default",
    conversationCourseId: "",
    courseConversations: {},
    expandedCourses: {},
    renamingConversation: null,
    studyMode: studyModes.defaultMode,
    docs: [],
    messages: [],
    allDocs: [],
    scheduleItems: [],
    scheduleMonth: "",
    scheduleSelectedDate: "",
    scheduleAgendaView: "upcoming",
    scheduleAgendaTypes: [],
    scheduleUploadFile: null,
    scheduleImportOpen: false,
    scheduleSaving: false,
    scheduleClockSignature: "",
    scheduleDrafts: [],
    scheduleSource: "",
    scheduleImportedCourses: [],
    scheduleDraftOrigin: "file",
    scheduleQuickText: "",
    scheduleQuickStatus: "",
    scheduleVoicePhase: "idle",
    scheduleVoiceMessage: "",
    scheduleVoicePending: false,
    scheduleVoiceFile: null,
    scheduleImportBusy: false,
    scheduleImportProgress: null,
    scheduleImportStatus: "",
    scheduleCalendar: null,
    scheduleCalendarNotice: "",
    scheduleCalendarDraft: { startDate: "", endDate: "", breaks: "", timeZone: "" },
    scheduleCalendarEditing: false,
    scheduleFromDate: "",
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

  let scheduleVoiceRequest = null;
  const scheduleVoiceRecorder = window.StudyBridgeScheduleVoice.createRecorder({
    onState: ({ phase, message }) => { state.scheduleVoicePhase = phase; state.scheduleVoiceMessage = message; updateScheduleVoiceUi(); },
    onAudio: (blob) => transcribeScheduleVoice(new File([blob], `recording.${blob.type.includes("mp4") ? "m4a" : "webm"}`, { type: blob.type }))
  });

  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const readProfileImageFile = window.StudyBridgeProfileImages.readInput;
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
    if (page !== "schedule") cancelScheduleVoice();
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
    const courses = courseChats.visibleCourses(state.courses);
    return `
      <section class="side-section" data-doc-dropzone="true">
        <div class="section-title"><b>对话与课程</b><button data-action="add-course">新增</button></div>
        <div class="course-list">
          <button class="course-item ${isGeneralChat() ? "active" : ""}" data-action="select-course" data-id="${chatSpaces.general.id}">
            <b>${chatSpaces.general.name}</b><small>${chatSpaces.general.term}</small>
          </button>
          ${courses.length ? courses.map(courseFolderHtml).join("") : `<p class="muted">还没有课程。导入课表可自动添加，也可点击新增。</p>`}
        </div>
      </section>
      ${isGeneralChat() ? "" : `<section class="side-section study-materials">
        <div class="section-title"><b>课程资料</b><span>${state.docs.length}</span></div>
        <textarea id="docText" aria-label="课程资料内容" rows="3" placeholder="粘贴课程大纲、笔记或作业要求"></textarea>
        <div class="study-material-row">
          <input id="docTitle" aria-label="资料标题" placeholder="资料标题（选填）">
          <button class="study-side-icon" data-action="save-doc" title="保存课程资料" aria-label="保存课程资料"><svg aria-hidden="true"><use href="/classmates-icons.svg#save"></use></svg></button>
        </div>
        <div class="study-material-row study-file-row">
          <input id="docFile" type="file" aria-label="选择课程资料文件" accept="${SUPPORTED_UPLOAD_ACCEPT}" multiple>
          <button class="study-side-icon" data-action="upload-doc" title="上传所选文件" aria-label="上传所选文件"><svg aria-hidden="true"><use href="/classmates-icons.svg#upload"></use></svg></button>
        </div>
        <div class="study-material-list">${state.docs.length ? state.docs.map((doc) => `<div class="mini-row"><b>${esc(doc.title)}</b><small>${esc(doc.type || "Note")}</small></div>`).join("") : `<p class="muted">暂无课程资料</p>`}</div>
        <p class="muted">课程资料每个文件最多 50 MB，多文件逐个上传。较大 PDF 优先使用提取文字；扫描件建议拆分或先做文字识别。</p>
        <p id="courseUploadStatus" class="muted" role="status" aria-live="polite"></p>
      </section>`}
      <section class="side-section study-preferences">
        <div class="section-title"><b>学习偏好</b><span data-learning-style-status role="status">${learningStyleStatus()}</span></div>
        <p class="study-preference-scope">用于课程学习、作业和考试；日常问题按提问语言自然回答。</p>
        <div class="study-preference-options">
          ${prefBox("englishTerms", "保留英文术语")}
          ${prefBox("englishAnswers", "英文作答 / 草稿")}
          ${prefBox("chineseExplanations", "中文解释解题思路")}
        </div>
        <p hidden data-learning-style-summary>${esc(learningStyle.summary(getLearningStyleEditor().saver.snapshot().draft))}</p>
        <label class="study-instruction-label" for="customInstruction">自定义要求<span>选填</span></label>
        <textarea id="customInstruction" maxlength="500" rows="3" placeholder="例如：先给英文答案，再用中文解释">${esc(getLearningStyleEditor().saver.snapshot().draft.customInstruction)}</textarea>
        <div class="study-preference-footer"><small class="muted">本次提问的要求优先</small><button class="study-side-icon" data-action="save-prefs" title="保存偏好" aria-label="保存偏好"><svg aria-hidden="true"><use href="/classmates-icons.svg#save"></use></svg></button></div>
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
        <main class="workspace${state.mode !== "admin" && state.page === "study" ? " study-workspace" : ""}${state.mode !== "admin" && state.page === "classmates" ? " classmates-workspace" : ""}${fullChat ? " classmate-chat-workspace" : ""}${admin ? " admin-workspace" : ""}" id="workspace" data-course-id="${esc(state.activeCourseId)}" data-conversation-id="${esc(state.activeConversationId)}">
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

  function courseFolderHtml(course) {
    const open = Boolean(state.expandedCourses[course.id]);
    const rows = state.courseConversations[course.id] || [{ id: "default", title: "默认对话" }];
    return `<section class="course-folder" aria-label="${esc(course.name)} 的对话">
      <div class="course-folder-heading">
        <button data-action="toggle-course" data-id="${esc(course.id)}" aria-expanded="${open}" aria-label="${open ? "收起" : "展开"}${esc(course.name)}">${open ? "▾" : "▸"}</button>
        <button class="course-folder-name" data-action="select-course" data-id="${esc(course.id)}"><b>${esc(course.name)}</b><small>${esc(course.term || "Current term")}</small></button>
        <button data-action="new-conversation" data-id="${esc(course.id)}" aria-label="在 ${esc(course.name)} 下新增对话" title="新增对话">＋</button>
        <button data-action="delete-course" data-id="${esc(course.id)}" aria-label="删除课程 ${esc(course.name)}" title="删除课程">×</button>
      </div>
      ${open ? `<div class="course-chat-list">${rows.map((chat) => {
        const renaming = state.renamingConversation?.courseId === course.id && state.renamingConversation.id === chat.id;
        return renaming ? `<div class="course-chat-rename"><input id="conversationRename" data-course="${esc(course.id)}" data-conversation="${esc(chat.id)}" aria-label="对话标题" maxlength="120" value="${esc(state.renamingConversation.title ?? chat.title)}"><div><button data-action="save-conversation-name" data-id="${esc(course.id)}" data-conversation="${esc(chat.id)}">保存标题</button><button data-action="cancel-conversation-name">取消</button></div></div>`
          : `<div class="course-chat-row ${state.activeCourseId === course.id && state.activeConversationId === chat.id ? "active" : ""}"><button class="course-chat-title" data-action="select-conversation" data-id="${esc(course.id)}" data-conversation="${esc(chat.id)}" title="${esc(chat.title)}" ${state.activeCourseId === course.id && state.activeConversationId === chat.id ? 'aria-current="page"' : ""}>${esc(chat.title)}</button><button data-action="rename-conversation" data-id="${esc(course.id)}" data-conversation="${esc(chat.id)}" aria-label="重命名对话 ${esc(chat.title)}" title="重命名">✎</button></div>`;
      }).join("")}</div>` : ""}</section>`;
  }

  function studyPage() {
    const course = isGeneralChat() ? chatSpaces.general : state.courses.find((item) => item.id === state.activeCourseId);
    const conversation = state.courseConversations[state.activeCourseId]?.find((item) => item.id === state.activeConversationId);
    return `
      <header class="page-header"><div class="course-chat-heading"><small>${esc(course?.name || "请选择课程")}${!isGeneralChat() ? " · 课程资料共享" : ""}</small><h1 title="${esc(conversation?.title || course?.name || "请选择课程")}">${esc(conversation?.title || course?.name || "请选择课程")}</h1></div>${!isGeneralChat() && course ? `<button data-action="new-conversation" data-id="${esc(course.id)}">＋ 新对话</button>` : ""}</header>
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

  const studyModeStorageKey = () => `studybridge.studyMode.${state.user.id}.${state.activeCourseId}${state.activeConversationId === "default" ? "" : `.${state.activeConversationId}`}`;

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

  function sendButtonContent(pending) {
    return pending ? '<span class="reply-spinner send-spinner" aria-hidden="true"></span><span>停止</span>' : "发送";
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
          <button class="send" data-action="${activeStudyReply() ? "stop-chat" : "send-chat"}" ${state.busy ? "disabled" : ""} ${activeStudyReply() ? 'title="正在生成，点击停止" aria-label="停止生成"' : 'aria-label="发送"'}>${sendButtonContent(Boolean(activeStudyReply()))}</button>
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
    const action = pending ? "stop-chat" : "send-chat";
    // Preserve the spinner node across streamed text updates so its animation
    // does not restart with every incoming token.
    if (send.dataset.action !== action) send.innerHTML = sendButtonContent(pending);
    send.dataset.action = action;
    send.title = pending ? `${replyPhases[activeStudyReply()?.assistant.phase] || "正在生成"}，点击停止` : "发送";
    send.setAttribute("aria-label", pending ? "停止生成" : "发送");
    send.disabled = state.busy;
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
      key: studyReplyKey(), userId: state.user.id, courseId: state.activeCourseId, conversationId: state.activeConversationId, mode: state.studyMode,
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
        body: JSON.stringify({ conversationId: reply.conversationId, message: text, mode: reply.mode, attachments, learningStyle: reply.learningStyle, stream: true })
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
      if (reply.courseId !== chatSpaces.general.id && state.user?.id === reply.userId) {
        await refreshCourseConversations(reply.courseId).catch(() => {});
        if (state.page === "study") render();
      }
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
          <label>SB ID<input id="profileSbId" required maxlength="8" pattern="[A-Za-z0-9]{1,8}" title="1–8 位数字或字母，区分大小写" value="${esc(profileSbId())}" placeholder="1–8 位数字或字母，区分大小写"></label>
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
          <p class="profile-upload-note">支持 25 MB 以内的照片，保存时自动缩放压缩。未选择的图片会保留；若 HEIC 无法读取，请导出为 JPG 或 PNG。</p>
          <p id="profileSaveStatus" class="profile-upload-note" role="status" aria-live="polite"></p>
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

  function communityThreadHtml(postId) {
    const thread = communityReplies.thread(postId);
    const disabled = thread.loading || thread.sending;
    return `<section class="community-thread" id="community-thread-${esc(postId)}" data-community-thread="${esc(postId)}" aria-label="帖子回复" ${thread.open ? "" : "hidden"}>
      ${thread.open ? `<div class="community-thread-heading"><h5>帖子回复</h5><button type="button" data-action="community-replies-refresh" data-id="${esc(postId)}" ${disabled ? "disabled" : ""}>刷新回复</button></div>
      ${thread.nextBefore ? `<button type="button" data-action="community-replies-older" data-id="${esc(postId)}" ${disabled ? "disabled" : ""}>加载更早回复</button>` : ""}
      <div class="community-reply-list">${thread.replies.map((reply) => `<article class="community-reply"><div><b>${esc(reply.authorName)}${reply.mine ? " · 我" : ""}</b><time datetime="${esc(reply.createdAt)}">${esc(formatDate(reply.createdAt))}</time></div><p>${esc(reply.content)}</p></article>`).join("")}</div>
      ${thread.loading ? `<p role="status" class="muted">正在加载回复…</p>` : thread.loaded && !thread.replies.length ? `<p class="muted">还没有回复，来分享你的想法吧。</p>` : ""}
      ${thread.error ? `<p class="community-reply-error" role="alert">${esc(thread.error)}</p>` : ""}
      <label for="community-reply-${esc(postId)}">参与讨论</label><textarea id="community-reply-${esc(postId)}" data-community-reply="${esc(postId)}" maxlength="1600" rows="3" placeholder="写下你的回复…" ${thread.sending ? "disabled" : ""}>${esc(thread.draft)}</textarea>
      <div class="community-reply-actions"><small>回复将以你的账号姓名公开显示。</small><button type="button" class="primary" data-action="community-reply-send" data-id="${esc(postId)}" ${disabled ? "disabled" : ""}>${thread.sending ? "发送中…" : "发送回复"}</button></div>` : ""}
    </section>`;
  }

  function updateCommunityThread(postId) {
    if (state.page !== "community") return;
    const section = document.getElementById(`community-thread-${postId}`);
    if (!section) return;
    const focused = document.activeElement;
    const restore = focused?.dataset?.communityReply === postId;
    const selection = restore ? [focused.selectionStart, focused.selectionEnd] : null;
    section.outerHTML = communityThreadHtml(postId);
    const thread = communityReplies.thread(postId);
    const toggle = root.querySelector(`[data-action="community-replies-toggle"][data-id="${CSS.escape(postId)}"]`);
    if (toggle) { toggle.setAttribute("aria-expanded", String(thread.open)); toggle.textContent = thread.open ? "收起讨论" : "回复 / 讨论"; }
    const input = document.getElementById(`community-reply-${postId}`);
    if (restore && input && !input.disabled) { input.focus({ preventScroll: true }); input.setSelectionRange(...selection); }
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
                <button type="button" class="community-replies-toggle" data-action="community-replies-toggle" data-id="${esc(post.id)}" aria-expanded="${communityReplies.thread(post.id).open}" aria-controls="community-thread-${esc(post.id)}">${communityReplies.thread(post.id).open ? "收起讨论" : "回复 / 讨论"}</button>
                ${communityThreadHtml(post.id)}
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
            <input id="classmateSbId" aria-label="同学的 SB ID（区分大小写）" maxlength="8" placeholder="输入 SB ID（区分大小写）" value="${esc(classmateListDraft)}">
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
    const model = scheduleMonthModel();
    state.scheduleMonth = model.month;
    state.scheduleSelectedDate = model.selectedDate;
    const draft = state.scheduleManualDraft;
    state.scheduleClockSignature = scheduleClockSignature(model);
    return `
      ${pageHeader("SCHEDULE", "时间表", "一个月历，收好你的课程、作业与生活安排。")}
      <section class="schedule-layout">
        <div id="scheduleCalendarView" class="planner-view">${scheduleCalendarView.render(model, { agendaView: state.scheduleAgendaView, agendaTypes: state.scheduleAgendaTypes, countdown: dueText })}</div>
        <details class="card schedule-manual" id="scheduleManual" ${state.scheduleManualOpen || state.scheduleDraftOrigin === "quick" && state.scheduleDrafts.length ? "open" : ""}>
          <summary><span><b>＋ 新增安排</b><small>课程、作业截止、个人计划，都放在这里</small></span><span class="schedule-disclosure" aria-hidden="true">⌄</span></summary>
          ${scheduleQuickHtml(model)}
          ${state.scheduleDraftOrigin === "quick" ? scheduleReviewHtml() : ""}
          <details class="schedule-manual-fields" ${Object.entries(draft).some(([key, value]) => key !== "date" && value) ? "open" : ""}><summary>手动填写详细信息</summary>
          <div class="schedule-manual-form">
            <label class="schedule-field-wide">标题<input id="scheduleTitle" data-manual-field="title" maxlength="160" value="${esc(draft.title || "")}" placeholder="例如 复习 STA437 或 Essay 1 截止"></label>
            <label>类型<select id="scheduleKind" data-manual-field="kind">${[["EVENT", "个人安排"], ["DDL", "作业 / 截止"], ["LEC", "Lecture"], ["TUT", "Tutorial"]].map(([kind, label]) => `<option value="${kind}" ${(draft.kind || "EVENT") === kind ? "selected" : ""}>${label}</option>`).join("")}</select></label>
            <label>日期<input id="scheduleDate" data-manual-field="date" type="date" min="2000-01-01" max="2200-12-31" value="${esc(draft.date || model.selectedDate)}"></label>
            <label>开始 / 截止时间<input id="scheduleClock" data-manual-field="time" type="time" value="${esc(draft.time || "")}"></label>
            <label>结束时间（选填，当天）<input id="scheduleEndClock" data-manual-field="endTime" type="time" value="${esc(draft.endTime || "")}"></label>
            <label>课程（选填）<input id="scheduleCourse" data-manual-field="course" maxlength="80" value="${esc(draft.course || "")}" placeholder="例如 STA437"></label>
            <label>地点 / 链接（选填）<input id="scheduleLocation" data-manual-field="location" maxlength="160" value="${esc(draft.location || "")}" placeholder="教室、会议地点或提交入口"></label>
            <label class="schedule-field-wide">备注（选填）<textarea id="scheduleNotes" data-manual-field="notes" maxlength="600" placeholder="补充要求或备注">${esc(draft.notes || "")}</textarea></label>
            <div class="schedule-field-wide schedule-form-actions"><button class="primary" data-action="add-schedule" ${state.scheduleSaving ? "disabled" : ""}>${state.scheduleSaving ? "正在保存…" : "保存安排"}</button></div>
          </div>
          </details>
        </details>
        <details class="card planner-import" id="scheduleImportPanel" ${state.scheduleImportOpen || state.scheduleDraftOrigin === "file" && (state.scheduleImportBusy || state.scheduleDrafts.length) ? "open" : ""}>
          <summary><span>从课程文件导入</span><small>上传课表、syllabus 或课程资料，自动提取安排 ⌄</small></summary>
          <div class="schedule-upload">
          <div class="schedule-upload-intro">
            <span class="schedule-kicker">AI IMPORT</span>
            <h2>把课程文件变成时间表</h2>
            <p>上传 syllabus 提取 quiz、考试和作业时间；已有课程会自动去重。课表按每周重复，并根据学校校历跳过停课日期。</p>
            <div class="schedule-steps" aria-label="导入步骤"><span><b>1</b> 上传文件</span><span><b>2</b> 核对时间</span><span><b>3</b> 开始倒计时</span></div>
          </div>
          <div class="schedule-upload-controls">
            <label class="schedule-file-picker ${state.scheduleImportBusy || state.scheduleDrafts.length ? "is-disabled" : ""}">
              <input id="scheduleFile" aria-label="选择课程文件" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json" ${state.scheduleImportBusy || state.scheduleDrafts.length ? "disabled" : ""}>
              <span class="schedule-file-symbol" aria-hidden="true">↑</span>
              <span><strong id="scheduleFileName">${esc(state.scheduleUploadFile?.name || "选择课程文件")}</strong><small>课表截图、PDF、Word、PPT、Excel 或文字文件</small></span>
            </label>
            <div class="schedule-upload-bottom"><small>PDF ≤ 8 MB · 其他文件 ≤ 12 MB</small><button class="primary" data-action="extract-schedule" ${state.scheduleImportBusy || state.scheduleDrafts.length ? "disabled" : ""}>${state.scheduleImportBusy ? "处理中…" : "AI 提取时间"}</button></div>
          </div>
          ${state.scheduleImportStatus ? `<p class="schedule-import-status" role="status" aria-live="polite">${esc(state.scheduleImportStatus)}</p>` : ""}
          </div>
        ${state.scheduleDraftOrigin === "file" ? scheduleReviewHtml() : ""}
        </details>
        <p class="schedule-timezone">月历和新增安排使用当前时区：${esc(model.timeZone)} · 导入课程按学校时区换算<br>Lecture / Tutorial 按结束时间自动完成；未填写结束时间时，按课表记录的开始时间处理。</p>
      </section>
    `;
  }

  function scheduleMonthModel() {
    return scheduleCalendarView.buildModel({ items: state.scheduleItems || [], month: state.scheduleMonth, selectedDate: state.scheduleSelectedDate });
  }

  function scheduleQuickHtml(model) {
    const blocked = state.scheduleImportBusy || Boolean(state.scheduleDrafts.length);
    const voiceBusy = state.scheduleVoicePhase !== "idle" || state.scheduleVoicePending;
    return `<section class="schedule-quick" aria-label="白话或语音新增安排">
      <label for="scheduleQuickText">说说你的安排</label><p>可以一次描述多件事。未提日期时使用所选的 ${esc(model.selectedDate)}；“明天、下周”按今天计算。</p>
      <textarea id="scheduleQuickText" maxlength="6000" placeholder="比如：明天下午三点到四点在图书馆讨论作业；周五晚上八点交 STA437 作业。" ${blocked ? "disabled" : ""}>${esc(state.scheduleQuickText)}</textarea>
      <div class="schedule-quick-actions"><button class="${state.scheduleVoicePhase === "recording" ? "is-recording" : ""}" data-action="schedule-voice" ${state.scheduleVoicePhase === "stopping" || state.scheduleVoicePending || state.scheduleVoicePhase === "idle" && (blocked || !scheduleVoiceRecorder.supported) ? "disabled" : ""}>${state.scheduleVoicePhase === "recording" ? "结束录音" : state.scheduleVoicePhase === "requesting" ? "取消录音" : "语音输入"}</button>
        <label class="schedule-audio-picker ${blocked || voiceBusy ? "is-disabled" : ""}">导入语音<input id="scheduleAudioFile" type="file" aria-label="导入语音文件" accept=".mp3,.mp4,.m4a,.wav,.webm,.mpeg,.mpga" ${blocked || voiceBusy ? "disabled" : ""}></label>
        <button data-action="schedule-voice-retry" ${state.scheduleVoiceFile && !voiceBusy ? "" : "hidden"} ${blocked ? "disabled" : ""}>重试转写</button>
        <button class="primary" data-action="parse-schedule-text" ${blocked || voiceBusy ? "disabled" : ""}>${state.scheduleImportBusy && state.scheduleDraftOrigin === "quick" ? "正在整理…" : "AI 整理安排"}</button>
      </div>
      <p class="schedule-voice-hint">${scheduleVoiceRecorder.supported ? "结束录音后会转成文字，可修改后再整理。录音最多 2 分钟，语音文件最多 8 MB。" : "直接录音需要安全连接和浏览器支持；可导入语音文件，或点手机键盘的麦克风输入。"}</p>
      ${state.scheduleDrafts.length && state.scheduleDraftOrigin === "file" ? `<p>请先确认或取消课程文件的待加入项目，再整理新的安排。</p>` : ""}
      <p id="scheduleVoiceStatus" role="status" aria-live="polite" ${state.scheduleVoiceMessage ? "" : "hidden"}>${esc(state.scheduleVoiceMessage)}</p>
      ${state.scheduleQuickStatus ? `<p class="schedule-import-status" role="status">${esc(state.scheduleQuickStatus)}</p>` : ""}
    </section>`;
  }

  function updateScheduleVoiceUi() {
    const button = root.querySelector('[data-action="schedule-voice"]');
    if (!button) return;
    const busy = state.scheduleVoicePhase !== "idle" || state.scheduleVoicePending;
    const blocked = state.scheduleImportBusy || Boolean(state.scheduleDrafts.length);
    button.textContent = state.scheduleVoicePhase === "recording" ? "结束录音" : state.scheduleVoicePhase === "requesting" ? "取消录音" : "语音输入";
    button.disabled = state.scheduleVoicePending || state.scheduleVoicePhase === "stopping" || state.scheduleVoicePhase === "idle" && (blocked || !scheduleVoiceRecorder.supported);
    button.classList.toggle("is-recording", state.scheduleVoicePhase === "recording");
    const status = $("scheduleVoiceStatus");
    status.textContent = state.scheduleVoiceMessage; status.hidden = !state.scheduleVoiceMessage;
    root.querySelector('[data-action="parse-schedule-text"]').disabled = blocked || busy;
    $("scheduleAudioFile").disabled = blocked || busy;
    $("scheduleAudioFile").closest("label").classList.toggle("is-disabled", blocked || busy);
    const retry = root.querySelector('[data-action="schedule-voice-retry"]');
    retry.hidden = !state.scheduleVoiceFile || busy; retry.disabled = blocked;
  }

  function cancelScheduleVoice() {
    if (scheduleVoiceRequest) state.scheduleVoiceMessage = "已取消语音转写，原有文字已保留。";
    scheduleVoiceRequest?.abort(); scheduleVoiceRequest = null;
    state.scheduleVoicePending = false;
    if (scheduleVoiceRecorder.phase !== "idle") scheduleVoiceRecorder.cancel();
    updateScheduleVoiceUi();
  }

  async function transcribeScheduleVoice(file) {
    if (!file || state.scheduleImportBusy || state.scheduleDrafts.length || state.scheduleVoicePending) return;
    const userId = state.user?.id;
    if (!userId) return;
    const controller = new AbortController();
    scheduleVoiceRequest = controller;
    state.scheduleVoiceFile = file; state.scheduleVoicePending = true;
    state.scheduleVoiceMessage = "正在把语音转成文字…"; updateScheduleVoiceUi();
    try {
      const [payload] = await readFiles([file], 8 * 1024 * 1024);
      if (controller.signal.aborted) return;
      const result = await api("/api/schedule/transcribe", { method: "POST", signal: controller.signal, body: payload });
      if (controller.signal.aborted || state.user?.id !== userId) return;
      const text = [state.scheduleQuickText.trim(), result.text].filter(Boolean).join("\n");
      if (text.length > 6000) throw new Error("合并后的文字超过 6000 字，请先缩短输入内容，再重试转写。");
      state.scheduleQuickText = text;
      if ($("scheduleQuickText")) $("scheduleQuickText").value = text;
      state.scheduleVoiceFile = null;
      state.scheduleVoiceMessage = "已转成文字，可修改后点击“AI 整理安排”。";
    } catch (error) { if (!controller.signal.aborted && state.user?.id === userId) state.scheduleVoiceMessage = error.message || "语音转写失败，可以重试。"; }
    finally {
      if (scheduleVoiceRequest === controller) { scheduleVoiceRequest = null; state.scheduleVoicePending = false; updateScheduleVoiceUi(); }
    }
  }

  function setScheduleImportStatus(message) {
    if (state.scheduleDraftOrigin === "quick") state.scheduleQuickStatus = message;
    else state.scheduleImportStatus = message;
  }

  async function parseScheduleQuick() {
    if (state.scheduleImportBusy || state.scheduleVoicePending || state.scheduleVoicePhase !== "idle" || state.scheduleDrafts.length) return;
    const text = state.scheduleQuickText.trim();
    if (!text) throw new Error("先写下或说出你的安排，例如“明天下午三点去图书馆”。");
    const userId = state.user.id;
    state.scheduleDraftOrigin = "quick"; state.scheduleImportBusy = true;
    state.scheduleQuickStatus = "正在整理日期、时间和安排内容…"; render();
    try {
      const result = await api("/api/schedule/parse-text", { method: "POST", body: { text, selectedDate: state.scheduleSelectedDate, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      if (state.user?.id !== userId) return;
      state.scheduleDrafts = result.items; state.scheduleSource = "白话 / 语音输入";
      state.scheduleCalendar = null; state.scheduleFromDate = "";
      state.scheduleQuickStatus = result.items.length ? `整理出 ${result.items.length} 条安排，请核对后确认加入。${result.duplicateCount ? `已跳过 ${result.duplicateCount} 条重复安排。` : ""}${result.clarification || ""}` : result.clarification || (result.duplicateCount ? "这些安排已存在，已跳过重复项目。" : "还没有找到明确安排，请补充日期、时间或事情内容。");
    } catch (error) { state.scheduleQuickStatus = error.message; }
    finally { state.scheduleImportBusy = false; if (state.page === "schedule") render(); }
  }

  function scheduleClockSignature(model) {
    return JSON.stringify([model.today, model.next?.docId, model.upcoming.length, model.completed.length, model.overdue.length, model.ongoing.map((item) => item.docId)]);
  }

  function scheduleReviewHtml() {
    if (!state.scheduleDrafts.length) return "";
    return `<article class="card schedule-review"><h2>核对提取结果（${state.scheduleDrafts.length} 条）</h2>
      <p>${esc(state.scheduleSource)} · 尚未加入时间表。勾选要加入的项目，点开卡片可编辑并查看完整备注与原文。${state.scheduleDraftOrigin === "file" && state.scheduleImportedCourses.length ? "已识别的课程已自动加入「对话与课程」，取消预览不会删除课程。" : ""}${state.scheduleDrafts.some((item) => item.weekly) ? "每周课程确认一次即可生成本学期剩余安排。" : ""}</p>
      ${state.scheduleDrafts.some((item) => item.weekly) ? scheduleCalendarHtml() : ""}
      <fieldset ${state.scheduleImportBusy ? "disabled" : ""}>
      ${state.scheduleDrafts.map((item, index) => scheduleDraftHtml(item, index)).join("")}
      <div class="schedule-review-actions">${scheduleSaveProgressHtml()}<span data-review-selected-count aria-live="polite">已选 ${state.scheduleDrafts.filter((item) => item.selected).length} 项</span><button class="primary" data-action="confirm-schedule">${state.scheduleImportProgress ? "正在加入…" : "确认加入"}</button><button data-action="cancel-schedule">取消</button></div>
      </fieldset></article>`;
  }

  function scheduleDraftSummary(item) {
    const valid = item.weekly ? scheduleImport.validWeekly(item.weekly) : scheduleImport.validTime(item.startsAt);
    return {
      title: item.title.trim() || "未命名项目", kind: item.kind === "EVENT" ? "个人安排" : item.kind,
      time: item.weekly ? `每周${item.weekly.weekdays.map((weekday) => ["日", "一", "二", "三", "四", "五", "六"][weekday]).join("、") || "（待补星期）"} ${item.weekly.startTime || "时间待补充"}${item.weekly.endTime ? `–${item.weekly.endTime}` : ""}` : valid ? `${item.startsAt.replace("T", " ")}${item.endsAt ? ` → ${item.endsAt.replace("T", " ")}` : ""}` : "日期 / 时间待补充",
      context: [item.course, item.location].filter(Boolean).join(" · "), notes: item.notes.trim(),
      warning: item.warning || (!item.title.trim() || !valid ? "请补全标题或时间后再加入。" : ""), needsInput: !item.title.trim() || !valid || Boolean(item.endsAt && (!scheduleImport.validTime(item.endsAt) || item.endsAt <= item.startsAt))
    };
  }

  function scheduleDraftHtml(item, index) {
    const summary = scheduleDraftSummary(item);
    const open = scheduleDraftDisclosure.has(item) ? scheduleDraftDisclosure.get(item) : summary.needsInput;
    return `<section class="schedule-draft" data-draft="${index}">
      <label class="schedule-review-select"><input type="checkbox" data-draft-field="selected" aria-label="加入时间表：${esc(summary.title)}" ${item.selected ? "checked" : ""}></label>
      <details class="schedule-draft-editor" data-review-editor="${index}" ${open ? "open" : ""}>
        <summary class="schedule-draft-summary"><b data-review-title>${esc(summary.title)}</b><span class="schedule-review-chevron" aria-hidden="true">⌄</span>
          <span class="schedule-review-meta"><span data-review-kind>${esc(summary.kind)}</span><span data-review-time>${esc(summary.time)}</span></span>
          <span class="schedule-review-context" data-review-context ${summary.context ? "" : "hidden"}>${esc(summary.context)}</span>
          <span class="schedule-review-note" data-review-note ${summary.notes ? "" : "hidden"}>${summary.notes ? `备注：${esc(summary.notes)}` : ""}</span>
          <span class="schedule-review-warning" data-review-warning ${summary.warning ? "" : "hidden"}>需核对：${esc(summary.warning)}</span>
        </summary>
        <div class="schedule-draft-fields">
        <div class="inline-fields"><label>类型<select data-draft-field="kind">${(item.weekly ? ["LEC", "TUT"] : ["EVENT", "DDL", "LEC", "TUT"]).map((kind) => `<option value="${kind}" ${item.kind === kind ? "selected" : ""}>${kind === "EVENT" ? "个人安排" : kind}</option>`).join("")}</select></label>
        ${item.weekly ? `<label>每周上课时间<input type="time" data-weekly-field="startTime" value="${esc(item.weekly.startTime)}"></label><label>结束时间<input type="time" data-weekly-field="endTime" value="${esc(item.weekly.endTime)}"></label>` : `<label>日期与时间<input type="datetime-local" data-draft-field="startsAt" value="${esc(item.startsAt)}"></label><label>结束日期与时间（选填）<input type="datetime-local" data-draft-field="endsAt" value="${esc(item.endsAt || "")}"></label>`}</div>
        ${item.weekly ? `<div class="schedule-weekdays" aria-label="每周上课日">${["日", "一", "二", "三", "四", "五", "六"].map((day, weekday) => `<label><input type="checkbox" data-weekday="${weekday}" ${item.weekly.weekdays.includes(weekday) ? "checked" : ""}>周${day}</label>`).join("")}</div><p class="muted">每周重复；只在授课日安排，跳过官网停课日期。</p>` : ""}
        <label>标题<input data-draft-field="title" value="${esc(item.title)}" maxlength="160"></label>
        <div class="inline-fields"><label>课程<input data-draft-field="course" value="${esc(item.course)}"></label><label>地点 / 链接<input data-draft-field="location" value="${esc(item.location)}"></label></div>
        <label>备注<textarea data-draft-field="notes">${esc(item.notes)}</textarea></label>
        ${item.evidence ? `<p class="muted">原文：${esc(item.evidence)}</p>` : ""}
        ${item.warning ? `<p class="schedule-warning">需核对：${esc(item.warning)}</p>` : ""}
        </div>
      </details>
    </section>`;
  }

  function refreshScheduleDraftSummary(section, item) {
    if (!section || !item) return;
    const summary = scheduleDraftSummary(item);
    for (const key of ["title", "kind", "time", "context", "note", "warning"]) {
      const element = section.querySelector(`[data-review-${key}]`);
      if (!element) continue;
      const value = key === "note" ? summary.notes : summary[key];
      element.textContent = `${key === "note" && value ? "备注：" : key === "warning" && value ? "需核对：" : ""}${value || ""}`;
      element.hidden = !value;
    }
    section.querySelector('[data-draft-field="selected"]').setAttribute("aria-label", `加入时间表：${summary.title}`);
  }

  function scheduleCalendarHtml() {
    const calendar = state.scheduleCalendar;
    const draft = state.scheduleCalendarDraft;
    let count = null;
    try { if (calendar) count = scheduleImport.deduplicate(scheduleImport.expandWeekly(state.scheduleDrafts.filter((item) => item.selected), calendar, { fromDate: state.scheduleFromDate }), state.scheduleItems).items.length; } catch {}
    return `<section class="schedule-calendar" aria-label="学期与停课规则"><h3>本学期循环规则</h3><p>${esc(state.scheduleCalendarNotice)}</p>
      ${calendar ? `<p><strong>${esc([calendar.school, calendar.campus, calendar.label].filter(Boolean).join(" · "))}</strong></p><p>授课范围：${calendar.teachingPeriods.map((period) => `${esc(period.startDate)} — ${esc(period.endDate)}`).join("；")}<br>从 ${esc(state.scheduleFromDate)} 起生成；时区 ${esc(calendar.timeZone)} · <span data-schedule-preview-count>${count !== null ? `新增 ${count} 次安排（自动跳过重复）` : "请补全课程规则"}</span></p>
      <p>停课：${calendar.breaks.length ? calendar.breaks.map((pause) => `${esc(pause.startDate)}${pause.endDate !== pause.startDate ? ` — ${esc(pause.endDate)}` : ""} ${esc(pause.label)}`).join("；") : "本次校历未列出范围内的停课日"}</p>
      ${(calendar.sources || []).map((source) => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`).join(" · ")}` : `<p class="schedule-warning">只需填写一次学期范围，所有已识别的每周课程都会使用它。</p>`}
      <details ${!calendar || state.scheduleCalendarEditing ? "open" : ""}><summary>手动确认或调整本学期</summary><div class="inline-fields"><label>授课开始<input type="date" data-calendar-field="startDate" value="${esc(draft.startDate)}"></label><label>最后授课日<input type="date" data-calendar-field="endDate" value="${esc(draft.endDate)}"></label></div><label>停课日期（每行一个日期或起止范围）<textarea data-calendar-field="breaks" placeholder="2026-10-12&#10;2026-10-26 / 2026-10-30">${esc(draft.breaks)}</textarea></label><label>学校时区<input data-calendar-field="timeZone" value="${esc(draft.timeZone)}" placeholder="America/Toronto"></label></details>
    </section>`;
  }

  function applyScheduleCalendarDraft() {
    const draft = state.scheduleCalendarDraft;
    try {
      const breaks = draft.breaks.split(/\n/).filter((line) => line.trim()).map((line) => {
        const dates = line.match(/\d{4}-\d{2}-\d{2}/g) || [];
        if (dates.length < 1 || dates.length > 2) throw new Error("每行填写一个停课日期，或一个起止日期范围。");
        return { startDate: dates[0], endDate: dates[1] || dates[0], label: "手动确认停课" };
      });
      state.scheduleCalendar = scheduleImport.normalizeCalendar({ label: "手动确认的学期", timeZone: draft.timeZone, teachingPeriods: [{ startDate: draft.startDate, endDate: draft.endDate }], breaks, sources: [], replacements: [] });
      state.scheduleCalendarNotice = "学期范围已手动确认；按这些日期生成每周安排。";
    } catch (error) { state.scheduleCalendar = null; state.scheduleCalendarNotice = error.message; }
    state.scheduleCalendarEditing = true;
    render();
  }

  function updateSchedulePreviewCount() {
    root.querySelectorAll(".schedule-draft[data-draft]").forEach((section) => {
      const draft = state.scheduleDrafts[Number(section.dataset.draft)];
      if (draft?.weekly && scheduleImport.validWeekly(draft.weekly) && draft.warning === "星期或上课时间未识别完整，请仅补充缺失信息。") {
        draft.warning = "";
        section.querySelector(".schedule-warning")?.remove();
      }
      if (draft && !draft.weekly && scheduleImport.validTime(draft.startsAt) && draft.warning === "日期或时间不完整，请补全后确认。") { draft.warning = ""; section.querySelector(".schedule-warning")?.remove(); }
      if (draft && draft.warning === "结束时间无效或早于开始时间，请核对。" && (!draft.endsAt || scheduleImport.validTime(draft.endsAt) && draft.endsAt > draft.startsAt)) { draft.warning = ""; section.querySelector(".schedule-warning")?.remove(); }
      refreshScheduleDraftSummary(section, draft);
    });
    root.querySelectorAll("[data-review-selected-count]").forEach((element) => { element.textContent = `已选 ${state.scheduleDrafts.filter((item) => item.selected).length} 项`; });
    const preview = root.querySelector("[data-schedule-preview-count]");
    if (!preview || !state.scheduleCalendar) return;
    try { preview.textContent = `新增 ${scheduleImport.deduplicate(scheduleImport.expandWeekly(state.scheduleDrafts.filter((item) => item.selected), state.scheduleCalendar, { fromDate: state.scheduleFromDate }), state.scheduleItems).items.length} 次安排（自动跳过重复）`; }
    catch { preview.textContent = "请补全课程规则"; }
  }

  async function extractScheduleFile() {
    if (state.scheduleImportBusy || state.scheduleDrafts.length) return;
    cancelScheduleVoice();
    const file = $("scheduleFile")?.files?.[0] || state.scheduleUploadFile;
    if (!file) throw new Error("请先选择一个文件。");
    validateUploadFile(file);
    if (/\.pdf$/i.test(file.name) && file.size > 8 * 1024 * 1024) throw new Error("PDF 最大支持 8 MB。");
    state.scheduleDraftOrigin = "file";
    state.scheduleImportBusy = true;
    state.scheduleImportStatus = "正在读取课表版面与时间；识别到每周课程后将自动核对学校官网校历…";
    render();
    try {
      const [payload] = await readFiles([file]);
      const result = await api("/api/schedule/extract", { method: "POST", body: { ...payload, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      for (const course of result.courses || []) if (!state.courses.some((item) => item.id === course.id)) state.courses.push(course);
      state.scheduleImportedCourses = result.courses || [];
      state.scheduleDrafts = result.items;
      state.scheduleSource = result.fileName;
      state.scheduleCalendar = result.calendar || null;
      state.scheduleCalendarNotice = result.calendarNotice || "";
      state.scheduleFromDate = result.importFromDate || scheduleImport.todayInZone(result.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      state.scheduleCalendarEditing = false;
      state.scheduleCalendarDraft = { startDate: result.calendar?.teachingPeriods[0]?.startDate || "", endDate: result.calendar?.teachingPeriods.at(-1)?.endDate || "", breaks: (result.calendar ? scheduleImport.nonTeachingRanges(result.calendar) : []).map((pause) => `${pause.startDate} / ${pause.endDate}`).join("\n"), timeZone: result.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone };
      state.scheduleImportStatus = result.items.length ? `提取到 ${result.items.length} 条待核对安排${result.duplicateCount ? `，发现 ${result.duplicateCount} 项重复，自动跳过已有安排` : ""}。请在下方核对并确认。` : result.duplicateCount ? `识别的安排已存在，已跳过 ${result.duplicateCount} 项重复，无需再次添加。` : "未找到可提取的时间点。请尝试更清晰的文件或分批上传，也可以手动添加。";
      if (result.courses?.length) state.scheduleImportStatus += ` ${result.createdCourses?.length ? `已自动添加 ${result.createdCourses.length} 门课程；` : ""}已识别课程可直接在「对话与课程」中打开。`;
    } catch (error) { state.scheduleImportStatus = error.message; }
    finally { state.scheduleImportBusy = false; render(); }
  }

  function scheduleSaveProgressHtml() {
    const progress = state.scheduleImportProgress;
    if (!progress) return "";
    return `<div class="schedule-save-progress" data-save-progress role="status" aria-live="polite"><span data-save-progress-text>${esc(progress.message)}</span><progress aria-label="加入日历进度" max="${progress.total || 1}" value="${progress.processed}"></progress></div>`;
  }

  function updateScheduleSaveProgress(progress) {
    state.scheduleImportProgress = { ...state.scheduleImportProgress, ...progress };
    const value = state.scheduleImportProgress;
    root.querySelectorAll("[data-save-progress-text]").forEach((element) => { element.textContent = value.message; });
    root.querySelectorAll("[data-save-progress] progress").forEach((element) => { element.max = value.total || 1; element.value = value.processed; });
  }

  async function confirmScheduleImport() {
    if (state.scheduleImportBusy) return;
    const userId = state.user.id;
    state.scheduleImportBusy = true;
    state.scheduleImportProgress = { processed: 0, total: 0, message: "正在整理课程日期，准备批量保存…" };
    render();
    let saved = 0, duplicates = 0;
    try {
      // Paint the busy state before expanding a full semester on a phone.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const selectedDrafts = state.scheduleDrafts.filter((item) => item.selected);
      const selected = scheduleImport.expandWeekly(selectedDrafts, state.scheduleCalendar, { fromDate: state.scheduleFromDate });
      if (!selected.length) throw new Error(selectedDrafts.length ? "本学期已无可生成的未来上课日期，请核对学期范围。" : "请至少勾选一个项目。");
      if (selected.some((item) => !item.title.trim() || !scheduleImport.validTime(item.startsAt))) throw new Error("请为所选项目补全有效的标题、日期和时间。");
      if (selected.some((item) => item.endsAt && (!scheduleImport.validTime(item.endsAt) || item.endsAt <= item.startsAt))) throw new Error("结束时间应晚于开始时间。");
      updateScheduleSaveProgress({ total: selected.length, message: `正在检查重复并批量保存：0 / ${selected.length} 条…` });
      for (let offset = 0; offset < selected.length; offset += 80) {
        if (state.user?.id !== userId) throw new Error("登录账号已变化，请重新确认安排。");
        const result = await api("/api/schedule/import", { method: "POST", body: {
          items: selected.slice(offset, offset + 80), source: state.scheduleSource, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        } });
        if (state.user?.id !== userId) return;
        saved += result.saved;
        duplicates += result.duplicates;
        for (const course of result.courses || (result.course ? [result.course] : [])) if (!state.courses.some((item) => item.id === course.id)) state.courses.push(course);
        const known = new Set(state.scheduleItems.map((item) => item.docId));
        state.scheduleItems.push(...result.items.filter((item) => !known.has(item.docId)));
        const processed = Math.min(offset + 80, selected.length);
        updateScheduleSaveProgress({ processed, message: `已处理 ${processed} / ${selected.length} 条 · 已保存 ${saved} 条 · 跳过重复 ${duplicates} 条` });
        if (processed < selected.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      state.scheduleDrafts = [];
      state.scheduleUploadFile = null;
      setScheduleImportStatus(`已添加 ${saved} 条安排${duplicates ? `，跳过 ${duplicates} 条重复项目` : ""}。`);
    } catch (error) {
      if (state.user?.id === userId) setScheduleImportStatus(`本次已确认保存 ${saved} 条，跳过重复 ${duplicates} 条。预览已保留；重试会重新检查并跳过已保存项目。${error.message}`);
    }
    finally {
      if (state.user?.id === userId) {
        updateScheduleSaveProgress({ message: "正在同步日历，已保存的安排不会丢失…" });
        await loadScheduleItems().catch(() => { setScheduleImportStatus(`${state.scheduleDraftOrigin === "quick" ? state.scheduleQuickStatus : state.scheduleImportStatus} 日历同步暂未完成，请刷新；重试添加会自动跳过重复项目。`); });
        state.scheduleImportBusy = false;
        state.scheduleImportProgress = null;
        if (state.page === "schedule") render();
      }
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
    const now = Date.now();
    return (state.scheduleItems || [])
      .filter((item) => !scheduleImport.completion(item, now).completedAt && item.startsAt && new Date(item.startsAt).getTime() >= now)
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
      endsAt: data.endsAt || "",
      timeZone: data.timeZone || "",
      recurrence: data.recurrence,
      location: data.location || "",
      notes: data.notes || "",
      completedAt: data.completedAt || ""
    };
  }

  async function refreshCourseConversations(courseId) {
    const userId = state.user.id;
    const data = await api(`/api/courses/${courseId}/conversations`);
    if (state.user?.id === userId) state.courseConversations[courseId] = data.conversations || [];
    return data.conversations || [];
  }

  async function selectConversation(courseId, conversationId) {
    studyDrafts.set(studyReplyKey(), { text: $("chatInput")?.value ?? studyDrafts.get(studyReplyKey())?.text ?? "", files: [...state.uploadFiles] });
    state.activeCourseId = courseId;
    state.activeConversationId = conversationId || "default";
    state.conversationCourseId = courseId;
    state.messages = []; state.docs = [];
    state.uploadFiles = studyDrafts.get(studyReplyKey())?.files || [];
    state.renamingConversation = null;
    if (courseId !== chatSpaces.general.id) state.expandedCourses[courseId] = true;
    try {
      localStorage.setItem(`studybridge.chatSpace.${state.user.id}`, courseId);
      localStorage.setItem(`studybridge.conversation.${state.user.id}.${courseId}`, state.activeConversationId);
    } catch { /* Storage may be disabled. */ }
    await loadPage("study");
  }

  async function loadStudy() {
    const coursesData = await api("/api/courses");
    state.courses = coursesData.courses || [];
    if (!state.activeCourseId) {
      try { state.activeCourseId = localStorage.getItem(`studybridge.chatSpace.${state.user.id}`) || ""; } catch { /* Storage may be disabled. */ }
    }
    const chatCourses = courseChats.visibleCourses(state.courses);
    if (!isGeneralChat() && !chatCourses.some((c) => c.id === state.activeCourseId)) {
      state.activeCourseId = chatCourses[0]?.id || chatSpaces.general.id;
    }
    if (state.conversationCourseId !== state.activeCourseId) {
      state.activeConversationId = "default";
      try { state.activeConversationId = localStorage.getItem(`studybridge.conversation.${state.user.id}.${state.activeCourseId}`) || "default"; } catch { /* Storage may be disabled. */ }
      state.conversationCourseId = state.activeCourseId;
    }
    if (isGeneralChat()) state.activeConversationId = "default";
    else {
      const courseId = state.activeCourseId;
      const chats = await refreshCourseConversations(courseId);
      if (state.activeCourseId !== courseId) return;
      if (!chats.some((chat) => chat.id === state.activeConversationId)) state.activeConversationId = "default";
      if (state.expandedCourses[courseId] === undefined) state.expandedCourses[courseId] = true;
    }
    loadStudyMode();
    if (state.activeCourseId) {
      const courseId = state.activeCourseId;
      const conversationId = state.activeConversationId;
      const replyAtLoad = activeStudyReply();
      const [docsData, messagesData] = await Promise.all([
        isGeneralChat() ? Promise.resolve({ documents: [] }) : api(`/api/courses/${courseId}/documents`),
        api(`/api/courses/${courseId}/messages?conversationId=${encodeURIComponent(conversationId)}`)
      ]);
      if (courseId !== state.activeCourseId || conversationId !== state.activeConversationId) return;
      state.docs = docsData.documents || [];
      state.messages = mergeStudyReply(messagesData.messages || [], activeStudyReply() || replyAtLoad);
    } else {
      state.docs = [];
      state.messages = [];
    }
    await loadScheduleItems(false);
  }

  async function loadScheduleItems(refreshCourses = true, strict = false) {
    const userId = state.user?.id;
    const data = await api("/api/schedule/items");
    if (state.user?.id !== userId) return;
    if (refreshCourses) state.courses = data.courses || [];
    state.scheduleItems = data.items || [];
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

  async function readFiles(files, maxBytes = MAX_UPLOAD_BYTES) {
    const list = Array.from(files || []);
    list.forEach((file) => validateUploadFile(file, maxBytes));
    return Promise.all(list.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ fileName: file.name, fileType: file.type, fileSize: file.size, fileData: reader.result });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
  }

  function validateUploadFile(file, maxBytes = MAX_UPLOAD_BYTES) {
    if (!file) throw new Error("没有读取到文件。");
    if (file.size > maxBytes) {
      throw new Error(`文件太大：${file.name}。单文件最大支持 ${maxBytes / 1024 / 1024} MB。`);
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
    incoming.forEach((file) => validateUploadFile(file));
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
    if (courseUploadPending) throw new Error("课程资料正在上传，请等待当前上传完成。");
    if (isGeneralChat()) throw new Error("请在对话输入区上传附件，或选择课程后上传课程资料。");
    if (!state.activeCourseId) throw new Error("请先选择或新增课程。");
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) throw new Error("请先选择要上传的文件。");
    selectedFiles.forEach((file) => validateUploadFile(file, MAX_COURSE_UPLOAD_BYTES));
    const courseId = state.activeCourseId;
    let uploaded = 0;
    courseUploadPending = true;
    root.querySelectorAll('[data-action="upload-doc"], [data-action="save-doc"]').forEach((button) => { button.disabled = true; });
    try {
      for (const selected of selectedFiles) {
        try {
          const status = $("courseUploadStatus");
          if (status && state.activeCourseId === courseId) status.textContent = `正在上传 ${uploaded + 1}/${selectedFiles.length}：${selected.name}`;
          const [file] = await readFiles([selected], MAX_COURSE_UPLOAD_BYTES);
          await api(`/api/courses/${courseId}/documents`, { method: "POST", body: { title: file.fileName, ...file } });
          uploaded += 1;
        } catch (error) {
          if (state.activeCourseId === courseId) await loadPage("study").catch(() => {});
          throw new Error(`已成功上传 ${uploaded}/${selectedFiles.length} 个文件；${selected.name} 上传失败：${error.message}。已成功上传的资料已保留。`);
        }
      }
      setToast(`已上传 ${uploaded} 个文件。`);
      if (state.activeCourseId === courseId) await loadPage("study");
    } finally {
      courseUploadPending = false;
      root.querySelectorAll('[data-action="upload-doc"], [data-action="save-doc"]').forEach((button) => { button.disabled = false; });
    }
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
        cancelScheduleVoice();
        clearTimeout(learningStyleTimer);
        if ($("englishTerms")) void captureLearningStyle().saver.flush().catch(() => {});
        appearanceController.open();
        return;
      }
      if (action === "logout") {
        cancelScheduleVoice(); state.scheduleVoiceFile = null;
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
        await selectConversation(data.course.id, "default");
        return;
      }
      if (action === "select-course") {
        let conversationId = "default";
        try { conversationId = localStorage.getItem(`studybridge.conversation.${state.user.id}.${button.dataset.id}`) || "default"; } catch { /* Storage may be disabled. */ }
        await selectConversation(button.dataset.id, conversationId);
        return;
      }
      if (action === "toggle-course") {
        const courseId = button.dataset.id;
        if (!state.expandedCourses[courseId]) await refreshCourseConversations(courseId);
        state.expandedCourses[courseId] = !state.expandedCourses[courseId];
        render(); return;
      }
      if (action === "new-conversation") {
        if (button.disabled) return;
        button.disabled = true;
        try {
          const data = await api(`/api/courses/${button.dataset.id}/conversations`, { method: "POST", body: { title: "新对话" } });
          await selectConversation(button.dataset.id, data.conversation.id);
          $("chatInput")?.focus();
        } finally { button.disabled = false; }
        return;
      }
      if (action === "select-conversation") {
        await selectConversation(button.dataset.id, button.dataset.conversation); return;
      }
      if (action === "rename-conversation") {
        state.renamingConversation = { courseId: button.dataset.id, id: button.dataset.conversation };
        render(); $("conversationRename")?.focus(); $("conversationRename")?.select(); return;
      }
      if (action === "cancel-conversation-name") { state.renamingConversation = null; render(); return; }
      if (action === "save-conversation-name") {
        const title = courseChats.title($("conversationRename")?.value);
        await api(`/api/courses/${button.dataset.id}/conversations/${button.dataset.conversation}`, { method: "PATCH", body: { title } });
        await refreshCourseConversations(button.dataset.id);
        state.renamingConversation = null; render();
        return;
      }
      if (action === "delete-course") {
        if (!confirm("确定删除这门课程吗？")) return;
        for (const reply of studyReplies.values()) if (reply.userId === state.user.id && reply.courseId === button.dataset.id) reply.controller.abort();
        await api(`/api/courses/${button.dataset.id}`, { method: "DELETE" });
        if (state.activeCourseId === button.dataset.id) state.activeCourseId = "";
        delete state.courseConversations[button.dataset.id]; delete state.expandedCourses[button.dataset.id];
        for (const key of studyDrafts.keys()) if (JSON.parse(key)[1] === button.dataset.id) studyDrafts.delete(key);
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
        if (button.disabled) return;
        button.disabled = true;
        const label = button.textContent;
        button.textContent = "正在处理照片并保存…";
        const message = $("profileSaveStatus");
        if (message) message.textContent = "正在处理照片并保存…";
        const userId = state.user.id;
        const values = { name: $("profileName")?.value || "", school: $("profileSchool")?.value || "", major: $("profileMajor")?.value || "", sbId: $("profileSbId")?.value || "" };
        const avatarInput = $("profileAvatarFile"), coverInput = $("profileCoverFile");
        const avatar = $("profileAvatar")?.value || "", cover = $("profileCover")?.value || "";
        let data;
        try {
          values.avatarUrl = await readProfileImageFile(avatarInput, avatar);
          values.backgroundUrl = await readProfileImageFile(coverInput, cover, "cover");
          if (state.user?.id !== userId) return;
          data = await api("/api/me/profile", { method: "PUT", body: values });
        } catch (error) {
          if (message) message.textContent = error.message || "保存失败，请重试。";
          return;
        } finally {
          button.disabled = false;
          button.textContent = label;
        }
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
      if (action === "community-replies-toggle") {
        const thread = communityReplies.thread(button.dataset.id);
        thread.open = !thread.open;
        updateCommunityThread(button.dataset.id);
        if (thread.open && !thread.loaded) await communityReplies.load(button.dataset.id);
        return;
      }
      if (action === "community-replies-refresh" || action === "community-replies-older") {
        await communityReplies.load(button.dataset.id, action === "community-replies-older");
        return;
      }
      if (action === "community-reply-send") {
        await communityReplies.send(button.dataset.id);
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
        const data = await api(`/api/courses/${course}/chat`, { method: "POST", body: { conversationId: state.activeConversationId, message: prompt, mode: "email" } });
        emailDraft.output = formatText((data.messages || []).at(-1)?.content || "");
        if ($("emailOriginal")) $("toolOutput").innerHTML = emailDraft.output;
        return;
      }
      if (action === "schedule-month" || action === "schedule-today" || action === "schedule-day" || action === "schedule-agenda" || action === "schedule-type") {
        const model = scheduleMonthModel();
        if (action === "schedule-month") {
          state.scheduleMonth = scheduleCalendarView.shiftMonth(model.month, Number(button.dataset.offset));
          state.scheduleSelectedDate = state.scheduleMonth === model.today.slice(0, 7) ? model.today : `${state.scheduleMonth}-01`;
        }
        if (action === "schedule-today") { state.scheduleSelectedDate = model.today; state.scheduleMonth = model.today.slice(0, 7); }
        if (action === "schedule-day" && scheduleImport.validDate(button.dataset.date)) { state.scheduleSelectedDate = button.dataset.date; state.scheduleMonth = button.dataset.date.slice(0, 7); }
        if (action === "schedule-agenda" && ["upcoming", "all", "completed"].includes(button.dataset.view)) state.scheduleAgendaView = button.dataset.view;
        if (action === "schedule-type") state.scheduleAgendaTypes = scheduleCalendarView.toggleType(state.scheduleAgendaTypes, button.dataset.type);
        render();
        if (action === "schedule-type") root.querySelector(`.planner-type-filters [data-type="${button.dataset.type}"]`)?.focus({ preventScroll: true });
        if (action === "schedule-day") {
          root.querySelector('.planner-day[aria-pressed="true"]')?.focus({ preventScroll: true });
          root.querySelector(".planner-day-detail")?.scrollIntoView({ block: "nearest" });
        }
        if (action === "schedule-agenda") root.querySelector(`.planner-tabs [data-view="${state.scheduleAgendaView}"]`)?.focus({ preventScroll: true });
        if (action === "schedule-month") root.querySelector(`.planner-month-nav [data-offset="${button.dataset.offset}"]`)?.focus({ preventScroll: true });
        if (action === "schedule-today") root.querySelector('[data-action="schedule-today"]')?.focus({ preventScroll: true });
        return;
      }
      if (action === "schedule-new") {
        if (!scheduleImport.validDate(button.dataset.date)) return;
        state.scheduleManualDraft.date = button.dataset.date;
        state.scheduleManualOpen = true;
        render();
        $("scheduleManual")?.scrollIntoView({ block: "center" });
        $("scheduleQuickText")?.focus({ preventScroll: true });
        return;
      }
      if (action === "add-schedule") {
        if (button.disabled || state.scheduleSaving) return;
        const day = $("scheduleDate")?.value || "";
        const startsAt = `${day}T${$("scheduleClock")?.value || ""}`;
        const endClock = $("scheduleEndClock")?.value || "";
        const title = $("scheduleTitle")?.value.trim() || "";
        if (!title || !scheduleImport.validTime(startsAt)) throw new Error("请填写标题和有效日期、时间。");
        if (endClock && (!scheduleImport.validClock(endClock) || endClock <= startsAt.slice(11))) throw new Error("结束时间应晚于开始时间；跨天安排请分天添加。");
        cancelScheduleVoice();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const payload = { title, kind: scheduleImport.kind($("scheduleKind")?.value) || "EVENT", course: $("scheduleCourse")?.value || "", startsAt: scheduleImport.toUtc(startsAt, timeZone),
          endsAt: endClock ? scheduleImport.toUtc(`${day}T${endClock}`, timeZone) : "", timeZone, location: $("scheduleLocation")?.value || "", notes: $("scheduleNotes")?.value || "", completedAt: "" };
        button.disabled = true;
        state.scheduleSaving = true;
        try {
        const course = await ensureScheduleCourse();
        await api(`/api/courses/${course.id}/documents`, { method: "POST", body: { title: `${SCHEDULE_PREFIX} ${payload.title}`, type: "Schedule", text: JSON.stringify(payload) } });
        state.scheduleManualDraft = {};
        state.scheduleManualOpen = false;
        state.scheduleSelectedDate = day;
        state.scheduleMonth = day.slice(0, 7);
        state.scheduleSaving = false;
        setToast("安排已保存，已同步到月历和完整日程。");
        await loadPage("schedule");
        } finally { state.scheduleSaving = false; button.disabled = false; }
        return;
      }
      if (action === "schedule-voice") {
        if (scheduleVoiceRecorder.phase !== "idle") { scheduleVoiceRecorder.stop(); return; }
        if (state.scheduleImportBusy || state.scheduleDrafts.length || state.scheduleVoicePending) return;
        await scheduleVoiceRecorder.start();
        return;
      }
      if (action === "schedule-voice-retry") { await transcribeScheduleVoice(state.scheduleVoiceFile); return; }
      if (action === "parse-schedule-text") { await parseScheduleQuick(); return; }
      if (action === "extract-schedule") { await extractScheduleFile(); return; }
      if (action === "confirm-schedule") { await confirmScheduleImport(); return; }
      if (action === "cancel-schedule") {
        if (state.scheduleImportBusy) return;
        state.scheduleDrafts = [];
        if (state.scheduleDraftOrigin === "file") state.scheduleUploadFile = null;
        setScheduleImportStatus("已取消，未添加待确认项目。原文已保留，可修改后重新整理。");
        render(); return;
      }
      if (action === "complete-schedule") {
        const item = state.scheduleItems.find((entry) => entry.docId === button.dataset.doc && entry.courseId === button.dataset.course);
        if (!item) throw new Error("找不到这个提醒。");
        if (scheduleImport.completion(item).classMeeting) return;
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
    const renameInput = $("conversationRename");
    if (renameInput && state.renamingConversation?.courseId === renameInput.dataset.course && state.renamingConversation.id === renameInput.dataset.conversation) state.renamingConversation.title = renameInput.value;
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
    const previousConversationId = previousChat?.parentElement.dataset.conversationId || "default";
    const previousChatKey = previousChat ? studyReplyKey(state.user?.id, previousCourseId, previousConversationId) : "";
    const previousMessages = previousChat?.querySelector(".messages")?.innerHTML;
    const previousScrollTop = previousChat?.scrollTop || 0;
    const previousChatDraft = $("chatInput")?.value || "";
    if (previousChatKey) studyDrafts.set(previousChatKey, { ...studyDrafts.get(previousChatKey), text: previousChatDraft });
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
      if (pdfReturnDrafts.has(studyReplyKey())) {
        $("chatInput").value = pdfReturnDrafts.get(studyReplyKey());
        pdfReturnDrafts.delete(studyReplyKey());
      } else $("chatInput").value = studyDrafts.get(studyReplyKey())?.text || "";
      const showLatest = !previousChat || previousChatKey !== studyReplyKey()
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
    if (event.target?.id === "scheduleAudioFile") { void transcribeScheduleVoice(event.target.files?.[0]); event.target.value = ""; return; }
    if (event.target?.id === "scheduleMonthPicker") {
      if (scheduleImport.validDate(`${event.target.value}-01`)) { state.scheduleMonth = event.target.value; state.scheduleSelectedDate = `${event.target.value}-01`; render(); $("scheduleMonthPicker")?.focus({ preventScroll: true }); }
      return;
    }
    if (event.target.dataset?.calendarField) { state.scheduleCalendarDraft[event.target.dataset.calendarField] = event.target.value; applyScheduleCalendarDraft(); return; }
    if (event.target.dataset?.weekday) {
      const draft = state.scheduleDrafts[Number(event.target.closest("[data-draft]")?.dataset.draft)];
      if (draft?.weekly) { const day = Number(event.target.dataset.weekday); draft.weekly.weekdays = event.target.checked ? [...new Set([...draft.weekly.weekdays, day])] : draft.weekly.weekdays.filter((value) => value !== day); }
      updateSchedulePreviewCount();
      return;
    }
    if (event.target.dataset?.weeklyField || event.target.dataset?.draftField) { updateSchedulePreviewCount(); return; }
    if (event.target?.id === "postAnon") { state.communityDraft.anonymous = event.target.checked; return; }
    if (["englishTerms", "englishAnswers", "chineseExplanations"].includes(event.target?.id)) { scheduleLearningStyleSave(); return; }
    if (event.target?.id === "scheduleFile") {
      state.scheduleUploadFile = event.target.files?.[0] || state.scheduleUploadFile;
      const name = $("scheduleFileName");
      if (name) name.textContent = state.scheduleUploadFile?.name || "选择课程文件";
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
    if (event.target?.id === "scheduleQuickText") { state.scheduleQuickText = event.target.value; return; }
    if (event.target.dataset?.calendarField) { state.scheduleCalendarDraft[event.target.dataset.calendarField] = event.target.value; return; }
    if (event.target.dataset?.weeklyField) { const section = event.target.closest("[data-draft]"); const draft = state.scheduleDrafts[Number(section?.dataset.draft)]; if (draft?.weekly) { draft.weekly[event.target.dataset.weeklyField] = event.target.value; refreshScheduleDraftSummary(section, draft); } return; }
    if (event.target.dataset?.communityReply) { communityReplies.thread(event.target.dataset.communityReply).draft = event.target.value; return; }
    if (event.target?.id === "postTopic") { state.communityDraft.topic = event.target.value; return; }
    if (event.target?.id === "postContent") { state.communityDraft.content = event.target.value; return; }
    if (event.target?.id === "customInstruction") { scheduleLearningStyleSave(); return; }
    const manualField = event.target.dataset?.manualField;
    if (manualField) { state.scheduleManualDraft[manualField] = event.target.value; return; }
    const field = event.target.dataset?.draftField;
    if (!field) return;
    const item = state.scheduleDrafts[Number(event.target.closest("[data-draft]")?.dataset.draft)];
    if (item) { item[field] = field === "selected" ? event.target.checked : event.target.value; refreshScheduleDraftSummary(event.target.closest("[data-draft]"), item); }
  });

  const composingChatInputs = new WeakSet();
  document.addEventListener("compositionstart", (event) => {
    if (event.target?.id === "chatInput") composingChatInputs.add(event.target);
  });
  document.addEventListener("compositionend", (event) => {
    composingChatInputs.delete(event.target);
  });

  document.addEventListener("keydown", (event) => {
    if (event.target?.id === "chatInput" && event.key === "Enter") {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || composingChatInputs.has(event.target)) return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      if (event.repeat || !state.user || state.page !== "study" || state.busy || activeStudyReply()) return;
      if (!event.target.value.trim() && !state.uploadFiles.length) return;
      root.querySelector('[data-action="send-chat"]')?.click();
      return;
    }
    if (event.target?.id === "communityChannelValue" && event.key === "Enter") {
      event.preventDefault();
      root.querySelector('[data-action="community-select"]')?.click();
    }
  });

  document.addEventListener("toggle", (event) => {
    if (event.target.matches?.("[data-review-editor]") && event.target.isConnected) {
      const draft = state.scheduleDrafts[Number(event.target.dataset.reviewEditor)];
      if (draft) scheduleDraftDisclosure.set(draft, event.target.open);
    }
    if (event.target?.id === "scheduleManual") { state.scheduleManualOpen = event.target.open; if (!event.target.open && event.target.isConnected) cancelScheduleVoice(); }
    if (event.target?.id === "scheduleImportPanel") state.scheduleImportOpen = event.target.open;
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
    if (state.page === "schedule" && $("scheduleCalendarView")) {
      const model = scheduleMonthModel();
      const signature = scheduleClockSignature(model);
      if (signature !== state.scheduleClockSignature) {
        state.scheduleClockSignature = signature;
        $("scheduleCalendarView").innerHTML = scheduleCalendarView.render(model, { agendaView: state.scheduleAgendaView, agendaTypes: state.scheduleAgendaTypes, countdown: dueText });
      }
    }
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
  window.addEventListener("pagehide", () => { stopClassmatesLive(); cancelScheduleVoice(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelScheduleVoice(); });
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
