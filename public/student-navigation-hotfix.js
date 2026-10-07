(() => {
  const VERSION = "20261007.7";
  if (window.__studybridgeNavigationHotfix === VERSION) return;
  window.__studybridgeNavigationHotfix = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const SECONDARY_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const STUDY_PARTS = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const scriptLoads = new Map();
  let openToken = 0;

  const ROUTES = {
    openStudyAreaButton: { pageId: "workspacePage", navId: "openStudyAreaButton", title: "学习区" },
    openProfilePageButton: {
      pageId: "profilePage",
      navId: "openProfilePageButton",
      title: "Profile",
      scripts: ["/student-page-shell-fix.js?v=20261007-nav7"]
    },
    editProfileButton: {
      pageId: "profilePage",
      navId: "openProfilePageButton",
      title: "Profile",
      scripts: ["/student-page-shell-fix.js?v=20261007-nav7"]
    },
    profileCard: {
      pageId: "profilePage",
      navId: "openProfilePageButton",
      title: "Profile",
      scripts: ["/student-page-shell-fix.js?v=20261007-nav7"]
    },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      navId: "openSchoolCommunityButton",
      title: "社区",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-nav7"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      navId: "openClassmatesButton",
      title: "同学",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-nav7",
        "/classmates-request-patch.js?v=20261007-nav7",
        "/classmate-chat-bubble-fix.js?v=20261007-nav7",
        "/classmates-performance-patch.js?v=20261007-nav7"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      navId: "openEmailReplyButton",
      title: "邮件助手",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-nav7"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      navId: "openScheduleButton",
      title: "时间表",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-nav7",
        "/schedule-dashboard-patch.js?v=20261007-nav7",
        "/schedule-notification-patch.js?v=20261007-nav7"
      ]
    }
  };

  const ROUTE_SELECTOR = Object.keys(ROUTES).map((id) => `#${id}`).join(",");

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function appIsOpen() {
    const shell = $("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function workspace() {
    const root = $("#workspacePage") || $(".workspace");
    if (root && !root.id) root.id = "workspacePage";
    return root;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setStatus(text) {
    const line = $("#statusLine");
    if (line) line.textContent = text;
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Navigation still works without localStorage.
    }
  }

  function setActive(pageId) {
    Object.entries(ROUTES).forEach(([id, route]) => {
      const button = $(`#${route.navId || id}`);
      if (!button) return;
      const active = route.pageId === pageId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    $("#openProfilePageButton")?.classList.toggle("active", pageId === "profilePage");
  }

  function forceStudentMode() {
    try {
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Ignore.
    }
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    const developerPanel = $("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
  }

  function setStudyVisible(visible) {
    const root = workspace();
    if (!root) return;
    STUDY_PARTS.forEach((selector) => {
      const element = root.querySelector(`:scope > ${selector}`);
      if (element) element.hidden = !visible;
    });
  }

  function hideSecondaryPages(exceptPageId = "") {
    SECONDARY_PAGES.forEach((id) => {
      const page = $(`#${id}`);
      if (!page) return;
      page.hidden = id !== exceptPageId;
      if (id === exceptPageId) {
        page.removeAttribute("hidden");
        page.style.display = "";
        page.style.visibility = "visible";
        page.style.opacity = "1";
      }
    });
  }

  function showStudyArea() {
    const root = workspace();
    if (!root) return false;
    forceStudentMode();
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";
    root.style.opacity = "1";
    hideSecondaryPages("");
    setStudyVisible(true);
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-nav-hotfix-page");
    document.body.dataset.studybridgeActivePage = "workspacePage";
    setActive("workspacePage");
    remember("workspacePage");
    setStatus("Workspace is ready.");
    return true;
  }

  function showSecondaryPage(route) {
    const root = workspace();
    if (!root) return false;
    const page = $(`#${route.pageId}`);
    if (!page) return false;
    forceStudentMode();
    if (page.parentElement !== root) root.appendChild(page);
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";
    root.style.opacity = "1";
    setStudyVisible(false);
    hideSecondaryPages(route.pageId);
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-nav-hotfix-page");
    document.body.dataset.studybridgeActivePage = route.pageId;
    setActive(route.pageId);
    remember(route.pageId);
    setStatus(`${route.title} opened.`);
    return true;
  }

  function showLoading(route) {
    const root = workspace();
    if (!root) return;
    let loading = $("#studybridgeRouteLoadingPage");
    if (!loading) {
      loading = document.createElement("section");
      loading.id = "studybridgeRouteLoadingPage";
      loading.className = "studybridge-route-loading";
      root.appendChild(loading);
    }
    loading.innerHTML = `<div class="route-loading-card">正在打开 ${route.title}...</div>`;
    forceStudentMode();
    setStudyVisible(false);
    hideSecondaryPages("");
    root.hidden = false;
    loading.hidden = false;
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-nav-hotfix-page");
    document.body.dataset.studybridgeActivePage = route.pageId;
    setActive(route.pageId);
  }

  function hideLoading() {
    const loading = $("#studybridgeRouteLoadingPage");
    if (loading) loading.hidden = true;
  }

  function scriptPath(src) {
    return new URL(src.split("?")[0], window.location.href).pathname;
  }

  function scriptAlreadyPresent(src) {
    const path = scriptPath(src);
    return Array.from(document.scripts).some((script) => {
      const current = script.getAttribute("src");
      return current && new URL(current, window.location.href).pathname === path;
    });
  }

  function loadScript(src, openerName) {
    if (openerName && typeof window[openerName] === "function") return Promise.resolve();
    const path = scriptPath(src);
    if (scriptLoads.has(path)) return scriptLoads.get(path);
    if (scriptAlreadyPresent(src)) return Promise.resolve();
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 1600);
    });
    scriptLoads.set(path, promise);
    return promise;
  }

  async function callOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return false;
    try {
      await window[route.opener]();
      return true;
    } catch (error) {
      console.warn("StudyBridge page opener failed:", error);
      return false;
    }
  }

  function refreshVisiblePage(pageId) {
    const selector = {
      schoolCommunityPage: "#refreshCommunityButton",
      classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton",
      schedulePage: "#refreshScheduleButton"
    }[pageId];
    if (!selector) return;
    setTimeout(() => {
      const button = $(selector);
      if (button && !button.disabled) button.click();
    }, 200);
  }

  async function openRouteById(id) {
    const route = ROUTES[id];
    if (!route || !appIsOpen()) return;
    const token = ++openToken;

    if (route.pageId === "workspacePage") {
      hideLoading();
      showStudyArea();
      return;
    }

    if (!showSecondaryPage(route)) showLoading(route);
    await Promise.all((route.scripts || []).map((src) => loadScript(src, route.opener)));
    if (token !== openToken) return;
    await callOpener(route);

    for (const delay of [0, 80, 220, 520, 1000]) {
      if (token !== openToken) return;
      if (delay) await wait(delay);
      if (showSecondaryPage(route)) {
        hideLoading();
        refreshVisiblePage(route.pageId);
        return;
      }
    }

    setStatus(`${route.title} 暂时没有打开，请刷新页面后再试。`);
  }

  function routeIdFromEvent(event) {
    const target = event.target.closest?.(ROUTE_SELECTOR);
    if (target) return target.id;
    const profile = event.target.closest?.("#profileCard");
    if (profile && !event.target.closest("input, textarea, select, form, button")) return "profileCard";
    return "";
  }

  function intercept(event) {
    const id = routeIdFromEvent(event);
    if (!id || !appIsOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRouteById(id);
  }

  function handleKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    intercept(event);
  }

  function prepareButtons() {
    Object.keys(ROUTES).forEach((id) => {
      const button = $(`#${id}`);
      if (button?.tagName === "BUTTON") button.type = "button";
    });
  }

  function restoreLastPage() {
    if (!appIsOpen()) return;
    let pageId = "";
    try {
      pageId = localStorage.getItem(PAGE_KEY) || "";
    } catch {
      pageId = "";
    }
    if (!SECONDARY_PAGES.includes(pageId)) return;
    const entry = Object.entries(ROUTES).find(([, route]) => route.pageId === pageId);
    if (entry) openRouteById(entry[0]);
  }

  function installStyle() {
    if ($("#studybridge-navigation-hotfix-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-navigation-hotfix-style";
    style.textContent = `
      #openProfilePageButton,
      #editProfileButton,
      #openStudyAreaButton,
      #openSchoolCommunityButton,
      #openClassmatesButton,
      #openEmailReplyButton,
      #openScheduleButton,
      #profileCard {
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      #openProfilePageButton *,
      #editProfileButton *,
      #openStudyAreaButton *,
      #openSchoolCommunityButton *,
      #openClassmatesButton *,
      #openEmailReplyButton *,
      #openScheduleButton * {
        pointer-events: none !important;
      }

      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #workspacePage {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        min-height: 100dvh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        background: #f4f6f9 !important;
      }

      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #workspacePage > .topbar,
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #workspacePage > #developerPanel,
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #workspacePage > #scheduleDashboard,
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #workspacePage > #chatArea,
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #workspacePage > #quickPrompts,
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #workspacePage > #chatForm {
        display: none !important;
      }

      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #profilePage:not([hidden]),
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #classmatesPage:not([hidden]),
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #emailReplyPage:not([hidden]),
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #schedulePage:not([hidden]),
      body.studybridge-nav-hotfix-page:not(.creator-clean-mode) #studybridgeRouteLoadingPage:not([hidden]) {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }

      .studybridge-route-loading {
        min-height: 100dvh;
        padding: 28px;
        background: #f4f6f9;
      }

      .route-loading-card {
        max-width: 520px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fff;
        padding: 18px;
        color: var(--muted);
        box-shadow: 0 12px 28px rgba(25, 36, 58, 0.06);
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    workspace();
    installStyle();
    prepareButtons();
  }

  window.studybridgeNavigationHotfixOpen = openRouteById;
  window.studybridgeDirectOpenPage = openRouteById;
  window.studybridgeFinalOpenPage = openRouteById;
  window.studybridgeOpenStudentPage = (pageId) => {
    const entry = Object.entries(ROUTES).find(([, route]) => route.pageId === pageId);
    if (entry) openRouteById(entry[0]);
  };

  window.addEventListener("pointerdown", intercept, true);
  window.addEventListener("click", intercept, true);
  window.addEventListener("keydown", handleKeydown, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  new MutationObserver(() => requestAnimationFrame(boot)).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(restoreLastPage, 450);
})();
