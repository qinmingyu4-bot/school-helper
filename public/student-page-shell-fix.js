(() => {
  const VERSION = "20261007-1";
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

  const TRIGGERS = Object.keys(TARGETS).map((id) => "#" + id).join(", ");
  const scriptPromises = new Map();
  let pointerAt = 0;
  let pointerId = "";
  let lockPage = "";
  let lockUntil = 0;
  let lockTimer = 0;

  function $(selector) { return document.querySelector(selector); }

  function workspace() {
    const page = $("#workspacePage") || $(".workspace");
    if (page && !page.id) page.id = "workspacePage";
    return page;
  }

  function appOpen() {
    const shell = $("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function setStatus(text) {
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function forceStudentMode() {
    try { localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {}
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
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

  function showPage(pageId, silent = false) {
    const root = workspace();
    if (!root) return false;
    const target = pageId === "workspacePage" ? root : $("#" + pageId);
    if (!target) return false;

    forceStudentMode();
    root.hidden = false;
    root.style.visibility = "visible";

    if (pageId === "workspacePage") {
      PAGES.forEach((id) => { const page = $("#" + id); if (page) page.hidden = true; });
      hideWorkspaceChrome(false);
      document.body.classList.remove("study-sidebar-hidden", "studybridge-secondary-page");
    } else {
      PAGES.forEach((id) => { const page = $("#" + id); if (page) page.hidden = id !== pageId; });
      target.hidden = false;
      target.removeAttribute("hidden");
      target.style.display = "";
      target.style.visibility = "visible";
      hideWorkspaceChrome(true);
      document.body.classList.add("study-sidebar-hidden", "studybridge-secondary-page");
    }

    document.body.dataset.studybridgeActivePage = pageId;
    setActive(pageId);
    remember(pageId);
    if (!silent) setStatus(pageId === "workspacePage" ? "Workspace is ready." : "Page opened.");
    return true;
  }

  function lockVisible(pageId) {
    lockPage = pageId;
    lockUntil = Date.now() + (pageId === "workspacePage" ? 1200 : 5200);
    if (lockTimer) return;
    lockTimer = setInterval(() => {
      if (!lockPage || Date.now() > lockUntil || !appOpen()) {
        clearInterval(lockTimer);
        lockTimer = 0;
        lockPage = "";
        return;
      }
      showPage(lockPage, true);
    }, 90);
  }

  function pathOf(src) { return new URL(src.split("?")[0], location.href).pathname; }

  function existingScript(src) {
    const path = pathOf(src);
    return Array.from(document.scripts).find((script) => {
      const current = script.getAttribute("src");
      return current && new URL(current, location.href).pathname === path;
    });
  }

  function loadScript(src, opener) {
    if (opener && typeof window[opener] === "function") return Promise.resolve();
    const path = pathOf(src);
    if (scriptPromises.has(path)) return scriptPromises.get(path);
    const existing = existingScript(src);
    if (existing) {
      const promise = new Promise((resolve) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", resolve, { once: true });
        setTimeout(resolve, 900);
      });
      scriptPromises.set(path, promise);
      return promise;
    }
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.defer = true;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 1600);
    });
    scriptPromises.set(path, promise);
    return promise;
  }

  async function callOpener(target) {
    const opener = target.opener ? window[target.opener] : null;
    if (typeof opener !== "function") return false;
    try { await opener(); return true; } catch (error) { console.warn("StudyBridge opener failed:", error); return false; }
  }

  async function openTarget(buttonId) {
    const target = TARGETS[buttonId];
    if (!target || !appOpen()) return;
    forceStudentMode();
    setStatus("Opening page...");
    await Promise.all((target.scripts || []).map((src) => loadScript(src, target.opener)));
    for (const delay of [0, 80, 180, 360, 720, 1200]) {
      if (delay) await wait(delay);
      await callOpener(target);
      if (showPage(target.pageId)) {
        lockVisible(target.pageId);
        refreshPage(target.pageId);
        return;
      }
    }
    setStatus("Page did not open. Please refresh once.");
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
    }, 150);
  }

  function triggerFromEvent(event) {
    const direct = event.target.closest?.(TRIGGERS);
    if (direct) return direct;
    const card = event.target.closest?.("#profileCard");
    if (card && !event.target.closest("form, input, textarea, select")) return card;
    return null;
  }

  function onPointer(event) {
    const trigger = triggerFromEvent(event);
    if (!trigger) return;
    pointerAt = Date.now();
    pointerId = trigger.id;
    openTarget(trigger.id);
  }

  function onClick(event) {
    const trigger = triggerFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (Date.now() - pointerAt > 600 || pointerId !== trigger.id) openTarget(trigger.id);
  }

  function onKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const trigger = triggerFromEvent(event);
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
      if (!element || id === "profileCard") return;
      if (element.tagName === "BUTTON") element.type = "button";
      element.style.pointerEvents = "auto";
      element.onclick = onClick;
      element.onpointerdown = onPointer;
      if (element.dataset.studentShellFix === "true") return;
      element.dataset.studentShellFix = "true";
      element.addEventListener("pointerdown", onPointer, true);
      element.addEventListener("click", onClick, true);
      element.addEventListener("keydown", onKeydown, true);
    });
  }

  function installStyle() {
    if ($("#studybridge-student-page-shell-fix-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-student-page-shell-fix-style";
    style.textContent = `
      #openProfilePageButton,#openStudyAreaButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#profileCard{pointer-events:auto!important;cursor:pointer!important}
      #openProfilePageButton *,#openStudyAreaButton *,#openSchoolCommunityButton *,#openClassmatesButton *,#openEmailReplyButton *,#openScheduleButton *{pointer-events:none!important}
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage{display:block!important;visibility:visible!important;height:100dvh!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f4f6f9!important}
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

  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeydown, true);
  new MutationObserver(() => {
    bindTriggers();
    if (lockPage && Date.now() < lockUntil) showPage(lockPage, true);
  }).observe(document.documentElement, { childList: true, subtree: true });
  installStyle();
  bindTriggers();
  [350, 900, 1800, 3200].forEach((delay) => setTimeout(restoreLastPage, delay));
})();
