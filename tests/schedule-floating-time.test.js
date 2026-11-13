const { test } = require("node:test");
const assert = require("node:assert/strict");
const schedule = require("../public/schedule-import");
const calendar = require("../public/schedule-calendar");
const management = require("../public/schedule-management");
const { normalizeBatch } = require("../lib/schedule-batch");
const zones = ["America/Toronto", "America/Vancouver", "Asia/Shanghai"];

test("imports, edits, legacy recovery and duplicates keep the same clock when travelling in either direction", () => {
  for (const timeZone of zones) {
    for (const kind of ["LEC", "TUT", "DDL", "EVENT"]) {
      const source = { title: kind, kind, startsAt: "2026-11-09T10:00", endsAt: "2026-11-09T11:00", timeZone };
      const [saved] = normalizeBatch({ items: [source] });
      const legacy = { ...source, startsAt: schedule.toUtc(source.startsAt, timeZone), endsAt: schedule.toUtc(source.endsAt, timeZone) };
      assert.equal(saved.startsAt, source.startsAt);
      assert.equal(schedule.duplicateIndex([legacy]).has(saved), true);
      const edited = management.applyPatch(legacy, { startTime: "09:00", endTime: "10:00" });
      assert.equal(edited.startsAt, "2026-11-09T09:00");
      for (const viewer of zones) {
        const model = calendar.buildModel({ items: [legacy, saved, edited], month: "2026-11", selectedDate: "2026-11-09", timeZone: viewer, now: "2026-11-01" });
        assert.equal(model.selectedItems.length, 3);
        const html = calendar.render(model);
        assert.match(html, /10:00–11:00/);
        assert.match(html, /09:00–10:00/);
        assert.equal(model.rows[1].start, Date.parse(schedule.toUtc(source.startsAt, viewer)));
      }
    }
  }
});

test("overnight dates and DST gaps preserve the written clock; missing legacy zones use UTC consistently", () => {
  const item = { kind: "EVENT", title: "Overnight", startsAt: "2026-11-09T23:30", endsAt: "2026-11-10T00:30", timeZone: "America/Toronto" };
  for (const timeZone of zones) {
    const model = calendar.buildModel({ items: [item], month: "2026-11", timeZone });
    assert.equal(model.days.find((day) => day.date === "2026-11-09").items.length, 1);
    assert.equal(model.days.find((day) => day.date === "2026-11-10").items.length, 1);
    assert.equal(model.rows[0].startsAt, item.startsAt);
  }
  const gap = calendar.buildModel({ items: [{ ...item, startsAt: "2027-03-14T02:30", endsAt: "" }], month: "2027-03", timeZone: "America/Toronto" });
  assert.equal(gap.invalidCount, 0);
  assert.match(calendar.render(gap), /02:30/);
  assert.equal(schedule.wallTime("2026-11-09T10:00:00.000Z"), "2026-11-09T10:00");
  assert.equal(schedule.wallTime("invalid"), "");
  assert.equal(schedule.wallTime("2026-11-09T10:00:30", "Asia/Shanghai"), "2026-11-09T10:00");
  assert.equal(schedule.wallTime("2026-02-30T10:00:00Z"), "");
});

test("class completion follows the viewer's clock while saving and deduplication ignore viewing zones", () => {
  const item = { kind: "LEC", startsAt: "2026-11-09T15:00:00Z", endsAt: "2026-11-09T16:00:00Z", timeZone: "America/Toronto" };
  assert.equal(schedule.completion(item, "2026-11-09T03:00Z", "Asia/Shanghai").automatic, true);
  assert.equal(schedule.completion(item, "2026-11-09T03:00Z", "America/Toronto").automatic, false);
  assert.equal(schedule.completion(item, "2026-11-09T16:00Z", "America/Toronto").automatic, true);
  assert.equal(schedule.deduplicate([{ kind: "EVENT", title: "Incomplete", startsAt: "" }, { kind: "EVENT", title: "Incomplete", startsAt: "" }]).items.length, 2);
});

test("the app loads legacy clocks consistently for the home countdown and calendar", async () => {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const source = fs.readFileSync(require.resolve("../public/app"), "utf8");
  const start = source.indexOf("  async function loadScheduleItems(");
  const end = source.indexOf("  async function ensureScheduleCourse(", start);
  const state = { user: { id: "alice" }, scheduleItems: [] };
  const sandbox = vm.createContext({ state, scheduleImport: schedule, api: async () => ({
    items: [{ kind: "EVENT", startsAt: "2026-11-09T15:00:00Z", endsAt: "2026-11-09T16:00:00Z", timeZone: "America/Toronto" }], courses: []
  }) });
  vm.runInContext(source.slice(start, end), sandbox);
  await sandbox.loadScheduleItems();
  assert.equal(state.scheduleItems[0].startsAt, "2026-11-09T10:00");
  assert.equal(state.scheduleItems[0].endsAt, "2026-11-09T11:00");
});
