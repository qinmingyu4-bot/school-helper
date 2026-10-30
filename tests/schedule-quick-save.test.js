const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const save = source.slice(source.indexOf("  async function confirmScheduleImport()"), source.indexOf("  function toolsPage()"));

function harness({ origin = "quick", count = 1, failAt = 0, duplicates = false } = {}) {
  const text = "十一月三日早上九点从多伦多飞香港";
  const state = {
    user: { id: "demo" }, page: "schedule", scheduleDraftOrigin: origin,
    scheduleDrafts: Array.from({ length: count }, (_, index) => ({ title: `Plan ${index}`, startsAt: "2026-11-03T09:00", selected: true })),
    scheduleQuickText: text, scheduleQuickStatus: "待确认", scheduleManualOpen: true,
    scheduleVoiceMessage: "已转成文字", scheduleVoiceFile: { name: "voice.webm" },
    scheduleVoicePhase: "idle", scheduleVoicePending: false, scheduleSource: text,
    scheduleUploadFile: origin === "file" ? { name: "syllabus.pdf" } : null,
    scheduleImportOpen: true, scheduleImportStatus: "提取完成",
    scheduleImportedCourses: [{ id: "course", name: "Statistics" }],
    scheduleCalendar: { teachingPeriods: [{ startDate: "2026-09-01", endDate: "2026-12-10" }] },
    scheduleCalendarNotice: "已识别学期", scheduleCalendarEditing: true,
    scheduleCalendarDraft: { startDate: "2026-09-01", endDate: "2026-12-10", breaks: "", timeZone: "America/Toronto" },
    scheduleFromDate: "2026-10-28", courses: [{ id: "course", name: "Statistics" }], scheduleItems: []
  };
  const notices = [], renders = [];
  let calls = 0, cancelled = 0;
  const context = vm.createContext({ ui: require("../public/i18n"), state, Intl, Set,
    requestAnimationFrame: (fn) => fn(), setTimeout: (fn) => fn(),
    updateSchedulePreviewCount() {}, updateScheduleReviewValidationNotice() {}, focusScheduleDraftIssue() {},
    updateScheduleSaveProgress() {}, loadScheduleItems: async () => {},
    root: { querySelector: () => null },
    render: () => renders.push({ open: state.scheduleManualOpen, text: state.scheduleQuickText }),
    setToast: (message) => notices.push(message),
    cancelScheduleVoice: () => { cancelled++; state.scheduleVoicePending = false; },
    setScheduleImportStatus: (message) => { state[origin === "quick" ? "scheduleQuickStatus" : "scheduleImportStatus"] = message; },
    scheduleImport: { draftIssues: () => [], expandWeekly: (items) => items, validTime: () => true },
    api: async (_, { body }) => {
      if (++calls === failAt) throw new Error("保存失败");
      return { saved: duplicates ? 0 : body.items.length, duplicates: duplicates ? body.items.length : 0, items: [], courses: [] };
    }
  });
  vm.runInContext(save, context);
  return { state, text, notices, renders, run: () => context.confirmScheduleImport(), cancelled: () => cancelled };
}

test("successful quick saves clear typed/transcribed input, release audio and collapse the entry panel", async () => {
  for (const duplicates of [false, true]) {
    const h = harness({ duplicates }); await h.run();
    assert.equal(h.state.scheduleQuickText, "");
    assert.equal(h.state.scheduleQuickStatus, "");
    assert.equal(h.state.scheduleVoiceMessage, "");
    assert.equal(h.state.scheduleVoiceFile, null);
    assert.equal(h.state.scheduleSource, "");
    assert.equal(h.state.scheduleManualOpen, false);
    assert.equal(h.state.scheduleDrafts.length, 0);
    assert.equal(h.cancelled(), 1);
    assert.match(h.notices[0], /已添加/);
    assert.deepEqual(h.renders.at(-1), { open: false, text: "" });
  }
});

test("failed and partial quick saves retain text, audio and preview for retry", async () => {
  for (const options of [{ failAt: 1 }, { count: 81, failAt: 2 }]) {
    const h = harness(options); await h.run();
    assert.equal(h.state.scheduleQuickText, h.text);
    assert.equal(h.state.scheduleManualOpen, true);
    assert.ok(h.state.scheduleVoiceFile);
    assert.ok(h.state.scheduleDrafts.length);
    assert.match(h.state.scheduleReviewError, /预览已保留/);
    assert.equal(h.cancelled(), 0);
  }
});

test("course-file confirmation preserves unrelated quick-entry text and disclosure state", async () => {
  const h = harness({ origin: "file" }); await h.run();
  assert.equal(h.state.scheduleQuickText, h.text);
  assert.equal(h.state.scheduleManualOpen, true);
  assert.equal(h.cancelled(), 0);
});

test("successful course-file confirmation clears upload and extraction settings and collapses import", async () => {
  for (const duplicates of [false, true]) {
    const h = harness({ origin: "file", duplicates }); await h.run();
    assert.equal(h.state.scheduleUploadFile, null);
    assert.equal(h.state.scheduleDrafts.length, 0);
    assert.equal(h.state.scheduleImportOpen, false);
    assert.equal(h.state.scheduleImportStatus, "");
    assert.equal(h.state.scheduleSource, "");
    assert.equal(h.state.scheduleImportedCourses.length, 0);
    assert.equal(h.state.scheduleCalendar, null);
    assert.equal(h.state.scheduleCalendarNotice, "");
    assert.equal(h.state.scheduleCalendarEditing, false);
    assert.ok(Object.values(h.state.scheduleCalendarDraft).every((value) => value === ""));
    assert.equal(h.state.scheduleFromDate, "");
    assert.match(h.notices[0], /已添加/);
    assert.equal(h.state.courses[0].id, "course");
    assert.equal(h.state.scheduleQuickText, h.text);
  }
});

test("failed and partial course-file saves retain upload, preview and semester settings for retry", async () => {
  for (const options of [{ failAt: 1 }, { count: 81, failAt: 2 }]) {
    const h = harness({ origin: "file", ...options });
    const file = h.state.scheduleUploadFile, calendar = h.state.scheduleCalendar, drafts = h.state.scheduleDrafts;
    await h.run();
    assert.equal(h.state.scheduleUploadFile, file);
    assert.equal(h.state.scheduleDrafts, drafts);
    assert.equal(h.state.scheduleImportOpen, true);
    assert.equal(h.state.scheduleCalendar, calendar);
    assert.equal(h.state.scheduleImportedCourses.length, 1);
    assert.equal(h.state.scheduleSource, h.text);
    assert.equal(h.state.scheduleFromDate, "2026-10-28");
    assert.match(h.state.scheduleReviewError, /预览已保留/);
    assert.equal(h.notices.length, 0);
  }
});
