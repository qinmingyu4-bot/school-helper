const { test } = require("node:test");
const assert = require("node:assert/strict");
const importer = require("../public/schedule-import");

test("schedule extraction rejects malformed output and invalid calendar dates", () => {
  assert.equal(importer.validTime("2028-02-29T23:59"), true);
  for (const value of ["2026-02-29T12:00", "2026-04-31T12:00", "2026-10-11T24:00", "2026-10-11T12:60", "", "next Friday"]) assert.equal(importer.validTime(value), false);
  assert.throws(() => importer.parse("Here is an array: []"));
  assert.throws(() => importer.parse('[{"kind":"unknown"}]'));
  assert.throws(() => importer.parse('[{"kind":"__proto__"}]'));
  assert.throws(() => importer.parse(JSON.stringify(Array(201).fill({ kind: "DDL" }))));
});

test("review retains missing times and source evidence without inventing a date", () => {
  const [row] = importer.parse('```json\n[{"kind":"tutorial","title":"MAT101 TUT0101","startsAt":"2026-02-30T12:00","evidence":"Tutorial: Monday noon"}]\n```');
  assert.equal(row.kind, "TUT");
  assert.equal(row.startsAt, "");
  assert.ok(row.warning);
  assert.equal(row.evidence, "Tutorial: Monday noon");
  assert.equal(importer.kind("lecture"), "LEC");
  assert.equal(importer.kind("deadline"), "DDL");
});

test("duplicate detection matches confirmed UTC dates and legacy local reminders", () => {
  const local = { kind: "class", title: "MAT101 Lecture", course: "MAT101", startsAt: "2026-10-12T10:00" };
  const saved = { ...local, kind: "LEC", startsAt: new Date(local.startsAt).toISOString() };
  assert.equal(importer.fingerprint(local), importer.fingerprint(saved));
  assert.notEqual(importer.fingerprint(local), importer.fingerprint({ ...local, kind: "TUT" }));
});
