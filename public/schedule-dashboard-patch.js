(() => {
  const COURSE_NAME = "Schedule & Deadlines";
  const ITEM_PREFIX = "[SCHEDULE_ITEM]";
  let lastRenderKey = "";
  let lastItems = [];
  let rendering = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(path) {
    const response = await fetch(path);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function installStyle() {
    if (document.querySelector("#studybridge-schedule-dashboard-patch-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-schedule-dashboard-patch-style";
    style.textContent = `
      .schedule-dashboard-list {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }

      .schedule-dashboard-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 9px 10px;
        border: 1px solid rgba(31, 58, 95, 0.1);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.72);
      }

      .schedule-dashboard-row strong,
      .schedule-dashboard-row span {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .schedule-dashboard-row strong {
        color: var(--navy);
        font-size: 14px;
        line-height: 1.2;
      }

      .schedule-dashboard-row span {
        margin-top: 3px;
        color: var(--muted);
        font-size: 12px;
      }

      .schedule-dashboard-mini-countdown {
        display: inline-grid !important;
        place-items: center;
        min-width: 92px;
        min-height: 30px;
        margin: 0 !important;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(47, 125, 98, 0.11);
        color: var(--green) !important;
        font-size: 12px !important;
        font-weight: 850;
      }

      .schedule-dashboard-side {
        display: grid;
        align-content: center;
        justify-items: center;
        gap: 8px;
        min-width: 138px;
      }

      .schedule-dashboard-more {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
        text-align: center;
      }

      .schedule-dashboard-open {
        display: inline-grid;
        place-items: center;
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid rgba(31, 58, 95, 0.16);
        border-radius: 8px;
        background: white;
        color: var(--navy);
        font-size: 13px;
        font-weight: 850;
        box-shadow: 0 8px 20px rgba(25, 36, 58, 0.06);
      }
    `;
    document.head.appendChild(style);
  }

  function parseScheduleDoc(doc) {
    try {
      if (!String(doc.title || "").startsWith(ITEM_PREFIX)) return null;
      const data = JSON.parse(doc.text || "{}");
      if (!data.title || !data.startsAt) return null;
      return {
        id: doc.id,
        title: String(data.title || "").slice(0, 160),
        course: String(data.course || "").slice(0, 80),
        startsAt: data.startsAt,
        location: String(data.location || "").slice(0, 160)
      };
    } catch {
      return null;
    }
  }

  function countdownParts(value) {
    const target = new Date(value).getTime();
    const diff = target - Date.now();
    if (Number.isNaN(target)) return { past: false, totalMinutes: 0, primary: "--", secondary: "倒计时", compact: "" };
    if (diff < 0) return { past: true, totalMinutes: Math.floor(diff / 60000), primary: "已过期", secondary: "请尽快处理", compact: "已过期" };
    const minutes = Math.max(1, Math.ceil(diff / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days > 0) {
      return {
        past: false,
        totalMinutes: minutes,
        primary: hours > 0 ? `${days}天${hours}小时` : `${days}天`,
        secondary: "后 due",
        compact: `${days}天${hours}小时`
      };
    }
    if (hours > 0) return { past: false, totalMinutes: minutes, primary: `${hours}小时`, secondary: `${mins}分钟后 due`, compact: `${hours}小时${mins}分钟` };
    return { past: false, totalMinutes: minutes, primary: `${mins}分钟`, secondary: "马上要 due", compact: `${mins}分钟` };
  }

  function timeUntil(value) {
    const countdown = countdownParts(value);
    return countdown.past ? "已经过去" : `还有 ${countdown.compact}`;
  }

  function formatItemMeta(item) {
    const date = new Date(item.startsAt);
    const when = Number.isNaN(date.getTime())
      ? item.startsAt
      : date.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return [item.course, when, item.location].filter(Boolean).join(" | ");
  }

  async function loadItems() {
    const courseResult = await api("/api/courses");
    const course = (courseResult.courses || []).find((row) => row.name === COURSE_NAME);
    if (!course) return [];
    const docsResult = await api(`/api/courses/${course.id}/documents`);
    return (docsResult.documents || [])
      .map(parseScheduleDoc)
      .filter(Boolean)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  }

  function renderDashboard(items) {
    const card = document.querySelector("#scheduleDashboard");
    if (!card) return;
    rendering = true;
    const now = Date.now();
    const upcoming = items.filter((item) => new Date(item.startsAt).getTime() >= now);
    const fiveDaysFromNow = now + 5 * 24 * 60 * 60 * 1000;
    const nextFiveDays = upcoming.filter((item) => new Date(item.startsAt).getTime() <= fiveDaysFromNow);
    const renderKey = JSON.stringify(nextFiveDays.map((item) => [item.id, item.startsAt, item.title]));
    if (renderKey === lastRenderKey && card.querySelector("[data-dashboard-patch='1']")) {
      rendering = false;
      return;
    }
    lastRenderKey = renderKey;

    if (!nextFiveDays.length) {
      card.classList.remove("urgent");
      card.innerHTML = `
        <div data-dashboard-patch="1">
          <p class="eyebrow">Next Due</p>
          <h3>5 天内暂时没有 deadline</h3>
          <span class="schedule-dashboard-meta">${upcoming[0] ? `下一个是 ${escapeHtml(upcoming[0].title)} · ${escapeHtml(timeUntil(upcoming[0].startsAt))}` : "添加作业、考试或上传 syllabus 后，这里会直接显示最近倒计时。"}</span>
        </div>
        <div class="schedule-dashboard-countdown">
          <strong>--</strong>
          <span>倒计时</span>
        </div>
      `;
      rendering = false;
      return;
    }

    const visible = nextFiveDays.slice(0, 3);
    const firstCountdown = countdownParts(visible[0].startsAt);
    card.classList.toggle("urgent", !firstCountdown.past && firstCountdown.totalMinutes <= 24 * 60);

    if (visible.length === 1) {
      card.innerHTML = `
        <div data-dashboard-patch="1">
          <p class="eyebrow">最近要做</p>
          <h3>${escapeHtml(visible[0].title)}</h3>
          <span class="schedule-dashboard-meta">${escapeHtml(formatItemMeta(visible[0]))}</span>
        </div>
        <div class="schedule-dashboard-countdown">
          <strong>${escapeHtml(firstCountdown.primary)}</strong>
          <span>${escapeHtml(firstCountdown.secondary)}</span>
        </div>
      `;
      rendering = false;
      return;
    }

    card.innerHTML = `
      <div data-dashboard-patch="1">
        <p class="eyebrow">最近要做</p>
        <h3>5 天内有 ${nextFiveDays.length} 个任务</h3>
        <div class="schedule-dashboard-list">
          ${visible
            .map((item) => {
              const itemCountdown = countdownParts(item.startsAt);
              return `
                <div class="schedule-dashboard-row">
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(formatItemMeta(item))}</span>
                  </div>
                  <span class="schedule-dashboard-mini-countdown">${escapeHtml(itemCountdown.compact || itemCountdown.primary)}</span>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="schedule-dashboard-side">
        ${nextFiveDays.length > 3 ? `<span class="schedule-dashboard-more">五天内更多需完成</span>` : ""}
        <span class="schedule-dashboard-open">查看时间表</span>
      </div>
    `;
    rendering = false;
  }

  async function refreshDashboard() {
    if (document.querySelector("#appShell")?.hidden) return;
    installStyle();
    try {
      lastItems = await loadItems();
      renderDashboard(lastItems);
    } catch {
      // Keep the existing dashboard if the network is temporarily unavailable.
    }
  }

  function watchDashboard() {
    const card = document.querySelector("#scheduleDashboard");
    if (!card || card.dataset.dashboardWatcher === "1") return;
    card.dataset.dashboardWatcher = "1";
    const observer = new MutationObserver(() => {
      if (!rendering && lastItems.length && !card.querySelector("[data-dashboard-patch='1']")) {
        renderDashboard(lastItems);
      }
    });
    observer.observe(card, { childList: true, subtree: false });
  }

  setInterval(() => {
    watchDashboard();
    refreshDashboard();
  }, 5000);
  setInterval(watchDashboard, 1000);
  setTimeout(refreshDashboard, 1400);
  setTimeout(refreshDashboard, 3200);
})();
