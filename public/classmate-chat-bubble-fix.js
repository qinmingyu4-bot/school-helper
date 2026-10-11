(() => {
  let lastActiveClassmateId = "";
  let lastMessageSignature = "";
  let isPollingMessages = false;
  let requestsExpanded = false;
  let latestClassmates = [];

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
    return new Date(value).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function installStyle() {
    let style = document.querySelector("#studybridge-classmate-chat-bubble-fix");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-classmate-chat-bubble-fix";
      document.head.appendChild(style);
    }
    if (style.dataset.ready === "true") return;

    style.textContent = `
      #classmatesPage {
        min-height: 0 !important;
      }

      #classmatesPage .classmates-body {
        min-height: 0 !important;
        overflow: hidden !important;
      }

      #classmatesPage .classmates-chat-shell {
        height: 100% !important;
        min-height: 0 !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto !important;
        overflow: hidden !important;
      }

      #classmatesPage .direct-message-list {
        display: flex !important;
        flex-direction: column !important;
        align-content: stretch !important;
        justify-content: flex-start !important;
        gap: 10px !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        padding-bottom: 34px !important;
        overscroll-behavior: contain !important;
        scrollbar-gutter: stable !important;
      }

      #classmatesPage .direct-message {
        display: grid !important;
        flex: 0 0 auto !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        align-items: end !important;
        justify-content: space-between !important;
        gap: 16px !important;
        box-sizing: border-box !important;
        width: fit-content !important;
        min-width: min(360px, 72vw) !important;
        max-width: min(720px, 86%) !important;
        min-height: 0 !important;
        height: auto !important;
        padding: 9px 14px !important;
        border-radius: 8px !important;
        line-height: 1.42 !important;
        white-space: pre-wrap !important;
      }

      #classmatesPage .direct-message > span {
        min-width: 0 !important;
        display: block !important;
      }

      #classmatesPage .direct-message.mine {
        align-self: flex-end !important;
        justify-self: end !important;
      }

      #classmatesPage .direct-message time {
        display: block !important;
        align-self: end !important;
        margin: 0 !important;
        white-space: nowrap !important;
        text-align: right !important;
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

      #classmatesPage .peer-profile-card {
        margin: 14px 18px 0 !important;
        border: 1px solid var(--line) !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        background: white !important;
        box-shadow: 0 10px 24px rgba(25, 36, 58, 0.05) !important;
      }

      #classmatesPage .peer-profile-card[hidden] {
        display: none !important;
      }

      #classmatesPage .peer-profile-cover {
        height: 84px !important;
        background:
          linear-gradient(135deg, rgba(31, 58, 95, 0.88), rgba(47, 125, 98, 0.8)),
          linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px) !important;
        background-position: center !important;
        background-size: cover, 22px 22px, 22px 22px !important;
      }

      #classmatesPage .peer-profile-cover img {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }

      #classmatesPage .peer-profile-main {
        display: grid !important;
        grid-template-columns: auto minmax(0, 1fr) !important;
        gap: 12px !important;
        align-items: center !important;
        padding: 12px 14px 14px !important;
      }

      #classmatesPage .peer-profile-avatar {
        display: grid !important;
        place-items: center !important;
        width: 58px !important;
        height: 58px !important;
        margin-top: -34px !important;
        border: 3px solid white !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        background: linear-gradient(145deg, #1f3a5f, #2f7d62) !important;
        color: white !important;
        font-weight: 900 !important;
        box-shadow: 0 8px 22px rgba(25, 36, 58, 0.16) !important;
      }

      #classmatesPage .peer-profile-avatar img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }

      #classmatesPage .peer-profile-name {
        margin: 0 !important;
        font-size: 18px !important;
        line-height: 1.2 !important;
      }

      #classmatesPage .peer-profile-facts {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        margin-top: 7px !important;
      }

      #classmatesPage .peer-profile-facts span {
        border: 1px solid #dfe7f1 !important;
        border-radius: 999px !important;
        padding: 4px 8px !important;
        color: var(--muted) !important;
        font-size: 12px !important;
        line-height: 1.2 !important;
        background: #f8fbff !important;
      }

      @media (max-width: 640px) {
        #classmatesPage .direct-message {
          grid-template-columns: 1fr !important;
          align-items: flex-start !important;
          gap: 4px !important;
          min-width: min(260px, 82vw) !important;
          max-width: 92% !important;
        }

        #classmatesPage .direct-message time {
          margin-top: 4px !important;
        }
      }
    `;
    style.dataset.ready = "true";
  }

  function countVisibleRequests(list) {
    if (!list) return 0;
    const empty = list.querySelector(".empty");
    if (empty && /没有|还没有/.test(empty.textContent || "")) return 0;
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

  function getActiveClassmateId() {
    const page = document.querySelector("#classmatesPage:not([hidden])");
    if (!page) return "";
    const activeButton = page.querySelector(".classmate-row.active [data-open-classmate]");
    return activeButton?.dataset?.openClassmate || "";
  }

  function initials(name) {
    return (
      String(name || "SB")
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "SB"
    );
  }

  function ensurePeerProfileCard() {
    const page = document.querySelector("#classmatesPage");
    const head = page?.querySelector(".classmates-chat-head");
    if (!page || !head) return null;
    let card = page.querySelector("#peerProfileCard");
    if (!card) {
      card = document.createElement("article");
      card.id = "peerProfileCard";
      card.className = "peer-profile-card";
      card.hidden = true;
      head.insertAdjacentElement("afterend", card);
    }
    return card;
  }

  function renderPeerProfile() {
    const card = ensurePeerProfileCard();
    if (!card) return;
    const activeId = getActiveClassmateId();
    const active = latestClassmates.find((item) => item.id === activeId);
    const peer = active?.peer;
    if (!peer) {
      card.hidden = true;
      card.innerHTML = "";
      return;
    }

    const name = peer.name || "同学";
    const facts = [
      peer.school ? `学校：${peer.school}` : "",
      peer.major ? `专业：${peer.major}` : "",
      peer.sbId ? `SB ID: ${peer.sbId}` : ""
    ].filter(Boolean);

    card.hidden = false;
    card.innerHTML = `
      <div class="peer-profile-cover">
        ${peer.backgroundUrl ? `<img src="${escapeHtml(peer.backgroundUrl)}" alt="">` : ""}
      </div>
      <div class="peer-profile-main">
        <div class="peer-profile-avatar">
          ${peer.avatarUrl ? `<img src="${escapeHtml(peer.avatarUrl)}" alt="">` : escapeHtml(initials(name))}
        </div>
        <div>
          <h4 class="peer-profile-name">${escapeHtml(name)}</h4>
          <div class="peer-profile-facts">
            ${facts.length ? facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("") : "<span>还没有填写公开资料</span>"}
          </div>
        </div>
      </div>
    `;
  }

  async function refreshClassmateProfiles() {
    const page = document.querySelector("#classmatesPage:not([hidden])");
    if (!page) return;
    try {
      const result = await api("/api/classmates");
      latestClassmates = result.classmates || [];
      renderPeerProfile();
    } catch {
      renderPeerProfile();
    }
  }

  function normalizeMessageCards() {
    const page = document.querySelector("#classmatesPage:not([hidden])");
    if (!page) return;
    page.querySelectorAll(".direct-message").forEach((message) => {
      if (message.dataset.normalizedBubble !== "true") {
        const time = message.querySelector("time");
        const timeHtml = time ? time.outerHTML : "";
        if (time) time.remove();
        const body = message.textContent.trim();
        message.innerHTML = `<span>${escapeHtml(body)}</span>${timeHtml}`;
        message.dataset.normalizedBubble = "true";
      }
      compactMessageCard(message);
    });
  }

  function compactMessageCard(message) {
    if (!message) return;
    Object.assign(message.style, {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "end",
      gap: "16px",
      minHeight: "0px",
      height: "auto",
      padding: "9px 14px",
      lineHeight: "1.42"
    });
    const text = message.querySelector("span");
    if (text) text.style.display = "block";
    const time = message.querySelector("time");
    if (time) {
      Object.assign(time.style, {
        margin: "0",
        alignSelf: "end",
        whiteSpace: "nowrap",
        textAlign: "right"
      });
    }
  }

  function installMessageObserver() {
    const list = document.querySelector("#classmatesPage #directMessageList");
    if (!list || list.dataset.compactObserver === "true") return;
    const observer = new MutationObserver(() => {
      requestAnimationFrame(normalizeMessageCards);
    });
    observer.observe(list, { childList: true, subtree: true });
    list.dataset.compactObserver = "true";
  }

  async function pollActiveClassmateMessages() {
    const page = document.querySelector("#classmatesPage:not([hidden])");
    if (!page || isPollingMessages) return;

    const activeClassmateId = getActiveClassmateId();
    const list = page.querySelector("#directMessageList");
    if (!activeClassmateId || !list) return;

    const activeChanged = activeClassmateId !== lastActiveClassmateId;
    if (activeClassmateId !== lastActiveClassmateId) {
      lastActiveClassmateId = activeClassmateId;
      lastMessageSignature = "";
      await refreshClassmateProfiles();
    }

    isPollingMessages = true;
    try {
      const result = await api(`/api/classmates/${encodeURIComponent(activeClassmateId)}/messages`);
      const messages = result.messages || [];
      const signature = messages.map((item) => `${item.id}:${item.createdAt}:${item.content}`).join("|");
      if (signature !== lastMessageSignature) {
        const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
        lastMessageSignature = signature;
        list.innerHTML = messages.length
          ? messages
              .map(
                (message) => `
                  <article class="direct-message ${message.mine ? "mine" : ""}" data-normalized-bubble="true">
                    <span>${escapeHtml(message.content)}</span>
                    <time>${formatDateTime(message.createdAt)}</time>
                  </article>
                `
              )
              .join("")
          : '<p class="empty">还没有消息。先打个招呼吧。</p>';
        if (wasNearBottom || activeChanged) list.scrollTop = list.scrollHeight;
      }
    } catch {
      // Keep the existing view if the network hiccups.
    } finally {
      isPollingMessages = false;
    }
  }

  function boot() {
    installStyle();
    installRequestListCollapse();
    ensurePeerProfileCard();
    installMessageObserver();
    normalizeMessageCards();
    renderPeerProfile();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-open-classmate]")) {
      setTimeout(() => {
        refreshClassmateProfiles();
        pollActiveClassmateMessages();
      }, 80);
    }
  });

  boot();
  setInterval(() => {
    const page = document.querySelector("#classmatesPage:not([hidden])");
    if (!page || document.visibilityState === "hidden") return;
    pollActiveClassmateMessages();
  }, 2500);
  setInterval(() => {
    boot();
    if (document.querySelector("#classmatesPage:not([hidden])")) refreshClassmateProfiles();
  }, 10000);
})();
