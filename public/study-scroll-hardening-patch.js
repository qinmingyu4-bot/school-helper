(() => {
  const STYLE_ID = "studybridge-study-scroll-hardening";
  let frame = 0;

  function isVisible(element) {
    return Boolean(element && !element.hidden && element.offsetParent !== null);
  }

  function isStudyViewActive() {
    const workspacePage = document.querySelector("#workspacePage") || document.querySelector(".workspace");
    const developerPanel = document.querySelector("#developerPanel");
    return isVisible(workspacePage) && !(developerPanel && !developerPanel.hidden);
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
      body:not(.creator-clean-mode) #workspacePage,
      body:not(.creator-clean-mode) .workspace {
        min-height: 0 !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea {
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-content: flex-start !important;
        min-height: 0 !important;
        height: 100% !important;
        max-height: none !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
        scrollbar-gutter: stable !important;
        padding-bottom: max(34px, var(--study-chat-bottom-space, 34px)) !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea .message {
        flex: 0 0 auto !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea .message:last-child {
        margin-bottom: 22px !important;
      }
    `;
  }

  function markScrollable() {
    const chatArea = getChatArea();
    if (!chatArea || !isStudyViewActive()) return;
    chatArea.dataset.studyScrollHardening = "true";
    chatArea.tabIndex = chatArea.tabIndex >= 0 ? chatArea.tabIndex : 0;
  }

  function scheduleMark() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      installStyle();
      markScrollable();
    });
  }

  function shouldIgnoreTarget(target) {
    return Boolean(
      target?.closest?.("textarea, input, select") ||
      target?.closest?.("#chatForm button, #quickPrompts button")
    );
  }

  function routeWheel(event) {
    if (!isStudyViewActive() || shouldIgnoreTarget(event.target)) return;
    const workspacePage = document.querySelector("#workspacePage") || document.querySelector(".workspace");
    if (!workspacePage?.contains(event.target)) return;

    const chatArea = getChatArea();
    if (!chatArea) return;

    const maxScroll = chatArea.scrollHeight - chatArea.clientHeight;
    if (maxScroll <= 2) return;

    const before = chatArea.scrollTop;
    const next = Math.max(0, Math.min(maxScroll, before + event.deltaY));
    chatArea.scrollTop = next;

    if (chatArea.scrollTop !== before) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function routeKeys(event) {
    if (!isStudyViewActive() || shouldIgnoreTarget(document.activeElement)) return;
    const chatArea = getChatArea();
    if (!chatArea) return;

    const maxScroll = chatArea.scrollHeight - chatArea.clientHeight;
    if (maxScroll <= 2) return;

    const steps = {
      ArrowUp: -72,
      ArrowDown: 72,
      PageUp: -Math.max(240, chatArea.clientHeight * 0.78),
      PageDown: Math.max(240, chatArea.clientHeight * 0.78),
      Home: -Infinity,
      End: Infinity
    };
    if (!(event.key in steps)) return;

    const before = chatArea.scrollTop;
    const step = steps[event.key];
    chatArea.scrollTop = step === Infinity ? maxScroll : step === -Infinity ? 0 : Math.max(0, Math.min(maxScroll, before + step));
    if (chatArea.scrollTop !== before) event.preventDefault();
  }

  installStyle();
  scheduleMark();
  window.addEventListener("wheel", routeWheel, { passive: false, capture: true });
  window.addEventListener("keydown", routeKeys, { capture: true });
  window.addEventListener("resize", scheduleMark);
  document.addEventListener("visibilitychange", scheduleMark);
  new MutationObserver(scheduleMark).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"]
  });
})();
