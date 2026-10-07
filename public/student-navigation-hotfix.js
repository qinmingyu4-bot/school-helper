(() => {
  const VERSION = "20261007.2";
  if (window.__studybridgeStudentNavigationHotfix === VERSION) return;
  window.__studybridgeStudentNavigationHotfix = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const STUDY_SELECTORS = ["#workspacePage > .topbar", "#developerPanel", "#chatArea", "#quickPrompts", "#chatForm"];
  const PAGE_IDS = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const ROUTES = {
    openStudyAreaButton: { pageId: "workspacePage", title: "学习区" },
    openProfilePageButton: { pageId: "profilePage", title: "个人资料" },
    profileCard: { pageId: "profilePage", title: "个人资料" },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      title: "社区",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-nav2"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      title: "同学",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-nav2",
        "/classmates-request-patch.js?v=20261007-nav2",
        "/classmate-chat-bubble-fix.js?v=20261007-nav2",
        "/classmates-performance-patch.js?v=20261007-nav2"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      title: "邮件助手",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-nav2"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      title: "时间表",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-nav2",
        "/schedule-dashboard-patch.js?v=20261007-nav2",
        "/schedule-notification-patch.js?v=20261007-nav2"
      ]
    }
  };

  const routeSelector = Object.keys(ROUTES).map((id) => `#${id}`).join(",");
  const scriptPromises = new Map();
  let openTicket = 0;

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function getWorkspace() {
    const page = $("#workspacePage") || $(".workspace");
    if (page && !page.id) page.id = "workspacePage";
    return page;
  }

  function isLoggedIn() {
    const shell = $("#appShell");
    return !!shell && !shell.hidden;
  }

  function status(text) {
    const line = $("#statusLine");
    if (line) line.textContent = text;
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {}
  }

  function studentMode() {
    try { localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {}
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    $("#developerPanel")?.setAttribute("hidden", "");
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
  }

  function setActive(pageId) {
    Object.entries(ROUTES).forEach(([id, route]) => {
      if (id === "profileCard") return;
      const button = $("#" + id);
      if (!button) return;
      const active = route.pageId === pageId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function showStudyParts(show) {
    const root = getWorkspace();
    if (!root) return;
    STUDY_SELECTORS.forEach((selector) => {
      const element = $(selector);
      if (element) element.hidden = !show;
    });
  }

  function placePage(page) {
    const root = getWorkspace();
    if (root && page && page.parentElement !== root) root.appendChild(page);
  }

  function ensureFallback(route) {
    if (route.pageId === "workspacePage") return getWorkspace();
    let page = $("#" + route.pageId);
    if (page) {
      placePage(page);
      return page;
    }
    page = document.createElement("section");
    page.id = route.pageId;
    page.className = "studybridge-route-page";
    page.hidden = true;
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">StudyBridge</p>
          <h2>${route.title}</h2>
          <span>页面正在打开。</span>
        </div>
        <button class="ghost-button" id="routeBackToStudyButton" type="button">返回学习区</button>
      </header>
      <div class="studybridge-route-empty">${route.title} 页面正在加载，如果停留在这里请刷新一次。</div>`;
    placePage(page);
    return page;
  }

  function showPage(route) {
    const root = getWorkspace();
    if (!root) return false;
    studentMode();
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";
    root.style.opacity = "1";

    if (route.pageId === "workspacePage") {
      PAGE_IDS.forEach((id) => {
        const page = $("#" + id);
        if (page) page.hidden = true;
      });
      showStudyParts(true);
      document.body.classList.remove("studybridge-route-mode");
      document.body.dataset.studybridgeActivePage = "workspacePage";
      setActive("workspacePage");
      remember("workspacePage");
      status("Workspace is ready.");
      return true;
    }

    const selected = ensureFallback(route);
    showStudyParts(false);
    PAGE_IDS.forEach((id) => {
      const page = $("#" + id);
      if (!page) return;
      const active = id === route.pageId;
      page.hidden = !active;
      if (active) {
        placePage(page);
        page.removeAttribute("hidden");
        page.style.display = "";
        page.style.visibility = "visible";
        page.style.opacity = "1";
      }
    });
    if (selected) selected.hidden = false;
    document.body.classList.add("studybridge-route-mode");
    document.body.dataset.studybridgeActivePage = route.pageId;
    setActive(route.pageId);
    remember(route.pageId);
    status(route.title + " opened.");
    return true;
  }

  function scriptPath(src) {
    return new URL(src.split("?")[0], location.href).pathname;
  }

  function hasScript(src) {
    const path = scriptPath(src);
    return Array.from(document.scripts).some((script) => {
      const value = script.getAttribute("src");
      return value && new URL(value, location.href).pathname === path;
    });
  }

  function loadScript(src, opener) {
    if (opener && typeof window[opener] === "function") return Promise.resolve();
    const path = scriptPath(src);
    if (scriptPromises.has(path)) return scriptPromises.get(path);
    if (hasScript(src)) return Promise.resolve();
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
      setTimeout(resolve, 1600);
    });
    scriptPromises.set(path, promise);
    return promise;
  }

  async function runOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return;
    try {
      await window[route.opener]();
    } catch (error) {
      console.warn("StudyBridge route opener failed", route.opener, error);
    }
  }

  async function openRoute(routeId) {
    const route = ROUTES[routeId];
    if (!route || !isLoggedIn()) return;
    const ticket = ++openTicket;
    showPage(route);
    if (route.pageId === "workspacePage") return;
    await Promise.all((route.scripts || []).map((src) => loadScript(src, route.opener)));
    if (ticket !== openTicket) return;
    await runOpener(route);
    for (const ms of [0, 80, 250, 600, 1200]) {
      if (ticket !== openTicket) return;
      if (ms) await new Promise((resolve) => setTimeout(resolve, ms));
      showPage(route);
    }
  }

  function routeIdFromEvent(event) {
    const target = event.target.closest?.(routeSelector);
    if (target) return target.id;
    const profile = event.target.closest?.("#profileCard");
    if (profile && !event.target.closest("input, textarea, select, button, form")) return "profileCard";
    return "";
  }

  function intercept(event) {
    const routeId = routeIdFromEvent(event);
    if (!routeId || !isLoggedIn()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(routeId);
  }

  function installStyles() {
    if ($("#studybridge-student-navigation-hotfix-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-student-navigation-hotfix-style";
    style.textContent = `
      #openProfilePageButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton{cursor:pointer!important;pointer-events:auto!important}
      #openProfilePageButton *,#openSchoolCommunityButton *,#openClassmatesButton *,#openEmailReplyButton *,#openScheduleButton *,#openStudyAreaButton *{pointer-events:none!important}
      body.studybridge-route-mode #workspacePage{display:block!important;visibility:visible!important;opacity:1!important;height:100vh!important;min-height:100vh!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f4f6f9!important}
      body.studybridge-route-mode #workspacePage>.topbar,
      body.studybridge-route-mode #workspacePage>#developerPanel,
      body.studybridge-route-mode #workspacePage>#chatArea,
      body.studybridge-route-mode #workspacePage>#quickPrompts,
      body.studybridge-route-mode #workspacePage>#chatForm{display:none!important}
      body.studybridge-route-mode #profilePage:not([hidden]),
      body.studybridge-route-mode #schoolCommunityPage:not([hidden]),
      body.studybridge-route-mode #classmatesPage:not([hidden]),
      body.studybridge-route-mode #emailReplyPage:not([hidden]),
      body.studybridge-route-mode #schedulePage:not([hidden]){display:block!important;visibility:visible!important;opacity:1!important;min-height:100vh!important}
      .studybridge-route-empty{padding:28px;color:#58647a}.studybridge-route-page{min-height:100vh;background:#f4f6f9}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyles();
    Object.keys(ROUTES).forEach((id) => {
      const button = $("#" + id);
      if (button && button.tagName === "BUTTON") button.type = "button";
    });
  }

  window.studybridgeNavigationHotfixOpen = openRoute;
  window.studybridgeDirectOpenPage = openRoute;
  window.studybridgeFinalOpenPage = openRoute;
  window.studybridgeOpenStudentPage = (pageId) => {
    const match = Object.entries(ROUTES).find(([, route]) => route.pageId === pageId);
    if (match) openRoute(match[0]);
  };

  window.addEventListener("pointerdown", intercept, true);
  window.addEventListener("click", intercept, true);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") intercept(event);
  }, true);
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("#backToStudyButton,#routeBackToStudyButton")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openRoute("openStudyAreaButton");
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  new MutationObserver(() => requestAnimationFrame(boot)).observe(document.documentElement, { childList: true, subtree: true });
})();
