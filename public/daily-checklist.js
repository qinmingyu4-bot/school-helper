(function (scope) {
  "use strict";
  const node = typeof module === "object" && module.exports;
  const schedule = node ? require("./schedule-import") : scope.StudyBridgeScheduleImport;
  const ui = node ? require("./i18n") : scope.StudyBridgeI18n;
  const e = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const t = (zh, en) => ui.getLanguage() === "en" ? en : zh;
  const isTask = item => Boolean(item.checklist || item.learningTopicId || schedule.kind(item.kind) === "DDL" && !/\b(exam|quiz|midterm|final|test)\b|考试|小测|测验|期中考|期末考/i.test(item.title));
  function validate(fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (key === "plannedDate" && (typeof value !== "string" || value !== "" && !schedule.validDate(value))) throw new Error(t("请选择有效的计划日期。", "Choose a valid planned date."));
      if (["goalTarget", "goalProgress"].includes(key) && (!Number.isSafeInteger(value) || value < 0 || value > 100000)) throw new Error(t("目标和进度须为 0–100000 的整数。", "Target and progress must be integers from 0 to 100000."));
      if (["checklist", "untimed", "completed"].includes(key) && typeof value !== "boolean") throw new Error("Invalid checklist flag.");
    }
    if (fields.goalTarget !== undefined && fields.goalProgress !== undefined && fields.goalProgress > fields.goalTarget) throw new Error(t("进度不能超过目标数量。", "Progress cannot exceed the target."));
  }
  function model(items, today = schedule.todayInZone(Intl.DateTimeFormat().resolvedOptions().timeZone), now = Date.now()) {
    const rows = items.map(item => ({ ...schedule.floating(item), ...schedule.completion(item, now) })).filter(item => item.startsAt);
    const tasks = rows.filter(isTask);
    const dueDay = item => item.startsAt.slice(0, 10);
    // A deadline remains visible on its due day even when planned for a different day.
    const current = tasks.filter(item => (item.plannedDate || dueDay(item)) === today || !item.checklist && dueDay(item) === today);
    const overdue = tasks.filter(item => !item.completedAt && !current.includes(item) && (item.plannedDate || dueDay(item)) < today);
    const events = rows.filter(item => !isTask(item) && dueDay(item) <= today && (item.endsAt || item.startsAt).slice(0, 10) >= today).sort((a,b) => a.startsAt.localeCompare(b.startsAt));
    return { today, tasks: current, overdue, events, done: current.filter(item => item.completedAt).length };
  }
  const target = item => `data-doc="${e(item.docId)}" data-course="${e(item.courseId)}"`;
  function entry(courseId = "") {
    return `<button type="button" class="daily-entry" data-action="daily-open" data-course="${e(courseId)}">${t("今日清单", "Today's checklist")}</button>`;
  }
  function row(item, m, courses, backlog = false) {
    const task = isTask(item), done = Boolean(item.completedAt);
    const course = courses.find(c => c.id === item.courseId && c.name !== "Schedule & Deadlines");
    const ended = !task && schedule.instant(item, item.endsAt ? "endsAt" : "startsAt") <= Date.now();
    return `<div class="daily-row ${done && task ? "is-done" : ""}">
      ${task ? `<button class="daily-check" data-action="daily-toggle" ${target(item)} role="checkbox" aria-checked="${done}" aria-label="${e(t("完成：", "Complete: ") + item.title)}">${done ? "✓" : ""}</button>` : `<time>${e(item.startsAt.slice(11))}${item.endsAt ? `–${e(item.endsAt.slice(11))}` : ""}</time>`}
      <div class="daily-main"><strong>${e(item.title)}</strong><div class="daily-meta">${course ? `<button data-action="select-course" data-id="${e(course.id)}">${e(course.name)}</button>` : e(item.course)}
      ${task && !item.untimed ? `<span>${e(item.startsAt.replace("T", " "))} ${t(schedule.kind(item.kind) === "DDL" ? "截止" : "安排", schedule.kind(item.kind) === "DDL" ? "due" : "scheduled")}</span>` : ""}${item.location ? `<span>${e(item.location)}</span>` : ""}${ended ? `<span>${t("已结束", "Ended")}</span>` : ""}</div>
      ${item.goalTarget ? `<div class="daily-progress"><label>${t("进度", "Progress")} <input type="number" min="0" max="${item.goalTarget}" value="${item.goalProgress || 0}" aria-label="${e(t("进度：", "Progress: ") + item.title)}"> / ${item.goalTarget}</label><button data-action="daily-progress" ${target(item)}>${t("保存", "Save")}</button></div>` : ""}
      ${item.notes ? `<details><summary>${t("备注", "Notes")}</summary><p>${e(item.notes)}</p></details>` : ""}
      ${item.learningTopicId ? `<button data-action="learning-start" data-topic="${e(item.learningTopicId)}" ${target(item)}>${t("开始复习", "Start review")}</button>` : ""}
      </div><div class="daily-actions">${task ? `<details><summary>${t("安排日期", "Plan date")}</summary><label>${t("计划完成", "Planned for")}<input type="date" value="${e(item.plannedDate || m.today)}" min="2000-01-01" max="2200-12-31"></label><button data-action="daily-plan" ${target(item)}>${t("保存", "Save")}</button>${backlog ? `<button data-action="daily-today" ${target(item)}>${t("移到今天", "Move to today")}</button>` : ""}</details>` : ""}<button data-action="edit-schedule" ${target(item)}>${t("编辑", "Edit")}</button><button data-action="delete-schedule" ${target(item)}>${t("删除", "Delete")}</button></div></div>`;
  }
  function render(items, courses) {
    const m = model(items), pending = m.tasks.filter(i => !i.completedAt), done = m.tasks.filter(i => i.completedAt);
    const available = items.filter(i => isTask(i) && !i.completedAt && !m.tasks.some(r => r.docId === i.docId));
    return `<section class="daily-checklist" id="dailyChecklist" data-day="${m.today}"><header><div><h2>${t("今天", "Today")} <small>${m.today}</small></h2><p>${m.done} / ${m.tasks.length} ${t("任务已完成", "tasks completed")} · ${m.events.length} ${t("项安排", "events")}</p></div><button data-action="daily-refresh">${t("刷新", "Refresh")}</button></header>
      <details class="daily-add"><summary>＋ ${t("添加目标 / 从日程选择", "Add a goal / choose from schedule")}</summary><div class="daily-add-fields"><label>${t("要完成什么", "What to do")}<input id="dailyTitle" maxlength="160" placeholder="${t("例如：复习第 3 章", "e.g. Review chapter 3")}"></label><label>${t("关联课程", "Course")}<select id="dailyCourse"><option value="">${t("个人目标", "Personal goal")}</option>${courses.filter(c => c.name !== "Schedule & Deadlines").map(c => `<option value="${e(c.id)}">${e(c.name)}</option>`).join("")}</select></label><label>${t("目标数量（选填）", "Target quantity (optional)")}<input id="dailyTarget" type="number" min="1" max="100000"></label><button data-action="daily-add">${t("添加到今天", "Add to today")}</button></div>
      <div class="daily-existing"><label>${t("所有课程中的待办", "Tasks across all courses")}<select id="dailyExisting"><option value="">${t("选择已有任务", "Choose an existing task")}</option>${available.map(i => `<option value="${e(i.docId)}">${e([i.course, i.title, schedule.floating(i).startsAt.slice(0,10)].filter(Boolean).join(" · "))}</option>`).join("")}</select></label><button data-action="daily-existing">${t("加入今日清单", "Add to today")}</button></div></details>
      <h3>${t("要完成的", "To do")}</h3>${pending.map(i => row(i,m,courses)).join("") || `<p class="daily-empty">${t("今天的任务已清空，可以添加一个学习目标。", "Nothing pending today. Add a learning goal when ready.")}</p>`}
      ${done.length ? `<details class="daily-completed"><summary>${t("已完成", "Completed")} (${done.length})</summary>${done.map(i => row(i,m,courses)).join("")}</details>` : ""}
      <h3>${t("要参加的", "Events")}</h3>${m.events.map(i => row(i,m,courses)).join("") || `<p class="daily-empty">${t("今天没有已安排的活动。", "No events scheduled today.")}</p>`}
      ${m.overdue.length ? `<details class="daily-backlog"><summary>${t("之前未完成，待安排", "Earlier unfinished tasks")} (${m.overdue.length})</summary>${m.overdue.map(i => row(i,m,courses,true)).join("")}</details>` : ""}
      <p class="daily-footnote">${t("与所有课程及日程同步。计划日期不会改变作业截止时间。", "Synced with all courses and the schedule. Planning does not change deadlines.")}</p></section>`;
  }
  async function handle(button, { state, api, reload, renderPage, open, isCurrent }) {
    const action = button.dataset.action;
    if (action === "daily-open") {
      const courseId = button.dataset.course;
      await open();
      const select = document.getElementById("dailyCourse");
      if (state.page === "schedule" && state.dailyView === "today") {
        if (select && [...select.options].some(option => option.value === courseId)) select.value = courseId;
        document.querySelector('[data-action="daily-back"]')?.focus();
      }
      return;
    }
    if (action === "daily-refresh") { await reload(isCurrent); if (isCurrent()) renderPage(); return; }
    const item = state.scheduleItems.find(i => i.docId === (action === "daily-existing" ? document.getElementById("dailyExisting").value : button.dataset.doc) && (action === "daily-existing" || i.courseId === button.dataset.course));
    const today = model([]).today;
    let body, endpoint = "/api/schedule/manage";
    if (action === "daily-add") {
      const title = document.getElementById("dailyTitle").value.trim(), courseId = document.getElementById("dailyCourse").value;
      const targetValue = document.getElementById("dailyTarget").value, goalTarget = targetValue ? Number(targetValue) : 0;
      if (!title) throw new Error(t("请填写目标。", "Enter a goal."));
      validate({ goalTarget });
      const course = state.courses.find(c => c.id === courseId);
      endpoint = "/api/schedule/import";
      body = { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, source: "daily-checklist", items: [{ title, kind: "EVENT", startsAt: `${today}T23:59`, courseId, course: course?.name || "", checklist: true, untimed: true, plannedDate: today, goalTarget, goalProgress: 0 }] };
    } else {
      if (!item) throw new Error(t("请选择一个任务，或刷新后重试。", "Choose a task, or refresh and try again."));
      const patch = action === "daily-toggle" ? { completed: !item.completedAt } : action === "daily-progress" ? { goalProgress: Number(button.closest(".daily-row").querySelector('input[type="number"]').value) } : { plannedDate: action === "daily-plan" ? button.closest("details").querySelector('input[type="date"]').value : today };
      if (action === "daily-plan" && !patch.plannedDate) throw new Error(t("请选择日期。", "Choose a date."));
      validate({ goalTarget: item.goalTarget || 0, ...patch });
      body = { operation: "edit", items: [{ courseId: item.courseId, docId: item.docId }], patch };
    }
    button.disabled = true;
    try {
      const result = await api(endpoint, { method: "POST", body });
      if (action === "daily-add" && !result.saved && result.duplicates) {
        throw new Error(t("这个目标已经在日程里。", "This goal is already in your schedule."));
      }
      if (isCurrent()) {
        await reload(isCurrent);
        if (isCurrent()) renderPage();
      }
    }
    finally { button.disabled = false; }
  }
  const api = { model, isTask, validate, entry, render, handle };
  if (node) module.exports = api; else scope.StudyBridgeDailyChecklist = api;
})(typeof window !== "undefined" ? window : globalThis);
