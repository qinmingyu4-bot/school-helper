(() => {
  const VERSION = "20261007-2";
  if (window.__studybridgeStudentPageShellFix === VERSION) return;
  window.__studybridgeStudentPageShellFix = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const TARGETS = {
    openStudyAreaButton: { pageId: "workspacePage" },
    openProfilePageButton: { pageId: "profilePage" },
    profileCard: { pageId: "profilePage" },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-shell"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-shell",
        "/classmates-request-patch.js?v=20261007-shell",
        "/classmate-chat-bubble-fix.js?v=20261007-shell",
        "/classmates-performance-patch.js?v=20261007-shell"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-shell"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-shell",
        "/schedule-dashboard-patch.js?v=20261007-shell",
        "/schedule-notification-patch.js?v=20261007-shell"
      ]
    }
  };
  const scriptPromises = new Map();
  let openingPage = "";

  function $(selector) { return document.querySelector(selector); }
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function setStudentMode() {
    try { localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {}
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-page-switching", "studybridge-direct-routing");
    const developerPanel = $("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
  }

  function hideWorkspaceChrome(hidden) {
    const root = workspace();
    if (!root) return;
    [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"].forEach((selector) => {
      const element = root.querySelector(":scope > " + selector);
      if (element) element.hidden = hidden;
    });
  }

  function remember(pageId) {
    try { localStorage.setItem(PAGE_KEY, pageId); } catch {}
  }

  function setActive(pageId) {
    Object.entries(TARGETS).forEach(([buttonId, target]) => {
      if (buttonId === "profileCard") return;
      const button = $("#" + buttonId);
      if (!button) return;
      const active = target.pageId === pageId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function showPage(pageId) {
    const root = workspace();
    if (!root) return false;
    const target = pageId === "workspacePage" ? root : $("#" + pageId);
    if (!target) return false;

    setStudentMode();
    root.hidden = false;
    root.style.display = "";
    root.style.visibility = "visible";

    if (pageId === "workspacePage") {
      PAGES.forEach((id) => { const page = $("#" + id); if (page) page.hidden = true; });
      hideWorkspaceChrome(false);
      document.body.classList.remove("study-sidebar-hidden", "studybridge-secondary-page");
      setStatus("Workspace is ready.");
    } else {
      PAGES.forEach((id) => { const page = $("#" + id); if (page) page.hidden = id !== pageId; });
      target.hidden = false;
      target.removeAttribute("hidden");
      target.style.display = "";
      target.style.visibility = "visible";
      hideWorkspaceChrome(true);
      document.body.classList.add("study-sidebar-hidden", "studybridge-secondary-page");
      setStatus("Page opened.");
    }

    document.body.dataset.studybridgeActivePage = pageId;
    setActive(pageId);
    remember(pageId);
    return true;
  }

  function pathOf(src) { return new URL(src.split("?")[0], location.href).pathname; }
  function hasScript(src) {
    const path = pathOf(src);
    return Array.from(document.scripts).some((script) => {
      const current = script.getAttribute("src");
      return current && new URL(current, location.href).pathname === path;
    });
  }

  function loadScript(src, opener) {
    if (opener && typeof window[opener] === "function") return Promise.resolve();
    const path = pathOf(src);
    if (scriptPromises.has(path)) return scriptPromises.get(path);
    if (hasScript(src)) return Promise.resolve();
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.defer = true;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 1400);
    });
    scriptPromises.set(path, promise);
    return promise;
  }

  async function callOpener(target) {
    if (!target.opener || typeof window[target.opener] !== "function") return;
    try { await window[target.opener](); } catch (error) { console.warn("StudyBridge page opener failed:", error); }
  }

  async function openTarget(buttonId) {
    const target = TARGETS[buttonId];
    if (!target || !appOpen()) return;
    if (openingPage === target.pageId) return;
    openingPage = target.pageId;
    setStudentMode();
    setStatus("Opening page...");
    try {
      await Promise.all((target.scripts || []).map((src) => loadScript(src, target.opener)));
      await callOpener(target);
      showPage(target.pageId);
      await wait(120);
      showPage(target.pageId);
      refreshPage(target.pageId);
    } finally {
      setTimeout(() => { if (openingPage === target.pageId) openingPage = ""; }, 250);
    }
  }

  function refreshPage(pageId) {
    const selector = {
      schoolCommunityPage: "#refreshCommunityButton",
      classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton",
      schedulePage: "#refreshScheduleButton"
    }[pageId];
    if (!selector) return;
    setTimeout(() => {
      const button = $(selector);
      if (button && !button.disabled) button.click();
    }, 180);
  }

  function targetFromEvent(event) {
    const trigger = event.target.closest?.(Object.keys(TARGETS).map((id) => "#" + id).join(","));
    if (trigger) return trigger;
    const card = event.target.closest?.("#profileCard");
    if (card && !event.target.closest("input, textarea, select, form")) return card;
    return null;
  }

  function handleClick(event) {
    const trigger = targetFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openTarget(trigger.id);
  }

  function handleKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const trigger = targetFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openTarget(trigger.id);
  }

  function bindTriggers() {
    workspace();
    Object.keys(TARGETS).forEach((id) => {
      const element = $("#" + id);
      if (!element) return;
      if (element.tagName === "BUTTON") element.type = "button";
      element.style.pointerEvents = "auto";
      element.onclick = handleClick;
      if (element.dataset.studentShellBound === VERSION) return;
      element.dataset.studentShellBound = VERSION;
      element.addEventListener("click", handleClick, true);
      element.addEventListener("keydown", handleKeydown, true);
    });
  }

  function installStyle() {
    if ($("#studybridge-student-page-shell-fix-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-student-page-shell-fix-style";
    style.textContent = `
      #openProfilePageButton,#openStudyAreaButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#profileCard{pointer-events:auto!important;cursor:pointer!important}
      #openProfilePageButton *,#openStudyAreaButton *,#openSchoolCommunityButton *,#openClassmatesButton *,#openEmailReplyButton *,#openScheduleButton *{pointer-events:none!important}
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage{display:block!important;visibility:visible!important;min-height:100dvh!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f4f6f9!important}
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>.topbar,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#developerPanel,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#scheduleDashboard,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#chatArea,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#quickPrompts,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#chatForm{display:none!important}
      body.studybridge-secondary-page:not(.creator-clean-mode) #profilePage:not([hidden]),body.studybridge-secondary-page:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),body.studybridge-secondary-page:not(.creator-clean-mode) #classmatesPage:not([hidden]),body.studybridge-secondary-page:not(.creator-clean-mode) #emailReplyPage:not([hidden]),body.studybridge-secondary-page:not(.creator-clean-mode) #schedulePage:not([hidden]){display:block!important;visibility:visible!important;opacity:1!important}
    `;
    document.head.appendChild(style);
  }

  function restoreLastPage() {
    if (!appOpen()) return;
    let pageId = "";
    try { pageId = localStorage.getItem(PAGE_KEY) || ""; } catch {}
    if (!PAGES.includes(pageId)) return;
    const entry = Object.entries(TARGETS).find(([, target]) => target.pageId === pageId);
    if (entry) openTarget(entry[0]);
  }

  window.studybridgeDirectOpenPage = openTarget;
  window.studybridgeStableOpenPage = openTarget;
  window.studybridgeOpenStudentPage = (pageId) => {
    const entry = Object.entries(TARGETS).find(([, target]) => target.pageId === pageId);
    if (entry) openTarget(entry[0]);
  };

  installStyle();
  bindTriggers();
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeydown, true);
  new MutationObserver(bindTriggers).observe(document.documentElement, { childList: true, subtree: true });
  [300, 900, 1800].forEach((delay) => setTimeout(restoreLastPage, delay));
})();
