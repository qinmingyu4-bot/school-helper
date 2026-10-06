(() => {
  let page = null;
  let button = null;
  let classmates = [];
  let candidates = [];
  let requests = { incoming: [], outgoing: [] };
  let activeClassmateId = "";
  let classmatesRefreshTimer = null;
  let isLoadingClassmates = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
    if (document.querySelector("#studybridge-classmates-request-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-classmates-request-style";
    style.textContent = `
      .classmates-page {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100vh;
        min-height: 0;
        background: #f4f6f9;
      }

      .classmates-page[hidden] {
        display: none;
      }

      .classmates-body {
        display: grid;
        grid-template-columns: minmax(290px, 390px) minmax(0, 1fr);
        gap: 18px;
        min-height: 0;
        padding: 22px 28px;
        overflow: hidden;
      }

      .classmates-side,
      .classmates-chat-shell {
        min-height: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        box-shadow: 0 12px 30px rgba(25, 36, 58, 0.05);
      }

      .classmates-side {
        display: grid;
        grid-template-rows: auto auto auto minmax(0, 1fr) auto;
        gap: 14px;
        padding: 16px;
        overflow: auto;
      }

      .classmate-add-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
      }

      .classmate-add-form input {
        min-width: 0;
      }

      .classmate-section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      .classmate-section-title h3 {
        margin: 0;
      }

      .classmate-list,
      .classmate-candidates,
      .classmate-request-list,
      .direct-message-list {
        display: grid;
        gap: 8px;
        min-height: 0;
        overflow: auto;
      }

      .classmate-row,
      .candidate-row,
      .request-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 10px;
        border: 1px solid #dfe7f1;
        border-radius: 8px;
        background: #fbfdff;
      }

      .classmate-row.active {
        border-color: rgba(56, 103, 214, 0.52);
        background: #eef4ff;
        box-shadow: inset 3px 0 0 var(--blue);
      }

      .request-row.incoming {
        border-color: rgba(47, 125, 98, 0.34);
        background: #f6fbf8;
      }

      .request-actions {
        display: flex;
        gap: 6px;
      }

      .classmate-row button,
      .candidate-row button {
        text-align: left;
      }

      .classmate-meta {
        display: block;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
      }

      .classmates-chat-shell {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
      }

      .classmates-chat-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--line);
      }

      .classmates-chat-head h3 {
        margin: 0;
      }

      .direct-message-list {
        align-content: end;
        padding: 18px;
      }

      .direct-message {
        max-width: min(620px, 86%);
        padding: 11px 13px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        line-height: 1.55;
        white-space: pre-wrap;
      }

      .direct-message.mine {
        justify-self: end;
        border-color: #cbd8f4;
        background: #f0f5ff;
      }

      .direct-message time {
        display: block;
        margin-top: 5px;
        color: var(--muted);
        font-size: 11px;
      }

      .classmate-chat-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 86px;
        gap: 10px;
        padding: 14px 18px 18px;
        border-top: 1px solid var(--line);
        background: rgba(244, 246, 249, 0.86);
      }

      .classmate-chat-form textarea {
        height: 52px;
        min-height: 52px;
        max-height: 140px;
        resize: none;
      }

      .classmates-message {
        min-height: 18px;
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.4;
      }

      @media (max-width: 900px) {
        .classmates-page {
          height: auto;
          min-height: 680px;
        }

        .classmates-body {
          grid-template-columns: 1fr;
          overflow: visible;
          padding: 16px;
        }

        .classmates-chat-shell {
          min-height: 520px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function enhanceButton() {
    const current = document.querySelector("#openClassmatesButton");
    if (!current) return;
    if (current.dataset.requestPatch === "true") {
      button = current;
      return;
    }
    button = current.cloneNode(true);
    button.dataset.requestPatch = "true";
    button.innerHTML = `
      <span class="classmates-entry-icon">友</span>
      <span><strong>同学</strong><span>SB ID 申请和聊天</span></span>
    `;
    current.replaceWith(button);
    button.addEventListener("click", showClassmatesPage);
  }

  function ensurePage() {
    if (page && document.body.contains(page)) return page;
    const workspace = document.querySelector(".workspace");
    if (!workspace) return null;
    page = document.querySelector("#classmatesPage") || document.createElement("section");
    page.id = "classmatesPage";
    page.className = "classmates-page";
    page.hidden = true;
    page.dataset.requestPatch = "true";
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">CLASSMATES</p>
          <h2>同学</h2>
          <span id="classmatesStatusLine">可以通过同学的 SB ID 发送申请。</span>
        </div>
        <button class="ghost-button" id="backFromClassmatesButton" type="button">返回学习区</button>
      </header>
      <div class="classmates-body">
        <aside class="classmates-side">
          <div>
            <h3>添加同学</h3>
            <p class="classmates-message" id="classmatesSchoolLine">输入对方 Profile 里的 SB ID。</p>
          </div>
          <form class="classmate-add-form" id="classmateAddForm">
            <input id="classmateSbIdInput" type="text" placeholder="输入 SB ID，例如 adam2026" autocomplete="off" spellcheck="false" />
            <button class="small-button" type="submit">发送申请</button>
          </form>
          <section>
            <div class="classmate-section-title">
              <h3>申请列表</h3>
              <button class="small-button" id="refreshClassmateRequestsButton" type="button">刷新</button>
            </div>
            <div class="classmate-request-list" id="classmateRequestList"></div>
          </section>
          <section>
            <div class="classmate-section-title"><h3>同学列表</h3></div>
            <div class="classmate-list" id="classmateList"></div>
          </section>
          <section>
            <div class="classmate-section-title"><h3>同校用户</h3></div>
            <div class="classmate-candidates" id="classmateCandidates"></div>
          </section>
        </aside>
        <section class="classmates-chat-shell">
          <header class="classmates-chat-head">
            <div>
              <p class="eyebrow">DIRECT CHAT</p>
              <h3 id="classmateChatTitle">请选择一位同学</h3>
            </div>
            <button class="small-button" id="refreshClassmatesButton" type="button">刷新</button>
          </header>
          <div class="direct-message-list" id="directMessageList"></div>
          <form class="classmate-chat-form" id="classmateChatForm">
            <textarea id="classmateMessageInput" placeholder="写一句话给同学"></textarea>
            <button class="send-button" type="submit">发送</button>
          </form>
        </section>
      </div>
    `;
    if (!page.parentElement) workspace.appendChild(page);
    page.querySelector("#backFromClassmatesButton").addEventListener("click", showStudyPage);
    page.querySelector("#refreshClassmateRequestsButton").addEventListener("click", loadClassmates);
    page.querySelector("#refreshClassmatesButton").addEventListener("click", loadClassmates);
    page.querySelector("#classmateAddForm").addEventListener("submit", addClassmate);
    page.querySelector("#classmateChatForm").addEventListener("submit", sendClassmateMessage);
    return page;
  }

  function hideOtherPages() {
    ["#workspacePage", "#profilePage", "#schoolCommunityPage", "#emailReplyPage", "#schedulePage"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = true;
    });
  }

  function showStudyPage() {
    if (page) page.hidden = true;
    ["#profilePage", "#schoolCommunityPage", "#emailReplyPage", "#schedulePage"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = true;
    });
    const workspacePage = document.querySelector("#workspacePage");
    if (workspacePage) workspacePage.hidden = false;
  }

  async function showClassmatesPage() {
    installStyle();
    enhanceButton();
    ensurePage();
    if (!page) return;
    hideOtherPages();
    page.hidden = false;
    startClassmateRefreshTimer();
    await loadClassmates();
  }

  function startClassmateRefreshTimer() {
    if (classmatesRefreshTimer) return;
    classmatesRefreshTimer = setInterval(() => {
      if (!page || page.hidden || document.visibilityState === "hidden") return;
      loadClassmates({ silent: true });
    }, 6000);
  }

  async function loadClassmates(options = {}) {
    if (!page || isLoadingClassmates) return;
    const silent = Boolean(options.silent);
    isLoadingClassmates = true;
    const status = page.querySelector("#classmatesStatusLine");
    const schoolLine = page.querySelector("#classmatesSchoolLine");
    if (!silent) status.textContent = "正在读取同学和申请...";
    try {
      const result = await api("/api/classmates");
      classmates = result.classmates || [];
      candidates = result.candidates || [];
      requests = result.requests || { incoming: [], outgoing: [] };
      schoolLine.textContent = result.school ? `当前学校：${result.school}` : "没有填写学校也可以用 SB ID 添加同学。";
      if (activeClassmateId && !classmates.some((item) => item.id === activeClassmateId)) activeClassmateId = "";
      if (!activeClassmateId && classmates[0]) activeClassmateId = classmates[0].id;
      renderRequests();
      renderClassmates();
      renderCandidates();
      await loadDirectMessages();
      const incomingCount = requests.incoming?.length || 0;
      const outgoingCount = requests.outgoing?.length || 0;
      status.textContent = incomingCount || outgoingCount
        ? `你有 ${incomingCount} 个待处理申请，${outgoingCount} 个已发送申请。`
        : classmates.length
          ? `已添加 ${classmates.length} 位同学。`
          : "输入同学的 SB ID，先发送申请。";
    } catch (error) {
      if (!silent) {
        status.textContent = error.message;
        page.querySelector("#classmateRequestList").innerHTML = "";
        page.querySelector("#classmateList").innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
        page.querySelector("#classmateCandidates").innerHTML = "";
        page.querySelector("#directMessageList").innerHTML = "";
      }
    } finally {
      isLoadingClassmates = false;
    }
  }

  function renderRequests() {
    const list = page.querySelector("#classmateRequestList");
    const incoming = requests.incoming || [];
    const outgoing = requests.outgoing || [];
    if (!incoming.length && !outgoing.length) {
      list.innerHTML = '<p class="empty">还没有好友申请。</p>';
      return;
    }
    const incomingHtml = incoming
      .map((request) => {
        const from = request.from || {};
        return `
          <article class="request-row incoming">
            <div>
              <strong>${escapeHtml(from.name || "同学")}</strong>
              <span class="classmate-meta">@${escapeHtml(from.sbId || "no-id")} · ${escapeHtml(from.school || "未填写学校")}</span>
            </div>
            <div class="request-actions">
              <button class="small-button" type="button" data-request-action="accept" data-request-id="${escapeHtml(request.id)}">通过</button>
              <button class="small-button" type="button" data-request-action="ignore" data-request-id="${escapeHtml(request.id)}">忽略</button>
            </div>
          </article>
        `;
      })
      .join("");
    const outgoingHtml = outgoing
      .map((request) => {
        const to = request.to || {};
        return `
          <article class="request-row">
            <div>
              <strong>等待 ${escapeHtml(to.name || "同学")} 通过</strong>
              <span class="classmate-meta">@${escapeHtml(to.sbId || "no-id")} · ${escapeHtml(to.school || "未填写学校")}</span>
            </div>
            <span class="classmate-meta">已发送</span>
          </article>
        `;
      })
      .join("");
    list.innerHTML = incomingHtml + outgoingHtml;
    list.querySelectorAll("[data-request-action]").forEach((control) => {
      control.addEventListener("click", async () => {
        await respondToRequest(control.dataset.requestId, control.dataset.requestAction);
      });
    });
  }

  function renderClassmates() {
    const list = page.querySelector("#classmateList");
    if (!classmates.length) {
      list.innerHTML = '<p class="empty">通过申请后，同学会显示在这里。</p>';
      return;
    }
    list.innerHTML = classmates
      .map((item) => {
        const last = item.lastMessage?.content ? ` · ${item.lastMessage.mine ? "你：" : ""}${item.lastMessage.content}` : "";
        return `
          <article class="classmate-row ${item.id === activeClassmateId ? "active" : ""}">
            <button class="item-main" type="button" data-open-classmate="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.peer?.name || "同学")}</strong>
              <span class="classmate-meta">${escapeHtml(item.peer?.sbId ? `@${item.peer.sbId}` : item.peer?.email || "")}${escapeHtml(last).slice(0, 70)}</span>
            </button>
          </article>
        `;
      })
      .join("");
    list.querySelectorAll("[data-open-classmate]").forEach((item) => {
      item.addEventListener("click", async () => {
        activeClassmateId = item.dataset.openClassmate;
        renderClassmates();
        await loadDirectMessages();
      });
    });
  }

  function renderCandidates() {
    const list = page.querySelector("#classmateCandidates");
    if (!candidates.length) {
      list.innerHTML = '<p class="empty">暂时没有可推荐的同校用户，也可以直接输入 SB ID。</p>';
      return;
    }
    list.innerHTML = candidates
      .map(
        (item) => `
          <article class="candidate-row">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span class="classmate-meta">${escapeHtml(item.sbId ? `@${item.sbId}` : "未设置 SB ID")} · ${escapeHtml(item.major || item.email)}</span>
            </div>
            <button class="small-button" type="button" data-add-candidate="${escapeHtml(item.sbId || "")}" ${item.sbId ? "" : "disabled"}>申请</button>
          </article>
        `
      )
      .join("");
    list.querySelectorAll("[data-add-candidate]").forEach((candidateButton) => {
      candidateButton.addEventListener("click", async () => {
        page.querySelector("#classmateSbIdInput").value = candidateButton.dataset.addCandidate;
        await addClassmate(new Event("submit"));
      });
    });
  }

  async function addClassmate(event) {
    event.preventDefault();
    const input = page.querySelector("#classmateSbIdInput");
    const status = page.querySelector("#classmatesStatusLine");
    const sbId = input.value.trim().replace(/^@+/, "");
    if (!sbId) return;
    status.textContent = "正在发送申请...";
    try {
      const result = await api("/api/classmates", { method: "POST", body: { sbId } });
      input.value = "";
      if (result.classmate) activeClassmateId = result.classmate.id;
      await loadClassmates();
      status.textContent =
        result.status === "pending" ? "申请已发送，等待对方通过。" : "你们已经是同学，可以开始聊天了。";
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function respondToRequest(requestId, action) {
    const status = page.querySelector("#classmatesStatusLine");
    status.textContent = action === "accept" ? "正在通过申请..." : "正在忽略申请...";
    try {
      const result = await api(`/api/classmate-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        body: { action }
      });
      if (result.classmate) activeClassmateId = result.classmate.id;
      await loadClassmates();
      status.textContent = action === "accept" ? "已通过申请，可以开始聊天。" : "已忽略这条申请。";
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function loadDirectMessages() {
    const title = page.querySelector("#classmateChatTitle");
    const list = page.querySelector("#directMessageList");
    const active = classmates.find((item) => item.id === activeClassmateId);
    if (!active) {
      title.textContent = "请选择一位同学";
      list.innerHTML = '<p class="empty">申请通过后，这里会显示你们的聊天。</p>';
      return;
    }
    title.textContent = active.peer?.name || "同学";
    const result = await api(`/api/classmates/${encodeURIComponent(active.id)}/messages`);
    const messages = result.messages || [];
    if (!messages.length) {
      list.innerHTML = '<p class="empty">还没有消息。先打个招呼吧。</p>';
      return;
    }
    list.innerHTML = messages
      .map(
        (message) => `
          <article class="direct-message ${message.mine ? "mine" : ""}">
            ${escapeHtml(message.content)}
            <time>${formatDateTime(message.createdAt)}</time>
          </article>
        `
      )
      .join("");
    list.scrollTop = list.scrollHeight;
  }

  async function sendClassmateMessage(event) {
    event.preventDefault();
    const input = page.querySelector("#classmateMessageInput");
    const active = classmates.find((item) => item.id === activeClassmateId);
    const content = input.value.trim();
    if (!active || !content) return;
    input.value = "";
    await api(`/api/classmates/${encodeURIComponent(active.id)}/messages`, { method: "POST", body: { content } });
    await loadDirectMessages();
    await loadClassmates();
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function boot() {
    installStyle();
    enhanceButton();
    ensurePage();
  }

  boot();
  setInterval(boot, 1200);
})();