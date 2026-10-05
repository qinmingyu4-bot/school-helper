(() => {
  const COURSE_NAME = "Schedule & Deadlines";
  const ITEM_PREFIX = "[SCHEDULE_ITEM]";
  const SOURCE_PREFIX = "[SCHEDULE_SOURCE]";
  let page = null;
  let button = null;
  let scheduleCourse = null;
  let scheduleItems = [];

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function installStyle() {
    if (document.querySelector("#studybridge-schedule-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-schedule-style";
    style.textContent = `
      .schedule-entry {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 48px;
        padding: 9px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        color: var(--navy);
        text-align: left;
        box-shadow: 0 8px 24px rgba(25, 36, 58, 0.04);
      }

      .schedule-entry:hover {
        border-color: var(--green);
      }

      .schedule-entry-icon {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: linear-gradient(145deg, #1f3a5f, #3867d6);
        color: white;
        font-weight: 900;
      }

      .schedule-entry strong,
      .schedule-entry span {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .schedule-entry span {
        color: var(--muted);
        font-size: 12px;
      }

      .schedule-page {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        min-height: 0;
        height: 100vh;
        overflow: hidden;
      }

      .schedule-page[hidden] {
        display: none;
      }

      .schedule-body {
        display: grid;
        grid-template-columns: minmax(320px, 0.88fr) minmax(420px, 1.12fr);
        gap: 18px;
        min-height: 0;
        padding: 22px 28px;
        overflow: auto;
      }

      .schedule-card {
        display: grid;
        gap: 14px;
        align-content: start;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 16px 42px rgba(25, 36, 58, 0.06);
      }

      .schedule-card h3,
      .schedule-card h4 {
        margin: 0;
      }

      .schedule-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .schedule-card label {
        display: grid;
        gap: 6px;
        color: var(--navy);
        font-size: 13px;
        font-weight: 850;
      }

      .schedule-card textarea {
        min-height: 80px;
        resize: vertical;
      }

      .schedule-now {
        padding: 16px;
        border-radius: 8px;
        border: 1px solid rgba(47, 125, 98, 0.24);
        background: linear-gradient(145deg, rgba(31, 58, 95, 0.08), rgba(47, 125, 98, 0.12));
      }

      .schedule-now strong {
        display: block;
        margin: 4px 0;
        font-size: 22px;
        color: var(--navy);
      }

      .schedule-now span {
        color: var(--muted);
        font-size: 13px;
      }

      .schedule-list {
        display: grid;
        gap: 10px;
      }

      .schedule-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fff;
      }

      .schedule-item.past {
        opacity: 0.58;
      }

      .schedule-item strong {
        display: block;
        color: var(--navy);
      }

      .schedule-item span {
        display: block;
        margin-top: 3px;
        color: var(--muted);
        font-size: 12px;
      }

      .schedule-kind {
        display: inline-grid;
        place-items: center;
        width: 42px;
        min-height: 28px;
        border-radius: 999px;
        background: #edf4ff;
        color: var(--navy);
        font-size: 12px;
        font-weight: 850;
      }

      .schedule-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .schedule-message {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }

      @media (max-width: 980px) {
        .schedule-page {
          height: auto;
          overflow: visible;
        }

        .schedule-body,
        .schedule-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    if (document.querySelector("#openScheduleButton")) {
      button = document.querySelector("#openScheduleButton");
      return;
    }
    const anchor =
      document.querySelector("#openEmailReplyButton") ||
      document.querySelector("#openClassmatesButton") ||
      document.querySelector("#openSchoolCommunityButton") ||
      document.querySelector("#openProfilePageButton");
    if (!anchor) return;
    button = document.createElement("button");
    button.id = "openScheduleButton";
    button.type = "button";
    button.className = "schedule-entry";
    button.innerHTML = `
      <span class="schedule-entry-icon">时</span>
      <span><strong>时间表</strong><span id="scheduleEntryHint">课程、作业和 deadline 提醒</span></span>
    `;
    anchor.insertAdjacentElement("afterend", button);
    button.addEventListener("click", showSchedulePage);
  }

  function ensurePage() {
    if (page) return page;
    const workspace = document.querySelector(".workspace");
    if (!workspace) return null;
    page = document.createElement("section");
    page.id = "schedulePage";
    page.className = "schedule-page";
    page.hidden = true;
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">Planner</p>
          <h2>时间表</h2>
          <span id="scheduleStatusLine">课程、作业、考试和 deadline 会保存到云端。</span>
        </div>
        <button class="ghost-button" id="backFromScheduleButton" type="button">返回学习区</button>
      </header>
      <div class="schedule-body">
        <section class="schedule-card">
          <div class="schedule-now" id="scheduleNowBox">
            <span>最近提醒</span>
            <strong>正在读取...</strong>
            <span>打开 StudyBridge 时会自动更新倒计时。</span>
          </div>
          <form id="scheduleManualForm" class="schedule-card">
            <h3>手动添加</h3>
            <div class="schedule-grid">
              <label>
                <span>类型</span>
                <select id="scheduleKindInput">
                  <option value="deadline">Deadline</option>
                  <option value="class">上课</option>
                  <option value="exam">考试</option>
                  <option value="meeting">Meeting</option>
                </select>
              </label>
              <label>
                <span>时间</span>
                <input id="scheduleDateInput" type="datetime-local" />
              </label>
            </div>
            <label>
              <span>标题</span>
              <input id="scheduleTitleInput" placeholder="例如 MAT223 Problem Set 2 due" />
            </label>
            <div class="schedule-grid">
              <label>
                <span>课程</span>
                <input id="scheduleCourseInput" placeholder="例如 MAT223" />
              </label>
              <label>
                <span>地点 / 链接</span>
                <input id="scheduleLocationInput" placeholder="教室、Zoom 或提交入口" />
              </label>
            </div>
            <label>
              <span>备注</span>
              <textarea id="scheduleNotesInput" placeholder="要求、材料、提交说明或老师提醒"></textarea>
            </label>
            <button class="primary-button" type="submit">保存到时间表</button>
          </form>
          <form id="scheduleUploadForm" class="schedule-card">
            <h3>上传课程表 / Syllabus</h3>
            <p class="schedule-message">可以上传 PDF、txt 或 md。上传后 AI 会尝试提取课程时间、考试和作业 deadline。</p>
            <input id="scheduleFileInput" type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" />
            <button class="small-button" id="scheduleExtractButton" type="submit">上传并提取时间点</button>
          </form>
        </section>
        <section class="schedule-card">
          <div class="panel-title">
            <div>
              <p class="eyebrow">Upcoming</p>
              <h3>全部提醒</h3>
            </div>
            <div class="schedule-actions">
              <button class="small-button" id="enableScheduleNotificationsButton" type="button">开启浏览器提醒</button>
              <button class="small-button" id="refreshScheduleButton" type="button">刷新</button>
            </div>
          </div>
          <div class="schedule-list" id="scheduleList"></div>
        </section>
      </div>
    `;
    workspace.appendChild(page);
    page.querySelector("#backFromScheduleButton").addEventListener("click", showStudyPage);
    page.querySelector("#refreshScheduleButton").addEventListener("click", loadSchedule);
    page.querySelector("#scheduleManualForm").addEventListener("submit", saveManualItem);
    page.querySelector("#scheduleUploadForm").addEventListener("submit", extractFromUpload);
    page.querySelector("#enableScheduleNotificationsButton").addEventListener("click", enableNotifications);
    return page;
  }

  function hideOtherPages() {
    ["#workspacePage", "#profilePage", "#schoolCommunityPage", "#classmatesPage", "#emailReplyPage"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = true;
    });
  }

  function showStudyPage() {
    if (page) page.hidden = true;
    ["#profilePage", "#schoolCommunityPage", "#classmatesPage", "#emailReplyPage"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = true;
    });
    const workspacePage = document.querySelector("#workspacePage");
    if (workspacePage) workspacePage.hidden = false;
  }

  async function showSchedulePage() {
    installStyle();
    ensurePage();
    hideOtherPages();
    page.hidden = false;
    await loadSchedule();
  }

  async function getScheduleCourse() {
    if (scheduleCourse) return scheduleCourse;
    const result = await api("/api/courses");
    scheduleCourse = (result.courses || []).find((course) => course.name === COURSE_NAME);
    if (!scheduleCourse) {
      const created = await api("/api/courses", { method: "POST", body: { name: COURSE_NAME, term: "StudyBridge planner" } });
      scheduleCourse = created.course;
    }
    return scheduleCourse;
  }

  async function loadSchedule() {
    const status = page.querySelector("#scheduleStatusLine");
    status.textContent = "正在读取云端时间表...";
    try {
      const course = await getScheduleCourse();
      const result = await api(`/api/courses/${course.id}/documents`);
      scheduleItems = (result.documents || [])
        .filter((doc) => String(doc.title || "").startsWith(ITEM_PREFIX))
        .map(parseScheduleDoc)
        .filter(Boolean)
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
      renderSchedule();
      status.textContent = `已读取 ${scheduleItems.length} 个时间节点。`;
    } catch (error) {
      status.textContent = error.message;
      scheduleItems = [];
      renderSchedule();
    }
  }

  function parseScheduleDoc(doc) {
    try {
      const data = JSON.parse(doc.text || "{}");
      if (!data.title || !data.startsAt) return null;
      return {
        id: doc.id,
        title: String(data.title || "").slice(0, 160),
        kind: String(data.kind || "deadline").slice(0, 30),
        course: String(data.course || "").slice(0, 80),
        startsAt: data.startsAt,
        location: String(data.location || "").slice(0, 160),
        notes: String(data.notes || "").slice(0, 600),
        createdAt: doc.createdAt
      };
    } catch {
      return null;
    }
  }

  async function saveScheduleItem(item) {
    const course = await getScheduleCourse();
    const payload = {
      kind: item.kind || "deadline",
      title: item.title,
      course: item.course || "",
      startsAt: normalizeDateInput(item.startsAt),
      location: item.location || "",
      notes: item.notes || ""
    };
    if (!payload.title || !payload.startsAt) throw new Error("请填写标题和时间。");
    const dateLabel = payload.startsAt.replace("T", " ").slice(0, 16);
    await api(`/api/courses/${course.id}/documents`, {
      method: "POST",
      body: {
        title: `${ITEM_PREFIX} ${dateLabel} ${payload.title}`.slice(0, 160),
        text: JSON.stringify(payload),
        type: "Schedule"
      }
    });
  }

  async function saveManualItem(event) {
    event.preventDefault();
    const status = page.querySelector("#scheduleStatusLine");
    try {
      await saveScheduleItem({
        kind: page.querySelector("#scheduleKindInput").value,
        title: page.querySelector("#scheduleTitleInput").value.trim(),
        course: page.querySelector("#scheduleCourseInput").value.trim(),
        startsAt: page.querySelector("#scheduleDateInput").value,
        location: page.querySelector("#scheduleLocationInput").value.trim(),
        notes: page.querySelector("#scheduleNotesInput").value.trim()
      });
      page.querySelector("#scheduleManualForm").reset();
      status.textContent = "已保存到云端时间表。";
      await loadSchedule();
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function extractFromUpload(event) {
    event.preventDefault();
    const status = page.querySelector("#scheduleStatusLine");
    const submit = page.querySelector("#scheduleExtractButton");
    const input = page.querySelector("#scheduleFileInput");
    const file = input.files?.[0];
    if (!file) {
      status.textContent = "请先选择一个课程表或 syllabus 文件。";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      status.textContent = "文件太大了，请上传 8 MB 以下的文件。";
      return;
    }
    submit.disabled = true;
    try {
      status.textContent = "正在上传文件到云端...";
      const course = await getScheduleCourse();
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const payload = {
        title: `${SOURCE_PREFIX} ${file.name}`.slice(0, 160),
        fileName: file.name,
        fileType: file.type,
        type: isPdf ? "PDF" : "Schedule source"
      };
      if (isPdf) {
        payload.fileData = await readFileAsDataUrl(file);
      } else {
        payload.text = await file.text();
      }
      await api(`/api/courses/${course.id}/documents`, { method: "POST", body: payload });
      status.textContent = "AI 正在提取课程和 deadline...";
      const prompt = buildExtractionPrompt();
      const reply = await api(`/api/courses/${course.id}/chat`, {
        method: "POST",
        body: { message: prompt, mode: "deadline" }
      });
      const assistant = getAssistantMessage(reply.messages || []);
      const extracted = parseExtractedItems(assistant?.content || "");
      if (!extracted.length) throw new Error("AI 没有提取到明确时间点，可以手动添加，或换一个更清晰的 syllabus。");
      for (const item of extracted.slice(0, 40)) {
        await saveScheduleItem(item);
      }
      input.value = "";
      status.textContent = `已提取并保存 ${Math.min(extracted.length, 40)} 个时间节点。`;
      await loadSchedule();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  function buildExtractionPrompt() {
    const year = new Date().getFullYear();
    return [
      "[StudyBridge schedule extractor]",
      "Read the uploaded syllabus/course schedule in this course workspace.",
      "Ignore documents whose title starts with [SCHEDULE_ITEM].",
      "Extract class meetings, exams, quizzes, assignment deadlines, project deadlines, office-hour appointments, and important school dates.",
      "Return ONLY a valid JSON array. No markdown. No explanation.",
      "Each item must use this shape:",
      "{\"kind\":\"deadline|class|exam|meeting\",\"title\":\"short title\",\"course\":\"course code if known\",\"startsAt\":\"YYYY-MM-DDTHH:mm\",\"location\":\"optional\",\"notes\":\"optional\"}",
      `If the year is missing, infer the most likely academic year around ${year}.`,
      "If an assignment/deadline has a date but no time, use 23:59.",
      "If a class/exam has a date but no time, use 09:00.",
      "Do not invent items that are not supported by the uploaded material."
    ].join("\n");
  }

  function parseExtractedItems(text) {
    const cleaned = String(text || "")
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      const rows = JSON.parse(cleaned.slice(start, end + 1));
      if (!Array.isArray(rows)) return [];
      return rows
        .map((item) => ({
          kind: String(item.kind || "deadline").toLowerCase(),
          title: String(item.title || "").trim(),
          course: String(item.course || "").trim(),
          startsAt: normalizeDateInput(item.startsAt),
          location: String(item.location || "").trim(),
          notes: String(item.notes || "").trim()
        }))
        .filter((item) => item.title && item.startsAt);
    } catch {
      return [];
    }
  }

  function renderSchedule() {
    renderNowBox();
    renderList();
    updateEntryHint();
    checkDueNotifications();
  }

  function renderNowBox() {
    const box = page.querySelector("#scheduleNowBox");
    const next = getUpcomingItems()[0];
    if (!next) {
      box.innerHTML = `<span>最近提醒</span><strong>暂时没有 upcoming deadline</strong><span>可以手动添加，或上传 syllabus 自动提取。</span>`;
      return;
    }
    box.innerHTML = `
      <span>最近提醒</span>
      <strong>${escapeHtml(next.title)}</strong>
      <span>${escapeHtml(formatItemMeta(next))}</span>
      <span>${escapeHtml(timeUntil(next.startsAt))}</span>
    `;
  }

  function renderList() {
    const list = page.querySelector("#scheduleList");
    if (!scheduleItems.length) {
      list.innerHTML = `<p class="schedule-message">还没有时间节点。你可以手动添加，或上传 syllabus / 课程表 PDF 自动提取。</p>`;
      return;
    }
    const now = Date.now();
    list.innerHTML = scheduleItems
      .map((item) => {
        const past = new Date(item.startsAt).getTime() < now;
        return `
          <article class="schedule-item ${past ? "past" : ""}">
            <div>
              <span class="schedule-kind">${escapeHtml(kindLabel(item.kind))}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(formatItemMeta(item))}</span>
              ${item.notes ? `<span>${escapeHtml(item.notes)}</span>` : ""}
            </div>
            <button class="delete-button" type="button" data-delete-schedule="${escapeHtml(item.id)}" aria-label="删除提醒">×</button>
          </article>
        `;
      })
      .join("");
    list.querySelectorAll("[data-delete-schedule]").forEach((deleteButton) => {
      deleteButton.addEventListener("click", async () => {
        const course = await getScheduleCourse();
        await api(`/api/courses/${course.id}/documents/${deleteButton.dataset.deleteSchedule}`, { method: "DELETE" });
        await loadSchedule();
      });
    });
  }

  function updateEntryHint() {
    const hint = document.querySelector("#scheduleEntryHint");
    if (!hint) return;
    const next = getUpcomingItems()[0];
    hint.textContent = next ? `${next.title} · ${timeUntil(next.startsAt)}` : "课程、作业和 deadline 提醒";
  }

  function getUpcomingItems() {
    const now = Date.now();
    return scheduleItems.filter((item) => new Date(item.startsAt).getTime() >= now).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }

  function kindLabel(kind) {
    const labels = { deadline: "DDL", class: "上课", exam: "考试", meeting: "会议" };
    return labels[kind] || "提醒";
  }

  function formatItemMeta(item) {
    const date = new Date(item.startsAt);
    const when = Number.isNaN(date.getTime()) ? item.startsAt : date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    return [item.course, when, item.location].filter(Boolean).join(" | ");
  }

  function timeUntil(value) {
    const target = new Date(value).getTime();
    const diff = target - Date.now();
    if (Number.isNaN(target)) return "";
    if (diff < 0) return "已经过去";
    const minutes = Math.floor(diff / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days > 0) return `还有 ${days} 天 ${hours} 小时`;
    if (hours > 0) return `还有 ${hours} 小时 ${mins} 分钟`;
    return `还有 ${Math.max(1, mins)} 分钟`;
  }

  function normalizeDateInput(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("File could not be read."));
      reader.readAsDataURL(file);
    });
  }

  function getAssistantMessage(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") return messages[index];
    }
    return null;
  }

  async function enableNotifications() {
    const status = page.querySelector("#scheduleStatusLine");
    if (!("Notification" in window)) {
      status.textContent = "这个浏览器不支持通知权限。";
      return;
    }
    const permission = await Notification.requestPermission();
    status.textContent = permission === "granted" ? "浏览器提醒已开启。StudyBridge 打开时会检查最近 deadline。" : "没有开启通知权限。";
  }

  function checkDueNotifications() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = Date.now();
    const soon = scheduleItems.find((item) => {
      const target = new Date(item.startsAt).getTime();
      return target > now && target - now <= 24 * 60 * 60 * 1000;
    });
    if (!soon) return;
    const key = `studybridgeScheduleNotice:${soon.id}:${soon.startsAt}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    new Notification("StudyBridge 时间提醒", {
      body: `${soon.title} · ${timeUntil(soon.startsAt)}`,
      tag: key
    });
  }

  function boot() {
    installStyle();
    ensureButton();
    ensurePage();
  }

  boot();
  setInterval(() => {
    ensureButton();
    ensurePage();
    if (page && !page.hidden) renderSchedule();
  }, 60000);
  setInterval(() => {
    ensureButton();
    ensurePage();
  }, 1200);
})();