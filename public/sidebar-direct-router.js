(() => {
  const VERSION = "20261007-clean-router-1.0.55";
  if (window.__studybridgeSidebarDirectRouter === VERSION) return;
  window.__studybridgeSidebarDirectRouter = VERSION;

  const featureIds = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const studyParts = [".topbar", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const routes = {
    profile: { id: "profilePage", opener: "studybridgeOpenProfilePage", scripts: ["/profile-page-patch.js?v=20261007-clean-router-1"] },
    community: { id: "schoolCommunityPage", opener: "studybridgeOpenCommunityPage", scripts: ["/school-community-patch.js?v=20261007-clean-router-1"] },
    classmates: { id: "classmatesPage", opener: "studybridgeOpenClassmatesPage", scripts: ["/classmates-request-patch.js?v=20261007-clean-router-1", "/classmate-chat-bubble-fix.js?v=20261007-clean-router-1", "/classmates-performance-patch.js?v=20261007-clean-router-1"] },
    email: { id: "emailReplyPage", opener: "studybridgeOpenEmailReplyPage", scripts: ["/email-reply-patch.js?v=20261007-clean-router-1"] },
    schedule: { id: "schedulePage", opener: "studybridgeOpenSchedulePage", scripts: ["/schedule-patch.js?v=20261007-clean-router-1", "/schedule-dashboard-patch.js?v=20261007-clean-router-1", "/schedule-notification-patch.js?v=20261007-clean-router-1"] },
    study: { id: "workspacePage" },
    developer: { id: "developerPanel" }
  };
  const aliases = {
    workspacePage: "study", study: "study", profilePage: "profile", profile: "profile",
    schoolCommunityPage: "community", communityPage: "community", community: "community",
    classmatesPage: "classmates", classmates: "classmates", emailReplyPage: "email", emailPage: "email", email: "email",
    schedulePage: "schedule", schedule: "schedule", developerPanel: "developer", developer: "developer",
    openProfilePageButton: "profile", editProfileButton: "profile", profileCard: "profile",
    openSchoolCommunityButton: "community", openClassmatesButton: "classmates", openEmailReplyButton: "email",
    openScheduleButton: "schedule", openStudyAreaButton: "study", studentViewButton: "study", creatorViewButton: "developer"
  };
  const navSelectors = [
    ["#profileCard, #openProfilePageButton, #editProfileButton, .profile-card", "profile"],
    ["#openSchoolCommunityButton, .community-entry", "community"],
    ["#openClassmatesButton, .classmates-entry", "classmates"],
    ["#openEmailReplyButton, .email-helper-entry", "email"],
    ["#openScheduleButton, .schedule-entry", "schedule"],
    ["#openStudyAreaButton, .study-entry", "study"],
    ["#studentViewButton, .student-mode-entry", "study"],
    ["#creatorViewButton, .developer-mode-entry", "developer"]
  ];
  const loadedScripts = new Map();
  let activeRoute = "";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const normalize = (routeName) => aliases[String(routeName || "").trim()] || String(routeName || "").trim();

  function workspace() {
    const page = $("#workspacePage") || $(".workspace");
    if (page && !page.id) page.id = "workspacePage";
    if (page) {
      page.hidden = false;
      page.removeAttribute("hidden");
      page.style.display = "block";
      page.style.visibility = "visible";
      page.style.opacity = "1";
    }
    return page;
  }

  function setStatus(message) {
    const status = $("#appStatus") || $("#statusLine");
    if (status) status.textContent = message;
  }

  function scriptPath(src) {
    try { return new URL(src, window.location.href).pathname; }
    catch { return String(src || "").split("?")[0]; }
  }

  function isScriptLoaded(src) {
    const path = scriptPath(src);
    return Array.from(document.scripts).some((script) => scriptPath(script.getAttribute("src") || "") === path);
  }

  function loadScript(src) {
    if (isScriptLoaded(src)) return Promise.resolve();
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(script);
    });
    loadedScripts.set(src, promise);
    return promise.catch((error) => { loadedScripts.delete(src); throw error; });
  }

  function hideFeaturePages(exceptId = "") {
    featureIds.forEach((id) => {
      const page = document.getElementById(id);
      if (!page) return;
      const visible = id === exceptId;
      page.hidden = !visible;
      if (visible) page.removeAttribute("hidden");
      page.style.display = visible ? "block" : "none";
      page.style.visibility = visible ? "visible" : "hidden";
      page.style.opacity = visible ? "1" : "";
    });
  }

  function setStudyVisible(visible) {
    const root = workspace();
    if (!root) return;
    studyParts.forEach((selector) => {
      const node = root.querySelector(`:scope > ${selector}`) || $(selector);
      if (!node) return;
      node.hidden = !visible;
      if (visible) node.removeAttribute("hidden");
      node.style.display = visible ? "" : "none";
      node.style.visibility = visible ? "visible" : "hidden";
    });
  }

  function hideFallback() {
    const mount = $("#routerFeatureMount");
    if (mount) {
      mount.hidden = true;
      mount.style.display = "none";
    }
  }

  function showFallback(routeName, message) {
    const root = workspace();
    if (!root) return false;
    let mount = $("#routerFeatureMount");
    if (!mount) {
      mount = document.createElement("section");
      mount.id = "routerFeatureMount";
      mount.className = "router-feature-mount";
      root.appendChild(mount);
    }
    hideFeaturePages("");
    setStudyVisible(false);
    mount.hidden = false;
    mount.style.display = "block";
    mount.innerHTML = `<div class="router-fallback-card"><p class="eyebrow">STUDYBRIDGE</p><h2>${escapeHtml(routeName)}</h2><p>${escapeHtml(message || "This page is still loading. Refresh once and try again.")}</p></div>`;
    return true;
  }

  function escapeHtml(value) {
    return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function setActiveButton(routeName) {
    navSelectors.forEach(([selector, route]) => {
      $$(selector).forEach((node) => {
        node.classList.toggle("active", route === routeName);
        if (route === routeName) node.setAttribute("aria-current", "page");
        else node.removeAttribute("aria-current");
      });
    });
    $("#studentViewButton")?.classList.toggle("active", routeName !== "developer");
    $("#creatorViewButton")?.classList.toggle("active", routeName === "developer");
  }

  function setFeatureVisible(routeName) {
    const route = routes[routeName];
    const root = workspace();
    const page = route?.id ? document.getElementById(route.id) : null;
    if (!root || !page) return false;
    if (page.parentElement !== root) root.appendChild(page);
    hideFeaturePages(route.id);
    setStudyVisible(false);
    const developer = $("#developerPanel");
    if (developer) { developer.hidden = true; developer.style.display = "none"; }
    page.hidden = false;
    page.removeAttribute("hidden");
    page.style.display = "block";
    page.style.visibility = "visible";
    page.style.opacity = "1";
    document.body.classList.add("studybridge-secondary-page");
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = route.id;
    return true;
  }

  function showStudy() {
    activeRoute = "study";
    hideFallback();
    workspace();
    hideFeaturePages("");
    setStudyVisible(true);
    const developer = $("#developerPanel");
    if (developer) { developer.hidden = true; developer.style.display = "none"; }
    document.body.classList.remove("studybridge-secondary-page", "creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = "workspacePage";
    setActiveButton("study");
    setStatus("Workspace is ready.");
    try { localStorage.setItem("studybridgeLastRoute", "study"); localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {}
    return true;
  }

  function showDeveloper() {
    activeRoute = "developer";
    hideFallback();
    const root = workspace();
    hideFeaturePages("");
    setStudyVisible(false);
    const panel = $("#developerPanel");
    if (!root || !panel) return showFallback("Developer", "Developer tools are not ready yet.");
    if (panel.parentElement !== root) root.appendChild(panel);
    panel.hidden = false;
    panel.removeAttribute("hidden");
    panel.style.display = "block";
    panel.style.visibility = "visible";
    panel.style.opacity = "1";
    document.body.classList.remove("studybridge-secondary-page");
    document.body.classList.add("creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = "developerPanel";
    setActiveButton("developer");
    setStatus("Developer console is open.");
    try { localStorage.setItem("studybridgeLastRoute", "developer"); localStorage.setItem("studybridgeWorkspaceMode", "creator"); } catch {}
    window.setTimeout(() => $("#refreshAdminButton")?.click(), 80);
    return true;
  }

  async function showFeature(routeName) {
    activeRoute = routeName;
    const route = routes[routeName];
    if (!route) return false;
    setStatus("Opening page...");
    hideFallback();
    workspace();
    setActiveButton(routeName);
    try {
      for (const src of route.scripts || []) await loadScript(src);
      if (typeof window[route.opener] === "function") await window[route.opener]();
      if (!setFeatureVisible(routeName)) showFallback(routeName, "This feature page could not be opened. Please refresh once and try again.");
      setStatus("Page opened.");
      try { localStorage.setItem("studybridgeLastRoute", routeName); localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {}
      return true;
    } catch (error) {
      console.error("[StudyBridge router]", error);
      showFallback(routeName, error.message || "This feature page could not be opened.");
      setStatus("Page failed to open.");
      return false;
    }
  }

  function openRoute(routeName) {
    const route = normalize(routeName);
    if (!routes[route]) return false;
    if (route === "study") return showStudy();
    if (route === "developer") return showDeveloper();
    showFeature(route);
    return true;
  }

  function routeFromText(text) {
    const value = String(text || "").replace(/\s+/g, "").toLowerCase();
    if (!value) return "";
    if (value.includes("社区") || value.includes("community")) return "community";
    if (value.includes("同学") || value.includes("classmates")) return "classmates";
    if (value.includes("邮件助手") || value.includes("email")) return "email";
    if (value.includes("时间表") || value.includes("schedule") || value.includes("deadline")) return "schedule";
    if (value.includes("学习区") || value.includes("study")) return "study";
    if (value.includes("开发者端")) return "developer";
    if (value.includes("普通用户端")) return "study";
    return "";
  }

  function routeFromTarget(target) {
    if (!target?.closest) return "";
    const node = target.closest(["[data-studybridge-route]", "#profileCard", "#openProfilePageButton", "#editProfileButton", "#openSchoolCommunityButton", "#openClassmatesButton", "#openEmailReplyButton", "#openScheduleButton", "#openStudyAreaButton", "#studentViewButton", "#creatorViewButton", ".profile-card", ".community-entry", ".classmates-entry", ".email-helper-entry", ".schedule-entry", ".study-entry", ".student-mode-entry", ".developer-mode-entry", ".role-switch button", ".role-switch-button"].join(","));
    if (!node) return "";
    const declared = normalize(node.dataset?.studybridgeRoute);
    if (declared && routes[declared]) return declared;
    if (node.id && aliases[node.id]) return aliases[node.id];
    for (const [selector, route] of navSelectors) if (node.matches(selector) || node.closest(selector)) return route;
    return routeFromText(node.textContent || "");
  }

  function handleNavigate(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  function decorateNavigation() {
    navSelectors.forEach(([selector, route]) => {
      $$(selector).forEach((node) => {
        node.dataset.studybridgeRoute = route;
        node.style.cursor = "pointer";
        if (node.tagName !== "BUTTON") node.setAttribute("role", "button");
        if (!node.hasAttribute("tabindex") && node.tagName !== "BUTTON") node.setAttribute("tabindex", "0");
      });
    });
    setActiveButton(activeRoute || normalize(document.body.dataset.studybridgeActivePage) || "study");
  }

  function installStyles() {
    if ($("#studybridgeCleanRouterStyles")) return;
    const style = document.createElement("style");
    style.id = "studybridgeCleanRouterStyles";
    style.textContent = `
      html, body { scroll-behavior:auto !important; }
      .sidebar, #sidebar, .app-sidebar { overflow-y:auto !important; overscroll-behavior:contain !important; scroll-behavior:auto !important; -webkit-overflow-scrolling:touch; }
      #workspacePage, .workspace { min-height:100dvh; overflow-x:hidden; }
      body.studybridge-secondary-page #workspacePage { display:block !important; height:auto !important; min-height:100dvh !important; overflow-y:auto !important; }
      .router-feature-mount { padding:32px; }
      .router-fallback-card { max-width:560px; margin:40px auto; padding:24px; border:1px solid #d7e0ec; border-radius:8px; background:#fff; }
      .router-fallback-card .eyebrow { margin:0 0 8px; font-size:12px; font-weight:800; color:#237a63; }
      .router-fallback-card h2 { margin:0 0 8px; }
    `;
    document.head.appendChild(style);
  }

  function restoreRoute() {
    let route = "";
    try {
      route = localStorage.getItem("studybridgeLastRoute") || "";
      const mode = localStorage.getItem("studybridgeWorkspaceMode") || "";
      if (!route && mode === "creator") route = "developer";
    } catch {}
    route = normalize(route || document.body.dataset.studybridgeActivePage || "study");
    if (!routes[route]) route = "study";
    if (route === "developer" && !(document.querySelector("#roleSwitch") && !document.querySelector("#roleSwitch").hidden)) route = "study";
    openRoute(route);
  }

  function init() {
    installStyles();
    decorateNavigation();
    document.addEventListener("click", handleNavigate, true);
    document.addEventListener("pointerup", handleNavigate, true);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const route = routeFromTarget(event.target);
      if (!route) return;
      event.preventDefault();
      openRoute(route);
    }, true);
    window.studybridgeDirectOpen = openRoute;
    window.studybridgeOpenStudentPage = openRoute;
    window.studybridgeMasterOpen = openRoute;
    window.studybridgeShowStudy = showStudy;
    window.setTimeout(decorateNavigation, 100);
    window.setTimeout(decorateNavigation, 800);
    window.setTimeout(restoreRoute, 120);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
