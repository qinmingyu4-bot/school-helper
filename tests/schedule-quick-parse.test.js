const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const parse = source.slice(source.indexOf("  async function parseScheduleQuick()"), source.indexOf("  function scheduleClockSignature("));

function harness() {
  const state = { user: { id: "one" }, page: "schedule", scheduleQuickText: "11月2号12点是朋友Liz的生日", scheduleVoicePhase: "idle", scheduleDrafts: [], scheduleSelectedDate: "2026-11-02" };
  const intervals = new Map(), timeouts = new Map(), events = [];
  let resolve, reject, signal;
  const context = vm.createContext({ ui: require("../public/i18n"), state, Intl, Date, AbortController, scheduleQuickRequest: null,
    window: { setInterval: (fn, delay) => { intervals.set(delay, fn); return delay; }, clearInterval: (id) => intervals.delete(id), setTimeout: (fn, delay) => { timeouts.set(delay, fn); return delay; }, clearTimeout: (id) => timeouts.delete(id) },
    $: () => null, updateScheduleQuickUi: () => events.push("status"), render: () => events.push("render"), revealScheduleReview: () => events.push("reveal"),
    api: (_, options) => { signal = options.signal; return new Promise((yes, no) => { resolve = yes; reject = no; signal.addEventListener("abort", () => no(new Error("aborted"))); }); }
  });
  vm.runInContext(parse, context);
  return { state, events, intervals, timeouts, run: () => context.parseScheduleQuick(), resolve: (value) => resolve(value), reject: (error) => reject(error), abort: () => context.scheduleQuickRequest.abort(), signal: () => signal };
}

test("quick parsing updates only status while waiting and reveals the rendered results once", async () => {
  const h = harness(), pending = h.run();
  assert.deepEqual(h.events, ["status"]);
  assert.equal(h.state.scheduleImportBusy, true);
  await h.run(); // Duplicate taps cannot start another request.
  assert.deepEqual(h.events, ["status"]);
  h.intervals.get(1000)();
  assert.match(h.state.scheduleQuickStatus, /已等待/);
  assert.deepEqual(h.events, ["status"]);
  h.resolve({ items: [{ title: "Liz的生日" }] }); await pending;
  assert.deepEqual(h.events, ["status", "render", "reveal"]);
  assert.equal(h.state.scheduleImportBusy, false);
  assert.equal(h.timeouts.size + h.intervals.size, 0);
});

test("errors, cancellation, timeout and empty extraction retain the source and never reveal a result", async () => {
  for (const outcome of ["error", "cancel", "timeout", "empty"]) {
    const h = harness(), text = h.state.scheduleQuickText, pending = h.run();
    if (outcome === "error") h.reject(new Error("整理失败，请重试"));
    if (outcome === "cancel") h.abort();
    if (outcome === "timeout") h.timeouts.get(65000)();
    if (outcome === "empty") h.resolve({ items: [], clarification: "请补充日期" });
    await pending;
    assert.equal(h.state.scheduleQuickText, text);
    assert.equal(h.state.scheduleImportBusy, false);
    assert.deepEqual(h.events, ["status", "render"]);
    assert.equal(h.timeouts.size + h.intervals.size, 0);
    assert.match(h.state.scheduleQuickStatus, outcome === "timeout" ? /超时/ : outcome === "cancel" ? /已取消/ : outcome === "error" ? /失败/ : /补充日期/);
  }
});

test("completion after navigation does not jump pages, and stale account results are discarded", async () => {
  for (const change of ["page", "user"]) {
    const h = harness(), pending = h.run();
    if (change === "page") h.state.page = "study";
    else h.state.user = { id: "two" };
    h.resolve({ items: [{ title: "Liz的生日" }] }); await pending;
    assert.deepEqual(h.events, ["status"]);
    if (change === "user") assert.equal(h.state.scheduleDrafts.length, 0);
    assert.equal(h.timeouts.size + h.intervals.size, 0);
  }
});
