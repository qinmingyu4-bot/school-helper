(() => {
  const VERSION = "20261007-master-nav-4";
  if (window.__studybridgeStudentNavigationMaster === VERSION) return;
  window.__studybridgeStudentNavigationMaster = VERSION;

  const featureIds = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const studyPieces = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const scriptsLoaded = new Map();
  let activeToken = 0;

  const routes = {
    profile: {
      id: "profilePage",
      selectors: ["#profileCard", "#editProfileButton", "#openProfilePageButton"],
      scripts: ["/profile-page-patch.js?v=20261007-master-nav-3"],
      opener: "studybridgeOpenProfilePage",
      title: "Profile"
    },
    community: {
      id: "schoolCommunityPage",
      selectors: ["#openSchoolCommunityButton", ".community-entry"],
      scripts: ["/school-community-patch.js?v=20261007-master-nav-3"],
      opener: "studybridgeOpenCommunityPage",
      title: "\u793e\u533a"
    },
    classmates: {
      id: "classmatesPage",
      selectors: ["#openClassmatesButton", ".classmates-entry"],
      scripts: [
        "/classmates-request-patch.js?v=20261007-master-nav-3",
        "/classmate-chat-bubble-fix.js?v=20261007-master-nav-3",
        "/classmates-performance-patch.js?v=20261007-master-nav-3"
      ],
      opener: "studybridgeOpenClassmatesPage",
      title: "\u540c\u5b66"
    },
    email: {
      id: "emailReplyPage",
      selectors: ["#openEmailReplyButton", ".email-helper-entry"],
      scripts: ["/email-reply-patch.js?v=20261007-master-nav-3"],
      opener: "studybridgeOpenEmailReplyPage",
      title: "\u90ae\u4ef6\u52a9\u624b"
    },
    schedule: {
      id: "schedulePage",
      selectors: ["#openScheduleButton", ".schedule-entry"],
      scripts: [
        "/schedule-patch.js?v=20261007-master-nav-3",
        "/schedule-dashboard-patch.js?v=20261007-master-nav-3",
        "/schedule-notification-patch.js?v=20261007-master-nav-3"
      ],
      opener: "studybridgeOpenSchedulePage",
      title: "\u65f6\u95f4\u8868"
    },
    study: {
      id: "workspacePage",
      selectors: ["#openStudyAreaButton", ".study-entry"],
      title: "\u5b66\u4e60\u533a"
    },
    developer: {
      id: "developerPanel",
      selectors: ["#creatorViewButton"],
      title: "\u5f00\u53d1\u8005\u7aef"
    }
  };

  const routeAliases = {
    openProfilePageButton: "profile",
    editProfileButton: "profile",
    profileCard: "profile",
    profilePage: "profile",
    openSchoolCommunityButton: "community",
    schoolCommunityPage: "community",
    communityPage: "community",
    openClassmatesButton: "classmates",
    classmatesPage: "classmates",
    openEmailReplyButton: "email",
    emailReplyPage: "email",
    emailPage: "email",
    openScheduleButton: "schedule",
    schedulePage: "schedule",
    openStudyAreaButton: "study",
    workspacePage: "study",
    studentViewButton: "study",
    creatorViewButton: "developer",
    developerPanel: "developer"
  };

  const sidebarItems = [
    ["community", "\u793e", "\u793e\u533a", "\u5168\u90e8\u3001\u5b66\u6821\u548c\u4e13\u4e1a\u9891\u9053"],
    ["classmates", "\u53cb", "\u540c\u5b66", "SB ID \u7533\u8bf7\u548c\u804a\u5929"],
    ["email", "\u4fe1", "\u90ae\u4ef6\u52a9\u624b", "\u7406\u89e3\u90ae\u4ef6\u5e76\u751f\u6210\u82f1\u6587\u56de\u590d"],
    ["schedule", "\u65f6", "\u65f6\u95f4\u8868", "Deadline \u548c\u8bfe\u7a0b\u63d0\u9192"],
    ["study", "\u5b66", "\u5b66\u4e60\u533a", "\u8bfe\u7a0b\u8d44\u6599\u3001AI \u5bf9\u8bdd\u548c\u590d\u4e60\u8ba1\u5212"]
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function shell() {
    const app = $("#appShell");
    const workspace = $(".workspace") || $("#workspacePage");
    if (app) {
      app.hidden = false;
      app.style.display = "";
      app.style.visibility = "visible";
    }
    if (workspace) {
      workspace.hidden = false;
      workspace.style.display = "";
      workspace.style.visibility = "visible";
      workspace.style.opacity = "1";
    }
    return workspace;
  }

  function setStatus(text) {
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function normalizeRoute(routeName) {
    const key = String(routeName || "").trim();
    if (!key) return "";
    return routes[key] ? key : (routeAliases[key] || "");
  }

  function hideFeatures(exceptId = "") {
    featureIds.forEach((id) => {
      const node = $(`#${id}`);
      if (!node) return;
      const show = id === exceptId;
      node.hidden = !show;
      node.style.display = show ? "" : "none";
      node.style.visibility = show ? "visible" : "hidden";
    });
  }

  function setStudyHidden(hidden, keepDeveloper = false) {
    const page = $("#workspacePage");
    if (!page) return;
    studyPieces.forEach((selector) => {
      const node = page.querySelector(`:scope > ${selector}`);
      if (!node || (keepDeveloper && selector === "#developerPanel")) return;
      node.hidden = hidden;
      node.style.display = hidden ? "none" : "";
      node.style.visibility = hidden ? "hidden" : "visible";
    });
  }

  function mark(routeName) {
    Object.values(routes).flatMap((route) => route.selectors).forEach((selector) => {
      $$(selector).forEach((node) => {
        if (node.id === "profileCard" || node.id === "editProfileButton") return;
        node.classList.remove("active");
        node.removeAttribute("aria-current");
      });
    });
    (routes[routeName]?.selectors || []).forEach((selector) => {
      $$(selector).forEach((node) => {
        if (node.id === "profileCard" || node.id === "editProfileButton") return;
        node.classList.add("active");
        node.setAttribute("aria-current", "page");
      });
    });
  }

  function showStudy() {
    shell();
    hideFeatures();
    setStudyHidden(false);
    const developer = $("#developerPanel");
    if (developer) developer.hidden = true;
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = "workspacePage";
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
    mark("study");
    setStatus("Workspace is ready.");
    return true;
  }

  function showDeveloper() {
    shell();
    hideFeatures();
    setStudyHidden(true, true);
    const panel = $("#developerPanel");
    if (!panel) return false;
    panel.hidden = false;
    panel.style.display = "";
    panel.style.visibility = "visible";
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.classList.add("creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = "developerPanel";
    $("#studentViewButton")?.classList.remove("active");
    $("#creatorViewButton")?.classList.add("active");
    mark("developer");
    setStatus("\u5f00\u53d1\u8005\u7aef\u5df2\u6253\u5f00\u3002");
    setTimeout(() => $("#refreshAdminButton")?.click(), 80);
    return true;
  }

  function pageHasContent(id) {
    const page = $(`#${id}`);
    if (!page) return false;
    return Boolean(page.querySelector("input, textarea, select, button, article, section, .topbar")) ||
      String(page.textContent || "").trim().length > 4;
  }

  function showFeature(routeName) {
    const route = routes[routeName];
    const page = route && $(`#${route.id}`);
    if (!route || !page || !pageHasContent(route.id)) return false;
    shell();
    setStudyHidden(true);
    hideFeatures(route.id);
    page.hidden = false;
    if (page.parentElement !== $("#workspacePage")) $("#workspacePage")?.appendChild(page);
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

  function ensureFallback(routeName, reason = "") {
    const route = routes[routeName];
    const workspace = shell();
    if (!route || !workspace) return;
    let page = $(`#${route.id}`);
    if (!page) {
      page = document.createElement("section");
      page.id = route.id;
      workspace.appendChild(page);
    }
    page.className = `feature-page fallback-page ${routeName}-page`;
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">StudyBridge</p>
          <h2>${route.title}</h2>
          <span>${reason || "\u8fd9\u4e2a\u9875\u9762\u6b63\u5728\u6062\u590d\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0\u3002"}</span>
        </div>
        <button class="ghost-button" type="button" data-master-study>\u8fd4\u56de\u5b66\u4e60\u533a</button>
      </header>
      <div class="fallback-body">\u5982\u679c\u4f60\u770b\u5230\u8fd9\u4e00\u9875\uff0c\u8bf4\u660e\u529f\u80fd\u5165\u53e3\u5df2\u6253\u5f00\uff0c\u4f46\u9875\u9762\u5185\u5bb9\u8fd8\u9700\u8981\u91cd\u65b0\u52a0\u8f7d\u3002</div>
    `;
  }

  function scriptKey(src) {
    try {
      return new URL(src.split("?")[0], location.href).pathname;
    } catch {
      return src.split("?")[0];
    }
  }

  function isScriptPresent(src) {
    const key = scriptKey(src);
    return Array.from(document.scripts).some((script) => scriptKey(script.getAttribute("src") || "") === key);
  }

  function loadScript(src) {
    const key = scriptKey(src);
    if (scriptsLoaded.has(key)) return scriptsLoaded.get(key);
    if (isScriptPresent(src)) {
      const existing = sleep(120);
      scriptsLoaded.set(key, existing);
      return existing;
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
    scriptsLoaded.set(key, promise);
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
    routeName = normalizeRoute(routeName);
    const route = routes[routeName];
    if (!route) return false;
    const token = ++activeToken;
    if (routeName === "study") return showStudy();
    if (routeName === "developer") return showDeveloper();

    setStatus(`Opening ${route.title}...`);
    shell();
    await Promise.all((route.scripts || []).map(loadScript));
    if (token !== activeToken) return false;

    for (const delay of [0, 80, 180, 350, 700, 1100]) {
      if (delay) await sleep(delay);
      await callOpener(route);
      if (showFeature(routeName)) return true;
    }

    ensureFallback(routeName);
    return showFeature(routeName);
  }

  function routeFromText(text) {
    if (text.includes("\u793e\u533a")) return "community";
    if (text.includes("\u540c\u5b66") || text.includes("SB ID \u7533\u8bf7")) return "classmates";
    if (text.includes("\u90ae\u4ef6\u52a9\u624b")) return "email";
    if (text.includes("\u65f6\u95f4\u8868") || text.includes("Deadline")) return "schedule";
    if (text.includes("\u5b66\u4e60\u533a") || text.includes("Academic Coach")) return "study";
    if (text.includes("\u5f00\u53d1\u8005\u7aef") || text.includes("Creator")) return "developer";
    return "";
  }

  function routeFromTarget(target) {
    const node = target?.closest?.("button, .profile-card, .community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .study-entry, .role-switch-button");
    if (!node) return "";
    if (node.dataset.studybridgeRoute) return normalizeRoute(node.dataset.studybridgeRoute);
    for (const [name, route] of Object.entries(routes)) {
      if (route.selectors.some((selector) => node.matches(selector) || node.closest(selector))) return name;
    }
    return normalizeRoute(routeFromText(String(node.textContent || "")));
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
    button.id = {
      community: "openSchoolCommunityButton",
      classmates: "openClassmatesButton",
      email: "openEmailReplyButton",
      schedule: "openScheduleButton",
      study: "openStudyAreaButton"
    }[routeName];
    button.className = `${routeName}-entry`;
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
      if (!$(route.selectors[0])) {
        const button = createButton(routeName, icon, title, subtitle);
        anchor?.insertAdjacentElement("afterend", button);
      }
      const found = $(route.selectors[0]);
      if (found) anchor = found;
    });
    Object.entries(routes).forEach(([routeName, route]) => {
      route.selectors.forEach((selector) => {
        $$(selector).forEach((node) => {
          node.dataset.studybridgeRoute = routeName;
          node.style.cursor = "pointer";
          node.style.pointerEvents = "auto";
          if (node.tagName === "BUTTON") node.type = "button";
        });
      });
    });
  }

  function installStyle() {
    if ($("#studybridge-master-nav-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-master-nav-style";
    style.textContent = `
      .sidebar [data-studybridge-route] { cursor: pointer !important; pointer-events: auto !important; }
      .sidebar [data-studybridge-route] * { pointer-events: none !important; }
      .community-entry,.classmates-entry,.email-entry,.email-helper-entry,.schedule-entry,.study-entry,
      #openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton {
        display:grid !important; grid-template-columns:34px minmax(0,1fr) !important; align-items:center !important; gap:10px !important;
        width:100% !important; min-height:52px !important; padding:9px 12px !important; border:1px solid var(--line) !important;
        border-radius:8px !important; background:#fff !important; color:var(--navy) !important; text-align:left !important;
      }
      .community-entry.active,.classmates-entry.active,.email-helper-entry.active,.schedule-entry.active,.study-entry.active,
      #openSchoolCommunityButton.active,#openClassmatesButton.active,#openEmailReplyButton.active,#openScheduleButton.active,#openStudyAreaButton.active {
        border-color: var(--green) !important;
      }
      .nav-icon,.community-entry-icon,.classmates-entry-icon,.email-helper-entry-icon,.schedule-entry-icon,.study-entry-icon {
        display:grid !important; place-items:center !important; width:34px !important; height:34px !important;
        border-radius:8px !important; background:linear-gradient(145deg,#1f3a5f,#2f7d62) !important; color:white !important;
        font-weight:900 !important; line-height:1 !important;
      }
      .community-entry strong,.classmates-entry strong,.email-helper-entry strong,.schedule-entry strong,.study-entry strong {
        display:block !important; font-size:14px !important; line-height:1.15 !important; color:var(--navy) !important;
      }
      .community-entry small,.classmates-entry small,.email-helper-entry small,.schedule-entry small,.study-entry small {
        display:block !important; color:var(--muted) !important; font-size:12px !important; line-height:1.2 !important;
        white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important;
      }
      body.studybridge-secondary-page .workspace { display:block !important; height:100dvh !important; overflow-y:auto !important; background:#f4f6f9 !important; }
      body.studybridge-secondary-page #workspacePage { display:block !important; min-height:100dvh !important; height:auto !important; background:#f4f6f9 !important; }
      body.studybridge-secondary-page #profilePage:not([hidden]),
      body.studybridge-secondary-page #schoolCommunityPage:not([hidden]),
      body.studybridge-secondary-page #classmatesPage:not([hidden]),
      body.studybridge-secondary-page #emailReplyPage:not([hidden]),
      body.studybridge-secondary-page #schedulePage:not([hidden]) { display:block !important; visibility:visible !important; opacity:1 !important; }
      .fallback-page { min-height:100dvh; background:#f4f6f9; }
      .fallback-body { margin:24px 28px 72px; padding:18px; border:1px solid var(--line); border-radius:8px; background:white; }
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
