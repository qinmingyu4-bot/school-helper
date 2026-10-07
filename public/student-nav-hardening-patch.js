(() => {
  const PAGE_KEY = "studybridgeLastOpenPage";
  const STYLE_ID = "studybridge-student-nav-hardening";
  const PAGE_IDS = ["workspacePage", "profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const TARGETS = {
    openStudyAreaButton: { pageId: "workspacePage" },
    openProfilePageButton: { pageId: "profilePage" },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-2"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-nav-hardening",
        "/classmates-request-patch.js?v=20261007-2",
        "/classmate-chat-bubble-fix.js?v=20261007-nav-hardening",
        "/classmates-performance-patch.js?v=20261007-nav-hardening"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-2"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-2",
        "/schedule-dashboard-patch.js?v=20261007-nav-hardening",
        "/schedule-notification-patch.js?v=20261007-nav-hardening"
      ]
    }
  };
  const scriptPromises = (window.__studybridgeScriptPromises ||= new Map());

  function installStyle() {
    if (document.querySelector(`#${STYLE_ID}`)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body:not(.creator-clean-mode) #openStudyAreaButton,
      body:not(.creator-clean-mode) #openProfilePageButton,
      body:not(.creator-clean-mode) #openSchoolCommunityButton,
      body:not(.creator-clean-mode) #openClassmatesButton,
      body:not(.creator-clean-mode) #openEmailReplyButton,
      body:not(.creator-clean-mode) #openScheduleButton {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isCreatorMode() {
    const developerPanel = document.querySelector("#developerPanel");
    const creatorButton = document.querySelector("#creatorViewButton");
    return Boolean(
      document.body.classList.contains("creator-clean-mode") ||
        document.body.classList.contains("admin-boundary-active") ||
        (developerPanel && !developerPanel.hidden && creatorButton?.classList.contains("active"))
    );
  }

  function forceStudentMode() {
    try {
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Ignore browser storage restrictions.
    }
    const developerPanel = document.querySelector("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    const studentButton = document.querySelector("#studentViewButton");
    const creatorButton = document.querySelector("#creatorViewButton");
    if (studentButton && creatorButton) {
      studentButton.classList.add("active");
      creatorButton.classList.remove("active");
    }
  }

  function loadScriptOnce(src) {
    const cleanSrc = src.split("?")[0];
    const key = new URL(cleanSrc, window.location.href).pathname;
    const registry = (window.__studybridgeLoadedScripts ||= new Set());
    if (scriptPromises.has(key)) return scriptPromises.get(key);

    const existing = Array.from(document.scripts).find((script) => {
      const scriptSrc = script.getAttribute("src");
      return scriptSrc && new URL(scriptSrc, window.location.href).pathname === key;
    });

    if (registry.has(key) && !existing) {
      registry.add(key);
      return Promise.resolve();
    }

    if (existing) {
      registry.add(key);
      if (existing.dataset.loaded === "true") return Promise.resolve();
      const promise = new Promise((resolve) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", resolve, { once: true });
        setTimeout(resolve, 1200);
      });
      scriptPromises.set(key, promise);
      return promise;
    }

    registry.add(key);
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
          resolve();
        },
        { once: true }
      );
      script.addEventListener(
        "error",
        () => {
          registry.delete(key);
          resolve();
        },
        { once: true }
      );
      document.body.appendChild(script);
    });
    scriptPromises.set(key, promise);
    return promise;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
    } catch {
      // Ignore browser storage restrictions.
    }
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

  function showOnly(pageId) {
    const targetPage = document.querySelector(`#${pageId}`);
    if (!targetPage) return false;
    forceStudentMode();
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
    const developerPanel = document.querySelector("#developerPanel");
    if (developerPanel && pageId !== "workspacePage") developerPanel.hidden = true;
    setSidebarState(pageId);
    remember(pageId);
    if (pageId === "workspacePage") {
      const chatArea = document.querySelector("#chatArea");
      if (chatArea) setTimeout(() => (chatArea.scrollTop = chatArea.scrollHeight), 30);
    }
    return Boolean(document.querySelector(`#${pageId}`));
  }

  async function tryOpener(target) {
    const opener = target.opener ? window[target.opener] : null;
    if (typeof opener !== "function") return false;
    try {
      forceStudentMode();
      await opener();
      forceStudentMode();
      showOnly(target.pageId);
      setSidebarState(target.pageId);
      remember(target.pageId);
      return true;
    } catch (error) {
      console.warn("StudyBridge navigation opener failed:", error);
      return showOnly(target.pageId);
    }
  }

  async function openTarget(target) {
    if (!target) return;
    forceStudentMode();
    installStyle();
    document.body.classList.add("studybridge-page-switching");
    try {
      await Promise.all((target.scripts || []).map((src) => loadScriptOnce(src)));
      if (await tryOpener(target)) return;
      if (showOnly(target.pageId)) return;

      for (const delay of [80, 180, 360, 700, 1200]) {
        await wait(delay);
        if (await tryOpener(target)) return;
        if (showOnly(target.pageId)) return;
      }
    } finally {
      setTimeout(() => document.body.classList.remove("studybridge-page-switching"), 220);
    }
  }

  function handleNavigationClick(event) {
    const button = event.target.closest?.(Object.keys(TARGETS).map((id) => `#${id}`).join(", "));
    if (!button) return;
    const target = TARGETS[button.id];
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (typeof window.studybridgeDirectOpenPage === "function") {
      window.studybridgeDirectOpenPage(button.id);
      return;
    }
    openTarget(target);
  }

  installStyle();
  window.addEventListener("click", handleNavigationClick, true);
  document.addEventListener("click", handleNavigationClick, true);
})();
