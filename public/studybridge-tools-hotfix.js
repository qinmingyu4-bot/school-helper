(() => {
  const VERSION = "20261008-tools-1.0.88";
  if (window.__studybridgeToolsHubVersion === VERSION) return;
  window.__studybridgeToolsHubVersion = VERSION;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));

  const storageId = () => {
    const userLine = $("#userLine")?.textContent || "guest";
    return userLine.replace(/[^a-z0-9@._-]+/gi, "_").slice(0, 80) || "guest";
  };
  const storageKey = () => `studybridge.tools.workspace.v2.${storageId()}`;
  const defaultState = () => ({
    active: "docs",
    docs: { title: "Untitled essay", body: "" },
    sheets: {
      rows: [
        ["Task", "Course", "Due", "Priority", "Status"],
        ["", "", "", "", ""],
        ["", "", "", "", ""],
        ["", "", "", "", ""]
      ]
    },
    slides: {
      activeIndex: 0,
      items: [
        { title: "Title slide", bullets: "Main idea\nKey evidence\nTakeaway", notes: "" }
      ]
    },
    aiOutput: "选择一个工具，然后输入要求。AI 的建议会出现在这里，你可以复制到左边继续修改。"
  });
  let state = loadState();
  let saveTimer = null;

  function loadState() {
    try {
      return { ...defaultState(), ...JSON.parse(localStorage.getItem(storageKey()) || "{}") };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem(storageKey(), JSON.stringify(state));
      const label = $("#sbToolsSaveStatus");
      if (label) label.textContent = "Saved";
    }, 120);
  }

  function injectStyles() {
    if ($("#studybridgeToolsStyles")) return;
    const style = document.createElement("style");
    style.id = "studybridgeToolsStyles";
    style.textContent = `
      #studybridgeToolsNav {
        width: 100%;
        border: 1px solid #cfd9e8;
        border-radius: 8px;
        background: #fff;
        color: #0b2a55;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        margin: 10px 0;
        cursor: pointer;
        text-align: left;
        font: inherit;
      }
      #studybridgeToolsNav:hover,
      #studybridgeToolsNav.active {
        border-color: #2f8a6c;
        background: #f7fbf9;
      }
      .sb-tool-icon {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        display: inline-grid;
        place-items: center;
        flex: 0 0 auto;
        background: linear-gradient(135deg, #214568, #2f8a6c);
        color: #fff;
        font-weight: 900;
      }
      .sb-tool-nav-text strong,
      .sb-tools-tab strong { display: block; line-height: 1.2; }
      .sb-tool-nav-text span,
      .sb-tools-tab span { display: block; color: #4c5f7d; font-size: 13px; line-height: 1.35; margin-top: 2px; }
      #studybridgeToolsPage { display: none; min-height: 100vh; padding: 28px 32px 44px; }
      body.sb-tools-mode #studybridgeToolsPage { display: block; }
      body.sb-tools-mode #workspacePage > .topbar,
      body.sb-tools-mode #workspacePage > #developerPanel,
      body.sb-tools-mode #workspacePage > #chatArea,
      body.sb-tools-mode #workspacePage > #quickPrompts,
      body.sb-tools-mode #workspacePage > #chatForm,
      body.sb-tools-mode #workspacePage > #scheduleDashboard { display: none !important; }
      body.sb-tools-mode #workspacePage { display: block !important; overflow: auto !important; min-height: 100vh; }
      .sb-tools-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 18px;
        border-bottom: 1px solid #d8e1ec;
      }
      .sb-tools-header .eyebrow { color: #08734f; font-weight: 900; text-transform: uppercase; font-size: 12px; margin: 0 0 3px; }
      .sb-tools-header h2 { margin: 0; font-size: 30px; color: #061b3b; }
      .sb-tools-header p { margin: 4px 0 0; color: #4c5f7d; }
      .sb-tools-card {
        border: 1px solid #d6e0ed;
        border-radius: 8px;
        background: rgba(255,255,255,0.92);
        box-shadow: 0 12px 28px rgba(15, 35, 60, 0.06);
      }
      .sb-tools-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 16px; margin: 18px 0 16px; }
      .sb-tools-tab {
        min-height: 74px;
        border: 1px solid #d6e0ed;
        border-radius: 8px;
        background: #fff;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        cursor: pointer;
        text-align: left;
        font: inherit;
      }
      .sb-tools-tab.active { border-color: #2f8a6c; box-shadow: inset 3px 0 0 #2f8a6c; }
      .sb-tools-workspace { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr); gap: 16px; }
      .sb-tools-panel { padding: 18px; min-height: 520px; }
      .sb-tools-panel h3 { margin: 0 0 8px; font-size: 22px; color: #061b3b; }
      .sb-tools-panel label { display: block; font-weight: 900; color: #17345f; margin: 14px 0 8px; }
      .sb-tools-input,
      .sb-tools-textarea,
      .sb-tools-ai-input {
        width: 100%;
        border: 1px solid #cfd9e8;
        border-radius: 8px;
        background: #fff;
        color: #061b3b;
        font: inherit;
        padding: 12px 14px;
        box-sizing: border-box;
      }
      .sb-tools-textarea { min-height: 360px; resize: vertical; line-height: 1.65; }
      .sb-tools-ai-input { min-height: 170px; resize: vertical; line-height: 1.55; }
      .sb-tools-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
      .sb-tools-button {
        border: 1px solid #cfd9e8;
        border-radius: 8px;
        background: #fff;
        color: #0b2a55;
        min-height: 40px;
        padding: 0 14px;
        font-weight: 900;
        cursor: pointer;
      }
      .sb-tools-button.primary { background: linear-gradient(135deg, #214568, #2f8a6c); color: #fff; border-color: transparent; }
      .sb-tools-button:hover { transform: translateY(-1px); }
      .sb-tools-status { color: #60708a; font-size: 13px; margin-left: auto; }
      .sb-sheet-wrap { overflow: auto; border: 1px solid #d6e0ed; border-radius: 8px; background: #fff; }
      .sb-sheet-table { width: 100%; border-collapse: collapse; min-width: 620px; }
      .sb-sheet-table th,
      .sb-sheet-table td { border: 1px solid #d6e0ed; min-width: 120px; height: 42px; padding: 8px; vertical-align: top; }
      .sb-sheet-table th { background: #f2f6fb; color: #17345f; font-size: 12px; }
      .sb-sheet-cell { min-height: 24px; outline: none; white-space: pre-wrap; }
      .sb-slide-layout { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 14px; }
      .sb-slide-list { display: grid; gap: 8px; align-content: start; }
      .sb-slide-thumb {
        border: 1px solid #d6e0ed;
        border-radius: 8px;
        background: #fff;
        padding: 10px;
        min-height: 70px;
        cursor: pointer;
        text-align: left;
      }
      .sb-slide-thumb.active { border-color: #2f8a6c; box-shadow: inset 3px 0 0 #2f8a6c; }
      .sb-tools-ai-output {
        min-height: 265px;
        border: 1px solid #d6e0ed;
        border-radius: 8px;
        background: #f8fbff;
        padding: 14px;
        margin-top: 14px;
        white-space: pre-wrap;
        line-height: 1.65;
        color: #10284d;
        overflow: auto;
      }
      @media (max-width: 980px) {
        #studybridgeToolsPage { padding: 18px 14px 34px; }
        .sb-tools-tabs,
        .sb-tools-workspace { grid-template-columns: 1fr; }
        .sb-slide-layout { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  const toolMeta = {
    docs: { icon: "D", title: "SB Docs", subtitle: "像文档一样自己写 essay、report、reading response", button: "让 AI 帮我改进文档" },
    sheets: { icon: "S", title: "SB Sheets", subtitle: "自己做表格、计划表、对比表", button: "让 AI 帮我优化表格" },
    slides: { icon: "P", title: "SB Slides", subtitle: "自己做 PPT 大纲、页面和讲稿", button: "让 AI 帮我优化 Slides" }
  };

  function ensureToolsNav() {
    if ($("#studybridgeToolsNav")) return;
    const roleSwitch = $("#roleSwitch");
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    const nav = document.createElement("button");
    nav.id = "studybridgeToolsNav";
    nav.type = "button";
    nav.innerHTML = `
      <span class="sb-tool-icon">工</span>
      <span class="sb-tool-nav-text"><strong>工具</strong><span>SB Docs、Sheets、Slides</span></span>
    `;
    if (roleSwitch?.parentNode) roleSwitch.parentNode.insertBefore(nav, roleSwitch);
    else sidebar.appendChild(nav);
  }

  function ensureToolsPage() {
    const workspace = $("#workspacePage");
    if (!workspace) return null;
    let page = $("#studybridgeToolsPage", workspace);
    if (!page) {
      page = document.createElement("section");
      page.id = "studybridgeToolsPage";
      workspace.appendChild(page);
    }
    return page;
  }

  function openTools(tool = state.active || "docs") {
    state.active = toolMeta[tool] ? tool : "docs";
    saveState();
    injectStyles();
    ensureToolsNav();
    const page = ensureToolsPage();
    if (!page) return;
    document.body.classList.add("sb-tools-mode");
    document.body.classList.add("studybridge-secondary-page");
    document.body.dataset.studybridgeActivePage = "tools";
    $$("#studybridgeToolsNav").forEach((node) => node.classList.add("active"));
    renderToolsPage();
    setTimeout(() => page.scrollIntoView({ block: "start" }), 0);
  }

  function closeTools() {
    document.body.classList.remove("sb-tools-mode");
    if (document.body.dataset.studybridgeActivePage === "tools") {
      document.body.dataset.studybridgeActivePage = "workspacePage";
    }
    $$("#studybridgeToolsNav").forEach((node) => node.classList.remove("active"));
    const studyNav = $("[data-study-page='study'], #studybridgeStudyNav, [data-direct-page='study']");
    if (studyNav && typeof studyNav.click === "function") studyNav.click();
  }

  function renderToolsPage() {
    const page = ensureToolsPage();
    if (!page) return;
    const active = state.active || "docs";
    page.innerHTML = `
      <header class="sb-tools-header">
        <div>
          <p class="eyebrow">Study Tools</p>
          <h2>工具</h2>
          <p>左边可以自己写、自己做；右边的 AI 只是辅助，不会替代你的手动编辑。</p>
        </div>
        <button class="sb-tools-button" type="button" data-tools-close>返回学习区</button>
      </header>
      <section class="sb-tools-card sb-tools-tabs" aria-label="StudyBridge tools">
        ${Object.entries(toolMeta).map(([key, meta]) => `
          <button class="sb-tools-tab ${active === key ? "active" : ""}" type="button" data-tool-tab="${key}">
            <span class="sb-tool-icon">${esc(meta.icon)}</span>
            <span><strong>${esc(meta.title)}</strong><span>${esc(meta.subtitle)}</span></span>
          </button>
        `).join("")}
      </section>
      <section class="sb-tools-workspace">
        <div class="sb-tools-card sb-tools-panel" id="sbToolsEditor"></div>
        <aside class="sb-tools-card sb-tools-panel" id="sbToolsAiPanel"></aside>
      </section>
    `;
    renderEditor();
    renderAiPanel();
  }

  function renderEditor() {
    const editor = $("#sbToolsEditor");
    if (!editor) return;
    if (state.active === "sheets") return renderSheets(editor);
    if (state.active === "slides") return renderSlides(editor);
    return renderDocs(editor);
  }

  function renderDocs(editor) {
    editor.innerHTML = `
      <h3>SB Docs</h3>
      <p>这里可以像文档一样先自己写。需要 AI 的时候，再用右边的辅助栏。</p>
      <label for="sbDocTitle">文档标题</label>
      <input class="sb-tools-input" id="sbDocTitle" value="${esc(state.docs.title)}" placeholder="例如 ECO364 Essay Draft" />
      <label for="sbDocBody">正文</label>
      <textarea class="sb-tools-textarea" id="sbDocBody" placeholder="在这里直接写 essay、outline、reading response 或草稿...">${esc(state.docs.body)}</textarea>
      <div class="sb-tools-actions">
        <button class="sb-tools-button primary" type="button" data-tools-save>保存草稿</button>
        <button class="sb-tools-button" type="button" data-tools-copy-doc>复制正文</button>
        <button class="sb-tools-button" type="button" data-tools-clear-doc>清空</button>
        <span class="sb-tools-status" id="sbToolsSaveStatus">Saved</span>
      </div>
    `;
  }

  function renderSheets(editor) {
    const rows = Array.isArray(state.sheets.rows) && state.sheets.rows.length ? state.sheets.rows : defaultState().sheets.rows;
    state.sheets.rows = rows;
    const colCount = Math.max(...rows.map((row) => row.length), 5);
    rows.forEach((row) => { while (row.length < colCount) row.push(""); });
    editor.innerHTML = `
      <h3>SB Sheets</h3>
      <p>这里可以手动做表格。第一行建议当作表头，用来做 deadline、复习计划、对比表。</p>
      <div class="sb-sheet-wrap">
        <table class="sb-sheet-table">
          <thead><tr>${Array.from({ length: colCount }, (_, i) => `<th>${String.fromCharCode(65 + i)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map((row, r) => `<tr>${row.map((cell, c) => `<td><div class="sb-sheet-cell" contenteditable="true" data-sheet-row="${r}" data-sheet-col="${c}">${esc(cell)}</div></td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="sb-tools-actions">
        <button class="sb-tools-button primary" type="button" data-tools-save>保存表格</button>
        <button class="sb-tools-button" type="button" data-sheet-row-add>加一行</button>
        <button class="sb-tools-button" type="button" data-sheet-col-add>加一列</button>
        <button class="sb-tools-button" type="button" data-sheet-copy>复制 CSV</button>
        <button class="sb-tools-button" type="button" data-sheet-clear>清空</button>
        <span class="sb-tools-status" id="sbToolsSaveStatus">Saved</span>
      </div>
    `;
  }

  function currentSlide() {
    if (!state.slides.items?.length) state.slides.items = defaultState().slides.items;
    state.slides.activeIndex = Math.min(Math.max(Number(state.slides.activeIndex) || 0, 0), state.slides.items.length - 1);
    return state.slides.items[state.slides.activeIndex];
  }

  function renderSlides(editor) {
    const slide = currentSlide();
    editor.innerHTML = `
      <h3>SB Slides</h3>
      <p>左边选择页面，右边手动写标题、要点和讲稿。AI 可以帮你整理结构。</p>
      <div class="sb-slide-layout">
        <div class="sb-slide-list">
          ${state.slides.items.map((item, index) => `
            <button class="sb-slide-thumb ${index === state.slides.activeIndex ? "active" : ""}" type="button" data-slide-index="${index}">
              <strong>Slide ${index + 1}</strong><br />${esc(item.title || "Untitled")}
            </button>
          `).join("")}
          <button class="sb-tools-button" type="button" data-slide-add>+ 新增 Slide</button>
        </div>
        <div>
          <label for="sbSlideTitle">Slide 标题</label>
          <input class="sb-tools-input" id="sbSlideTitle" value="${esc(slide.title)}" />
          <label for="sbSlideBullets">页面要点</label>
          <textarea class="sb-tools-textarea" id="sbSlideBullets" style="min-height:180px" placeholder="每行一个 bullet point">${esc(slide.bullets)}</textarea>
          <label for="sbSlideNotes">演讲稿 / Speaker notes</label>
          <textarea class="sb-tools-textarea" id="sbSlideNotes" style="min-height:130px" placeholder="这里写你演讲时要说的话">${esc(slide.notes)}</textarea>
        </div>
      </div>
      <div class="sb-tools-actions">
        <button class="sb-tools-button primary" type="button" data-tools-save>保存 Slides</button>
        <button class="sb-tools-button" type="button" data-slide-copy>复制大纲</button>
        <button class="sb-tools-button" type="button" data-slide-delete>删除当前页</button>
        <span class="sb-tools-status" id="sbToolsSaveStatus">Saved</span>
      </div>
    `;
  }

  function renderAiPanel() {
    const panel = $("#sbToolsAiPanel");
    if (!panel) return;
    const meta = toolMeta[state.active] || toolMeta.docs;
    panel.innerHTML = `
      <p class="eyebrow">AI Assistant</p>
      <h3>${esc(meta.title)} AI 辅助</h3>
      <p>你可以先在左边自己写，再让 AI 帮你改结构、补思路、检查逻辑或整理格式。</p>
      <label for="sbToolsAiRequest">你想让 AI 帮什么？</label>
      <textarea class="sb-tools-ai-input" id="sbToolsAiRequest" placeholder="例如：帮我把左边草稿改成更清楚的 thesis + outline，保留英文关键词，用中文解释逻辑。"></textarea>
      <div class="sb-tools-actions">
        <button class="sb-tools-button primary" type="button" data-tools-ai-run>${esc(meta.button)}</button>
        <button class="sb-tools-button" type="button" data-tools-copy-ai>复制 AI 建议</button>
      </div>
      <div class="sb-tools-ai-output" id="sbToolsAiOutput">${esc(state.aiOutput)}</div>
    `;
  }

  function captureCurrentEditor() {
    if (state.active === "docs") {
      state.docs.title = $("#sbDocTitle")?.value || state.docs.title || "Untitled essay";
      state.docs.body = $("#sbDocBody")?.value || "";
    } else if (state.active === "sheets") {
      $$("[data-sheet-row]").forEach((cell) => {
        const r = Number(cell.dataset.sheetRow);
        const c = Number(cell.dataset.sheetCol);
        if (!state.sheets.rows[r]) state.sheets.rows[r] = [];
        state.sheets.rows[r][c] = cell.textContent.trim();
      });
    } else if (state.active === "slides") {
      const slide = currentSlide();
      slide.title = $("#sbSlideTitle")?.value || "";
      slide.bullets = $("#sbSlideBullets")?.value || "";
      slide.notes = $("#sbSlideNotes")?.value || "";
    }
    const label = $("#sbToolsSaveStatus");
    if (label) label.textContent = "Saving...";
    saveState();
  }

  function csvFromRows(rows) {
    return rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  function slidesOutline() {
    return state.slides.items.map((slide, index) => [
      `Slide ${index + 1}: ${slide.title || "Untitled"}`,
      slide.bullets ? slide.bullets.split("\n").map((line) => `- ${line}`).join("\n") : "- ",
      slide.notes ? `Notes: ${slide.notes}` : ""
    ].filter(Boolean).join("\n")).join("\n\n");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text || "");
      state.aiOutput = "已复制。";
    } catch {
      state.aiOutput = "复制失败，可以手动选中文字复制。";
    }
    renderAiPanel();
  }

  function buildContext() {
    captureCurrentEditor();
    if (state.active === "docs") return `Tool: SB Docs\nTitle: ${state.docs.title}\nDocument:\n${state.docs.body || "(empty)"}`;
    if (state.active === "sheets") return `Tool: SB Sheets\nTable CSV:\n${csvFromRows(state.sheets.rows)}`;
    return `Tool: SB Slides\nOutline:\n${slidesOutline()}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  }

  async function ensureToolsCourse() {
    const coursesData = await api("/api/courses");
    const courses = Array.isArray(coursesData.courses) ? coursesData.courses : Array.isArray(coursesData) ? coursesData : [];
    let course = courses.find((item) => /studybridge tools/i.test(item.name || item.title || ""));
    if (course) return course;
    const created = await api("/api/courses", {
      method: "POST",
      body: JSON.stringify({ name: "StudyBridge Tools", term: "Tools workspace" })
    });
    return created.course || created;
  }

  async function runAi() {
    const output = $("#sbToolsAiOutput");
    const request = $("#sbToolsAiRequest")?.value.trim() || "请根据左边内容给我改进建议，并保留我可以继续手动修改的结构。";
    if (output) output.textContent = "AI 正在看你的内容...";
    try {
      const course = await ensureToolsCourse();
      const prompt = [
        "你是 StudyBridge 的学习工具助手。学生正在使用 Docs/Sheets/Slides 手动制作内容。",
        "你的任务是辅助，而不是替学生完全覆盖内容。请给出可直接复制、可继续修改的建议。",
        "如果是 Docs，重点帮助 thesis、结构、段落逻辑、引用提醒。",
        "如果是 Sheets，重点帮助表头、分类、公式、优先级、计划结构。",
        "如果是 Slides，重点帮助页面顺序、bullet points、speaker notes 和 presentation flow。",
        "请用中文解释，关键 academic terms 可以保留英文。",
        "",
        `学生要求：${request}`,
        "",
        buildContext()
      ].join("\n");
      const data = await api(`/api/courses/${encodeURIComponent(course.id)}/chat`, {
        method: "POST",
        body: JSON.stringify({ mode: "assignment", message: prompt })
      });
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const assistant = [...messages].reverse().find((item) => item.role === "assistant");
      state.aiOutput = assistant?.content || data.reply || data.message || "AI 已完成，但没有返回可显示内容。";
    } catch (error) {
      state.aiOutput = `AI 暂时没有成功调用：${error.message}\n\n你仍然可以继续使用左边的手动编辑功能。`;
    }
    saveState();
    renderAiPanel();
  }

  function handleToolsClick(event) {
    const nav = event.target.closest("#studybridgeToolsNav");
    if (nav) {
      event.preventDefault();
      openTools();
      return;
    }
    const close = event.target.closest("[data-tools-close]");
    if (close) {
      event.preventDefault();
      closeTools();
      return;
    }
    const tab = event.target.closest("[data-tool-tab]");
    if (tab) {
      event.preventDefault();
      captureCurrentEditor();
      state.active = tab.dataset.toolTab;
      saveState();
      renderToolsPage();
      return;
    }
    if (event.target.closest("[data-tools-save]")) {
      event.preventDefault();
      captureCurrentEditor();
      return;
    }
    if (event.target.closest("[data-tools-copy-doc]")) return copyText($("#sbDocBody")?.value || "");
    if (event.target.closest("[data-tools-clear-doc]")) {
      state.docs.body = "";
      saveState();
      renderToolsPage();
      return;
    }
    if (event.target.closest("[data-sheet-row-add]")) {
      const cols = Math.max(...state.sheets.rows.map((row) => row.length), 5);
      state.sheets.rows.push(Array.from({ length: cols }, () => ""));
      saveState();
      renderToolsPage();
      return;
    }
    if (event.target.closest("[data-sheet-col-add]")) {
      state.sheets.rows.forEach((row) => row.push(""));
      saveState();
      renderToolsPage();
      return;
    }
    if (event.target.closest("[data-sheet-copy]")) return copyText(csvFromRows(state.sheets.rows));
    if (event.target.closest("[data-sheet-clear]")) {
      state.sheets.rows = defaultState().sheets.rows;
      saveState();
      renderToolsPage();
      return;
    }
    const slideButton = event.target.closest("[data-slide-index]");
    if (slideButton) {
      captureCurrentEditor();
      state.slides.activeIndex = Number(slideButton.dataset.slideIndex) || 0;
      saveState();
      renderToolsPage();
      return;
    }
    if (event.target.closest("[data-slide-add]")) {
      captureCurrentEditor();
      state.slides.items.push({ title: `Slide ${state.slides.items.length + 1}`, bullets: "", notes: "" });
      state.slides.activeIndex = state.slides.items.length - 1;
      saveState();
      renderToolsPage();
      return;
    }
    if (event.target.closest("[data-slide-delete]")) {
      if (state.slides.items.length > 1) state.slides.items.splice(state.slides.activeIndex, 1);
      state.slides.activeIndex = Math.max(0, state.slides.activeIndex - 1);
      saveState();
      renderToolsPage();
      return;
    }
    if (event.target.closest("[data-slide-copy]")) return copyText(slidesOutline());
    if (event.target.closest("[data-tools-copy-ai]")) return copyText(state.aiOutput || "");
    if (event.target.closest("[data-tools-ai-run]")) {
      event.preventDefault();
      runAi();
    }
  }

  function handleInput(event) {
    if (!event.target.closest("#studybridgeToolsPage")) return;
    captureCurrentEditor();
  }

  function boot() {
    injectStyles();
    ensureToolsNav();
    document.addEventListener("click", handleToolsClick, true);
    document.addEventListener("input", handleInput, true);
    const observer = new MutationObserver(() => ensureToolsNav());
    observer.observe(document.body, { childList: true, subtree: true });
    window.studybridgeOpenTools = openTools;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
