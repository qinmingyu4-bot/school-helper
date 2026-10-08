(() => {
  const VERSION = "20261008-study-scroll-bridge-1.0.91";
  if (window.__studybridgeStudyScrollBridge === VERSION) return;
  window.__studybridgeStudyScrollBridge = VERSION;

  const $ = (selector, root = document) => root.querySelector(selector);

  function installStyle() {
    let style = $("#studyScrollBridgeStyle");
    if (!style) {
      style = document.createElement("style");
      style.id = "studyScrollBridgeStyle";
      document.head.appendChild(style);
    }
    style.textContent = `
      body.sb-study-mode #workspacePage {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto auto !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }
      body.sb-study-mode #workspacePage > #developerPanel[hidden] {
        display: none !important;
      }
      body.sb-study-mode #chatArea {
        min-height: 0 !important;
        height: 100% !important;
        max-height: 100% !important;
        justify-content: flex-start !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior-y: contain !important;
        scroll-behavior: auto !important;
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-y !important;
        padding-bottom: 72px !important;
      }
      body.sb-study-mode #chatArea .message {
        flex: 0 0 auto !important;
      }
    `;
  }

  function installWheelBridge() {
    const root = $("#workspacePage");
    const area = $("#chatArea");
    if (!root || !area || root.dataset.studyScrollBridgeReady === "true") return;
    root.dataset.studyScrollBridgeReady = "true";
    root.addEventListener("wheel", (event) => {
      if (!document.body.classList.contains("sb-study-mode")) return;
      if (document.body.classList.contains("sb-direct-mode")) return;
      const target = event.target;
      if (target?.closest?.("textarea,input,select,button,#chatForm,#quickPrompts")) return;
      const maxScroll = area.scrollHeight - area.clientHeight;
      if (maxScroll <= 0) return;
      const before = area.scrollTop;
      area.scrollTop += event.deltaY;
      if (area.scrollTop !== before) event.preventDefault();
    }, { passive: false });
  }

  function refresh() {
    installStyle();
    installWheelBridge();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }
  window.addEventListener("load", refresh, { once: true });
  new MutationObserver(refresh).observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });
})();
