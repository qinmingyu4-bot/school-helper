(() => {
  let me = null;
  let page = null;
  let button = null;
  let classmates = [];
  let candidates = [];
  let activeClassmateId = "";

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

  async function refreshMe() {
    try {
      const result = await api("/api/me");
      me = result.user;
    } catch {
      me = null;
    }
    return me;
  }

  function installStyle() {
    if (document.querySelector("#studybridge-classmates-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-classmates-style";
    style.textContent = `
      .classmates-entry {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 48px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        color: var(--navy);
        text-align: left;
        box-shadow: 0 8px 24px rgba(25, 36, 58, 0.04);
      }

      .classmates-entry:hover {
        border-color: var(--green);
      }

      .classmates-entry-icon {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: linear-gradient(145deg, var(--navy), var(--green));
        color: white;
        font-weight: 900;
      }

      .classmates-entry strong {
        display: block;
        font-size: 14px;
      }

      .classmates-entry span {
        color: var(--muted);
        font-size: 12px;
      }

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
        grid-template-columns: minmax(270px, 370px) minmax(0, 1fr);
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
        grid-template-rows: auto auto minmax(0, 1fr);
        gap: 12px;
        padding: 16px;
      }

      .classmate-add-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
      }

      .classmate-add-form input {
        min-width: 0;
      }

      .classmate-list,
      .classmate-candidates,
      .direct-message-list {
        display: grid;
        gap: 8px;
        min-height: 0;
        overflow: auto;
      }

      .classmate-list {
        align-content: start;
      }

      .classmate-row,
      .candidate-row {
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

      .classmate-row button,
      .candidate-row button {
        text-align: left;
      }

      .classmate-meta {
        display: block;
        color: var(--muted);
        font-size: 12px;
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

  function ensureButton() {
    if (document.querySelector("#openClassmatesButton")) {
      button = document.querySelector("#openClassmatesButton");
      return;
    }
    const anchor = document.querySelector("#openSchoolCommunityButton") || document.querySelector("#openProfilePageButton");
    if (!anchor) return;
    button = document.createElement("button");
    button.id = "openClassmatesButton";
    button.type = "button";
    button.className = "classmates-entry";
    button.innerHTML = `
      <span class="classmates-entry-icon">友</span>
      <span><strong>同学</strong><span id="classmatesEntrySchool">添加同校同学并聊天</span></span>
    `;
    anchor.insertAdjacentElement("afterend", button);
    button.addEventListener("click", showClassmatesPage);
  }

  function ensurePage() {
    if (page) return page;
    const workspace = document.querySelector(".workspace");
    if (!workspace) return null;
    page = document.createElement("section");
    page.id = "classmatesPage";
    page.className = "classmates-page";
    page.hidden = true;
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">Classmates</p>
          <h2>同学</h2>
          <span id="classmatesStatusLine">按 Profile 的学校展示同校同学。</span>
        </div>
        <button class="ghost-button" id="backFromClassmatesButton" type="button">返回学习区</button>
      </header>
      <div class="classmates-body">
        <aside class="classmates-side">
          <div>
            <h3>同学列表</h3>
            <p class="classmates-message" id="classmatesSchoolLine">先填写 Profile 学校。</p>
          </div>
          <form class="classmate-add-form" id="classmateAddForm">
            <input id="classmateEmailInput" type="text" placeholder="输入同学的 SB ID，例如 adam2026" autocomplete="off" />
            <button class="small-button" type="submit">添加</button>
          </form>
          <div class="classmate-list" id="classmateList"></div>
          <div>
            <h3>同校用户</h3>
            <div class="classmate-candidates" id="classmateCandidates"></div>
          </div>
        </aside>
        <section class="classmates-chat-shell">
          <header class="classmates-chat-head">
            <div>
              <p class="eyebrow">Direct Chat</p>
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
    workspace.appendChild(page);
    page.querySelector("#backFromClassmatesButton").addEventListener("click", showStudyPage);
    page.querySelector("#refreshClassmatesButton").addEventListener("click", loadClassmates);
    page.querySelector("#classmateAddForm").addEventListener("submit", addClassmate);
    page.querySelector("#classmateChatForm").addEventListener("submit", sendClassmateMessage);
    return page;
  }

  function hideOtherPages() {
    ["#workspacePage", "#profilePage", "#schoolCommunityPage"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = true;
    });
  }

  function showStudyPage() {
    const workspacePage = document.querySelector("#workspacePage");
    const profilePage = document.querySelector("#profilePage");
    const communityPage = document.querySelector("#schoolCommunityPage");
    if (page) page.hidden = true;
    if (profilePage) profilePage.hidden = true;
    if (communityPage) communityPage.hidden = true;
    if (workspacePage) workspacePage.hidden = false;
  }

  async function showClassmatesPage() {
    installStyle();
    ensurePage();
    hideOtherPages();
    page.hidden = false;
    await loadClassmates();
  }

  async function loadClassmates() {
    const status = page.querySelector("#classmatesStatusLine");
    const schoolLine = page.querySelector("#classmatesSchoolLine");
    status.textContent = "正在读取同学列表...";
    try {
      await refreshMe();
      const result = await api("/api/classmates");
      classmates = result.classmates || [];
      candidates = result.candidates || [];
      schoolLine.textContent = result.school ? `当前学校：${result.school}` : "先填写 Profile 学校。";
      status.textContent = classmates.length ? `已添加 ${classmates.length} 位同学。` : "可以通过同学的 SB ID 添加。";
      renderClassmates();
      renderCandidates();
      if (activeClassmateId && !classmates.some((item) => item.id === activeClassmateId)) activeClassmateId = "";
      if (!activeClassmateId && classmates[0]) activeClassmateId = classmates[0].id;
      await loadDirectMessages();
    } catch (error) {
      status.textContent = error.message;
      page.querySelector("#classmateList").innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
      page.querySelector("#classmateCandidates").innerHTML = "";
      page.querySelector("#directMessageList").innerHTML = "";
    }
  }

  function renderClassmates() {
    const list = page.querySelector("#classmateList");
    if (!classmates.length) {
      list.innerHTML = '<p class="empty">还没有添加同学。输入同学注册邮箱开始。</p>';
      return;
    }
    list.innerHTML = classmates
      .map((item) => {
        const last = item.lastMessage?.content ? ` · ${item.lastMessage.mine ? "你：" : ""}${item.lastMessage.content}` : "";
        return `
          <article class="classmate-row ${item.id === activeClassmateId ? "active" : ""}">
            <button class="item-main" type="button" data-open-classmate="${item.id}">
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
      list.innerHTML = '<p class="empty">暂时没有可直接添加的同校用户，也可以输入邮箱添加。</p>';
      return;
    }
    list.innerHTML = candidates
      .map(
        (item) => `
          <article class="candidate-row">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span class="classmate-meta">${escapeHtml(item.sbId ? `@${item.sbId}` : item.email)}</span>
            </div>
            <button class="small-button" type="button" data-add-candidate="${escapeHtml(item.sbId || item.email)}">添加</button>
          </article>
        `
      )
      .join("");
    list.querySelectorAll("[data-add-candidate]").forEach((button) => {
      button.addEventListener("click", async () => {
        page.querySelector("#classmateEmailInput").value = button.dataset.addCandidate;
        await addClassmate(new Event("submit"));
      });
    });
  }

  async function addClassmate(event) {
    event.preventDefault();
    const input = page.querySelector("#classmateEmailInput");
    const status = page.querySelector("#classmatesStatusLine");
    const sbId = input.value.trim().replace(/^@+/, "");
    if (!sbId) return;
    status.textContent = "正在添加同学...";
    try {
      const result = await api("/api/classmates", { method: "POST", body: { sbId } });
      input.value = "";
      activeClassmateId = result.classmate.id;
      await loadClassmates();
      status.textContent = "同学已添加，可以开始聊天。";
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
      list.innerHTML = '<p class="empty">添加同学后，这里会显示你们的聊天。</p>';
      return;
    }
    title.textContent = active.peer?.name || "同学";
    const result = await api(`/api/classmates/${active.id}/messages`);
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
    await api(`/api/classmates/${active.id}/messages`, { method: "POST", body: { content } });
    await loadDirectMessages();
    await loadClassmates();
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function boot() {
    installStyle();
    ensureButton();
    ensurePage();
  }

  window.studybridgeOpenClassmatesPage = showClassmatesPage;

  boot();
  setInterval(() => {
    ensureButton();
    ensurePage();
  }, 1200);
})();
