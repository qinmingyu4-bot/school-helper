const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { normalizeBatch, storedItems } = require("../lib/schedule-batch");

const meeting = { title: "STA437H1 TUT0105", kind: "TUT", course: "STA437H1", startsAt: "2026-11-02T10:00", endsAt: "2026-11-02T11:00", location: "SS 2127", notes: "Linear regression tutorial", evidence: "Tutorial 1: regression", warning: "Check room", recurrence: { frequency: "weekly", weekdays: [1], calendar: "Fall", sources: [{ url: "https://example.edu/calendar", title: "Official term" }] } };
const normalize = (items) => normalizeBatch({ items, source: "syllabus.pdf", timeZone: "America/Toronto" });

test("batch validation preserves complete information and rejects malformed rows before any writes", () => {
  const [item] = normalize([{ ...meeting, notes: "完整备注".repeat(500), completedAt: "already done", userId: "someone-else" }]);
  assert.equal(item.startsAt, "2026-11-02T15:00:00.000Z");
  assert.equal(item.endsAt, "2026-11-02T16:00:00.000Z");
  assert.equal(item.notes, "完整备注".repeat(500));
  assert.deepEqual(item.recurrence, meeting.recurrence);
  assert.equal(item.evidence, meeting.evidence);
  assert.equal(item.warning, meeting.warning);
  assert.equal(item.completedAt, "");
  assert.equal(item.userId, undefined);
  assert.throws(() => normalize([]));
  assert.throws(() => normalize(Array(81).fill(meeting)));
  assert.throws(() => normalize([meeting, { ...meeting, startsAt: "2026-02-30T10:00" }]));
  assert.throws(() => normalize([{ ...meeting, endsAt: meeting.startsAt }]));
  assert.throws(() => normalize([{ ...meeting, startsAt: "2026-03-08T02:30", endsAt: "" }]));
  assert.throws(() => normalizeBatch({ items: [meeting], timeZone: "Invalid/Zone" }));
});

test("80 local events use one write, survive restart, deduplicate retries and concurrent imports, and roll back failed saves", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-schedule-batch-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.local.file = path.join(directory, "database.json");
  let writes = 0;
  const save = db.local.save.bind(db.local);
  db.local.save = async (...args) => { writes++; return save(...args); };
  const items = normalize(Array.from({ length: 80 }, (_, index) => ({ ...meeting, kind: "DDL", title: `Assignment ${index}`, notes: "内容".repeat(1000) })));
  const [first, retry] = await Promise.all([db.importScheduleBatch("alice", items), db.importScheduleBatch("alice", items)]);
  assert.equal(first.saved + retry.saved, 80);
  assert.equal(first.duplicates + retry.duplicates, 80);
  assert.equal(writes, 1, "one file replacement for 80 events; duplicate retry writes nothing");
  const restarted = new StudyBridgeDatabase();
  restarted.local.file = db.local.file;
  const courses = await restarted.listCourses("alice");
  assert.equal(courses.length, 1);
  const documents = await restarted.listDocuments("alice", courses[0].id);
  const restored = storedItems(courses, documents, "alice");
  assert.equal(restored.length, 80);
  assert.equal(restored[0].notes, items[0].notes);
  assert.deepEqual(restored[0].recurrence, meeting.recurrence);
  assert.equal(storedItems(courses, documents, "bob").length, 0);
  const differentUser = await db.importScheduleBatch("bob", [items[0]]);
  assert.equal(differentUser.saved, 1);
  db.local.save = async () => { throw new Error("disk full"); };
  await assert.rejects(db.importScheduleBatch("charlie", [items[0]]), /disk full/);
  assert.equal((await db.listCourses("charlie")).length, 0, "failed persistence leaves no phantom saved course");
  db.local.save = save;
  assert.equal((await db.importScheduleBatch("charlie", [items[0]])).saved, 1, "retry really saves failed events");
});

test("server duplicate rules include completed legacy courses but preserve different sections, assessments and users", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-schedule-legacy-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.local.file = path.join(directory, "database.json");
  await db.createCourse({ id: "stats", userId: "alice", name: "STA437H1" });
  const [original] = normalize([meeting]);
  await db.createDocument({ id: "old", userId: "alice", courseId: "stats", type: "Schedule", title: "[SCHEDULE_ITEM] tutorial", text: JSON.stringify({ ...original, completedAt: "2026-11-02T16:00:00.000Z" }) });
  const result = await db.importScheduleBatch("alice", normalize([
    { ...meeting, title: "Tutorial 1 · regression", course: "STA437H1F" },
    { ...meeting, title: "STA437H1 TUT0205" },
    { ...meeting, kind: "DDL", title: "Quiz 1" },
    { ...meeting, kind: "DDL", title: "Quiz 1" }
  ]));
  assert.equal(result.saved, 2);
  assert.equal(result.duplicates, 2);
});

test("Dynamo batches transact together and retry a concurrent duplicate check using the import guard", async () => {
  const db = new StudyBridgeDatabase(), rows = new Map();
  let transactions = 0;
  db.dynamo = {
    get: async (pk, sk) => rows.get(`${pk}|${sk}`) || null,
    query: async (pk, prefix) => [...rows].filter(([key]) => key.startsWith(`${pk}|${prefix}`)).map(([, value]) => value),
    transactPut: async (writes) => {
      await new Promise((resolve) => setImmediate(resolve));
      for (const record of writes) {
        const old = rows.get(`${record.pk}|${record.sk}`);
        if (record.createOnly && old || record.expectedData && JSON.stringify(record.expectedData) !== JSON.stringify(old)) {
          const error = new Error("guard changed"); error.code = "TransactionCanceledException"; throw error;
        }
      }
      transactions++;
      writes.forEach((record) => rows.set(`${record.pk}|${record.sk}`, record.data));
    }
  };
  const items = normalize([meeting, { ...meeting, kind: "DDL", title: "Quiz 1" }]);
  const results = await Promise.all([db.importScheduleBatch("alice", items), db.importScheduleBatch("alice", items)]);
  assert.equal(results.reduce((total, result) => total + result.saved, 0), 2);
  assert.equal(results.reduce((total, result) => total + result.duplicates, 0), 2);
  assert.equal(transactions, 1);
  assert.equal((await db.listCourses("alice")).length, 1);
});
