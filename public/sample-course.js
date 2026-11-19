(function () {
  "use strict";

  const { materials, questions, quiz } = window.StudyBridgeSampleContent;
  const ui = window.StudyBridgeI18n;
  const root = document.querySelector("#root");
  const source = document.querySelector("#sample-source");
  const learning = document.querySelector("#sample-learning");
  const addCourse = document.querySelector("#sample-add-course");
  const composer = window.StudyBridgeComposer.create({ root });
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  const mobile = matchMedia("(max-width: 700px)");
  const key = "studybridge.sample-course.workspace.v1";
  const requestedCourse = new URLSearchParams(location.search).get("course");
  const builtIn = requestedCourse === "sample";
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
  const sampleName = "StudyBridge-需求价格弹性-课程讲义.txt";
  const sampleText = [materials.lecture.original, ...materials.lecture.sections.map(({ title, original, formula }, index) =>
    [`${index + 1}. ${title[1]}`, original, formula].filter(Boolean).join("\n"))].join("\n\n") + "\n";
  const sampleFile = new File([sampleText], sampleName, { type: "text/plain" });
  const sampleDownload = URL.createObjectURL(sampleFile);
  const pendingFiles = new Map();
  const uploadStatus = new Map();
  const uploading = new Set();
  const topic = () => say("需求弹性与咖啡价格", "Demand elasticity and the price of coffee");
  let saved;
  let legacy;
  try {
    saved = JSON.parse(localStorage.getItem(key));
    if (!saved) legacy = JSON.parse(localStorage.getItem("studybridge.sample-course.elasticity.v1"));
  } catch { /* Browser storage is optional. */ }
  const restoreChats = (chats) => Array.isArray(chats) ? chats.filter(chat => Array.isArray(chat?.turns)).map(chat => ({
    turns: chat.turns.filter(turn => Number.isInteger(turn?.index) && questions[turn.index] && typeof turn.text === "string"),
    draft: typeof chat.draft === "string" ? chat.draft.slice(0, 500) : "",
    mode: chat.mode
  })) : [];
  const builtInChats = restoreChats(saved?.chats);
  const guestCourses = Array.isArray(saved?.guestCourses) ? saved.guestCourses.filter(item =>
    typeof item?.name === "string" && /^[a-f0-9-]{36}$/.test(item.id)
  ).map(item => ({
    id: item.id, name: item.name.slice(0, 120),
    file: typeof item.file === "string" ? item.file.slice(0, 255) : "",
    chats: restoreChats(item.chats), active: item.active
  })) : [];
  for (const item of guestCourses) {
    if (!item.chats.length) item.chats = defaultChats();
    if (!item.chats[item.active] || !Number.isInteger(item.active)) item.active = 0;
  }
  const choices = saved?.choices ?? legacy?.choices;
  const review = saved?.review ?? legacy?.review;
  const state = {
    chats: builtInChats.length ? builtInChats : defaultChats(),
    active: Number.isInteger(saved?.active) && builtInChats[saved.active] ? saved.active : 0,
    guestCourses, courseId: builtIn ? "sample" : guestCourses.find(item => item.id === requestedCourse)?.id || "",
    choices: quiz.map((item, index) => Number.isInteger(choices?.[index]) && item.choices[choices[index]] ? choices[index] : null),
    submitted: (saved?.submitted ?? legacy?.submitted) === true,
    review: Number.isFinite(review) && review > 0 && review <= 8.64e15 ? review : null,
    dark: typeof saved?.dark === "boolean" ? saved.dark : legacy?.theme === "dark" ? true : legacy?.theme === "light" ? false : null
  };
  if (state.choices.some(choice => choice === null)) state.submitted = false;
  const expanded = new Set([state.courseId]);
  let mobileView = "page";
  let panelOpen = false;
  let notice = "";
  let sourceView = null;
  let learningView = "topics";
  let origin;

  const guestCourse = () => state.guestCourses.find(item => item.id === state.courseId);
  const courseData = () => guestCourse() || state;
  const courseTitle = () => guestCourse()?.name || say("微观经济学", "Microeconomics");
  const activeChat = () => state.courseId ? courseData().chats[courseData().active] : null;
  const ready = () => builtIn || Boolean(guestCourse()?.file);
  const available = () => builtIn ? [0, 1, 2] : ready() ? [3] : [];
  const sourcesInCourse = () => builtIn ? Object.keys(materials) : ready() ? ["lecture"] : [];
  const materialName = (id) => guestCourse()?.file || copy(materials[id].title);
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Interactions still work this visit. */ }
  }

  function selectCourse(id) {
    state.courseId = id;
    const url = new URL(location.href);
    url.searchParams.set("course", id);
    history.replaceState(history.state, "", url);
  }

  function guideStep() {
    if (builtIn) return null;
    if (addCourse.open) return ["#sample-add-form .study-dialog-primary",
      say("输入课程名称，然后点「创建课程」。", "Enter a course name, then choose Create course.")];
    if (state.courseId && courseData().chats.some(chat => chat.turns.length)) return null;
    if (mobile.matches && mobileView === "menu") return ["[data-sample-action=study]",
      say("点「学习」，回到课程工作区。", "Choose Study to return to the workspace.")];
    if (mobile.matches && !panelOpen && !ready()) return [".mobile-page-bar [data-sample-action=panel]",
      say("点「课程与资料」，打开课程侧栏。", "Open Courses and materials to use the course sidebar.")];
    if (!state.courseId) return ["[data-sample-action=add-course]",
      say("点「新增」，先建一门课程。", "Choose Add to create a course.")];
    if (!ready()) {
      if (pendingFiles.has(state.courseId)) return ["[data-sample-action=upload-doc]",
        say("点「上传所选文件」，把讲义加入课程。", "Choose Upload selected file to add the notes to your course.")];
      return ["[data-sample-action=select-sample]",
        say("在「课程资料」里点「选用示例讲义」。", "In Course materials, choose Select sample lecture notes.")];
    }
    if (mobile.matches && panelOpen) return ["[data-sample-action=close-panel]",
      say("讲义已加入。点「返回学习」，开始提问。", "The notes are ready. Choose Back to Study to ask a question.")];
    if (activeChat().draft.trim()) return ["#sample-compose .send",
      say("问题已填好，点「发送」。", "Your question is ready. Choose Send.")];
    return ["#chatInput",
      say("在底部输入框写下问题，例如：需求价格弹性怎么计算？", "Type a question in the composer, for example: How do I calculate price elasticity of demand?")];
  }

  function syncGuide() {
    document.querySelector("[data-guide-next]")?.removeAttribute("data-guide-next");
    document.querySelector("[aria-describedby=sample-guide-copy], [aria-describedby=sample-mobile-guide-copy]")?.removeAttribute("aria-describedby");
    const step = guideStep();
    const mainCopy = root.querySelector("#sample-guide-copy");
    const mobileCopy = root.querySelector("#sample-mobile-guide-copy");
    const message = step && !addCourse.open ? step[1] : "";
    const sidebarGuide = mobile.matches && (panelOpen || mobileView === "menu");
    for (const [label, show] of [[mainCopy, !sidebarGuide], [mobileCopy, sidebarGuide]]) {
      label.hidden = !message || !show;
      if (label.textContent !== message) label.textContent = message;
    }
    const target = step && document.querySelector(step[0]);
    if (!target) return;
    target.setAttribute("data-guide-next", "");
    if (!addCourse.open) target.setAttribute("aria-describedby", sidebarGuide ? mobileCopy.id : mainCopy.id);
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
    return sourcesInCourse().map(id => action("source", `<b>${esc(materialName(id))}</b><small>${say("阅读 ↗", "Open ↗")}</small>`, {
      value: id, className: "mini-row"
    })).join("");
  }

  function courseFolder({ id, name, chats, active }) {
    const open = expanded.has(id);
    return `<section class="course-folder" aria-label="${esc(name)}">
      <div class="course-folder-heading">
        ${action("expand", open ? "▾" : "▸", { value: id, attributes: `aria-expanded="${open}" aria-label="${esc(say("展开或收起 ", "Expand or collapse ") + name)}"` })}
        ${action("course", `<b>${esc(name)}</b>${id === "sample" ? "<small>ECON101</small>" : ""}`, { value: id, className: "course-folder-name" })}
        ${action("new-chat", "＋", { value: id, attributes: `aria-label="${esc(say(`在 ${name} 下新增对话`, `Add a conversation in ${name}`))}"` })}
      </div>
      ${open ? `<div class="course-chat-list">${chats.map((chat, index) => {
        const current = state.courseId === id && active === index;
        return `<div class="course-chat-row ${current ? "active" : ""}">${action("chat", chatTitle(chat, index), { value: `${id}:${index}`, className: "course-chat-title", attributes: current ? 'aria-current="page"' : "" })}</div>`;
      }).join("")}</div>` : ""}
    </section>`;
  }

  function uploadControls() {
    const selected = pendingFiles.get(state.courseId);
    const status = uploadStatus.get(state.courseId);
    return `<div class="study-material-row study-file-row">
      <input id="docFile" type="file" accept=".txt,text/plain" aria-label="${say("选择课程资料文件", "Choose a course material file")}">
      ${action("upload-doc", icon("M12 16V4m-5 5 5-5 5 5M5 16v4h14v-4"), {
        className: "study-side-icon", attributes: `title="${say("上传所选文件", "Upload selected file")}" aria-label="${say("上传所选文件", "Upload selected file")}" ${uploading.has(state.courseId) ? "disabled" : ""}`
      })}
    </div>
    <div class="sample-upload-actions">${action("select-sample", say("选用示例讲义", "Select sample lecture notes"))}
      <a class="sample-demo-link" href="${sampleDownload}" download="${sampleName}">${say("下载示例文件", "Download the sample file")}</a>
    </div>
    <p class="sample-note">${selected ? esc(say("已选择：", "Selected: ") + selected.name) : say("本预览接受这份示例 TXT，选择后请点上传。", "This preview accepts the sample TXT. Select it, then click Upload.")}</p>
    <p class="sample-note" id="courseUploadStatus" role="status">${status ? copy(status) : ""}</p>`;
  }

  function sidebar() {
    return `<aside class="sidebar">
      <header class="mobile-study-bar">${action("close-panel", say("‹ 返回学习", "‹ Back to Study"))}<strong>${say("课程与资料", "Courses and materials")}</strong></header>
      <p class="sample-guide-copy sample-mobile-guide" id="sample-mobile-guide-copy" role="status" hidden></p>
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
        <div class="section-title"><b>${say("对话与课程", "Chats and courses")}</b>${builtIn ? "" : action("add-course", say("新增", "Add"))}</div>
        <div class="course-list">${(builtIn
          ? [{ id: "sample", name: say("微观经济学", "Microeconomics"), chats: state.chats, active: state.active }]
          : state.guestCourses).map(courseFolder).join("") || `<p class="sample-note">${say("暂无课程", "No courses yet")}</p>`}</div>
      </section>
      ${state.courseId ? `<section class="side-section study-materials">
        <div class="section-title"><b>${say("课程资料", "Course materials")}</b><span>${sourcesInCourse().length}</span></div>
        ${guestCourse() ? uploadControls() : ""}
        <div class="study-material-list sample-material-list">${materialRows() || `<p class="muted">${say("暂无课程资料", "No course materials yet")}</p>`}</div>
      </section>` : ""}
      <a class="sample-demo-link" href="/app?page=study">${say("进入自己的学习空间 ↗", "Open your own study space ↗")}</a>
      ${builtIn ? `<a class="sample-demo-link sample-alternate-entry" href="/sample-course">${say("从空白学习空间开始 →", "Start with an empty workspace →")}</a>` : ""}
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
          ${guestCourse() ? available().map(index => action("prompt", say("一步步教", "Teach step by step"), { value: index })).join("")
            : mode[3].map(([index, zh, en]) => action("prompt", say(zh, en), { value: index })).join("")}
        </div>
      </div>
      <p class="sample-status" role="status">${notice}</p>
      <div class="compose-row">
        ${action("attachments", icon("m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"), {
          className: "attach", attributes: `aria-label="${say("查看示例附件", "View sample attachments")}"`
        })}
        <textarea id="chatInput" rows="1" maxlength="500" placeholder="${say("输入问题…", "Enter a question…")}" aria-label="${say("问题", "Question")}">${esc(chat.draft)}</textarea>
        <button class="send" type="submit" aria-label="${say("发送", "Send")}">${icon("M12 19V5m-7 7 7-7 7 7")}</button>
      </div>
    </form>`;
  }

  function citation(id, section) {
    return action("source", `${esc(materialName(id))} · ${say(`第 ${section + 1} 节`, `§ ${section + 1}`)} ↗`, {
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
    const trigger = shell.querySelector('.mobile-page-bar [data-sample-action="panel"]');
    trigger.setAttribute("aria-expanded", String(active));
    if (focus && smallScreen) {
      const target = active ? shell.querySelector(".mobile-study-bar button")
        : menu ? shell.querySelector(".side-nav button") : trigger;
      target.focus();
    }
    syncGuide();
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
          ${state.courseId ? `<div class="study-heading-row"><div class="course-chat-heading"><small>${esc(courseTitle())}${say(" · 课程资料共享", " · Shared course materials")}</small><h1 title="${esc(chatTitle(activeChat(), courseData().active))}">${chatTitle(activeChat(), courseData().active)}</h1></div></div>
          <div class="course-chat-actions">${builtIn ? action("learning", say("学习清单 · 练习", "Study topics · Practice")) : ""}${action("new-chat", say("＋ 新对话", "＋ New conversation"))}</div>`
          : `<div><h1>${say("学习", "Study")}</h1></div>`}
        </header>
        <p class="sample-guide-copy sample-main-guide" id="sample-guide-copy" role="status" hidden></p>
        <section class="chat-area" aria-label="${say("课程对话", "Course conversation")}">
        ${state.courseId ? `<div class="messages" id="messages" role="log">
          ${activeChat().turns.length ? activeChat().turns.map(exchange).join("") : `<div class="message ai"><b>AI</b><div class="sample-intro">
            <strong>${guestCourse() ? esc(courseTitle()) : topic()}</strong>
            ${ready() ? say("课程资料已就绪，可以从一个问题开始。", "The course materials are ready. Start with a question.")
              : say("课程已创建，课程资料还是空的。", "Your course is ready for its first material.")}
            ${builtIn && available().length ? `<div class="sample-prompts">${available().map(index => action("prompt", copy(questions[index].prompt), { value: index })).join("")}</div>` : ""}
          </div></div>`}
        </div>` : `<div class="sample-empty-workspace">
          <h2>${state.guestCourses.length ? say("选择或新增课程", "Choose or add a course") : say("开始你的第一门课", "Start your first course")}</h2>
          <p>${say("为课程取个名字，加入一份示例讲义，再问第一个问题。", "Name a course, add the sample lecture notes, then ask your first question.")}</p>
          <a class="sample-demo-link" href="/sample-course?course=sample">${say("直接看已建好的微观经济学示例课 →", "Open the prebuilt Microeconomics sample →")}</a>
        </div>`}
        </section>
        ${state.courseId ? compose() : ""}
      </main>
    </div>`;
    syncPanel();
    const chat = root.querySelector(".chat-area");
    chat.scrollTop = follow ? chat.scrollHeight : previousScroll;
    root.querySelector(".sidebar").scrollTop = sidebarScroll;
    const file = pendingFiles.get(state.courseId);
    if (file && root.querySelector("#docFile") && typeof DataTransfer === "function") {
      const selection = new DataTransfer();
      selection.items.add(file);
      root.querySelector("#docFile").files = selection.files;
    }
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
    return `<header><div><div class="learning-eyebrow"><span class="learning-wordmark"><img src="/brand/icon-monochrome.svg" alt="" width="16" height="16">StudyBridge</span><span class="learning-course-name">${esc(courseTitle())}</span></div><h2 id="${id}">${title}</h2></div>
      <form method="dialog"><button type="submit" class="learning-close" aria-label="${say("关闭", "Close")}">×</button></form></header>`;
  }

  function drawSource() {
    const [id, section] = sourceView.split(":");
    const material = materials[id];
    const body = !material ? `<div class="study-material-list sample-material-list">${materialRows()}</div>`
      : section === undefined ? material.sections.map(passage).join("") : passage(material.sections[section], Number(section));
    source.innerHTML = `${dialogHeader("sample-source-title", material ? esc(materialName(id)) : say("示例附件", "Sample attachments"))}
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
    syncGuide();
  }

  function findQuestion(text) {
    const normalize = (value) => value.toLowerCase().replace(/[\s\p{P}]/gu, "");
    const exact = available().find(i => questions[i].prompt.some(prompt => normalize(text) === normalize(prompt)));
    if (exact !== undefined) return exact;
    if (guestCourse() && ready() && /弹性|中点|elasticity|elastic demand|midpoint/i.test(text)) return 3;
    return undefined;
  }

  function send(text) {
    const index = findQuestion(text);
    if (index === undefined) {
      notice = ready() ? say("这份示例讲义可以演示弹性与中点法的讲解。请在输入框提问，例如：需求价格弹性怎么计算？", "This sample provides prepared explanations of elasticity and the midpoint method. Try typing: How do I calculate price elasticity of demand?")
        : say("先上传示例讲义，再发出第一个问题。", "Upload the sample lecture notes before sending your first question.");
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

  function drawAddCourse() {
    addCourse.innerHTML = `<form id="sample-add-form" novalidate>
      <header><h2 id="sample-add-title">${say("新增课程", "Add course")}</h2>
      <p id="sample-add-description">${say("输入课程名称，然后点「创建课程」。", "Enter a course name, then choose Create course.")}</p></header>
      <label>${say("课程名称", "Course name")}<input name="courseName" maxlength="120" placeholder="${say("例如 ECO101", "e.g. ECO101")}" aria-describedby="sample-add-error" required autofocus></label>
      <p id="sample-add-error" class="study-dialog-error" role="alert" hidden></p>
      <footer>${action("cancel-add", say("取消", "Cancel"))}<button type="submit" class="study-dialog-primary">${say("创建课程", "Create course")}</button></footer>
    </form>`;
  }

  function stageFile(file, focus) {
    if (file) pendingFiles.set(state.courseId, file);
    else pendingFiles.delete(state.courseId);
    uploadStatus.delete(state.courseId);
    render();
    root.querySelector(focus)?.focus();
  }

  async function uploadFile() {
    const course = guestCourse();
    if (!course || uploading.has(course.id)) return;
    const file = pendingFiles.get(course.id);
    let result = ["请先选择课程资料文件。", "Choose a course material file first."];
    if (file) {
      uploading.add(course.id);
      root.querySelector('[data-sample-action="upload-doc"]').disabled = true;
      try {
        const matches = file.size === sampleFile.size && await file.text() === sampleText;
        if (!matches) result = ["请使用页面提供的示例 TXT。", "Choose the sample TXT provided on this page."];
        else {
          course.file = file.name.slice(0, 255) || sampleName;
          result = ["讲义已加入课程。", "Lecture notes added to the course."];
          save();
        }
      } catch {
        result = ["无法读取所选文件，请重新选择。", "Could not read the selected file. Please choose it again."];
      } finally {
        pendingFiles.delete(course.id);
        uploading.delete(course.id);
      }
    }
    uploadStatus.set(course.id, result);
    if (state.courseId === course.id) {
      render();
      root.querySelector("#courseUploadStatus").setAttribute("tabindex", "-1");
      root.querySelector("#courseUploadStatus").focus({ preventScroll: true });
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sample-action]");
    if (!button) return;
    const { sampleAction: id, value } = button.dataset;
    if (id === "prompt") return fill(Number(value));
    if (id === "add-course") { drawAddCourse(); addCourse.showModal(); syncGuide(); return; }
    if (id === "cancel-add") { addCourse.close(); syncGuide(); return; }
    if (id === "select-sample") return stageFile(sampleFile, '[data-sample-action="upload-doc"]');
    if (id === "upload-doc") { void uploadFile(); return; }
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
    if (id === "expand") {
      if (expanded.has(value)) expanded.delete(value);
      else expanded.add(value);
    }
    if (id === "chat" || id === "new-chat" || id === "course") {
      const [courseId, chatIndex] = (value || state.courseId).split(":");
      if (state.courseId !== courseId) selectCourse(courseId);
      const data = courseData();
      if (id === "new-chat") {
        data.chats.push(...defaultChats());
        data.active = data.chats.length - 1;
      } else if (id === "chat") data.active = Number(chatIndex);
      notice = "";
      expanded.add(courseId);
      panelOpen = false;
      mobileView = "page";
    }
    if (id === "theme") { state.dark = document.documentElement.dataset.sbMode !== "dark"; applyTheme(); }
    save();
    render({ follow: id === "chat" || id === "new-chat" || id === "course" });
    if (id === "new-chat" || id === "chat") root.querySelector("#chatInput").focus();
  });

  addCourse.addEventListener("close", syncGuide);
  source.addEventListener("close", () => { origin?.focus(); origin = null; });
  document.addEventListener("input", (event) => {
    if (event.target.id === "chatInput") { activeChat().draft = event.target.value; save(); syncGuide(); }
    if (event.target.matches('#sample-quiz input[type="radio"]')) { state.choices[Number(event.target.name.slice(2))] = Number(event.target.value); save(); }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "docFile") { stageFile(event.target.files[0], "#docFile"); return; }
    if (event.target.id !== "studyMode") return;
    activeChat().mode = event.target.value;
    save();
    render();
    root.querySelector("#studyMode").focus();
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id === "sample-add-form") {
      event.preventDefault();
      const field = event.target.elements.courseName;
      const name = field.value.trim();
      if (!name) {
        const error = addCourse.querySelector("#sample-add-error");
        error.hidden = false;
        error.textContent = say("请输入课程名称。", "Enter a course name.");
        field.setAttribute("aria-invalid", "true");
        field.focus();
        return;
      }
      const id = crypto.randomUUID();
      state.guestCourses.unshift({ id, name, file: "", chats: defaultChats(), active: 0 });
      selectCourse(id);
      expanded.add(id);
      notice = "";
      addCourse.close();
      save();
      render({ follow: true });
      root.querySelector('[data-sample-action="select-sample"]').focus();
      return;
    }
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
    if (!panelOpen || addCourse.open || source.open || learning.open) return;
    if (event.key === "Escape") { panelOpen = false; syncPanel(true); }
    if (event.key === "Tab") {
      const controls = [...root.querySelectorAll(".sidebar :is(button, input, a[href], select)")].filter(control => !control.disabled && control.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
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
