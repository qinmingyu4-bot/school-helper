(() => {
  const VERSION = "20261007-master-nav-3";
  if (window.__studybridgeStudentNavigationMaster === VERSION) return;
  window.__studybridgeStudentNavigationMaster = VERSION;

  const featureIds = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const studyPieces = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const loadedScripts = new Map();
  let activeToken = 0;

  const routes = {
    profile: { id: "profilePage", title: "Profile", selectors: ["#profileCard", "#editProfileButton", "#openProfilePageButton"], scripts: ["/profile-page-patch.js?v=20261007-master-nav-3"], opener: "studybridgeOpenProfilePage" },
    community: { id: "schoolCommunityPage", title: "社区", selectors: ["#openSchoolCommunityButton", ".community-entry"], scripts: ["/school-community-patch.js?v=20261007-master-nav-3"], opener: "studybridgeOpenCommunityPage" },
    classmates: { id: "classmatesPage", title: "同学", selectors: ["#openClassmatesButton", ".classmates-entry"], scripts: ["/classmates-request-patch.js?v=20261007-master-nav-3", "/classmate-chat-bubble-fix.js?v=20261007-master-nav-3", "/classmates-performance-patch.js?v=20261007-master-nav-3"], opener: "studybridgeOpenClassmatesPage" },
    email: { id: "emailReplyPage", title: "邮件助手", selectors: ["#openEmailReplyButton", ".email-helper-entry"], scripts: ["/email-reply-patch.js?v=20261007-master-nav-3"], opener: "studybridgeOpenEmailReplyPage" },
    schedule: { id: "schedulePage", title: "时间表", selectors: ["#openScheduleButton", ".schedule-entry"], scripts: ["/schedule-patch.js?v=20261007-master-nav-3", "/schedule-dashboard-patch.js?v=20261007-master-nav-3", "/schedule-notification-patch.js?v=20261007-master-nav-3"], opener: "studybridgeOpenSchedulePage" },
    study: { id: "workspacePage", title: "学习区", selectors: ["#openStudyAreaButton", ".study-entry"] },
    developer: { id: "developerPanel", title: "开发者端", selectors: ["#creatorViewButton"] }
  };

  const sidebarItems = [
    ["community", "社", "社区", "全部、学校和专业频道"],
    ["classmates", "友", "同学", "SB ID 申请和聊天"],
    ["email", "信", "邮件助手", "理解邮件并生成英文回复"],
    ["schedule", "时", "时间表", "Deadline 和课程提醒"],
    ["study", "学", "学习区", "课程资料、AI 对话和复习计划"]
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function appOpen() {
    const app = $("#appShell");
    return Boolean(app && !app.hidden);
  }

  function workspace() {
    const root = $("#workspacePage") || $(".workspace");
    if (root && !root.id) root.id = "workspacePage";
    return root;
  }

  function shell() {
    const root = workspace();
    if (!root) return null;
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";
    root.style.opacity = "1";
    return root;
  }

  function setStatus(text) {
    const line = $("#statusLine");
    if (line) line.textContent = text;
  }

  function mark(routeName) {
    Object.entries(routes).forEach(([name, route]) => {
      route.selectors.forEach((selector) => $$(selector).forEach((node) => {
        if (node.id === "profileCard" || node.id === "editProfileButton") return;
        const active = name === routeName;
        node.classList.toggle("active", active);
        node.setAttribute("aria-current", active ? "page" : "false");
      }));
    });
  }

  function hideFeaturePages(exceptId = "") {
    featureIds.forEach((id) => {
      const page = $(`#${id}`);
      if (!page) return;
      const show = id === exceptId;
      page.hidden = !show;
      page.style.display = show ? "" : "none";
      page.style.visibility = show ? "visible" : "hidden";
    });
  }

  function setStudyHidden(hidden, keepDeveloper = false) {
    const root = workspace();
    if (!root) return;
    studyPieces.forEach((selector) => {
      const node = root.querySelector(`:scope > ${selector}`);
      if (!node || (keepDeveloper && selector === "#developerPanel")) return;
      node.hidden = hidden;
      node.style.display = hidden ? "none" : "";
      node.style.visibility = hidden ? "hidden" : "visible";
    });
  }

  function showStudy() {
    if (!shell()) return false;
    hideFeaturePages();
    setStudyHidden(false);
    const developerPanel = $("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = "workspacePage";
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
    mark("study");
    setStatus("Workspace is ready.");
    return true;
  }

  function showDeveloper() {
    if (!shell()) return false;
    hideFeaturePages();
    setStudyHidden(true, true);
    const panel = $("#developerPanel");
    if (!panel) return false;
    panel.hidden = false;
    panel.removeAttribute("hidden");
    panel.style.display = "";
    panel.style.visibility = "visible";
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.classList.add("creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = "developerPanel";
    $("#studentViewButton")?.classList.remove("active");
    $("#creatorViewButton")?.classList.add("active");
    mark("developer");
    setStatus("开发者端已打开。");
    setTimeout(() => $("#refreshAdminButton")?.click(), 100);
    return true;
  }

  function hasPageContent(id) {
    const page = $(`#${id}`);
    if (!page) return false;
    return Boolean(page.querySelector("input, textarea, select, button, article, section, .topbar")) || String(page.textContent || "").trim().length > 4;
  }

  function showFeature(routeName) {
    const route = routes[routeName];
    const root = shell();
    const page = route && $(`#${route.id}`);
    if (!route || !root || !page || !hasPageContent(route.id)) return false;
    if (page.parentElement !== root) root.appendChild(page);
    setStudyHidden(true);
    hideFeaturePages(route.id);
    page.hidden = false;
    page.removeAttribute("hidden");
    page.style.display = "";
    page.style.visibility = "visible";
    page.style.opacity = "1";
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.dataset.studybridgeActivePage = route.id;
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
    mark(routeName);
    setStatus(`${route.title} opened.`);
    return true;
  }

  function fallback(routeName) {
    const route = routes[routeName];
    const root = shell();
    if (!route || !root) return;
    let page = $(`#${route.id}`);
    if (!page) {
      page = document.createElement("section");
      page.id = route.id;
      root.appendChild(page);
    }
    page.className = `feature-page fallback-page ${routeName}-page`;
    page.innerHTML = `<header class="topbar"><div><p class="eyebrow">StudyBridge</p><h2>${route.title}</h2><span>页面入口已打开，内容正在重新加载。</span></div><button class="ghost-button" type="button" data-master-study>返回学习区</button></header><div class="fallback-body">如果一直看到这段文字，请刷新一次页面。</div>`;
  }

  function scriptPath(src) {
    try { return new URL(src.split("?")[0], location.href).pathname; } catch { return src.split("?")[0]; }
  }

  function scriptPresent(src) {
    const path = scriptPath(src);
    return Array.from(document.scripts).some((script) => scriptPath(script.getAttribute("src") || "") === path);
  }

  function loadScript(src) {
    const key = scriptPath(src);
    if (loadedScripts.has(key)) return loadedScripts.get(key);
    if (scriptPresent(src)) {
      const promise = sleep(120);
      loadedScripts.set(key, promise);
      return promise;
    }
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
      setTimeout(resolve, 2500);
    });
    loadedScripts.set(key, promise);
    return promise;
  }

  async function callOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return false;
    try {
      await window[route.opener]();
      return true;
    } catch (error) {
      console.warn("StudyBridge opener failed", route.opener, error);
      return false;
    }
  }

  async function openRoute(routeName) {
    if (!routes[routeName] || !appOpen()) return false;
    const route = routes[routeName];
    const token = ++activeToken;
    if (routeName === "study") return showStudy();
    if (routeName === "developer") return showDeveloper();
    setStatus(`Opening ${route.title}...`);
    shell();
    await Promise.all((route.scripts || []).map(loadScript));
    if (token !== activeToken) return false;
    for (const delay of [0, 80, 180, 360, 720, 1100]) {
      if (delay) await sleep(delay);
      await callOpener(route);
      if (showFeature(routeName)) return true;
    }
    fallback(routeName);
    return showFeature(routeName);
  }

  function routeFromText(text) {
    const value = String(text || "");
    if (value.includes("社区")) return "community";
    if (value.includes("同学") || value.includes("SB ID")) return "classmates";
    if (value.includes("邮件助手")) return "email";
    if (value.includes("时间表") || value.includes("Deadline")) return "schedule";
    if (value.includes("学习区") || value.includes("Academic Coach")) return "study";
    if (value.includes("开发者端") || value.includes("Creator")) return "developer";
    return "";
  }

  function routeFromTarget(target) {
    const node = target?.closest?.("button, .profile-card, .community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .study-entry, .role-switch-button");
    if (!node) return "";
    if (node.dataset.studybridgeRoute) return node.dataset.studybridgeRoute;
    for (const [name, route] of Object.entries(routes)) {
      if (route.selectors.some((selector) => node.matches(selector) || node.closest(selector))) return name;
    }
    return routeFromText(node.textContent);
  }

  function onNavigate(event) {
    const routeName = routeFromTarget(event.target);
    if (!routeName) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(routeName);
  }

  function createButton(routeName, icon, title, subtitle) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = { community: "openSchoolCommunityButton", classmates: "openClassmatesButton", email: "openEmailReplyButton", schedule: "openScheduleButton", study: "openStudyAreaButton" }[routeName];
    button.className = routeName === "email" ? "email-helper-entry" : `${routeName}-entry`;
    button.dataset.studybridgeRoute = routeName;
    button.innerHTML = `<span class="nav-icon">${icon}</span><span><strong>${title}</strong><small>${subtitle}</small></span>`;
    return button;
  }

  function ensureSidebar() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    let anchor = $("#profileCard");
    sidebarItems.forEach(([routeName, icon, title, subtitle]) => {
      const route = routes[routeName];
      if (!$(route.selectors[0])) anchor?.insertAdjacentElement("afterend", createButton(routeName, icon, title, subtitle));
      const found = $(route.selectors[0]);
      if (found) anchor = found;
    });
    Object.entries(routes).forEach(([routeName, route]) => route.selectors.forEach((selector) => $$(selector).forEach((node) => {
      node.dataset.studybridgeRoute = routeName;
      node.style.cursor = "pointer";
      node.style.pointerEvents = "auto";
      if (node.tagName === "BUTTON") node.type = "button";
    })));
  }

  function installStyle() {
    if ($("#studybridge-master-nav-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-master-nav-style";
    style.textContent = `
      .sidebar [data-studybridge-route] { cursor:pointer !important; pointer-events:auto !important; }
      .sidebar [data-studybridge-route] * { pointer-events:none !important; }
      .community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton { display:grid !important; grid-template-columns:34px minmax(0,1fr) !important; align-items:center !important; gap:10px !important; width:100% !important; min-height:52px !important; padding:9px 12px !important; border:1px solid var(--line) !important; border-radius:8px !important; background:#fff !important; color:var(--navy) !important; text-align:left !important; }
      .community-entry.active,.classmates-entry.active,.email-helper-entry.active,.schedule-entry.active,.study-entry.active,#openSchoolCommunityButton.active,#openClassmatesButton.active,#openEmailReplyButton.active,#openScheduleButton.active,#openStudyAreaButton.active { border-color:var(--green) !important; }
      .nav-icon,.community-entry-icon,.classmates-entry-icon,.email-helper-entry-icon,.schedule-entry-icon,.study-entry-icon { display:grid !important; place-items:center !important; width:34px !important; height:34px !important; border-radius:8px !important; background:linear-gradient(145deg,#1f3a5f,#2f7d62) !important; color:#fff !important; font-weight:900 !important; line-height:1 !important; }
      .community-entry strong,.classmates-entry strong,.email-helper-entry strong,.schedule-entry strong,.study-entry strong { display:block !important; font-size:14px !important; line-height:1.15 !important; color:var(--navy) !important; }
      .community-entry small,.classmates-entry small,.email-helper-entry small,.schedule-entry small,.study-entry small { display:block !important; color:var(--muted) !important; font-size:12px !important; line-height:1.2 !important; white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; }
      body.studybridge-secondary-page .workspace, body.studybridge-secondary-page #workspacePage { display:block !important; min-height:100dvh !important; height:auto !important; overflow-y:auto !important; background:#f4f6f9 !important; }
      body.studybridge-secondary-page #profilePage:not([hidden]), body.studybridge-secondary-page #schoolCommunityPage:not([hidden]), body.studybridge-secondary-page #classmatesPage:not([hidden]), body.studybridge-secondary-page #emailReplyPage:not([hidden]), body.studybridge-secondary-page #schedulePage:not([hidden]) { display:block !important; visibility:visible !important; opacity:1 !important; }
      .fallback-page { min-height:100dvh; background:#f4f6f9; }
      .fallback-body { margin:24px 28px 72px; padding:18px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyle();
    ensureSidebar();
    setTimeout(ensureSidebar, 250);
    setTimeout(ensureSidebar, 1000);
  }

  window.studybridgeMasterOpen = openRoute;
  window.studybridgeDirectOpen = openRoute;
  window.studybridgeOpenMainPage = openRoute;
  window.studybridgeShowStudy = showStudy;
  window.addEventListener("pointerup", onNavigate, true);
  window.addEventListener("click", onNavigate, true);
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-master-study]")) {
      event.preventDefault();
      showStudy();
    }
  }, true);
  new MutationObserver(() => requestAnimationFrame(ensureSidebar)).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
