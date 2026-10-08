(() => {
  const VERSION = "20261008-tools-1.0.86";
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

  const tools = {
    docs: {
      icon: "D",
      title: "SB Docs",
      subtitle: "写 essay、report 和 reading response",
      placeholder: "例如：我要写一篇 ECO364 essay，主题是 monetary policy，要求 1200 words，需要 thesis 和结构。",
      button: "生成 Essay 草稿",
      make(input) {
        const text = input.trim() || "这次作业的要求还没有填写。";
        return [
          "SB Docs - Essay Builder",
          "",
          "1. 题目理解",
          `- 你提供的要求：${text}`,
          "- 先确认 course、word count、citation style、deadline 和 rubric。",
          "",
          "2. 可用 thesis 模板",
          "- This essay argues that [main claim] because [reason 1], [reason 2], and [reason 3].",
          "",
          "3. 推荐结构",
          "- Introduction: 背景 + research question + thesis。",
          "- Body 1: 定义关键概念，并解释为什么重要。",
          "- Body 2: 放最强证据，连接 lecture notes / readings。",
          "- Body 3: 处理 counterargument，再回到你的主论点。",
          "- Conclusion: 总结贡献，不要加入全新论点。",
          "",
          "4. 考前/交稿前检查",
          "- 每段第一句是否清楚？",
          "- 每个 claim 是否有 evidence？",
          "- citation 是否统一？",
          "- 是否直接回答了题目？"
        ].join("\n");
      }
    },
    sheets: {
      icon: "S",
      title: "SB Sheets",
      subtitle: "做表格、对比表、计划表",
      placeholder: "例如：帮我做一个 final 复习计划表，包含课程、任务、due、优先级、预计耗时。",
      button: "生成表格模板",
      make(input) {
        const text = input.trim() || "StudyBridge 学习计划";
        return [
          "SB Sheets - Table Builder",
          "",
          `用途：${text}`,
          "",
          "| Category | Item | Due / Time | Priority | Status | Notes |",
          "|---|---|---|---|---|---|",
          "| Course | Course name | Date/time | High/Med/Low | Not started | What to prepare |",
          "| Assignment | Task name | Date/time | High | In progress | Rubric / submission place |",
          "| Exam | Topic | Date/time | High | Not started | Weak chapters |",
          "| Reading | Reading name | Date/time | Medium | Not started | Key pages |",
          "",
          "建议：先按 due date 排序，再用 priority 标出最容易影响成绩的任务。"
        ].join("\n");
      }
    },
    slides: {
      icon: "P",
      title: "SB Slides",
      subtitle: "做 PPT 大纲和 presentation 讲稿",
      placeholder: "例如：我要做一个 8 分钟 presentation，主题是 AI in education，需要 6 页 PPT。",
      button: "生成 PPT 大纲",
      make(input) {
        const text = input.trim() || "presentation 主题待填写";
        return [
          "SB Slides - Presentation Planner",
          "",
          `主题/要求：${text}`,
          "",
          "Slide 1 - Title",
          "- 标题、姓名、课程、日期。",
          "",
          "Slide 2 - Why it matters",
          "- 用一个真实问题或数据开场。",
          "",
          "Slide 3 - Key concept",
          "- 解释核心概念，避免堆太多字。",
          "",
          "Slide 4 - Evidence / example",
          "- 放最有说服力的案例、图表或引用。",
          "",
          "Slide 5 - Analysis",
          "- 说明这个例子如何支持你的观点。",
          "",
          "Slide 6 - Takeaway",
          "- 3 个 bullet 总结，最后放 Q&A。",
          "",
          "讲稿提示：每页控制 45-75 秒，PPT 上只放关键词，细节放口头讲。"
        ].join("\n");
      }
    }
  };

  let activeTool = "docs";

  function installStyle() {
    if ($("#studybridgeToolsHubStyle")) return;
    const style = document.createElement("style");
    style.id = "studybridgeToolsHubStyle";
    style.textContent = `
      .sb-tools-nav { display:grid; gap:10px; margin:10px 0 14px; }
      .sb-tools-card { width:100%; min-height:54px; display:grid; grid-template-columns:36px minmax(0,1fr); align-items:center; gap:10px; padding:9px 12px; border:1px solid #d7e0ec; border-radius:8px; background:#fff; color:#0b2344; text-align:left; font:inherit; cursor:pointer; }
      .sb-tools-card:hover,.sb-tools-card.is-active { border-color:#2f7d62; background:#fbfffd; }
      .sb-tools-card strong { display:block; line-height:1.15; }
      .sb-tools-card small { display:block; margin-top:2px; color:#52617a; line-height:1.25; }
      .sb-tools-icon { width:36px; height:36px; display:grid; place-items:center; border-radius:8px; color:#fff; background:linear-gradient(135deg,#1f3a5f,#2f7d62); font-weight:900; }
      body.sb-creator-sidebar #sbToolsHubNav { display:none !important; }
      .sb-tool-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
      .sb-tool-card { display:grid; grid-template-columns:44px minmax(0,1fr); gap:12px; align-items:center; padding:14px; border:1px solid #d7e0ec; border-radius:8px; background:#fff; color:#0b2344; text-align:left; cursor:pointer; }
      .sb-tool-card:hover,.sb-tool-card.active { border-color:#2f7d62; box-shadow:inset 3px 0 0 #2f7d62; }
      .sb-tool-card-icon { width:44px; height:44px; display:grid; place-items:center; border-radius:8px; color:#fff; font-weight:900; background:linear-gradient(135deg,#1f3a5f,#2f7d62); }
      .sb-tool-card h3 { margin:0 0 4px; font-size:17px; }
      .sb-tool-card p { margin:0; color:#52617a; font-size:13px; line-height:1.35; }
      .sb-tool-workspace { display:grid; grid-template-columns:minmax(280px,.9fr) minmax(320px,1.1fr); gap:14px; }
      .sb-tool-textarea { width:100%; min-height:260px; border:1px solid #d7e0ec; border-radius:8px; padding:12px; font:inherit; line-height:1.55; color:#0b2344; background:#fff; resize:vertical; }
      .sb-tool-output { min-height:360px; white-space:pre-wrap; line-height:1.6; }
      @media (max-width:900px) { .sb-tool-workspace { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }

  function clearActiveNav() {
    $$('[data-sb-route], #sbToolsHubNav .sb-tools-card').forEach((node) => node.classList.remove("is-active"));
  }

  function ensureNav() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    $$("#sbToolsHubNav", sidebar).forEach((nav, index) => { if (index > 0) nav.remove(); });
    let nav = $("#sbToolsHubNav", sidebar);
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "sbToolsHubNav";
      nav.className = "sb-tools-nav";
      nav.innerHTML = `<button class="sb-tools-card" type="button" data-sb-tools-hub="true"><span class="sb-tools-icon">工</span><span><strong>工具</strong><small>SB Docs、Sheets、Slides</small></span></button>`;
    }
    const directNav = $("#sbDirectNav", sidebar);
    const roleSwitch = $("#roleSwitch", sidebar);
    if (directNav && directNav.nextSibling !== nav) directNav.insertAdjacentElement("afterend", nav);
    else if (!directNav && roleSwitch && roleSwitch.previousSibling !== nav) sidebar.insertBefore(nav, roleSwitch);
    else if (!directNav && !roleSwitch && !nav.parentElement) sidebar.appendChild(nav);
  }

  function ensureDirectPage() {
    const root = $("#workspacePage");
    if (!root) return null;
    let page = $("#sbDirectPage", root);
    if (!page) {
      page = document.createElement("section");
      page.id = "sbDirectPage";
      root.appendChild(page);
    }
    return page;
  }

  function showDirectPage(html) {
    const root = $("#workspacePage");
    const page = ensureDirectPage();
    if (!root || !page) return null;
    Array.from(root.children).forEach((child) => {
      if (child.id !== "sbDirectPage") child.style.display = "none";
    });
    document.body.classList.add("sb-direct-mode");
    document.body.classList.remove("sb-study-mode", "sb-creator-sidebar");
    page.hidden = false;
    page.innerHTML = html;
    root.scrollTop = 0;
    clearActiveNav();
    $("#sbToolsHubNav .sb-tools-card")?.classList.add("is-active");
    localStorage.setItem("studybridgeLastRoute", "tools");
    const status = $("#statusLine");
    if (status) status.textContent = "Tools opened.";
    return page;
  }

  function toolCards() {
    return Object.entries(tools).map(([key, tool]) => `
      <button class="sb-tool-card ${key === activeTool ? "active" : ""}" type="button" data-tool-key="${esc(key)}">
        <span class="sb-tool-card-icon">${esc(tool.icon)}</span>
        <span><h3>${esc(tool.title)}</h3><p>${esc(tool.subtitle)}</p></span>
      </button>
    `).join("");
  }

  function renderEditor(page) {
    const tool = tools[activeTool] || tools.docs;
    const mount = $("#sbToolEditor", page);
    if (!mount) return;
    mount.innerHTML = `
      <article class="sb-card">
        <h3 style="margin-top:0">${esc(tool.title)}</h3>
        <p class="sb-muted">把要求、资料或你想完成的任务写在下面。</p>
        <textarea class="sb-tool-textarea" id="sbToolInput" placeholder="${esc(tool.placeholder)}"></textarea>
        <div class="sb-row" style="margin-top:10px">
          <button class="sb-btn primary" type="button" id="sbToolGenerate">${esc(tool.button)}</button>
          <button class="sb-btn" type="button" id="sbToolClear">清空</button>
        </div>
      </article>
      <article class="sb-card">
        <div class="sb-row" style="justify-content:space-between;margin-bottom:10px">
          <div><p class="sb-muted" style="margin:0;font-weight:900">OUTPUT</p><h3 style="margin:0">生成结果</h3></div>
          <button class="sb-btn" type="button" id="sbToolCopy">复制</button>
        </div>
        <pre class="sb-tool-output" id="sbToolOutput">选择一个工具，然后输入要求。这里会生成可以继续修改的初稿。</pre>
      </article>
    `;
  }

  function renderToolsPage() {
    const page = showDirectPage(`
      <header class="sb-page-head">
        <div>
          <p>STUDY TOOLS</p>
          <h2>工具</h2>
          <span class="sb-muted">写 essay、做表格、做 PPT 的工具都放这里。</span>
        </div>
        <button class="sb-btn" type="button" data-sb-tools-return>返回学习区</button>
      </header>
      <div class="sb-body">
        <section class="sb-card">
          <div class="sb-tool-cards" id="sbToolCards">${toolCards()}</div>
        </section>
        <section class="sb-tool-workspace" id="sbToolEditor"></section>
      </div>
    `);
    if (!page) return;
    renderEditor(page);
  }

  function openStudy() {
    if (typeof window.studybridgeDirectOpen === "function") {
      window.studybridgeDirectOpen("study");
      return;
    }
    const page = $("#sbDirectPage");
    const root = $("#workspacePage");
    if (page) { page.hidden = true; page.innerHTML = ""; }
    if (root) Array.from(root.children).forEach((child) => { if (child.id !== "sbDirectPage") child.style.display = ""; });
    document.body.classList.remove("sb-direct-mode");
    document.body.classList.add("sb-study-mode");
    localStorage.setItem("studybridgeLastRoute", "study");
  }

  function installEvents() {
    document.addEventListener("click", async (event) => {
      const toolsButton = event.target.closest?.("[data-sb-tools-hub]");
      if (toolsButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        renderToolsPage();
        return;
      }

      const back = event.target.closest?.("[data-sb-tools-return]");
      if (back) {
        event.preventDefault();
        openStudy();
        return;
      }

      const toolButton = event.target.closest?.("[data-tool-key]");
      if (toolButton) {
        activeTool = toolButton.dataset.toolKey || "docs";
        const page = $("#sbDirectPage");
        if (page) {
          $("#sbToolCards", page).innerHTML = toolCards();
          renderEditor(page);
        }
        return;
      }

      const generate = event.target.closest?.("#sbToolGenerate");
      if (generate) {
        const tool = tools[activeTool] || tools.docs;
        const input = $("#sbToolInput")?.value || "";
        const output = $("#sbToolOutput");
        if (output) output.textContent = tool.make(input);
        return;
      }

      const clear = event.target.closest?.("#sbToolClear");
      if (clear) {
        const input = $("#sbToolInput");
        const output = $("#sbToolOutput");
        if (input) input.value = "";
        if (output) output.textContent = "选择一个工具，然后输入要求。这里会生成可以继续修改的初稿。";
        return;
      }

      const copy = event.target.closest?.("#sbToolCopy");
      if (copy) {
        const text = $("#sbToolOutput")?.textContent || "";
        try {
          await navigator.clipboard?.writeText(text);
          copy.textContent = "已复制";
          setTimeout(() => { copy.textContent = "复制"; }, 1200);
        } catch {
          copy.textContent = "复制失败";
          setTimeout(() => { copy.textContent = "复制"; }, 1200);
        }
      }
    }, true);
  }

  function init() {
    installStyle();
    ensureNav();
    installEvents();
    new MutationObserver(() => ensureNav()).observe(document.body, { childList: true, subtree: true });
    window.studybridgeOpenTools = renderToolsPage;
    window.studybridgeToolsHubSelfTest = () => ({ version: VERSION, navReady: Boolean($("#sbToolsHubNav")), tools: Object.keys(tools) });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();