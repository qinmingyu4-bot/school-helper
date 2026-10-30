const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");

async function database(t, mode) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-classmates-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.local.file = path.join(directory, "database.json");
  db.dynamo = null;
  if (mode === "dynamodb") {
    const { store } = memoryDynamo();
    const call = store.call;
    store.call = (target, body) => call(target, ["Scan", "Query"].includes(target) ? { ...body, Limit: 100 } : body);
    db.dynamo = store;
  }
  // Separate clients share durable storage, without an in-process request lock.
  const other = new StudyBridgeDatabase();
  other.local = db.local;
  other.dynamo = db.dynamo;
  return { db, other };
}

for (const mode of ["local", "dynamodb"]) {
  test(`${mode}: concurrent requests and accepts create one request and one shared chat`, async (t) => {
    const { db, other } = await database(t, mode);
    const sent = await Promise.all(Array.from({ length: 6 }, (_, index) => (index % 2 ? other : db).requestClassmate("alice", "bob")));
    assert.equal(new Set(sent.map((item) => item.request.id)).size, 1);
    assert.equal(sent.filter((item) => item.created).length, 1);
    assert.equal((await db.listClassmateRequests("bob")).length, 1);
    const accepted = await Promise.all(Array.from({ length: 6 }, (_, index) => (index % 2 ? other : db).respondClassmateRequest("bob", sent[0].request.id, "accept")));
    assert.equal(new Set(accepted.map((item) => item.connection.id)).size, 1);
    assert.equal((await db.listClassmates("alice")).length, 1);
    assert.equal((await other.listClassmates("bob"))[0].id, accepted[0].connection.id);
    assert.equal((await db.getClassmateRequest("alice", sent[0].request.id)).status, "accepted");
  });

  test(`${mode}: opposite-direction requests connect atomically and preserve messages`, async (t) => {
    const { db, other } = await database(t, mode);
    const results = await Promise.all([db.requestClassmate("alice", "bob"), other.requestClassmate("bob", "alice")]);
    assert.equal(results.filter((item) => item.status === "connected").length, 1);
    const [mate] = await db.listClassmates("alice");
    assert.equal((await db.listClassmateRequests("bob")).length, 1);
    await db.createDirectMessage({ id: "hello", chatId: mate.id, senderId: "alice", content: "Retained history" });
    assert.equal((await other.requestClassmate("bob", "alice")).connection.id, mate.id);
    assert.equal((await db.listDirectMessages(mate.id))[0].content, "Retained history");
    assert.equal((await db.getClassmate("outsider", mate.id)), null);
  });

  test(`${mode}: receiver-only decisions cannot accept and ignore the same request`, async (t) => {
    const { db, other } = await database(t, mode);
    const sent = await db.requestClassmate("alice", "bob");
    await assert.rejects(db.respondClassmateRequest("outsider", sent.request.id, "accept"), { statusCode: 404 });
    await assert.rejects(db.respondClassmateRequest("alice", sent.request.id, "ignore"), { statusCode: 403 });
    await assert.rejects(db.respondClassmateRequest("bob", sent.request.id, "delete"), { statusCode: 400 });
    const results = await Promise.allSettled([db.respondClassmateRequest("bob", sent.request.id, "ignore"), other.respondClassmateRequest("bob", sent.request.id, "accept")]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(results.find((item) => item.status === "rejected").reason.statusCode, 409);
    const saved = await db.getClassmateRequest("bob", sent.request.id);
    assert.equal((await db.listClassmates("alice")).length, saved.status === "accepted" ? 1 : 0);
    if (saved.status === "ignored") {
      const retry = await db.requestClassmate("alice", "bob");
      assert.notEqual(retry.request.id, sent.request.id);
      assert.equal(retry.status, "pending");
    }
  });

  test(`${mode}: legacy requests and connections retain their original IDs`, async (t) => {
    const { db } = await database(t, mode);
    const old = await db.createClassmateRequest({ id: "legacy-request", fromUserId: "alice", toUserId: "bob" });
    assert.equal((await db.requestClassmate("alice", "bob")).request.id, old.id);
    const accepted = await db.respondClassmateRequest("bob", old.id, "accept");
    assert.equal(accepted.connection.requestId, old.id);
    await db.createClassmate({ id: "legacy-chat", userIds: ["carol", "dave"] });
    await db.createDirectMessage({ id: "legacy-message", chatId: "legacy-chat", senderId: "carol", content: "Keep me" });
    assert.equal((await db.requestClassmate("dave", "carol")).connection.id, "legacy-chat");
    assert.equal((await db.listDirectMessages("legacy-chat"))[0].content, "Keep me");
  });

  test(`${mode}: failed acceptance leaves the request pending without an orphaned chat`, async (t) => {
    const { db } = await database(t, mode);
    const sent = await db.requestClassmate("alice", "bob");
    const storage = db.dynamo || db.local;
    const method = db.dynamo ? "transactPut" : "save";
    const saved = storage[method];
    storage[method] = async () => { throw new Error("Storage unavailable"); };
    await assert.rejects(db.respondClassmateRequest("bob", sent.request.id, "accept"), /Storage unavailable/);
    storage[method] = saved;
    assert.equal((await db.getClassmateRequest("bob", sent.request.id)).status, "pending");
    assert.equal((await db.listClassmates("alice")).length, 0);
    assert.equal((await db.respondClassmateRequest("bob", sent.request.id, "accept")).status, "connected");
    if (!db.dynamo) db.local.state = null;
    assert.equal((await db.listClassmates("alice")).length, 1);
  });
}
