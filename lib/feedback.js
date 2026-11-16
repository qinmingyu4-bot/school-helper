const { createHash, randomUUID } = require("node:crypto");
const { createFeedbackStore } = require("./feedback-store");
const { pages, operations, operation, codeLabel } = require("../public/feedback-context");

const HOUR = 3600000;
const RETENTION_DAYS = 90;
const LIMIT = 5;
const PAGE_SIZE = 20;
const issueId = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z-[a-f0-9]{24}$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const reportCode = /^(?:HTTP-(?:4\d\d|5\d\d)|UPLOAD_PARSE|CONNECTION|STREAM|MANUAL)$/;
const deviceFamilies = ["iOS", "Android", "Windows", "macOS", "Linux", "Unknown"];
const browserFamilies = ["Edge", "Firefox", "Chrome", "Safari", "Unknown"];
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const iso = (time) => new Date(time).toISOString();
const digest = (parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24);
const compact = (value, length) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, length) : "";

function environment(userAgent) {
  const ua = String(userAgent || "").slice(0, 512);
  const devices = [/iPhone|iPad|iPod/i, /Android/i, /Windows/i, /Macintosh/i, /Linux/i];
  const browsers = [/Edg[eAiOS]*\//i, /(?:Firefox|FxiOS)\//i, /(?:Chrome|CriOS)\//i, /Safari\//i];
  return {
    device: deviceFamilies[devices.findIndex(pattern => pattern.test(ua))] || "Unknown",
    browser: browserFamilies[browsers.findIndex(pattern => pattern.test(ua))] || "Unknown"
  };
}

function createFeedback({ db, sendEmail, recipient, version, origin, now = Date.now, interval = 10000 }) {
  const store = createFeedbackStore(db, { retentionDays: RETENTION_DAYS, now });
  let timer, running, stopped = false;

  const snapshot = (user) => ({ id: user.id, name: compact(user.name, 80), email: compact(user.email, 254) });
  const mail = (time) => {
    const configured = Boolean(recipient());
    return { state: configured ? "queued" : "unconfigured", attempts: 0, updatedAt: time, nextAt: configured ? time : null };
  };
  const initialize = ({ id, user, ...details }, time) => ({
    id, user: snapshot(user), ...details, status: "new", firstAt: time, lastAt: time, count: 1, revision: 1, mail: mail(time)
  });
  function retryConflict() { return fail(409, "反馈已更新，请刷新后重试。"); }

  async function change(id, update) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const before = await store.get(id), next = update(before);
      if (!next) return before;
      next.revision = (before?.revision || 0) + 1;
      if (await store.save(next, before)) return next;
    }
    throw retryConflict();
  }

  async function observe({ user, path, method, feature, status, requestId, durationMs, occurredAt, userAgent, kind, background = false }) {
    if (status < 500 || status > 599 || !Number.isInteger(status) || !user) return;
    const [area, action] = background
      ? feature === "study" ? ["study", "practice"] : ["tools", "generate"]
      : operation(path, method, feature === "mailbox" ? "email" : feature);
    if (action === "other") return;
    const time = iso(occurredAt);
    const code = `HTTP-${status}`;
    const id = `${iso(Math.floor(occurredAt / HOUR) * HOUR)}-${digest([user.id, area, action, code])}`;
    const diagnostics = { ...environment(userAgent), version: version(), durationMs, background,
      requestId: uuid.test(requestId || "") ? requestId : "", kind: kind || "" };
    const issue = await change(id, (before) => {
      if (!before) return initialize({ id, user, area, action, code, source: "automatic", diagnostics }, time);
      if (before.diagnostics.requestId === diagnostics.requestId) return null;
      const latest = time >= before.lastAt;
      return { ...before, count: before.count + 1, firstAt: time < before.firstAt ? time : before.firstAt, lastAt: latest ? time : before.lastAt,
        diagnostics: latest ? diagnostics : before.diagnostics,
        // A new occurrence after the admin closes a report deserves review.
        status: before.status === "resolved" && time > before.resolvedAt ? "new" : before.status };
    });
    console.info(`StudyBridge feedback ${issue.id}: ${code} ${area}/${action} request=${diagnostics.requestId}`);
  }

  async function submit(user, body, userAgent) {
    if (!body || typeof body.clientId !== "string" || !uuid.test(body.clientId) || body.userId !== user.id) throw fail(400, "反馈请求无效，请重新打开表单。");
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > 1000) throw fail(400, "问题描述请控制在 1000 字以内。");
    const code = typeof body.code === "string" && reportCode.test(body.code) ? body.code : "MANUAL";
    if (!note && code === "MANUAL") throw fail(400, "请描述你遇到的问题。");
    const timestamp = now(), time = iso(timestamp);
    const area = typeof body.area === "string" && Object.hasOwn(pages, body.area) ? body.area : "other";
    const action = typeof body.action === "string" && Object.hasOwn(operations, body.action) ? body.action : "other";
    const clientTrace = typeof body.requestId === "string" && uuid.test(body.requestId) ? body.requestId : "";
    const related = clientTrace ? (await db.listUsageDays([time.slice(0, 10), iso(timestamp - 86400000).slice(0, 10)], user.id))
      .flatMap(({ errors }) => errors).find(({ id }) => id === clientTrace) : null;
    const reportedAt = Date.parse(body.occurredAt);
    const diagnostics = { ...environment(userAgent), version: version(), requestId: related ? clientTrace : "",
      occurredAt: related?.at || (Number.isFinite(reportedAt) && reportedAt <= timestamp && reportedAt >= timestamp - HOUR ? iso(reportedAt) : time) };
    for (let attempt = 0; attempt < 8; attempt++) {
      const old = await store.getRate(user.id);
      const recent = (old?.recent || []).filter((item) => Date.parse(item.at) > timestamp - 24 * HOUR);
      const replay = recent.find(({ clientId }) => clientId === body.clientId);
      if (replay) return { id: replay.id };
      if (recent.length >= LIMIT) throw fail(429, "今天提交的问题反馈已达上限，请稍后再试。");
      const id = `${time}-${digest([user.id, body.clientId])}`;
      const next = { from: time, revision: (old?.revision || 0) + 1, recent: [...recent, { clientId: body.clientId, at: time, id }] };
      const issue = initialize({ id, user, area, action, code: related?.code || code, source: "user", note, diagnostics }, time);
      if (await store.save(issue, null, { userId: user.id, before: old, next })) return { id };
    }
    throw retryConflict();
  }

  async function list(before = "") {
    if (before && !issueId.test(before)) throw fail(400, "无效的反馈分页位置。");
    const rows = await store.list({ before, limit: PAGE_SIZE + 1 });
    const issues = rows.slice(0, PAGE_SIZE);
    return { issues, nextBefore: rows.length > PAGE_SIZE ? issues.at(-1).id : "" };
  }

  async function update(id, action, actor) {
    const allowed = ["resolve", "reopen", "retry-mail"];
    if (!issueId.test(id) || !allowed.includes(action)) throw fail(400, "无效的反馈操作。");
    return change(id, (issue) => {
      if (!store.current(issue)) throw fail(404, "问题反馈不存在。");
      const time = iso(now());
      if (action === "retry-mail") {
        if (!recipient()) throw fail(503, "反馈邮件收件地址尚未配置。");
        if (!["failed", "unconfigured"].includes(issue.mail.state)) return null;
        return { ...issue, mail: mail(time) };
      }
      if ((action === "resolve") === (issue.status === "resolved")) return null;
      return { ...issue, status: action === "resolve" ? "resolved" : "new",
        resolvedAt: action === "resolve" ? time : null, resolvedBy: action === "resolve" ? actor.id : null };
    });
  }

  async function deliver(id) {
    const time = iso(now()), lease = randomUUID();
    const issue = await change(id, (record) => {
      if (!store.current(record) || !record.mail.nextAt || record.mail.nextAt > time) return null;
      if (!recipient()) return { ...record, mail: { ...record.mail, state: "unconfigured", updatedAt: time, nextAt: null } };
      if (record.mail.attempts >= 3) return { ...record, mail: { ...record.mail, state: "failed", updatedAt: time, nextAt: null } };
      return { ...record, mail: { state: "sending", lease, attempts: record.mail.attempts + 1,
        updatedAt: time, nextAt: iso(now() + 5 * 60000) } };
    });
    if (issue?.mail.lease !== lease) return;
    const url = new URL("/app?page=admin", origin());
    url.searchParams.set("feedback", id);
    const latest = issue.diagnostics;
    const text = [
      `账号：${issue.user.name || "—"} <${issue.user.email}>`, `账号编号：${issue.user.id}`,
      `时间 (UTC)：${issue.lastAt}`,
      `功能：${pages[issue.area]} / ${operations[issue.action]}`,
      `问题：${codeLabel(issue.code)} (${issue.code})`, `错误编号：${issue.diagnostics.requestId || "—"}`,
      `使用环境：${latest.browser} / ${latest.device} · v${latest.version}`,
      `来源：${issue.source === "automatic" ? "服务自动记录" : "用户提交"}`,
      `后台查看：${url.href}`
    ].join("\n");
    let state = "sent";
    try { await sendEmail({ to: recipient(), subject: `[StudyBridge] 问题反馈 · ${pages[issue.area]}`, text }); }
    catch (error) { state = error.emailSetup ? "unconfigured" : issue.mail.attempts < 3 ? "queued" : "failed"; }
    await change(id, (record) => {
      if (record?.mail.lease !== lease) return null;
      return { ...record, mail: { state, attempts: record.mail.attempts, updatedAt: iso(now()),
        nextAt: state === "queued" ? iso(now() + record.mail.attempts * 60000) : null } };
    });
  }

  async function drain() {
    if (running || stopped) return;
    running = (async () => {
      for (const id of await store.due(iso(now()))) {
        if (stopped) break;
        try { await deliver(id); } catch { console.warn("StudyBridge feedback notification could not be updated."); }
      }
    })();
    try { await running; }
    catch { console.warn("StudyBridge feedback notifications could not be loaded."); }
    finally { running = null; }
  }

  return {
    observe, submit, list, update, get: async (id) => { const issue = issueId.test(id) ? await store.get(id) : null; return store.current(issue) ? issue : null; }, drain,
    start() { if (!timer) timer = setInterval(() => void drain(), interval).unref(); },
    async stop() { stopped = true; clearInterval(timer); await running; }
  };
}

module.exports = { createFeedback, RETENTION_DAYS };
