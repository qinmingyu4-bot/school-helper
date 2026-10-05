(() => {
  const PAGE_KEY = "studybridgeLastOpenPage";
  const RESTORE_DONE_KEY = "studybridgeRestoreDoneAt";
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
  let restoring = false;

  function appIsVisible() {
    const shell = document.querySelector("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function remember(pageId) {
    if (!pageId || restoring || !appIsVisible()) return;
    localStorage.setItem(PAGE_KEY, pageId);
  }

  function rememberVisiblePage() {
    if (!appIsVisible()) return;
    const pages = ["schedulePage", "emailReplyPage", "classmatesPage", "schoolCommunityPage", "profilePage", "workspacePage"];
    const visible = pages.find((id) => {
      const element = document.querySelector(`#${id}`);
      return element && !element.hidden;
    });
    if (visible) remember(visible);
  }

  function waitForElement(selector, timeout = 9000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const element = document.querySelector(selector);
        if (element || Date.now() - start > timeout) {
          clearInterval(timer);
          resolve(element || null);
        }
      }, 160);
    });
  }

  async function restorePage() {
    const targetPage = localStorage.getItem(PAGE_KEY);
    if (!targetPage || targetPage === "workspacePage") return;
    const lastDone = Number(sessionStorage.getItem(RESTORE_DONE_KEY) || 0);
    if (Date.now() - lastDone < 2500) return;
    const buttonSelector = PAGE_TO_BUTTON[targetPage];
    if (!buttonSelector) return;
    restoring = true;
    try {
      await waitForElement("#appShell", 9000);
      if (!appIsVisible()) return;
      const button = await waitForElement(buttonSelector, 9000);
      if (!button || !appIsVisible()) return;
      button.click();
      sessionStorage.setItem(RESTORE_DONE_KEY, String(Date.now()));
    } finally {
      setTimeout(() => {
        restoring = false;
      }, 800);
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("button[id]");
      if (!button) return;
      const pageId = NAV_TARGETS[button.id];
      if (pageId) remember(pageId);
    },
    true
  );

  const observer = new MutationObserver(() => {
    if (!restoring) rememberVisiblePage();
  });
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["hidden"] });

  setInterval(rememberVisiblePage, 2500);
  setTimeout(restorePage, 900);
  setTimeout(restorePage, 2200);
  setTimeout(restorePage, 4200);
})();
