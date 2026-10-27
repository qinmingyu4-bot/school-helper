const { test } = require("node:test");
const assert = require("node:assert/strict");
const importer = require("../public/schedule-import");

test("date-only portfolio deadlines retain the due date without inventing a clock or using the late cutoff", () => {
  const portfolio = { kind: "DDL", title: "Portfolio", course: "MAT329Y1", startsAt: "", notes: "Due 2027-04-09; submission time not stated.", evidence: "p. 4: Portfolios are due on April 9, 2027. p. 5: Late portfolios will not be accepted after April 14, 2027." };
  const parsed = importer.parse(JSON.stringify([portfolio]))[0];
  assert.deepEqual(importer.draftDateTime(parsed), { date: "2027-04-09", time: "" });
  assert.equal(parsed.startsAt, "");
  assert.match(parsed.warning, /日期已识别/);
  assert.equal(parsed.evidence, portfolio.evidence);
  const complete = importer.withDatePart(parsed, "time", "17:30");
  assert.equal(complete.startsAt, "2027-04-09T17:30");
  assert.equal(importer.toUtc(complete.startsAt, "America/Toronto"), "2027-04-09T21:30:00.000Z");
  const cleared = importer.withDatePart(complete, "time", "");
  assert.equal(cleared.startsAt, "");
  assert.equal(importer.draftDateTime(cleared).date, "2027-04-09");
  for (const fields of [{ startsAt: "2027-04-09" }, { date: "2027-04-09" }]) {
    const item = importer.parse(JSON.stringify([{ kind: "DDL", title: "Portfolio", ...fields }]))[0];
    assert.deepEqual(importer.draftDateTime(item), { date: "2027-04-09", time: "" });
  }
});

test("partial schedule dates preserve independent fields without guessing years, exam dates or ambiguous deadlines", () => {
  for (const evidence of ["Due on April 9", "Final exam during April 2027", "Late submissions accepted until April 14, 2027", "Due on April 9, 2027 or due on April 10, 2027", "Due on February 30, 2027"]) {
    const item = importer.parse(JSON.stringify([{ kind: "DDL", title: "Task", evidence }]))[0];
    assert.equal(importer.draftDateTime(item).date, "", evidence);
  }
  const item = importer.parse(JSON.stringify([{ kind: "EVENT", title: "Meeting", time: "14:00" }]))[0];
  assert.deepEqual(importer.draftDateTime(item), { date: "", time: "14:00" });
  assert.equal(importer.withDatePart(item, "date", "2027-04-09").startsAt, "2027-04-09T14:00");
  const full = importer.parse(JSON.stringify([{ kind: "DDL", title: "Task", date: "2027-04-09", time: "18:00" }]))[0];
  assert.equal(full.startsAt, "2027-04-09T18:00");
});

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

const calendar = { label: "Test fall teaching term", timeZone: "America/Toronto", teachingPeriods: [{ startDate: "2026-09-08", endDate: "2026-12-07" }],
  breaks: [{ startDate: "2026-10-12", endDate: "2026-10-12" }, { startDate: "2026-10-26", endDate: "2026-10-30" }], sources: [] };
const weekly = { kind: "TUT", title: "FOR200H1F TUT0105", course: "FOR200H1F", weekly: { weekdays: [1], startTime: "10:00", endTime: "11:00" } };

test("weekly timetables preserve one pattern instead of requesting dates for every class", () => {
  const parsed = importer.parseExtraction(JSON.stringify({ termHint: { year: 2026, season: "fall" }, items: [weekly] }));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].warning, "");
  assert.deepEqual(parsed.items[0].weekly.weekdays, [1]);
  assert.equal(parsed.termHint.year, 2026);
  assert.equal(importer.parse(JSON.stringify([{ ...weekly, kind: "DDL", startsAt: "2026-11-12T23:59" }]))[0].weekly, undefined);
});

test("weekly expansion skips reading weeks, holidays, past dates and the exam period", () => {
  const rows = importer.expandWeekly([weekly], calendar);
  assert.equal(rows.length, 11);
  assert.equal(rows[0].startsAt, "2026-09-14T10:00");
  assert.equal(rows.at(-1).startsAt, "2026-12-07T10:00");
  assert.ok(!rows.some((row) => row.startsAt.startsWith("2026-10-12") || row.startsAt.startsWith("2026-10-26")));
  const upcoming = importer.expandWeekly([weekly], calendar, { fromDate: "2026-10-26" });
  assert.equal(upcoming.length, 6);
  assert.equal(upcoming[0].startsAt, "2026-11-02T10:00");
  assert.equal(upcoming[0].endsAt, "2026-11-02T11:00");
  assert.equal(importer.expandWeekly([weekly], calendar, { fromDate: "2026-12-08" }).length, 0);
});

test("recurrence never invents missing weekdays/times and applies official replacement days", () => {
  assert.throws(() => importer.expandWeekly([weekly], null), /授课起止/);
  assert.throws(() => importer.expandWeekly([{ ...weekly, weekly: { ...weekly.weekly, weekdays: [] } }], calendar), /星期/);
  assert.throws(() => importer.expandWeekly([{ ...weekly, weekly: { ...weekly.weekly, startTime: "25:00" } }], calendar), /时间/);
  const shifted = importer.expandWeekly([weekly], { ...calendar, replacements: [{ date: "2026-11-03", weekday: 1 }, { date: "2026-11-02", weekday: 2 }] }, { fromDate: "2026-11-02" });
  assert.equal(shifted[0].startsAt, "2026-11-03T10:00");
  assert.throws(() => importer.expandWeekly([weekly], calendar, { limit: 2 }), /1500/);
});

test("school-local times keep wall-clock hours across DST and match duplicate UTC reminders", () => {
  assert.equal(importer.toUtc("2026-10-19T10:00", "America/Toronto"), "2026-10-19T14:00:00.000Z");
  assert.equal(importer.toUtc("2026-11-02T10:00", "America/Toronto"), "2026-11-02T15:00:00.000Z");
  assert.throws(() => importer.toUtc("2026-03-08T02:30", "America/Toronto"), /夏令时/);
  const local = { kind: "TUT", title: "Tutorial", startsAt: "2026-11-02T10:00", timeZone: "America/Toronto" };
  assert.equal(importer.fingerprint(local), importer.fingerprint({ ...local, startsAt: "2026-11-02T15:00:00.000Z" }));
  assert.equal(importer.todayInZone("America/Toronto", new Date("2026-10-27T01:00:00Z")), "2026-10-26");
});

test("full-year rules do not create classes during the exam/vacation gap, including after manual calendar adjustment", () => {
  const fullYear = { ...calendar, teachingPeriods: [...calendar.teachingPeriods, { startDate: "2027-01-11", endDate: "2027-04-09" }] };
  const original = importer.expandWeekly([weekly], fullYear);
  assert.ok(!original.some((item) => item.startsAt.slice(0, 10) > "2026-12-07" && item.startsAt.slice(0, 10) < "2027-01-11"));
  const manual = { ...fullYear, teachingPeriods: [{ startDate: "2026-09-08", endDate: "2027-04-09" }], breaks: importer.nonTeachingRanges(fullYear) };
  assert.deepEqual(importer.expandWeekly([weekly], manual).map((item) => item.startsAt), original.map((item) => item.startsAt));
});
