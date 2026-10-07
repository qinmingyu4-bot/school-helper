(() => {
  const VERSION = "20261007-force-1";
  if (window.__studybridgeSidebarForceRouter === VERSION) return;
  window.__studybridgeSidebarForceRouter = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const STUDY_PARTS = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const SECONDARY_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const loadedScripts = new Map();
  let token = 0;

  const ROUTES = {
    openStudyAreaButton: { pageId: "workspacePage", title: "Study area" },
    openProfilePageButton: {
      pageId: "profilePage",
      title: "Profile",
      opener: "studybridgeOpenStudentPage",
      openerArg: "profilePage",
      scripts: ["/student-page-shell-fix.js?v=20261007-force-1"]
    },
    editProfileButton: {
      pageId: "profilePage",
      title: "Profile",
      opener: "studybridgeOpenStudentPage",
      openerArg: "profilePage",
      scripts: ["/student-page-shell-fix.js?v=20261007-force-1"]
    },
    profileCard: {
      pageId: "profilePage",
      title: "Profile",
      opener: "studybridgeOpenStudentPage",
      openerArg: "profilePage",
      scripts: ["/student-page-shell-fix.js?v=20261007-force-1"]
    },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      title: "Community",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-force-1"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      title: "Classmates",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-force-1",
        "/classmates-request-patch.js?v=20261007-force-1",
        "/classmate-chat-bubble-fix.js?v=20261007-force-1",
        "/classmates-performance-patch.js?v=20261007-force-1"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      title: "Email assistant",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-force-1"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      title: "Schedule",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-force-1",
        "/schedule-dashboard-patch.js?v=20261007-force-1",
        "/schedule-notification-patch.js?v=20261007-force-1"
      ]
    }
  };

  const TEXT_ROUTES = [
    { id: "openSchoolCommunityButton", patterns: ["\u793e\u533a", "\u5b66\u6821\u793e\u533a", "Community"] },
    { id: "openClassmatesButton", patterns: ["\u540c\u5b66", "SB ID", "Classmates"] },
    { id: "openEmailReplyButton", patterns: ["\u90ae\u4ef6\u52a9\u624b", "Email"] },
    { id: "openScheduleButton", patterns: ["\u65f6\u95f4\u8868", "Schedule", "deadline"] },
    { id: "openStudyAreaButton", patterns: ["\u5b66\u4e60\u533a", "Academic Coach", "AI"] }
  ];

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function appOpen() {
    const shell = $("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function workspace() {
    return $("#workspacePage") || $(".workspace");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function routeFromText(text) {
    const value = cleanText(text);
    if (!value || value.length > 140) return "";
    return TEXT_ROUTES.find((route) => route.patterns.some((pattern) => value.includes(pattern)))?.id || "";
  }

  function routeFromEvent(event) {
    const exact = event.target.closest?.(
      "#openStudyAreaButton, #openProfilePageButton, #editProfileButton, #profileCard, #openSchoolCommunityButton, #openClassmatesButton, #openEmailReplyButton, #openScheduleButton"
    );
    if (exact?.id && ROUTES[exact.id]) return exact.id;
    if (exact?.id === "profileCard") return "profileCard";

    const dataRoute = event.target.closest?.("[data-studybridge-route]");
    const dataId = dataRoute?.dataset?.studybridgeRoute;
    if (dataId && ROUTES[dataId]) return dataId;

    const sidebar = $(".sidebar");
    if (!sidebar || !event.target.closest?.(".sidebar")) return "";
    let node = event.target.nodeType === Node.ELEMENT_NODE ? event.target : event.target.parentElement;
    while (node && node !== sidebar && node !== document.body) {
      if (node.closest?.("form, input, textarea, select")) return "";
      if (node.matches?.("button, a, [role='button'], .profile-card, .study-entry, .community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .panel, section, article, div")) {
        const routeId = routeFromText(node.textContent);
        if (routeId) return routeId;
      }
      node = node.parentElement;
    }
    return "";
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // localStorage can be blocked; navigation still works.
    }
  }

  function clearGuards() {
    document.documentElement.classList.remove("studybridge-restore-pending");
    document.body.classList.remove("studybridge-restore-pending", "creator-clean-mode", "admin-boundary-active");
    const root = workspace();
    if (root) {
      root.hidden = false;
      root.removeAttribute("hidden");
      root.style.display = "";
      root.style.visibility = "visible";
      root.style.opacity = "1";
    }
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

  function hideSecondary(exceptId = "") {
    SECONDARY_PAGES.forEach((id) => {
      const page = $(`#${id}`);
      if (!page) return;
      page.hidden = id !== exceptId;
      if (id === exceptId) {
        page.removeAttribute("hidden");
        page.style.display = "";
        page.style.visibility = "visible";
        page.style.opacity = "1";
      }
    });
  }

  function setActive(pageId) {
    Object.entries(ROUTES).forEach(([id, route]) => {
      const button = $(`#${id}`);
      if (!button) return;
      button.classList.toggle("active", route.pageId === pageId);
      button.setAttribute("aria-current", route.pageId === pageId ? "page" : "false");
    });
  }

  function setStatus(text) {
    const line = $("#statusLine");
    if (line) line.textContent = text;
  }

  function showStudy() {
    clearGuards();
    setStudyVisible(true);
    hideSecondary("");
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-nav-hotfix-page");
    document.body.dataset.studybridgeActivePage = "workspacePage";
    setActive("workspacePage");
    remember("workspacePage");
    setStatus("Workspace is ready.");
  }

  function showLoading(route) {
    const root = workspace();
    if (!root) return;
    let loading = $("#studybridgeForceRouteLoading");
    if (!loading) {
      loading = document.createElement("section");
      loading.id = "studybridgeForceRouteLoading";
      loading.className = "studybridge-route-loading";
      root.appendChild(loading);
    }
    loading.innerHTML = `<div class="route-loading-card">Opening ${route.title}...</div>`;
    clearGuards();
    setStudyVisible(false);
    hideSecondary("");
    loading.hidden = false;
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-nav-hotfix-page");
    document.body.dataset.studybridgeActivePage = route.pageId;
    setActive(route.pageId);
    remember(route.pageId);
  }

  function hideLoading() {
    const loading = $("#studybridgeForceRouteLoading");
    if (loading) loading.hidden = true;
  }

  function showPage(route) {
    const root = workspace();
    const page = $(`#${route.pageId}`);
    if (!root || !page) return false;
    clearGuards();
    if (page.parentElement !== root) root.appendChild(page);
    setStudyVisible(false);
    hideSecondary(route.pageId);
    hideLoading();
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-nav-hotfix-page");
    document.body.dataset.studybridgeActivePage = route.pageId;
    setActive(route.pageId);
    remember(route.pageId);
    setStatus(`${route.title} opened.`);
    return true;
  }

  function scriptKey(src) {
    return new URL(src.split("?")[0], location.href).pathname;
  }

  function hasScript(src) {
    const key = scriptKey(src);
    return Array.from(document.scripts).some((script) => {
      const current = script.getAttribute("src");
      return current && new URL(current, location.href).pathname === key;
    });
  }

  function loadScript(src, opener) {
    if (opener && typeof window[opener] === "function") return Promise.resolve();
    const key = scriptKey(src);
    if (loadedScripts.has(key)) return loadedScripts.get(key);
    if (hasScript(src)) return Promise.resolve();
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 1800);
    });
    loadedScripts.set(key, promise);
    return promise;
  }

  async function callOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return;
    const args = Object.prototype.hasOwnProperty.call(route, "openerArg") ? [route.openerArg] : [];
    try {
      await window[route.opener](...args);
    } catch (error) {
      console.warn("StudyBridge force router opener failed:", error);
    }
  }

  async function openRoute(id) {
    const route = ROUTES[id];
    if (!route || !appOpen()) return;
    const currentToken = ++token;
    if (route.pageId === "workspacePage") {
      showStudy();
      return;
    }

    if (!showPage(route)) showLoading(route);
    await Promise.all((route.scripts || []).map((src) => loadScript(src, route.opener)));
    if (currentToken !== token) return;
    await callOpener(route);

    for (const delay of [0, 80, 180, 360, 700, 1200]) {
      if (currentToken !== token) return;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (showPage(route)) return;
    }
    setStatus(`${route.title} could not open. Try refreshing once.`);
  }

  function intercept(event) {
    const routeId = routeFromEvent(event);
    if (!routeId || !appOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(routeId);
  }

  function keyIntercept(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    intercept(event);
  }

  function decorate() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    sidebar.querySelectorAll("button, a, [role='button'], .profile-card, .study-entry, .community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .panel, section, article, div").forEach((element) => {
      if (element.closest("form, input, textarea, select")) return;
      if (element.id && ROUTES[element.id]) element.dataset.studybridgeRoute = element.id;
      else if (element.id === "profileCard") element.dataset.studybridgeRoute = "profileCard";
      else {
        const routeId = routeFromText(element.textContent);
        if (routeId) element.dataset.studybridgeRoute = routeId;
      }
      if (element.dataset.studybridgeRoute) {
        element.style.cursor = "pointer";
        element.style.pointerEvents = "auto";
      }
    });
  }

  window.studybridgeForceOpenRoute = openRoute;
  window.addEventListener("pointerup", intercept, true);
  window.addEventListener("mouseup", intercept, true);
  window.addEventListener("touchend", intercept, true);
  window.addEventListener("keydown", keyIntercept, true);

  const style = document.createElement("style");
  style.id = "studybridge-force-router-style";
  style.textContent = `
    .sidebar [data-studybridge-route] { cursor: pointer !important; pointer-events: auto !important; }
    .sidebar [data-studybridge-route] > :not(input):not(textarea):not(select):not(button) { pointer-events: none !important; }
    #studybridgeForceRouteLoading:not([hidden]) { display: block !important; min-height: 100dvh; padding: 28px; background: #f4f6f9; }
  `;
  document.head.appendChild(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorate, { once: true });
  else decorate();
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(document.documentElement, { childList: true, subtree: true });
})();
