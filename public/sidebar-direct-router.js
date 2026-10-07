(() => {
  if (window.__studybridgeSidebarDirectRouter === "20261007-4") return;
  window.__studybridgeSidebarDirectRouter = "20261007-4";

  const PAGE_KEY = "studybridgeLastOpenPage";
  const PAGE_IDS = ["workspacePage", "profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const TARGETS = {
    openStudyAreaButton: { pageId: "workspacePage" },
    openProfilePageButton: { pageId: "profilePage" },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-direct-router"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-direct-router",
        "/classmates-request-patch.js?v=20261007-direct-router",
        "/classmate-chat-bubble-fix.js?v=20261007-direct-router",
        "/classmates-performance-patch.js?v=20261007-direct-router"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-direct-router"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-direct-router",
        "/schedule-dashboard-patch.js?v=20261007-direct-router",
        "/schedule-notification-patch.js?v=20261007-direct-router"
      ]
    }
  };

  const scriptPromises = (window.__studybridgeDirectRouterScripts ||= new Map());
  let visibleLockTimer = 0;
  let lastPointerOpenAt = 0;
  let lastPointerButtonId = "";

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function appIsOpen() {
    const appShell = document.querySelector("#appShell");
    return Boolean(appShell && !appShell.hidden);
  }

  function forceStudentMode() {
    try {
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Browser storage can be restricted.
    }
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    const developerPanel = document.querySelector("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    const studentButton = document.querySelector("#studentViewButton");
    const creatorButton = document.querySelector("#creatorViewButton");
    if (studentButton) studentButton.classList.add("active");
    if (creatorButton) creatorButton.classList.remove("active");
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
    } catch {
      // Browser storage can be restricted.
    }
  }

  function setStatus(text) {
    const statusLine = document.querySelector("#statusLine");
    if (statusLine && text) statusLine.textContent = text;
  }

  function setSidebarState(pageId) {
    document.body.dataset.studybridgeActivePage = pageId;
    document.body.classList.toggle("study-sidebar-hidden", pageId !== "workspacePage");
    Object.entries(TARGETS).forEach(([buttonId, target]) => {
      const button = document.querySelector(`#${buttonId}`);
      if (!button) return;
      button.classList.toggle("active", target.pageId === pageId);
      button.setAttribute("aria-current", target.pageId === pageId ? "page" : "false");
    });
  }

  function setStudyWorkspaceChromeHidden(hidden) {
    const workspacePage = document.querySelector("#workspacePage");
    if (!workspacePage) return;
    [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"].forEach((selector) => {
      const element = workspacePage.querySelector(`:scope > ${selector}`);
      if (element) element.hidden = hidden;
    });
  }

  function removeDuplicateScheduleDashboards() {
    const dashboards = Array.from(document.querySelectorAll("#scheduleDashboard"));
    dashboards.slice(1).forEach((element) => element.remove());
    const first = dashboards[0];
    const topbar = document.querySelector("#workspacePage > .topbar");
    if (first && topbar && first.previousElementSibling !== topbar) {
      topbar.insertAdjacentElement("afterend", first);
    }
  }

  function showOnly(pageId) {
    const targetPage = document.querySelector(`#${pageId}`);
    if (!targetPage) return false;
    forceStudentMode();
    removeDuplicateScheduleDashboards();
    const workspacePage = document.querySelector("#workspacePage");
    if (workspacePage) workspacePage.hidden = false;
    PAGE_IDS.forEach((id) => {
      const page = document.querySelector(`#${id}`);
      if (!page) return;
      if (id === "workspacePage") {
        page.hidden = false;
        return;
      }
      page.hidden = id !== pageId;
    });
    setStudyWorkspaceChromeHidden(pageId !== "workspacePage");
    setSidebarState(pageId);
    remember(pageId);
    if (pageId === "workspacePage") {
      const chatArea = document.querySelector("#chatArea");
      if (chatArea) setTimeout(() => (chatArea.scrollTop = chatArea.scrollHeight), 30);
    }
    return true;
  }

  function keepVisible(pageId, duration = 1800) {
    clearInterval(visibleLockTimer);
    const started = Date.now();
    const tick = () => {
      removeDuplicateScheduleDashboards();
      showOnly(pageId);
      if (Date.now() - started > duration) {
        clearInterval(visibleLockTimer);
        visibleLockTimer = 0;
      }
    };
    tick();
    visibleLockTimer = setInterval(tick, 90);
  }

  function findExistingScript(src) {
    const pathname = new URL(src.split("?")[0], window.location.href).pathname;
    return Array.from(document.scripts).find((script) => {
      const scriptSrc = script.getAttribute("src");
      return scriptSrc && new URL(scriptSrc, window.location.href).pathname === pathname;
    });
  }

  function scriptAlreadyUsable(src, openerName) {
    if (openerName && typeof window[openerName] === "function") return true;
    const existing = findExistingScript(src);
    return Boolean(existing && existing.dataset.loaded === "true");
  }

  function loadScript(src, openerName) {
    const pathname = new URL(src.split("?")[0], window.location.href).pathname;
    const key = pathname;
    if (scriptAlreadyUsable(src, openerName)) return Promise.resolve();
    if (scriptPromises.has(key)) return scriptPromises.get(key);
    const existing = findExistingScript(src);

    if (existing) {
      const promise = new Promise((resolve) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", resolve, { once: true });
        setTimeout(resolve, 1800);
      });
      scriptPromises.set(key, promise);
      return promise;
    }

    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.defer = true;
      script.src = src;
      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
          resolve();
        },
        { once: true }
      );
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 1800);
    });
    scriptPromises.set(key, promise);
    return promise;
  }

  async function callOpener(target) {
    const opener = target.opener ? window[target.opener] : null;
    if (typeof opener !== "function") return false;
    try {
      await opener();
      forceStudentMode();
      showOnly(target.pageId);
      return true;
    } catch (error) {
      console.warn("StudyBridge direct router opener failed:", error);
      return false;
    }
  }

  async function openTarget(buttonId) {
    const target = TARGETS[buttonId];
    if (!target || !appIsOpen()) return;
    forceStudentMode();
    remember(target.pageId);
    document.body.classList.add("studybridge-direct-routing");
    setStatus("Opening page...");

    try {
      if (target.pageId === "workspacePage" || target.pageId === "profilePage") {
        showOnly(target.pageId);
        keepVisible(target.pageId, 900);
        setStatus("Workspace is ready.");
        return;
      }

      await Promise.all((target.scripts || []).map((src) => loadScript(src, target.opener)));
      for (const delay of [0, 80, 180, 360, 700, 1200]) {
        if (delay) await wait(delay);
        if (await callOpener(target)) {
          keepVisible(target.pageId);
          setStatus("Page opened.");
          return;
        }
        if (showOnly(target.pageId)) {
          keepVisible(target.pageId);
          setStatus("Page opened.");
          return;
        }
      }
      setStatus("Page is still loading. Please click again or refresh.");
    } finally {
      setTimeout(() => document.body.classList.remove("studybridge-direct-routing"), 220);
    }
  }

  function findNavButton(event) {
    return event.target.closest?.(Object.keys(TARGETS).map((id) => `#${id}`).join(", "));
  }

  function handleClick(event) {
    const button = findNavButton(event);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (Date.now() - lastPointerOpenAt > 500 || lastPointerButtonId !== button.id) {
      openTarget(button.id);
    }
  }

  function handlePointer(event) {
    const button = findNavButton(event);
    if (!button) return;
    lastPointerOpenAt = Date.now();
    lastPointerButtonId = button.id;
    openTarget(button.id);
  }

  function attachButtonHandlers() {
    Object.keys(TARGETS).forEach((buttonId) => {
      const button = document.querySelector(`#${buttonId}`);
      if (!button || button.dataset.directRouterReady === "true") return;
      button.dataset.directRouterReady = "true";
      button.onclick = handleClick;
      button.onpointerdown = handlePointer;
      button.addEventListener("pointerdown", handlePointer, true);
      button.addEventListener("click", handleClick, true);
      button.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          openTarget(buttonId);
        },
        true
      );
    });
  }

  function installStyle() {
    if (document.querySelector("#studybridge-sidebar-direct-router-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-sidebar-direct-router-style";
    style.textContent = `
      #openStudyAreaButton,
      #openProfilePageButton,
      #openSchoolCommunityButton,
      #openClassmatesButton,
      #openEmailReplyButton,
      #openScheduleButton {
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      #openStudyAreaButton *,
      #openProfilePageButton *,
      #openSchoolCommunityButton *,
      #openClassmatesButton *,
      #openEmailReplyButton *,
      #openScheduleButton * {
        pointer-events: none !important;
      }

      html body[data-studybridge-active-page]:not([data-studybridge-active-page="workspacePage"]) #workspacePage,
      html body[data-studybridge-active-page]:not([data-studybridge-active-page="workspacePage"]) #workspacePage:not([hidden]) {
        display: block !important;
        visibility: visible !important;
        height: 100dvh !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
      }

      html body:not(.creator-clean-mode)[data-studybridge-active-page]:not([data-studybridge-active-page="workspacePage"]) #workspacePage > .topbar,
      html body:not(.creator-clean-mode)[data-studybridge-active-page]:not([data-studybridge-active-page="workspacePage"]) #workspacePage > #developerPanel,
      html body:not(.creator-clean-mode)[data-studybridge-active-page]:not([data-studybridge-active-page="workspacePage"]) #workspacePage > #scheduleDashboard,
      html body:not(.creator-clean-mode)[data-studybridge-active-page]:not([data-studybridge-active-page="workspacePage"]) #workspacePage > #chatArea,
      html body:not(.creator-clean-mode)[data-studybridge-active-page]:not([data-studybridge-active-page="workspacePage"]) #workspacePage > #quickPrompts,
      html body:not(.creator-clean-mode)[data-studybridge-active-page]:not([data-studybridge-active-page="workspacePage"]) #workspacePage > #chatForm {
        display: none !important;
      }

      html body:not(.creator-clean-mode) #workspacePage[hidden] {
        visibility: hidden !important;
      }

      html body[data-studybridge-active-page="workspacePage"] #workspacePage:not([hidden]) {
        visibility: visible !important;
      }

      html body #profilePage[hidden],
      html body #schoolCommunityPage[hidden],
      html body #classmatesPage[hidden],
      html body #emailReplyPage[hidden],
      html body #schedulePage[hidden] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  window.studybridgeDirectOpenPage = openTarget;
  window.addEventListener("pointerdown", handlePointer, true);
  window.addEventListener("click", handleClick, true);
  document.addEventListener("DOMContentLoaded", attachButtonHandlers, { once: true });
  new MutationObserver(() => {
    attachButtonHandlers();
    removeDuplicateScheduleDashboards();
  }).observe(document.documentElement, { childList: true, subtree: true });
  installStyle();
  attachButtonHandlers();
  removeDuplicateScheduleDashboards();
  setInterval(removeDuplicateScheduleDashboards, 1200);
})();
