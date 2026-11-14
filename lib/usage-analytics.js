const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");

const DAY = 86400000;
const RETENTION_DAYS = 35;
const dateKey = (time) => new Date(time).toISOString().slice(0, 10);
const dayStart = (time) => Date.parse(dateKey(time));
const FEATURES = ["study", "schedule", "grades", "mailbox", "office", "community", "classmates"];
const MODES = ["general", ...Object.keys(require("../public/study-modes").modes)];
const STEPS = ["course", "material", "question", "firstStudy"];
const counters = () => ({ courses: 0, materials: 0, completed: 0, failed: 0, aiRequests: 0, usageReports: 0,
  inputTokens: 0, outputTokens: 0, costMicros: 0, estimatedRequests: 0 });

function requestAction(method, pathname) {
  if (method === "POST" && pathname === "/api/me/activity") return ["presence", "presence"];
  if (method === "POST" && pathname === "/api/courses") return ["study", "course"];
  if (method === "POST" && /^\/api\/courses\/[^/]+\/(chat|documents)$/.test(pathname)) {
    return ["study", pathname.endsWith("/chat") ? "question" : "material"];
  }
  if ((method === "PUT" || method === "POST") && /^\/api\/grade-planner\/[^/]+(?:\/(recognize|extract-materials))?$/.test(pathname)) return ["grades", "action"];
  if (method === "POST" && /^\/api\/courses\/[^/]+\/learning-loop\/(extract|topics|quiz|submit|help|plan)$/.test(pathname)) {
    return ["study", pathname.endsWith("/submit") ? "practice" : "action"];
  }
  if (method === "POST" && /^\/api\/schedule\/(manage|import|parse-text|transcribe|extract)$/.test(pathname)) return ["schedule", "action"];
  if (method === "POST" && /^\/api\/mailbox\/(?:gmail\/sync|outlook\/sync|drafts\/[^/]+\/resolve)$/.test(pathname)) return ["mailbox", "action"];
  if ((method === "PUT" && /^\/api\/office\/office_[\w-]+$/.test(pathname)) ||
      (method === "POST" && /^\/api\/office\/(?:import|export|assist)$/.test(pathname))) return ["office", "action"];
  if (method === "POST" && pathname === "/api/creative") return ["office", "action"];
  if (method === "POST" && /^\/api\/community\/(?:posts|school\/posts|posts\/[^/]+\/(?:replies|like)|school\/posts\/[^/]+\/like)$/.test(pathname)) return ["community", "action"];
  if (method === "POST" && /^\/api\/classmates\/[^/]+\/messages$/.test(pathname)) return ["classmates", "action"];
  return null;
}

const counterKeys = Object.keys(counters());

function addCounters(target, entry) {
  for (const name of counterKeys) target[name] += entry[name] || 0;
  return target;
}

function mergeDay(previous, event) {
  const row = previous || { userId: event.userId, day: event.day, active: false, features: {}, modes: {}, errors: [], steps: [], ...counters() };
  addCounters(row, event);
  row.active ||= event.active;
  if (event.active && (!row.lastActiveAt || event.at > row.lastActiveAt)) row.lastActiveAt = event.at;
  row.steps = [...new Set([...row.steps, ...event.steps])];
  if (event.feature && event.active) row.features[event.feature] = (row.features[event.feature] || 0) + 1;
  if (event.mode && event.active && (event.steps.has("question") || event.mode === "general" && event.completed)) row.modes[event.mode] = (row.modes[event.mode] || 0) + 1;
  if (event.error) row.errors = [event.error, ...row.errors].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  return row;
}

function emptyContext(feature, action, userId) {
  return { feature, action, userId, id: randomUUID(), ...counters(), steps: new Set() };
}

function createUsageAnalytics(db) {
  const scope = new AsyncLocalStorage();
  let since;
  const started = () => {
    since ||= db.usageStart(new Date().toISOString()).catch((error) => { since = null; throw error; });
    return since;
  };

  async function persist(context, { active = false, status, time = Date.now() } = {}) {
    if (!context?.userId) return;
    const day = dateKey(time), at = new Date(time).toISOString();
    const failure = status >= 400 && status !== 499;
    const error = failure ? { at, feature: context.feature, code: context.code || `HTTP-${status}`, id: context.id } : null;
    if (failure) context.failed++;
    if (status >= 200 && status < 300 && status !== 202 && status !== 204 && context.action !== "presence") context.completed++;
    if (!active && !context.aiRequests && !context.completed && !context.failed && !context.steps.size) return;
    const feature = FEATURES.includes(context.feature) ? context.feature : null;
    try {
      await started();
      await db.writeUsageDay({ ...context, day, at, active, feature, error }, mergeDay);
      if (context.steps.size) await db.markUsageSteps(context.userId, context.steps, at);
    } catch {
      console.warn("StudyBridge could not save usage statistics.");
    }
  }

  async function request(req, res, route) {
    const match = requestAction(req.method, new URL(req.url, "http://localhost").pathname);
    if (!match) return route();
    const context = emptyContext(...match);
    return scope.run(context, async () => {
      try { return await route(); }
      finally {
        const status = context.status ?? (res.writableEnded ? res.statusCode : undefined);
        if (context.action === "practice" && status === 200) context.steps.add("firstStudy");
        await persist(context, { active: context.action !== "presence" || status === 200 && context.foreground,
          status: context.action === "presence" ? undefined : status });
      }
    });
  }

  function identify(user, res) {
    const context = scope.getStore();
    if (!context || !user) return;
    context.userId = user.id;
    if (context.action !== "presence" && !res.headersSent) res.setHeader("x-request-id", context.id);
  }

  function feature(value) {
    const context = scope.getStore();
    if (context && FEATURES.includes(value)) context.feature = value;
  }

  function outcome(status, code) {
    const context = scope.getStore();
    if (context) Object.assign(context, { status, code });
  }

  function foreground() {
    const context = scope.getStore();
    if (context) context.foreground = true;
  }

  function mode(value) {
    const context = scope.getStore();
    if (context && MODES.includes(value)) context.mode = value;
  }

  function reached(step, amount = 1) {
    const context = scope.getStore();
    if (!context || !STEPS.includes(step) || !Number.isSafeInteger(amount) || amount < 1) return;
    context.steps.add(step);
    if (step === "course") context.courses += amount;
    if (step === "material") context.materials += amount;
  }

  function recordAi({ userId, amount, inputTokens, outputTokens, reported, estimated }) {
    const context = scope.getStore();
    if (!context || context.userId !== userId) return;
    context.aiRequests++;
    context.inputTokens += inputTokens;
    context.outputTokens += outputTokens;
    context.usageReports += Number(reported);
    context.costMicros += amount;
    context.estimatedRequests += Number(estimated);
  }

  async function background(userId, feature, work) {
    const context = emptyContext(feature, "background", userId);
    return scope.run(context, async () => {
      try { return await work(); }
      finally { await persist(context, { status: context.status }); }
    });
  }

  return { started, request, identify, feature, outcome, reached, recordAi, background, foreground, mode };
}

function summarize(rows) {
  const totals = counters(), features = new Map(), modes = {}, activeDays = new Set(), activeUsers = new Set();
  let lastActiveAt = null;
  for (const row of rows) {
    addCounters(totals, row);
    if (row.lastActiveAt && (!lastActiveAt || row.lastActiveAt > lastActiveAt)) lastActiveAt = row.lastActiveAt;
    for (const [mode, count] of Object.entries(row.modes)) modes[mode] = (modes[mode] || 0) + count;
    if (row.active) { activeDays.add(row.day); activeUsers.add(row.userId); }
    for (const [name, count] of Object.entries(row.features)) {
      const item = features.get(name) || { feature: name, actions: 0, users: new Set() };
      item.actions += count;
      item.users.add(row.userId);
      features.set(name, item);
    }
  }
  return { ...totals, costUsd: totals.costMicros / 1e6, lastActiveAt, modes, activeDays: activeDays.size, activeUsers: activeUsers.size,
    features: [...features.values()].sort((a, b) => b.users.size - a.users.size || b.actions - a.actions)
      .map(({ users, ...row }) => ({ ...row, users: users.size })) };
}

function reportWindow(days, since, now = Date.now()) {
  const start = dayStart(now) - (days - 1) * DAY, sinceDate = dateKey(Date.parse(since));
  const calendar = Array.from({ length: days }, (_, index) => dateKey(start + index * DAY));
  return { days, since, from: calendar[0], through: calendar.at(-1), calendar: calendar.filter((day) => day >= sinceDate) };
}

function overview(rows, users, window, now = Date.now()) {
  const byDay = new Map(), byUser = new Map(), firstStudy = new Set();
  for (const row of rows) {
    if (!byDay.has(row.day)) byDay.set(row.day, []);
    byDay.get(row.day).push(row);
    if (!byUser.has(row.userId)) byUser.set(row.userId, new Set());
    if (row.active) byUser.get(row.userId).add(row.day);
    if (row.steps.includes("firstStudy")) firstStudy.add(row.userId);
  }
  const cohort = users.filter((user) => typeof user.createdAt === "string" && user.createdAt >= window.since && user.createdAt.slice(0, 10) >= window.from);
  function retention(offset) {
    let reached = 0, eligible = 0;
    for (const user of cohort) {
      const next = dayStart(Date.parse(user.createdAt)) + offset * DAY;
      if (next >= dayStart(now)) continue;
      eligible++;
      if (byUser.get(user.id)?.has(dateKey(next))) reached++;
    }
    return { reached, eligible };
  }
  return { ...window, ...summarize(rows), trend: window.calendar.map((day) => ({ day, activeUsers: (byDay.get(day) || []).filter((row) => row.active).length })),
    firstStudy: { reached: cohort.filter((user) => firstStudy.has(user.id)).length, eligible: cohort.length },
    retention: { day1: retention(1), day7: retention(7) } };
}

module.exports = { createUsageAnalytics, RETENTION_DAYS, STEPS, dateKey, reportWindow, summarize, overview };
