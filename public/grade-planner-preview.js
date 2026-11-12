(function () {
  "use strict";
  const G = window.StudyBridgeGrades;
  const root = document.getElementById("grade-app");
  const dialog = document.getElementById("grade-dialog");
  const dataKey = "studybridge.grade-planner.preview.v1";
  const uiKey = `${dataKey}.appearance`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const id = () => crypto.randomUUID();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const number = (value) => value === "" || value === null ? null : Number(value);
  const fmt = (value, digits = 1) => value === null || !Number.isFinite(value) ? "—" : (Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits).toFixed(digits);
  const norm = (value) => String(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const paths = {
    book: '<path d="M12 7v14M3 3h3a6 6 0 0 1 6 3 6 6 0 0 1 6-3h3v16h-3a6 6 0 0 0-6 2 6 6 0 0 0-6-2H3z"/>',
    grades: '<path d="M4 20h16M7 16v-5M12 16V5M17 16V8"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-5 4V5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2zM7 7h10M7 11h6"/>',
    people: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 4a4 4 0 0 1 0 7M21 21v-2a6 6 0 0 0-3-5"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7M17 14v7"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    link: '<path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    file: '<path d="M14 2H5v20h14V7zm0 0v5h5M8 12h8M8 16h6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>'
  };
  const icon = (name) => `<span class="gp-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[name] || paths.file}</svg></span>`;
  let appearance = { palette: "celadon", mode: "light", language: "zh" };
  try { appearance = { ...appearance, ...JSON.parse(localStorage.getItem(uiKey) || "{}") }; } catch { /* Default appearance. */ }
  const t = (zh, en) => appearance.language === "en" ? en : zh;
  const items = (prefix, count, max, scores = []) => Array.from({ length: count }, (_, i) => ({ id: id(), name: `${prefix} ${i + 1}`, max, score: scores[i] ?? null, status: scores[i] === undefined ? "pending" : "graded" }));
  const category = (name, weight, count, max, scores, method = "equal") => ({ id: id(), name, weight, method, plannedCount: count, items: items(name, count, max, scores), specialRule: "", evidence: "" });
  function examples() {
    return [
      { id: id(), code: "MAT137", name: "Calculus with Proofs", term: "Fall 2026", source: "MAT137 · 示例 syllabus", categories: [category("Homework", 20, 10, 20, [18, 16, 19, 18]), category("Quiz", 10, 5, 10, [8, 9]), { ...category("Midterm", 25, 1, 100, [82]), items: [{ id: id(), name: "Midterm exam", score: 82, max: 100, status: "graded" }] }, { ...category("Final", 45, 1, 100, []), items: [{ id: id(), name: "Final exam", score: null, max: 100, status: "pending" }] }] },
      { id: id(), code: "STA220", name: "The Practice of Statistics", term: "Fall 2026", source: "STA220 · 示例 syllabus", categories: [category("Assignment", 30, 4, 25, [22, 20], "points"), category("Midterm", 30, 1, 100, [76]), category("Final", 40, 1, 100, [])] },
      { id: id(), code: "ECO101", name: "Principles of Microeconomics", term: "Fall 2026", source: "", categories: [] }
    ];
  }
  let courses;
  try {
    const saved = JSON.parse(localStorage.getItem(dataKey) || "null");
    if (saved?.version !== 1 || !Array.isArray(saved.courses) || !saved.courses.length || saved.courses.length > 30) throw new Error("Invalid preview state");
    for (const course of saved.courses) {
      if (typeof course.id !== "string" || !Array.isArray(course.categories) || course.categories.length > 30) throw new Error("Invalid course");
      for (const c of course.categories) if (typeof c.id !== "string" || !Array.isArray(c.items) || c.items.length > 100 || c.items.some((item) => typeof item.id !== "string" || !G.validateGrade(item.score, item.max, item.status))) throw new Error("Invalid grade");
    }
    courses = saved.courses;
  } catch { courses = examples(); }
  const state = { courseId: courses[0].id, tab: "records", pendingOnly: false, expanded: new Set(courses[0].categories.slice(0, 2).map((c) => c.id)), driver: "assessment", focus: "", exam: 80, goal: 85, assumptions: {}, saveError: false };
  let modal = null;
  let capabilities = { configured: false, syllabusConfigured: false, provider: null, ready: false };
  let toastTimer;
  const course = () => courses.find((c) => c.id === state.courseId);
  function toast(message) {
    clearTimeout(toastTimer);
    const el = document.getElementById("grade-toast");
    el.textContent = message;
    el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }
  function persist() {
    try { localStorage.setItem(dataKey, JSON.stringify({ version: 1, courses })); state.saveError = false; return true; }
    catch { state.saveError = true; toast(t("浏览器未能保存，请保留当前页面；更改暂留在此页面中。", "Browser storage is unavailable. Changes remain in this page only.")); return false; }
  }
  function setAppearance() {
    if (appearance.palette === "default") delete document.documentElement.dataset.sbTheme;
    else document.documentElement.dataset.sbTheme = appearance.palette;
    if (appearance.mode === "dark") document.documentElement.dataset.sbMode = "dark";
    else delete document.documentElement.dataset.sbMode;
    document.documentElement.lang = appearance.language === "en" ? "en" : "zh-CN";
    try { localStorage.setItem(uiKey, JSON.stringify(appearance)); } catch { /* Appearance is still usable. */ }
  }
  function chooseCourse(courseId) {
    state.courseId = courseId;
    state.expanded = new Set(course().categories.slice(0, 2).map((c) => c.id));
    state.focus = "";
    state.assumptions = {};
    render();
  }
  function sidebar() {
    const nav = [["chat", t("社区", "Community")], ["people", t("同学", "Classmates")], ["calendar", t("日程", "Schedule")], ["book", t("学习", "Study")], ["grades", t("成绩", "Grades")], ["grid", t("工具", "Tools")], ["mail", t("邮箱助手", "Email assistant")]];
    const palettes = [["default", "默认", "Default"], ["celadon", "青瓷", "Celadon"], ["monochrome", "黑白", "Monochrome"], ["graphite", "石墨", "Graphite"], ["mist-blue", "雾蓝", "Mist blue"], ["smoke-purple", "烟紫", "Smoke purple"], ["dusty-rose", "浅玫瑰", "Dusty rose"], ["silver", "银灰", "Silver"]];
    return `<aside class="gp-sidebar"><div class="gp-brand"><img src="/brand/icon-monochrome.svg" alt=""><div><strong>StudyBridge</strong><small>${t("你的学习，慢慢有数", "A clearer view of your learning")}</small></div></div><nav class="gp-side-nav" aria-label="${t("主导航预览", "Navigation preview")}">${nav.map(([key, text]) => `<span class="gp-nav-row" ${key === "grades" ? 'aria-current="page"' : ""}>${icon(key)}${text}</span>`).join("")}</nav><div class="gp-side-section"><p class="gp-eyebrow">${t("本学期课程", "This semester")}</p><div class="gp-side-courses">${courses.map((c) => `<button class="gp-side-course" data-course="${esc(c.id)}" ${c.id === state.courseId ? 'aria-current="true"' : ""}><span>${esc(c.code)}</span><small>${esc(c.name)}</small></button>`).join("")}</div></div><div class="gp-sidebar-footer"><label class="gp-palette-field"><span>${t("配色", "Palette")}</span><select data-appearance="palette" aria-label="${t("界面配色", "Interface palette")}">${palettes.map(([value, zh, en]) => `<option value="${value}" ${value === appearance.palette ? "selected" : ""}>${t(zh, en)}</option>`).join("")}</select></label><label><span>${t("外观", "Mode")}</span><select data-appearance="mode" aria-label="${t("外观模式", "Appearance")}"><option value="light" ${appearance.mode === "light" ? "selected" : ""}>${t("浅色", "Light")}</option><option value="dark" ${appearance.mode === "dark" ? "selected" : ""}>${t("深色", "Dark")}</option></select></label><label><span>${t("语言", "Language")}</span><select data-appearance="language" aria-label="${t("界面语言", "Language")}"><option value="zh" ${appearance.language !== "en" ? "selected" : ""}>简体中文</option><option value="en" ${appearance.language === "en" ? "selected" : ""}>English</option></select></label><p>${t("本地预览 · 使用示例课程<br>成绩仅保存在此浏览器", "Local preview · Sample courses<br>Grades stay in this browser")}</p></div></aside>`;
  }
  function stats(summary) {
    return `<div class="gp-stat"><span class="gp-stat-label">${t("已评分部分均分", "Graded average")}</span><strong class="gp-stat-value">${fmt(summary.average)}<small>%</small></strong><span class="gp-stat-caption">${summary.known ? t(`已出分项目占 ${fmt(summary.gradedWeight, 0)}%`, `${fmt(summary.gradedWeight, 0)}% of course graded`) : t("确认完整评分规则后计算", "Complete the grading rules first")}</span></div><div class="gp-stat"><span class="gp-stat-label">${t("已计入总评", "Earned toward final")}</span><strong class="gp-stat-value">${fmt(summary.earned)}<small>/ 100</small></strong><span class="gp-stat-caption">${t("仅计入真实、已出分的成绩", "Based on recorded grades only")}</span></div><div class="gp-stat"><span class="gp-stat-label">${t("尚未出分占比", "Still to be graded")}</span><strong class="gp-stat-value">${fmt(summary.remaining, 0)}<small>%</small></strong><span class="gp-stat-caption">${summary.known ? t(`还有 ${summary.pending.length} 个项目`, `${summary.pending.length} assessments remaining`) : t("不会把未出分当作零分", "Pending grades are not zeroes")}</span></div>`;
  }
  const statusLabel = (item) => item.status === "excluded" ? t("免计", "Excluded") : G.isGraded(item) ? t("已出分", "Graded") : t("未出分", "Pending");
  function records(summary) {
    return `<div class="gp-record-toolbar"><span data-save-status>${state.saveError ? t("本地保存失败", "Local save failed") : t("修改后自动保存到本机", "Edits save automatically in this browser")}</span><label><input type="checkbox" id="pending-only" ${state.pendingOnly ? "checked" : ""}>${t("只看未出分", "Pending only")}</label></div>${summary.categories.map((s) => {
      const c = s.category;
      const visible = c.items.filter((item) => !state.pendingOnly || item.status === "pending");
      return `<details class="gp-category" data-category="${esc(c.id)}" ${state.expanded.has(c.id) ? "open" : ""}><summary><div class="gp-category-title"><span class="gp-chevron">${icon("chevron")}</span><strong>${esc(c.name)}</strong><small>${fmt(c.weight, 0)}%</small></div><span class="gp-category-progress" data-category-progress="${esc(c.id)}">${t(`已出分 ${s.graded} / ${s.active}`, `${s.graded} / ${s.active} graded`)}</span><span class="gp-category-average"><span data-category-average="${esc(c.id)}">${fmt(s.average)}</span><small>${t("当前类别均分", "Category average")}</small></span></summary><div class="gp-category-inner"><div class="gp-rule-caption"><span>${c.method === "points" ? t("按总得分 / 总满分汇总", "Weighted by available points") : c.method === "equal" ? t("每次等权，按百分比汇总", "Equal weight per assessment") : t("计算方式待补充", "Weighting method to be added")}</span><span>${s.known ? t(`本类已计入总评 ${fmt(s.earned)} 分`, `${fmt(s.earned)} points earned toward final`) : t("本类规则待完善", "Rules need completion")}</span></div>${visible.length ? `<div class="gp-grade-head"><span>${t("项目", "Assessment")}</span><span>${t("得分 / 满分", "Score / Max")}</span><span class="gp-state-heading">${t("状态", "Status")}</span><span></span></div>${visible.map((item) => `<div class="gp-grade-row" data-item="${esc(item.id)}"><div class="gp-grade-name"><span>${esc(item.name)}</span><small data-row-caption class="${item.source ? "is-source" : ""}">${item.source === "sample" ? t("示例确认录入", "Confirmed sample") : item.source ? t("截图确认录入", "Confirmed from screenshot") : statusLabel(item)}</small></div><div class="gp-score-field"><input type="number" min="0" step="any" data-score="score" aria-label="${esc(item.name)} ${t("得分", "score")}" value="${item.score ?? ""}" placeholder="—" ${item.status === "excluded" ? "disabled" : ""}><span>/</span><input type="number" min="0.000001" step="any" data-score="max" aria-label="${esc(item.name)} ${t("满分", "maximum")}" value="${item.max ?? ""}" placeholder="—" ${item.status === "excluded" ? "disabled" : ""}></div><span class="gp-status ${G.isGraded(item) ? "graded" : ""}" data-row-status>${statusLabel(item)}</span><button class="gp-row-menu" data-edit="${esc(item.id)}" aria-label="${t("编辑", "Edit")} ${esc(item.name)}">${icon("edit")}</button></div>`).join("")}` : `<p class="gp-note">${t("这一类暂无未出分项目。", "No pending assessments in this category.")}</p>`}<button class="gp-text gp-add-item" data-add="${esc(c.id)}">${icon("plus")}${t("添加项目", "Add assessment")}</button></div></details>`;
    }).join("")}<p class="gp-note">${t("空白代表未出分，输入 0 才会计为零分。类别权重按照完整项目安排分配，模拟成绩不会写入这里。", "Blank means pending; an entered 0 counts as zero. Category weights use the complete assessment plan. Simulated scores never alter these records.")}</p>`;
  }
  function picker(kind, selected, options, label) {
    return `<details class="gp-picker gp-picker-${kind}" data-picker="${kind}"><summary role="button" aria-label="${esc(label)}"><span>${esc(selected)}</span>${icon("down")}</summary><div class="gp-picker-menu" role="group" aria-label="${esc(label)}">${options.map((option) => `<button type="button" aria-label="${esc(option.label)}${option.detail ? ` · ${esc(option.detail)}` : ""}" data-${kind === "course" ? "course" : "focus"}="${esc(option.id)}" ${option.selected ? 'aria-current="true"' : ""}><span><strong>${esc(option.label)}</strong>${option.detail ? `<small>${esc(option.detail)}</small>` : ""}</span>${option.selected ? icon("check") : ""}</button>`).join("")}</div></details>`;
  }
  function coursePicker() {
    return picker("course", course().code, courses.map((c) => ({ id:c.id, label:c.code, detail:c.name, selected:c.id === state.courseId })), t("选择课程", "Choose course"));
  }
  function focusPicker(summary) {
    const options = [{ id:"all", label:t("剩余项目均分", "All remaining assessments"), detail:t(`占总评 ${fmt(summary.remaining)}%`, `${fmt(summary.remaining)}% of final grade`), selected:state.focus === "all" }, ...summary.pending.filter((item) => item.weight > 0).map((item) => ({ id:item.id, label:item.name, detail:t(`占总评 ${fmt(item.weight)}%`, `${fmt(item.weight)}% of final grade`), selected:item.id === state.focus }))];
    return picker("focus", options.find((option) => option.selected)?.label || "", options, t("选择预测项目", "Choose assessment"));
  }
  function prediction(summary) {
    if (!summary.known) return `<div class="gp-notice">${t("请先完善评分规则，再进行目标预测。未知的权重和特殊计分规则不会被自动猜测。", "Complete the grading rules before forecasting. Unknown weights and special rules are never guessed.")}</div>`;
    if (!summary.pending.length) return `<div class="gp-empty">${icon("grades")}<h2>${t("这门课已全部出分", "All grades are recorded")}</h2><p>${t(`最终总评为 ${fmt(summary.earned)} 分。修改真实成绩后，这里会同步更新。`, `The final grade is ${fmt(summary.earned)}. It updates when a recorded grade changes.`)}</p></div>`;
    if (!summary.pending.some((item) => item.id === state.focus && item.weight > 0) && state.focus !== "all") state.focus = summary.pending.find((item) => /final|期末/i.test(item.name) && item.weight > 0)?.id || "all";
    const focus = summary.pending.find((item) => item.id === state.focus);
    const others = state.focus === "all" ? [] : summary.categories.filter((s) => summary.pending.some((item) => item.categoryId === s.category.id && item.id !== state.focus));
    return `<div class="gp-prediction"><div class="gp-planner-intro"><p>${t("拖动任意一侧，另一侧随之更新。", "Move either slider. The other follows.")}</p><span>${t("仅模拟，不更改已录入成绩", "A simulation, separate from your grades")}</span></div><div class="gp-linked-planner" aria-label="${t("成绩与总评联动预测", "Linked assessment and final grade planner")}"><section class="gp-linked-side"><div class="gp-linked-label">${focusPicker(summary)}<span class="gp-focus-weight">${t(`占总评 ${fmt(focus?.weight ?? summary.remaining)}%`, `${fmt(focus?.weight ?? summary.remaining)}% of final grade`)}</span></div><div class="gp-linked-number"><input id="assessment-number" type="number" min="0" max="100" step="any" inputmode="decimal" aria-label="${t("项目成绩", "Assessment score")}" aria-describedby="linked-result" value="${fmt(Math.min(100, state.exam))}"><span>%</span><small id="assessment-hint"></small></div><input class="gp-range" id="assessment-slider" type="range" min="0" max="100" step="0.1" value="${Math.min(100, state.exam)}" aria-label="${t("项目成绩滑条", "Assessment score slider")}" aria-describedby="linked-result"><div class="gp-range-scale"><span>0</span><span>100</span></div></section><div class="gp-linked-connector" aria-hidden="true">${icon("link")}</div><section class="gp-linked-side"><div class="gp-linked-label"><label for="total-number">${t("最终总评", "Final grade")}</label><span id="total-caption">${t("课程总成绩", "Course total")}</span></div><div class="gp-linked-number"><input id="total-number" type="number" min="0" max="100" step="any" inputmode="decimal" aria-label="${t("最终总评", "Final grade")}" aria-describedby="linked-result" value="${fmt(state.goal)}"><span>/ 100</span></div><input class="gp-range" id="total-slider" type="range" min="0" max="100" step="0.1" value="${state.goal}" aria-label="${t("最终总评滑条", "Final grade slider")}" aria-describedby="linked-result"><div class="gp-range-scale"><span>0</span><span>100</span></div></section></div><div class="gp-linked-result" id="linked-result" role="status" aria-live="polite"></div>${others.length ? `<details class="gp-other-assumptions"><summary><span>${t("其他未出分项目", "Other pending assessments")}</span><span id="assumption-summary"></span><span class="gp-adjust-label">${t("调整", "Adjust")}${icon("down")}</span></summary><div class="gp-assumption-fields">${others.map(({category:c}) => `<label><span>${esc(c.name)}</span><span><input class="gp-assumption-number" type="number" min="0" max="100" step="any" data-assumption="${esc(c.id)}" aria-label="${esc(c.name)} ${t("预测百分比", "assumed percentage")}" value="${state.assumptions[c.id] ?? 85}"><small>%</small></span></label>`).join("")}</div></details>` : ""}<p class="gp-simulation-note">${t("按已确认的评分规则计算，未包含额外调分。", "Based on confirmed grading rules, without additional curves.")}</p></div>`;
  }
  function projection(activeId) {
    const summary = G.summarize(course());
    const result = document.getElementById("linked-result");
    if (!result) return;
    const linked = G.linkedForecast(course(), { driver:state.driver, score:state.exam, goal:state.goal, assumptions:state.assumptions, focus:state.focus });
    if (!linked) return;
    state.exam = linked.score;
    state.goal = linked.total;
    const displayScore = state.driver === "total" ? Math.ceil((linked.score - 1e-8) * 10) / 10 : linked.score;
    const display = { "assessment-number":fmt(displayScore), "assessment-slider":Math.min(100,displayScore), "total-number":fmt(linked.total), "total-slider":linked.total };
    for (const [key,value] of Object.entries(display)) {
      const input = document.getElementById(key);
      if (key !== activeId) { input.value = value; input.removeAttribute("aria-invalid"); }
      input.style.setProperty("--range-progress", `${Math.min(100,Math.max(0,Number(input.value)))}%`);
      if (key.endsWith("-number")) input.style.width = `${Math.max(2.5,input.value.length - .2)}ch`;
    }
    document.getElementById("assessment-hint").textContent = linked.status === "unreachable" ? t("超过满分", "Above full marks") : state.driver === "total" ? t("至少需要", "Needed") : "";
    document.getElementById("total-caption").textContent = state.driver === "total" ? t("你的目标", "Your target") : t("随成绩实时更新", "Updates with your score");
    result.classList.toggle("is-unreachable", linked.status === "unreachable");
    const focus = summary.pending.find((item) => item.id === state.focus);
    const label = focus?.name || t("剩余项目均分", "Remaining average");
    if (linked.status === "unreachable") {
      result.innerHTML = `<span class="gp-result-marker"></span><p>${t(`目标暂时无法达到：${esc(label)} 需要 ${fmt(displayScore)}%，超过满分。`, `This target is out of reach: ${esc(label)} would need ${fmt(displayScore)}%, above full marks.`)}<small>${t(`按其余项目的当前假设，满分时总评最高 ${fmt(linked.maximum)}。`, `With the other assumptions unchanged, full marks yield at most ${fmt(linked.maximum)}.`)}</small></p>`;
    } else if (state.driver === "total" && linked.status === "achieved" && linked.actual > linked.total + .000001) {
      result.innerHTML = `<span class="gp-result-marker"></span><p>${t(`这个目标已满足：${esc(label)} 为 0% 时，总评也有 ${fmt(linked.actual)}。`, `This target is already covered: even 0% in ${esc(label)} gives a final grade of ${fmt(linked.actual)}.`)}<small>${t("其他未出分项目仍按下方假设计算。", "Other pending assessments still use the assumptions below.")}</small></p>`;
    } else {
      result.innerHTML = `<span class="gp-result-marker"></span><p>${esc(label)} <strong>${fmt(displayScore)}%</strong><span class="gp-result-arrow">→</span>${t("总评", "Final grade")} <strong>${fmt(linked.total)}</strong>${focus?.max && state.driver === "total" ? `<small>${t(`相当于至少 ${fmt(Math.ceil((linked.score / 100 * focus.max - 1e-8) * 100) / 100,2)} / ${focus.max} 分`, `At least ${fmt(Math.ceil((linked.score / 100 * focus.max - 1e-8) * 100) / 100,2)} / ${focus.max} points`)}</small>` : ""}</p>`;
    }
    const assumptionSummary = document.getElementById("assumption-summary");
    if (assumptionSummary) {
      const ids = [...new Set(summary.pending.filter((item) => item.id !== state.focus).map((item) => item.categoryId))];
      const scores = ids.map((id) => state.assumptions[id] ?? 85);
      assumptionSummary.textContent = new Set(scores).size === 1 ? t(`按 ${fmt(scores[0])}% 计算`, `Assumed at ${fmt(scores[0])}%`) : t("按各类设定计算", "Using category assumptions");
    }
  }
  function render() {
    const c = course();
    const summary = G.summarize(c);
    root.innerHTML = `<div class="gp-shell">${sidebar()}<main class="gp-main"><header class="gp-page-header"><div><p class="gp-eyebrow">GRADE PLANNER</p><h1>${t("成绩规划", "Grade planner")}</h1></div><span class="gp-preview-label">${t("本地功能预览", "Local preview")}</span></header><div class="gp-content"><div class="gp-course-bar"><div><div class="gp-course-title">${coursePicker()}</div><p class="gp-course-description">${esc(c.name)} · ${esc(c.term)}</p></div><div class="gp-actions"><button data-action="rules">${icon("file")}${t("评分规则", "Grading rules")}</button><button class="gp-primary" data-action="screenshot" ${!c.categories.length ? "disabled" : ""}>${icon("upload")}${t("上传成绩截图", "Upload grade screenshot")}</button></div></div>${!c.categories.length ? `<div class="gp-empty">${icon("file")}<h2>${t("先认识这门课的评分方式", "Start with the grading breakdown")}</h2><p>${t("上传 syllabus，确认各类成绩占比和项目安排。之后，每一次作业和 Quiz 都有自己的位置。", "Upload a syllabus and confirm the categories, weights and assessment plan. Each assignment and quiz will then have its own record.")}</p><div class="gp-actions"><button class="gp-primary" data-action="syllabus">${t("上传 syllabus", "Upload syllabus")}</button><button data-action="rules">${t("手动设置", "Set up manually")}</button></div><button class="gp-text" data-action="sample-syllabus">${t("先用示例体验提取确认流程", "Try the sample syllabus review")}</button></div>` : `<div id="grade-stats" class="gp-stat-strip" aria-live="polite">${stats(summary)}</div><div class="gp-weight-track" role="img" aria-label="${t("各类别占总评比例", "Category weights")}">${c.categories.map((category) => `<span style="flex:${category.weight}"></span>`).join("")}</div><div class="gp-weight-labels">${c.categories.map((category) => `<span>${esc(category.name)} ${fmt(category.weight, 0)}%</span>`).join("")}</div>${!summary.known ? `<div class="gp-notice">${t("评分规则尚不完整，累计分数和预测暂不计算。请在评分规则中核对总占比、项目数量、满分或特殊规则。", "Rules are incomplete, so accumulated grades and forecasts are paused. Check total weights, assessment counts, maximum scores and special rules.")}</div>` : ""}<div class="gp-tabs" role="tablist" aria-label="${t("成绩视图", "Grade views")}"><button class="gp-tab" role="tab" id="records-tab" aria-controls="grade-panel" aria-selected="${state.tab === "records"}" data-tab="records">${t("成绩记录", "Grade records")}</button><button class="gp-tab" role="tab" id="prediction-tab" aria-controls="grade-panel" aria-selected="${state.tab === "prediction"}" data-tab="prediction">${t("目标预测", "What-if planner")}</button></div><section id="grade-panel" role="tabpanel" aria-labelledby="${state.tab === "records" ? "records-tab" : "prediction-tab"}">${state.tab === "records" ? records(summary) : prediction(summary)}</section>`}</div></main></div>`;
    projection();
  }
  function refreshRecords(row) {
    const s = G.summarize(course());
    document.getElementById("grade-stats").innerHTML = stats(s);
    for (const summary of s.categories) {
      const average = root.querySelector(`[data-category-average="${summary.category.id}"]`);
      if (average) average.textContent = fmt(summary.average);
      const progress = root.querySelector(`[data-category-progress="${summary.category.id}"]`);
      if (progress) progress.textContent = t(`已出分 ${summary.graded} / ${summary.active}`, `${summary.graded} / ${summary.active} graded`);
      const caption = root.querySelector(`[data-category="${summary.category.id}"] .gp-rule-caption span:last-child`);
      if (caption) caption.textContent = summary.known ? t(`本类已计入总评 ${fmt(summary.earned)} 分`, `${fmt(summary.earned)} points earned toward final`) : t("本类规则待完善", "Rules need completion");
    }
    if (row) {
      const item = course().categories.flatMap((c) => c.items).find((item) => item.id === row.dataset.item);
      const label = row.querySelector("[data-row-status]");
      label.textContent = statusLabel(item);
      label.classList.toggle("graded", G.isGraded(item));
      row.querySelector("[data-row-caption]").textContent = statusLabel(item);
      row.querySelector("[data-row-caption]").classList.remove("is-source");
      row.hidden = state.pendingOnly && item.status !== "pending";
    }
    const save = root.querySelector("[data-save-status]");
    if (save) save.textContent = state.saveError ? t("本地保存失败", "Local save failed") : t("已保存到本机", "Saved in this browser");
  }
  function commitScoreInput(el, notify = false) {
    const row = el.closest("[data-item]");
    const item = course().categories.flatMap((c) => c.items).find((item) => item.id === row.dataset.item);
    const score = number(row.querySelector('[data-score="score"]').value);
    const max = number(row.querySelector('[data-score="max"]').value);
    const status = score === null ? "pending" : "graded";
    if (!G.validateGrade(score, max, status)) {
      el.setAttribute("aria-invalid", "true");
      if (notify) toast(t("请检查得分和满分：满分须大于 0，得分须在 0 与满分之间。", "Maximum must be positive, and score must be between 0 and maximum."));
      return;
    }
    row.querySelectorAll("input").forEach((input) => input.removeAttribute("aria-invalid"));
    Object.assign(item, { score, max, status, source: "" });
    persist(); refreshRecords(row);
  }
  root.addEventListener("toggle", (event) => {
    const c = event.target.dataset.category;
    if (c) event.target.open ? state.expanded.add(c) : state.expanded.delete(c);
  }, true);
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.course) { const fromPicker = Boolean(button.closest(".gp-picker")); chooseCourse(button.dataset.course); if (fromPicker) root.querySelector('[data-picker="course"] summary')?.focus(); return; }
    if (button.dataset.tab) { state.tab = button.dataset.tab; render(); return; }
    if (button.dataset.focus) { state.focus = button.dataset.focus; render(); root.querySelector('[data-picker="focus"] summary')?.focus(); return; }
    if (button.dataset.add) return openEdit(button.dataset.add);
    if (button.dataset.edit) {
      const c = course().categories.find((c) => c.items.some((item) => item.id === button.dataset.edit));
      return openEdit(c.id, button.dataset.edit);
    }
    if (button.dataset.action === "rules") return openRules();
    if (button.dataset.action === "screenshot") return openUpload("grades");
    if (button.dataset.action === "syllabus") return openUpload("syllabus");
    if (button.dataset.action === "sample-syllabus") { openUpload("syllabus"); useSample(); }
  });
  root.addEventListener("change", (event) => {
    const el = event.target;
    if (el.dataset.appearance) { appearance[el.dataset.appearance] = el.value; setAppearance(); render(); return; }
    if (el.id === "pending-only") { state.pendingOnly = el.checked; render(); return; }
    if (el.dataset.score) commitScoreInput(el, true);
  });
  root.addEventListener("input", (event) => {
    const el = event.target;
    if (el.dataset.score) return commitScoreInput(el);
    if (["assessment-slider", "assessment-number", "total-slider", "total-number"].includes(el.id)) {
      if (el.value === "" || !Number.isFinite(Number(el.value)) || Number(el.value) < 0 || Number(el.value) > 100) { el.setAttribute("aria-invalid", "true"); return; }
      el.removeAttribute("aria-invalid");
      state.driver = el.id.startsWith("total-") ? "total" : "assessment";
      state[state.driver === "total" ? "goal" : "exam"] = Number(el.value);
      projection(el.id);
    }
    if (el.dataset.assumption) {
      if (el.value === "" || !Number.isFinite(Number(el.value)) || Number(el.value) < 0 || Number(el.value) > 100) { el.setAttribute("aria-invalid", "true"); return; }
      el.removeAttribute("aria-invalid"); state.assumptions[el.dataset.assumption] = Number(el.value); projection();
    }
  });

  document.addEventListener("click", (event) => {
    [...root.querySelectorAll(".gp-picker[open]"), ...dialog.querySelectorAll(".gp-picker[open]")].forEach((picker) => {
      const popup = picker.dataset.formPicker && dialog.querySelector(`[data-popup-owner="${picker.dataset.formPicker}"]`);
      if (!picker.contains(event.target) && !popup?.contains(event.target)) picker.open = false;
    });
  });
  function pickerKey(event) {
    const owner = event.target.closest("[data-popup-owner]")?.dataset.popupOwner;
    const picker = event.target.closest(".gp-picker") || (owner && dialog.querySelector(`[data-form-picker="${owner}"]`));
    if (!picker) return;
    if (event.key === "Escape" && picker.open) { event.preventDefault(); picker.open = false; picker.querySelector("summary").focus(); }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); picker.open = true;
      if (picker.dataset.formPicker) positionFormPicker(picker);
      const menu = picker.dataset.formPicker && dialog.querySelector(`[data-popup-owner="${picker.dataset.formPicker}"]`);
      const buttons = [...(menu || picker).querySelectorAll("button")];
      const current = buttons.indexOf(document.activeElement);
      const next = current < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1) : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }
  root.addEventListener("keydown", pickerKey);
  dialog.addEventListener("keydown", pickerKey);
  dialog.addEventListener("toggle", (event) => {
    if (event.target.dataset.formPicker) {
      if (event.target.open) positionFormPicker(event.target);
      else {
        delete event.target.dataset.positioned;
        const popup = dialog.querySelector(`[data-popup-owner="${event.target.dataset.formPicker}"]`);
        if (popup) popup.hidden = true;
      }
    }
  }, true);
  window.addEventListener("resize", () => dialog.querySelectorAll("[data-form-picker][open]").forEach(positionFormPicker));

  function openDialog(value) { modal = value; renderDialog(); dialog.showModal(); }
  function closeDialog() { modal?.controller?.abort(); if (modal?.url) URL.revokeObjectURL(modal.url); modal = null; dialog.close(); dialog.innerHTML = ""; }
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(); });
  function modalError(message) { modal.error = message; const el = dialog.querySelector("[data-modal-error]"); if (el) { el.textContent = message; el.hidden = !message; if (message) el.scrollIntoView({block:"nearest"}); } }
  function openUpload(kind) { openDialog({ kind, courseId: course().id, phase: "upload", file: null, url: "", rows: [], error: "", busy: false }); }
  function openRules() { openDialog({ kind: "rules", courseId: course().id, categories: clone(course().categories), error: "", source: course().source }); }
  function openEdit(categoryId, itemId) {
    const c = course().categories.find((c) => c.id === categoryId);
    const item = c.items.find((item) => item.id === itemId);
    openDialog({ kind: "edit", courseId: course().id, categoryId, itemId, item: item ? clone(item) : { name: "", score: null, max: 100, status: "pending" }, error: "" });
  }
  function formPicker(kind, index, value, options, label, placeholder) {
    if (!options.length) return `<span class="gp-empty-choice">${t("先选择类别", "Choose a category first")}</span>`;
    const selected = options.find((option) => option.id === value);
    return `<details class="gp-picker gp-form-picker" data-form-picker="${kind}-${index}"><summary role="button" aria-label="${esc(label)}"><span class="${selected ? "" : "gp-placeholder"}">${esc(selected?.label || placeholder || t("请选择", "Choose"))}</span>${icon("down")}</summary><div class="gp-picker-menu" role="group" aria-label="${esc(label)}">${options.map((option) => `<button type="button" data-form-choice="${kind}" data-form-index="${index}" data-form-value="${esc(option.id)}" aria-label="${esc(option.label)}${option.detail ? ` · ${esc(option.detail)}` : ""}" ${option.id === value ? 'aria-current="true"' : ""}><span><strong>${esc(option.label)}</strong>${option.detail ? `<small>${esc(option.detail)}</small>` : ""}</span>${option.id === value ? icon("check") : ""}</button>`).join("")}</div></details>`;
  }
  function positionFormPicker(picker) {
    if (!picker.open) return;
    const rect = picker.querySelector("summary").getBoundingClientRect();
    const frame = dialog.getBoundingClientRect();
    const menu = picker.querySelector(".gp-picker-menu") || dialog.querySelector(`[data-popup-owner="${picker.dataset.formPicker}"]`);
    menu.dataset.popupOwner = picker.dataset.formPicker;
    if (menu.parentElement !== dialog) dialog.appendChild(menu);
    menu.hidden = false;
    const width = Math.min(285, frame.width - 32);
    const below = frame.bottom - rect.bottom - 16;
    const above = rect.top - frame.top - 16;
    const upward = below < 180 && above > below;
    const height = Math.min(255, Math.max(80, upward ? above : below));
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${height}px`;
    menu.style.left = `${Math.max(15, Math.min(rect.left - frame.left - 8, frame.width - width - 17))}px`;
    menu.style.top = upward ? "auto" : `${rect.bottom - frame.top + 5}px`;
    menu.style.bottom = upward ? `${frame.bottom - rect.top + 5}px` : "auto";
    picker.dataset.positioned = "true";
  }
  function redrawDialog(focusSelector) {
    const scroll = dialog.querySelector(".gp-dialog-body")?.scrollTop || 0;
    const disclosures = new Set([...dialog.querySelectorAll("details[data-disclosure][open]")].map((el) => el.dataset.disclosure));
    renderDialog();
    dialog.querySelectorAll("details[data-disclosure]").forEach((el) => { el.open = disclosures.has(el.dataset.disclosure); });
    dialog.querySelector(".gp-dialog-body").scrollTop = scroll;
    if (focusSelector) dialog.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  function dialogFrame(title, body, footer) {
    dialog.dataset.view = modal.kind === "grades" && modal.phase === "review" ? "review" : modal.kind;
    dialog.innerHTML = `<header class="gp-dialog-header"><div><p class="gp-eyebrow">${esc(course().code)} · ${t("成绩规划", "Grade planner")}</p><h2 id="dialog-heading">${title}</h2></div><button class="gp-close" data-modal-action="close" aria-label="${t("关闭", "Close")}">${icon("close")}</button></header><div class="gp-dialog-body">${body}<p class="gp-error" data-modal-error role="alert" ${modal.error ? "" : "hidden"}>${esc(modal.error)}</p></div><footer class="gp-dialog-footer">${footer}</footer>`;
    dialog.querySelector(".gp-dialog-body").addEventListener("scroll", () => {
      dialog.querySelectorAll("[data-form-picker][open]").forEach((picker) => { picker.open = false; });
    });
  }
  function renderDialog() {
    if (!modal) return;
    if (modal.kind === "rules") return renderRules();
    if (modal.kind === "edit") {
      const item = modal.item;
      const statuses = [{id:"pending",label:t("未出分", "Pending")}, {id:"graded",label:t("已出分", "Graded")}, {id:"excluded",label:t("免计", "Excluded"),detail:t("保留记录，从类别权重分配中排除", "Keep the record and exclude it from category weighting")}];
      return dialogFrame(modal.itemId ? t("编辑成绩项目", "Edit assessment") : t("添加成绩项目", "Add assessment"), `<p class="gp-dialog-intro">${esc(course().categories.find((c) => c.id === modal.categoryId)?.name || "")}</p><div class="gp-form-grid gp-edit-fields"><label class="gp-form-wide">${t("项目名称", "Assessment name")}<input id="edit-name" maxlength="120" value="${esc(item.name)}" placeholder="Homework 5"></label><label>${t("得分", "Score")}<input id="edit-score" type="number" min="0" step="any" value="${item.score ?? ""}" placeholder="—"></label><label>${t("满分", "Maximum points")}<input id="edit-max" type="number" min="0.000001" step="any" value="${item.max ?? ""}" placeholder="—"></label><div class="gp-form-wide gp-field-group"><span>${t("状态", "Status")}</span>${formPicker("status",0,item.status,statuses,t("项目状态", "Assessment status"))}<input id="edit-status" type="hidden" value="${esc(item.status)}"></div></div><p class="gp-dialog-caption">${modal.itemId ? t("免计项目保留在记录中，其余项目重新分配本类权重。", "Excluded assessments remain in the record; other assessments share the category weight.") : t("新增项目会增加本类总次数，并重新分配类别内的权重。已有未出分项目可直接在列表中填写。", "Adding an assessment increases the category count and redistributes its weight. Existing pending assessments can be filled directly in the list.")}</p>`, `<p>${t("仅保存到本机", "Saved in this browser only")}</p><div class="gp-actions"><button class="gp-text" data-modal-action="close">${t("取消", "Cancel")}</button><button class="gp-primary" data-modal-action="save-item">${t("保存项目", "Save assessment")}</button></div>`);
    }
    const isGrades = modal.kind === "grades";
    const canRecognize = isGrades ? capabilities.configured : capabilities.syllabusConfigured;
    if (modal.phase === "review") return renderReviews();
    const formats = isGrades ? "PNG / JPG / WebP · 8 MB" : "PDF / TXT / PNG / JPG / WebP · 8 MB";
    const local = isGrades && capabilities.provider === "local-ocr";
    const body = `<p class="gp-dialog-intro">${isGrades ? t("选择成绩截图，识别后逐项核对。", "Choose a screenshot, then review each grade.") : t("选择 syllabus，核对提取的占比和计算规则。", "Choose a syllabus, then review its grading breakdown.")}</p><label class="gp-file-drop" id="file-drop">${icon("upload")}<span class="gp-file-info"><strong>${modal.file ? esc(modal.file.name) : t("选择文件，或拖到这里", "Choose a file, or drop it here")}</strong><small>${formats}</small></span><span class="gp-browse-label">${modal.file ? t("更换", "Change") : t("浏览文件", "Browse")}${icon("chevron")}</span><input type="file" id="recognition-file" accept="${isGrades ? "image/png,image/jpeg,image/webp" : "application/pdf,text/plain,image/png,image/jpeg,image/webp"}" aria-label="${isGrades ? t("选择成绩截图", "Choose grade screenshot") : t("选择 syllabus 文件", "Choose syllabus file")}" ${modal.busy ? "disabled" : ""}></label>${modal.url ? `<figure class="gp-upload-preview"><img class="gp-source-preview" src="${esc(modal.url)}" alt="${t("所选截图预览", "Selected image preview")}"></figure>` : `<div class="gp-upload-empty">${icon("file")}<p>${isGrades ? t("项目名称、得分与满分清晰可见即可。", "Keep assessment names, earned points and maxima visible.") : t("保留包含评分构成与规则的页面。", "Include the pages describing assessment weights and rules.")}</p></div>`}<div class="gp-recognition-info"><p class="gp-service-status"><i></i>${local ? t("本机文字识别已就绪", "On-device recognition is ready") : canRecognize ? t("AI 识别已就绪", "AI recognition is ready") : t("AI 尚未配置，可先体验示例", "AI is not configured; try the sample")}</p><p>${local ? t("截图在本机读取，不发送到外部服务；确认后才记录成绩。", "The screenshot is read on this device. Grades are recorded only after confirmation.") : canRecognize ? t("点击识别后，所选文件将交给 AI 读取；原文件不保存在成绩记录中。", "Starting recognition sends the file to AI. The original is not retained in grade records.") : t("示例仅用于体验操作，不代表上传文件的识别结果。", "The sample demonstrates the review flow; it is not an extraction from your file.")}</p><button class="gp-text" data-modal-action="sample" ${modal.busy ? "disabled" : ""}>${t("使用示例体验确认流程", "Try the sample review flow")}${icon("chevron")}</button></div>`;
    dialogFrame(isGrades ? t("从截图录入成绩", "Record grades from a screenshot") : t("从 syllabus 建立评分规则", "Set up rules from a syllabus"), body, `<p>${t("识别 → 核对 → 确认保存", "Read → Review → Confirm")}</p><div class="gp-actions"><button class="gp-text" data-modal-action="close">${t("取消", "Cancel")}</button><button class="gp-primary" data-modal-action="recognize" ${!modal.file || modal.busy || !canRecognize ? "disabled" : ""}>${modal.busy ? t("正在识别…", "Reading…") : t("开始识别", "Start recognition")}</button></div>`);
    const drop = dialog.querySelector("#file-drop");
    drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("drag-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", (event) => { event.preventDefault(); if (!modal.busy) selectFile(event.dataTransfer.files[0]); });
  }

  function selectFile(file) {
    if (!file) return;
    const valid = modal.kind === "grades" ? ["image/png", "image/jpeg", "image/webp"] : ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
    if (!valid.includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) return modalError(t("请选择支持的文件格式，文件大小须在 8 MB 以内。", "Choose a supported, non-empty file up to 8 MB."));
    if (modal.url) URL.revokeObjectURL(modal.url);
    modal.file = file; modal.url = file.type.startsWith("image/") ? URL.createObjectURL(file) : ""; modal.error = "";
    renderDialog();
  }
  function matchRows(rows) {
    return rows.map((row) => {
      const matched = course().categories.flatMap((c) => c.items.map((item) => ({ c, item }))).find(({ item }) => norm(item.name) === norm(row.name));
      const c = matched?.c || course().categories.find((c) => norm(c.name) === norm(row.categoryName));
      return { ...row, selected: true, categoryId: c?.id || "", itemId: matched?.item.id || "", source: modal.sample ? "sample" : "screenshot" };
    });
  }
  function useSample() {
    modal.sample = true; modal.error = ""; modal.phase = "review";
    if (modal.url) { URL.revokeObjectURL(modal.url); modal.url = ""; }
    modal.file = null;
    if (modal.kind === "syllabus") {
      const incoming = [category("Homework", 20, 10, null, []), category("Quiz", 10, 5, null, []), category("Midterm", 25, 1, 100, []), category("Final", 45, 1, 100, [])];
      for (const c of incoming) c.evidence = `${c.name}: ${c.weight}% of final grade; ${c.plannedCount} assessment(s), equally weighted.`;
      return beginRuleReview(incoming, t("示例 syllabus（演示内容）", "Sample syllabus (demonstration)"));
    }
    const homework = course().categories.find((c) => /homework|assignment/i.test(c.name)) || course().categories[0];
    const quiz = course().categories.find((c) => /quiz/i.test(c.name)) || homework;
    const first = homework.items.find((item) => item.status === "pending") || homework.items[0];
    const second = quiz.items.find((item) => item.status === "pending" && item.id !== first?.id) || quiz.items.find((item) => item.id !== first?.id);
    modal.rows = matchRows([first && { name: first.name, categoryName: homework.name, score: 18, max: 20, evidence: `${first.name}    18 / 20` }, second && { name: second.name, categoryName: quiz.name, score: 9, max: 10, evidence: `${second.name}    9 / 10` }].filter(Boolean));
    renderDialog();
  }
  async function recognize() {
    if (!modal.file || modal.busy) return;
    const current = modal;
    current.busy = true; current.error = ""; current.controller = new AbortController();
    renderDialog();
    try {
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(t("读取文件失败。", "Could not read file."))); reader.readAsDataURL(current.file); });
      const response = await fetch("/api/preview/grades/recognize", { method: "POST", headers: { "content-type": "application/json" }, signal: current.controller.signal, body: JSON.stringify({ kind: current.kind, name: current.file.name, mime: current.file.type, dataUrl }) });
      const result = await response.json();
      if (modal !== current) return;
      if (!response.ok) throw new Error(result.error || t("识别失败，请重试。", "Recognition failed. Please retry."));
      current.busy = false; current.phase = "review"; current.sample = false;
      if (current.kind === "syllabus") return beginRuleReview(result.categories, current.file.name);
      current.rows = matchRows(result.rows);
      renderDialog();
    } catch (error) { if (modal !== current) return; current.busy = false; current.error = error.name === "AbortError" ? t("识别已取消。", "Recognition cancelled.") : error instanceof TypeError ? t("暂时无法连接本地识别服务，请重试；尚未保存任何成绩。", "Could not connect to local recognition. Please retry; no grades have been saved.") : error.message; renderDialog(); }
  }
  function renderReviews() {
    const selected = modal.rows.filter((row) => row.selected).length;
    const source = modal.sample ? `<div class="gp-sample-source"><p>${t("演示数据 · 非上传识别结果", "Demo data · Not extracted from an upload")}</p><pre>${modal.rows.map((row) => esc(row.evidence)).join("\n")}</pre></div>` : modal.url ? `<img class="gp-source-preview" src="${esc(modal.url)}" alt="${t("原始成绩截图", "Original grade screenshot")}"><p class="gp-dialog-caption">${esc(modal.file?.name || "")}</p>` : "";
    const rows = modal.rows.map((row, index) => {
      const category = course().categories.find((c) => c.id === row.categoryId);
      const target = category?.items.find((item) => item.id === row.itemId);
      const categories = course().categories.map((c) => ({ id:c.id, label:c.name }));
      const targets = (category?.items || []).filter((item) => item.status !== "excluded").map((item) => ({ id:item.id, label:item.name, detail:G.isGraded(item) ? t(`已有成绩 ${item.score} / ${item.max}`, `Recorded: ${item.score} / ${item.max}`) : t("未出分", "Pending") }));
      return `<article class="gp-review-row ${row.selected ? "" : "is-unselected"}" data-review-index="${index}"><div class="gp-review-heading"><label class="gp-review-select"><input type="checkbox" data-review="selected" aria-label="${t("保存", "Save")} ${esc(row.name)}" ${row.selected ? "checked" : ""}><strong>${esc(row.name)}</strong></label><div class="gp-score-field gp-review-score"><input type="number" min="0" step="any" data-review="score" aria-label="${esc(row.name)} ${t("确认得分", "reviewed score")}" value="${row.score ?? ""}" placeholder="—"><span>/</span><input type="number" min="0.000001" step="any" data-review="max" aria-label="${esc(row.name)} ${t("确认满分", "reviewed maximum")}" value="${row.max ?? ""}" placeholder="—"></div></div><div class="gp-review-destination"><span>${t("保存至", "Save to")}</span>${formPicker("category",index,row.categoryId,categories,`${row.name} · ${t("类别", "Category")}`,t("选择类别", "Choose category"))}<span class="gp-destination-divider">/</span>${formPicker("item",index,row.itemId,targets,`${row.name} · ${t("对应项目", "Matching assessment")}`,t("选择对应项目", "Choose assessment"))}</div>${target && G.isGraded(target) ? `<p class="gp-replace-note">${t(`将更新已有成绩 ${target.score} / ${target.max}`, `Will update the recorded ${target.score} / ${target.max}`)}</p>` : !target ? `<p class="gp-replace-note">${t("请选择对应项目后保存。", "Choose a matching assessment before saving.")}</p>` : ""}<details class="gp-review-evidence" data-disclosure="evidence-${index}"><summary>${t("识别原文", "Source text")}${icon("down")}</summary><p>${esc(row.evidence || t("无清晰原文，请手动核对。", "No clear evidence; verify manually."))}</p></details></article>`;
    }).join("");
    dialogFrame(t("核对成绩与对应项目", "Review grades and matching assessments"), `<p class="gp-dialog-intro">${t("核对得分，再选择保存到哪个项目。", "Check each score and choose where it belongs.")}</p><div class="gp-review-layout"><details class="gp-review-source" data-disclosure="source" ${window.matchMedia("(min-width:701px)").matches ? "open" : ""}><summary>${modal.sample ? t("示例成绩单", "Sample grade report") : t("原始截图", "Original screenshot")}${icon("down")}</summary>${source}</details><div class="gp-review-results">${rows || `<p class="gp-dialog-caption">${t("没有识别到可用成绩，请换一张清晰截图，或手动填写。", "No usable grades were found. Try a clearer screenshot or enter grades manually.")}</p>`}</div></div>`, `<p>${t("确认前不会修改任何成绩", "No grades change before confirmation")}</p><div class="gp-actions"><button class="gp-text" data-modal-action="back">${t("重新选择", "Choose again")}</button><button class="gp-primary" data-modal-action="save-reviews" ${!selected ? "disabled" : ""}>${t(`确认保存 ${selected} 项`, `Confirm ${selected} grade${selected === 1 ? "" : "s"}`)}</button></div>`);
  }

  function beginRuleReview(incoming, source) {
    const existing = course().categories;
    modal.categories = incoming.map((c) => {
      const old = existing.find((entry) => norm(entry.name) === norm(c.name));
      return { ...c, id: old?.id || id(), items: old ? clone(old.items) : clone(c.items || []), specialRule: c.specialRule || "", evidence: c.evidence || "" };
    });
    for (const c of existing) if (!modal.categories.some((entry) => entry.id === c.id)) modal.categories.push(clone(c));
    modal.kind = "rules"; modal.source = source; modal.fromExtraction = true;
    renderDialog();
  }
  function renderRules() {
    const total = modal.categories.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
    const methods = [{id:"equal",label:t("每次等权", "Equal weight"),detail:t("每次成绩按相同比例计入", "Each assessment has the same weight")}, {id:"points",label:t("按总分汇总", "Total points"),detail:t("累计得分 ÷ 累计满分", "Total earned points / total possible points")}, {id:"unknown",label:t("待补充", "To be added")}];
    const body = `<div class="gp-rule-overview"><p class="gp-dialog-intro">${t("设置各类成绩的占比与计算方式。", "Set the weight and method for each category.")}</p><span class="gp-rule-balance ${Math.abs(total-100)<.000001 ? "is-balanced" : ""}" aria-live="polite"><i></i>${t("合计", "Total")} <strong id="rule-total">${fmt(total,1)}%</strong><span>/ 100%</span></span></div>${modal.sample ? `<details class="gp-rule-source" data-disclosure="sample-syllabus"><summary>${t("示例 syllabus · 演示内容", "Sample syllabus · Demonstration")}${icon("down")}</summary><pre>Homework 20% · 10 assignments\nQuiz 10% · 5 quizzes\nMidterm 25% · 1 exam\nFinal 45% · 1 exam</pre></details>` : ""}<div class="gp-rules-table"><div class="gp-rule-head" aria-hidden="true"><span>${t("类别", "Category")}</span><span>${t("占比", "Weight")}</span><span>${t("计算方式", "Method")}</span><span>${t("项目数", "Count")}</span><span></span></div>${modal.categories.map((c,index) => `<div class="gp-rule-row" data-rule-index="${index}"><label class="gp-rule-name"><span class="gp-mobile-label">${t("类别", "Category")}</span><input data-rule="name" maxlength="80" aria-label="${t("类别名称", "Category name")} ${index+1}" value="${esc(c.name)}" placeholder="Homework"></label><label class="gp-rule-weight"><span class="gp-mobile-label">${t("占比", "Weight")}</span><span class="gp-field-with-unit"><input data-rule="weight" type="number" min="0" max="100" step="any" aria-label="${esc(c.name)} ${t("占比", "weight")}" value="${c.weight ?? ""}" placeholder="—"><span>%</span></span></label><div class="gp-rule-method"><span class="gp-mobile-label">${t("计算方式", "Method")}</span>${formPicker("method",index,c.method,methods,`${c.name} · ${t("计算方式", "Method")}`)}</div><label class="gp-rule-count"><span class="gp-mobile-label">${t("项目数", "Count")}</span><input data-rule="plannedCount" type="number" min="1" max="100" step="1" aria-label="${esc(c.name)} ${t("项目数", "assessment count")}" value="${c.plannedCount ?? ""}" placeholder="—"></label><button class="gp-row-menu" data-remove-rule="${index}" ${c.items.some(G.isGraded) ? "disabled" : ""} aria-label="${t("移除类别", "Remove category")} ${esc(c.name)}">${icon("close")}</button><details class="gp-rule-details" data-disclosure="rule-${esc(c.id)}" ${c.specialRule ? "open" : ""}><summary>${c.specialRule ? t("特殊规则待确认", "Special rules need review") : c.evidence ? t("查看原文与补充规则", "Source and additional rules") : t("补充规则", "Additional rules")}${icon("down")}</summary>${c.evidence ? `<blockquote>${esc(c.evidence)}</blockquote>` : ""}<label>${t("特殊规则", "Special rules")}<input data-rule="specialRule" value="${esc(c.specialRule)}" placeholder="${t("例如：去掉最低一次 Quiz", "For example: drop the lowest quiz")}" maxlength="500"></label><p>${t("特殊规则暂不自动计算，填写后暂停总评预测。", "Special rules are not calculated in this preview; entering one pauses forecasts.")}</p></details></div>`).join("")}</div><button class="gp-text gp-add-rule" data-modal-action="add-rule">${icon("plus")}${t("添加类别", "Add category")}</button><p class="gp-dialog-caption">${t("未知次数可留空；按总分汇总时，需补齐各个项目的满分。", "Leave unknown counts blank. Total-points weighting needs every assessment's maximum.")}</p>${modal.source ? `<p class="gp-rule-provenance">${t("来源", "Source")} · ${esc(modal.source)}</p>` : ""}`;
    dialogFrame(modal.fromExtraction ? t("核对 syllabus 评分规则", "Review syllabus grading rules") : t("课程评分规则", "Course grading rules"), body, `<button class="gp-text" data-modal-action="upload-syllabus">${t("上传 syllabus 识别", "Read from syllabus")}${icon("chevron")}</button><div class="gp-actions"><button class="gp-text" data-modal-action="close">${t("取消", "Cancel")}</button><button class="gp-primary" data-modal-action="save-rules">${t("确认评分规则", "Confirm grading rules")}</button></div>`);
  }

  function saveRules() {
    const rows = modal.categories;
    if (!rows.length || rows.some((c) => !String(c.name).trim() || !Number.isFinite(c.weight) || c.weight < 0 || c.weight > 100 || c.plannedCount !== null && (!Number.isInteger(c.plannedCount) || c.plannedCount < 1 || c.plannedCount > 100))) return modalError(t("请检查类别名称、占比，以及 1–100 之间的总次数。未知次数可留空。", "Check category names, weights and counts from 1 to 100. Unknown counts can remain blank."));
    if (Math.abs(rows.reduce((sum, c) => sum + c.weight, 0) - 100) > .000001) return modalError(t("所有类别的占比需要合计为 100%。", "Category weights must add up to 100%."));
    if (new Set(rows.map((c) => norm(c.name))).size !== rows.length) return modalError(t("类别名称不能重复。", "Category names must be unique."));
    const next = clone(rows);
    for (const c of next) {
      c.name = c.name.trim();
      if (c.plannedCount === null) continue;
      while (c.items.length > c.plannedCount) {
        const index = c.items.findLastIndex((item) => item.status === "pending");
        if (index < 0) return modalError(t("总次数不能小于已出分和免计项目数量；已有成绩会被保留。", "Count cannot be smaller than existing graded and excluded records."));
        c.items.splice(index, 1);
      }
      while (c.items.length < c.plannedCount) { let n = c.items.length + 1; while (c.items.some((item) => norm(item.name) === norm(`${c.name} ${n}`))) n++; c.items.push({ id: id(), name: `${c.name} ${n}`, score: null, max: null, status: "pending" }); }
    }
    course().categories = next;
    course().source = modal.source || t("手动确认", "Manually confirmed");
    state.expanded = new Set(next.slice(0, 2).map((c) => c.id));
    const saved = persist(); closeDialog(); render(); if (saved) toast(t("评分规则已保存，已有成绩已保留。", "Rules saved. Existing grades have been preserved."));
  }
  function saveItem() {
    const name = dialog.querySelector("#edit-name").value.trim();
    const score = number(dialog.querySelector("#edit-score").value);
    const max = number(dialog.querySelector("#edit-max").value);
    const status = dialog.querySelector("#edit-status").value;
    const c = course().categories.find((c) => c.id === modal.categoryId);
    if (!name || !G.validateGrade(score, max, status) || c.items.some((item) => item.id !== modal.itemId && norm(item.name) === norm(name))) return modalError(t("请检查项目名称、得分和满分；同类项目名称不能重复。已出分项目必须填写有效得分。", "Check the name, score and maximum. Assessment names must be unique within a category; graded items require a valid score."));
    const value = { ...modal.item, name, score: status === "graded" ? score : null, max, status, source: "" };
    if (modal.itemId) Object.assign(c.items.find((item) => item.id === modal.itemId), value);
    else { if (c.items.length >= 100) return modalError(t("每类最多 100 个项目。", "Up to 100 assessments per category.")); c.items.push({ ...value, id: id() }); if (c.plannedCount !== null) c.plannedCount = c.items.length; }
    const saved = persist(); closeDialog(); render(); if (saved) toast(t("项目已保存。", "Assessment saved."));
  }
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !modal) return;
    if (button.dataset.formChoice) {
      modal.error = "";
      const kind = button.dataset.formChoice;
      const index = Number(button.dataset.formIndex);
      const value = button.dataset.formValue;
      if (kind === "method") modal.categories[index].method = value;
      if (kind === "category") { modal.rows[index].categoryId = value; modal.rows[index].itemId = ""; }
      if (kind === "item") modal.rows[index].itemId = value;
      if (kind === "status") Object.assign(modal.item, { name:dialog.querySelector("#edit-name").value, score:number(dialog.querySelector("#edit-score").value), max:number(dialog.querySelector("#edit-max").value), status:value });
      return redrawDialog(`[data-form-picker="${kind}-${index}"] > summary`);
    }
    if (button.dataset.removeRule !== undefined) { modal.categories.splice(Number(button.dataset.removeRule), 1); return redrawDialog(); }
    switch (button.dataset.modalAction) {
      case "close": return closeDialog();
      case "sample": return useSample();
      case "recognize": return void recognize();
      case "back": modal.phase = "upload"; modal.rows = []; modal.sample = false; modal.error = ""; return renderDialog();
      case "upload-syllabus": closeDialog(); return openUpload("syllabus");
      case "add-rule": if (modal.categories.length < 20) modal.categories.push({ id: id(), name: "", weight: 0, method: "equal", plannedCount: null, items: [], specialRule: "", evidence: "" }); redrawDialog(); dialog.querySelector('.gp-rule-row:last-child [data-rule="name"]')?.focus(); return;
      case "save-rules": return saveRules();
      case "save-item": return saveItem();
      case "save-reviews": {
        try {
          const c = course();
          const updated = G.applyReviews(c, modal.rows);
          courses[courses.findIndex((item) => item.id === c.id)] = updated;
          const saved = persist();
          closeDialog(); render(); if (saved) toast(t("确认的成绩已保存，课程分数已更新。", "Confirmed grades saved. Course totals updated."));
        } catch (error) { modalError(error.message === "target" ? t("请为每条成绩选择不同且有效的对应项目。", "Choose a different valid destination for each grade.") : t("请勾选成绩，并核对得分与满分后再保存。", "Select grades and verify scores and maxima before saving.")); }
      }
    }
  });
  dialog.addEventListener("change", (event) => {
    if (!modal) return;
    const el = event.target;
    if (el.id === "recognition-file") return selectFile(el.files[0]);
    if (el.dataset.review) {
      const row = modal.rows[Number(el.closest("[data-review-index]").dataset.reviewIndex)];
      row[el.dataset.review] = el.dataset.review === "selected" ? el.checked : ["score", "max"].includes(el.dataset.review) ? number(el.value) : el.value;
      if (el.dataset.review === "selected") redrawDialog(`[data-review-index="${el.closest("[data-review-index]").dataset.reviewIndex}"] [data-review="selected"]`);
    }
  });
  dialog.addEventListener("input", (event) => {
    const el = event.target;
    if (!modal) return;
    if (modal.error) modalError("");
    if (modal.rows && ["score", "max"].includes(el.dataset.review)) {
      const row = modal.rows[Number(el.closest("[data-review-index]").dataset.reviewIndex)];
      row[el.dataset.review] = number(el.value);
    }
    if (el.dataset.rule) {
      const row = modal.categories[Number(el.closest("[data-rule-index]").dataset.ruleIndex)];
      row[el.dataset.rule] = ["weight", "plannedCount"].includes(el.dataset.rule) ? number(el.value) : el.value;
      const total = dialog.querySelector("#rule-total");
      if (total) {
        const weight = modal.categories.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
        total.textContent = fmt(weight, 1) + "%";
        total.closest(".gp-rule-balance").classList.toggle("is-balanced", Math.abs(weight - 100) < .000001);
      }
    }
  });
  setAppearance(); render();
  fetch("/api/preview/grades/status").then((r) => r.json()).then((result) => { capabilities = { configured: result.configured === true, syllabusConfigured: result.syllabusConfigured === true, provider: result.provider, ready: true }; if (modal?.phase === "upload") renderDialog(); }).catch(() => { capabilities.ready = true; });
})();
