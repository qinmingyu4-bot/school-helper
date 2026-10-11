(() => {
  const PROMPT_ID = "studybridge-cheatsheet-quick-prompt";
  const PLACEHOLDER =
    "告诉我考试允许的纸张大小、页数、单面/双面，以及要覆盖的章节；我会帮你压缩成高密度 Cheatsheet。";
  const PROMPT =
    "帮我制作考试 Cheatsheet。规则：纸张大小/页数/正反面/是否可打印还不确定，请先按 Letter/A4 一页单面做草稿；根据课程资料优先放公式、定义、解题步骤、易错点和最有用的小例子，并告诉我如果空间不够应该删什么。";
  const CHEATSHEET_INSTRUCTION = `

[StudyBridge Cheatsheet mode]
请把这次回答当作“考试允许带入的有限版面 cheatsheet / formula sheet”，不是普通总结。
目标：在有限纸张大小、页数、正反面要求下，放入最多、最有用、最能帮助考试的信息。
请先识别或说明假设：
- paper size: A4 / Letter / index card
- pages: 1 page / multiple pages
- sides: front only / front and back
- typed or handwritten
- covered units / chapters / exam scope

如果用户没有提供限制，请默认使用：Letter/A4、1 page、单面、typed、紧凑但可读，并提醒用户可以补充真实考试规则。

生成规则：
- 优先放高频公式、变量含义、定义、decision rules、problem-solving templates、常见陷阱、易混概念。
- 每类题最多放一个最短 useful example，只在它能避免错误时放。
- 删除背景介绍、长段解释、重复内容、考试中容易临场推出来的东西。
- 结构必须便于考试中快速查找：短标题、分区、缩写、表格化、公式旁边标注 when to use。
- 明确给出 Must include / Include if space / Cut if crowded。

输出格式：
1. Sheet rules / assumptions
2. Priority map
3. Draft cheatsheet content，按 Side A / Side B 或 columns/blocks 分区
4. Layout plan：建议版面顺序、密度、字体/手写策略、空间不够先删什么
5. Exam-use tips：哪些放纸上，哪些应该背下来

用中文解释，保留必要 English academic terms、公式和 symbols。`;

  function ensureCheatsheetQuickPrompt() {
    const quickPrompts = document.querySelector("#quickPrompts");
    if (!quickPrompts || document.querySelector(`#${PROMPT_ID}`)) return;
    const button = document.createElement("button");
    button.id = PROMPT_ID;
    button.type = "button";
    button.dataset.quickPrompt = PROMPT;
    button.textContent = "制作 Cheatsheet";
    button.addEventListener("click", () => {
      const input = document.querySelector("#messageInput");
      const modeSelect = document.querySelector("#modeSelect");
      if (modeSelect) modeSelect.value = "cheatsheet";
      if (input) {
        input.value = PROMPT;
        input.focus();
      }
    });
    quickPrompts.appendChild(button);
  }

  function ensureCheatsheetModeOption() {
    const modeSelect = document.querySelector("#modeSelect");
    if (!modeSelect) return;
    const hasOption = Array.from(modeSelect.options || []).some((option) => option.value === "cheatsheet");
    if (hasOption) return;
    const option = document.createElement("option");
    option.value = "cheatsheet";
    option.textContent = "Cheatsheet";
    modeSelect.appendChild(option);
  }

  function syncCheatsheetPlaceholder() {
    const modeSelect = document.querySelector("#modeSelect");
    const input = document.querySelector("#messageInput");
    if (!modeSelect || !input) return;
    if (!input.dataset.defaultPlaceholder) input.dataset.defaultPlaceholder = input.placeholder || "";
    input.placeholder = modeSelect.value === "cheatsheet" ? PLACEHOLDER : input.dataset.defaultPlaceholder;
  }

  function isCheatsheetPayload(payload) {
    const mode = String(payload?.mode || "").toLowerCase();
    const message = String(payload?.message || "").toLowerCase();
    return (
      mode === "cheatsheet" ||
      /cheat\s*sheet|cheatsheet|formula\s*sheet|study\s*sheet|one[- ]page|one page|double[- ]sided|front\s*and\s*back|小抄|公式纸|公式表|考试纸|一页纸|正反面|双面|开卷纸|复习纸/.test(message)
    );
  }

  function installFetchPatch() {
    if (window.__studybridgeCheatsheetFetchPatch) return;
    window.__studybridgeCheatsheetFetchPatch = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (!String(url).includes("/api/courses/") || !String(url).includes("/chat") || !init?.body) {
        return originalFetch(input, init);
      }
      try {
        const payload = JSON.parse(init.body);
        if (isCheatsheetPayload(payload) && !String(payload.message || "").includes("[StudyBridge Cheatsheet mode]")) {
          payload.message = `${payload.message}\n${CHEATSHEET_INSTRUCTION}`;
          init = { ...init, body: JSON.stringify(payload) };
        }
      } catch {
        return originalFetch(input, init);
      }
      return originalFetch(input, init);
    };
  }

  function boot() {
    ensureCheatsheetModeOption();
    ensureCheatsheetQuickPrompt();
    syncCheatsheetPlaceholder();
    installFetchPatch();
    const modeSelect = document.querySelector("#modeSelect");
    if (modeSelect && modeSelect.dataset.cheatsheetPatch !== "1") {
      modeSelect.dataset.cheatsheetPatch = "1";
      modeSelect.addEventListener("change", syncCheatsheetPlaceholder);
    }
  }

  boot();
  setInterval(boot, 1200);
})();
