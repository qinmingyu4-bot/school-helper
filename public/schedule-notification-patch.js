(() => {
  const COURSE_NAME = "Schedule & Deadlines";
  const ITEM_PREFIX = "[SCHEDULE_ITEM]";
  const IN_PAGE_KEY = "studybridgeScheduleInPageReminders";

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
    if (document.querySelector("#studybridge-schedule-notification-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-schedule-notification-style";
    style.textContent = `
      .schedule-toast {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 9999;
        max-width: min(360px, calc(100vw - 32px));
        padding: 14px 16px;
        border: 1px solid rgba(47, 125, 98, 0.28);
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 18px 42px rgba(25, 36, 58, 0.18);
        color: var(--navy);
        font-size: 13px;
        line-height: 1.45;
      }

      .schedule-toast strong {
        display: block;
        margin-bottom: 3px;
        color: var(--green);
        font-size: 13px;
      }

      .schedule-item-top .schedule-kind {
        display: inline-grid !important;
        place-items: center !important;
        margin-top: 0 !important;
        padding-top: 0 !important;
        line-height: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isSecureNotificationContext() {
    return window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  }

  function showToast(title, body) {
    installStyle();
    document.querySelectorAll(".schedule-toast").forEach((toast) => toast.remove());
    const toast = document.createElement("div");
    toast.className = "schedule-toast";
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6500);
  }

  function setStatus(message) {
    const status = document.querySelector("#scheduleStatusLine");
    if (status) status.textContent = message;
  }

  function updateButton() {
    const button = document.querySelector("#enableScheduleNotificationsButton");
    if (!button) return;
    button.dataset.notificationPatch = "1";
    if (isSecureNotificationContext() && "Notification" in window && Notification.permission === "granted") {
      button.textContent = "浏览器提醒已开启";
      button.title = "StudyBridge 会在页面打开时检查最近 deadline。";
      return;
    }
    if (localStorage.getItem(IN_PAGE_KEY) === "1") {
      button.textContent = "页面提醒已开启";
      button.title = "当前网址不是 HTTPS，已使用页面内提醒。";
      return;
    }
    button.textContent = isSecureNotificationContext() ? "开启浏览器提醒" : "开启页面提醒";
    button.title = isSecureNotificationContext()
      ? "允许 StudyBridge 发送浏览器通知。"
      : "当前是 HTTP 网址，无法开启系统通知；可以开启页面内提醒。";
  }

  async function handleReminderClick(event) {
    const button = event.target.closest?.("#enableScheduleNotificationsButton");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isSecureNotificationContext() && "Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setStatus("浏览器提醒已开启。StudyBridge 打开时会检查最近 deadline。");
        showToast("提醒已开启", "之后页面打开时，临近 deadline 会弹出浏览器通知。");
      } else {
        localStorage.setItem(IN_PAGE_KEY, "1");
        setStatus("浏览器通知没有被允许，已改用页面内提醒。");
        showToast("页面提醒已开启", "浏览器通知未授权，所以先用页面内提醒。");
      }
    } else {
      localStorage.setItem(IN_PAGE_KEY, "1");
      setStatus("当前网址不是 HTTPS，系统通知不可用；已开启页面内提醒。");
      showToast("页面提醒已开启", "当前服务器是 HTTP 访问，浏览器不允许系统通知。绑定域名并开启 HTTPS 后可以升级成系统通知。");
    }
    updateButton();
    checkReminders().catch(() => {});
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
        completedAt: data.completedAt || ""
      };
    } catch {
      return null;
    }
  }

  function timeUntil(value) {
    const diff = new Date(value).getTime() - Date.now();
    if (Number.isNaN(diff)) return "";
    if (diff < 0) return "已经过期";
    const minutes = Math.max(1, Math.ceil(diff / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days > 0) return `${days}天${hours}小时`;
    if (hours > 0) return `${hours}小时${mins}分钟`;
    return `${mins}分钟`;
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

  async function checkReminders() {
    const nativeReady = isSecureNotificationContext() && "Notification" in window && Notification.permission === "granted";
    const inPageReady = localStorage.getItem(IN_PAGE_KEY) === "1";
    if (!nativeReady && !inPageReady) return;
    const now = Date.now();
    const soon = (await loadItems()).find((item) => {
      if (item.completedAt) return false;
      const target = new Date(item.startsAt).getTime();
      return target > now && target - now <= 24 * 60 * 60 * 1000;
    });
    if (!soon) return;
    const key = `studybridgeScheduleNotice:${soon.id}:${soon.startsAt}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    const body = `${soon.course ? `${soon.course} · ` : ""}${timeUntil(soon.startsAt)}后 due`;
    if (nativeReady) {
      new Notification("StudyBridge 时间提醒", { body: `${soon.title} · ${body}`, tag: key });
    } else {
      showToast(soon.title, body);
    }
  }

  document.addEventListener("click", handleReminderClick, true);
  setInterval(() => {
    updateButton();
    checkReminders().catch(() => {});
  }, 10000);
  setInterval(updateButton, 1000);
  setTimeout(updateButton, 800);
})();
