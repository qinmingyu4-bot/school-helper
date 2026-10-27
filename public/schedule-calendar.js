(function (scope) {
  "use strict";
  const importer = typeof module === "object" && module.exports ? require("./schedule-import") : scope.StudyBridgeScheduleImport;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const types = { DDL: ["作业 / 截止", "deadline"], LEC: ["Lecture", "lecture"], TUT: ["Tutorial", "tutorial"], EVENT: ["个人安排", "personal"] };
  const type = (value) => types[importer.kind(value)] || types.EVENT;
  const dateFormatters = new Map();
  const clockFormatters = new Map();
  const longDate = new Intl.DateTimeFormat("zh-CN", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const shortDate = new Intl.DateTimeFormat("zh-CN", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
  function dayKey(timestamp, timeZone) {
    if (!dateFormatters.has(timeZone)) dateFormatters.set(timeZone, new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }));
    const parts = Object.fromEntries(dateFormatters.get(timeZone).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function shiftMonth(month, offset) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("月份无效。");
    const [year, number] = month.split("-").map(Number);
    const result = new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
    return result >= "2000-01" && result <= "2200-12" ? result : month;
  }
  function timestamp(value, timeZone) {
    try { return Date.parse(importer.validTime(value) && timeZone ? importer.toUtc(value, timeZone) : value); }
    catch { return NaN; }
  }
  function buildModel({ items = [], month = "", selectedDate = "", timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, now = Date.now() } = {}) {
    now = Number(new Date(now));
    const today = dayKey(now, timeZone);
    month = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= "2000-01" && month <= "2200-12" ? month : today.slice(0, 7);
    selectedDate = importer.validDate(selectedDate) && selectedDate.startsWith(month) ? selectedDate : today.startsWith(month) ? today : `${month}-01`;
    const rows = items.flatMap((item) => {
      const start = timestamp(item.startsAt, item.timeZone);
      if (!Number.isFinite(start)) return [];
      const candidateEnd = timestamp(item.endsAt, item.timeZone);
      const end = Number.isFinite(candidateEnd) && candidateEnd > start ? candidateEnd : start;
      const startDay = dayKey(start, timeZone);
      return [{ ...item, ...importer.completion(item, now), start, end, startDay, endDay: end > start ? dayKey(end - 1, timeZone) : startDay }];
    }).sort((first, second) => first.start - second.start || String(first.title).localeCompare(String(second.title)));
    const firstDay = new Date(`${month}-01T12:00:00Z`);
    const gridStart = firstDay.getTime() - ((firstDay.getUTCDay() + 6) % 7) * 86400000;
    const onDay = (date) => rows.filter((item) => item.startDay <= date && item.endDay >= date);
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart + index * 86400000).toISOString().slice(0, 10);
      return { date, items: onDay(date), inMonth: date.startsWith(month), today: date === today, selected: date === selectedDate };
    });
    const pending = rows.filter((item) => !item.completedAt);
    return { today, month, selectedDate, timeZone, now, rows, days, selectedItems: onDay(selectedDate), invalidCount: items.length - rows.length,
      upcoming: pending.filter((item) => item.start >= now || item.end > now || importer.kind(item.kind) === "DDL"), completed: rows.filter((item) => item.completedAt),
      overdue: pending.filter((item) => importer.kind(item.kind) === "DDL" && item.start < now),
      next: pending.find((item) => item.start >= now) || null, ongoing: pending.filter((item) => item.start <= now && item.end > now) };
  }
  function dateLabel(date, weekday = true) {
    return (weekday ? longDate : shortDate).format(new Date(`${date}T12:00:00Z`));
  }
  function clock(timestamp, timeZone) {
    if (!clockFormatters.has(timeZone)) clockFormatters.set(timeZone, new Intl.DateTimeFormat("zh-CN", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
    return clockFormatters.get(timeZone).format(new Date(timestamp));
  }
  function timeLabel(item, timeZone) {
    const start = clock(item.start, timeZone);
    if (item.end <= item.start) return start;
    const endDate = dayKey(item.end, timeZone);
    return `${start}–${item.startDay === endDate ? "" : `${dateLabel(endDate, false)} `}${clock(item.end, timeZone)}`;
  }
  function badge(item) { const [label, name] = type(item.kind); return `<span class="planner-badge planner-${name}">${label}</span>`; }
  function itemHtml(item, model, countdown) {
    const instant = new Date(item.start).toISOString();
    const overdue = !item.completedAt && importer.kind(item.kind) === "DDL" && item.start < model.now;
    const ongoing = item.start <= model.now && item.end > model.now;
    const status = overdue ? "已过截止时间" : ongoing ? item.classMeeting ? "上课中" : "正在进行" : item.start < model.now ? "时间已过" : countdown(instant);
    return `<div class="planner-item ${item.completedAt ? "is-completed" : ""}">
      <div class="planner-item-time"><time datetime="${escape(item.startsAt)}">${escape(timeLabel(item, model.timeZone))}</time>${badge(item)}</div>
      <div class="planner-item-content"><b>${escape(item.title)}</b>${item.course || item.location ? `<small>${escape([item.course, item.location].filter(Boolean).join(" · "))}</small>` : ""}${item.notes ? `<details class="planner-notes"><summary>查看备注</summary><p>${escape(item.notes)}</p></details>` : ""}</div>
      <div class="planner-item-actions">${item.completedAt ? `<span class="planner-completed-label">✓ ${item.automatic ? "已上完" : "已完成"}</span>` : `<small class="${overdue ? "planner-overdue" : ""}" ${item.start < model.now || ongoing ? "" : `data-countdown="${instant}"`}>${escape(status)}</small>${item.classMeeting ? "" : `<button data-action="complete-schedule" data-course="${escape(item.courseId)}" data-doc="${escape(item.docId)}" aria-label="完成 ${escape(item.title)}">完成</button>`}`}</div>
    </div>`;
  }
  function nextHtml(model, countdown) {
    const item = model.next;
    const instant = item ? new Date(item.start).toISOString() : "";
    return `<div class="planner-next-heading"><span class="schedule-kicker">UP NEXT</span><h2>接下来</h2></div><div class="planner-next-content">${item ? `${badge(item)}<b>${escape(item.title)}</b><small>${escape(dateLabel(item.startDay))} · ${escape(timeLabel(item, model.timeZone))}${item.location ? ` · ${escape(item.location)}` : ""}</small>` : `<b>暂无即将开始的安排</b><small>选择日期，添加课程、作业或自己的计划。</small>`}</div>${item ? `<strong data-countdown="${instant}">${escape(countdown(instant))}</strong><button data-action="schedule-day" data-date="${escape(item.startDay)}">查看当天</button>` : ""}${model.ongoing.length ? `<p class="planner-ongoing">正在进行：${escape(model.ongoing.map((entry) => entry.title).join("、"))}</p>` : ""}`;
  }
  function render(model, { agendaView = "upcoming", countdown = () => "" } = {}) {
    const visible = agendaView === "all" ? model.rows : agendaView === "completed" ? model.completed : model.upcoming;
    let previousDate = "";
    const agenda = visible.map((item) => {
      const heading = item.startDay !== previousDate ? `<h3 class="planner-date-heading">${escape(dateLabel(item.startDay))}${item.startDay === model.today ? `<span>今天</span>` : ""}</h3>` : "";
      previousDate = item.startDay;
      return heading + itemHtml(item, model, countdown);
    }).join("");
    return `<article class="card planner-next" id="scheduleNext">${nextHtml(model, countdown)}</article>
      <div class="planner-month-layout">
        <article class="card planner-month" aria-label="月历">
          <div class="planner-month-header"><div><span class="schedule-kicker">MONTHLY CALENDAR</span><h2>${escape(model.month.slice(0, 4))}年${Number(model.month.slice(5))}月</h2></div><div class="planner-month-nav"><button data-action="schedule-month" data-offset="-1" aria-label="上个月" ${model.month === "2000-01" ? "disabled" : ""}>‹</button><button data-action="schedule-today">今天</button><button data-action="schedule-month" data-offset="1" aria-label="下个月" ${model.month === "2200-12" ? "disabled" : ""}>›</button></div></div>
          <div class="planner-month-meta"><span>今天 · ${escape(dateLabel(model.today))}</span><label>跳至<input type="month" id="scheduleMonthPicker" aria-label="选择月份" min="2000-01" max="2200-12" value="${escape(model.month)}"></label></div>
          <div class="planner-weekdays" aria-hidden="true">${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span>${day}</span>`).join("")}</div>
          <div class="planner-grid">${model.days.map((day) => `<button class="planner-day ${day.inMonth ? "" : "is-outside"} ${day.today ? "is-today" : ""} ${day.selected ? "is-selected" : ""}" data-action="schedule-day" data-date="${day.date}" aria-label="${escape(dateLabel(day.date))}${day.today ? "，今天" : ""}，${day.items.length} 项安排" aria-pressed="${day.selected}" ${day.today ? 'aria-current="date"' : ""}>
            <span class="planner-day-number">${Number(day.date.slice(8))}</span><span class="planner-day-events" aria-hidden="true">${day.items.slice(0, 2).map((item) => `<span class="planner-chip planner-${type(item.kind)[1]} ${item.completedAt ? "is-completed" : ""}"><i></i><span>${escape(clock(item.start, model.timeZone))} ${escape(item.title)}</span></span>`).join("")}${day.items.length > 2 ? `<small>+${day.items.length - 2} 项</small>` : ""}</span>${day.items.length ? `<span class="planner-mobile-count" aria-hidden="true">${day.items.length}项</span>` : ""}</button>`).join("")}</div>
          <div class="planner-legend">${Object.values(types).map(([label, name]) => `<span><i class="planner-dot planner-${name}"></i>${label}</span>`).join("")}</div>
        </article>
        <article class="card planner-day-detail" aria-label="当天详情"><span class="schedule-kicker">DAY DETAILS</span><h2>${Number(model.selectedDate.slice(5, 7))}月${Number(model.selectedDate.slice(8))}日${model.selectedDate === model.today ? `<span class="planner-today-label">今天</span>` : ""}</h2><p class="planner-day-subtitle">${escape(dateLabel(model.selectedDate))} · ${model.selectedItems.length} 项安排</p>
          <button class="primary planner-add" data-action="schedule-new" data-date="${model.selectedDate}">＋ 此日添加安排</button>
          <div class="planner-day-items">${model.selectedItems.length ? model.selectedItems.map((item) => itemHtml(item, model, countdown)).join("") : `<div class="planner-empty"><b>这一天还没有安排</b><p>添加个人计划，或从课程文件导入。</p></div>`}</div>
        </article>
      </div>
      <article class="card planner-agenda" aria-label="完整日程"><div class="planner-agenda-header"><div><span class="schedule-kicker">YOUR AGENDA</span><h2>完整日程</h2><p>课程、作业与个人安排 · 按时间排序，不受所选月份限制</p><p>Lecture / Tutorial 下课后自动完成，作业需手动点击“完成”。</p></div><nav class="planner-tabs" aria-label="日程范围">${[["upcoming", "接下来", model.upcoming.length], ["all", "全部安排", model.rows.length], ["completed", "已完成", model.completed.length]].map(([view, label, count]) => `<button data-action="schedule-agenda" data-view="${view}" aria-pressed="${agendaView === view}">${label}<span>${count}</span></button>`).join("")}</nav></div>
        ${model.overdue.length && agendaView === "upcoming" ? `<p class="planner-overdue-notice">${model.overdue.length} 项作业已过截止时间，仍需手动完成。</p>` : ""}
        ${model.invalidCount ? `<p class="planner-overdue-notice">${model.invalidCount} 项安排缺少有效时间，暂时无法放入月历。</p>` : ""}
        <div class="planner-agenda-items">${agenda || `<div class="planner-empty"><b>${agendaView === "completed" ? "还没有已完成的安排" : agendaView === "all" ? "从第一条安排开始" : "接下来暂无安排"}</b><p>选择月历中的日期，添加课程、作业或个人计划。</p></div>`}</div>
      </article>`;
  }
  const api = { shiftMonth, buildModel, dateLabel, render, nextHtml };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.StudyBridgeScheduleCalendar = api;
})(typeof window !== "undefined" ? window : globalThis);
