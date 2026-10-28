const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const action = source.slice(source.indexOf('      if (action === "add-schedule")'), source.indexOf('      if (action === "schedule-voice")'));

function harness({ saveFails = false, refreshFails = false, invalid = false } = {}) {
  const fields = { scheduleTitle: "Test plan", scheduleDate: "2026-11-03", scheduleClock: invalid ? "" : "09:00",
    scheduleEndClock: "10:00", scheduleKind: "EVENT", scheduleCourse: "STA437", scheduleLocation: "Library", scheduleNotes: "Bring notes" };
  const state = { page: "schedule", scheduleManualDraft: {}, scheduleManualOpen: true, scheduleSaving: false,
    scheduleQuickText: "Unrelated quick draft", scheduleDrafts: [{ title: "Pending import" }] };
  const notices = [], renders = [], requests = [];
  const button = { disabled: false };
  const context = vm.createContext({ state, Intl, SCHEDULE_PREFIX: "[SCHEDULE_ITEM]",
    $: (id) => ({ value: fields[id] }), cancelScheduleVoice() {},
    scheduleImport: require("../public/schedule-import"),
    ensureScheduleCourse: async () => ({ id: "planner" }),
    api: async (path, request) => { requests.push({ path, request }); if (saveFails) throw new Error("save failed"); },
    setToast: (text) => notices.push(text),
    render: () => renders.push({ open: state.scheduleManualOpen, draft: { ...state.scheduleManualDraft } }),
    loadScheduleItems: async () => {
      assert.equal(state.scheduleManualOpen, false);
      assert.equal(Object.keys(state.scheduleManualDraft).length, 0);
      assert.ok(renders.length, "clear/collapse must render before waiting for refresh");
      if (refreshFails) throw new Error("refresh failed");
    }
  });
  vm.runInContext(`async function run(button) { const action = "add-schedule"; ${action} }`, context);
  return { state, fields, button, notices, renders, requests, run: () => context.run(button) };
}

test("manual save clears and collapses before calendar refresh, preserving other pending input", async () => {
  const h = harness(); await h.run();
  assert.equal(h.state.scheduleManualOpen, false);
  assert.equal(Object.keys(h.state.scheduleManualDraft).length, 0);
  assert.equal(h.state.scheduleSelectedDate, "2026-11-03");
  assert.equal(h.state.scheduleQuickText, "Unrelated quick draft");
  assert.equal(h.state.scheduleDrafts[0].title, "Pending import");
  assert.equal(h.state.scheduleSaving, false);
  assert.equal(h.button.disabled, false);
});

test("manual save errors retain all visible fields even without prior input events", async () => {
  for (const options of [{ saveFails: true }, { invalid: true }]) {
    const h = harness(options); await assert.rejects(h.run());
    assert.equal(h.state.scheduleManualOpen, true);
    assert.equal(h.state.scheduleManualDraft.title, h.fields.scheduleTitle);
    assert.equal(h.state.scheduleManualDraft.notes, h.fields.scheduleNotes);
    assert.equal(h.state.scheduleManualDraft.location, h.fields.scheduleLocation);
    assert.equal(h.state.scheduleManualDraft.endTime, h.fields.scheduleEndClock);
    assert.equal(h.state.scheduleManualDraft.time, h.fields.scheduleClock);
    assert.equal(h.state.scheduleSaving, false);
    assert.equal(h.button.disabled, false);
  }
});

test("refresh failure after a successful manual save stays cleared and warns against re-adding", async () => {
  const h = harness({ refreshFails: true }); await h.run();
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.scheduleManualOpen, false);
  assert.equal(Object.keys(h.state.scheduleManualDraft).length, 0);
  assert.match(h.notices.at(-1), /已保存.*无需重复添加/);
});
