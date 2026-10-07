(() => {
  if (window.__studybridgeAssistantTypingPatch) return;
  window.__studybridgeAssistantTypingPatch = true;

  const WATCH_MS = 90000;
  const MIN_INTERVAL_MS = 8;
  const MAX_INTERVAL_MS = 22;
  let expectingUntil = 0;
  let knownAssistantText = new Set();
  let activeAnimation = null;

  function chatArea() {
    return document.querySelector("#chatArea");
  }

  function bubbleText(bubble) {
    return String(bubble?.textContent || "").trim();
  }

  function rememberCurrentAssistantMessages() {
    const area = chatArea();
    knownAssistantText = new Set(
      Array.from(area?.querySelectorAll(".message.assistant:not(.pending) .bubble") || []).map(bubbleText)
    );
  }

  function beginExpectingReply() {
    rememberCurrentAssistantMessages();
    expectingUntil = Date.now() + WATCH_MS;
  }

  function shouldAnimate() {
    return Date.now() < expectingUntil;
  }

  function installStyle() {
    if (document.querySelector("#studybridge-assistant-typing-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-assistant-typing-style";
    style.textContent = `
      #chatArea .bubble.studybridge-typing-reply::after {
        content: "";
        display: inline-block;
        width: 2px;
        height: 1em;
        margin-left: 2px;
        vertical-align: -0.12em;
        background: #123260;
        animation: studybridgeTypingCaret 0.9s steps(1) infinite;
      }

      @keyframes studybridgeTypingCaret {
        50% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  function intervalForLength(length) {
    if (length > 1200) return MIN_INTERVAL_MS;
    if (length > 600) return 10;
    if (length > 220) return 14;
    return MAX_INTERVAL_MS;
  }

  function charsPerTick(length) {
    if (length > 1800) return 6;
    if (length > 900) return 4;
    if (length > 420) return 2;
    return 1;
  }

  function isNearBottom(area) {
    return area.scrollHeight - area.scrollTop - area.clientHeight < 90;
  }

  function animateBubble(bubble) {
    if (!bubble || bubble.dataset.typingDone === "true") return;
    const fullText = bubbleText(bubble);
    if (!fullText || fullText.length < 2) return;

    if (activeAnimation?.finish) activeAnimation.finish();

    const area = chatArea();
    const pieces = Array.from(fullText);
    const interval = intervalForLength(pieces.length);
    const chunk = charsPerTick(pieces.length);
    let index = 0;
    let timer = 0;
    let finished = false;

    bubble.dataset.typingDone = "true";
    bubble.classList.add("studybridge-typing-reply");
    bubble.textContent = "";

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      bubble.textContent = fullText;
      bubble.classList.remove("studybridge-typing-reply");
      activeAnimation = null;
      if (area) area.scrollTop = area.scrollHeight;
    };

    const tick = () => {
      if (finished) return;
      index = Math.min(pieces.length, index + chunk);
      bubble.textContent = pieces.slice(0, index).join("");
      if (area && isNearBottom(area)) area.scrollTop = area.scrollHeight;
      if (index >= pieces.length) {
        finish();
        return;
      }
      timer = window.setTimeout(tick, interval);
    };

    bubble.addEventListener("click", finish, { once: true });
    activeAnimation = { finish };
    tick();
  }

  function maybeAnimateLatestReply() {
    if (!shouldAnimate()) return;
    const area = chatArea();
    if (!area) return;
    const candidates = Array.from(area.querySelectorAll(".message.assistant:not(.pending) .bubble")).filter((bubble) => {
      const text = bubbleText(bubble);
      return text && bubble.dataset.typingDone !== "true" && !knownAssistantText.has(text);
    });
    const target = candidates[candidates.length - 1];
    if (!target) return;
    expectingUntil = 0;
    animateBubble(target);
  }

  function patchAppendMessage() {
    const original = window.appendMessage;
    if (typeof original !== "function" || original.__studybridgeTypingWrapped) return;
    const wrapped = function wrappedAppendMessage(message, extraClass = "") {
      if (message?.role === "assistant" && String(extraClass || "").includes("pending")) {
        beginExpectingReply();
      }
      const result = original.apply(this, arguments);
      window.requestAnimationFrame(maybeAnimateLatestReply);
      return result;
    };
    wrapped.__studybridgeTypingWrapped = true;
    window.appendMessage = wrapped;
  }

  function patchSubmitWatch() {
    document.addEventListener(
      "submit",
      (event) => {
        if (event.target?.id === "chatForm") beginExpectingReply();
      },
      true
    );
  }

  function boot() {
    installStyle();
    patchAppendMessage();
  }

  patchSubmitWatch();
  boot();
  new MutationObserver(() => {
    boot();
    maybeAnimateLatestReply();
  }).observe(document.body, { childList: true, subtree: true });
})();
