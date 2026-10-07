(() => {
  const VERSION = "20261007-12";
  if (window.__studybridgeStudentNavigationRescue === VERSION) return;
  window.__studybridgeStudentNavigationRescue = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const STUDY_PARTS = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const SECONDARY_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const ROUTES = {
    openStudyAreaButton: { pageId: "workspacePage", title: "学习区" },
    openProfilePageButton: { pageId: "profilePage", title: "个人资料", scripts: [] },
    profileCard: { pageId: "profilePage", title: "个人资料", scripts: [] },
    openSchoolCommunityButton: { pageId: "schoolCommunityPage", title: "社区", scripts: ["/school-community-patch.js?v=20261007-rescue12"] },
    openClassmatesButton: { pageId: "classmatesPage", title: "同学", scripts: ["/classmates-patch.js?v=20261007-rescue12", "/classmates-request-patch.js?v=20261007-rescue12", "/classmate-chat-bubble-fix.js?v=20261007-rescue12", "/classmates-performance-patch.js?v=20261007-rescue12"] },
    openEmailReplyButton: { pageId: "emailReplyPage", title: "邮件助手", scripts: ["/email-reply-patch.js?v=20261007-rescue12"] },
    openScheduleButton: { pageId: "schedulePage", title: "时间表", scripts: ["/schedule-patch.js?v=20261007-rescue12", "/schedule-dashboard-patch.js?v=20261007-rescue12", "/schedule-notification-patch.js?v=20261007-rescue12"] },
    scheduleDashboard: { pageId: "schedulePage", title: "时间表", scripts: ["/schedule-patch.js?v=20261007-rescue12", "/schedule-dashboard-patch.js?v=20261007-rescue12", "/schedule-notification-patch.js?v=20261007-rescue12"] }
  };
  const TEXT_ROUTES = [
    ["openProfilePageButton", ["Personal profile", "个人资料"]],
    ["openSchoolCommunityButton", ["社区", "Community"]],
    ["openClassmatesButton", ["同学", "Classmates", "SB ID 申请"]],
    ["openEmailReplyButton", ["邮件助手", "Email Helper"]],
    ["openScheduleButton", ["时间表", "Schedule", "deadline"]],
    ["openStudyAreaButton", ["学习区", "Study Area", "AI 对话"]]
  ];

  const loadedScripts = new Map();
  let openingPage = "";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

  function appIsOpen() {
    const appShell = $("#appShell");
    return Boolean(appShell && !appShell.hidden);
  }

  function workspaceShell() {
    return $(".workspace") || $("#workspacePage")?.parentElement || $("#workspacePage");
  }

  function studyPage() {
    const page = $("#workspacePage") || $(".workspace > section:first-child") || $(".workspace");
    if (page && !page.id) page.id = "workspacePage";
    return page;
  }

  function setStatus(text) {
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {}
  }

  function forceStudentMode() {
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-page-switching", "studybridge-direct-routing");
    const developerPanel = $("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
  }

  function setStudyPartsHidden(hidden) {
    const page = studyPage();
    if (!page) return;
    STUDY_PARTS.forEach((selector) => {
      const element = page.querySelector(`:scope > ${selector}`);
      if (element) element.hidden = hidden;
    });
  }

  function setActiveNav(pageId) {
    Object.entries(ROUTES).forEach(([id, route]) => {
      if (id === "profileCard" || id === "scheduleDashboard") return;
      const button = $("#" + id);
      if (!button) return;
      const active = route.pageId === pageId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function ensureFallbackPage(pageId) {
    if (pageId === "workspacePage") return studyPage();
    const shell = workspaceShell();
    if (!shell) return null;
    let page = $("#" + pageId);
    if (!page) {
      const title = Object.values(ROUTES).find((route) => route.pageId === pageId)?.title || "页面";
      page = document.createElement("section");
      page.id = pageId;
      page.className = "studybridge-rescue-page";
      page.hidden = true;
      page.innerHTML = `<header class="topbar"><div><p class="eyebrow">STUDYBRIDGE</p><h2>${title}</h2><span>页面正在加载。</span></div><button class="ghost-button studybridge-rescue-back" type="button">返回学习区</button></header><div class="studybridge-rescue-body">Loading...</div>`;
      shell.appendChild(page);
    } else if (page.parentElement !== shell) {
      shell.appendChild(page);
    }
    return page;
  }

  function showStudyArea() {
    const shell = workspaceShell();
    const mainPage = studyPage();
    if (!shell || !mainPage) return false;
    forceStudentMode();
    shell.hidden = false;
    shell.removeAttribute("hidden");
    mainPage.hidden = false;
    mainPage.removeAttribute("hidden");
    setStudyPartsHidden(false);
    SECONDARY_PAGES.forEach((id) => {
      const page = $("#" + id);
      if (page) page.hidden = true;
    });
    document.body.classList.remove("study-sidebar-hidden", "studybridge-secondary-page");
    document.body.dataset.studybridgeActivePage = "workspacePage";
    setActiveNav("workspacePage");
    remember("workspacePage");
    setStatus("Workspace is ready.");
    return true;
  }

  function showFallbackPage(pageId) {
    const shell = workspaceShell();
    const mainPage = studyPage();
    const target = ensureFallbackPage(pageId);
    if (!shell || !mainPage || !target) return false;
    forceStudentMode();
    shell.hidden = false;
    shell.removeAttribute("hidden");
    mainPage.hidden = false;
    mainPage.removeAttribute("hidden");
    setStudyPartsHidden(true);
    SECONDARY_PAGES.forEach((id) => {
      const page = ensureFallbackPage(id);
      if (page) page.hidden = id !== pageId;
    });
    target.hidden = false;
    target.removeAttribute("hidden");
    document.body.classList.add("study-sidebar-hidden", "studybridge-secondary-page");
    document.body.dataset.studybridgeActivePage = pageId;
    setActiveNav(pageId);
    remember(pageId);
    setStatus("Page opened.");
    return true;
  }

  function scriptKey(src) {
    return new URL(src.split("?")[0], location.href).pathname;
  }

  function loadScript(src) {
    const key = scriptKey(src);
    if (loadedScripts.has(key)) return loadedScripts.get(key);
    if ($$("script").some((script) => {
      const current = script.getAttribute("src");
      return current && new URL(current, location.href).pathname === key;
    })) return Promise.resolve();
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
      setTimeout(resolve, 1600);
    });
    loadedScripts.set(key, promise);
    return promise;
  }

  function visiblePage(pageId) {
    const page = $("#" + pageId);
    return Boolean(page && !page.hidden && getComputedStyle(page).display !== "none");
  }

  async function openRoute(id) {
    const route = ROUTES[id];
    if (!route || !appIsOpen()) return;
    if (openingPage === route.pageId) return;
    openingPage = route.pageId;
    try {
      if (route.pageId === "workspacePage") {
        showStudyArea();
        return;
      }
      await Promise.all((route.scripts || []).map(loadScript));
      await wait(60);
      const realButton = $("#" + id);
      if (realButton && id !== "openProfilePageButton" && id !== "profileCard") {
        remember(route.pageId);
        realButton.click();
        await wait(160);
        if (visiblePage(route.pageId)) {
          setActiveNav(route.pageId);
          document.body.dataset.studybridgeActivePage = route.pageId;
          return;
        }
      }
      showFallbackPage(route.pageId);
      const refresh = { schoolCommunityPage: "#refreshCommunityButton", classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton", schedulePage: "#refreshScheduleButton" }[route.pageId];
      const refreshButton = refresh ? $(refresh) : null;
      if (refreshButton && !refreshButton.disabled) setTimeout(() => refreshButton.click(), 120);
    } finally {
      setTimeout(() => {
        if (openingPage === route.pageId) openingPage = "";
      }, 220);
    }
  }

  function routeFromEvent(event) {
    const directSelector = Object.keys(ROUTES).map((id) => "#" + id).join(",");
    const direct = event.target.closest?.(directSelector);
    if (direct?.id) return { id: direct.id, direct: true };
    if (event.target.closest?.("#profileCard") && !event.target.closest("input, textarea, select, form")) return { id: "profileCard", direct: true };
    if (!event.target.closest?.(".sidebar")) return null;
    let node = event.target.nodeType === Node.ELEMENT_NODE ? event.target : event.target.parentElement;
    while (node && node !== document.body) {
      if (node.closest?.("input, textarea, select, form")) return null;
      const text = clean(node.textContent);
      if (text && text.length <= 180) {
        const match = TEXT_ROUTES.find(([, patterns]) => patterns.some((pattern) => text.includes(pattern)));
        if (match) return { id: match[0], direct: false };
      }
      if (node.classList?.contains("sidebar")) break;
      node = node.parentElement;
    }
    return null;
  }

  function intercept(event) {
    const target = routeFromEvent(event);
    if (!target) return;
    if (target.direct && target.id !== "openStudyAreaButton") {
      const route = ROUTES[target.id];
      if (route) remember(route.pageId);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(target.id);
  }

  function interceptKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    intercept(event);
  }

  function installStyle() {
    if ($("#studybridge-navigation-rescue-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-navigation-rescue-style";
    style.textContent = `.sidebar #openProfilePageButton,.sidebar #openSchoolCommunityButton,.sidebar #openClassmatesButton,.sidebar #openEmailReplyButton,.sidebar #openScheduleButton,.sidebar #openStudyAreaButton{pointer-events:auto!important;cursor:pointer!important}.studybridge-rescue-page{min-height:100vh;background:#f4f6f9}.studybridge-rescue-page[hidden]{display:none!important}.studybridge-rescue-body{padding:28px;color:var(--muted)}`;
    document.head.appendChild(style);
  }

  function restoreLastPage() {
    let pageId = "";
    try { pageId = localStorage.getItem(PAGE_KEY) || ""; } catch {}
    if (!pageId || pageId === "workspacePage") return;
    const entry = Object.entries(ROUTES).find(([, route]) => route.pageId === pageId);
    if (entry) openRoute(entry[0]);
  }

  window.addEventListener("pointerdown", intercept, true);
  window.addEventListener("pointerup", intercept, true);
  window.addEventListener("touchend", intercept, true);
  window.addEventListener("click", intercept, true);
  window.addEventListener("keydown", interceptKey, true);
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".studybridge-rescue-back")) {
      event.preventDefault();
      openRoute("openStudyAreaButton");
    }
  }, true);

  window.studybridgeOpenStudentPage = (pageId) => {
    const entry = Object.entries(ROUTES).find(([, route]) => route.pageId === pageId);
    if (entry) openRoute(entry[0]);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { installStyle(); setTimeout(restoreLastPage, 350); }, { once: true });
  } else {
    installStyle();
    setTimeout(restoreLastPage, 350);
  }
})();
