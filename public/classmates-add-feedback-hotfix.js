(() => {
  const VERSION = "20261008-classmates-add-feedback-1.0.90";
  if (window.__studybridgeClassmatesAddFeedbackVersion === VERSION) return;
  window.__studybridgeClassmatesAddFeedbackVersion = VERSION;

  const zh = {
    addTitle: "\u6dfb\u52a0\u540c\u5b66",
    sendApply: "\u53d1\u9001\u7533\u8bf7",
    add: "\u6dfb\u52a0",
    sendingWord: "\u53d1\u9001\u4e2d",
    refresh: "\u5237\u65b0",
    empty: "\u8bf7\u8f93\u5165\u540c\u5b66\u7684 SB ID\u3002",
    sending: "\u6b63\u5728\u53d1\u9001\u597d\u53cb\u7533\u8bf7...",
    sent: "\u597d\u53cb\u7533\u8bf7\u5df2\u53d1\u9001\uff0c\u7b49\u5f85\u5bf9\u65b9\u901a\u8fc7\u3002",
    connected: "\u5df2\u7ecf\u6210\u4e3a\u540c\u5b66\uff0c\u53f3\u4fa7\u53ef\u4ee5\u5f00\u59cb\u804a\u5929\u3002",
    failed: "\u53d1\u9001\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002"
  };

  const state = {
    draft: "",
    focused: false,
    lastInputAt: 0,
    lastMessage: "",
    lastTone: "neutral",
    sending: false,
    restoreTimer: null
  };

  function pageLooksLikeClassmates() {
    const bodyText = document.body?.innerText || "";
    return bodyText.includes(zh.addTitle) && bodyText.includes("SB ID");
  }

  function findAddInput() {
    return [...document.querySelectorAll("input")].find((input) => {
      const hint = `${input.placeholder || ""} ${input.value || ""}`;
      return /SB\s*ID/i.test(hint);
    }) || null;
  }

  function findPanel(input) {
    if (!input) return null;
    let node = input.parentElement;
    while (node && node !== document.body) {
      const text = node.innerText || "";
      if (text.includes(zh.addTitle)) return node;
      node = node.parentElement;
    }
    return input.parentElement;
  }

  function findSendButton(panel) {
    if (!panel) return null;
    return [...panel.querySelectorAll("button")].find((button) => {
      const text = button.textContent || "";
      return text.includes(zh.sendApply) || text.includes(zh.add) || text.includes(zh.sendingWord);
    });
  }

  function ensureFeedback(panel) {
    if (!panel) return null;
    let feedback = panel.querySelector("[data-classmate-add-feedback]");
    if (feedback) return feedback;
    feedback = document.createElement("div");
    feedback.dataset.classmateAddFeedback = "true";
    feedback.className = "classmate-add-feedback";
    const button = findSendButton(panel);
    if (button?.parentElement) button.parentElement.insertAdjacentElement("afterend", feedback);
    else panel.appendChild(feedback);
    return feedback;
  }

  function setMessage(message, tone = "neutral") {
    state.lastMessage = message;
    state.lastTone = tone;
    const input = findAddInput();
    const feedback = ensureFeedback(findPanel(input));
    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.tone = tone;
  }

  function normalizeButton(button) {
    if (!button) return;
    button.style.whiteSpace = "nowrap";
    button.style.minWidth = "96px";
    button.style.height = "42px";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.lineHeight = "1";
    button.disabled = state.sending;
    button.textContent = state.sending ? zh.sendingWord : zh.sendApply;
  }

  function installStyles() {
    if (document.querySelector("#classmates-add-feedback-style")) return;
    const style = document.createElement("style");
    style.id = "classmates-add-feedback-style";
    style.textContent = `
      .classmate-add-feedback {
        min-height: 20px;
        margin-top: 8px;
        font-size: 13px;
        line-height: 1.45;
        color: #52617a;
      }
      .classmate-add-feedback[data-tone="success"] { color: #10705a; font-weight: 800; }
      .classmate-add-feedback[data-tone="error"] { color: #c2413a; font-weight: 800; }
      .classmate-add-feedback[data-tone="pending"] { color: #0f4f78; font-weight: 800; }
      [data-classmate-add-input] { transition: none !important; }
    `;
    document.head.appendChild(style);
  }

  function syncUi() {
    if (!pageLooksLikeClassmates()) return;
    installStyles();
    const input = findAddInput();
    const panel = findPanel(input);
    const button = findSendButton(panel);
    if (!input || !panel) return;

    input.dataset.classmateAddInput = "true";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.minWidth = "0";

    if (state.focused && state.draft && input.value !== state.draft && Date.now() - state.lastInputAt < 15000) {
      input.value = state.draft;
      try {
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      } catch {}
    }

    normalizeButton(button);
    const feedback = ensureFeedback(panel);
    if (feedback && state.lastMessage) {
      feedback.textContent = state.lastMessage;
      feedback.dataset.tone = state.lastTone;
    }
  }

  function scheduleSync() {
    clearTimeout(state.restoreTimer);
    state.restoreTimer = setTimeout(syncUi, 40);
  }

  async function sendRequest() {
    const input = findAddInput();
    const panel = findPanel(input);
    const button = findSendButton(panel);
    const sbId = String(input?.value || state.draft || "").trim();
    if (!sbId) {
      setMessage(zh.empty, "error");
      input?.focus();
      return;
    }
    if (state.sending) return;
    state.sending = true;
    normalizeButton(button);
    setMessage(zh.sending, "pending");

    try {
      const response = await fetch("/api/classmates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sbId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result?.error || zh.failed, "error");
        return;
      }
      if (result?.status === "connected") {
        state.draft = "";
        if (input) input.value = "";
        setMessage(zh.connected, "success");
      } else {
        setMessage(zh.sent, "success");
      }
      setTimeout(() => {
        const refresh = [...document.querySelectorAll("button")].find((btn) => (btn.textContent || "").trim() === zh.refresh);
        refresh?.click();
      }, 700);
    } catch {
      setMessage(zh.failed, "error");
    } finally {
      state.sending = false;
      normalizeButton(findSendButton(findPanel(findAddInput())));
    }
  }

  document.addEventListener("focusin", (event) => {
    if (event.target?.matches?.("[data-classmate-add-input], input")) {
      const input = findAddInput();
      if (event.target === input) {
        state.focused = true;
        state.draft = input.value;
      }
    }
  }, true);

  document.addEventListener("focusout", (event) => {
    if (event.target === findAddInput()) state.focused = false;
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target === findAddInput()) {
      state.draft = event.target.value;
      state.lastInputAt = Date.now();
      if (state.lastMessage && state.lastTone !== "success") setMessage("", "neutral");
      scheduleSync();
    }
  }, true);

  document.addEventListener("click", (event) => {
    const input = findAddInput();
    const panel = findPanel(input);
    const button = findSendButton(panel);
    if (!button || event.target !== button) return;
    event.preventDefault();
    event.stopPropagation();
    sendRequest();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.target === findAddInput() && event.key === "Enter") {
      event.preventDefault();
      sendRequest();
    }
  }, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", scheduleSync);
  window.addEventListener("popstate", scheduleSync);
  setInterval(syncUi, 1500);
  scheduleSync();
})();
