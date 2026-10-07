(() => {
  const VERSION = "20261007-2";
  if (window.__studybridgeStudentNavigationRescue === VERSION) return;
  window.__studybridgeStudentNavigationRescue = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const SECONDARY_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const TARGETS = {
    openStudyAreaButton: { pageId: "workspacePage", title: "Study Area", eyebrow: "STUDY" },
    openProfilePageButton: { pageId: "profilePage", title: "Profile", eyebrow: "PROFILE" },
    profileCard: { pageId: "profilePage", title: "Profile", eyebrow: "PROFILE" },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      title: "Community",
      eyebrow: "COMMUNITY",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-rescue"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      title: "Classmates",
      eyebrow: "CLASSMATES",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-rescue",
        "/classmates-request-patch.js?v=20261007-rescue",
        "/classmate-chat-bubble-fix.js?v=20261007-rescue",
        "/classmates-performance-patch.js?v=20261007-rescue"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      title: "Email Helper",
      eyebrow: "EMAIL COACH",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-rescue"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      title: "Schedule",
      eyebrow: "PLANNER",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-rescue",
        "/schedule-dashboard-patch.js?v=20261007-rescue",
        "/schedule-notification-patch.js?v=20261007-rescue"
      ]
    },
    scheduleDashboard: {
      pageId: "schedulePage",
      title: "Schedule",
      eyebrow: "PLANNER",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-rescue",
        "/schedule-dashboard-patch.js?v=20261007-rescue",
        "/schedule-notification-patch.js?v=20261007-rescue"
      ]
    }
  };

  const scriptPromises = new Map();
  let openingPage = "";

  function $(selector) {
    return document.querySelector(selector);
  }

  function workspaceShell() {
    return $(".workspace") || $("#workspacePage")?.parentElement;
  }

  function studyPage() {
    const page = $("#workspacePage") || $(".workspace > section:first-child");
    if (page && !page.id) page.id = "workspacePage";
    return page;
  }

  function appIsOpen() {
    const shell = $("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setStatus(text) {
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }

  function forceStudentMode() {
    try {
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Ignore storage failures.
    }
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-page-switching", "studybridge-direct-routing");
    const developerPanel = $("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
  }

  function setActiveNav(pageId) {
    Object.entries(TARGETS).forEach(([id, target]) => {
      if (id === "profileCard" || id === "scheduleDashboard") return;
      const control = $("#" + id);
      if (!control) return;
      const active = target.pageId === pageId;
      control.classList.toggle("active", active);
      control.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function moveToWorkspaceShell(page) {
    const shell = workspaceShell();
    if (page && shell && page.parentElement !== shell) shell.appendChild(page);
  }

  function ensureFallbackPage(target) {
    if (target.pageId === "workspacePage") return studyPage();
    const shell = workspaceShell();
    if (!shell) return null;
    let page = $("#" + target.pageId);
    if (!page) {
      page = document.createElement("section");
      page.id = target.pageId;
      page.className = "studybridge-rescue-page";
      page.hidden = true;
      page.innerHTML = `
        <header class="topbar">
          <div>
            <p class="eyebrow">${target.eyebrow || "STUDYBRIDGE"}</p>
            <h2>${target.title || "Page"}</h2>
            <span>Preparing this page...</span>
          </div>
          <button class="ghost-button studybridge-rescue-back" type="button">Back to Study Area</button>
        </header>
        <div class="studybridge-rescue-body">
          <p>Loading...</p>
        </div>
      `;
      shell.appendChild(page);
    }
    moveToWorkspaceShell(page);
    return page;
  }

  function showPage(pageId) {
    const shell = workspaceShell();
    const mainStudyPage = studyPage();
    if (!shell || !mainStudyPage) return false;
    const target = pageId === "workspacePage" ? mainStudyPage : $("#" + pageId);
    if (!target) return false;

    forceStudentMode();
    shell.hidden = false;
    shell.style.display = "";
    shell.style.visibility = "visible";

    if (pageId === "workspacePage") {
      mainStudyPage.hidden = false;
      SECONDARY_PAGES.forEach((id) => {
        const page = $("#" + id);
        if (page) page.hidden = true;
      });
      document.body.classList.remove("study-sidebar-hidden", "studybridge-secondary-page");
      setStatus("Workspace is ready.");
    } else {
      moveToWorkspaceShell(target);
      mainStudyPage.hidden = true;
      SECONDARY_PAGES.forEach((id) => {
        const page = $("#" + id);
        if (!page) return;
        page.hidden = id !== pageId;
        if (id === pageId) {
          page.removeAttribute("hidden");
          page.style.display = "";
          page.style.visibility = "visible";
        }
      });
      document.body.classList.add("study-sidebar-hidden", "studybridge-secondary-page");
      setStatus("Page opened.");
    }

    document.body.dataset.studybridgeActivePage = pageId;
    setActiveNav(pageId);
    remember(pageId);
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

  function loadScript(src, openerName) {
    if (openerName && typeof window[openerName] === "function") return Promise.resolve();
    const key = scriptKey(src);
    if (scriptPromises.has(key)) return scriptPromises.get(key);
    if (hasScript(src)) return Promise.resolve();

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
    scriptPromises.set(key, promise);
    return promise;
  }

  async function callOpener(target) {
    const opener = target.opener ? window[target.opener] : null;
    if (typeof opener !== "function") return;
    try {
      await opener();
    } catch (error) {
      console.warn("StudyBridge rescue opener failed:", error);
    }
  }

  function refreshVisiblePage(pageId) {
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

  async function openTargetById(id) {
    const target = TARGETS[id];
    if (!target || !appIsOpen()) return;
    if (openingPage === target.pageId) return;
    openingPage = target.pageId;

    setStatus("Opening page...");
    ensureFallbackPage(target);
    showPage(target.pageId);

    try {
      await Promise.all((target.scripts || []).map((src) => loadScript(src, target.opener)));
      await callOpener(target);
      await wait(80);
      ensureFallbackPage(target);
      showPage(target.pageId);
      await wait(180);
      showPage(target.pageId);
      refreshVisiblePage(target.pageId);
    } finally {
      setTimeout(() => {
        if (openingPage === target.pageId) openingPage = "";
      }, 220);
    }
  }

  function targetFromEvent(event) {
    const selector = Object.keys(TARGETS).map((id) => "#" + id).join(",");
    const trigger = event.target.closest?.(selector);
    if (trigger) return trigger.id;
    const profileCard = event.target.closest?.("#profileCard");
    if (profileCard && !event.target.closest("input, textarea, select, form")) return "profileCard";
    return "";
  }

  function intercept(event) {
    const id = targetFromEvent(event);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openTargetById(id);
  }

  function interceptKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const id = targetFromEvent(event);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openTargetById(id);
  }

  function restoreLastPage() {
    if (!appIsOpen()) return;
    let pageId = "";
    try {
      pageId = localStorage.getItem(PAGE_KEY) || "";
    } catch {
      pageId = "";
    }
    if (!pageId || pageId === "workspacePage") return;
    const targetEntry = Object.entries(TARGETS).find(([, target]) => target.pageId === pageId);
    if (targetEntry) openTargetById(targetEntry[0]);
  }

  function installStyle() {
    if ($("#studybridge-navigation-rescue-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-navigation-rescue-style";
    style.textContent = `
      .studybridge-rescue-page {
        min-height: 100vh;
        background: #f4f6f9;
      }

      .studybridge-rescue-page[hidden] {
        display: none !important;
      }

      .studybridge-rescue-body {
        padding: 28px;
        color: var(--muted);
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyle();
    document
      .querySelectorAll("#openProfilePageButton, #openSchoolCommunityButton, #openClassmatesButton, #openEmailReplyButton, #openScheduleButton, #openStudyAreaButton")
      .forEach((button) => {
        if (button.tagName === "BUTTON") button.type = "button";
        button.style.pointerEvents = "auto";
      });
    setTimeout(restoreLastPage, 250);
  }

  window.addEventListener("pointerdown", intercept, true);
  window.addEventListener("click", intercept, true);
  window.addEventListener("keydown", interceptKey, true);
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(".studybridge-rescue-back")) {
      event.preventDefault();
      openTargetById("openStudyAreaButton");
    }
  });

  window.studybridgeOpenStudentPage = (pageId) => {
    const entry = Object.entries(TARGETS).find(([, target]) => target.pageId === pageId);
    if (entry) openTargetById(entry[0]);
  };

  boot();
})();
