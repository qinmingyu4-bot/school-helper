(() => {
  if (window.__studybridgeStudyViewportShellV2) return;
  window.__studybridgeStudyViewportShellV2 = true;

  const STYLE_ID = "studybridge-study-chat-bottom-fix";
  let stickToBottom = true;
  let bootFrame = 0;
  let scrollTimer = 0;

  function isVisible(element) {
    return Boolean(element && !element.hidden && element.offsetParent !== null);
  }

  function ensureWorkspacePageId() {
    const workspace = document.querySelector(".workspace");
    if (workspace && !workspace.id) workspace.id = "workspacePage";
  }

  function syncAppLiveState() {
    const appShell = document.querySelector("#appShell");
    document.body.classList.toggle("studybridge-app-live", Boolean(appShell && !appShell.hidden));
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
        height: 100%;
      }

      body.studybridge-app-live {
        overflow: hidden !important;
      }

      body.studybridge-app-live #appShell {
        height: 100dvh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      body.studybridge-app-live .sidebar {
        height: 100dvh !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
      }

      body:not(.creator-clean-mode) #workspacePage:not([hidden]) {
        height: 100dvh !important;
        min-height: 0 !important;
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto auto !important;
        overflow: hidden !important;
      }

      body:not(.creator-clean-mode) #workspacePage .topbar,
      body:not(.creator-clean-mode) #workspacePage #scheduleDashboard,
      body:not(.creator-clean-mode) #workspacePage #quickPrompts,
      body:not(.creator-clean-mode) #workspacePage #chatForm {
        position: relative !important;
        z-index: 3 !important;
        flex: 0 0 auto !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea {
        position: relative !important;
        z-index: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-content: flex-start !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
        padding: 28px 28px 32px !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior-y: contain !important;
        scroll-behavior: auto !important;
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-y !important;
        scrollbar-gutter: stable !important;
        scroll-padding-top: 140px !important;
        scroll-padding-bottom: 130px !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea .message {
        flex: 0 0 auto !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea .message:first-child {
        margin-top: 0 !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea .message:last-child {
        margin-bottom: 20px !important;
      }

      body:not(.creator-clean-mode) #workspacePage #quickPrompts,
      body:not(.creator-clean-mode) #workspacePage #chatForm {
        background: #f4f6f9 !important;
      }

      body:not(.creator-clean-mode) #workspacePage #quickPrompts {
        padding-bottom: 8px !important;
      }
    `;
  }

  function chatArea() {
    const area = document.querySelector("#chatArea");
    return isVisible(area) ? area : null;
  }

  function distanceFromBottom(area) {
    return area.scrollHeight - area.scrollTop - area.clientHeight;
  }

  function updateStickiness() {
    const area = chatArea();
    if (!area) return;
    stickToBottom = distanceFromBottom(area) < 120;
  }

  function scrollStudyChatToBottom(force = false) {
    const area = chatArea();
    const workspacePage = document.querySelector("#workspacePage");
    if (!area || !isVisible(workspacePage)) return;
    if (!force && !stickToBottom) return;
    area.scrollTop = area.scrollHeight;
    stickToBottom = true;
  }

  function scheduleStudyChatScroll(force = false, delay = 40) {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => scrollStudyChatToBottom(force), delay);
  }

  function attachChatScrollListener() {
    const area = document.querySelector("#chatArea");
    if (!area || area.dataset.studyNativeScrollReady === "true") return;
    area.dataset.studyNativeScrollReady = "true";
    area.tabIndex = area.tabIndex >= 0 ? area.tabIndex : 0;
    area.addEventListener("scroll", updateStickiness, { passive: true });
    area.addEventListener("pointerdown", () => area.focus({ preventScroll: true }), { passive: true });
  }

  function isCreatorMode() {
    const developerPanel = document.querySelector("#developerPanel");
    return Boolean(developerPanel && !developerPanel.hidden);
  }

  function showStudentPage(pageId) {
    if (isCreatorMode()) return false;
    const targetPage = document.querySelector(`#${pageId}`);
    if (!targetPage) return false;
    const workspacePage = document.querySelector("#workspacePage");
    if (workspacePage) workspacePage.hidden = false;
    ["workspacePage", "profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"].forEach((id) => {
      const page = document.querySelector(`#${id}`);
      if (!page) return;
      if (id === "workspacePage") {
        page.hidden = false;
        return;
      }
      page.hidden = id !== pageId;
    });
    [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"].forEach((selector) => {
      const element = document.querySelector(`#workspacePage > ${selector}`);
      if (element) element.hidden = pageId !== "workspacePage";
    });
    try {
      localStorage.setItem("studybridgeLastOpenPage", pageId);
    } catch {
      // Ignore private browsing/localStorage errors.
    }
    document.body.dataset.studybridgeActivePage = pageId;
    document.body.classList.toggle("study-sidebar-hidden", pageId !== "workspacePage");
    refreshStudentPage(pageId);
    return true;
  }

  function refreshStudentPage(pageId) {
    const refreshButtonByPage = {
      schoolCommunityPage: "#refreshCommunityButton",
      classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton",
      schedulePage: "#refreshScheduleButton"
    };
    const selector = refreshButtonByPage[pageId];
    if (!selector) return;
    setTimeout(() => {
      const button = document.querySelector(selector);
      if (button && !button.disabled) button.click();
    }, 80);
  }

  function loadScriptOnce(src) {
    const cleanSrc = src.split("?")[0];
    const registry = (window.__studybridgeLoadedScripts ||= new Set());
    const key = new URL(cleanSrc, window.location.href).pathname;
    if (
      registry.has(key) ||
      Array.from(document.scripts).some((script) => {
        const scriptSrc = script.getAttribute("src");
        return scriptSrc && new URL(scriptSrc, window.location.href).pathname === key;
      })
    ) {
      registry.add(key);
      return;
    }
    registry.add(key);
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.addEventListener("error", () => registry.delete(key), { once: true });
    document.body.appendChild(script);
  }

  function ensureNavigationScripts(buttonId) {
    const scriptMap = {
      openSchoolCommunityButton: ["/school-community-patch.js?v=20261007-2"],
      openClassmatesButton: [
        "/classmates-patch.js?v=20261007-nav2",
        "/classmates-request-patch.js?v=20261007-2",
        "/classmate-chat-bubble-fix.js?v=20261007-nav2",
        "/classmates-performance-patch.js?v=20261007-nav2"
      ],
      openEmailReplyButton: ["/email-reply-patch.js?v=20261007-2"],
      openScheduleButton: [
        "/schedule-patch.js?v=20261007-2",
        "/schedule-dashboard-patch.js?v=20261007-nav2",
        "/schedule-notification-patch.js?v=20261007-nav2"
      ]
    };
    (scriptMap[buttonId] || []).forEach(loadScriptOnce);
  }

  function callDirectOpener(buttonId) {
    const openerMap = {
      openSchoolCommunityButton: "studybridgeOpenCommunityPage",
      openClassmatesButton: "studybridgeOpenClassmatesPage",
      openEmailReplyButton: "studybridgeOpenEmailReplyPage",
      openScheduleButton: "studybridgeOpenSchedulePage"
    };
    const openerName = openerMap[buttonId];
    const opener = openerName ? window[openerName] : null;
    if (typeof opener === "function") {
      opener();
      return true;
    }
    return false;
  }

  function attachStudentNavigationFallback() {
    if (document.body.dataset.studentNavigationFallback === "native-shell") return;
    document.body.dataset.studentNavigationFallback = "native-shell";
    const pageByButton = {
      openStudyAreaButton: "workspacePage",
      openSchoolCommunityButton: "schoolCommunityPage",
      openClassmatesButton: "classmatesPage",
      openEmailReplyButton: "emailReplyPage",
      openScheduleButton: "schedulePage"
    };

    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest?.("#openStudyAreaButton, #openSchoolCommunityButton, #openClassmatesButton, #openEmailReplyButton, #openScheduleButton");
        if (!button || isCreatorMode()) return;
        const pageId = pageByButton[button.id];
        if (!pageId) return;
        if (typeof window.studybridgeDirectOpenPage === "function") {
          event.preventDefault();
          window.studybridgeDirectOpenPage(button.id);
          return;
        }
        ensureNavigationScripts(button.id);

        const ensureOpened = () => {
          if (button.id !== "openStudyAreaButton" && callDirectOpener(button.id)) return true;
          const targetPage = document.querySelector(`#${pageId}`);
          if (!targetPage) return false;
          if (targetPage.hidden || pageId === "workspacePage") showStudentPage(pageId);
          return true;
        };

        [0, 60, 180, 360, 700, 1300].forEach((delay) => setTimeout(ensureOpened, delay));
      },
      true
    );
  }

  function loadSupportPatches() {
    loadScriptOnce("/cheatsheet-mode-patch.js?v=20261006-2");
    loadScriptOnce("/classmates-performance-patch.js?v=20261007-1");
    loadScriptOnce("/no-course-notice-patch.js?v=20261007-1");
  }

  function boot() {
    ensureWorkspacePageId();
    syncAppLiveState();
    installStyle();
    attachChatScrollListener();
    attachStudentNavigationFallback();
  }

  function scheduleBoot() {
    if (bootFrame) return;
    bootFrame = requestAnimationFrame(() => {
      bootFrame = 0;
      boot();
    });
  }

  boot();
  loadSupportPatches();
  window.addEventListener("resize", scheduleBoot);
  window.addEventListener("load", () => scheduleStudyChatScroll(true, 120));
  document.addEventListener("submit", (event) => {
    if (event.target?.id === "chatForm") {
      stickToBottom = true;
      scheduleStudyChatScroll(true, 80);
    }
  });

  const observer = new MutationObserver(() => {
    scheduleBoot();
    if (stickToBottom) scheduleStudyChatScroll(false, 40);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"],
    characterData: true
  });
})();
