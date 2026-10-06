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
        overscroll-behavior: contain;
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

  function scrollStudyChatToBottom() {
    const chatArea = document.querySelector("#chatArea");
    const workspacePage = document.querySelector("#workspacePage");
    if (!isVisible(chatArea) || !isVisible(workspacePage)) return;
    updateBottomSpace();
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function boot() {
    installStyle();
    updateBottomSpace();
  }

  boot();
  window.addEventListener("resize", updateBottomSpace);
  window.addEventListener("load", () => setTimeout(scrollStudyChatToBottom, 80));

  const observer = new MutationObserver(() => {
    boot();
    setTimeout(scrollStudyChatToBottom, 30);
    setTimeout(scrollStudyChatToBottom, 180);
    setTimeout(scrollStudyChatToBottom, 500);
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
    const distanceFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
    if (distanceFromBottom < 240) scrollStudyChatToBottom();
  }, 1200);
})();
