(() => {
  const VERSION = "20261007-nav-hardening-1.0.53";
  if (window.__studybridgeStudentNavHardening === VERSION) return;
  window.__studybridgeStudentNavHardening = VERSION;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const FEATURE_IDS = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const STUDY_PARTS = [".topbar", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const routes = {
    profile: {
      id: "profilePage",
      title: "Profile",
      scripts: ["/profile-page-patch.js?v=20261007-nav-hardening-1"],
      opener: "studybridgeOpenProfilePage",
      selectors: ["#openProfilePageButton", "#profileCard", "#editProfileButton"]
    },
    community: {
      id: "schoolCommunityPage",
      title: "社区",
      scripts: ["/school-community-patch.js?v=20261007-nav-hardening-1"],
      opener: "studybridgeOpenCommunityPage",
      selectors: ["#openSchoolCommunityButton", ".community-entry"]
    },
    classmates: {
      id: "classmatesPage",
      title: "同学",
      scripts: [
        "/classmates-request-patch.js?v=20261007-nav-hardening-1",
        "/classmate-chat-bubble-fix.js?v=20261007-nav-hardening-1",
        "/classmates-performance-patch.js?v=20261007-nav-hardening-1"
      ],
      opener: "studybridgeOpenClassmatesPage",
      selectors: ["#openClassmatesButton", ".classmates-entry"]
    },
    email: {
      id: "emailReplyPage",
      title: "邮件助手",
      scripts: ["/email-reply-patch.js?v=20261007-nav-hardening-1"],
      opener: "studybridgeOpenEmailReplyPage",
      selectors: ["#openEmailReplyButton", ".email-helper-entry"]
    },
    schedule: {
      id: "schedulePage",
      title: "时间表",
      scripts: [
        "/schedule-patch.js?v=20261007-nav-hardening-1",
        "/schedule-dashboard-patch.js?v=20261007-nav-hardening-1",
        "/schedule-notification-patch.js?v=20261007-nav-hardening-1"
      ],
      opener: "studybridgeOpenSchedulePage",
      selectors: ["#openScheduleButton", ".schedule-entry"]
    },
    study: {
      id: "workspacePage",
      title: "学习区",
      selectors: ["#openStudyAreaButton", ".study-entry"]
    },
    developer: {
      id: "developerPanel",
      title: "开发者端",
      selectors: ["#creatorViewButton"]
    }
  };
  const loadedScripts = new Map();
  let activeRoute = "study";
  let openToken = 0;

  function shell() {
    const app = $("#appShell");
    if (app) {
      app.hidden = false;
      app.removeAttribute("hidden");
      app.style.display = "";
      app.style.visibility = "visible";
    }
    return app;
  }

  function workspace() {
    const page = $("#workspacePage") || $(".workspace");
    if (page && !page.id) page.id = "workspacePage";
    if (page) {
      page.hidden = false;
      page.removeAttribute("hidden");
      page.style.display = "";
      page.style.visibility = "visible";
      page.style.opacity = "1";
    }
    return page;
  }

  function setStatus(text) {
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function hideFeaturePages(exceptId = "") {
    FEATURE_IDS.forEach((id) => {
      const page = $(`#${id}`);
      if (!page) return;
      const show = id === exceptId;
      page.hidden = !show;
      if (show) page.removeAttribute("hidden");
      page.style.display = show ? "block" : "none";
      page.style.visibility = show ? "visible" : "hidden";
      page.style.opacity = show ? "1" : "";
    });
  }

  function setStudyVisible(visible) {
    const root = workspace();
    if (!root) return;
    STUDY_PARTS.forEach((selector) => {
      const node = root.querySelector(`:scope > ${selector}`);
      if (!node) return;
      node.hidden = !visible;
      node.style.display = visible ? "" : "none";
      node.style.visibility = visible ? "visible" : "hidden";
    });
  }

  function mark(routeName) {
    Object.values(routes).forEach((route) => {
      (route.selectors || []).forEach((selector) => {
        $$(selector).forEach((node) => {
          if (node.id === "profileCard" || node.id === "editProfileButton") return;
          node.classList.toggle("active", route === routes[routeName]);
          if (route === routes[routeName]) node.setAttribute("aria-current", "page");
          else node.removeAttribute("aria-current");
        });
      });
    });
  }

  function prepareSecondary(routeName) {
    shell();
    workspace();
    setStudyVisible(false);
    const developer = $("#developerPanel");
    if (developer) developer.hidden = true;
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.dataset.studybridgeActivePage = routes[routeName].id;
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
    mark(routeName);
  }

  function showStudy() {
    activeRoute = "study";
    shell();
    workspace();
    hideFeaturePages("");
    setStudyVisible(true);
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
    activeRoute = "developer";
    shell();
    const root = workspace();
    hideFeaturePages("");
    setStudyVisible(false);
    const panel = $("#developerPanel");
    if (!panel) {
      setStatus("开发者端没有加载出来，请刷新后再试。");
      return false;
    }
    if (root && panel.parentElement !== root) root.appendChild(panel);
    panel.hidden = false;
    panel.removeAttribute("hidden");
    panel.style.display = "block";
    panel.style.visibility = "visible";
    panel.style.opacity = "1";
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

  function repairDeveloperPanel() {
    const root = workspace();
    const panel = $("#developerPanel");
    if (!root || !panel) return false;
    if (panel.parentElement !== root) root.appendChild(panel);
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "block";
    root.style.visibility = "visible";
    panel.hidden = false;
    panel.removeAttribute("hidden");
    panel.style.display = "block";
    panel.style.visibility = "visible";
    panel.style.opacity = "1";
    hideFeaturePages("");
    setStudyVisible(false);
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.classList.add("creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = "developerPanel";
    $("#studentViewButton")?.classList.remove("active");
    $("#creatorViewButton")?.classList.add("active");
    mark("developer");
    return true;
  }

  function lockDeveloperPanel(duration = 2200) {
    const started = Date.now();
    const tick = () => {
      repairDeveloperPanel();
      if (Date.now() - started < duration) requestAnimationFrame(tick);
      else setTimeout(() => $("#refreshAdminButton")?.click(), 50);
    };
    tick();
  }

  function hasContent(page) {
    if (!page) return false;
    return Boolean(page.querySelector("input, textarea, select, button, article, section, .topbar, .panel-title")) ||
      String(page.textContent || "").trim().length > 8;
  }

  function showFeature(routeName) {
    const route = routes[routeName];
    const root = workspace();
    const page = route && $(`#${route.id}`);
    if (!route || !root || !page || !hasContent(page)) return false;
    prepareSecondary(routeName);
    if (page.parentElement !== root) root.appendChild(page);
    hideFeaturePages(route.id);
    page.hidden = false;
    page.removeAttribute("hidden");
    page.style.display = "block";
    page.style.visibility = "visible";
    page.style.opacity = "1";
    activeRoute = routeName;
    setStatus(`${route.title} opened.`);
    return true;
  }

  function fallback(routeName) {
    const route = routes[routeName];
    const root = workspace();
    if (!route || !root) return false;
    let page = $(`#${route.id}`);
    if (!page) {
      page = document.createElement("section");
      page.id = route.id;
      root.appendChild(page);
    }
    page.className = `${routeName}-page rescue-page`;
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">StudyBridge</p>
          <h2>${route.title}</h2>
          <span>页面入口已打开，正在恢复功能内容。</span>
        </div>
        <button class="ghost-button" type="button" data-route-study>返回学习区</button>
      </header>
      <section class="rescue-card">
        如果你看到这段话，说明导航已经恢复，但这个模块脚本还没有渲染完成。请刷新一次；如果仍然出现，我会继续修模块内部。
      </section>
    `;
    return showFeature(routeName);
  }

  function scriptKey(src) {
    try {
      return new URL(src.split("?")[0], location.href).pathname;
    } catch {
      return src.split("?")[0];
    }
  }

  function scriptExists(src) {
    const key = scriptKey(src);
    return Array.from(document.scripts).some((script) => script.getAttribute("src") && scriptKey(script.getAttribute("src")) === key);
  }

  function loadScript(src) {
    const key = scriptKey(src);
    if (loadedScripts.has(key)) return loadedScripts.get(key);
    if (scriptExists(src)) {
      const promise = wait(200);
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

  async function runOpener(route) {
    if (!route?.opener || typeof window[route.opener] !== "function") return false;
    try {
      await window[route.opener]();
      return true;
    } catch (error) {
      console.warn("StudyBridge opener failed", route.opener, error);
      return false;
    }
  }

  async function openRoute(routeName) {
    const route = routes[routeName];
    if (!route) return false;
    const token = ++openToken;
    if (routeName === "study") return showStudy();
    if (routeName === "developer") return showDeveloper();
    setStatus(`Opening ${route.title}...`);
    prepareSecondary(routeName);
    await Promise.all((route.scripts || []).map(loadScript));
    if (token !== openToken) return false;
    for (const delay of [0, 100, 250, 500, 900, 1400]) {
      if (delay) await wait(delay);
      await runOpener(route);
      if (showFeature(routeName)) return true;
    }
    return fallback(routeName);
  }

  function routeFromText(text) {
    const value = String(text || "");
    if (value.includes("社区")) return "community";
    if (value.includes("同学") || value.includes("SB ID")) return "classmates";
    if (value.includes("邮件助手")) return "email";
    if (value.includes("时间表") || value.includes("Deadline")) return "schedule";
    if (value.includes("学习区") || value.includes("课程资料")) return "study";
    if (value.includes("开发者端")) return "developer";
    return "";
  }

  function routeFromTarget(target) {
    const node = target?.closest?.("[data-studybridge-route], #openProfilePageButton, #profileCard, #editProfileButton, #openSchoolCommunityButton, #openClassmatesButton, #openEmailReplyButton, #openScheduleButton, #openStudyAreaButton, #creatorViewButton, #studentViewButton, .community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .study-entry, .role-switch-button");
    if (!node) return "";
    if (node.dataset.studybridgeRoute) return node.dataset.studybridgeRoute;
    if (node.id === "openProfilePageButton" || node.id === "profileCard" || node.id === "editProfileButton") return "profile";
    if (node.id === "openSchoolCommunityButton" || node.classList.contains("community-entry")) return "community";
    if (node.id === "openClassmatesButton" || node.classList.contains("classmates-entry")) return "classmates";
    if (node.id === "openEmailReplyButton" || node.classList.contains("email-helper-entry")) return "email";
    if (node.id === "openScheduleButton" || node.classList.contains("schedule-entry")) return "schedule";
    if (node.id === "openStudyAreaButton" || node.classList.contains("study-entry") || node.id === "studentViewButton") return "study";
    if (node.id === "creatorViewButton") return "developer";
    return routeFromText(node.textContent);
  }

  function onNavigate(event) {
    const routeName = routeFromTarget(event.target);
    if (!routeName) return;
    if (routeName === "developer") {
      setTimeout(() => {
        activeRoute = "developer";
        lockDeveloperPanel();
      }, 0);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(routeName);
  }

  function makeButton(routeName, icon, title, subtitle, id) {
    let button = $(`#${id}`);
    if (!button) {
      button = document.createElement("button");
      button.id = id;
      button.type = "button";
      button.className = `${routeName}-entry`;
    }
    button.dataset.studybridgeRoute = routeName;
    button.innerHTML = `<span class="nav-icon">${icon}</span><span><strong>${title}</strong><small>${subtitle}</small></span>`;
    return button;
  }

  function ensureSidebar() {
    const sidebar = $(".sidebar");
    const profile = $("#openProfilePageButton") || $("#profileCard");
    if (!sidebar || !profile) return;
    const items = [
      ["community", "社", "社区", "全部、学校和专业频道", "openSchoolCommunityButton"],
      ["classmates", "友", "同学", "SB ID 申请和聊天", "openClassmatesButton"],
      ["email", "信", "邮件助手", "理解邮件并生成英文回复", "openEmailReplyButton"],
      ["schedule", "时", "时间表", "Deadline 和课程提醒", "openScheduleButton"],
      ["study", "学", "学习区", "课程资料、AI 对话和复习计划", "openStudyAreaButton"]
    ];
    let anchor = profile;
    items.forEach(([routeName, icon, title, subtitle, id]) => {
      const button = makeButton(routeName, icon, title, subtitle, id);
      if (button.parentElement !== sidebar || button.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement("afterend", button);
      }
      anchor = button;
    });
    Object.entries(routes).forEach(([routeName, route]) => {
      (route.selectors || []).forEach((selector) => {
        $$(selector).forEach((node) => {
          node.dataset.studybridgeRoute = routeName;
          node.style.pointerEvents = "auto";
          node.style.cursor = "pointer";
          if (node.tagName === "BUTTON") node.type = "button";
        });
      });
    });
    mark(activeRoute);
  }

  function installStyle() {
    if ($("#studybridge-nav-hardening-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-nav-hardening-style";
    style.textContent = `
      .sidebar [data-studybridge-route]{cursor:pointer!important;pointer-events:auto!important}
      .sidebar [data-studybridge-route] *{pointer-events:none!important}
      #openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton,
      .community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry{
        display:grid!important;grid-template-columns:34px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;
        width:100%!important;min-height:52px!important;padding:9px 12px!important;border:1px solid var(--line)!important;
        border-radius:8px!important;background:#fff!important;color:var(--navy)!important;text-align:left!important;font:inherit!important
      }
      #openSchoolCommunityButton.active,#openClassmatesButton.active,#openEmailReplyButton.active,#openScheduleButton.active,#openStudyAreaButton.active,
      .community-entry.active,.classmates-entry.active,.email-helper-entry.active,.schedule-entry.active,.study-entry.active{border-color:var(--green)!important}
      .nav-icon,.community-entry-icon,.classmates-entry-icon,.email-helper-entry-icon,.schedule-entry-icon,.study-entry-icon{
        display:grid!important;place-items:center!important;width:34px!important;height:34px!important;border-radius:8px!important;
        background:linear-gradient(145deg,#1f3a5f,#2f7d62)!important;color:white!important;font-weight:900!important;line-height:1!important
      }
      .sidebar [data-studybridge-route] strong{display:block!important;color:var(--navy)!important;font-size:14px!important;line-height:1.15!important}
      .sidebar [data-studybridge-route] small{display:block!important;color:var(--muted)!important;font-size:12px!important;line-height:1.2!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage{display:block!important;height:100dvh!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f4f6f9!important}
      body.studybridge-secondary-page:not(.creator-clean-mode) #profilePage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #classmatesPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #emailReplyPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #schedulePage:not([hidden]){display:block!important;visibility:visible!important;opacity:1!important;min-height:100dvh!important}
      .rescue-page{padding-bottom:80px;background:#f4f6f9}
      .rescue-card{margin:24px;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--navy)}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyle();
    ensureSidebar();
  }

  window.studybridgeNavHardeningOpen = openRoute;
  window.studybridgeMasterOpen = openRoute;
  window.studybridgeOpenMainPage = openRoute;
  window.studybridgeDirectOpen = (pageOrRoute) => {
    const map = {
      workspacePage: "study",
      profilePage: "profile",
      schoolCommunityPage: "community",
      classmatesPage: "classmates",
      emailReplyPage: "email",
      schedulePage: "schedule",
      developerPanel: "developer"
    };
    return openRoute(map[pageOrRoute] || pageOrRoute);
  };
  window.studybridgeOpenStudentPage = window.studybridgeDirectOpen;

  window.addEventListener("click", onNavigate, true);
  window.addEventListener("pointerup", onNavigate, true);
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-route-study]")) {
      event.preventDefault();
      showStudy();
    }
  }, true);
  new MutationObserver(() => requestAnimationFrame(ensureSidebar)).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
