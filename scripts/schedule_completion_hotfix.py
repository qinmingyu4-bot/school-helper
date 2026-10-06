from pathlib import Path
import re


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


# lib/database.js: allow updating persisted documents.
path = Path("lib/database.js")
text = path.read_text(encoding="utf-8")
if "async updateDocument(userId, courseId, documentId, patch)" not in text:
    marker = """  async deleteDocument(userId, courseId, documentId) {\n"""
    insert = """  async updateDocument(userId, courseId, documentId, patch) {
    const existing = this.dynamo
      ? await this.dynamo.get(`USER#${userId}`, `COURSE#${courseId}#DOC#${documentId}`)
      : await this.local.read((db) => db.documents[documentId] || null);
    if (!existing || existing.userId !== userId || existing.courseId !== courseId) return null;
    const updated = { ...existing, ...patch, id: documentId, userId, courseId, kind: "document", updatedAt: now() };
    if (this.dynamo) {
      return this.dynamo.put(
        `USER#${userId}`,
        `COURSE#${courseId}#DOC#${documentId}`,
        "document",
        updated
      );
    }
    return this.local.write((db) => {
      db.documents[documentId] = updated;
      return updated;
    });
  }

"""
    if marker not in text:
        raise SystemExit("Missing database deleteDocument marker")
    text = text.replace(marker, insert + marker)
    write(path, text)


# server.js: expose PATCH/PUT for course documents.
path = Path("server.js")
text = path.read_text(encoding="utf-8")
if "method === \"PUT\" || method === \"PATCH\"" not in text:
    marker = """    if (child === "documents" && childId && method === "DELETE") {\n"""
    insert = """    if (child === "documents" && childId && (method === "PUT" || method === "PATCH")) {
      const body = await readJson(req);
      const title = String(body.title || "Course note").trim().slice(0, 160);
      let text;
      try {
        text = compactDocumentText(body.text);
      } catch (error) {
        return sendError(res, 400, error.message);
      }
      if (!title || !text) return sendError(res, 400, "Document title and text are required.");
      const document = await db.updateDocument(user.id, courseId, childId, {
        title,
        text,
        type: String(body.type || "Note").slice(0, 60)
      });
      if (!document) return sendError(res, 404, "Document not found.");
      return sendJson(res, 200, { document });
    }
"""
    if marker not in text:
        raise SystemExit("Missing server delete document marker")
    text = text.replace(marker, insert + marker)
    write(path, text)


# public/schedule-patch.js: completed list + completion action.
path = Path("public/schedule-patch.js")
text = path.read_text(encoding="utf-8")
if ".schedule-item.completed" not in text:
    text = text.replace("""      .schedule-item.past {
        opacity: 0.58;
      }

""", """      .schedule-item.past {
        opacity: 0.58;
      }

      .schedule-item.completed {
        background: #f7faf9;
        opacity: 0.76;
      }

""")
if ".schedule-item-actions" not in text:
    text = text.replace("""      .schedule-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

""", """      .schedule-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .schedule-item-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .schedule-complete-button {
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid rgba(47, 125, 98, 0.24);
        border-radius: 8px;
        background: rgba(47, 125, 98, 0.08);
        color: var(--green);
        font-weight: 850;
      }

      .schedule-complete-button:hover {
        border-color: var(--green);
        background: rgba(47, 125, 98, 0.14);
      }

      .schedule-section-title {
        margin: 6px 0 2px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

""")
text = text.replace("""        notes: String(data.notes || "").slice(0, 600),
        createdAt: doc.createdAt
""", """        notes: String(data.notes || "").slice(0, 600),
        completedAt: data.completedAt || "",
        createdAt: doc.createdAt
""")
if "function schedulePayload(item, overrides = {})" not in text:
    old_save = """  async function saveScheduleItem(item) {
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
"""
    new_save = """  function schedulePayload(item, overrides = {}) {
    return {
      kind: item.kind || "deadline",
      title: item.title,
      course: item.course || "",
      startsAt: normalizeDateInput(item.startsAt),
      location: item.location || "",
      notes: item.notes || "",
      completedAt: item.completedAt || "",
      ...overrides
    };
  }

  function scheduleDocumentTitle(payload) {
    const dateLabel = payload.startsAt.replace("T", " ").slice(0, 16);
    return `${ITEM_PREFIX} ${dateLabel} ${payload.title}`.slice(0, 160);
  }

  async function saveScheduleItem(item) {
    const course = await getScheduleCourse();
    const payload = schedulePayload(item);
    if (!payload.title || !payload.startsAt) throw new Error("请填写标题和时间。");
    await api(`/api/courses/${course.id}/documents`, {
      method: "POST",
      body: {
        title: scheduleDocumentTitle(payload),
        text: JSON.stringify(payload),
        type: "Schedule"
      }
    });
  }

  async function updateScheduleItem(item, overrides = {}) {
    const course = await getScheduleCourse();
    const payload = schedulePayload(item, overrides);
    if (!payload.title || !payload.startsAt) throw new Error("这条提醒缺少标题或时间，不能更新。");
    await api(`/api/courses/${course.id}/documents/${item.id}`, {
      method: "PATCH",
      body: {
        title: scheduleDocumentTitle(payload),
        text: JSON.stringify(payload),
        type: "Schedule"
      }
    });
  }

  async function completeScheduleItem(itemId) {
    const item = scheduleItems.find((row) => row.id === itemId);
    if (!item) return;
    await updateScheduleItem(item, { completedAt: new Date().toISOString() });
    await loadSchedule();
  }
"""
    if old_save not in text:
        raise SystemExit("Missing schedule saveScheduleItem block")
    text = text.replace(old_save, new_save)

new_render = """  function renderList() {
    const list = page?.querySelector("#scheduleList");
    if (!list) return;
    if (!scheduleItems.length) {
      list.innerHTML = `<p class="schedule-message">还没有时间节点。你可以手动添加，或上传 syllabus / 课程表 PDF 自动提取。</p>`;
      return;
    }
    const now = Date.now();
    const activeItems = scheduleItems.filter((item) => !item.completedAt);
    const completedItems = scheduleItems.filter((item) => item.completedAt);
    const renderItem = (item, completed = false) => {
      const past = new Date(item.startsAt).getTime() < now;
      const countdown = countdownParts(item.startsAt);
      return `
        <article class="schedule-item ${past ? "past" : ""} ${completed ? "completed" : ""}">
          <div>
            <div class="schedule-item-top">
              <span class="schedule-kind">${escapeHtml(kindLabel(item.kind))}</span>
              <span class="schedule-countdown-pill ${completed || past ? "past" : countdown.totalMinutes <= 24 * 60 ? "urgent" : ""}">
                ${escapeHtml(completed ? "已完成" : past ? "已过期" : timeUntil(item.startsAt))}
              </span>
            </div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(formatItemMeta(item))}</span>
            ${item.notes ? `<span>${escapeHtml(item.notes)}</span>` : ""}
          </div>
          <div class="schedule-item-actions">
            ${completed ? "" : `<button class="schedule-complete-button" type="button" data-complete-schedule="${escapeHtml(item.id)}">已完成</button>`}
            <button class="delete-button" type="button" data-delete-schedule="${escapeHtml(item.id)}" aria-label="删除提醒">×</button>
          </div>
        </article>
      `;
    };
    list.innerHTML = [
      activeItems.length
        ? `<p class="schedule-section-title">未完成</p>${activeItems.map((item) => renderItem(item)).join("")}`
        : `<p class="schedule-message">没有未完成的提醒。</p>`,
      completedItems.length
        ? `<p class="schedule-section-title">已完成</p>${completedItems.map((item) => renderItem(item, true)).join("")}`
        : `<p class="schedule-section-title">已完成</p><p class="schedule-message">完成 deadline 后会进入这里，不再继续提醒。</p>`
    ].join("");
    list.querySelectorAll("[data-complete-schedule]").forEach((completeButton) => {
      completeButton.addEventListener("click", async () => {
        completeButton.disabled = true;
        completeButton.textContent = "保存中";
        await completeScheduleItem(completeButton.dataset.completeSchedule);
      });
    });
    list.querySelectorAll("[data-delete-schedule]").forEach((deleteButton) => {
      deleteButton.addEventListener("click", async () => {
        const course = await getScheduleCourse();
        await api(`/api/courses/${course.id}/documents/${deleteButton.dataset.deleteSchedule}`, { method: "DELETE" });
        await loadSchedule();
      });
    });
  }

"""
text = re.sub(r"  function renderList\(\) \{.*?\n  function updateEntryHint\(\) \{", new_render + "  function updateEntryHint() {", text, flags=re.S)
text = re.sub(
    r"  function getUpcomingItems\(\) \{.*?\n  function kindLabel\(kind\) \{",
    """  function getUpcomingItems() {
    const now = Date.now();
    return scheduleItems
      .filter((item) => !item.completedAt && new Date(item.startsAt).getTime() >= now)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }

  function kindLabel(kind) {""",
    text,
    flags=re.S,
)
text = text.replace("""    const soon = scheduleItems.find((item) => {
      const target = new Date(item.startsAt).getTime();
""", """    const soon = scheduleItems.find((item) => {
      if (item.completedAt) return false;
      const target = new Date(item.startsAt).getTime();
""")
write(path, text)


# Dashboard patch: skip completed schedule items.
path = Path("public/schedule-dashboard-patch.js")
text = path.read_text(encoding="utf-8")
text = text.replace("""        startsAt: data.startsAt,
        location: String(data.location || "").slice(0, 160)
""", """        startsAt: data.startsAt,
        location: String(data.location || "").slice(0, 160),
        completedAt: data.completedAt || ""
""")
text = text.replace("""    const upcoming = items.filter((item) => new Date(item.startsAt).getTime() >= now);
""", """    const upcoming = items.filter((item) => !item.completedAt && new Date(item.startsAt).getTime() >= now);
""")
write(path, text)


# Notification patch: skip completed schedule items.
path = Path("public/schedule-notification-patch.js")
text = path.read_text(encoding="utf-8")
text = text.replace("""        startsAt: data.startsAt
""", """        startsAt: data.startsAt,
        completedAt: data.completedAt || ""
""")
text = text.replace("""    const soon = (await loadItems()).find((item) => {
      const target = new Date(item.startsAt).getTime();
""", """    const soon = (await loadItems()).find((item) => {
      if (item.completedAt) return false;
      const target = new Date(item.startsAt).getTime();
""")
write(path, text)
