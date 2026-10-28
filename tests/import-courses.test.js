const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { identity, prepareCourses } = require("../lib/import-courses");
const { StudyBridgeDatabase } = require("../lib/database");
const { normalizeBatch, storedItems } = require("../lib/schedule-batch");

test("course imports reuse names/codes without replacing manual data or merging distinct campuses", () => {
  const manual = { id: "stats", userId: "alice", name: "STA437", term: "My saved term", notes: "Keep this" };
  const result = prepareCourses("alice", ["sta 437h1f", "STA437H1", "STA437", "Linear Algebra", "linear algebra", "", "Unknown", "TUT0105", "MAT137 / MAT223"], [manual], "2026 Fall");
  assert.equal(result.createdCourses.length, 1);
  assert.equal(result.createdCourses[0].name, "Linear Algebra");
  assert.equal(result.courses.find((course) => course.id === "stats"), manual);
  assert.deepEqual(manual, { id: "stats", userId: "alice", name: "STA437", term: "My saved term", notes: "Keep this" });
  const separate = prepareCourses("alice", ["STA437H1F", "STA437H5F", "STA437"], []);
  assert.deepEqual(separate.createdCourses.map((course) => course.name).sort(), ["STA437H1", "STA437H5"]);
  assert.deepEqual(prepareCourses("alice", ["STA437H1", "STA437H5"], [manual]).createdCourses.map((course) => course.name).sort(), ["STA437H1", "STA437H5"]);
  assert.equal(identity({}), null);
});

test("extracted course creation is durable, isolated, idempotent and independent of calendar confirmation", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-import-courses-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json");
  let writes = 0;
  const save = db.local.save.bind(db.local);
  db.local.save = async (...args) => { writes++; return save(...args); };
  const results = await Promise.all([
    db.ensureImportedCourses("alice", ["STA437H1F", "STA437H1", "MAT137Y1Y"], "2026 Fall"),
    db.ensureImportedCourses("alice", ["STA437H1", "MAT137Y1"], "2026 Fall")
  ]);
  assert.equal(results.reduce((sum, result) => sum + result.createdCourses.length, 0), 2);
  assert.equal(writes, 1);
  const courses = await db.listCourses("alice");
  assert.equal(courses.length, 2);
  assert.equal((await db.listDocuments("alice", courses[0].id)).length, 0, "extraction does not save calendar items before confirmation");
  const restarted = new StudyBridgeDatabase(); restarted.local.file = db.local.file;
  assert.equal((await restarted.ensureImportedCourses("alice", ["STA437H1F"])).createdCourses.length, 0);
  assert.equal((await db.ensureImportedCourses("bob", ["STA437H1F"])).createdCourses.length, 1);
  const imported = await db.importScheduleBatch("alice", normalizeBatch({ timeZone: "America/Toronto", source: "outline.pdf", items: [
    { title: "Tutorial", kind: "TUT", course: "STA437H1F", startsAt: "2026-11-02T10:00", notes: "Linear regression topic", evidence: "Page 2" },
    { title: "Assignment", kind: "DDL", course: "MAT137Y1", startsAt: "2026-11-03T23:59" },
    { title: "Personal plan", kind: "EVENT", startsAt: "2026-11-04T12:00" }
  ] }));
  assert.equal(imported.saved, 3);
  const math = courses.find((course) => course.name === "MAT137Y1");
  const stats = courses.find((course) => course.name === "STA437H1");
  assert.equal(imported.records.find((doc) => doc.title.includes("Tutorial")).courseId, stats.id);
  assert.equal(imported.records.find((doc) => doc.title.includes("Assignment")).courseId, math.id);
  assert.equal(storedItems(imported.courses, imported.records, "alice").length, 3);
  assert.equal(JSON.parse((await db.listDocuments("alice", stats.id))[0].text).notes, "Linear regression topic");
  db.local.save = async () => { throw new Error("disk full"); };
  await assert.rejects(db.ensureImportedCourses("alice", ["CSC108H1"]), /disk full/);
  assert.equal((await db.listCourses("alice")).some((course) => course.name === "CSC108H1"), false);
});

test("Dynamo extracted courses use bounded atomic transactions and guard concurrent extraction retries", async () => {
  const db = new StudyBridgeDatabase(), rows = new Map();
  const sizes = [];
  db.dynamo = {
    get: async (pk, sk) => rows.get(`${pk}|${sk}`) || null,
    query: async (pk, prefix) => [...rows].filter(([key]) => key.startsWith(`${pk}|${prefix}`)).map(([, value]) => value),
    transactPut: async (writes) => {
      await new Promise((resolve) => setImmediate(resolve));
      for (const record of writes) {
        const old = rows.get(`${record.pk}|${record.sk}`);
        if (record.createOnly && old || record.expectedData && JSON.stringify(old) !== JSON.stringify(record.expectedData)) {
          const error = new Error("Concurrent import"); error.code = "TransactionCanceledException"; throw error;
        }
      }
      sizes.push(writes.length);
      writes.forEach((record) => rows.set(`${record.pk}|${record.sk}`, record.data));
    }
  };
  const names = Array.from({ length: 170 }, (_, index) => `BIO${100 + index}`);
  const results = await Promise.all([db.ensureImportedCourses("alice", names), db.ensureImportedCourses("alice", names)]);
  assert.equal(results.reduce((sum, result) => sum + result.createdCourses.length, 0), 170);
  assert.equal((await db.listCourses("alice")).length, 170);
  assert.ok(sizes.every((size) => size <= 81));
  assert.equal((await db.ensureImportedCourses("alice", names)).createdCourses.length, 0);
});
