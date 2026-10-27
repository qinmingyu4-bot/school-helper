const { test } = require("node:test");
const assert = require("node:assert/strict");
const calendar = require("../public/schedule-calendar");
const importer = require("../public/schedule-import");
const context = { now: "2026-10-26T15:30:00Z", timeZone: "America/Toronto" };
const row = (title, startsAt, kind = "LEC", extra = {}) => ({ title, startsAt, kind, docId: title, courseId: "planner", ...extra });

test("month navigation crosses years and clamps the supported calendar range", () => {
  assert.equal(calendar.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(calendar.shiftMonth("2027-01", -1), "2026-12");
  assert.equal(calendar.shiftMonth("2000-01", -1), "2000-01");
  assert.equal(calendar.shiftMonth("2200-12", 1), "2200-12");
  assert.throws(() => calendar.shiftMonth("2026-13", 1));
});

test("Monday-first month grids include leap days, adjacent months and the local today", () => {
  const model = calendar.buildModel({ ...context, month: "2028-02", selectedDate: "2028-02-29" });
  assert.equal(model.days.length, 42);
  assert.equal(model.days[0].date, "2028-01-31");
  assert.equal(model.days.filter((day) => day.inMonth).length, 29);
  assert.equal(model.days.find((day) => day.selected).date, "2028-02-29");
  assert.equal(calendar.buildModel({ ...context, month: "2026-02", selectedDate: "2026-02-29" }).selectedDate, "2026-02-01");
  const today = calendar.buildModel({ ...context, now: "2026-10-27T01:00:00Z" });
  assert.equal(today.today, "2026-10-26");
  assert.equal(today.days.find((day) => day.today).date, "2026-10-26");
});

test("agenda mixes all event types and months in chronological order independently of selected day", () => {
  const items = [row("Personal", "2026-12-01T15:00Z", "EVENT"), row("Deadline", "2026-10-27T20:00Z", "DDL"), row("Tutorial", "2026-10-27T16:00Z", "TUT"), row("Lecture", "2026-10-26T16:00Z")];
  const model = calendar.buildModel({ ...context, month: "2027-02", items });
  assert.deepEqual(model.upcoming.map((item) => item.title), ["Lecture", "Tutorial", "Deadline", "Personal"]);
  assert.equal(model.selectedItems.length, 0);
  assert.equal(model.next.title, "Lecture");
  assert.equal(importer.kind("personal"), "EVENT");
  assert.equal(importer.kind("EVENT"), "EVENT");
});

test("next task advances at boundaries and keeps ongoing classes, overdue work and completed history distinct", () => {
  const items = [row("Old class", "2026-10-25T12:00Z"), row("Overdue", "2026-10-25T23:59Z", "DDL"), row("Ongoing", "2026-10-26T15:00Z", "TUT", { endsAt: "2026-10-26T16:00Z" }), row("Finished", "2026-10-26T15:40Z", "EVENT", { completedAt: "2026-10-26T15:20Z" }), row("Next", "2026-10-26T16:00Z")];
  const model = calendar.buildModel({ ...context, items });
  assert.equal(model.next.title, "Next");
  assert.deepEqual(model.ongoing.map((item) => item.title), ["Ongoing"]);
  assert.deepEqual(model.upcoming.map((item) => item.title), ["Overdue", "Ongoing", "Next"]);
  assert.deepEqual(model.overdue.map((item) => item.title), ["Overdue"]);
  assert.equal(model.completed.length, 2);
  assert.equal(model.rows.length, 5);
  const later = calendar.buildModel({ ...context, items, now: "2026-10-26T16:00:01Z" });
  assert.equal(later.next, null);
  assert.equal(later.ongoing.length, 0);
});

test("school-local records and UTC records land on the correct viewing day across DST", () => {
  const items = [row("Fall class", "2026-11-02T10:00", "LEC", { timeZone: "America/Toronto" }), row("Late plan", "2026-11-03T02:00:00Z", "EVENT"), row("Invalid", "not-a-date")];
  const model = calendar.buildModel({ ...context, month: "2026-11", selectedDate: "2026-11-02", items });
  assert.equal(model.selectedItems.length, 2);
  assert.equal(model.selectedItems[0].start, Date.parse("2026-11-02T15:00:00Z"));
  assert.equal(model.invalidCount, 1);
  assert.equal(calendar.buildModel({ ...context, month: "2026-11", selectedDate: "2026-11-03", items }).selectedItems.length, 0);
  const countdownInputs = [];
  calendar.render(model, { countdown: (instant) => { countdownInputs.push(instant); return "soon"; } });
  assert.ok(countdownInputs.includes("2026-11-02T15:00:00.000Z"));
  assert.ok(!countdownInputs.includes("2026-11-02T10:00"));
});

test("multi-day events span the calendar but a midnight end does not occupy the next day", () => {
  const items = [row("Trip", "2026-10-26T22:00Z", "EVENT", { endsAt: "2026-10-28T04:00Z" })];
  const model = calendar.buildModel({ ...context, items });
  assert.equal(model.days.find((day) => day.date === "2026-10-26").items.length, 1);
  assert.equal(model.days.find((day) => day.date === "2026-10-27").items.length, 1);
  assert.equal(model.days.find((day) => day.date === "2026-10-28").items.length, 0);
  assert.match(calendar.render(model), /2026年10月28日 00:00/);
});

test("rendered calendar escapes user content and preserves every future entry beyond the visible month", () => {
  const items = Array.from({ length: 110 }, (_, index) => row(`Task ${index}`, new Date(Date.parse("2026-11-01T12:00Z") + index * 86400000).toISOString(), "EVENT"));
  items.push(row('<img src=x onerror="alert(1)">', "2026-10-27T12:00Z", "DDL", { notes: "<script>danger</script>", location: "<iframe>" }));
  const html = calendar.render(calendar.buildModel({ ...context, items }));
  assert.ok(html.includes("Task 109"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&lt;script&gt;danger"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<iframe>"));
  assert.match(html, /aria-current="date"/);
  assert.match(html, /aria-pressed="true"/);
});
