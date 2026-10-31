const { test } = require("node:test");
const assert = require("node:assert/strict");
const { StudyBridgeDatabase } = require("../lib/database");
function database() {
  const db = new StudyBridgeDatabase(), rows = new Map();
  const key = (pk, sk) => JSON.stringify([pk, sk]);
  db.dynamo = {
    get: async (pk, sk) => structuredClone(rows.get(key(pk, sk)) || null),
    query: async (pk, prefix) => [...rows].filter(([id]) => { const [p, s] = JSON.parse(id); return p === pk && s.startsWith(prefix); }).map(([, value]) => structuredClone(value)),
    transactPut: async (records) => {
      for (const record of records) {
        const old = rows.get(key(record.pk, record.sk));
        if (record.createOnly && old || record.expectedData !== undefined && JSON.stringify(old) !== JSON.stringify(record.expectedData)) throw Object.assign(Error("Conflict"), { code: "TransactionCanceledException" });
      }
      for (const record of records) if (!record.checkOnly) { if (record.deleteOnly) rows.delete(key(record.pk, record.sk)); else rows.set(key(record.pk, record.sk), structuredClone(record.data)); }
    }
  };
  return db;
}
test("cloud task revisions and global two-slot leases are conditional across competing workers", async () => {
  const db = database();
  const leased = await Promise.all(Array.from({ length: 20 }, (_, n) => db.studySlot(n % 2, `worker-${n}`, Date.now() + 10000, true)));
  assert.equal(leased.filter(Boolean).length, 2);
  assert.equal(await db.studySlot(0, "foreign-token", 0), false);
  assert.equal(await db.studySlot(0, "worker-0", 0), true);
  assert.equal(await db.studySlot(0, "replacement", Date.now() + 10000, true), true);
  assert.equal(await db.studySlot(0, "worker-0", 0), false);
  const job = { id: "task", userId: "alice", courseId: "math", conversationId: "default", createdAt: new Date().toISOString(), status: "queued" };
  const saves = await Promise.allSettled([db.saveStudyJob(job), db.saveStudyJob(job)]);
  assert.equal(saves.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await db.pendingStudyJobs()).length, 1);
  await db.updateStudyJob("alice", "math", "task", (job) => ({ ...job, status: "completed" }));
  assert.equal((await db.pendingStudyJobs()).length, 0);
  assert.equal(await db.getStudyJob("bob", "math", "task"), null);
});
