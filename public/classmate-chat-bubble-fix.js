(() => {
  let lastActiveClassmateId = "";
  let lastMessageSignature = "";
  let isPollingMessages = false;
  let requestsExpanded = false;
  let communityPickerLockUntil = 0;

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

      #classmatesPage .classmates-side {
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
      }

      #classmatesPage .classmate-request-section {
        flex: 0 0 auto !important;
      }

      #classmatesPage .classmate-list-section {
        flex: 1 1 auto !important;
        min-height: 120px !important;
      }

      #classmatesPage .request-toggle-title {
        min-height: 42px !important;
        padding: 8px 10px !important;
        border: 1px solid #dfe7f1 !important;
        border-radius: 8px !important;
        background: #fbfdff !important;
        cursor: pointer !important;
        user-select: none !important;
      }

      #classmatesPage .request-toggle-title:hover {
        border-color: rgba(47, 125, 98, 0.42) !important;
        background: #f7fbf9 !important;
      }

      #classmatesPage .request-toggle-title h3 {
        display: inline-flex !important;
        align-items: center !important;
        gap: 7px !important;
        margin: 0 !important;
      }

      #classmatesPage .request-toggle-title h3::after {
        content: "展开" !important;
        color: var(--muted) !important;
        font-size: 11px !important;
        font-weight: 800 !important;
      }

      #classmatesPage .classmate-request-section.is-expanded .request-toggle-title h3::after {
        content: "收起" !important;
      }

      #classmatesPage .request-alert-dot {
        display: none;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        background: #df4d4d;
        color: white;
        font-size: 11px;
        font-weight: 900;
        line-height: 18px;
        text-align: center;
      }

      #classmatesPage .classmate-request-section.has-requests .request-alert-dot {
        display: inline-block !important;
      }

      #classmatesPage .classmate-request-section:not(.is-expanded) #classmateRequestList,
      #classmatesPage .classmate-request-section:not(.is-expanded) #refreshClassmateRequestsButton {
        display: none !important;
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

  function countVisibleRequests(list) {
    if (!list) return 0;
    const empty = list.querySelector(".empty");
    if (empty && /还没有|沒有|没有/.test(empty.textContent || "")) return 0;
    return list.querySelectorAll(".request-row").length;
  }

  function installRequestListCollapse() {
    const page = document.querySelector("#classmatesPage");
    const list = page?.querySelector("#classmateRequestList");
    const section = list?.closest("section");
    const title = section?.querySelector(".classmate-section-title");
    const heading = title?.querySelector("h3");
    if (!page || !list || !section || !title || !heading) return;

    section.classList.add("classmate-request-section");
    const siblingSections = Array.from(page.querySelectorAll(".classmates-side > section"));
    siblingSections[1]?.classList.add("classmate-list-section");
    title.classList.add("request-toggle-title");
    title.setAttribute("role", "button");
    title.tabIndex = 0;
    title.setAttribute("aria-expanded", requestsExpanded ? "true" : "false");

    let dot = heading.querySelector(".request-alert-dot");
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "request-alert-dot";
      heading.appendChild(dot);
    }

    const requestCount = countVisibleRequests(list);
    dot.textContent = requestCount > 9 ? "9+" : String(requestCount || "");
    section.classList.toggle("has-requests", requestCount > 0);
    section.classList.toggle("is-expanded", requestsExpanded);

    if (!title.dataset.requestToggleReady) {
      title.dataset.requestToggleReady = "true";
      title.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        requestsExpanded = !requestsExpanded;
        installRequestListCollapse();
      });
      title.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        requestsExpanded = !requestsExpanded;
        installRequestListCollapse();
      });
    }
  }

  function installCommunityDirectoryStability() {
    if (!Element.prototype || Element.prototype.__studybridgeCommunitySelectStable) return;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (!descriptor?.get || !descriptor?.set) return;

    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        const active = document.activeElement;
        const pickerActive = Date.now() < communityPickerLockUntil || Boolean(active?.closest?.("#communityDirectory"));
        const isCommunityChooser = this.id === "communityDirectory" || this.id === "communityChannelTabs";
        if (pickerActive && isCommunityChooser) return;
        return descriptor.set.call(this, value);
      }
    });

    Element.prototype.__studybridgeCommunitySelectStable = true;
    document.addEventListener("focusin", (event) => {
      if (event.target?.closest?.("#communityDirectory")) communityPickerLockUntil = Date.now() + 12000;
    });
    document.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.("#communityDirectory")) communityPickerLockUntil = Date.now() + 12000;
    });
    document.addEventListener("change", (event) => {
      if (event.target?.closest?.("#communityDirectory")) communityPickerLockUntil = Date.now() + 300;
    });
    document.addEventListener("focusout", (event) => {
      if (event.target?.closest?.("#communityDirectory")) communityPickerLockUntil = Date.now() + 300;
    });
  }

  async function copyTextToClipboard(text) {
    if (!text) throw new Error("没有可复制的邀请码。");
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      document.body.removeChild(textArea);
    }

    if (!copied) throw new Error("浏览器没有允许复制。已请你手动复制。");
    return "copied";
  }

  function installInviteCopyFix() {
    if (window.__studybridgeInviteCopyFixInstalled) return;
    window.__studybridgeInviteCopyFixInstalled = true;

    document.addEventListener(
      "click",
      async (event) => {
        const button = event.target?.closest?.("[data-copy-invite]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const code = String(button.dataset.copyInvite || "").trim();
        const adminMessage = document.querySelector("#adminMessage");
        const originalText = button.textContent;
        button.disabled = true;

        try {
          await copyTextToClipboard(code);
          button.textContent = "已复制";
          if (adminMessage) adminMessage.textContent = `已复制：${code}`;
        } catch (error) {
          button.textContent = "复制失败";
          if (adminMessage) adminMessage.textContent = error.message || "复制失败，请手动复制邀请码。";
        } finally {
          setTimeout(() => {
            button.disabled = false;
            button.textContent = originalText || "复制";
          }, 1400);
        }
      },
      true
    );
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
  installCommunityDirectoryStability();
  installInviteCopyFix();
  installRequestListCollapse();
  setInterval(installClassmateChatBubbleFix, 1500);
  setInterval(installRequestListCollapse, 1200);
  setInterval(pollActiveClassmateMessages, 3500);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pollActiveClassmateMessages();
  });
})();
