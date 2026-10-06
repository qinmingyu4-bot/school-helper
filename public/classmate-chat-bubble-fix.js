(() => {
  let lastActiveClassmateId = "";
  let lastMessageSignature = "";
  let isPollingMessages = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function installClassmateChatBubbleFix() {
    let style = document.querySelector("#studybridge-classmate-chat-bubble-fix");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-classmate-chat-bubble-fix";
      document.head.appendChild(style);
    }

    style.textContent = `
      #classmatesPage .direct-message-list {
        align-content: end !important;
        gap: 10px !important;
      }

      #classmatesPage .direct-message {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        align-items: end !important;
        column-gap: 16px !important;
        width: fit-content !important;
        min-width: min(360px, 72vw) !important;
        max-width: min(720px, 86%) !important;
        min-height: 0 !important;
        padding: 10px 14px !important;
        border-radius: 8px !important;
        line-height: 1.42 !important;
        white-space: pre-wrap !important;
      }

      #classmatesPage .direct-message.mine {
        justify-self: end !important;
      }

      #classmatesPage .direct-message time {
        display: block !important;
        align-self: end !important;
        margin: 0 !important;
        white-space: nowrap !important;
        text-align: right !important;
      }

      @media (max-width: 640px) {
        #classmatesPage .direct-message {
          grid-template-columns: 1fr !important;
          min-width: min(260px, 82vw) !important;
          max-width: 92% !important;
        }

        #classmatesPage .direct-message time {
          margin-top: 4px !important;
        }
      }
    `;
  }

  function getActiveClassmateId() {
    const page = document.querySelector("#classmatesPage:not([hidden])");
    if (!page) return "";
    const activeButton = page.querySelector(".classmate-row.active [data-open-classmate]");
    return activeButton?.dataset?.openClassmate || "";
  }

  async function pollActiveClassmateMessages() {
    const page = document.querySelector("#classmatesPage:not([hidden])");
    if (!page || isPollingMessages) return;

    const activeClassmateId = getActiveClassmateId();
    const list = page.querySelector("#directMessageList");
    if (!activeClassmateId || !list) return;

    if (activeClassmateId !== lastActiveClassmateId) {
      lastActiveClassmateId = activeClassmateId;
      lastMessageSignature = "";
    }

    isPollingMessages = true;
    try {
      const response = await fetch(`/api/classmates/${encodeURIComponent(activeClassmateId)}/messages`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;

      const messages = payload.messages || [];
      const signature = messages.map((message) => `${message.id || ""}:${message.createdAt || ""}`).join("|");
      if (!signature || signature === lastMessageSignature) return;

      const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      lastMessageSignature = signature;
      list.innerHTML = messages
        .map(
          (message) => `
            <article class="direct-message ${message.mine ? "mine" : ""}">
              <span>${escapeHtml(message.content)}</span>
              <time>${formatDateTime(message.createdAt)}</time>
            </article>
          `
        )
        .join("");

      if (wasNearBottom || messages.at(-1)?.mine === false) {
        list.scrollTop = list.scrollHeight;
      }
    } finally {
      isPollingMessages = false;
    }
  }

  installClassmateChatBubbleFix();
  setInterval(installClassmateChatBubbleFix, 1500);
  setInterval(pollActiveClassmateMessages, 3500);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pollActiveClassmateMessages();
  });
})();
