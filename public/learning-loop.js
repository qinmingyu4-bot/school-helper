(function (scope, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else scope.StudyBridgeLearningLoop = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const key = (context) => JSON.stringify([context?.userId, context?.courseId]);
  function suggestion(data, reason, time = Date.now()) {
    if (!data || data.prompts === false || Date.parse(data.snoozedUntil) > time) return null;
    const due = data.topics.find((topic) => !topic.sourceStale && topic.nextReviewAt && Date.parse(topic.nextReviewAt) <= time);
    if (due) return { kind: "review", topicId: due.id, title: due.title };
    if (!data.topics.length && data.documents.some((doc) => doc.readable)) return { kind: "organize" };
    if (reason === "lesson" && data.topics.length) return { kind: "practice" };
    if (reason === "upload" && data.documents.length) return { kind: "organize" };
    return null;
  }
  function create({ request, getContext, onStudy, onScheduleChange, ui, storage = globalThis.localStorage, doc = globalThis.document }) {
    let context = null, generation = 0, loadSequence = 0, lastVisible = false, owner = null, panel = null, prompt = null, timer = null, lastInteraction = 0, returnFocus = null;
    const cache = new Map(), sessionDismissals = new Set();
    const current = (expected, sequence = generation) => sequence === generation && key(getContext()) === expected && getContext()?.visible;
    const model = () => cache.get(key(context));
    const t = (text) => ui.text(text), safe = (text) => esc(t(text));
    const date = (value) => value ? new Date(value).toLocaleString(ui.locale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const endpoint = (courseId, operation = "") => `/api/courses/${encodeURIComponent(courseId)}/learning-loop${operation ? `/${operation}` : ""}`;
    function capture() {
      if (!panel || !model()) return;
      const state = model(); state.fields ||= {};
      panel.querySelectorAll("[data-field]").forEach((field) => { state.fields[field.dataset.field] = field.value; });
      panel.querySelectorAll("[data-answer]").forEach((input) => { if (input.checked) state.answers[Number(input.dataset.answer)] = Number(input.value); });
      panel.querySelectorAll("[data-doc]").forEach((input) => { state.selectedDocs[input.dataset.doc] = input.checked; });
      panel.querySelectorAll("[data-draft-id]").forEach((input) => { state.keep[input.dataset.draftId] = input.checked; });
    }
    function closePrompt() { prompt?.remove(); prompt = null; clearTimeout(timer); }
    function close() {
      capture();
      if (panel) { panel.close(); panel.remove(); panel = null; }
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
    async function load() {
      capture();
      const expected = key(context), seq = generation, loadId = ++loadSequence, courseId = context?.courseId;
      if (!courseId) return;
      try {
        const result = await request(endpoint(courseId));
        if (generation !== seq || loadId !== loadSequence || key(context) !== expected || key(getContext()) !== expected) return;
        const state = model(); state.data = result.learning; state.loadError = "";
        if (panel && current(expected)) draw();
        offer("load");
      } catch (error) {
        if (generation === seq && loadId === loadSequence && key(context) === expected) { model().loadError = error.message; if (panel) draw(); }
      }
    }
    async function sync() {
      const next = getContext();
      if (!next?.visible || !next.courseId) {
        if (lastVisible) generation++;
        lastVisible = false;
        if (panel) close(); closePrompt();
        return;
      }
      const returned = !lastVisible; lastVisible = true;
      if (owner !== next.userId) { close(); closePrompt(); cache.clear(); sessionDismissals.clear(); owner = next.userId; }
      if (key(context) !== key(next)) {
        close(); closePrompt(); generation++; context = { ...next };
        if (!model()) cache.set(key(context), { data: null, fields: {}, answers: [], selectedDocs: {}, keep: {}, view: "topics", busy: false });
        await load();
      } else if (returned || !model()?.data && !model()?.loadError) await load();
      else offer("load");
    }
    function dismissKey() { return `studybridge.learning-prompt.${context.userId}.${context.courseId}`; }
    function markDismissed() {
      const id = dismissKey(); sessionDismissals.add(id);
      try { storage?.setItem(id, String(Date.now())); } catch { /* Best-effort browser preference. */ }
      closePrompt();
    }
    function offer(reason) {
      clearTimeout(timer);
      if (!context || !current(key(context)) || panel || prompt) return;
      const state = model(), item = suggestion(state?.data, reason);
      if (!item) return;
      const id = dismissKey(); let last = 0;
      try { last = Number(storage?.getItem(id)) || 0; } catch {}
      if (sessionDismissals.has(id) || Date.now() - last < 600000) return;
      const expected = key(context);
      timer = setTimeout(() => {
        if (!current(expected) || panel || prompt || doc.hidden || !suggestion(model()?.data, reason)) return;
        if (Date.now() - lastInteraction < 5000 || getContext().quiet === false) { timer = setTimeout(() => offer(reason), 3000); return; }
        prompt = doc.createElement("aside"); prompt.className = "learning-prompt"; prompt.setAttribute("aria-label", t("学习建议"));
        const messages = { organize: "要把这次的资料整理成学习清单吗？", practice: "想用三道题检查一下理解吗？", review: "有一个主题可以再练一练。" };
        prompt.innerHTML = `<div role="status"><b>${safe("你来决定下一步")}</b><p>${safe(messages[item.kind])}</p>${item.title ? `<small>${esc(item.title)}</small>` : ""}</div><div class="learning-actions"><button type="button" data-prompt="open">${safe("我想试试")}</button><button type="button" data-prompt="later">${safe("稍后再说")}</button><button type="button" data-prompt="mute">${safe("关闭自动提示")}</button></div><button type="button" class="learning-prompt-close" data-prompt="close" aria-label="${safe("关闭学习建议")}">×</button>`;
        prompt.addEventListener("click", (event) => {
          const action = event.target.closest("[data-prompt]")?.dataset.prompt;
          if (!action) return;
          markDismissed();
          if (action === "open") { open(); if (item.kind === "organize") { model().view = "materials"; draw(); } }
          if (action === "later") void run("preferences", { snooze: true });
          if (action === "mute") void run("preferences", { prompts: false });
        });
        doc.body.append(prompt);
        try { storage?.setItem(id, String(Date.now())); } catch {}
      }, 2200);
    }
    function sourceHtml(ref) {
      const locator = ref.pages?.length ? `${t("PDF 页码")} ${ref.pages.join(", ")}` : `${t("提取文字位置")} ${ref.start + 1}–${ref.end}`;
      return `<div class="learning-source"><b>${esc(ref.name)}</b><small>${esc(locator)}</small><blockquote>${esc(ref.quote)}</blockquote>${ref.excerpt ? `<pre>${esc(ref.excerpt)}</pre>` : ""}</div>`;
    }
    const button = (action, label, attributes = "") => `<button type="button" data-learning="${action}" ${attributes}>${safe(label)}</button>`;
    function materialsHtml(state) {
      return `<p>${safe("选择资料后生成主题草稿，你可以修改名称、取消勾选，再确认加入。长资料会抽样整理，清单不代表完整覆盖或考试范围。")}</p><div class="learning-docs">${state.data.documents.map((item) => `<label><input type="checkbox" data-doc="${esc(item.id)}" ${state.selectedDocs[item.id] ? "checked" : ""}><span>${esc(item.name)}</span></label>`).join("") || `<p>${safe("先在课程资料中上传讲义或保存笔记。")}</p>`}</div>${button("extract", "生成学习清单草稿")}${state.data.draft ? `<section class="learning-draft"><h3>${safe("核对学习清单")}</h3>${state.data.draft.topics.map((topic) => `<article><label><input type="checkbox" data-draft-id="${esc(topic.id)}" ${state.keep[topic.id] !== false ? "checked" : ""}><input aria-label="${safe("主题名称")}" data-field="draft-${esc(topic.id)}" value="${esc(state.fields[`draft-${topic.id}`] ?? topic.title)}" maxlength="160"></label>${topic.sources.map(sourceHtml).join("")}</article>`).join("")}<div class="learning-actions">${button("confirm", "确认加入学习清单")}${button("discard", "放弃这份草稿")}</div></section>` : ""}`;
    }
    function topicsHtml(state) {
      const topics = [...state.data.topics].sort((a, b) => (a.status === "needs_review" ? 0 : a.status === "untested" ? 1 : 2) - (b.status === "needs_review" ? 0 : b.status === "untested" ? 1 : 2) || String(a.nextReviewAt || "").localeCompare(String(b.nextReviewAt || "")));
      const statuses = { untested: "尚未检测", needs_review: "需要再练", answered_correct: "本次独立答对" };
      return `<p>${safe("选你现在想学的内容。看过讲解和完成日程不会被当作掌握，只有作答会更新学习记录。")}</p>${topics.map((topic) => `<article class="learning-topic"><div class="learning-topic-heading"><h3>${esc(topic.title)}</h3><span class="learning-status ${topic.status === "needs_review" ? "needs-review" : ""}">${safe(statuses[topic.status] || "尚未检测")}</span></div>${topic.lastAttemptAt ? `<small>${esc(date(topic.lastAttemptAt))} · ${topic.lastScore}/3${topic.helped ? ` · ${safe("看过提示后作答")}` : ""}</small>` : ""}${topic.nextReviewAt ? `<p class="learning-next">${safe("建议再练时间")} · ${esc(date(topic.nextReviewAt))}</p>` : ""}${topic.sourceStale ? `<p class="learning-warning">${safe("资料已更新，请重新关联出处后再练习。")}</p>` : ""}<div class="learning-actions">${button("source", "看资料 / 学这部分", `data-topic="${esc(topic.id)}"`)}${button("quiz", "练三道题", `data-topic="${esc(topic.id)}" ${topic.sourceStale || !topic.sources.length ? "disabled" : ""}`)}${button("plan", "安排复习", `data-topic="${esc(topic.id)}"`)}${topic.lastQuizId ? button("resume", "查看上次作答", `data-id="${esc(topic.lastQuizId)}"`) : ""}</div><details><summary>${safe("编辑主题")}</summary><label>${safe("主题名称")}<input data-field="title-${esc(topic.id)}" value="${esc(state.fields[`title-${topic.id}`] ?? topic.title)}" maxlength="160"></label><div class="learning-actions">${button("rename", "保存名称", `data-topic="${esc(topic.id)}"`)}${button("bind", "关联资料出处", `data-topic="${esc(topic.id)}"`)}${button("delete", "删除主题", `data-topic="${esc(topic.id)}"`)}</div></details></article>`).join("") || `<div class="learning-empty"><h3>${safe("从你想学的内容开始")}</h3><p>${safe("可以从资料整理，也可以先自己添加一个主题。")}</p>${button("materials", "从课程资料整理")}</div>`}<section class="learning-add"><h3>${safe("自己添加主题")}</h3><label>${safe("主题名称")}<input data-field="newTitle" maxlength="160" value="${esc(state.fields.newTitle || "")}" placeholder="${safe("例如：我想弄懂 p 值")}"></label>${button("add", "添加到学习清单")}</section>`;
    }
    function quizHtml(state) {
      const quiz = state.quiz;
      if (!quiz) return "";
      return `<h3>${esc(quiz.topicTitle)}</h3><p>${safe("这些是根据课程资料生成的练习题，请先作答，再查看反馈。AI 题目和解析也可能有误，可对照出处核对。")}</p>${quiz.submittedAt ? `<p class="learning-result" role="status">${safe("本次结果")} ${quiz.score}/3 · ${safe(quiz.helped ? "看过提示后作答" : "独立作答")}<br>${safe(quiz.score === 3 && !quiz.helped ? "已记录本次独立答对，后续用新题再检查。" : "已记下需要再练的内容，你可以看讲解或安排下一次复习。")}</p>` : ""}${quiz.questions.map((question, index) => `<fieldset><legend>${index + 1}. ${esc(question.prompt)}</legend>${question.choices.map((choice, choiceIndex) => `<label class="learning-choice"><input type="radio" name="learning-q-${index}" data-answer="${index}" value="${choiceIndex}" ${Number(quiz.answers?.[index] ?? state.answers[index] ?? -1) === choiceIndex ? "checked" : ""} ${quiz.submittedAt ? "disabled" : ""}><span>${esc(choice)}</span></label>`).join("")}${question.explanations ? `<div class="learning-feedback"><b>${safe("参考答案")} ${String.fromCharCode(65 + question.answerIndex)}</b>${quiz.submittedAt && quiz.answers[index] !== question.answerIndex ? `<p>${safe("这次的误区")}：${esc(question.explanations[quiz.answers[index]])}</p>` : ""}<p>${esc(question.explanations[question.answerIndex])}</p>${sourceHtml(question.source)}</div>` : ""}</fieldset>`).join("")}<div class="learning-actions">${!quiz.submittedAt ? button("submit", "提交作答并查看反馈") + (!quiz.helped ? button("help", "先看答案与讲解（辅助练习）") : "") : button("quiz", "换三道新题再练", `data-topic="${esc(quiz.topicId)}"`)}${button("plan", "安排下次复习", `data-topic="${esc(quiz.topicId)}"`)}</div>`;
    }
    function planHtml(state) {
      const topic = state.data.topics.find((item) => item.id === state.topicId);
      if (!topic) return "";
      return `<h3>${esc(topic.title)}</h3><p>${safe("复习资料并完成三道新题，预计 15 分钟。请选择你愿意安排的时间，确认后才会加入日程。")}</p><label>${safe("复习时间")}<input type="datetime-local" data-field="planTime" value="${esc(state.fields.planTime || "")}"></label><label>${safe("预计分钟")}<input type="number" min="5" max="120" data-field="minutes" value="${esc(state.fields.minutes || 15)}"></label><p>${safe("时区")}：${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>${button("save-plan", "确认加入日程")}`;
    }
    function bindHtml(state) {
      return `<p>${safe("选择课程资料，粘贴其中一小段原文作为定位依据。保存后可以根据这份资料练习。")}</p><label>${safe("课程资料")}<select data-field="bindDoc"><option value="">${safe("请选择资料")}</option>${state.data.documents.map((item) => `<option value="${esc(item.id)}" ${state.fields.bindDoc === item.id ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select></label><label>${safe("原文片段")}<textarea data-field="bindQuote" rows="4" maxlength="300">${esc(state.fields.bindQuote || "")}</textarea></label>${button("save-bind", "保存资料出处")}`;
    }
    function draw() {
      if (!panel || !model()) return;
      const state = model(), wasFocused = panel.contains(doc.activeElement), focusField = doc.activeElement?.dataset.field;
      const views = { topics: "学习清单", materials: "整理资料", history: "练习记录", quiz: "短测与反馈", source: "资料与讲解", plan: "安排复习", bind: "关联资料出处" };
      let body = !state.data ? `<p role="status">${safe(state.loadError || "正在读取学习记录…")}</p>${button("refresh", "重新读取")}` : "";
      if (state.data) {
        if (state.view === "topics") body = topicsHtml(state);
        if (state.view === "materials") body = materialsHtml(state);
        if (state.view === "quiz") body = quizHtml(state);
        if (state.view === "plan") body = planHtml(state);
        if (state.view === "bind") body = bindHtml(state);
        if (state.view === "source") body = `${(state.sources || []).map(sourceHtml).join("")}<p>${safe("可以让 AI 继续讲解，问题会先填入输入框，由你选择是否发送。")}</p>${button("lesson", "请 AI 讲解这个主题")}`;
        if (state.view === "history") body = `<p>${safe("最近 24 次练习；关闭页面后也可继续未提交的题目。")}</p>${state.data.recent.map((entry) => `<article class="learning-history"><b>${esc(entry.title)}</b><small>${esc(date(entry.createdAt))} · ${entry.submittedAt ? `${entry.score}/3${entry.helped ? ` · ${safe("看过提示后作答")}` : ""}` : safe("尚未提交")}</small>${button("resume", entry.submittedAt ? "查看反馈" : "继续作答", `data-id="${esc(entry.id)}"`)}</article>`).join("") || `<p>${safe("还没有作答记录，选一个主题开始吧。")}</p>`}`;
      }
      panel.innerHTML = `<header><div><small>StudyBridge</small><h2 id="learning-title">${safe(views[state.view] || "学习清单")}</h2></div>${button("close", "关闭")}</header><nav aria-label="${safe("学习入口")}">${["topics", "materials", "history"].map((view) => button(view, views[view], `aria-pressed="${state.view === view}"`)).join("")}</nav><div class="learning-body">${state.error ? `<p role="alert" class="learning-error">${safe(state.error)}</p>${button("refresh", "刷新学习记录")}` : ""}${state.notice ? `<p role="status">${safe(state.notice)}</p>` : ""}${body}</div><footer><label><input type="checkbox" data-learning="prompts" ${state.data?.prompts !== false ? "checked" : ""}>${safe("允许自动弹出学习建议")}</label><small>${safe("私人学习记录仅自己可见。每一步都可自主选择，也可以随时退出。")}</small><span role="status">${state.busy ? safe("正在处理，请稍候…") : ""}</span></footer>`;
      if (state.busy) panel.querySelectorAll("button:not([data-learning=close]), input, textarea, select").forEach((element) => { element.disabled = true; });
      if (wasFocused && focusField) panel.querySelector(`[data-field="${CSS.escape(focusField)}"]`)?.focus({ preventScroll: true });
    }
    function open() {
      closePrompt();
      const next = getContext();
      if (!next?.visible || !next.courseId) return;
      if (key(context) !== key(next) || !model()) { void sync().then(open); return; }
      if (panel) return;
      returnFocus = doc.activeElement;
      panel = doc.createElement("dialog"); panel.className = "learning-dialog"; panel.setAttribute("aria-labelledby", "learning-title");
      panel.addEventListener("click", (event) => { const button = event.target.closest("[data-learning]"); if (button && button.type !== "checkbox") void action(button); });
      panel.addEventListener("change", (event) => { capture(); if (event.target.dataset.learning === "prompts") void run("preferences", { prompts: event.target.checked }); });
      panel.addEventListener("input", capture);
      panel.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
      doc.body.append(panel); draw(); panel.showModal();
      if (model().data?.draft) { model().view = "materials"; draw(); }
      void load();
    }
    async function run(operation, body = {}) {
      const state = model(); if (!state || state.busy) return;
      capture(); loadSequence++; state.busy = true; state.error = ""; state.notice = ""; draw();
      const expected = key(context), courseId = context.courseId, seq = generation;
      try {
        const result = await request(endpoint(courseId, operation), { method: "POST", body });
        if (generation !== seq || !current(expected)) return;
        if (result.learning) state.data = result.learning;
        if (result.quiz) { if (state.quiz?.id !== result.quiz.id) state.answers = []; state.quiz = result.quiz; state.view = "quiz"; }
        if (operation === "topics" && body.action === "add") state.fields.newTitle = "";
        if (operation === "topics" && body.action === "confirm") state.view = "topics";
        if (operation === "plan") { state.notice = "已加入日程，点击日程中的开始复习可回到题目。"; state.view = "topics"; delete state.planRequest; }
        if (["quiz", "submit", "help"].includes(operation)) { const fresh = await request(endpoint(courseId)); if (generation === seq && current(expected)) state.data = fresh.learning; }
        if (["plan", "submit"].includes(operation)) await onScheduleChange?.();
      } catch (error) { if (generation === seq && key(context) === expected) state.error = error.message; }
      finally { state.busy = false; if (generation === seq && current(expected)) draw(); }
    }
    async function action(button) {
      const state = model(), action = button.dataset.learning; if (!state || button.disabled) return;
      capture();
      if (action === "close") { close(); return; }
      if (state.busy) return;
      if (["topics", "materials", "history"].includes(action)) { state.view = action; state.error = ""; state.notice = ""; draw(); return; }
      if (action === "refresh") { await load(); return; }
      if (action === "extract") { await run("extract", { version: state.data.version, documentIds: state.data.documents.filter((item) => state.selectedDocs[item.id]).map((item) => item.id) }); return; }
      if (action === "confirm") { await run("topics", { action: "confirm", version: state.data.version, draftId: state.data.draft.id, topics: state.data.draft.topics.filter((topic) => state.keep[topic.id] !== false).map((topic) => ({ id: topic.id, title: state.fields[`draft-${topic.id}`] ?? topic.title })) }); return; }
      if (action === "discard") { await run("topics", { action: "discard", version: state.data.version }); return; }
      if (action === "add") { await run("topics", { action: "add", version: state.data.version, title: state.fields.newTitle }); return; }
      if (action === "rename") { await run("topics", { action: "rename", version: state.data.version, topicId: button.dataset.topic, title: state.fields[`title-${button.dataset.topic}`] }); return; }
      if (action === "delete") { if (globalThis.confirm(t("删除这个学习主题？已保存的作答记录会保留。"))) await run("topics", { action: "delete", version: state.data.version, topicId: button.dataset.topic }); return; }
      if (action === "bind") { state.topicId = button.dataset.topic; state.view = "bind"; draw(); return; }
      if (action === "save-bind") { await run("topics", { action: "bind", version: state.data.version, topicId: state.topicId, documentId: state.fields.bindDoc, quote: state.fields.bindQuote }); if (!state.error) { state.view = "topics"; draw(); } return; }
      if (action === "quiz") {
        const topicId = button.dataset.topic;
        if (!state.quizRequest || state.quizRequest.topicId !== topicId) state.quizRequest = { topicId, requestId: crypto.randomUUID() };
        await run("quiz", { ...state.quizRequest, taskId: state.taskId || "" });
        if (!state.error) { state.quizRequest = null; state.taskId = ""; }
        return;
      }
      if (action === "submit") { await run("submit", { quizId: state.quiz.id, answers: Array.from({ length: 3 }, (_, index) => state.answers[index] ?? null) }); return; }
      if (action === "help") { await run("help", { quizId: state.quiz.id }); return; }
      if (action === "source" || action === "resume") {
        const topic = state.data.topics.find((item) => item.id === button.dataset.topic);
        if (action === "source" && topic && (!topic.sources.length || topic.sourceStale)) { state.topicId = topic.id; state.view = "bind"; draw(); return; }
        const expected = key(context), seq = generation; state.busy = true; state.error = ""; draw();
        try {
          const result = await request(endpoint(context.courseId, action === "source" ? `source?topicId=${encodeURIComponent(button.dataset.topic)}` : `quiz?id=${encodeURIComponent(button.dataset.id)}`));
          if (!current(expected, seq)) return;
          if (result.quiz) { if (state.quiz?.id !== result.quiz.id) state.answers = []; state.quiz = result.quiz; state.view = "quiz"; }
          else { state.sources = result.sources; state.topicId = button.dataset.topic; state.view = "source"; }
        } catch (error) { if (current(expected, seq)) state.error = error.message; }
        finally { state.busy = false; if (current(expected, seq)) draw(); }
        return;
      }
      if (action === "lesson") { const topic = state.data.topics.find((item) => item.id === state.topicId); close(); onStudy?.(topic, state.sources); return; }
      if (action === "plan") {
        state.topicId = button.dataset.topic; state.view = "plan";
        const topic = state.data.topics.find((item) => item.id === state.topicId);
        const suggested = new Date(Math.max(Date.parse(topic?.nextReviewAt) || 0, Date.now() + 86400000)); suggested.setHours(19, 0, 0, 0);
        const local = new Date(suggested.getTime() - suggested.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        state.fields.planTime = local; state.fields.minutes = "15"; state.planRequest = crypto.randomUUID(); draw(); return;
      }
      if (action === "save-plan") {
        state.planRequest ||= crypto.randomUUID();
        await run("plan", { requestId: state.planRequest, topicId: state.topicId, startsAt: state.fields.planTime, minutes: Number(state.fields.minutes), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      }
    }
    doc?.addEventListener("input", () => { lastInteraction = Date.now(); });
    ui.subscribe?.(() => { capture(); if (panel) draw(); closePrompt(); });
    return { sync, open, refresh: load, offer, close,
      async startTask(topicId, taskId) { await sync(); if (!current(key(context))) return; open(); const state = model(); if (!state) return; state.taskId = taskId; await action({ dataset: { learning: "quiz", topic: topicId }, disabled: false }); },
      reset() { generation++; close(); closePrompt(); lastVisible = false; context = null; owner = null; cache.clear(); sessionDismissals.clear(); } };
  }
  return { create, suggestion };
});
