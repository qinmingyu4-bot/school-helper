const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const importer = require("../public/schedule-import");
const calendar = require("../public/schedule-calendar");
const start = "2026-11-02T15:00:00.000Z";
const end = "2026-11-02T16:00:00.000Z";
const meeting = (kind = "LEC") => ({ title: kind, kind, startsAt: start, endsAt: end, docId: kind, courseId: "planner" });

test("lectures and tutorials finish at their end, never at the start of a known duration", () => {
  for (const kind of ["LEC", "TUT", "lecture", "tutorial", "class"]) {
    const item = meeting(kind);
    assert.equal(importer.completion(item, start).completedAt, "");
    assert.equal(importer.completion(item, "2026-11-02T15:59:59Z").completedAt, "");
    assert.deepEqual(importer.completion(item, end), { classMeeting: true, automatic: true, completedAt: end });
    assert.equal(importer.completion(item, "2026-12-01T00:00Z").completedAt, end);
    assert.equal(item.completedAt, undefined);
  }
});

test("legacy classes without a usable end fall back to the recorded time", () => {
  for (const endsAt of [undefined, "", "invalid", "2026-11-02T14:00Z", start]) {
    const item = { ...meeting(), endsAt };
    assert.equal(importer.completion(item, "2026-11-02T14:59:59Z").completedAt, "");
    assert.equal(importer.completion(item, start).completedAt, start);
  }
  assert.equal(importer.completion({ ...meeting(), startsAt: "invalid" }, end).completedAt, "");
});

test("expired deadlines and personal tasks never auto-complete and explicit completions survive", () => {
  for (const kind of ["DDL", "deadline", "EVENT"]) {
    assert.deepEqual(importer.completion(meeting(kind), "2030-01-01"), { classMeeting: false, automatic: false, completedAt: "" });
  }
  const completedAt = "2026-11-01T12:00:00Z";
  for (const kind of ["DDL", "LEC", "TUT"]) assert.equal(importer.completion({ ...meeting(kind), completedAt }, "2026-11-02T14:00Z").completedAt, completedAt);
});

test("automatic completion uses school-local times across daylight-saving changes", () => {
  const summer = { ...meeting(), startsAt: "2026-10-26T10:00", endsAt: "2026-10-26T11:00", timeZone: "America/Toronto" };
  const winter = { ...meeting("TUT"), startsAt: "2026-11-02T10:00", endsAt: "2026-11-02T11:00", timeZone: "America/Toronto" };
  assert.equal(importer.completion(summer, "2026-10-26T14:59:59Z").completedAt, "");
  assert.equal(importer.completion(summer, "2026-10-26T15:00:00Z").completedAt, "2026-10-26T15:00:00.000Z");
  assert.equal(importer.completion(winter, "2026-11-02T15:59:59Z").completedAt, "");
  assert.equal(importer.completion(winter, end).completedAt, end);
  assert.equal(importer.completion({ ...summer, startsAt: "2026-03-08T02:30", endsAt: "" }, end).completedAt, "");
});

test("calendar views move elapsed classes into history while overdue assignments keep their action", () => {
  const items = [meeting(), meeting("TUT"), meeting("DDL"), meeting("EVENT")];
  const before = JSON.stringify(items);
  const during = calendar.buildModel({ items, now: "2026-11-02T15:30Z", timeZone: "America/Toronto" });
  assert.equal(during.ongoing.length, 4);
  const duringHtml = calendar.render(during);
  assert.match(duringHtml, /上课中/);
  assert.ok(!duringHtml.includes('aria-label="完成 LEC"'));
  assert.ok(!duringHtml.includes('aria-label="完成 TUT"'));
  assert.ok(duringHtml.includes('aria-label="完成 DDL"'));
  const after = calendar.buildModel({ items, now: end, timeZone: "America/Toronto" });
  assert.deepEqual(after.completed.map((item) => item.kind), ["LEC", "TUT"]);
  assert.deepEqual(after.upcoming.map((item) => item.kind), ["DDL"]);
  assert.equal(after.overdue.length, 1);
  assert.equal(after.next, null);
  assert.equal(after.days.find((day) => day.date === "2026-11-02").items.filter((item) => item.completedAt).length, 2);
  const completedHtml = calendar.render(after, { agendaView: "completed" });
  assert.match(completedHtml, /✓ 已上完/);
  assert.ok(!completedHtml.includes('aria-label="完成 LEC"'));
  const upcomingHtml = calendar.render(after);
  assert.match(upcomingHtml, /仍需手动完成/);
  assert.ok(upcomingHtml.includes('aria-label="完成 DDL"'));
  assert.equal(JSON.stringify(items), before);
  const manuallyCompleted = calendar.buildModel({ items: items.map((item) => item.kind === "DDL" ? { ...item, completedAt: end } : item), now: end });
  assert.equal(manuallyCompleted.overdue.length, 0);
  assert.equal(manuallyCompleted.completed.length, 3);
});

test("server AI context uses the shared completion rule without rewriting saved documents", async () => {
  const items = [
    { ...meeting(), startsAt: "2020-01-01T10:00Z", endsAt: "2020-01-01T11:00Z" },
    { ...meeting("TUT"), startsAt: "2020-01-01T10:00Z", endsAt: "" },
    { ...meeting("DDL"), startsAt: "2020-01-01T10:00Z", endsAt: "2020-01-01T11:00Z" },
    { ...meeting(), title: "Future class", startsAt: "2099-01-01T10:00Z", endsAt: "2099-01-01T11:00Z" },
    { ...meeting("DDL"), title: "Submitted", completedAt: "2020-01-01T11:00Z" }
  ];
  const documents = items.map((item) => ({ id: item.title, type: "Schedule", title: `[SCHEDULE_ITEM] ${item.title}`, text: JSON.stringify(item) }));
  const before = JSON.stringify(documents);
  const source = fs.readFileSync(require.resolve("../server"), "utf8");
  const helpers = source.slice(source.indexOf("function parseScheduleDocument("), source.indexOf("function formatScheduleContext("));
  const context = vm.createContext({ scheduleItemPrefix: "[SCHEDULE_ITEM]", scheduleCourseName: "Schedule & Deadlines", scheduleImport: importer, db: { listCourses: async () => [{ id: "planner" }], listDocuments: async () => documents } });
  vm.runInContext(helpers, context);
  const pending = await context.listUserScheduleItems("student");
  assert.deepEqual(Array.from(pending, (item) => item.title), ["DDL", "Future class"]);
  assert.equal(JSON.stringify(documents), before);
});
