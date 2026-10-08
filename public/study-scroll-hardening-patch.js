(() => {
  if (window.__studybridgeStudyScrollHardeningV2) return;
  window.__studybridgeStudyScrollHardeningV2 = true;

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
    `;
  }

  function markScrollable() {
    const chatArea = getChatArea();
    if (!chatArea || !isStudyViewActive()) return;
    chatArea.dataset.studyScrollHardening = "native";
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

  installStyle();
  scheduleMark();
  window.addEventListener("resize", scheduleMark);
  document.addEventListener("visibilitychange", scheduleMark);
  document.addEventListener(
    "pointerdown",
    (event) => {
      const chatArea = getChatArea();
      if (chatArea && chatArea.contains(event.target) && event.target === chatArea) chatArea.focus({ preventScroll: true });
    },
    true
  );
  new MutationObserver(scheduleMark).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"]
  });
})();
