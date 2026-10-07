(() => {
  const VERSION = "20261007.3";
  if (window.__studybridgeStudentNavigationHotfix === VERSION) return;
  window.__studybridgeStudentNavigationHotfix = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const LOADING_ID = "studybridgeRouteLoadingPage";
  const PAGE_IDS = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const ROUTES = {
    openStudyAreaButton: { pageId: "workspacePage", title: "学习区" },
    openProfilePageButton: { pageId: "profilePage", title: "个人资料" },
    profileCard: { pageId: "profilePage", title: "个人资料" },
    openSchoolCommunityButton: { pageId: "schoolCommunityPage", title: "社区", opener: "studybridgeOpenCommunityPage", scripts: ["/school-community-patch.js?v=20261007-nav3"] },
    openClassmatesButton: { pageId: "classmatesPage", title: "同学", opener: "studybridgeOpenClassmatesPage", scripts: ["/classmates-patch.js?v=20261007-nav3", "/classmates-request-patch.js?v=20261007-nav3", "/classmate-chat-bubble-fix.js?v=20261007-nav3", "/classmates-performance-patch.js?v=20261007-nav3"] },
    openEmailReplyButton: { pageId: "emailReplyPage", title: "邮件助手", opener: "studybridgeOpenEmailReplyPage", scripts: ["/email-reply-patch.js?v=20261007-nav3"] },
    openScheduleButton: { pageId: "schedulePage", title: "时间表", opener: "studybridgeOpenSchedulePage", scripts: ["/schedule-patch.js?v=20261007-nav3", "/schedule-dashboard-patch.js?v=20261007-nav3", "/schedule-notification-patch.js?v=20261007-nav3"] }
  };

  const routeSelector = Object.keys(ROUTES).map((id) => `#${id}`).join(",");
  const scriptPromises = new Map();
  let openTicket = 0;
  const $ = (selector, root = document) => root.querySelector(selector);

  function container() {
    return $(".workspace") || $("#workspacePage")?.parentElement || $("#appShell") || document.body;
  }

  function workspacePage() {
    return $("#workspacePage");
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

  function hideLoading() {
    const loading = $("#" + LOADING_ID);
    if (loading) loading.hidden = true;
  }

  function showLoading(route) {
    const host = container();
    let loading = $("#" + LOADING_ID);
    if (!loading) {
      loading = document.createElement("section");
      loading.id = LOADING_ID;
      loading.className = "studybridge-route-loading";
      loading.innerHTML = '<header class="topbar"><div><p class="eyebrow">StudyBridge</p><h2 id="routeLoadingTitle">正在打开</h2><span id="routeLoadingSubtitle">页面正在加载。</span></div><button class="ghost-button" id="routeBackToStudyButton" type="button">返回学习区</button></header><div class="studybridge-route-empty">如果这里停住，请刷新一次页面。</div>';
      host.appendChild(loading);
    }
    $("#routeLoadingTitle", loading).textContent = route.title;
    $("#routeLoadingSubtitle", loading).textContent = route.title + " 页面正在加载。";
    loading.hidden = false;
    return loading;
  }

  function placePage(page) {
    const host = container();
    if (host && page && page.parentElement !== host) host.appendChild(page);
  }

  function ensureProfileFallback() {
    let page = $("#profilePage");
    if (page) return page;
    page = document.createElement("section");
    page.id = "profilePage";
    page.className = "profile-page";
    page.hidden = true;
    page.innerHTML = '<header class="topbar"><div><p class="eyebrow">Personal Profile</p><h2>个人资料</h2><span>资料会保存到你的账号。</span></div><button class="ghost-button" id="backToStudyButton" type="button">返回学习区</button></header><div class="profile-page-body"><section class="profile-editor-panel"><p>Profile 页面正在加载，请刷新一次。</p></section></div>';
    container().appendChild(page);
    return page;
  }

  function showPage(route, options = {}) {
    const study = workspacePage();
    if (!study) return false;
    studentMode();
    const host = container();
    host.style.visibility = "visible";
    host.style.opacity = "1";

    if (route.pageId === "workspacePage") {
      hideLoading();
      PAGE_IDS.forEach((id) => { const page = $("#" + id); if (page) page.hidden = true; });
      study.hidden = false;
      study.removeAttribute("hidden");
      document.body.classList.remove("studybridge-route-mode", "study-sidebar-hidden", "studybridge-secondary-page", "studybridge-final-secondary");
      document.body.dataset.studybridgeActivePage = "workspacePage";
      setActive("workspacePage");
      remember("workspacePage");
      status("Workspace is ready.");
      return true;
    }

    let page = $("#" + route.pageId);
    if (!page && route.pageId === "profilePage") page = ensureProfileFallback();

    study.hidden = true;
    PAGE_IDS.forEach((id) => {
      const item = $("#" + id);
      if (item) item.hidden = true;
    });

    if (!page) {
      if (options.showLoading !== false) showLoading(route);
    } else {
      hideLoading();
      placePage(page);
      page.hidden = false;
      page.removeAttribute("hidden");
      page.style.display = "";
      page.style.visibility = "visible";
      page.style.opacity = "1";
    }

    document.body.classList.add("studybridge-route-mode", "study-sidebar-hidden", "studybridge-secondary-page");
    document.body.dataset.studybridgeActivePage = route.pageId;
    setActive(route.pageId);
    remember(route.pageId);
    status(route.title + " opened.");
    return true;
  }

  function scriptPath(src) { return new URL(src.split("?")[0], location.href).pathname; }
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
    try { await window[route.opener](); } catch (error) { console.warn("StudyBridge route opener failed", route.opener, error); }
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
      body.studybridge-route-mode .workspace{height:100vh!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f4f6f9!important}
      body.studybridge-route-mode #profilePage:not([hidden]),body.studybridge-route-mode #schoolCommunityPage:not([hidden]),body.studybridge-route-mode #classmatesPage:not([hidden]),body.studybridge-route-mode #emailReplyPage:not([hidden]),body.studybridge-route-mode #schedulePage:not([hidden]),body.studybridge-route-mode #${LOADING_ID}:not([hidden]){display:block!important;visibility:visible!important;opacity:1!important;min-height:100vh!important}
      .studybridge-route-empty{padding:28px;color:#58647a}.studybridge-route-loading{min-height:100vh;background:#f4f6f9}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyles();
    Object.keys(ROUTES).forEach((id) => { const button = $("#" + id); if (button && button.tagName === "BUTTON") button.type = "button"; });
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
  window.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") intercept(event); }, true);
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("#backToStudyButton,#routeBackToStudyButton,#backFromCommunityButton,#backFromClassmatesButton,#backFromEmailReplyButton,#backFromScheduleButton")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openRoute("openStudyAreaButton");
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  new MutationObserver(() => requestAnimationFrame(boot)).observe(document.documentElement, { childList: true, subtree: true });
})();
