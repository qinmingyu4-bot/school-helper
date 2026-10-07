(() => {
  const STYLE_ID = "studybridge-study-chat-bottom-fix";
  let stickToBottom = true;
  let lastScrollTop = 0;
  let lastScrollHeight = 0;

  function isVisible(element) {
    return Boolean(element && !element.hidden && element.offsetParent !== null);
  }

  function installStyle() {
    let style = document.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      body:not(.creator-clean-mode) .workspace,
      body:not(.creator-clean-mode) #workspacePage {
        height: 100vh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      body:not(.creator-clean-mode) #workspacePage {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto auto !important;
      }

      body:not(.creator-clean-mode) #workspacePage .topbar,
      body:not(.creator-clean-mode) #workspacePage #scheduleDashboard,
      body:not(.creator-clean-mode) #workspacePage #quickPrompts,
      body:not(.creator-clean-mode) #workspacePage #chatForm {
        position: relative !important;
        z-index: 3 !important;
        flex: 0 0 auto !important;
      }

      body:not(.creator-clean-mode) #workspacePage #scheduleDashboard {
        align-self: start !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea {
        position: relative !important;
        z-index: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        grid-row: auto !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
        padding-top: max(34px, var(--study-chat-top-space, 34px)) !important;
        padding-bottom: max(28px, var(--study-chat-bottom-space, 28px)) !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
        scroll-behavior: auto !important;
        -webkit-overflow-scrolling: touch !important;
        scrollbar-gutter: stable !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea .message:first-child {
        margin-top: 0 !important;
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

  function ensureWorkspacePageId() {
    const workspace = document.querySelector(".workspace");
    if (workspace && !workspace.id) workspace.id = "workspacePage";
  }

  function updateBottomSpace() {
    const quickPrompts = document.querySelector("#quickPrompts");
    const chatForm = document.querySelector("#chatForm");
    const scheduleDashboard = document.querySelector("#scheduleDashboard");
    const quickHeight = isVisible(quickPrompts) ? quickPrompts.getBoundingClientRect().height : 0;
    const formHeight = isVisible(chatForm) ? chatForm.getBoundingClientRect().height : 0;
    const dashboardHeight = isVisible(scheduleDashboard) ? scheduleDashboard.getBoundingClientRect().height : 0;
    const bottomSpace = Math.max(28, Math.ceil((quickHeight + formHeight) * 0.12));
    const topSpace = Math.max(34, Math.ceil(dashboardHeight * 0.22));
    document.documentElement.style.setProperty("--study-chat-bottom-space", `${bottomSpace}px`);
    document.documentElement.style.setProperty("--study-chat-top-space", `${topSpace}px`);
  }

  function distanceFromBottom(chatArea) {
    return chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
  }

  function updateStickiness() {
    const chatArea = document.querySelector("#chatArea");
    if (!chatArea || !isVisible(chatArea)) return;
    const scrollMovedUp = chatArea.scrollTop < lastScrollTop - 4;
    const heightChanged = chatArea.scrollHeight !== lastScrollHeight;
    if (scrollMovedUp) stickToBottom = false;
    if (!heightChanged) stickToBottom = distanceFromBottom(chatArea) < 120;
    lastScrollTop = chatArea.scrollTop;
    lastScrollHeight = chatArea.scrollHeight;
  }

  function scrollStudyChatToBottom(force = false) {
    const chatArea = document.querySelector("#chatArea");
    const workspacePage = document.querySelector("#workspacePage");
    if (!isVisible(chatArea) || !isVisible(workspacePage)) return;
    updateBottomSpace();
    if (!force && !stickToBottom) return;
    chatArea.scrollTop = chatArea.scrollHeight;
    lastScrollTop = chatArea.scrollTop;
    lastScrollHeight = chatArea.scrollHeight;
    stickToBottom = true;
  }

  function markManualScrollIntent(event) {
    const workspacePage = document.querySelector("#workspacePage");
    if (!workspacePage || !isVisible(workspacePage) || !workspacePage.contains(event.target)) return;
    const developerPanel = document.querySelector("#developerPanel");
    if (developerPanel && !developerPanel.hidden) return;
    if (event.deltaY < 0) stickToBottom = false;
  }

  function routeWheelToStudyChat(event) {
    const workspacePage = document.querySelector("#workspacePage");
    const chatArea = document.querySelector("#chatArea");
    if (!workspacePage || !chatArea || !isVisible(workspacePage) || !isVisible(chatArea)) return;
    if (!workspacePage.contains(event.target)) return;
    const developerPanel = document.querySelector("#developerPanel");
    if (developerPanel && !developerPanel.hidden) return;
    if (event.target.closest?.("#chatForm, #quickPrompts, textarea, input, select, button")) return;
    const canScroll = chatArea.scrollHeight > chatArea.clientHeight + 2;
    if (!canScroll) return;

    const before = chatArea.scrollTop;
    chatArea.scrollTop += event.deltaY;
    if (chatArea.scrollTop !== before) {
      event.preventDefault();
      event.stopPropagation();
      stickToBottom = distanceFromBottom(chatArea) < 120;
      lastScrollTop = chatArea.scrollTop;
      lastScrollHeight = chatArea.scrollHeight;
    }
  }

  function attachChatScrollListener() {
    const chatArea = document.querySelector("#chatArea");
    if (!chatArea || chatArea.dataset.studyScrollReady === "true") return;
    chatArea.dataset.studyScrollReady = "true";
    chatArea.addEventListener("scroll", updateStickiness, { passive: true });
  }

  function boot() {
    ensureWorkspacePageId();
    installStyle();
    updateBottomSpace();
    attachChatScrollListener();
    attachStudentNavigationFallback();
  }

  function isCreatorMode() {
    const developerPanel = document.querySelector("#developerPanel");
    return Boolean(developerPanel && !developerPanel.hidden);
  }

  function showStudentPage(pageId) {
    if (isCreatorMode()) return false;
    const targetPage = document.querySelector(`#${pageId}`);
    if (!targetPage) return false;
    ["workspacePage", "profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"].forEach((id) => {
      const page = document.querySelector(`#${id}`);
      if (page) page.hidden = id !== pageId;
    });
    try {
      localStorage.setItem("studybridgeLastOpenPage", pageId);
    } catch {
      // Ignore private browsing/localStorage errors.
    }
    document.body.classList.toggle("study-sidebar-hidden", pageId !== "workspacePage");
    return true;
  }

  function attachStudentNavigationFallback() {
    if (document.body.dataset.studentNavigationFallback === "true") return;
    document.body.dataset.studentNavigationFallback = "true";
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

        const ensureOpened = () => {
          const targetPage = document.querySelector(`#${pageId}`);
          if (!targetPage) return;
          const workspacePage = document.querySelector("#workspacePage");
          if (pageId !== "workspacePage" && workspacePage && !workspacePage.hidden && targetPage.hidden) {
            showStudentPage(pageId);
          }
          if (pageId === "workspacePage" && workspacePage?.hidden) {
            showStudentPage(pageId);
          }
        };

        setTimeout(ensureOpened, 60);
        setTimeout(ensureOpened, 240);
        setTimeout(ensureOpened, 700);
      },
      true
    );
  }

  function loadCheatsheetPatch() {
    loadScriptOnce("/cheatsheet-mode-patch.js?v=20261006-2");
    loadScriptOnce("/classmates-performance-patch.js?v=20261007-1");
    loadScriptOnce("/no-course-notice-patch.js?v=20261007-1");
  }

  function loadScriptOnce(src) {
    const cleanSrc = src.split("?")[0];
    if (document.querySelector(`script[src^="${cleanSrc}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
  }

  boot();
  loadCheatsheetPatch();
  window.addEventListener("resize", updateBottomSpace);
  window.addEventListener("load", () => setTimeout(() => scrollStudyChatToBottom(true), 120));
  window.addEventListener("wheel", markManualScrollIntent, { passive: true, capture: true });
  window.addEventListener("wheel", routeWheelToStudyChat, { passive: false, capture: true });

  const observer = new MutationObserver(() => {
    boot();
    if (stickToBottom) {
      setTimeout(() => scrollStudyChatToBottom(false), 40);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
