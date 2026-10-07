(() => {
  const VERSION = "20261007-final-sidebar-router-1";
  if (window.__studybridgeSidebarRouter === VERSION) return;
  window.__studybridgeSidebarRouter = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const STUDY_CHROME = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const ROUTES = {
    openStudyAreaButton: { pageId: "workspacePage", title: "Study Area", eyebrow: "ACADEMIC COACH" },
    openProfilePageButton: { pageId: "profilePage", title: "Profile", eyebrow: "PROFILE" },
    editProfileButton: { pageId: "profilePage", title: "Profile", eyebrow: "PROFILE" },
    profileCard: { pageId: "profilePage", title: "Profile", eyebrow: "PROFILE" },
    openSchoolCommunityButton: { pageId: "schoolCommunityPage", title: "Community", eyebrow: "COMMUNITY", opener: "studybridgeOpenCommunityPage", scripts: ["/school-community-patch.js?v=20261007-final-router"] },
    openClassmatesButton: { pageId: "classmatesPage", title: "Classmates", eyebrow: "CLASSMATES", opener: "studybridgeOpenClassmatesPage", scripts: ["/classmates-patch.js?v=20261007-final-router", "/classmates-request-patch.js?v=20261007-final-router", "/classmate-chat-bubble-fix.js?v=20261007-final-router", "/classmates-performance-patch.js?v=20261007-final-router"] },
    openEmailReplyButton: { pageId: "emailReplyPage", title: "Email Helper", eyebrow: "EMAIL COACH", opener: "studybridgeOpenEmailReplyPage", scripts: ["/email-reply-patch.js?v=20261007-final-router"] },
    openScheduleButton: { pageId: "schedulePage", title: "Schedule", eyebrow: "SCHEDULE", opener: "studybridgeOpenSchedulePage", scripts: ["/schedule-patch.js?v=20261007-final-router", "/schedule-dashboard-patch.js?v=20261007-final-router", "/schedule-notification-patch.js?v=20261007-final-router"] }
  };
  const SELECTOR = Object.keys(ROUTES).map((id) => `#${id}`).join(",");
  const loaded = new Map();
  let token = 0;

  const $ = (selector, root = document) => root.querySelector(selector);

  function workspace() {
    const page = $("#workspacePage") || $(".workspace");
    if (page && !page.id) page.id = "workspacePage";
    return page;
  }

  function appOpen() {
    const shell = $("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function setStatus(text) {
    const line = $("#statusLine");
    if (line) line.textContent = text;
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // The page can still switch without localStorage.
    }
  }

  function forceStudentMode() {
    try {
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Ignore private browsing/localStorage failures.
    }
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    $("#developerPanel")?.setAttribute("hidden", "");
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
  }

  function setActive(route) {
    Object.values(ROUTES).forEach((item) => {
      const control = item.navId ? $(`#${item.navId}`) : $(`#${Object.keys(ROUTES).find((id) => ROUTES[id] === item)}`);
      if (!control || item.pageId === "profilePage") return;
      const active = item.pageId === route.pageId;
      control.classList.toggle("active", active);
      control.setAttribute("aria-current", active ? "page" : "false");
    });
    $("#openProfilePageButton")?.classList.toggle("active", route.pageId === "profilePage");
  }

  function hideStudyChrome(hidden) {
    const root = workspace();
    if (!root) return;
    STUDY_CHROME.forEach((selector) => {
      const item = root.querySelector(`:scope > ${selector}`);
      if (item) item.hidden = hidden;
    });
  }

  function ensureFallback(route) {
    if (route.pageId === "workspacePage") return workspace();
    const root = workspace();
    if (!root) return null;
    let page = $(`#${route.pageId}`);
    if (!page) {
      page = document.createElement("section");
      page.id = route.pageId;
      page.className = "studybridge-direct-page";
      page.hidden = true;
      page.innerHTML = `
        <header class="topbar">
          <div>
            <p class="eyebrow">${route.eyebrow}</p>
            <h2>${route.title}</h2>
            <span>Opening page...</span>
          </div>
          <button class="ghost-button studybridge-router-back" type="button">Back to Study Area</button>
        </header>
        <div class="studybridge-direct-empty">Loading ${route.title}.</div>
      `;
    }
    if (page.parentElement !== root) root.appendChild(page);
    return page;
  }

  function show(route) {
    const root = workspace();
    if (!root) return false;
    forceStudentMode();
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";

    if (route.pageId === "workspacePage") {
      PAGES.forEach((id) => {
        const page = $(`#${id}`);
        if (page) page.hidden = true;
      });
      hideStudyChrome(false);
      document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-final-secondary");
      document.body.dataset.studybridgeActivePage = "workspacePage";
      setActive(route);
      remember("workspacePage");
      setStatus("Workspace is ready.");
      return true;
    }

    const page = ensureFallback(route);
    if (!page) return false;
    hideStudyChrome(true);
    PAGES.forEach((id) => {
      const item = $(`#${id}`);
      if (!item) return;
      const selected = id === route.pageId;
      item.hidden = !selected;
      if (selected) {
        item.removeAttribute("hidden");
        item.style.display = "";
        item.style.visibility = "visible";
        item.style.opacity = "1";
      }
    });
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-final-secondary");
    document.body.dataset.studybridgeActivePage = route.pageId;
    setActive(route);
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
    if (loaded.has(key)) return loaded.get(key);
    if (hasScript(src)) return Promise.resolve();
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 1600);
    });
    loaded.set(key, promise);
    return promise;
  }

  async function openById(id) {
    const route = ROUTES[id];
    if (!route || !appOpen()) return;
    const current = ++token;
    show(route);
    if (route.pageId === "workspacePage") return;
    await Promise.all((route.scripts || []).map((src) => loadScript(src, route.opener)));
    if (current !== token) return;
    if (route.opener && typeof window[route.opener] === "function") {
      try {
        await window[route.opener]();
      } catch (error) {
        console.warn("StudyBridge page opener failed:", error);
      }
    }
    for (const delay of [0, 80, 240, 600, 1200]) {
      if (current !== token) return;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      show(route);
    }
    const refresh = { schoolCommunityPage: "#refreshCommunityButton", classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton", schedulePage: "#refreshScheduleButton" }[route.pageId];
    if (refresh) setTimeout(() => $(refresh)?.click(), 180);
  }

  function routeId(event) {
    const direct = event.target.closest?.(SELECTOR);
    if (direct) return direct.id;
    const profile = event.target.closest?.("#profileCard");
    if (profile && !event.target.closest("input, textarea, select, form, button")) return "profileCard";
    return "";
  }

  function intercept(event) {
    const id = routeId(event);
    if (!id || !appOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openById(id);
  }

  function installStyle() {
    if ($("#studybridge-direct-router-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-direct-router-style";
    style.textContent = `
      #openProfilePageButton,#editProfileButton,#openStudyAreaButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#profileCard{pointer-events:auto!important;cursor:pointer!important}
      #openProfilePageButton *,#editProfileButton *,#openStudyAreaButton *,#openSchoolCommunityButton *,#openClassmatesButton *,#openEmailReplyButton *,#openScheduleButton *{pointer-events:none!important}
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage{display:block!important;visibility:visible!important;height:100vh!important;min-height:100vh!important;overflow:auto!important;background:#f4f6f9!important}
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>.topbar,
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#developerPanel,
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#scheduleDashboard,
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#chatArea,
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#quickPrompts,
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#chatForm{display:none!important}
      body.studybridge-final-secondary:not(.creator-clean-mode) #profilePage:not([hidden]),
      body.studybridge-final-secondary:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),
      body.studybridge-final-secondary:not(.creator-clean-mode) #classmatesPage:not([hidden]),
      body.studybridge-final-secondary:not(.creator-clean-mode) #emailReplyPage:not([hidden]),
      body.studybridge-final-secondary:not(.creator-clean-mode) #schedulePage:not([hidden]){display:block!important;visibility:visible!important;opacity:1!important}
      .studybridge-direct-page{min-height:100vh;background:#f4f6f9}.studybridge-direct-empty{padding:28px;color:var(--muted)}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    workspace();
    installStyle();
    Object.keys(ROUTES).forEach((id) => {
      const control = $(`#${id}`);
      if (control?.tagName === "BUTTON") control.type = "button";
    });
  }

  window.addEventListener("pointerdown", intercept, true);
  window.addEventListener("click", intercept, true);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") intercept(event);
  }, true);
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".studybridge-router-back")) return;
    event.preventDefault();
    openById("openStudyAreaButton");
  });

  window.studybridgeDirectOpenPage = openById;
  window.studybridgeFinalOpenPage = openById;
  window.studybridgeOpenStudentPage = (pageId) => {
    const entry = Object.entries(ROUTES).find(([, route]) => route.pageId === pageId);
    if (entry) openById(entry[0]);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  new MutationObserver(() => requestAnimationFrame(boot)).observe(document.documentElement, { childList: true, subtree: true });
})();
