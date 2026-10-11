(() => {
  const VERSION = "20261008-scroll-only-1.0.70";
  if (window.__studybridgeStudyScrollHardeningV2 === VERSION) return;
  window.__studybridgeStudyScrollHardeningV2 = VERSION;

  const STYLE_ID = "studybridge-study-scroll-hardening";
  let frame = 0;

  function isVisible(element) {
    return Boolean(element && !element.hidden && element.offsetParent !== null);
  }

  function getWorkspace() {
    return document.querySelector("#workspacePage") || document.querySelector(".workspace");
  }

  function getChatArea() {
    const chatArea = document.querySelector("#chatArea");
    return isVisible(chatArea) ? chatArea : null;
  }

  function installStyle() {
    let style = document.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      html,
      body {
        height: 100% !important;
        overflow: hidden !important;
        scroll-behavior: auto !important;
      }

      #appShell,
      .app-shell {
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow: hidden !important;
      }

      .sidebar {
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        scroll-behavior: auto !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
      }

      #workspacePage,
      .workspace {
        min-height: 0 !important;
      }

      body:not(.studybridge-secondary-page):not(.creator-clean-mode):not(.sb-route-page):not(.sb-route-developer) #workspacePage,
      body:not(.studybridge-secondary-page):not(.creator-clean-mode):not(.sb-route-page):not(.sb-route-developer) .workspace {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow: hidden !important;
      }

      body.studybridge-secondary-page #workspacePage,
      body.studybridge-secondary-page .workspace,
      body.sb-route-page #workspacePage,
      body.sb-route-page .workspace,
      body.sb-route-developer #workspacePage,
      body.sb-route-developer .workspace,
      body.creator-clean-mode #workspacePage,
      body.creator-clean-mode .workspace {
        display: block !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea {
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior-y: contain !important;
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-y !important;
        scrollbar-gutter: stable !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea .message {
        flex: 0 0 auto !important;
      }

      #sbDirectNav,
      .sb-direct-nav {
        display: none !important;
      }
    `;
  }

  function removeInjectedNav() {
    document.querySelectorAll("#sbDirectNav, .sb-direct-nav").forEach((node) => node.remove());
  }

  function markScrollable() {
    const chatArea = getChatArea();
    if (!chatArea) return;
    chatArea.dataset.studyScrollHardening = "native";
    if (!chatArea.hasAttribute("tabindex")) chatArea.tabIndex = 0;
  }

  function repairBlankWorkspace() {
    const workspace = getWorkspace();
    if (!workspace) return;
    const activePage = document.body.dataset.studybridgeActivePage || "";
    const secondaryPages = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
    if (
      document.body.classList.contains("sb-route-page") ||
      document.body.classList.contains("sb-route-developer") ||
      document.body.classList.contains("studybridge-secondary-page") ||
      document.body.classList.contains("creator-clean-mode") ||
      activePage === "developerPanel" ||
      secondaryPages.includes(activePage)
    ) {
      return;
    }
    const hasStudyChrome = ["#chatArea", "#chatForm", "#quickPrompts"].some((selector) => {
      const node = workspace.querySelector(`:scope > ${selector}`);
      return node && !node.hidden;
    });
    const hasPage = ["#profilePage", "#schoolCommunityPage", "#classmatesPage", "#emailReplyPage", "#schedulePage"].some((selector) => {
      const node = document.querySelector(selector);
      return node && !node.hidden;
    });
    const developerPanel = document.querySelector("#developerPanel");
    const hasDeveloper = developerPanel && !developerPanel.hidden;
    if (hasStudyChrome || hasPage || hasDeveloper) return;
    document.body.classList.remove("studybridge-secondary-page", "creator-clean-mode", "admin-boundary-active");
    ["#workspacePage > .topbar", "#workspacePage > #scheduleDashboard", "#workspacePage > #chatArea", "#workspacePage > #quickPrompts", "#workspacePage > #chatForm"].forEach((selector) => {
      const node = document.querySelector(selector);
      if (!node) return;
      node.hidden = false;
      node.removeAttribute("hidden");
      node.style.display = "";
      node.style.visibility = "visible";
    });
  }

  function scheduleWork() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      installStyle();
      removeInjectedNav();
      markScrollable();
      repairBlankWorkspace();
    });
  }

  installStyle();
  scheduleWork();
  window.addEventListener("resize", scheduleWork);
  document.addEventListener("visibilitychange", scheduleWork);
  document.addEventListener(
    "pointerdown",
    (event) => {
      const chatArea = getChatArea();
      if (chatArea && chatArea.contains(event.target) && event.target === chatArea) {
        chatArea.focus({ preventScroll: true });
      }
    },
    true
  );

  new MutationObserver(scheduleWork).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"]
  });
})();
