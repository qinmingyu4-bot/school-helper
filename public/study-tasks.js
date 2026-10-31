(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeStudyTasks = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const active = (job) => ["accepting", "queued", "planning", "running"].includes(job.status);
  const key = (context) => JSON.stringify([context?.userId, context?.courseId, context?.conversationId]);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function create({ request, getContext, visible = () => true, onChange, text = (value) => value, progress = (done, total) => `已完成 ${done}/${total} 题`, pollMs = 1500 }) {
    let context = null, jobs = [], generation = 0, timer = null, owner = null, failure = "";
    const pending = new Set();
    const current = (expected, sequence) => sequence === generation && key(getContext()) === key(expected) && visible();
    function schedule() {
      clearTimeout(timer);
      if (jobs.some(active) && visible()) timer = setTimeout(() => void sync(), pollMs);
    }
    async function sync() {
      const expected = context, sequence = generation;
      if (!expected || !current(expected, sequence)) return;
      try {
        const response = await request(`/api/courses/${expected.courseId}/study-jobs?conversationId=${encodeURIComponent(expected.conversationId)}`);
        if (!current(expected, sequence)) return;
        const next = response.jobs || [], changed = JSON.stringify(next) !== JSON.stringify(jobs) || failure;
        jobs = next; failure = ""; if (changed) onChange?.();
      } catch {
        if (!current(expected, sequence)) return;
        failure = "进度暂时无法更新，后台任务仍在继续。"; onChange?.();
      } finally { if (current(expected, sequence)) schedule(); }
    }
    async function load(next) {
      clearTimeout(timer); generation++;
      if (owner !== next.userId || key(context) !== key(next)) jobs = [];
      owner = next.userId; context = { ...next }; failure = "";
      await sync();
    }
    function accept(expected, job) {
      if (key(getContext()) !== key(expected)) return;
      if (key(context) !== key(expected)) { jobs = []; generation++; }
      context = { ...expected }; owner = expected.userId;
      jobs = [job, ...jobs.filter((item) => item.id !== job.id)]; onChange?.(); schedule();
    }
    async function action(id, action) {
      const job = jobs.find((item) => item.id === id);
      if (!job || pending.has(id)) return;
      const expected = { ...context }, sequence = generation;
      pending.add(id); onChange?.();
      try {
        const response = await request(`/api/courses/${expected.courseId}/study-jobs/${id}`, { method: "POST", body: { action } });
        if (!current(expected, sequence)) return;
        jobs = jobs.map((item) => item.id === id ? response.job : item); failure = "";
      } finally { pending.delete(id); if (current(expected, sequence)) { onChange?.(); schedule(); } }
    }
    function mergeMessages(messages) {
      if (key(context) !== key(getContext())) return messages;
      const result = [...messages];
      for (const job of jobs) {
        const parent = result.findIndex((message) => message.id === job.messageId);
        if (parent < 0) continue;
        const existing = result.findIndex((message) => message.id === job.assistantId || message.studyJobId === job.id && message.role === "assistant");
        const previous = existing >= 0 ? result[existing] : { role: "assistant", id: job.assistantId };
        const next = { ...previous, studyJobId: job.id, studyTask: job, pending: false,
          content: active(job) || previous.studyTask || !previous.content ? job.content : previous.content };
        if (existing >= 0) result[existing] = next; else result.splice(parent + 1, 0, next);
      }
      return result;
    }
    function html(job) {
      const labels = { accepting: "正在保存题目", queued: "等待处理", planning: "正在识别题目并匹配课程资料", running: "正在分批解答", completed: "整套题已完成", partial: "部分题目需要重试", failed: "任务未完成", canceled: "任务已停止", needs_input: "请补充标明题号的清晰题图或资料" };
      return `<div class="study-task-status" role="status"><span>${esc(text(labels[job.status] || "等待处理"))}${job.total ? ` · ${esc(progress(job.completed, job.total))}` : ""}</span>${active(job) ? `<button type="button" data-action="study-task-cancel" data-job="${esc(job.id)}" ${pending.has(job.id) ? "disabled" : ""}>${esc(text("停止任务"))}</button>` : ["partial", "failed", "canceled"].includes(job.status) ? `<button type="button" data-action="study-task-retry" data-job="${esc(job.id)}" ${pending.has(job.id) ? "disabled" : ""}>${esc(text("重试未完成题目"))}</button>` : ""}${job.error ? `<span class="reply-notice">${esc(text(job.error))}</span>` : ""}${failure ? `<span class="reply-notice">${esc(text(failure))}</span>` : ""}${active(job) ? `<small>${esc(text("后台会继续处理，刷新页面可恢复进度。"))}</small>` : ""}</div>`;
    }
    return { load, accept, action, mergeMessages, html, active: () => key(context) === key(getContext()) ? jobs.find(active) : null,
      clear() { generation++; clearTimeout(timer); jobs = []; context = null; owner = null; pending.clear(); } };
  }
  return { create, active };
});
