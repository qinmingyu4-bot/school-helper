const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const management = require("../public/schedule-management");
const calendar = require("../public/schedule-calendar");
const { StudyBridgeDatabase } = require("../lib/database");
const { normalizeRequest } = require("../lib/schedule-management");
const { memoryDynamo } = require("./helpers/community-dynamo");

const meeting = { title: "STA437H1 Lecture", kind: "LEC", course: "STA437H1", startsAt: "2026-10-26T14:00:00.000Z", endsAt: "2026-10-26T15:00:00.000Z", timeZone: "America/Toronto", location: "Old room", notes: "Read chapter 2", evidence: "Original syllabus", source: "course.pdf", recurrence: { frequency: "weekly" }, completedAt: "" };
const target = (docId, courseId = "stats") => ({ docId, courseId });

test("course grouping crosses storage courses and sections without grouping unrelated personal plans or campuses", () => {
  const items = [
    { ...meeting, courseId: "planner", docId: "a" },
    { ...meeting, course: "sta 437h1f", courseId: "stats", docId: "b", kind: "TUT" },
    { ...meeting, course: "STA437H3", docId: "other-campus" },
    { ...meeting, course: "", docId: "personal" }
  ];
  const groups = management.groups(items);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.key === "code:STA437H1").items.length, 2);
  assert.equal(management.select(items, { scope: "future", now: Date.parse("2026-11-01") }).length, 0);
  assert.equal(management.select(items, { scope: "all", kind: "TUT" }).length, 1);
  const model = calendar.buildModel({ items, now: "2026-10-01", month: "2026-10", timeZone: "UTC" });
  assert.match(calendar.courseManagementHtml(items), /按课程管理日程/);
  assert.match(calendar.courseManagementHtml(items), /delete-schedule-course/);
  assert.match(calendar.render(model), /edit-schedule/);
  assert.match(calendar.render(calendar.buildModel({ items, now: "2026-11-01", timeZone: "UTC" }), { agendaView: "completed" }), /delete-schedule/);
  assert.equal(management.groups([meeting, { ...meeting, course: "STA437" }]).length, 1);
  assert.equal(management.groups([...items, { ...meeting, course: "STA437" }]).length, 3, "ambiguous campus abbreviation stays separate");
});

test("bulk edits preserve dates, unrelated fields and completion while respecting each occurrence's DST offset", () => {
  const patch = { startTime: "12:00", endTime: "13:00", location: "New room" };
  const summer = management.applyPatch(meeting, patch);
  const winter = management.applyPatch({ ...meeting, startsAt: "2026-11-02T15:00:00.000Z", endsAt: "2026-11-02T16:00:00.000Z", completedAt: "2026-11-02T16:00Z" }, patch);
  assert.equal(summer.startsAt, "2026-10-26T16:00:00.000Z");
  assert.equal(winter.startsAt, "2026-11-02T17:00:00.000Z");
  assert.equal(winter.endsAt, "2026-11-02T18:00:00.000Z");
  assert.equal(winter.completedAt, "2026-11-02T16:00Z");
  assert.equal(summer.notes, meeting.notes);
  assert.equal(summer.evidence, meeting.evidence);
  assert.equal(summer.source, meeting.source);
  assert.equal(summer.recurrence, undefined);
  assert.deepEqual(management.applyPatch(meeting, { location: "" }).recurrence, meeting.recurrence);
  assert.equal(management.applyPatch(meeting, { endTime: "" }).endsAt, "");
  assert.equal(management.applyPatch(meeting, { title: "Changed", date: "2026-11-09" }).startsAt, "2026-11-09T15:00:00.000Z");
  assert.throws(() => management.applyPatch(meeting, { startTime: "12:00" }), /结束时间/);
  assert.throws(() => management.applyPatch({ ...meeting, startsAt: "2026-03-01T10:00", endsAt: "" }, { date: "2026-03-08", startTime: "02:30" }));
  assert.throws(() => management.applyPatch(meeting, { completedAt: "" }));
  assert.throws(() => management.applyPatch(meeting, {}));
  assert.equal(meeting.location, "Old room");
});

for (const mode of ["local", "dynamodb"]) test(`${mode}: batches change only owned schedule documents, validate before writes, survive restart and support delete retry`, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "schedule-management-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json");
  const memory = memoryDynamo(); db.dynamo = mode === "dynamodb" ? memory.store : null;
  const call = memory.store.call;
  memory.store.call = (operation, body) => call(operation, operation === "Query" && !body.Limit ? { ...body, Limit: 100 } : body);
  for (const course of [{ id: "stats", name: "STA437H1", userId: "alice" }, { id: "planner", name: "Schedule & Deadlines", userId: "alice" }, { id: "other", name: "STA437H1", userId: "bob" }]) await db.createCourse(course);
  for (const [id, courseId, userId, data] of [["a", "stats", "alice", meeting], ["b", "planner", "alice", { ...meeting, kind: "TUT", startsAt: "2026-11-02T15:00:00.000Z", endsAt: "2026-11-02T16:00:00.000Z" }], ["c", "other", "bob", meeting]]) {
    await db.createDocument({ id, courseId, userId, title: `[SCHEDULE_ITEM] ${data.title}`, type: "Schedule", text: JSON.stringify(data) });
  }
  await db.createDocument({ id: "material", courseId: "stats", userId: "alice", title: "Syllabus", type: "Note", text: "Do not delete" });
  await db.createMessage({ id: "chat", courseId: "stats", userId: "alice", role: "user", content: "Keep chat" });
  const edit = { operation: "edit", items: [target("a"), target("b", "planner")], patch: { location: "New room", notes: "" } };
  await assert.rejects(db.manageScheduleItems("alice", { ...edit, items: [target("a"), target("c", "other")] }), { statusCode: 404 });
  await assert.rejects(db.manageScheduleItems("alice", { operation: "delete", items: [target("a"), target("material")] }), { statusCode: 404 });
  assert.equal(JSON.parse((await db.listDocuments("alice", "stats")).find((doc) => doc.id === "a").text).location, "Old room");
  const result = await db.manageScheduleItems("alice", edit);
  assert.equal(result.changed, 2);
  assert.ok(result.items.every((item) => item.location === "New room" && item.notes === "" && item.evidence === meeting.evidence));
  if (mode === "local") db.local.state = null;
  assert.equal(JSON.parse((await db.listDocuments("alice", "stats")).find((doc) => doc.id === "a").text).location, "New room");
  if (mode === "dynamodb") {
    const previous = await db.dynamo.get("USER#alice", "COURSE#stats#DOC#a");
    const call = db.dynamo.call;
    let injected = false;
    db.dynamo.call = async (operation, body) => {
      if (operation === "TransactWriteItems" && !injected) {
        injected = true;
        await db.dynamo.put("USER#alice", "COURSE#stats#DOC#a", "document", { ...previous, updatedAt: "concurrent" });
      }
      return call(operation, body);
    };
    await assert.rejects(db.manageScheduleItems("alice", { operation: "delete", items: edit.items }), { statusCode: 409 });
    assert.equal((await db.listDocuments("alice", "planner")).length, 1, "conflict rolls back the other deletion too");
    db.dynamo.call = call;
  }
  const remove = { operation: "delete", items: edit.items };
  assert.equal((await db.manageScheduleItems("alice", remove)).changed, 2);
  assert.equal((await db.manageScheduleItems("alice", remove)).changed, 0);
  assert.deepEqual((await db.listDocuments("alice", "stats")).map((doc) => doc.id), ["material"]);
  assert.equal((await db.listDocuments("bob", "other")).length, 1);
  assert.equal((await db.listCourses("alice")).length, 2);
  assert.equal((await db.listMessages("alice", "stats")).length, 1);
  if (mode === "dynamodb") {
    const deletion = memory.calls.filter((call) => call.target === "TransactWriteItems").at(-1);
    assert.equal(deletion.body.TransactItems.length, 2);
    assert.ok(deletion.body.TransactItems.every((item) => item.Delete.ConditionExpression === "#data = :expected"));
  }
});

test("local failed persistence rolls back all edited/deleted occurrences", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "schedule-management-failure-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json"); db.dynamo = null;
  await db.createCourse({ id: "stats", userId: "alice", name: "STA437H1" });
  await db.createDocument({ id: "a", courseId: "stats", userId: "alice", title: "[SCHEDULE_ITEM] Lecture", type: "Schedule", text: JSON.stringify(meeting) });
  db.local.save = async () => { throw new Error("disk full"); };
  for (const operation of ["edit", "delete"]) {
    await assert.rejects(db.manageScheduleItems("alice", { operation, items: [target("a")], patch: { location: "New" } }), /disk full/);
    assert.equal(JSON.parse((await db.listDocuments("alice", "stats"))[0].text).location, "Old room");
  }
});

test("management requests reject oversized batches and invalid targets or fields", () => {
  for (const body of [null, {}, { operation: "delete", items: [] }, { operation: "delete", items: Array(81).fill(target("a")) }, { operation: "delete", items: [target("../bad")] }, { operation: "edit", items: [target("a")], patch: { userId: "bob" } }]) assert.throws(() => normalizeRequest(body), { statusCode: 400 });
  assert.equal(normalizeRequest({ operation: "delete", items: [target("a"), target("a")] }).items.length, 1);
});
