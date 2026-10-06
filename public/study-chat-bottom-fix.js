(() => {
  const STYLE_ID = "studybridge-study-chat-bottom-fix";

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
      body:not(.creator-clean-mode) .workspace {
        height: 100vh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      body:not(.creator-clean-mode) #workspacePage {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto auto !important;
        height: 100vh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      body:not(.creator-clean-mode) #workspacePage #scheduleDashboard {
        position: relative !important;
        z-index: 2 !important;
      }

      #workspacePage #chatArea {
        padding-bottom: var(--study-chat-bottom-space, 168px) !important;
        scroll-padding-bottom: var(--study-chat-bottom-space, 168px) !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
        scrollbar-gutter: stable;
      }

      #workspacePage #quickPrompts,
      #workspacePage #chatForm {
        position: relative;
        z-index: 3;
        background: #f4f6f9 !important;
      }

      #workspacePage #quickPrompts {
        padding-bottom: 8px !important;
      }
    `;
  }

  function updateBottomSpace() {
    const quickPrompts = document.querySelector("#quickPrompts");
    const chatForm = document.querySelector("#chatForm");
    const quickHeight = isVisible(quickPrompts) ? quickPrompts.getBoundingClientRect().height : 0;
    const formHeight = isVisible(chatForm) ? chatForm.getBoundingClientRect().height : 0;
    const bottomSpace = Math.max(150, Math.ceil(quickHeight + formHeight + 34));
    document.documentElement.style.setProperty("--study-chat-bottom-space", `${bottomSpace}px`);
  }

  let stickToBottom = true;
  let programmaticScrollUntil = 0;

  function distanceFromBottom(chatArea) {
    return chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
  }

  function updateStickiness() {
    const chatArea = document.querySelector("#chatArea");
    if (!chatArea) return;
    if (Date.now() < programmaticScrollUntil) return;
    stickToBottom = distanceFromBottom(chatArea) < 120;
  }

  function scrollStudyChatToBottom() {
    const chatArea = document.querySelector("#chatArea");
    const workspacePage = document.querySelector("#workspacePage");
    if (!isVisible(chatArea) || !isVisible(workspacePage)) return;
    updateBottomSpace();
    programmaticScrollUntil = Date.now() + 160;
    chatArea.scrollTop = chatArea.scrollHeight;
    stickToBottom = true;
  }

  function maybeScrollStudyChatToBottom() {
    if (stickToBottom) scrollStudyChatToBottom();
  }

  function isStudyWorkspaceTarget(target) {
    const workspacePage = document.querySelector("#workspacePage");
    const developerPanel = document.querySelector("#developerPanel");
    return Boolean(
      workspacePage &&
        isVisible(workspacePage) &&
        workspacePage.contains(target) &&
        !(developerPanel && !developerPanel.hidden)
    );
  }

  function routeWheelToChat(event) {
    const chatArea = document.querySelector("#chatArea");
    if (!chatArea || !isStudyWorkspaceTarget(event.target)) return;
    if (chatArea.scrollHeight <= chatArea.clientHeight + 2) return;
    if (event.target.closest?.("textarea, input, select, button")) return;

    if (event.deltaY < 0 || distanceFromBottom(chatArea) > 80) {
      stickToBottom = false;
    }

    event.preventDefault();
    programmaticScrollUntil = Date.now() + 80;
    const before = chatArea.scrollTop;
    chatArea.scrollTop += event.deltaY;
    if (chatArea.scrollTop === before && event.deltaY < 0) {
      chatArea.scrollTop = Math.max(0, before - Math.abs(event.deltaY || 120));
    }
    setTimeout(updateStickiness, 40);
  }

  function boot() {
    installStyle();
    updateBottomSpace();
  }

  boot();
  window.addEventListener("resize", updateBottomSpace);
  window.addEventListener("load", () => setTimeout(scrollStudyChatToBottom, 80));
  document.addEventListener("scroll", updateStickiness, true);
  document.addEventListener(
    "wheel",
    routeWheelToChat,
    { passive: false, capture: true }
  );

  const observer = new MutationObserver(() => {
    boot();
    setTimeout(maybeScrollStudyChatToBottom, 30);
    setTimeout(maybeScrollStudyChatToBottom, 180);
    setTimeout(maybeScrollStudyChatToBottom, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setInterval(() => {
    updateBottomSpace();
    const chatArea = document.querySelector("#chatArea");
    if (!chatArea) return;
    if (stickToBottom && distanceFromBottom(chatArea) < 240) scrollStudyChatToBottom();
  }, 1200);
})();
