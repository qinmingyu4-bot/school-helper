(() => {
  const VERSION = "20261007-main-router-3";
  if (window.__studybridgeMainRouter === VERSION) return;
  window.__studybridgeMainRouter = VERSION;

  const LAST_PAGE_KEY = "studybridgeLastOpenPage";
  const STUDY_PAGE_ID = "workspacePage";
  const FEATURE_PAGE_IDS = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage", "routerLoadingPage"];
  const loadedScripts = new Map();
  let routeToken = 0;

  const label = {
    profile: "\u4e2a\u4eba\u8d44\u6599",
    community: "\u793e\u533a",
    classmates: "\u540c\u5b66",
    email: "\u90ae\u4ef6\u52a9\u624b",
    schedule: "\u65f6\u95f4\u8868",
    study: "\u5b66\u4e60\u533a",
    back: "\u8fd4\u56de\u5b66\u4e60\u533a",
    opening: "\u6b63\u5728\u6253\u5f00...",
    failed: "\u9875\u9762\u5df2\u8bf7\u6c42\u6253\u5f00\uff0c\u4f46\u539f\u529f\u80fd\u6ca1\u6709\u8fd4\u56de\u5185\u5bb9\u3002\u8bf7\u5237\u65b0\u540e\u518d\u8bd5\u3002",
    saving: "\u6b63\u5728\u4fdd\u5b58...",
    saved: "\u5df2\u4fdd\u5b58\u3002"
  };

  const routes = {
    profile: {
      pageId: "profilePage",
      icon: "\u4e2a",
      title: label.profile,
      selectors: ["#profileCard", "#openProfilePageButton", "#editProfileButton"],
      words: ["Profile", "SB ID"],
      ensure: ensureProfilePage,
      refresh: refreshProfilePage
    },
    community: {
      pageId: "schoolCommunityPage",
      icon: "\u793e",
      title: label.community,
      selectors: ["#openSchoolCommunityButton", ".community-entry"],
      words: [label.community, "Community"],
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-main-router-3"]
    },
    classmates: {
      pageId: "classmatesPage",
      icon: "\u53cb",
      title: label.classmates,
      selectors: ["#openClassmatesButton", ".classmates-entry"],
      words: [label.classmates, "Classmates", "SB ID"],
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-request-patch.js?v=20261007-main-router-3",
        "/classmate-chat-bubble-fix.js?v=20261007-main-router-3",
        "/classmates-performance-patch.js?v=20261007-main-router-3"
      ]
    },
    email: {
      pageId: "emailReplyPage",
      icon: "\u4fe1",
      title: label.email,
      selectors: ["#openEmailReplyButton", ".email-helper-entry"],
      words: [label.email, "Email"],
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-main-router-3"]
    },
    schedule: {
      pageId: "schedulePage",
      icon: "\u65f6",
      title: label.schedule,
      selectors: ["#openScheduleButton", ".schedule-entry"],
      words: [label.schedule, "Schedule"],
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-main-router-3",
        "/schedule-dashboard-patch.js?v=20261007-main-router-3",
        "/schedule-notification-patch.js?v=20261007-main-router-3"
      ]
    },
    study: {
      pageId: STUDY_PAGE_ID,
      icon: "\u5b66",
      title: label.study,
      selectors: ["#openStudyAreaButton", ".study-entry"],
      words: [label.study, "Academic Coach"]
    }
  };

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
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
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function appShell() {
    const shell = $("#appShell");
    if (shell) {
      shell.hidden = false;
      shell.removeAttribute("hidden");
      shell.style.display = "";
      shell.style.visibility = "visible";
    }
    return shell;
  }

  function workspaceShell() {
    const shell = $(".workspace") || $(`#${STUDY_PAGE_ID}`)?.parentElement || $(`#${STUDY_PAGE_ID}`);
    if (shell) {
      shell.hidden = false;
      shell.removeAttribute("hidden");
      shell.style.display = "";
      shell.style.visibility = "visible";
      shell.style.opacity = "1";
    }
    return shell;
  }

  function studyPage() {
    return $(`#${STUDY_PAGE_ID}`);
  }

  function setStatus(message) {
    const status = $("#statusLine");
    if (status) status.textContent = message;
  }

  function remember(pageId) {
    try {
      localStorage.setItem(LAST_PAGE_KEY, pageId);
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Navigation still works if storage is blocked.
    }
  }

  function resetModeClasses() {
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-nav-hotfix-page");
    document.documentElement.classList.remove("studybridge-restore-pending");
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
  }

  function hideFeaturePages(exceptPageId = "") {
    FEATURE_PAGE_IDS.forEach((pageId) => {
      const page = $(`#${pageId}`);
      if (!page) return;
      const show = pageId === exceptPageId;
      page.hidden = !show;
      page.toggleAttribute("hidden", !show);
      if (show) {
        page.style.display = "";
        page.style.visibility = "visible";
        page.style.opacity = "1";
      }
    });
  }

  function movePageToShell(page) {
    const shell = workspaceShell();
    if (!shell || !page) return false;
    if (page.parentElement !== shell) shell.appendChild(page);
    return true;
  }

  function pageHasContent(page) {
    if (!page) return false;
    const readable = String(page.textContent || "").replace(/\s+/g, " ").trim();
    return readable.length > 8 || Boolean(page.querySelector("input, textarea, select, button, article, form, .community-body, .classmates-body, .schedule-body, .email-helper-body"));
  }

  function markActive(activeKey) {
    Object.entries(routes).forEach(([key, route]) => {
      route.selectors.forEach((selector) => {
        $all(selector).forEach((element) => {
          if (selector === "#profileCard" || selector === "#editProfileButton") return;
          element.classList.toggle("active", key === activeKey);
          element.setAttribute("aria-current", key === activeKey ? "page" : "false");
        });
      });
    });
  }

  function showStudy() {
    appShell();
    const shell = workspaceShell();
    const study = studyPage();
    if (!shell || !study) return false;
    resetModeClasses();
    hideFeaturePages("");
    study.hidden = false;
    study.removeAttribute("hidden");
    study.style.display = "";
    study.style.visibility = "visible";
    study.style.opacity = "1";
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.dataset.studybridgeActivePage = STUDY_PAGE_ID;
    shell.scrollTop = 0;
    markActive("study");
    remember(STUDY_PAGE_ID);
    setStatus("Workspace is ready.");
    return true;
  }

  function showFeature(routeKey) {
    const route = routes[routeKey];
    const shell = workspaceShell();
    const study = studyPage();
    const page = route && $(`#${route.pageId}`);
    if (!shell || !study || !page || !pageHasContent(page)) return false;
    resetModeClasses();
    movePageToShell(page);
    study.hidden = true;
    study.setAttribute("hidden", "");
    hideFeaturePages(route.pageId);
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.dataset.studybridgeActivePage = route.pageId;
    shell.scrollTop = 0;
    markActive(routeKey);
    remember(route.pageId);
    setStatus(`${route.title} opened.`);
    return true;
  }

  function pageHeader(routeKey, subtitle = "") {
    const route = routes[routeKey];
    return `
      <header class="topbar router-page-header">
        <div>
          <p class="eyebrow">StudyBridge</p>
          <h2>${escapeHtml(route.title)}</h2>
          <span>${escapeHtml(subtitle)}</span>
        </div>
        <button class="ghost-button" type="button" data-router-back>${label.back}</button>
      </header>
    `;
  }

  function fallbackPage(routeKey, message) {
    const route = routes[routeKey];
    const shell = workspaceShell();
    if (!shell || !route) return null;
    let page = $(`#${route.pageId}`);
    if (!page) {
      page = document.createElement("section");
      page.id = route.pageId;
      shell.appendChild(page);
    }
    page.className = `${routeKey}-page router-feature-page`;
    page.innerHTML = `
      ${pageHeader(routeKey, message || label.failed)}
      <div class="router-page-body">
        <section class="router-card">${escapeHtml(message || label.failed)}</section>
      </div>
    `;
    page.querySelector("[data-router-back]")?.addEventListener("click", showStudy);
    return page;
  }

  function loadingPage(routeKey) {
    const route = routes[routeKey];
    const shell = workspaceShell();
    const study = studyPage();
    if (!shell || !study || !route) return null;
    let page = $("#routerLoadingPage");
    if (!page) {
      page = document.createElement("section");
      page.id = "routerLoadingPage";
      shell.appendChild(page);
    }
    page.className = "router-feature-page";
    page.innerHTML = `
      ${pageHeader(routeKey, label.opening)}
      <div class="router-page-body"><section class="router-card">${label.opening}</section></div>
    `;
    page.querySelector("[data-router-back]")?.addEventListener("click", showStudy);
    study.hidden = true;
    study.setAttribute("hidden", "");
    hideFeaturePages("routerLoadingPage");
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    markActive(routeKey);
    return page;
  }

  function scriptPath(src) {
    return new URL(src.split("?")[0], window.location.href).pathname;
  }

  function loadScript(src) {
    const key = scriptPath(src);
    if (loadedScripts.has(key)) return loadedScripts.get(key);
    const existing = Array.from(document.scripts).find((script) => {
      const current = script.getAttribute("src");
      return current && scriptPath(current) === key;
    });
    if (existing) {
      const promise = new Promise((resolve) => setTimeout(resolve, 180));
      loadedScripts.set(key, promise);
      return promise;
    }
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 2500);
    });
    loadedScripts.set(key, promise);
    return promise;
  }

  async function waitForOpener(route, timeoutMs = 2400) {
    if (!route.opener || typeof window[route.opener] === "function") return;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (typeof window[route.opener] === "function") return;
    }
  }

  async function callOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return false;
    try {
      await window[route.opener]();
      return true;
    } catch (error) {
      console.warn("StudyBridge opener failed:", error);
      return false;
    }
  }

  async function openRoute(routeKey) {
    const route = routes[routeKey];
    if (!route) return false;
    const token = ++routeToken;
    if (routeKey === "study") return showStudy();

    appShell();
    resetModeClasses();
    setStatus(`Opening ${route.title}...`);
    loadingPage(routeKey);

    if (route.ensure) route.ensure();
    await Promise.all((route.scripts || []).map(loadScript));
    await waitForOpener(route);
    if (token !== routeToken) return false;

    for (const delay of [0, 120, 300, 650, 1000]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (route.ensure) await route.ensure();
      if (route.refresh) await route.refresh();
      await callOpener(route);
      const page = $(`#${route.pageId}`);
      if (page) movePageToShell(page);
      if (showFeature(routeKey)) return true;
    }

    fallbackPage(routeKey, label.failed);
    return showFeature(routeKey);
  }

  function routeFromElement(target) {
    const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (!element || element.closest("input, textarea, select, option, form")) return "";
    const routed = element.closest("[data-studybridge-main-route]");
    if (routed) return routed.dataset.studybridgeMainRoute || "";
    for (const [key, route] of Object.entries(routes)) {
      if (route.selectors.some((selector) => element.closest(selector))) return key;
    }
    const sidebar = element.closest(".sidebar");
    if (!sidebar) return "";
    let node = element;
    while (node && node !== sidebar.parentElement) {
      const nodeText = String(node.textContent || "").replace(/\s+/g, " ");
      const found = Object.entries(routes).find(([, route]) => route.words.some((word) => nodeText.includes(word)));
      if (found) return found[0];
      if (node === sidebar) break;
      node = node.parentElement;
    }
    return "";
  }

  function handleNav(event) {
    const routeKey = routeFromElement(event.target);
    if (!routeKey) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(routeKey);
  }

  function bindRouteElement(element, routeKey) {
    if (!element || !routeKey || element.dataset.studybridgeMainRoute === routeKey) return;
    element.dataset.studybridgeMainRoute = routeKey;
    element.style.cursor = "pointer";
    element.style.pointerEvents = "auto";
    if (element.tagName === "BUTTON") element.type = "button";
  }

  function ensureFeatureButton(routeKey) {
    const route = routes[routeKey];
    if (!route || routeKey === "profile" || $(route.selectors[0])) return;
    const order = ["community", "classmates", "email", "schedule", "study"];
    const previousKey = order[order.indexOf(routeKey) - 1];
    const anchor = previousKey ? $(routes[previousKey].selectors[0]) : $("#profileCard");
    if (!anchor) return;
    const subtitles = {
      community: "\u5168\u90e8\u3001\u5b66\u6821\u548c\u4e13\u4e1a\u9891\u9053",
      classmates: "SB ID \u7533\u8bf7\u548c\u804a\u5929",
      email: "\u7406\u89e3\u90ae\u4ef6\u5e76\u751f\u6210\u82f1\u6587\u56de\u590d",
      schedule: "Deadline \u548c\u8bfe\u7a0b\u63d0\u9192",
      study: "\u8bfe\u7a0b\u8d44\u6599\u3001AI \u5bf9\u8bdd\u548c\u590d\u4e60\u8ba1\u5212"
    };
    const button = document.createElement("button");
    button.id = route.selectors[0].slice(1);
    button.type = "button";
    button.className =
      routeKey === "community" ? "community-entry" :
      routeKey === "classmates" ? "classmates-entry" :
      routeKey === "email" ? "email-helper-entry" :
      routeKey === "schedule" ? "schedule-entry" :
      "study-entry";
    button.innerHTML = `<span class="router-nav-icon">${route.icon}</span><span><strong>${route.title}</strong><span>${subtitles[routeKey]}</span></span>`;
    anchor.insertAdjacentElement("afterend", button);
  }

  function decorateSidebar() {
    ensureFeatureButton("community");
    ensureFeatureButton("classmates");
    ensureFeatureButton("email");
    ensureFeatureButton("schedule");
    ensureFeatureButton("study");
    Object.entries(routes).forEach(([routeKey, route]) => {
      route.selectors.forEach((selector) => {
        $all(selector).forEach((element) => bindRouteElement(element, routeKey));
      });
    });
  }

  function ensureProfilePage() {
    const shell = workspaceShell();
    if (!shell) return null;
    let page = $("#profilePage");
    if (!page) {
      page = document.createElement("section");
      page.id = "profilePage";
      page.className = "profile-page router-feature-page";
      page.innerHTML = `
        ${pageHeader("profile", "\u5b66\u6821\u3001\u4e13\u4e1a\u3001SB ID \u4f1a\u8ddf\u8d26\u53f7\u4fdd\u5b58\u3002")}
        <div class="router-page-body">
          <section class="router-card">
            <form id="routerProfileForm" class="router-profile-form">
              <label><span>\u59d3\u540d</span><input id="routerProfileName" autocomplete="name" /></label>
              <label><span>\u5b66\u6821</span><input id="routerProfileSchool" placeholder="University of Toronto" /></label>
              <label><span>\u4e13\u4e1a</span><input id="routerProfileMajor" placeholder="Finance / Computer Science" /></label>
              <label><span>SB ID</span><input id="routerProfileSbId" placeholder="adam2026" /></label>
              <label><span>\u5934\u50cf\u56fe\u7247\u94fe\u63a5</span><input id="routerProfileAvatar" /></label>
              <label><span>\u80cc\u666f\u56fe\u7247\u94fe\u63a5</span><input id="routerProfileBackground" /></label>
              <button class="primary-button" type="submit">\u4fdd\u5b58\u8d44\u6599</button>
              <p class="form-message" id="routerProfileMessage"></p>
            </form>
          </section>
        </div>
      `;
    }
    page.classList.add("router-feature-page");
    movePageToShell(page);
    page.querySelector("[data-router-back]")?.addEventListener("click", showStudy);
    const form = page.querySelector("#routerProfileForm");
    if (form && form.dataset.routerProfileBound !== "true") {
      form.dataset.routerProfileBound = "true";
      form.addEventListener("submit", saveProfilePage);
    }
    return page;
  }

  async function refreshProfilePage() {
    const page = ensureProfilePage();
    if (!page) return;
    try {
      const { user } = await api("/api/me");
      const profile = user.profile || {};
      const setValue = (selector, value) => {
        const input = page.querySelector(selector);
        if (input) input.value = value || "";
      };
      setValue("#routerProfileName", user.name || "");
      setValue("#routerProfileSchool", profile.school || "");
      setValue("#routerProfileMajor", profile.major || "");
      setValue("#routerProfileSbId", profile.sbId || "");
      setValue("#routerProfileAvatar", profile.avatarUrl || "");
      setValue("#routerProfileBackground", profile.backgroundUrl || "");
    } catch (error) {
      const message = page.querySelector("#routerProfileMessage");
      if (message) message.textContent = error.message;
    }
  }

  async function saveProfilePage(event) {
    event.preventDefault();
    const page = event.currentTarget.closest("#profilePage") || document;
    const message = page.querySelector("#routerProfileMessage");
    if (message) message.textContent = label.saving;
    const value = (selector) => page.querySelector(selector)?.value || "";
    try {
      await api("/api/me/profile", {
        method: "PUT",
        body: {
          name: value("#routerProfileName"),
          school: value("#routerProfileSchool"),
          major: value("#routerProfileMajor"),
          sbId: value("#routerProfileSbId"),
          avatarUrl: value("#routerProfileAvatar"),
          backgroundUrl: value("#routerProfileBackground")
        }
      });
      if (message) message.textContent = label.saved;
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  function installStyle() {
    if ($("#studybridge-main-router-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-main-router-style";
    style.textContent = `
      #appShell { min-height: 100dvh !important; }
      .workspace {
        min-width: 0 !important;
        min-height: 100dvh !important;
        height: 100dvh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
      .sidebar [data-studybridge-main-route] { cursor: pointer !important; pointer-events: auto !important; }
      .sidebar [data-studybridge-main-route] * { pointer-events: none !important; }
      .community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .study-entry,
      #openSchoolCommunityButton, #openClassmatesButton, #openEmailReplyButton, #openScheduleButton, #openStudyAreaButton {
        display: grid !important;
        grid-template-columns: 34px minmax(0, 1fr) !important;
        align-items: center !important;
        gap: 10px !important;
        width: 100% !important;
        min-height: 52px !important;
        padding: 9px 12px !important;
        border: 1px solid var(--line) !important;
        border-radius: 8px !important;
        background: #fff !important;
        color: var(--navy) !important;
        text-align: left !important;
        font-family: inherit !important;
        box-shadow: 0 8px 24px rgba(25, 36, 58, 0.04) !important;
      }
      .community-entry.active, .classmates-entry.active, .email-helper-entry.active, .schedule-entry.active, .study-entry.active,
      #openSchoolCommunityButton.active, #openClassmatesButton.active, #openEmailReplyButton.active, #openScheduleButton.active, #openStudyAreaButton.active {
        border-color: var(--green) !important;
      }
      .router-nav-icon,
      .community-entry-icon, .classmates-entry-icon, .email-helper-entry-icon, .schedule-entry-icon, .study-entry-icon,
      #openSchoolCommunityButton > span:first-child, #openClassmatesButton > span:first-child, #openEmailReplyButton > span:first-child,
      #openScheduleButton > span:first-child, #openStudyAreaButton > span:first-child {
        display: grid !important;
        place-items: center !important;
        width: 34px !important;
        height: 34px !important;
        border-radius: 8px !important;
        background: linear-gradient(145deg, #1f3a5f, #2f7d62) !important;
        color: #fff !important;
        font-size: 15px !important;
        font-weight: 900 !important;
      }
      .community-entry strong, .classmates-entry strong, .email-helper-entry strong, .schedule-entry strong, .study-entry strong,
      #openSchoolCommunityButton strong, #openClassmatesButton strong, #openEmailReplyButton strong, #openScheduleButton strong, #openStudyAreaButton strong {
        display: block !important;
        color: var(--navy) !important;
        font-size: 14px !important;
        font-weight: 850 !important;
        line-height: 1.15 !important;
      }
      .community-entry span span, .classmates-entry span span, .email-helper-entry span span, .schedule-entry span span, .study-entry span span,
      #openSchoolCommunityButton span span, #openClassmatesButton span span, #openEmailReplyButton span span, #openScheduleButton span span, #openStudyAreaButton span span {
        display: block !important;
        color: var(--muted) !important;
        font-size: 12px !important;
        line-height: 1.2 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      #workspacePage[hidden] { display: none !important; }
      body.studybridge-secondary-page:not(.creator-clean-mode) .workspace { background: #f4f6f9 !important; }
      .router-feature-page {
        display: block;
        min-height: 100dvh;
        background: #f4f6f9;
      }
      .router-feature-page[hidden] { display: none !important; }
      .router-page-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
      }
      .router-page-body {
        display: grid;
        gap: 14px;
        padding: 22px 28px 64px;
      }
      .router-card {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fff;
        padding: 18px;
        box-shadow: 0 12px 30px rgba(25, 36, 58, 0.05);
      }
      .router-profile-form {
        display: grid;
        gap: 12px;
        max-width: 620px;
      }
      .router-profile-form label {
        display: grid;
        gap: 6px;
        color: var(--navy);
        font-weight: 850;
      }
    `;
    document.head.appendChild(style);
  }

  function restoreRememberedPage() {
    try {
      const stored = localStorage.getItem(LAST_PAGE_KEY);
      const found = Object.entries(routes).find(([, route]) => route.pageId === stored);
      if (found && found[0] !== "study") openRoute(found[0]);
    } catch {
      // Ignore restore errors.
    }
  }

  function boot() {
    installStyle();
    decorateSidebar();
    setTimeout(decorateSidebar, 200);
    setTimeout(decorateSidebar, 900);
    setTimeout(restoreRememberedPage, 350);
  }

  window.addEventListener("click", handleNav, true);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    handleNav(event);
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

  new MutationObserver(() => requestAnimationFrame(decorateSidebar)).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();