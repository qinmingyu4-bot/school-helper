const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const apiSource = source.slice(source.indexOf("  async function api("), source.indexOf("  function setToast("));

function client(fetch) {
  let refreshes = 0;
  const context = vm.createContext({ fetch, FormData, window: { StudyBridgeChatStream: require("../public/chat-stream") },
    ui: { text: (value) => value, message: (strings, ...values) => String.raw({ raw: strings }, ...values) },
    usageView: { refresh: () => { refreshes++; } } });
  const api = vm.runInContext(`${apiSource}; api`, context);
  return { api, refreshes: () => refreshes };
}
const packet = (event, data) => new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

test("import client displays server progress before completion and consumes the final result", async () => {
  let stream;
  const response = new Response(new ReadableStream({ start(controller) { stream = controller; } }), { headers: { "content-type": "text/event-stream" } });
  const caller = client(async (_path, options) => { assert.equal(options.onProgress, undefined); assert.equal(options.body, '{"fileName":"timetable.png"}'); return response; });
  let progress;
  const phaseSeen = new Promise((resolve) => { progress = resolve; });
  const pending = caller.api("/api/schedule/extract", { method: "POST", body: { fileName: "timetable.png" }, onProgress: progress });
  stream.enqueue(packet("progress", { phase: "recognizing" }));
  assert.equal(await phaseSeen, "recognizing");
  assert.equal(caller.refreshes(), 0);
  stream.enqueue(packet("result", { items: [{ title: "课表" }] }));
  assert.equal((await pending).items[0].title, "课表");
  assert.equal(caller.refreshes(), 1);
});

test("import client supports older JSON servers and rejects failed or incomplete streams", async () => {
  for (const [response, message] of [
    [new Response(packet("error", { error: "Failed recognition" }), { headers: { "content-type": "text/event-stream" } }), /Failed recognition/],
    [new Response(packet("progress", { phase: "recognizing" }), { headers: { "content-type": "text/event-stream" } }), /连接中断/],
    [Response.json({ error: "Please sign in" }, { status: 401 }), /Please sign in/]
  ]) {
    const caller = client(async () => response);
    await assert.rejects(caller.api("/api/schedule/extract", { method: "POST", onProgress: () => {} }), message);
    assert.equal(caller.refreshes(), 1);
  }
  const caller = client(async () => Response.json({ items: [] }));
  assert.equal((await caller.api("/api/schedule/extract", { method: "POST", onProgress: () => assert.fail("JSON has no progress events") })).items.length, 0);
});

test("calendar recovery preserves edited drafts and selections and releases busy state after duplicate review", async () => {
  const scheduleImport = require("../public/schedule-import");
  const calendar = require("../lib/academic-calendar-seeds").seeds.find((item) => item.school === "University of Toronto" && item.campus === "St. George");
  const state = { user: { id: "student" }, scheduleDrafts: [
    { title: "Edited lecture", course: "MAT137H1", kind: "LEC", selected: true, weekly: { weekdays: [1], startTime: "12:00", endTime: "13:00" } },
    { title: "Tutorial", course: "MAT137H1", kind: "TUT", selected: false, selectionTouched: true, weekly: { weekdays: [2], startTime: "14:00", endTime: "15:00" } }
  ], scheduleItems: [], scheduleCalendarMatch: { year: "2027", season: "winter", scopeId: "stgeorge:artsscience" }, scheduleFromDate: "2026-11-06" };
  let renders = 0;
  const context = vm.createContext({ state, scheduleImport, scheduleDraftDisclosure: new WeakMap(), root: { querySelectorAll: () => [] },
    ui: { text: (text) => text }, render: () => { renders++; }, api: async (path, { body }) => {
      assert.equal(path, "/api/schedule/calendar");
      assert.equal(body.year, 2027);
      assert.equal(body.courseCodes.join(), "MAT137H1");
      return { calendar, notice: "Archived calendar" };
    } });
  const match = source.slice(source.indexOf("  async function matchScheduleCalendar("), source.indexOf("  function applyScheduleCalendarDraft("));
  const review = source.slice(source.indexOf("  function refreshScheduleDuplicateReview("), source.indexOf("  function updateSchedulePreviewCount("));
  await vm.runInContext(`${review}\n${match}\nmatchScheduleCalendar()`, context);
  assert.equal(state.scheduleDrafts[0].title, "Edited lecture");
  assert.equal(state.scheduleDrafts[0].weekly.startTime, "12:00");
  assert.equal(state.scheduleDrafts[1].selected, false);
  assert.equal(state.scheduleImportBusy, false);
  assert.equal(state.scheduleCalendarMatching, false);
  assert.equal(state.scheduleCalendarOpen, false);
  assert.equal(state.scheduleCalendarDraft.endDate, "2027-04-09");
  assert.equal(renders, 2);
});
