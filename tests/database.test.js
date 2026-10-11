const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");

test("local writes recover after a duplicate SB ID is rejected", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-db-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  await db.createUser({ id: "alice", email: "alice@example.test", profile: { sbId: "alice" } });
  await assert.rejects(
    db.createUser({ id: "duplicate", email: "duplicate@example.test", profile: { sbId: "ALICE" } }),
    /already taken/
  );
  await db.createCourse({ id: "course", userId: "alice", name: "Calculus" });
  assert.equal((await db.listCourses("alice")).length, 1);
  const saved = JSON.parse(await fs.readFile(db.local.file, "utf8"));
  assert.equal(saved.users.duplicate, undefined);
  assert.equal(saved.courses.course.name, "Calculus");
  assert.deepEqual(await fs.readdir(directory), ["database.json"]);
});

test("DynamoDB invitation deletion preserves password reset requests and unrelated records", async () => {
  const db = new StudyBridgeDatabase();
  const invite = { id: "invite", code: "SB-DELETE" };
  const reset = { id: "reset", code: "RESET-CODE", kind: "passwordReset" };
  const records = [invite, reset];
  const deletions = [];
  db.dynamo = {
    scanType: async () => records,
    delete: async (pk, sk) => { deletions.push([pk, sk]); records.splice(records.indexOf(invite), 1); }
  };
  assert.equal(await db.deleteInvite("missing"), null);
  assert.equal(await db.deleteInvite("reset"), null);
  assert.deepEqual(deletions, []);
  assert.deepEqual(await db.deleteInvite("invite"), invite);
  assert.deepEqual(deletions, [["INVITE#SB-DELETE", "META"]]);
  assert.deepEqual(records, [reset]);
});

test("corrupted local data is reported without replacing the file", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-corrupt-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  const original = '{"users":';
  await fs.writeFile(db.local.file, original);
  await assert.rejects(db.createCourse({ id: "course", userId: "alice", name: "Calculus" }), SyntaxError);
  assert.equal(await fs.readFile(db.local.file, "utf8"), original);
});
