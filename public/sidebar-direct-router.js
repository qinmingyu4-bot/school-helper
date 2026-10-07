(() => {
  const VERSION = "20261007-main-router-2";
  if (window.__studybridgeMainRouterVersion === VERSION) return;
  window.__studybridgeMainRouterVersion = VERSION;

  const WORKSPACE_ID = "workspacePage";
  const LAST_PAGE_KEY = "studybridgeLastOpenPage";
  const STUDY_PARTS = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const FEATURE_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage", "routerLoadingPage"];
  const loadedScripts = new Map();
  let activeToken = 0;

  const labels = {
    profile: "\u4e2a\u4eba\u8d44\u6599",
    community: "\u793e\u533a",
    classmates: "\u540c\u5b66",
    email: "\u90ae\u4ef6\u52a9\u624b",
    schedule: "\u65f6\u95f4\u8868",
    study: "\u5b66\u4e60\u533a",
    back: "\u8fd4\u56de\u5b66\u4e60\u533a",
    opening: "\u6b63\u5728\u6253\u5f00...",
    failed: "\u9875\u9762\u6682\u65f6\u6ca1\u6709\u751f\u6210\u5185\u5bb9\uff0c\u8bf7\u5237\u65b0\u540e\u518d\u8bd5\u4e00\u6b21\u3002",
    save: "\u4fdd\u5b58\u8d44\u6599",
    saving: "\u6b63\u5728\u4fdd\u5b58...",
    saved: "\u5df2\u4fdd\u5b58\u3002"
  };

  const routes = {
    profile: {
      pageId: "profilePage",
      selectors: ["#profileCard", "#openProfilePageButton", "#editProfileButton"],
      words: ["Profile", "SB ID"],
      ensure: ensureProfilePage,
      refresh: refreshProfilePage
    },
    community: {
      pageId: "schoolCommunityPage",
      selectors: ["#openSchoolCommunityButton", ".community-entry"],
      words: ["\u793e\u533a", "Community"],
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-main-router-2"]
    },
    classmates: {
      pageId: "classmatesPage",
      selectors: ["#openClassmatesButton", ".classmates-entry"],
      words: ["\u540c\u5b66", "Classmates", "SB ID"],
      opener: "studybridgeOpenClassmatesPage",
      scripts: ["/classmates-request-patch.js?v=20261007-main-router-2", "/classmate-chat-bubble-fix.js?v=20261007-main-router-2", "/classmates-performance-patch.js?v=20261007-main-router-2"]
    },
    email: {
      pageId: "emailReplyPage",
      selectors: ["#openEmailReplyButton", ".email-helper-entry"],
      words: ["\u90ae\u4ef6\u52a9\u624b", "Email"],
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-main-router-2"]
    },
    schedule: {
      pageId: "schedulePage",
      selectors: ["#openScheduleButton", ".schedule-entry"],
      words: ["\u65f6\u95f4\u8868", "Schedule"],
      opener: "studybridgeOpenSchedulePage",
      scripts: ["/schedule-patch.js?v=20261007-main-router-2", "/schedule-dashboard-patch.js?v=20261007-main-router-2", "/schedule-notification-patch.js?v=20261007-main-router-2"]
    },
    study: {
      pageId: WORKSPACE_ID,
      selectors: ["#openStudyAreaButton", ".study-entry"],
      words: ["\u5b66\u4e60\u533a", "Academic Coach"]
    }
  };

  function $(selector, root = document) { return root.querySelector(selector); }
  function $all(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  function esc(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function workspace() {
    const root = $("#workspacePage") || $(".workspace");
    if (root && !root.id) root.id = WORKSPACE_ID;
    return root;
  }
  function status(message) {
    const line = $("#statusLine");
    if (line) line.textContent = message;
  }
  function remember(pageId) {
    try {
      localStorage.setItem(LAST_PAGE_KEY, pageId);
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {}
  }
  async function api(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function prepareStudentWorkspace() {
    const root = workspace();
    if (!root) return null;
    const shell = $("#appShell");
    if (shell) {
      shell.hidden = false;
      shell.style.display = "";
    }
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";
    root.style.opacity = "1";
    const developer = $("#developerPanel");
    if (developer) developer.hidden = true;
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-nav-hotfix-page");
    document.documentElement.classList.remove("studybridge-restore-pending");
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
    return root;
  }

  function setStudyVisible(visible) {
    const root = workspace();
    if (!root) return;
    STUDY_PARTS.forEach((selector) => {
      const item = root.querySelector(`:scope > ${selector}`);
      if (item) item.hidden = !visible;
    });
  }

  function hideFeaturePages(except = "") {
    FEATURE_PAGES.forEach((id) => {
      const page = $("#" + id);
      if (!page) return;
      page.hidden = id !== except;
      if (id === except) {
        page.removeAttribute("hidden");
        page.style.display = "";
        page.style.visibility = "visible";
        page.style.opacity = "1";
      }
    });
  }

  function pageHasContent(page) {
    if (!page) return false;
    const readable = String(page.textContent || "").replace(/\s+/g, " ").trim();
    return readable.length > 8 || Boolean(page.querySelector("input, textarea, select, button, article, form, section"));
  }

  function markActive(key) {
    Object.entries(routes).forEach(([routeKey, route]) => {
      route.selectors.forEach((selector) => {
        $all(selector).forEach((el) => {
          if (selector === "#profileCard" || selector === "#editProfileButton") return;
          el.classList.toggle("active", routeKey === key);
          el.setAttribute("aria-current", routeKey === key ? "page" : "false");
        });
      });
    });
  }

  function showStudy() {
    const root = prepareStudentWorkspace();
    if (!root) return false;
    hideFeaturePages("");
    setStudyVisible(true);
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.dataset.studybridgeActivePage = WORKSPACE_ID;
    root.style.overflowY = "";
    markActive("study");
    remember(WORKSPACE_ID);
    status("Workspace is ready.");
    return true;
  }

  function showFeature(key) {
    const route = routes[key];
    const root = prepareStudentWorkspace();
    const page = route && $("#" + route.pageId);
    if (!root || !page || !pageHasContent(page)) return false;
    if (page.parentElement !== root) root.appendChild(page);
    setStudyVisible(false);
    hideFeaturePages(route.pageId);
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = route.pageId;
    markActive(key);
    remember(route.pageId);
    root.scrollTop = 0;
    status(labels[key] + " opened.");
    return true;
  }

  function header(key, sub = "") {
    return `<header class="topbar"><div><p class="eyebrow">StudyBridge</p><h2>${esc(labels[key])}</h2><span>${esc(sub)}</span></div><button class="ghost-button" type="button" data-router-back>${labels.back}</button></header>`;
  }

  function showLoading(key) {
    const root = prepareStudentWorkspace();
    if (!root) return;
    let page = $("#routerLoadingPage");
    if (!page) {
      page = document.createElement("section");
      page.id = "routerLoadingPage";
      root.appendChild(page);
    }
    page.className = "router-feature-page";
    page.innerHTML = `${header(key, labels.opening)}<div class="router-page-body"><section class="router-card">${labels.opening}</section></div>`;
    page.querySelector("[data-router-back]")?.addEventListener("click", showStudy);
    setStudyVisible(false);
    hideFeaturePages("routerLoadingPage");
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    markActive(key);
  }

  function fallback(key, message) {
    const route = routes[key];
    const root = prepareStudentWorkspace();
    if (!root || !route) return;
    let page = $("#" + route.pageId);
    if (!page) {
      page = document.createElement("section");
      page.id = route.pageId;
      root.appendChild(page);
    }
    page.className = `${key}-page router-feature-page`;
    page.innerHTML = `${header(key, message || labels.failed)}<div class="router-page-body"><section class="router-card">${esc(message || labels.failed)}</section></div>`;
    page.querySelector("[data-router-back]")?.addEventListener("click", showStudy);
    showFeature(key);
  }

  function scriptPath(src) { return new URL(src.split("?")[0], location.href).pathname; }
  function loadScript(src) {
    const key = scriptPath(src);
    if (loadedScripts.has(key)) return loadedScripts.get(key);
    if ($all("script").some((s) => s.getAttribute("src") && scriptPath(s.getAttribute("src")) === key)) {
      const wait = new Promise((resolve) => setTimeout(resolve, 220));
      loadedScripts.set(key, wait);
      return wait;
    }
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 2600);
    });
    loadedScripts.set(key, promise);
    return promise;
  }

  async function waitForOpener(route, ms = 2600) {
    if (!route.opener || typeof window[route.opener] === "function") return;
    const start = Date.now();
    while (Date.now() - start < ms) {
      await new Promise((r) => setTimeout(r, 80));
      if (typeof window[route.opener] === "function") return;
    }
  }

  async function callOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return false;
    try {
      await window[route.opener]();
      return true;
    } catch (err) {
      console.warn("StudyBridge opener failed", err);
      return false;
    }
  }

  async function openRoute(key) {
    const route = routes[key];
    if (!route) return;
    const token = ++activeToken;
    if (key === "study") return showStudy();
    showLoading(key);
    route.ensure?.();
    await Promise.all((route.scripts || []).map(loadScript));
    await waitForOpener(route);
    if (token !== activeToken) return;
    for (const delay of [0, 120, 300, 700, 1100]) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      route.ensure?.();
      route.refresh && await route.refresh();
      await callOpener(route);
      if (showFeature(key)) return;
    }
    fallback(key, labels.failed);
  }

  function routeFromElement(target) {
    const el = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (!el || el.closest("input, textarea, select, option, form")) return "";
    const routed = el.closest("[data-studybridge-main-route]");
    if (routed) return routed.dataset.studybridgeMainRoute || "";
    for (const [key, route] of Object.entries(routes)) {
      if (route.selectors.some((selector) => el.closest(selector))) return key;
    }
    const sidebar = el.closest(".sidebar");
    if (!sidebar) return "";
    let node = el;
    while (node && node !== sidebar.parentElement) {
      const text = String(node.textContent || "").replace(/\s+/g, " ");
      const found = Object.entries(routes).find(([, route]) => route.words.some((word) => text.includes(word)));
      if (found) return found[0];
      if (node === sidebar) break;
      node = node.parentElement;
    }
    return "";
  }

  function onNavigate(event) {
    const key = routeFromElement(event.target);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(key);
  }

  function bind(el, key) {
    if (!el || !key) return;
    el.dataset.studybridgeMainRoute = key;
    el.style.cursor = "pointer";
    el.style.pointerEvents = "auto";
    if (el.tagName === "BUTTON") el.type = "button";
    el.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openRoute(key);
      return false;
    };
  }

  function ensureButton(key) {
    const route = routes[key];
    if (!route || key === "profile" || $(route.selectors[0])) return;
    const order = ["community", "classmates", "email", "schedule", "study"];
    const prev = order[order.indexOf(key) - 1];
    const anchor = prev ? $(routes[prev].selectors[0]) : $("#profileCard");
    if (!anchor) return;
    const subs = {
      community: "\u5168\u90e8\u3001\u5b66\u6821\u548c\u4e13\u4e1a\u9891\u9053",
      classmates: "SB ID \u7533\u8bf7\u548c\u804a\u5929",
      email: "\u7406\u89e3\u90ae\u4ef6\u5e76\u751f\u6210\u82f1\u6587\u56de\u590d",
      schedule: "Deadline \u548c\u8bfe\u7a0b\u63d0\u9192",
      study: "\u8bfe\u7a0b\u8d44\u6599\u3001AI \u5bf9\u8bdd\u548c\u590d\u4e60\u8ba1\u5212"
    };
    const icon = { community: "\u793e", classmates: "\u53cb", email: "\u4fe1", schedule: "\u65f6", study: "\u5b66" }[key];
    const button = document.createElement("button");
    button.id = route.selectors[0].slice(1);
    button.type = "button";
    button.className = key === "community" ? "community-entry" : key === "classmates" ? "classmates-entry" : key === "email" ? "email-helper-entry" : key === "schedule" ? "schedule-entry" : "study-entry";
    button.innerHTML = `<span class="router-nav-icon">${icon}</span><span><strong>${labels[key]}</strong><span>${subs[key]}</span></span>`;
    anchor.insertAdjacentElement("afterend", button);
  }

  function decorateSidebar() {
    ["community", "classmates", "email", "schedule", "study"].forEach(ensureButton);
    Object.entries(routes).forEach(([key, route]) => route.selectors.forEach((selector) => $all(selector).forEach((el) => bind(el, key))));
  }

  function ensureProfilePage() {
    const root = prepareStudentWorkspace();
    if (!root) return null;
    let page = $("#profilePage");
    if (!page) {
      page = document.createElement("section");
      page.id = "profilePage";
      root.appendChild(page);
    }
    page.className = "profile-page router-feature-page";
    page.innerHTML = `${header("profile", "\u5b66\u6821\u3001\u4e13\u4e1a\u3001SB ID \u4f1a\u8ddf\u8d26\u53f7\u4fdd\u5b58\u3002")}<div class="router-page-body"><section class="router-card"><form id="routerProfileForm" class="router-profile-form"><label><span>\u59d3\u540d</span><input id="routerProfileName" autocomplete="name" /></label><label><span>\u5b66\u6821</span><input id="routerProfileSchool" placeholder="University of Toronto" /></label><label><span>\u4e13\u4e1a</span><input id="routerProfileMajor" placeholder="Finance / Computer Science" /></label><label><span>SB ID</span><input id="routerProfileSbId" placeholder="adam2026" /></label><label><span>\u5934\u50cf\u56fe\u7247\u94fe\u63a5</span><input id="routerProfileAvatar" /></label><label><span>\u80cc\u666f\u56fe\u7247\u94fe\u63a5</span><input id="routerProfileBackground" /></label><button class="primary-button" type="submit">${labels.save}</button><p class="form-message" id="routerProfileMessage"></p></form></section></div>`;
    page.querySelector("[data-router-back]")?.addEventListener("click", showStudy);
    page.querySelector("#routerProfileForm")?.addEventListener("submit", saveProfilePage);
    return page;
  }

  async function refreshProfilePage() {
    ensureProfilePage();
    try {
      const data = await api("/api/me");
      const user = data.user || {};
      const profile = user.profile || {};
      $("#routerProfileName").value = user.name || "";
      $("#routerProfileSchool").value = profile.school || "";
      $("#routerProfileMajor").value = profile.major || "";
      $("#routerProfileSbId").value = profile.sbId || "";
      $("#routerProfileAvatar").value = profile.avatarUrl || "";
      $("#routerProfileBackground").value = profile.backgroundUrl || "";
    } catch (err) {
      const message = $("#routerProfileMessage");
      if (message) message.textContent = err.message;
    }
  }

  async function saveProfilePage(event) {
    event.preventDefault();
    const msg = $("#routerProfileMessage");
    if (msg) msg.textContent = labels.saving;
    try {
      await api("/api/me/profile", { method: "PUT", body: {
        name: $("#routerProfileName")?.value || "",
        school: $("#routerProfileSchool")?.value || "",
        major: $("#routerProfileMajor")?.value || "",
        sbId: $("#routerProfileSbId")?.value || "",
        avatarUrl: $("#routerProfileAvatar")?.value || "",
        backgroundUrl: $("#routerProfileBackground")?.value || ""
      }});
      if (msg) msg.textContent = labels.saved;
    } catch (err) {
      if (msg) msg.textContent = err.message;
    }
  }

  function installStyle() {
    if ($("#studybridge-main-router-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-main-router-style";
    style.textContent = `
      .sidebar [data-studybridge-main-route]{cursor:pointer!important;pointer-events:auto!important}
      .sidebar [data-studybridge-main-route] *{pointer-events:none!important}
      .community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton{display:grid!important;grid-template-columns:34px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;width:100%!important;min-height:52px!important;padding:9px 12px!important;border:1px solid var(--line)!important;border-radius:8px!important;background:#fff!important;color:var(--navy)!important;text-align:left!important;font-family:inherit!important;box-shadow:0 8px 24px rgba(25,36,58,.04)!important}
      .community-entry.active,.classmates-entry.active,.email-helper-entry.active,.schedule-entry.active,.study-entry.active,#openSchoolCommunityButton.active,#openClassmatesButton.active,#openEmailReplyButton.active,#openScheduleButton.active,#openStudyAreaButton.active{border-color:var(--green)!important}
      .router-nav-icon,.community-entry-icon,.classmates-entry-icon,.email-helper-entry-icon,.schedule-entry-icon,.study-entry-icon,#openSchoolCommunityButton>span:first-child,#openClassmatesButton>span:first-child,#openEmailReplyButton>span:first-child,#openScheduleButton>span:first-child,#openStudyAreaButton>span:first-child{display:grid!important;place-items:center!important;width:34px!important;height:34px!important;border-radius:8px!important;background:linear-gradient(145deg,#1f3a5f,#2f7d62)!important;color:#fff!important;font-size:15px!important;font-weight:900!important}
      .community-entry strong,.classmates-entry strong,.email-helper-entry strong,.schedule-entry strong,.study-entry strong,#openSchoolCommunityButton strong,#openClassmatesButton strong,#openEmailReplyButton strong,#openScheduleButton strong,#openStudyAreaButton strong{display:block!important;color:var(--navy)!important;font-size:14px!important;font-weight:850!important;line-height:1.15!important}
      .community-entry span span,.classmates-entry span span,.email-helper-entry span span,.schedule-entry span span,.study-entry span span,#openSchoolCommunityButton span span,#openClassmatesButton span span,#openEmailReplyButton span span,#openScheduleButton span span,#openStudyAreaButton span span{display:block!important;color:var(--muted)!important;font-size:12px!important;line-height:1.2!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage{display:block!important;height:100dvh!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f4f6f9!important;padding-bottom:56px!important}
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>.topbar,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#developerPanel,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#scheduleDashboard,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#chatArea,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#quickPrompts,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#chatForm{display:none!important}
      .router-feature-page{min-height:100dvh;background:#f4f6f9}.router-feature-page[hidden]{display:none!important}.router-page-body{display:grid;gap:14px;padding:22px 28px 56px}.router-card{border:1px solid var(--line);border-radius:8px;background:#fff;padding:18px;box-shadow:0 12px 30px rgba(25,36,58,.05)}.router-profile-form{display:grid;gap:12px;max-width:620px}.router-profile-form label{display:grid;gap:6px;color:var(--navy);font-weight:850}
    `;
    document.head.appendChild(style);
  }

  function restore() {
    const stored = localStorage.getItem(LAST_PAGE_KEY);
    const found = Object.entries(routes).find(([, route]) => route.pageId === stored);
    if (found && found[0] !== "study") openRoute(found[0]);
  }

  function boot() {
    installStyle();
    decorateSidebar();
    setTimeout(decorateSidebar, 250);
    setTimeout(decorateSidebar, 900);
    setTimeout(restore, 450);
  }

  window.addEventListener("click", onNavigate, true);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") onNavigate(event);
  }, true);
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-router-back]")) return;
    event.preventDefault();
    showStudy();
  }, true);
  window.studybridgeDirectOpen = openRoute;
  window.studybridgeOpenMainPage = openRoute;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  new MutationObserver(() => requestAnimationFrame(decorateSidebar)).observe(document.documentElement, { childList: true, subtree: true });
})();
