(() => {
  const STYLE_ID = "studybridge-admin-scroll-fix";
  let frame = 0;

  function isVisible(element) {
    return Boolean(element && !element.hidden && element.offsetParent !== null);
  }

  function isCreatorMode() {
    const developerPanel = document.querySelector("#developerPanel");
    return document.body.classList.contains("creator-clean-mode") || isVisible(developerPanel);
  }

  function getScrollTarget() {
    const workspace = document.querySelector("#workspacePage");
    return isVisible(workspace) ? workspace : null;
  }

  function installStyle() {
    let style = document.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      body.creator-clean-mode #workspacePage.workspace,
      body.creator-clean-mode .workspace#workspacePage {
        display: block !important;
        height: 100vh !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
        scroll-behavior: auto !important;
        padding-bottom: 72px !important;
      }

      body.creator-clean-mode #developerPanel:not([hidden]) {
        max-height: none !important;
        overflow: visible !important;
        padding-bottom: 72px !important;
      }

      body.creator-clean-mode #developerPanel:not([hidden]) > *:last-child {
        margin-bottom: 36px !important;
      }
    `;
  }

  function mark() {
    installStyle();
    const target = getScrollTarget();
    if (!target || !isCreatorMode()) return;
    target.dataset.adminScrollReady = "true";
    if (target.tabIndex < 0) target.tabIndex = 0;
  }

  function scheduleMark() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      mark();
    });
  }

  function shouldIgnoreTarget(target) {
    return Boolean(target?.closest?.("textarea, input, select"));
  }

  function routeWheel(event) {
    if (!isCreatorMode() || shouldIgnoreTarget(event.target)) return;
    const scrollTarget = getScrollTarget();
    if (!scrollTarget || !scrollTarget.contains(event.target)) return;

    const maxScroll = scrollTarget.scrollHeight - scrollTarget.clientHeight;
    if (maxScroll <= 2) return;

    const before = scrollTarget.scrollTop;
    const next = Math.max(0, Math.min(maxScroll, before + event.deltaY));
    scrollTarget.scrollTop = next;
    if (scrollTarget.scrollTop !== before) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function routeKeys(event) {
    if (!isCreatorMode() || shouldIgnoreTarget(document.activeElement)) return;
    const scrollTarget = getScrollTarget();
    if (!scrollTarget) return;

    const maxScroll = scrollTarget.scrollHeight - scrollTarget.clientHeight;
    if (maxScroll <= 2) return;

    const steps = {
      ArrowUp: -80,
      ArrowDown: 80,
      PageUp: -Math.max(280, scrollTarget.clientHeight * 0.8),
      PageDown: Math.max(280, scrollTarget.clientHeight * 0.8),
      Home: -Infinity,
      End: Infinity
    };
    if (!(event.key in steps)) return;

    const before = scrollTarget.scrollTop;
    const step = steps[event.key];
    scrollTarget.scrollTop = step === Infinity ? maxScroll : step === -Infinity ? 0 : Math.max(0, Math.min(maxScroll, before + step));
    if (scrollTarget.scrollTop !== before) event.preventDefault();
  }

  installStyle();
  scheduleMark();
  window.addEventListener("wheel", routeWheel, { passive: false, capture: true });
  window.addEventListener("keydown", routeKeys, { capture: true });
  window.addEventListener("resize", scheduleMark);
  new MutationObserver(scheduleMark).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"]
  });
})();
