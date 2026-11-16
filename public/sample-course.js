(function () {
  "use strict";

  const { materials, questions, quiz } = window.StudyBridgeSampleContent;
  const ui = window.StudyBridgeI18n;
  const root = document.querySelector("#root");
  const source = document.querySelector("#sample-source");
  const learning = document.querySelector("#sample-learning");
  const composer = window.StudyBridgeComposer.create({ root });
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  const mobile = matchMedia("(max-width: 700px)");
  const key = "studybridge.sample-course.workspace.v1";
  const say = (zh, en) => ui.getLanguage() === "en" ? en : zh;
  const copy = (pair) => say(...pair);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
  const book = icon("M12 7v14M3 3h3a6 6 0 0 1 6 3 6 6 0 0 1 6-3h3v16h-3a6 6 0 0 0-6 2 6 6 0 0 0-6-2H3z");
  const defaultChats = () => [{ turns: [], draft: "", mode: "guide" }];
  const modes = [
    ["guide", "带着学习", "Guided learning", [[0, "一步步教", "Teach step by step"], [1, "举例讲解", "Explain with an example"], [2, "检查理解", "Check understanding"]]],
    ["review", "复习", "Review", [[1, "复习公式", "Review the formula"], [2, "比较资料", "Compare sources"], [0, "回顾案例", "Review the case"]]]
  ];
  const courseTitle = () => say("微观经济学", "Microeconomics");
  const topic = () => say("需求弹性与咖啡价格", "Demand elasticity and the price of coffee");
  let saved;
  let legacy;
  try {
    saved = JSON.parse(localStorage.getItem(key));
    if (!saved) legacy = JSON.parse(localStorage.getItem("studybridge.sample-course.elasticity.v1"));
  } catch { /* Browser storage is optional. */ }
  const storedChats = Array.isArray(saved?.chats) ? saved.chats.filter(chat => Array.isArray(chat?.turns)).map(chat => ({
    turns: chat.turns.filter(turn => Number.isInteger(turn?.index) && questions[turn.index] && typeof turn.text === "string"),
    draft: typeof chat.draft === "string" ? chat.draft.slice(0, 500) : "",
    mode: chat.mode
  })) : [];
  const choices = saved?.choices ?? legacy?.choices;
  const review = saved?.review ?? legacy?.review;
  const state = {
    chats: storedChats.length ? storedChats : defaultChats(),
    active: Number.isInteger(saved?.active) && storedChats[saved.active] ? saved.active : 0,
    choices: quiz.map((item, index) => Number.isInteger(choices?.[index]) && item.choices[choices[index]] ? choices[index] : null),
    submitted: (saved?.submitted ?? legacy?.submitted) === true,
    review: Number.isFinite(review) && review > 0 && review <= 8.64e15 ? review : null,
    dark: typeof saved?.dark === "boolean" ? saved.dark : legacy?.theme === "dark" ? true : legacy?.theme === "light" ? false : null
  };
  if (state.choices.some(choice => choice === null)) state.submitted = false;
  let expanded = true;
  let mobileView = "page";
  let panelOpen = false;
  let notice = "";
  let sourceView = null;
  let learningView = "topics";
  let origin;

  const activeChat = () => state.chats[state.active];
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Interactions still work this visit. */ }
  }

  function action(id, title, options = {}) {
    const { value, className = "", attributes = "" } = options;
    return `<button type="button" data-sample-action="${id}" ${value === undefined ? "" : `data-value="${esc(value)}"`} class="${className}" ${attributes}>${title}</button>`;
  }

  function chatTitle(chat, index) {
    const first = chat.turns[0];
    if (first && questions[first.index]) return copy(questions[first.index].prompt);
    return index === 0 ? say("默认对话", "Default conversation") : say("新对话", "New conversation");
  }

  function materialRows() {
    return Object.entries(materials).map(([id, material]) => action("source", `<b>${copy(material.title)}</b><small>${say("阅读 ↗", "Open ↗")}</small>`, {
      value: id, className: "mini-row"
    })).join("");
  }

  function sidebar() {
    return `<aside class="sidebar">
      <header class="mobile-study-bar">${action("close-panel", say("‹ 返回学习", "‹ Back to Study"))}<strong>${say("课程与资料", "Courses and materials")}</strong></header>
      <header class="side-head"><div class="brand-mark"><span class="sb-brand-symbol"><img class="sb-logo-monochrome" src="/brand/book-bridge-monochrome.svg" alt=""></span></div>
        <div><strong><a class="sample-main-link" href="/#usage-demo">StudyBridge</a></strong><span>${say("访客 · 示例课", "Guest · Sample course")}</span></div></header>
      <div class="profile-card sample-profile"><div class="sample-profile-info"><h3>${say("访客学习空间", "Guest study space")}</h3><p>${say("示例资料和预设答疑 · 进度保存在此浏览器", "Sample materials and prepared replies · Progress stays in this browser")}</p></div></div>
      <nav class="side-nav" aria-label="${say("主导航", "Main navigation")}">
        <button class="nav-card active" type="button" aria-current="page" data-sample-action="study"><span aria-hidden="true">${book}</span><b>${say("学习", "Study")}</b><small>${say("课程资料、对话和复习计划", "Course materials, conversations and review plans")}</small></button>
      </nav>
      <div class="sample-sidebar-tools">${ui.selector()}${action("theme", document.documentElement.dataset.sbMode ? "☀" : "☾", {
        attributes: `aria-label="${document.documentElement.dataset.sbMode ? say("切换浅色模式", "Use light mode") : say("切换深色模式", "Use dark mode")}"`
      })}</div>
      <section class="side-section study-course-directory">
        <div class="section-title"><b>${say("对话与课程", "Chats and courses")}</b></div>
        <div class="course-list"><section class="course-folder" aria-label="${courseTitle()}">
          <div class="course-folder-heading">${action("expand", expanded ? "▾" : "▸", { attributes: `aria-expanded="${expanded}" aria-label="${say("展开或收起课程", "Expand or collapse course")}"` })}
            ${action("course", `<b>${courseTitle()}</b><small>ECON101</small>`, { className: "course-folder-name" })}
            ${action("new-chat", "＋", { attributes: `aria-label="${say("在微观经济学下新增对话", "Add a conversation in Microeconomics")}"` })}
          </div>
          ${expanded ? `<div class="course-chat-list">${state.chats.map((chat, index) => `<div class="course-chat-row ${state.active === index ? "active" : ""}">${action("chat", chatTitle(chat, index), { value: index, className: "course-chat-title", attributes: state.active === index ? 'aria-current="page"' : "" })}</div>`).join("")}</div>` : ""}
        </section></div>
      </section>
      <section class="side-section study-materials">
        <div class="section-title"><b>${say("课程资料", "Course materials")}</b><span>${Object.keys(materials).length}</span></div>
        <div class="study-material-list sample-material-list">${materialRows()}</div>
        <p class="sample-note">${say("示例资料已加入课程。创建自己的课程后，可以上传讲义和大纲。", "Sample materials are already in this course. Create your own course to upload notes and syllabuses.")}</p>
      </section>
      <a class="sample-demo-link" href="/app?page=study">${say("进入自己的学习空间 ↗", "Open your own study space ↗")}</a>
    </aside>`;
  }

  function compose() {
    const chat = activeChat();
    const mode = modes.find(([id]) => id === chat.mode) || modes[0];
    return `<form class="composer composer-light" id="sample-compose">
      <div class="study-toolbar">
        <label class="study-mode-control">${book}<select id="studyMode" aria-label="${say("学习模式", "Study mode")}">
          ${modes.map(([id, zh, en]) => `<option value="${id}" ${mode[0] === id ? "selected" : ""}>${say(zh, en)}</option>`).join("")}
        </select></label>
        <div class="quick-prompts" aria-label="${say("学习快捷指令", "Study shortcuts")}">
          ${mode[3].map(([index, zh, en]) => action("prompt", say(zh, en), { value: index })).join("")}
        </div>
      </div>
      <p class="sample-status" role="status">${notice}</p>
      <div class="compose-row">
        ${action("attachments", icon("m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"), {
          className: "attach", attributes: `aria-label="${say("查看示例附件", "View sample attachments")}"`
        })}
        <textarea id="chatInput" rows="1" maxlength="500" placeholder="${say("输入示例问题…", "Enter a sample question…")}" aria-label="${say("问题", "Question")}">${esc(chat.draft)}</textarea>
        <button class="send" type="submit" aria-label="${say("发送", "Send")}">${icon("M12 19V5m-7 7 7-7 7 7")}</button>
      </div>
    </form>`;
  }

  function citation(id, section) {
    return action("source", `${copy(materials[id].title)} · ${say(`第 ${section + 1} 节`, `§ ${section + 1}`)} ↗`, {
      value: `${id}:${section}`, className: "sample-citation"
    });
  }

  function exchange(turn) {
    const entry = questions[turn.index];
    if (!entry) return "";
    return `<div class="message user"><b>${say("我", "Me")}</b><div><span class="sample-message-text">${esc(turn.text)}</span></div></div>
      <div class="message ai"><b>AI</b><div class="reply-content"><small class="sample-example-tag">${say("预设回答", "Prepared reply")}</small>
      ${entry.blocks.map(block => `<p>${copy(block.text)}</p><div class="sample-citations">${block.sources.map(([id, section]) => citation(id, section)).join("")}</div>`).join("")}</div></div>`;
  }

  function syncPanel(focus = false) {
    const shell = root.firstElementChild;
    const smallScreen = mobile.matches;
    const active = smallScreen && panelOpen;
    const menu = smallScreen && mobileView === "menu";
    shell.dataset.mobilePanel = active ? "open" : "closed";
    shell.dataset.mobileView = menu ? "menu" : "page";
    shell.querySelector(".sidebar").inert = smallScreen && !active && !menu;
    shell.querySelector(".workspace").inert = active || menu;
    const trigger = shell.querySelector('[data-sample-action="panel"]');
    trigger.setAttribute("aria-expanded", String(active));
    if (focus && smallScreen) {
      const target = active ? shell.querySelector(".mobile-study-bar button")
        : menu ? shell.querySelector(".side-nav button") : trigger;
      target.focus();
    }
  }

  function render({ follow = false } = {}) {
    const previousScroll = root.querySelector(".chat-area")?.scrollTop || 0;
    const sidebarScroll = root.querySelector(".sidebar")?.scrollTop || 0;
    document.title = say("示例课 · StudyBridge", "Sample course · StudyBridge");
    root.innerHTML = `<div class="app-shell sample-shell" data-mobile-view="page" data-mobile-panel="closed">
      ${sidebar()}
      <main class="workspace study-workspace" id="workspace">
        <header class="mobile-page-bar">${action("menu", say("‹ 主菜单", "‹ Main menu"))}<strong>${say("学习", "Study")}</strong>
          ${action("panel", say("课程与资料", "Courses and materials"), { attributes: 'aria-expanded="false"' })}</header>
        <header class="page-header">
          <div class="study-heading-row"><div class="course-chat-heading"><small>${courseTitle()}${say(" · 课程资料共享", " · Shared course materials")}</small><h1 title="${esc(chatTitle(activeChat(), state.active))}">${chatTitle(activeChat(), state.active)}</h1></div></div>
          <div class="course-chat-actions">${action("learning", say("学习清单 · 练习", "Study topics · Practice"))}${action("new-chat", say("＋ 新对话", "＋ New conversation"))}</div>
        </header>
        <section class="chat-area" aria-label="${say("课程对话", "Course conversation")}"><div class="messages" id="messages" role="log">
          ${activeChat().turns.length ? activeChat().turns.map(exchange).join("") : `<div class="message ai"><b>AI</b><div class="sample-intro">
            <strong>${topic()}</strong>${say("课程资料已就绪。可以先打开讲义，也可以点一个示例问题，填到输入框后再发送。", "The course materials are ready. Open the notes or pick a sample question to fill the composer before sending.")}
            <div class="sample-prompts">${questions.map((item, index) => action("prompt", copy(item.prompt), { value: index })).join("")}</div>
          </div></div>`}
        </div></section>
        ${compose()}
      </main>
    </div>`;
    syncPanel();
    const chat = root.querySelector(".chat-area");
    chat.scrollTop = follow ? chat.scrollHeight : previousScroll;
    root.querySelector(".sidebar").scrollTop = sidebarScroll;
    composer.resize();
  }

  function passage(section, index) {
    return `<section class="sample-passage"><h3>${index + 1}. ${copy(section.title)}</h3>
      <p lang="en">${section.original}</p>${ui.getLanguage() === "en" ? "" : `<p class="sample-translation">${section.translation}</p>`}
      ${section.formula ? `<p lang="en" class="sample-formula">${section.formula}</p>` : ""}
      ${section.table ? `<table class="sample-table"><thead><tr><th scope="col">${say("日均数据", "Daily average")}</th><th scope="col">${say("提价前", "Before")}</th><th scope="col">${say("提价后", "After")}</th></tr></thead>
      <tbody><tr><th scope="row">${say("每杯价格", "Price per cup")}</th><td>$5</td><td>$6</td></tr><tr><th scope="row">${say("销量", "Cups sold")}</th><td>100</td><td>80</td></tr></tbody></table>` : ""}</section>`;
  }

  function dialogHeader(id, title) {
    return `<header><div><div class="learning-eyebrow"><span class="learning-wordmark"><img src="/brand/icon-monochrome.svg" alt="" width="16" height="16">StudyBridge</span><span class="learning-course-name">${courseTitle()}</span></div><h2 id="${id}">${title}</h2></div>
      <form method="dialog"><button type="submit" class="learning-close" aria-label="${say("关闭", "Close")}">×</button></form></header>`;
  }

  function drawSource() {
    const [id, section] = sourceView.split(":");
    const material = materials[id];
    const body = !material ? `<div class="study-material-list sample-material-list">${materialRows()}</div>`
      : section === undefined ? material.sections.map(passage).join("") : passage(material.sections[section], Number(section));
    source.innerHTML = `${dialogHeader("sample-source-title", material ? copy(material.title) : say("示例附件", "Sample attachments"))}
      <div class="learning-body">${body}</div>
      ${material && section !== undefined ? `<footer>${action("source", say("查看完整资料 →", "Open full material →"), { value: id })}</footer>` : ""}`;
  }

  function drawLearning() {
    const tab = (name, title) => action("view", title, { value: name, attributes: learningView === name ? 'aria-current="page"' : "" });
    const practice = action("practice", say("练三道题 →", "Try three questions →"), { className: "is-primary" });
    const plan = action("review", state.review ? say("取消复习标记", "Remove review mark") : say("安排明天复习", "Review tomorrow"), { className: "is-text" });
    const result = state.submitted ? quiz.filter((item, index) => item.correct === state.choices[index]).length : null;
    const description = result === null ? say("尚未检测", "Not yet checked") : say(`上次练习 ${result}/3`, `Last attempt ${result}/3`);
    let body = `<div class="learning-section-intro"><p>${say("选择想学的内容，由你决定下一步。", "Choose what to study next.")}</p><span>${say("1 个主题", "1 topic")}</span></div>
      <article class="learning-topic"><div class="learning-topic-heading"><span class="learning-status"><i></i>${description}</span><h3>${topic()}</h3></div>
      <div class="learning-topic-practice">${practice}${action("source", say("回看资料", "Review sources"), { value: "lecture", className: "is-text" })}</div>
      <div class="learning-topic-bottom">${plan}</div></article>`;
    if (learningView === "materials") body = `<div class="study-material-list sample-material-list">${materialRows()}</div>`;
    if (learningView === "history") body = result === null ? `<div class="learning-empty"><h3>${say("还没有练习记录", "No practice history yet")}</h3>${practice}</div>`
      : `<div class="learning-history"><b>${topic()} · ${result}/3</b>${action("practice", say("查看反馈 →", "See feedback →"), { className: "is-text" })}</div>`;
    if (learningView === "quiz") body = `<form id="sample-quiz"><h3>${topic()}</h3>
      ${state.submitted ? `<p class="learning-result" role="status">${say("本次结果", "This attempt")} · ${result}/3</p>` : ""}
      ${quiz.map((item, index) => `<fieldset><legend>${index + 1}. ${copy(item.prompt)}</legend>
      ${item.choices.map((choice, value) => `<label class="learning-choice"><input name="q-${index}" value="${value}" type="radio" required ${state.choices[index] === value ? "checked" : ""} ${state.submitted ? "disabled" : ""}><span>${copy(choice)}</span></label>`).join("")}
      ${state.submitted ? `<div class="learning-feedback"><b>${state.choices[index] === item.correct ? say("回答正确", "Correct") : `${say("正确答案", "Correct answer")} · ${copy(item.choices[item.correct])}`}</b><p>${copy(item.feedback[state.choices[index]])}</p>${citation(...item.source)}</div>`
        : `<details><summary>${say("看提示", "Show hint")}</summary><p>${copy(item.hint)}</p></details>`}
      </fieldset>`).join("")}
      <div class="learning-actions">${state.submitted ? `${plan}${action("retry", say("再练一次", "Try again"))}` : `<button type="submit" class="is-primary">${say("提交作答", "Submit answers")}</button>`}</div>
    </form>`;
    const review = state.review ? `<p class="learning-notice sample-review" role="status">${say("已标记复习", "Marked for review")} · ${new Intl.DateTimeFormat(ui.locale(), { dateStyle: "long" }).format(state.review)}</p>` : "";
    learning.innerHTML = `${dialogHeader("sample-learning-title", learningView === "quiz" ? say("三道练习", "Three practice questions") : say("学习清单", "Study topics"))}
      <nav aria-label="${say("学习入口", "Study options")}">${tab("topics", say("学习清单", "Study topics"))}${tab("materials", say("课程资料", "Course materials"))}${tab("history", say("练习记录", "Practice history"))}</nav>
      <div class="learning-body">${body}${review}</div><footer><small class="learning-privacy">${say("仅保存在此浏览器", "Saved in this browser")}</small><a href="/app?page=study">${say("进入自己的学习空间 ↗", "Open your own study space ↗")}</a></footer>`;
  }

  function applyTheme() {
    if (state.dark ?? systemDark.matches) document.documentElement.dataset.sbMode = "dark";
    else delete document.documentElement.dataset.sbMode;
  }

  function fill(index) {
    const input = root.querySelector("#chatInput");
    activeChat().draft = input.value = copy(questions[index].prompt);
    notice = "";
    root.querySelector(".sample-status").textContent = "";
    save();
    composer.resize();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function send(text) {
    const normalize = (value) => value.toLowerCase().replace(/[\s\p{P}]/gu, "");
    const index = questions.findIndex(item => item.prompt.some(prompt => normalize(text) === normalize(prompt)));
    if (index < 0) {
      notice = say("请选择上方或对话中的一个示例问题再发送。", "Choose one of the prepared questions from the conversation or shortcuts.");
      root.querySelector(".sample-status").textContent = notice;
      return;
    }
    activeChat().turns.push({ index, text });
    activeChat().draft = "";
    notice = "";
    save();
    render({ follow: true });
    root.querySelector("#chatInput").focus({ preventScroll: true });
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sample-action]");
    if (!button) return;
    const { sampleAction: id, value } = button.dataset;
    if (id === "prompt") return fill(Number(value));
    if (["menu", "study", "panel", "close-panel"].includes(id)) {
      mobileView = id === "menu" ? "menu" : "page";
      panelOpen = id === "panel";
      syncPanel(true);
      return;
    }
    if (id === "source" || id === "attachments") {
      if (!source.open) origin = button;
      sourceView = value || "list";
      drawSource();
      if (!source.open) source.showModal();
      return;
    }
    if (id === "learning") { learningView = "topics"; drawLearning(); learning.showModal(); return; }
    if (id === "view" || id === "practice" || id === "review" || id === "retry") {
      if (id === "view") learningView = value;
      if (id === "practice") learningView = "quiz";
      if (id === "review") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        state.review = state.review ? null : tomorrow.getTime();
      }
      if (id === "retry") { state.choices.fill(null); state.submitted = false; }
      save();
      drawLearning();
      return;
    }
    if (id === "expand") expanded = !expanded;
    if (id === "course") expanded = true;
    if (id === "chat" || id === "new-chat" || id === "course") {
      if (id === "new-chat") {
        state.chats.push(...defaultChats());
        state.active = state.chats.length - 1;
      } else state.active = id === "course" ? 0 : Number(value);
      notice = "";
      expanded = true;
      panelOpen = false;
      mobileView = "page";
    }
    if (id === "theme") { state.dark = document.documentElement.dataset.sbMode !== "dark"; applyTheme(); }
    save();
    render({ follow: id === "chat" || id === "new-chat" || id === "course" });
    if (id === "new-chat" || id === "chat") root.querySelector("#chatInput").focus();
  });

  source.addEventListener("close", () => { origin?.focus(); origin = null; });
  document.addEventListener("input", (event) => {
    if (event.target.id === "chatInput") { activeChat().draft = event.target.value; save(); }
    if (event.target.matches('#sample-quiz input[type="radio"]')) { state.choices[Number(event.target.name.slice(2))] = Number(event.target.value); save(); }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id !== "studyMode") return;
    activeChat().mode = event.target.value;
    save();
    render();
    root.querySelector("#studyMode").focus();
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id === "sample-compose") { event.preventDefault(); send(activeChat().draft.trim()); }
    if (event.target.id === "sample-quiz") {
      event.preventDefault();
      if (state.choices.some(choice => choice === null)) return;
      state.submitted = true;
      save();
      drawLearning();
      learning.querySelector(".learning-body").scrollTop = 0;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.target.id === "chatInput") {
      event.preventDefault();
      event.target.form.requestSubmit();
    }
    if (!panelOpen || source.open || learning.open) return;
    if (event.key === "Escape") { panelOpen = false; syncPanel(true); }
    if (event.key === "Tab") {
      const buttons = [...root.querySelectorAll(".sidebar button")].filter(button => button.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  ui.subscribe(() => { notice = ""; render(); if (source.open) drawSource(); if (learning.open) drawLearning(); });
  systemDark.addEventListener("change", () => { applyTheme(); render(); });
  mobile.addEventListener("change", () => { panelOpen = false; mobileView = "page"; syncPanel(); });
  applyTheme();
  render({ follow: true });
})();
