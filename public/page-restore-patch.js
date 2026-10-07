(() => {
  const PAGE_KEY = "studybridgeLastOpenPage";
  const PAGE_IDS = ["workspacePage", "profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const SECONDARY_PAGE_IDS = PAGE_IDS.filter((id) => id !== "workspacePage");
  const NAV_TARGETS = {
    openStudyAreaButton: "workspacePage",
    openProfilePageButton: "profilePage",
    openSchoolCommunityButton: "schoolCommunityPage",
    openClassmatesButton: "classmatesPage",
    openEmailReplyButton: "emailReplyPage",
    openScheduleButton: "schedulePage"
  };
  const PAGE_TO_BUTTON = {
    workspacePage: "#openStudyAreaButton",
    profilePage: "#openProfilePageButton",
    schoolCommunityPage: "#openSchoolCommunityButton",
    classmatesPage: "#openClassmatesButton",
    emailReplyPage: "#openEmailReplyButton",
    schedulePage: "#openScheduleButton"
  };

  const startupTarget = localStorage.getItem(PAGE_KEY) || "";
  let restoring = false;
  let suppressWorkspaceRememberUntil = startupTarget && startupTarget !== "workspacePage" ? Date.now() + 15000 : 0;
  let restoreShieldTimer = null;

  function isSecondaryPage(pageId) {
    return SECONDARY_PAGE_IDS.includes(pageId);
  }

  function installRestoreShield() {
    if (!isSecondaryPage(startupTarget)) return;
    document.documentElement.classList.add("studybridge-restore-pending");
    if (document.querySelector("#studybridge-restore-shield-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-restore-shield-style";
    style.textContent = `
      html.studybridge-restore-pending #workspacePage {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
    restoreShieldTimer = setTimeout(clearRestoreShield, 9000);
  }

  function clearRestoreShield() {
    document.documentElement.classList.remove("studybridge-restore-pending");
    if (restoreShieldTimer) {
      clearTimeout(restoreShieldTimer);
      restoreShieldTimer = null;
    }
  }

  function appIsVisible() {
    const shell = document.querySelector("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function shouldSuppressWorkspaceRemember(pageId) {
    return pageId === "workspacePage" && Date.now() < suppressWorkspaceRememberUntil;
  }

  function remember(pageId) {
    if (!pageId || restoring || !appIsVisible()) return;
    if (shouldSuppressWorkspaceRemember(pageId)) return;
    if (pageId !== "workspacePage") suppressWorkspaceRememberUntil = 0;
    localStorage.setItem(PAGE_KEY, pageId);
  }

  function detectVisiblePage() {
    const visibleSecondary = SECONDARY_PAGE_IDS.find((id) => {
      const element = document.querySelector(`#${id}`);
      return element && !element.hidden;
    });
    if (visibleSecondary) return visibleSecondary;

    const developerPanel = document.querySelector("#developerPanel");
    if (developerPanel && !developerPanel.hidden) return "";

    const chatForm = document.querySelector("#chatForm");
    const chatArea = document.querySelector("#chatArea");
    if ((chatForm && !chatForm.hidden) || (chatArea && !chatArea.hidden)) return "workspacePage";
    return "";
  }

  function rememberVisiblePage() {
    if (!appIsVisible()) return;
    const visible = detectVisiblePage();
    if (visible) remember(visible);
  }

  function waitForElement(selector, timeout = 12000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const element = document.querySelector(selector);
        if (element || Date.now() - start > timeout) {
          clearInterval(timer);
          resolve(element || null);
        }
      }, 120);
    });
  }

  async function restorePage() {
    const targetPage = localStorage.getItem(PAGE_KEY);
    if (!targetPage || targetPage === "workspacePage") {
      clearRestoreShield();
      return;
    }
    const buttonSelector = PAGE_TO_BUTTON[targetPage];
    if (!buttonSelector) return;

    restoring = true;
    try {
      await waitForElement("#appShell", 12000);
      if (!appIsVisible()) return;
      const button = await waitForElement(buttonSelector, 12000);
      if (!button || !appIsVisible()) return;
      button.click();

      await waitForElement(`#${targetPage}`, 8000);
      const page = document.querySelector(`#${targetPage}`);
      if (page) {
        SECONDARY_PAGE_IDS.forEach((id) => {
          const element = document.querySelector(`#${id}`);
          if (element && id !== targetPage) element.hidden = true;
        });
        page.hidden = false;
        const workspacePage = document.querySelector("#workspacePage");
        if (workspacePage) {
          workspacePage.hidden = false;
          [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"].forEach((selector) => {
            const element = workspacePage.querySelector(`:scope > ${selector}`);
            if (element) element.hidden = true;
          });
        }
        document.body.dataset.studybridgeActivePage = targetPage;
        document.body.classList.toggle("study-sidebar-hidden", targetPage !== "workspacePage");
        clearRestoreShield();
      }
    } finally {
      setTimeout(() => {
        restoring = false;
        if (!isSecondaryPage(localStorage.getItem(PAGE_KEY))) clearRestoreShield();
      }, 500);
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const trigger = event.target.closest?.("button[id], .profile-card");
      if (!trigger) return;
      const pageId = NAV_TARGETS[trigger.id];
      if (pageId) {
        suppressWorkspaceRememberUntil = pageId === "workspacePage" ? 0 : Date.now() + 1200;
        localStorage.setItem(PAGE_KEY, pageId);
      }
    },
    true
  );

  const observer = new MutationObserver(() => {
    if (!restoring) rememberVisiblePage();
  });
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["hidden"] });

  installRestoreShield();
  setInterval(rememberVisiblePage, 1800);
  [0, 100, 260, 520, 900, 1600, 3200, 6000, 9500, 13000].forEach((delay) => setTimeout(restorePage, delay));
})();
