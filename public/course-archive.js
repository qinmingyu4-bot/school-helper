(function (scope, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else scope.StudyBridgeCourseArchive = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const ui = typeof module === "object" && module.exports ? require("./i18n") : globalThis.StudyBridgeI18n;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  function mount({ root, request, getUser, onRestore }) {
    const owner = getUser().id;
    let courses = [], selected = null, history = null, busy = false, disposed = false, generation = 0, error = "";
    const valid = () => !disposed && getUser()?.id === owner;
    const courseUrl = (id) => `/api/courses/${encodeURIComponent(id)}`;
    function paint() {
      if (!valid()) return;
      root.innerHTML = ui.html`
        <div class="course-archive-heading"><h4>历史课程</h4><button type="button" data-archive-refresh ${busy ? "disabled" : ""}>刷新</button></div>
        <p class="settings-caption">学期结束后，可在课程旁选择存档。在这里查看过去的资料和对话，或恢复到学习区。</p>
        <p class="settings-caption ${error ? "is-error" : ""}" role="status" aria-live="polite">${esc(error || (busy ? ui.text("正在读取历史课程…") : ""))}</p>
        ${selected ? ui.html`
          <button type="button" data-archive-back ${busy ? "disabled" : ""}>‹ 所有历史课程</button>
          <div class="course-archive-heading"><div><strong>${esc(selected.name)}</strong><small>${esc(selected.term === "Current term" ? "" : selected.term)}</small></div><button type="button" data-archive-restore ${busy ? "disabled" : ""}>恢复到学习区</button></div>
          ${history ? ui.html`<h5>课程资料</h5><div class="course-archive-materials">${history.documents.length ? history.documents.map((document) => ui.html`<details><summary>${esc(document.title)}</summary><div class="course-archive-text">${esc(document.text || ui.text("暂无可显示的文字"))}</div>${document.hasSourcePdf ? `<a href="${courseUrl(selected.id)}/history?documentId=${encodeURIComponent(document.id)}" target="_blank" rel="noopener noreferrer">${ui.text("查看原始 PDF ↗")}</a>` : ""}</details>`).join("") : ui.html`<p class="settings-caption">暂无课程资料</p>`}</div>
          <h5>对话记录</h5><div class="course-archive-conversations">${history.conversations.map((conversation) => `<details data-archive-chat="${esc(conversation.id)}"><summary>${esc(conversation.title)}</summary><div data-archive-messages><button type="button" data-archive-read="${esc(conversation.id)}">${ui.text("读取对话")}</button></div></details>`).join("")}</div>` : ""}
        ` : courses.length ? courses.map((course) => `<div class="settings-row course-archive-row"><div><strong>${esc(course.name)}</strong><small>${esc(course.term === "Current term" ? "" : course.term)}</small></div><button type="button" data-archive-view="${esc(course.id)}" ${busy ? "disabled" : ""}>${ui.text("查看历史")}</button></div>`).join("") : !busy && !error ? ui.html`<p class="settings-caption">还没有存档课程</p>` : ""}
      `;
    }
    async function load(course = null) {
      if (!valid() || busy) return;
      const token = ++generation;
      selected = course; history = null; error = ""; busy = true; paint();
      try {
        const data = await request(course ? courseUrl(course.id) + "/history" : "/api/courses?archived=true");
        if (!valid() || token !== generation) return;
        if (course) history = data;
        else courses = data.courses;
      } catch (failure) {
        if (valid() && token === generation) error = failure.message;
      } finally {
        if (valid() && token === generation) { busy = false; paint(); }
      }
    }
    async function readChat(details) {
      if (details.dataset.loaded || !selected || !valid()) return;
      details.dataset.loaded = "pending";
      const token = generation;
      const content = details.querySelector("[data-archive-messages]");
      content.textContent = ui.text("正在读取对话…");
      try {
        const data = await request(courseUrl(selected.id) + "/history?conversationId=" + encodeURIComponent(details.dataset.archiveChat));
        if (!valid() || generation !== token || !details.isConnected) return;
        content.innerHTML = data.messages.length ? data.messages.map((message) => `<article class="course-archive-message"><strong>${ui.text(message.role === "user" ? "你" : "AI")}</strong><div class="course-archive-text">${esc(message.displayText ?? message.content)}</div>${(message.attachments || []).map((file) =>
          globalThis.StudyBridgeChatAttachments?.isPreviewUrl(file.url)
            ? `<a href="${esc(file.url)}" target="_blank" rel="noopener noreferrer">${esc(file.name)}</a>` : `<small>${esc(file.name)}</small>`).join("")}</article>`).join("") : ui.html`<p class="settings-caption">这段对话还没有消息。</p>`;
        details.dataset.loaded = "true";
      } catch (failure) {
        if (valid() && generation === token && details.isConnected) {
          delete details.dataset.loaded;
          content.innerHTML = `<p role="status">${esc(failure.message)}</p><button type="button" data-archive-read="${esc(details.dataset.archiveChat)}">${ui.text("重试")}</button>`;
        }
      }
    }
    root.addEventListener("toggle", (event) => {
      const details = event.target;
      if (details.matches("[data-archive-chat]") && details.open) void readChat(details);
    }, true);
    root.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button || !valid()) return;
      if (button.hasAttribute("data-archive-read")) { await readChat(button.closest("details")); return; }
      if (busy) return;
      if (button.hasAttribute("data-archive-refresh")) { await load(selected); return; }
      if (button.hasAttribute("data-archive-back")) { await load(); return; }
      if (button.dataset.archiveView) { await load(courses.find((course) => course.id === button.dataset.archiveView)); return; }
      if (button.hasAttribute("data-archive-restore") && selected) {
        const course = selected;
        busy = true; error = ""; paint();
        try {
          await request(courseUrl(course.id) + "/archive", { method: "PUT", body: { archived: false } });
          if (!valid()) return;
          await onRestore();
          if (!valid()) return;
          busy = false;
          await load();
        } catch (failure) {
          if (valid()) { error = failure.message; busy = false; paint(); }
        }
      }
    });
    const unsubscribe = ui.subscribe(paint);
    paint();
    return { activate: () => load(), dispose: () => { disposed = true; generation++; unsubscribe(); } };
  }
  return { mount };
});
