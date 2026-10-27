const { test } = require("node:test");
const assert = require("node:assert/strict");
const importer = require("../public/schedule-import");
const saved = { kind: "LEC", title: "FOR200H1F LEC0101", course: "FOR200H1F", startsAt: "2026-11-02T15:00:00.000Z", completedAt: "2026-11-02T16:00:00Z" };
const syllabus = { kind: "lecture", title: "Course lecture", course: "FOR 200H1", startsAt: "2026-11-02T10:00", timeZone: "America/Toronto" };

test("syllabus lectures match timetable occurrences despite renamed titles, course formatting and UTC conversion", () => {
  const index = importer.duplicateIndex([saved]);
  assert.equal(index.has(syllabus), true);
  assert.equal(index.has({ ...syllabus, course: "", title: "FOR200H1 Course meeting" }), true);
  const summer = { ...saved, startsAt: "2026-10-19T14:00Z" };
  assert.equal(importer.duplicateIndex([summer]).has({ ...syllabus, startsAt: "2026-10-19T10:00" }), true);
});

test("distinct courses, campus codes, meeting types, sections and times remain separate", () => {
  const index = importer.duplicateIndex([saved]);
  for (const different of [
    { ...syllabus, course: "STA437H1" }, { ...syllabus, course: "FOR200H3" },
    { ...syllabus, kind: "TUT" }, { ...syllabus, startsAt: "2026-11-02T11:00" },
    { ...syllabus, startsAt: "2026-11-09T10:00" }, { ...syllabus, title: "FOR200H1 LEC0201" }
  ]) assert.equal(index.has(different), false, JSON.stringify(different));
  assert.equal(index.has({ ...syllabus, title: "FOR200H1 LEC0101" }), true);
  assert.equal(importer.duplicateIndex([{ ...saved, title: "Course lecture" }]).has({ ...syllabus, title: "LEC0101" }), true);
});

test("a quiz during its host lecture and different assessments at the same time are not duplicates", () => {
  const quiz = { ...syllabus, title: "Quiz 1", kind: "DDL" };
  const assignment = { ...quiz, title: "Assignment 1" };
  const result = importer.deduplicate([syllabus, quiz, assignment, { ...quiz }], [saved]);
  assert.deepEqual(result.items.map((item) => item.title), ["Quiz 1", "Assignment 1"]);
  assert.equal(result.duplicates.length, 2);
  assert.equal(importer.duplicateIndex([quiz]).has({ ...quiz, title: "Quiz 2" }), false);
  assert.equal(importer.duplicateIndex([quiz]).has({ ...quiz, title: "  quiz   1 ", course: "FOR200H1F" }), true);
});

test("duplicate detection also works within a batch and preserves unknown-course or incomplete-time rows for review", () => {
  assert.equal(importer.deduplicate([saved, syllabus]).items.length, 1);
  const unknown = { ...syllabus, course: "", title: "General lecture" };
  assert.equal(importer.duplicateIndex([saved]).has(unknown), false);
  const incomplete = { ...syllabus, startsAt: "" };
  assert.equal(importer.deduplicate([incomplete, incomplete]).items.length, 2);
  const name = { ...syllabus, course: "Introduction to Biology" };
  assert.equal(importer.duplicateIndex([name]).has({ ...name, title: "Intro lecture", course: " introduction   to biology " }), true);
});

test("weekly duplicate templates remain visible, unselected only when every occurrence already exists", () => {
  const calendar = { timeZone: "America/Toronto", teachingPeriods: [{ startDate: "2026-11-02", endDate: "2026-11-09" }], breaks: [] };
  const weekly = { ...syllabus, startsAt: "", weekly: { weekdays: [1], startTime: "10:00", endTime: "11:00" } };
  const assessment = { ...syllabus, kind: "DDL", title: "Midterm", startsAt: "2026-11-04T18:00" };
  const firstOnly = importer.reviewDuplicates([weekly, assessment], [saved], { calendar, fromDate: "2026-11-02", timeZone: "America/Toronto" });
  assert.equal(firstOnly.items.length, 2);
  assert.equal(firstOnly.duplicateCount, 1);
  assert.equal(firstOnly.items[0].selected, true);
  assert.match(importer.duplicateNotice(firstOnly.items[0]), /已有.*1.*新增/);
  const second = { ...saved, startsAt: "2026-11-09T15:00Z" };
  const all = importer.reviewDuplicates([weekly, assessment], [saved, second], { calendar, fromDate: "2026-11-02", timeZone: "America/Toronto" });
  assert.equal(all.items.length, 2);
  assert.equal(all.items[0].selected, false);
  assert.equal(all.items[0].duplicateReview.existingCount, 2);
  assert.equal(all.items[1].selected, true);
  assert.equal(all.duplicateCount, 2);
  const noCalendar = importer.reviewDuplicates([weekly], [saved, second]);
  assert.equal(noCalendar.items.length, 1);
  assert.equal(noCalendar.items[0].selected, false);
  assert.equal(noCalendar.items[0].duplicateReview.coverageUnknown, true);
  assert.match(importer.duplicateNotice(noCalendar.items[0]), /学期范围待核对/);
});

test("review deduplication does not mutate imported drafts or saved completion metadata", () => {
  const drafts = [syllabus, { ...syllabus, title: "Quiz 1", kind: "DDL" }];
  const before = JSON.stringify({ saved, drafts });
  const result = importer.reviewDuplicates(drafts, [saved], { timeZone: "America/Toronto" });
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].selected, false);
  assert.equal(result.items[1].selected, true);
  assert.equal(JSON.stringify({ saved, drafts }), before);
});


test("either upload order marks saved lectures, supports manual selection and preserves separate assessments", () => {
  for (const [incoming, existing] of [[syllabus, saved], [saved, syllabus]]) {
    const result = importer.reviewDuplicates([incoming, { ...syllabus, kind: "DDL", title: "Quiz 1" }], [existing], { timeZone: "America/Toronto" });
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].selected, false);
    assert.match(importer.duplicateNotice(result.items[0]), /日历中已有/);
    assert.equal(result.items[1].selected, true);
    const manual = { ...result.items[0], selected: true, selectionTouched: true };
    assert.equal(importer.reviewDuplicates([manual], [existing], { timeZone: "America/Toronto", preserveSelection: true }).items[0].selected, true);
    assert.equal(importer.deduplicate([manual], [existing]).items.length, 0, "explicit selection never bypasses final duplicate safety");
  }
  const result = importer.reviewDuplicates([syllabus, { ...syllabus }], [], { timeZone: "America/Toronto" });
  assert.equal(result.items[0].selected, true);
  assert.equal(result.items[1].selected, false);
  assert.match(importer.duplicateNotice(result.items[1]), /本次导入中已有/);
});


test("failed calendar lookup still compares explicit weekly dates in either upload order", () => {
  const weekly = { ...syllabus, startsAt: "", weekly: { weekdays: [1], startTime: "10:00", endTime: "11:00", startDate: "2026-11-02", endDate: "2026-11-09" } };
  const second = { ...saved, startsAt: "2026-11-09T15:00Z" };
  for (const previous of [[saved, second], [{ ...syllabus }, { ...syllabus, startsAt: "2026-11-09T10:00" }]]) {
    const result = importer.reviewDuplicates([weekly], previous, { timeZone: "America/Toronto", fromDate: "2026-10-27" });
    assert.equal(result.items[0].selected, false);
    assert.equal(result.items[0].duplicateReview.existingCount, 2);
    assert.match(importer.duplicateNotice(result.items[0]), /日历中已有/);
  }
  const partial = importer.reviewDuplicates([weekly], [saved], { timeZone: "America/Toronto" }).items[0];
  assert.equal(partial.selected, true);
  assert.equal(partial.duplicateReview.newCount, 1);
  for (const different of [{ ...weekly, course: "STA437H1" }, { ...weekly, title: "FOR200H1 LEC0201" }, { ...weekly, weekly: { ...weekly.weekly, startTime: "11:00" } }]) {
    assert.equal(importer.reviewDuplicates([different], [saved, second], { timeZone: "America/Toronto" }).items[0].selected, true);
  }
});

test("unknown weekly boundaries report matching patterns conservatively across DST and keep extra weekdays selected", () => {
  const weekly = { ...syllabus, startsAt: "", weekly: { weekdays: [1], startTime: "10:00", endTime: "11:00" } };
  const summer = { ...saved, startsAt: "2026-10-19T14:00Z" };
  for (const record of [saved, summer]) {
    const item = importer.reviewDuplicates([weekly], [record], { timeZone: "America/Toronto" }).items[0];
    assert.equal(item.selected, false);
    assert.equal(item.duplicateReview.coverageUnknown, true);
    assert.match(importer.duplicateNotice(item), /学期范围待核对/);
  }
  const extraDay = importer.reviewDuplicates([{ ...weekly, weekly: { ...weekly.weekly, weekdays: [1, 3] } }], [saved], { timeZone: "America/Toronto" }).items[0];
  assert.equal(extraDay.selected, true);
  assert.match(importer.duplicateNotice(extraDay), /其余星期/);
  assert.equal(importer.reviewDuplicates([weekly], [saved], { timeZone: "America/Toronto", fromDate: "2027-01-01" }).items[0].selected, true);
  assert.equal(importer.reviewDuplicates([{ ...weekly, weekly: { ...weekly.weekly, weekdays: [] } }], [saved], { timeZone: "America/Toronto" }).items[0].selected, true);
});
