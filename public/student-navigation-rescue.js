(() => {
  const VERSION = "20261007-11";
  if (window.__studybridgeStudentNavigationRescue === VERSION) return;
  window.__studybridgeStudentNavigationRescue = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const STUDY_PARTS = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const SECONDARY_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const ROUTES = {
    openStudyAreaButton: { pageId: "workspacePage", title: "学习区" },
    openProfilePageButton: { pageId: "profilePage", title: "个人资料" },
    profileCard: { pageId: "profilePage", title: "个人资料" },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      title: "社区",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-rescue11"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      title: "同学",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-rescue11",
        "/classmates-request-patch.js?v=20261007-rescue11",
        "/classmate-chat-bubble-fix.js?v=20261007-rescue11",
        "/classmates-performance-patch.js?v=20261007-rescue11"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      title: "邮件助手",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-rescue11"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      title: "时间表",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-rescue11",
        "/schedule-dashboard-patch.js?v=20261007-rescue11",
        "/schedule-notification-patch.js?v=20261007-rescue11"
      ]
    },
    scheduleDashboard: {
      pageId: "schedulePage",
      title: "时间表",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-rescue11",
        "/schedule-dashboard-patch.js?v=20261007-rescue11",
        "/schedule-notification-patch.js?v=20261007-rescue11"
      ]
    }
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
    } catch {
      // Ignore private browsing storage failures.
    }
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

  function ensurePage(pageId) {
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
      page.innerHTML = `
        <header class="topbar">
          <div>
            <p class="eyebrow">STUDYBRIDGE</p>
            <h2>${title}</h2>
            <span>页面正在加载。</span>
          </div>
          <button class="ghost-button studybridge-rescue-back" type="button">返回学习区</button>
        </header>
        <div class="studybridge-rescue-body">Loading...</div>
      `;
      shell.appendChild(page);
    } else if (page.parentElement !== shell) {
      shell.appendChild(page);
    }
    return page;
  }

  function showPage(pageId) {
    const shell = workspaceShell();
    const mainPage = studyPage();
    if (!shell || !mainPage) return false;
    forceStudentMode();
    shell.hidden = false;
    shell.removeAttribute("hidden");
    shell.style.display = "";
    shell.style.visibility = "visible";

    SECONDARY_PAGES.forEach((id) => {
      const page = ensurePage(id);
      if (page) page.hidden = id !== pageId;
    });

    if (pageId === "workspacePage") {
      mainPage.hidden = false;
      mainPage.removeAttribute("hidden");
      setStudyPartsHidden(false);
      document.body.classList.remove("study-sidebar-hidden", "studybridge-secondary-page");
      setStatus("Workspace is ready.");
    } else {
      const target = ensurePage(pageId);
      if (!target) return false;
      mainPage.hidden = false;
      mainPage.removeAttribute("hidden");
      setStudyPartsHidden(true);
      target.hidden = false;
      target.removeAttribute("hidden");
      target.style.display = "";
      target.style.visibility = "visible";
      document.body.classList.add("study-sidebar-hidden", "studybridge-secondary-page");
      setStatus("Page opened.");
    }

    document.body.dataset.studybridgeActivePage = pageId;
    setActiveNav(pageId);
    remember(pageId);
    return true;
  }

  function scriptKey(src) {
    return new URL(src.split("?")[0], location.href).pathname;
  }

  function loadScript(src, openerName) {
    if (openerName && typeof window[openerName] === "function") return Promise.resolve();
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
      setTimeout(resolve, 1800);
    });
    loadedScripts.set(key, promise);
    return promise;
  }

  async function callOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return;
    try {
      await window[route.opener]();
    } catch (error) {
      console.warn("StudyBridge page opener failed:", error);
    }
  }

  function refreshPage(pageId) {
    const selector = {
      schoolCommunityPage: "#refreshCommunityButton",
      classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton",
      schedulePage: "#refreshScheduleButton"
    }[pageId];
    if (!selector) return;
    const button = $(selector);
    if (button && !button.disabled) setTimeout(() => button.click(), 120);
  }

  async function openRoute(id) {
    const route = ROUTES[id];
    if (!route || !appIsOpen()) return;
    if (openingPage === route.pageId) return;
    openingPage = route.pageId;
    try {
      if (route.pageId === "workspacePage") {
        showPage("workspacePage");
        return;
      }
      ensurePage(route.pageId);
      showPage(route.pageId);
      await Promise.all((route.scripts || []).map((src) => loadScript(src, route.opener)));
      await callOpener(route);
      await wait(80);
      showPage(route.pageId);
      await wait(180);
      showPage(route.pageId);
      refreshPage(route.pageId);
    } finally {
      setTimeout(() => {
        if (openingPage === route.pageId) openingPage = "";
      }, 220);
    }
  }

  function routeFromEvent(event) {
    const directSelector = Object.keys(ROUTES).map((id) => "#" + id).join(",");
    const direct = event.target.closest?.(directSelector);
    if (direct?.id) return direct.id;
    if (event.target.closest?.("#profileCard") && !event.target.closest("input, textarea, select, form")) return "profileCard";
    if (!event.target.closest?.(".sidebar")) return "";

    let node = event.target.nodeType === Node.ELEMENT_NODE ? event.target : event.target.parentElement;
    while (node && node !== document.body) {
      if (node.closest?.("input, textarea, select, form")) return "";
      const text = clean(node.textContent);
      if (text && text.length <= 180) {
        const match = TEXT_ROUTES.find(([, patterns]) => patterns.some((pattern) => text.includes(pattern)));
        if (match) return match[0];
      }
      if (node.classList?.contains("sidebar")) break;
      node = node.parentElement;
    }
    return "";
  }

  function intercept(event) {
    const id = routeFromEvent(event);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(id);
  }

  function interceptKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    intercept(event);
  }

  function installStyle() {
    if ($("#studybridge-navigation-rescue-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-navigation-rescue-style";
    style.textContent = `
      .sidebar #openProfilePageButton,
      .sidebar #openSchoolCommunityButton,
      .sidebar #openClassmatesButton,
      .sidebar #openEmailReplyButton,
      .sidebar #openScheduleButton,
      .sidebar #openStudyAreaButton {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      .studybridge-rescue-page {
        min-height: 100vh;
        background: #f4f6f9;
      }
      .studybridge-rescue-page[hidden] {
        display: none !important;
      }
      .studybridge-rescue-body {
        padding: 28px;
        color: var(--muted);
      }
    `;
    document.head.appendChild(style);
  }

  function restoreLastPage() {
    let pageId = "";
    try {
      pageId = localStorage.getItem(PAGE_KEY) || "";
    } catch {
      pageId = "";
    }
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
    document.addEventListener("DOMContentLoaded", () => {
      installStyle();
      setTimeout(restoreLastPage, 250);
    }, { once: true });
  } else {
    installStyle();
    setTimeout(restoreLastPage, 250);
  }
})();
