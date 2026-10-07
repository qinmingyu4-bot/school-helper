(() => {
  if (window.__studybridgeStudyChatBottomFixV6) return;
  window.__studybridgeStudyChatBottomFixV6 = true;

  const STYLE_ID = "studybridge-study-chat-bottom-fix";
  let stickToBottom = true;
  let bootFrame = 0;
  let scrollTimer = 0;

  function isVisible(element) {
    return Boolean(element && !element.hidden && element.offsetParent !== null);
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

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) {
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

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage:not([hidden]) {
        height: 100dvh !important;
        min-height: 0 !important;
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto auto !important;
        overflow: hidden !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage .topbar,
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage #scheduleDashboard,
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage #quickPrompts,
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage #chatForm {
        position: relative !important;
        z-index: 3 !important;
        flex: 0 0 auto !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage #chatArea {
        position: relative !important;
        z-index: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-content: flex-start !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
        padding: 28px 28px 40px !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior-y: contain !important;
        scroll-behavior: auto !important;
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-y !important;
        scrollbar-gutter: stable !important;
        scroll-padding-top: 150px !important;
        scroll-padding-bottom: 150px !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage #chatArea .message {
        flex: 0 0 auto !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage #quickPrompts,
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #workspacePage #chatForm {
        background: #f4f6f9 !important;
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
    if (!area) return;
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
    area.addEventListener("wheel", updateStickiness, { passive: true });
    area.addEventListener("pointerdown", () => area.focus({ preventScroll: true }), { passive: true });
  }

  function boot() {
    const workspace = document.querySelector(".workspace");
    if (workspace && !workspace.id) workspace.id = "workspacePage";
    syncAppLiveState();
    installStyle();
    attachChatScrollListener();
  }

  function scheduleBoot() {
    if (bootFrame) return;
    bootFrame = requestAnimationFrame(() => {
      bootFrame = 0;
      boot();
    });
  }

  boot();
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
