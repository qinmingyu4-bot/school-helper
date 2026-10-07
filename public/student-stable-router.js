(() => {
  const VERSION = "20261007-stable-1";
  if (window.__studybridgeStableRouter === VERSION) return;
  window.__studybridgeStableRouter = VERSION;

  const WORKSPACE_ID = "workspacePage";
  const PAGE_KEY = "studybridgeLastOpenPage";
  const STUDY_PARTS = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const FEATURE_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage", "studentRouteLoadingPage"];
  const loaded = new Map();
  let openToken = 0;
  let lockTimer = 0;
  let lockedPage = "";
  let lockedUntil = 0;

  const routes = {
    profile: {
      pageId: "profilePage",
      title: "\u4e2a\u4eba\u8d44\u6599",
      buttonIds: ["profileCard", "editProfileButton", "openProfilePageButton"],
      match: ["Profile", "SB ID", "\u4e2a\u4eba\u8d44\u6599"],
      ensure: ensureProfilePage,
      refresh: refreshProfilePage
    },
    community: {
      pageId: "schoolCommunityPage",
      title: "\u793e\u533a",
      buttonIds: ["openSchoolCommunityButton"],
      match: ["\u793e\u533a", "Community"],
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-stable-1"]
    },
    classmates: {
      pageId: "classmatesPage",
      title: "\u540c\u5b66",
      buttonIds: ["openClassmatesButton"],
      match: ["\u540c\u5b66", "Classmates", "SB ID \u7533\u8bf7"],
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-request-patch.js?v=20261007-stable-1",
        "/classmate-chat-bubble-fix.js?v=20261007-stable-1",
        "/classmates-performance-patch.js?v=20261007-stable-1"
      ],
      refreshSelectors: ["#refreshClassmatesButton", "#refreshClassmateRequestsButton"]
    },
    email: {
      pageId: "emailReplyPage",
      title: "\u90ae\u4ef6\u52a9\u624b",
      buttonIds: ["openEmailReplyButton"],
      match: ["\u90ae\u4ef6\u52a9\u624b", "Email"],
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-stable-1"]
    },
    schedule: {
      pageId: "schedulePage",
      title: "\u65f6\u95f4\u8868",
      buttonIds: ["openScheduleButton"],
      match: ["\u65f6\u95f4\u8868", "Schedule"],
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-stable-1",
        "/schedule-dashboard-patch.js?v=20261007-stable-1",
        "/schedule-notification-patch.js?v=20261007-stable-1"
      ],
      refreshSelectors: ["#refreshScheduleButton"]
    },
    study: {
      pageId: WORKSPACE_ID,
      title: "\u5b66\u4e60\u533a",
      buttonIds: ["openStudyAreaButton"],
      match: ["\u5b66\u4e60\u533a", "Academic Coach"]
    }
  };

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function workspace() {
    const root = $(`#${WORKSPACE_ID}`) || $(".workspace");
    if (root && !root.id) root.id = WORKSPACE_ID;
    return root;
  }

  function appIsOpen() {
    const shell = $("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function setStatus(text) {
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Storage can be blocked; navigation still works for this session.
    }
  }

  function scriptPath(src) {
    return new URL(src.split("?")[0], window.location.href).pathname;
  }

  function openerReady(route) {
    return !route.opener || typeof window[route.opener] === "function";
  }

  function waitForOpener(route, timeout = 2400) {
    if (openerReady(route)) return Promise.resolve();
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (openerReady(route) || Date.now() - start > timeout) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
  }

  function loadScript(src, route) {
    if (openerReady(route)) return Promise.resolve();
    const path = scriptPath(src);
    if (loaded.has(path)) return loaded.get(path).then(() => waitForOpener(route));
    const existing = Array.from(document.scripts).find((script) => {
      const current = script.getAttribute("src");
      return current && scriptPath(current) === path;
    });
    if (existing) return waitForOpener(route);
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 2400);
    });
    loaded.set(path, promise);
    return promise.then(() => waitForOpener(route));
  }

  function prepareWorkspace() {
    const root = workspace();
    if (!root) return null;
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";
    root.style.opacity = "1";
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-nav-hotfix-page");
    document.documentElement.classList.remove("studybridge-restore-pending");
    const developerPanel = $("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
    return root;
  }

  function setStudyVisible(visible) {
    const root = workspace();
    if (!root) return;
    STUDY_PARTS.forEach((selector) => {
      const element = root.querySelector(`:scope > ${selector}`);
      if (element) element.hidden = !visible;
    });
  }

  function hideFeaturePages(exceptId = "") {
    FEATURE_PAGES.forEach((id) => {
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
    Object.values(routes).forEach((route) => {
      route.buttonIds?.forEach((id) => {
        const element = $(`#${id}`);
        if (!element || id === "profileCard" || id === "editProfileButton") return;
        const active = route.pageId === pageId;
        element.classList.toggle("active", active);
        element.setAttribute("aria-current", active ? "page" : "false");
      });
    });
  }

  function showStudy() {
    clearLock();
    if (!prepareWorkspace()) return false;
    hideFeaturePages("");
    setStudyVisible(true);
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.dataset.studybridgeActivePage = WORKSPACE_ID;
    setActive(WORKSPACE_ID);
    remember(WORKSPACE_ID);
    setStatus("Workspace is ready.");
    return true;
  }

  function showFeaturePage(pageId) {
    const root = prepareWorkspace();
    const page = $(`#${pageId}`);
    if (!root || !page) return false;
    if (page.parentElement !== root) root.appendChild(page);
    setStudyVisible(false);
    hideFeaturePages(pageId);
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = pageId;
    setActive(pageId);
    remember(pageId);
    return true;
  }

  function clearLock() {
    lockedPage = "";
    lockedUntil = 0;
    if (lockTimer) {
      clearInterval(lockTimer);
      lockTimer = 0;
    }
  }

  function lockPage(pageId, ms = 6500) {
    lockedPage = pageId;
    lockedUntil = Date.now() + ms;
    if (lockTimer) return;
    lockTimer = setInterval(() => {
      if (!lockedPage || Date.now() > lockedUntil || !appIsOpen()) {
        clearLock();
        return;
      }
      showFeaturePage(lockedPage);
    }, 100);
  }

  function ensureLoadingPage(title) {
    const root = prepareWorkspace();
    if (!root) return null;
    let page = $("#studentRouteLoadingPage");
    if (!page) {
      page = document.createElement("section");
      page.id = "studentRouteLoadingPage";
      page.className = "stable-feature-page";
      root.appendChild(page);
    }
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">StudyBridge</p>
          <h2>${escapeHtml(title)}</h2>
          <span>\u6b63\u5728\u6253\u5f00\u9875\u9762...</span>
        </div>
        <button class="ghost-button" id="stableBackToStudyButton" type="button">\u8fd4\u56de\u5b66\u4e60\u533a</button>
      </header>
      <div class="stable-empty-page">\u8bf7\u7a0d\u7b49\uff0c\u6b63\u5728\u51c6\u5907\u8fd9\u4e2a\u529f\u80fd\u3002</div>
    `;
    page.querySelector("#stableBackToStudyButton")?.addEventListener("click", showStudy);
    showFeaturePage("studentRouteLoadingPage");
    return page;
  }

  function showFallback(route, detail) {
    const page = ensureLoadingPage(route.title);
    if (!page) return;
    page.querySelector(".stable-empty-page").innerHTML = `
      <h3>${escapeHtml(route.title)}\u6682\u65f6\u6ca1\u6709\u52a0\u8f7d\u51fa\u6765</h3>
      <p>${escapeHtml(detail || "\u8bf7\u5237\u65b0\u4e00\u6b21\u9875\u9762\uff1b\u5982\u679c\u8fd8\u4e0d\u884c\uff0c\u628a\u5f53\u524d\u622a\u56fe\u53d1\u7ed9\u6211\u3002")}</p>
    `;
    showFeaturePage("studentRouteLoadingPage");
    lockPage("studentRouteLoadingPage", 2500);
  }

  async function callOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return true;
    try {
      await window[route.opener]();
      return true;
    } catch (error) {
      console.warn("StudyBridge feature opener failed:", error);
      return false;
    }
  }

  function refreshFeature(route) {
    (route.refreshSelectors || []).forEach((selector) => {
      const button = $(selector);
      if (button && !button.disabled) setTimeout(() => button.click(), 120);
    });
    if (route.refresh) setTimeout(route.refresh, 120);
  }

  async function openRoute(routeKey) {
    const route = routes[routeKey];
    if (!route || !appIsOpen()) return;
    const token = ++openToken;
    if (route.pageId === WORKSPACE_ID) {
      showStudy();
      return;
    }
    setStatus(`Opening ${route.title}...`);
    ensureLoadingPage(route.title);
    if (route.ensure) route.ensure();
    await Promise.all((route.scripts || []).map((src) => loadScript(src, route)));
    if (token !== openToken) return;

    let opened = false;
    for (const delay of [0, 100, 250, 500, 900]) {
      if (delay) await wait(delay);
      if (route.ensure) route.ensure();
      const openerOk = await callOpener(route);
      opened = Boolean(openerOk && $(`#${route.pageId}`) && showFeaturePage(route.pageId));
      if (opened) break;
    }

    if (!opened) {
      showFallback(route, `${route.title}\u811a\u672c\u6ca1\u6709\u6210\u529f\u751f\u6210\u9875\u9762\u3002`);
      return;
    }

    $("#studentRouteLoadingPage")?.setAttribute("hidden", "");
    lockPage(route.pageId);
    refreshFeature(route);
    setStatus(`${route.title} opened.`);
  }

  function routeFromElement(element) {
    if (!element) return "";
    for (const [key, route] of Object.entries(routes)) {
      if (route.buttonIds?.some((id) => element.id === id || element.closest?.(`#${id}`))) return key;
    }
    if (!element.closest?.(".sidebar")) return "";
    let node = element;
    while (node && node !== document.body) {
      if (node.matches?.("input, textarea, select, option") || node.closest?.("form")) return "";
      const text = String(node.textContent || "").replace(/\s+/g, " ");
      const match = Object.entries(routes).find(([, route]) => route.match?.some((word) => text.includes(word)));
      if (match) return match[0];
      if (node.classList?.contains("sidebar")) break;
      node = node.parentElement;
    }
    return "";
  }

  function handleNavigation(event) {
    const routeKey = routeFromElement(event.target);
    if (!routeKey) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(routeKey);
  }

  function decorateSidebar() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    Object.entries(routes).forEach(([key, route]) => {
      route.buttonIds?.forEach((id) => {
        const element = $(`#${id}`);
        if (!element) return;
        element.dataset.studybridgeStableRoute = key;
        element.style.cursor = "pointer";
        element.style.pointerEvents = "auto";
        if (element.tagName === "BUTTON") element.type = "button";
      });
    });
    sidebar.querySelectorAll("button, .profile-card, .community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .study-entry").forEach((element) => {
      const routeKey = routeFromElement(element);
      if (!routeKey) return;
      element.dataset.studybridgeStableRoute = routeKey;
      element.style.cursor = "pointer";
      element.style.pointerEvents = "auto";
      if (element.tagName === "BUTTON") element.type = "button";
    });
  }

  function ensureProfilePage() {
    const root = workspace();
    if (!root) return null;
    let page = $("#profilePage");
    if (page?.dataset.stableProfilePage === "true") return page;
    if (!page) {
      page = document.createElement("section");
      page.id = "profilePage";
      root.appendChild(page);
    }
    page.className = "stable-profile-page";
    page.dataset.stableProfilePage = "true";
    page.hidden = true;
    page.innerHTML = `
      <header class="topbar"><div><p class="eyebrow">Profile</p><h2>\u4e2a\u4eba\u8d44\u6599</h2><span>\u5b66\u6821\u3001\u4e13\u4e1a\u548c SB ID \u4f1a\u8ddf\u7740\u8d26\u53f7\u4fdd\u5b58\u3002</span></div><button class="ghost-button" id="stableProfileBackButton" type="button">\u8fd4\u56de\u5b66\u4e60\u533a</button></header>
      <div class="stable-profile-layout">
        <section class="stable-profile-card"><div class="stable-profile-cover" id="stableProfileCover"><div class="stable-profile-avatar" id="stableProfileAvatar">SB</div></div><h3 id="stableProfileName">StudyBridge user</h3><p id="stableProfileSummary">\u8fd8\u6ca1\u6709\u586b\u5199\u5b66\u6821\u548c\u4e13\u4e1a\u3002</p><div class="stable-profile-facts" id="stableProfileFacts"></div></section>
        <form class="stable-profile-form" id="stableProfileForm">
          <label><span>\u59d3\u540d</span><input id="stableProfileNameInput" autocomplete="name" /></label>
          <label><span>\u5b66\u6821</span><input id="stableProfileSchoolInput" placeholder="University of Toronto" /></label>
          <label><span>\u4e13\u4e1a</span><input id="stableProfileMajorInput" placeholder="Finance / Computer Science" /></label>
          <label><span>SB ID</span><input id="stableProfileSbIdInput" autocomplete="off" spellcheck="false" placeholder="adam2026" /></label>
          <label><span>\u5934\u50cf\u56fe\u7247\u94fe\u63a5</span><input id="stableProfileAvatarInput" placeholder="https://..." /></label>
          <label><span>\u80cc\u666f\u56fe\u7247\u94fe\u63a5</span><input id="stableProfileBackgroundInput" placeholder="https://..." /></label>
          <button class="primary-button" type="submit">\u4fdd\u5b58\u8d44\u6599</button><p class="form-message" id="stableProfileMessage"></p>
        </form>
      </div>`;
    page.querySelector("#stableProfileBackButton")?.addEventListener("click", showStudy);
    page.querySelector("#stableProfileForm")?.addEventListener("submit", saveProfilePage);
    return page;
  }

  function applyProfile(user) {
    if (!user) return;
    const profile = user.profile || {};
    const name = user.name || "StudyBridge user";
    const school = profile.school || "";
    const major = profile.major || "";
    const sbId = profile.sbId || "";
    const avatar = $("#stableProfileAvatar");
    const cover = $("#stableProfileCover");
    if (avatar) {
      avatar.textContent = profile.avatarUrl ? "" : (name.trim().slice(0, 1).toUpperCase() || "S");
      avatar.style.backgroundImage = profile.avatarUrl ? `url("${profile.avatarUrl}")` : "";
    }
    if (cover) cover.style.backgroundImage = profile.backgroundUrl ? `url("${profile.backgroundUrl}")` : "";
    const title = $("#stableProfileName");
    if (title) title.textContent = name;
    const summary = $("#stableProfileSummary");
    if (summary) summary.textContent = [school, major].filter(Boolean).join(" \u00b7 ") || "\u8fd8\u6ca1\u6709\u586b\u5199\u5b66\u6821\u548c\u4e13\u4e1a\u3002";
    const facts = $("#stableProfileFacts");
    if (facts) {
      facts.innerHTML = [
        school ? `<span><b>\u5b66\u6821</b>${escapeHtml(school)}</span>` : "",
        major ? `<span><b>\u4e13\u4e1a</b>${escapeHtml(major)}</span>` : "",
        sbId ? `<span><b>SB ID:</b>${escapeHtml(sbId)}</span>` : ""
      ].filter(Boolean).join("");
    }
    const values = {
      stableProfileNameInput: name,
      stableProfileSchoolInput: school,
      stableProfileMajorInput: major,
      stableProfileSbIdInput: sbId,
      stableProfileAvatarInput: profile.avatarUrl || "",
      stableProfileBackgroundInput: profile.backgroundUrl || ""
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = $(`#${id}`);
      if (input && document.activeElement !== input) input.value = value;
    });
  }

  async function refreshProfilePage() {
    ensureProfilePage();
    try {
      const result = await api("/api/me");
      applyProfile(result.user);
    } catch (error) {
      const message = $("#stableProfileMessage");
      if (message) message.textContent = error.message;
    }
  }

  async function saveProfilePage(event) {
    event.preventDefault();
    const message = $("#stableProfileMessage");
    if (message) message.textContent = "\u6b63\u5728\u4fdd\u5b58...";
    try {
      const result = await api("/api/me/profile", {
        method: "PUT",
        body: {
          name: $("#stableProfileNameInput")?.value || "",
          school: $("#stableProfileSchoolInput")?.value || "",
          major: $("#stableProfileMajorInput")?.value || "",
          sbId: $("#stableProfileSbIdInput")?.value || "",
          avatarUrl: $("#stableProfileAvatarInput")?.value || "",
          backgroundUrl: $("#stableProfileBackgroundInput")?.value || ""
        }
      });
      applyProfile(result.user);
      if (message) message.textContent = "\u5df2\u4fdd\u5b58\u3002";
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  function installStyle() {
    if ($("#studybridge-stable-router-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-stable-router-style";
    style.textContent = `
      .sidebar [data-studybridge-stable-route] { cursor: pointer !important; pointer-events: auto !important; }
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage { display: block !important; height: 100vh !important; overflow-y: auto !important; overflow-x: hidden !important; background: #f4f6f9 !important; padding-bottom: 40px !important; }
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > .topbar,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #developerPanel,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #scheduleDashboard,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #chatArea,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #quickPrompts,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #chatForm { display: none !important; }
      body.studybridge-secondary-page:not(.creator-clean-mode) #profilePage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #classmatesPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #emailReplyPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #schedulePage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #studentRouteLoadingPage:not([hidden]) { display: block !important; visibility: visible !important; opacity: 1 !important; min-height: 100vh !important; }
      .stable-empty-page { margin: 24px; padding: 22px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--navy); }
      .stable-profile-page { min-height: 100%; background: #f4f6f9; }
      .stable-profile-layout { display: grid; grid-template-columns: minmax(260px, 360px) minmax(320px, 1fr); gap: 18px; padding: 24px; }
      .stable-profile-card, .stable-profile-form { border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 0 10px 28px rgba(25, 36, 58, 0.05); }
      .stable-profile-card { padding: 16px; }
      .stable-profile-cover { display: flex; align-items: end; min-height: 150px; margin: -16px -16px 18px; padding: 16px; border-radius: 8px 8px 0 0; background: linear-gradient(135deg, #1f3a5f, #60a87f); background-position: center; background-size: cover; }
      .stable-profile-avatar { display: grid; place-items: center; width: 72px; height: 72px; border: 4px solid #fff; border-radius: 8px; background: linear-gradient(145deg, #1f3a5f, #2f7d62); background-position: center; background-size: cover; color: #fff; font-size: 28px; font-weight: 900; }
      .stable-profile-facts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .stable-profile-facts span { display: inline-grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: #f8fbff; color: var(--navy); font-size: 12px; }
      .stable-profile-form { display: grid; gap: 12px; align-content: start; padding: 18px; }
      .stable-profile-form label { display: grid; gap: 6px; color: var(--navy); font-size: 13px; font-weight: 800; }
      @media (max-width: 860px) { .stable-profile-layout { grid-template-columns: 1fr; padding: 16px; } }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyle();
    decorateSidebar();
    setTimeout(decorateSidebar, 500);
    setTimeout(decorateSidebar, 1400);
  }

  window.addEventListener("click", handleNavigation, true);
  window.addEventListener("pointerdown", (event) => {
    const routeKey = routeFromElement(event.target);
    if (routeKey && routeKey !== "study") openRoute(routeKey);
  }, true);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") handleNavigation(event);
  }, true);
  window.studybridgeOpenStablePage = openRoute;
  window.studybridgeOpenStudentPage = (pageId) => {
    const found = Object.entries(routes).find(([, route]) => route.pageId === pageId);
    if (found) openRoute(found[0]);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  new MutationObserver(() => requestAnimationFrame(decorateSidebar)).observe(document.documentElement, { childList: true, subtree: true });
})();
