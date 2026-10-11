(() => {
  if (window.__studybridgeEmailReplyPatch === "20261007-3") return;
  window.__studybridgeEmailReplyPatch = "20261007-3";

  let page = null;
  let button = null;
  let lastDraft = "";

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
    if (document.querySelector("#studybridge-email-reply-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-email-reply-style";
    style.textContent = `
      .email-helper-entry {
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

      .email-helper-entry:hover {
        border-color: var(--green);
      }

      .email-helper-entry-icon {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: linear-gradient(145deg, #244767, #2f8068);
        color: white;
        font-weight: 900;
      }

      .email-helper-entry strong {
        display: block;
        font-size: 14px;
      }

      .email-helper-entry span {
        color: var(--muted);
        font-size: 12px;
      }

      .email-helper-page {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        min-height: 0;
        height: 100vh;
        overflow: hidden;
      }

      .email-helper-page[hidden] {
        display: none;
      }

      .email-helper-body {
        display: grid;
        grid-template-columns: minmax(320px, 0.92fr) minmax(360px, 1.08fr);
        gap: 18px;
        min-height: 0;
        padding: 22px 28px;
        overflow: auto;
      }

      .email-helper-card {
        display: grid;
        gap: 14px;
        align-content: start;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 16px 42px rgba(25, 36, 58, 0.06);
      }

      .email-helper-card h3 {
        margin: 0;
      }

      .email-helper-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .email-helper-card label {
        display: grid;
        gap: 6px;
        color: var(--navy);
        font-size: 13px;
        font-weight: 850;
      }

      .email-helper-card textarea {
        min-height: 190px;
        resize: vertical;
      }

      #emailReplyGoalInput {
        min-height: 86px;
      }

      .email-helper-output {
        display: grid;
        gap: 12px;
        align-content: start;
        min-height: 360px;
      }

      .email-helper-result {
        min-height: 310px;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #f8fbff;
        color: var(--ink);
        line-height: 1.72;
        white-space: pre-wrap;
      }

      .email-helper-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      @media (max-width: 920px) {
        .email-helper-page {
          height: auto;
          overflow: visible;
        }

        .email-helper-body,
        .email-helper-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    if (document.querySelector("#openEmailReplyButton")) {
      button = document.querySelector("#openEmailReplyButton");
      return;
    }
    const anchor =
      document.querySelector("#openClassmatesButton") ||
      document.querySelector("#openSchoolCommunityButton") ||
      document.querySelector("#openProfilePageButton");
    if (!anchor) return;
    button = document.createElement("button");
    button.id = "openEmailReplyButton";
    button.type = "button";
    button.className = "email-helper-entry";
    button.innerHTML = `
      <span class="email-helper-entry-icon">信</span>
      <span><strong>邮件助手</strong><span>理解邮件并生成英文回复</span></span>
    `;
    anchor.insertAdjacentElement("afterend", button);
    button.addEventListener("click", showEmailHelperPage);
  }

  function ensurePage() {
    if (page) return page;
    const workspace = document.querySelector(".workspace");
    if (!workspace) return null;
    page = document.createElement("section");
    page.id = "emailReplyPage";
    page.className = "email-helper-page";
    page.hidden = true;
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">Email Coach</p>
          <h2>邮件回复助手</h2>
          <span id="emailReplyStatusLine">粘贴邮件内容，StudyBridge 会帮你看懂并起草回复。</span>
        </div>
        <button class="ghost-button" id="backFromEmailReplyButton" type="button">返回学习区</button>
      </header>
      <div class="email-helper-body">
        <form class="email-helper-card" id="emailReplyForm">
          <h3>收到的邮件</h3>
          <label>
            <span>邮件原文</span>
            <textarea id="emailReplySourceInput" placeholder="把老师、TA、学校办公室或同学发来的邮件粘贴在这里"></textarea>
          </label>
          <label>
            <span>你想怎么回复</span>
            <textarea id="emailReplyGoalInput" placeholder="例如：我想礼貌申请延期 / 确认 meeting time / 解释我会晚交 / 问清楚作业要求"></textarea>
          </label>
          <div class="email-helper-grid">
            <label>
              <span>语气</span>
              <select id="emailReplyToneInput">
                <option value="professional and warm">专业、自然</option>
                <option value="polite and apologetic">礼貌道歉</option>
                <option value="friendly and concise">友好简洁</option>
                <option value="firm but respectful">坚定但尊重</option>
              </select>
            </label>
            <label>
              <span>输出</span>
              <select id="emailReplyOutputInput">
                <option value="Chinese explanation plus English reply">中文解读 + 英文回复</option>
                <option value="English reply only">只要英文回复</option>
                <option value="Bilingual reply">中英双语回复</option>
              </select>
            </label>
          </div>
          <div class="email-helper-actions">
            <button class="primary-button" id="generateEmailReplyButton" type="submit">生成回复</button>
            <button class="ghost-button" id="clearEmailReplyButton" type="button">清空</button>
          </div>
        </form>
        <section class="email-helper-card email-helper-output">
          <div class="panel-title">
            <div>
              <p class="eyebrow">Draft</p>
              <h3>建议回复</h3>
            </div>
            <button class="small-button" id="copyEmailReplyButton" type="button">复制</button>
          </div>
          <div class="email-helper-result" id="emailReplyResult">生成后会显示：邮件重点、需要注意的地方，以及一版可以直接修改发送的英文回复。</div>
        </section>
      </div>
    `;
    workspace.appendChild(page);
    page.querySelector("#backFromEmailReplyButton").addEventListener("click", showStudyPage);
    page.querySelector("#emailReplyForm").addEventListener("submit", generateReply);
    page.querySelector("#clearEmailReplyButton").addEventListener("click", clearForm);
    page.querySelector("#copyEmailReplyButton").addEventListener("click", copyReply);
    return page;
  }

  function setWorkspaceShell(activeFeaturePage = true) {
    const workspacePage = document.querySelector("#workspacePage");
    if (workspacePage) {
      workspacePage.hidden = false;
      workspacePage.removeAttribute("hidden");
      workspacePage.style.display = "";
      workspacePage.style.visibility = "visible";
    }
    document.body.classList.toggle("studybridge-secondary-page", activeFeaturePage);
    document.body.classList.toggle("study-sidebar-hidden", activeFeaturePage);
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    ["#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"].forEach((selector) => {
      const element = document.querySelector(`#workspacePage > ${selector}`);
      if (element) element.hidden = activeFeaturePage;
    });
  }

  function hideOtherPages() {
    setWorkspaceShell(true);
    ["#profilePage", "#schoolCommunityPage", "#classmatesPage", "#schedulePage"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = true;
    });
  }

  function showStudyPage() {
    if (page) page.hidden = true;
    ["#profilePage", "#schoolCommunityPage", "#classmatesPage"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = true;
    });
    setWorkspaceShell(false);
  }

  async function showEmailHelperPage() {
    installStyle();
    ensurePage();
    hideOtherPages();
    page.hidden = false;
    const source = page.querySelector("#emailReplySourceInput");
    if (source) setTimeout(() => source.focus(), 50);
  }

  async function getOrCreateHelperCourse() {
    const coursesResult = await api("/api/courses");
    const existing = (coursesResult.courses || []).find((course) => course.name === "Email Reply Helper");
    if (existing) return existing;
    const created = await api("/api/courses", {
      method: "POST",
      body: { name: "Email Reply Helper", term: "StudyBridge tools" }
    });
    return created.course;
  }

  function buildPrompt({ email, goal, tone, output }) {
    return [
      "[StudyBridge email reply assistant]",
      "Help a student understand and reply to an email.",
      "",
      "Return format:",
      "1. 邮件重点: Explain the sender's intent in clear Chinese.",
      "2. 需要注意: List deadlines, action items, missing facts, and tone risks. Do not invent facts.",
      "3. 英文回复草稿: Draft a concise, polished email reply in English. Use placeholders like [date] or [course code] if needed.",
      "4. 可选替换句: Give 2-3 useful alternative sentences if the situation is sensitive.",
      "",
      `Preferred tone: ${tone}`,
      `Output preference: ${output}`,
      "",
      "Student goal/context:",
      goal || "No extra context provided.",
      "",
      "Email received:",
      email
    ].join("\n");
  }

  async function generateReply(event) {
    event.preventDefault();
    const status = page.querySelector("#emailReplyStatusLine");
    const resultBox = page.querySelector("#emailReplyResult");
    const submit = page.querySelector("#generateEmailReplyButton");
    const email = page.querySelector("#emailReplySourceInput").value.trim();
    const goal = page.querySelector("#emailReplyGoalInput").value.trim();
    const tone = page.querySelector("#emailReplyToneInput").value;
    const output = page.querySelector("#emailReplyOutputInput").value;
    if (!email) {
      resultBox.textContent = "先把收到的邮件粘贴进来。";
      return;
    }
    status.textContent = "正在生成回复...";
    submit.disabled = true;
    resultBox.textContent = "StudyBridge 正在分析邮件。";
    try {
      await api("/api/me");
      const course = await getOrCreateHelperCourse();
      const response = await api(`/api/courses/${course.id}/chat`, {
        method: "POST",
        body: { message: buildPrompt({ email, goal, tone, output }), mode: "email" }
      });
      const assistant = (response.messages || []).findLast?.((message) => message.role === "assistant") ||
        (response.messages || []).reverse().find((message) => message.role === "assistant");
      lastDraft = assistant?.content || "没有收到 AI 回复，请再试一次。";
      resultBox.textContent = lastDraft;
      status.textContent = "已生成。这个记录会保存在你的账号里。";
    } catch (error) {
      resultBox.textContent = error.message || "生成失败，请稍后再试。";
      status.textContent = "生成失败。";
    } finally {
      submit.disabled = false;
    }
  }

  function clearForm() {
    page.querySelector("#emailReplySourceInput").value = "";
    page.querySelector("#emailReplyGoalInput").value = "";
    lastDraft = "";
    page.querySelector("#emailReplyResult").textContent = "生成后会显示：邮件重点、需要注意的地方，以及一版可以直接修改发送的英文回复。";
    page.querySelector("#emailReplyStatusLine").textContent = "粘贴邮件内容，StudyBridge 会帮你看懂并起草回复。";
  }

  async function copyReply() {
    if (!lastDraft.trim()) return;
    const copyButton = page.querySelector("#copyEmailReplyButton");
    try {
      await navigator.clipboard.writeText(lastDraft);
      copyButton.textContent = "已复制";
    } catch {
      const resultBox = page.querySelector("#emailReplyResult");
      const range = document.createRange();
      range.selectNodeContents(resultBox);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copyButton.textContent = "已选中";
    }
    setTimeout(() => {
      copyButton.textContent = "复制";
    }, 1400);
  }

  function boot() {
    installStyle();
    ensureButton();
    ensurePage();
  }

  window.studybridgeOpenEmailReplyPage = showEmailHelperPage;
  boot();
  setInterval(() => {
    ensureButton();
    ensurePage();
  }, 1200);
})();
