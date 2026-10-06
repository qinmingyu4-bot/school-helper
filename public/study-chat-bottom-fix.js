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
      #workspacePage #chatArea {
        padding-bottom: var(--study-chat-bottom-space, 168px) !important;
        scroll-padding-bottom: var(--study-chat-bottom-space, 168px) !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overscroll-behavior: auto;
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
    (event) => {
      const chatArea = document.querySelector("#chatArea");
      if (!chatArea || !chatArea.contains(event.target)) return;
      if (event.deltaY < 0) stickToBottom = false;
      setTimeout(updateStickiness, 30);
    },
    { passive: true }
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
