const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");
const attachments = [{ name: "course.txt", kind: "file", mime: "application/octet-stream", size: 150000, base64: Buffer.alloc(150000, 97).toString("base64") }];

for (const mode of ["local", "dynamodb"]) {
  test(`${mode}: direct message files persist separately, survive restart and deduplicate concurrent retries`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-dm-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json"); db.dynamo = null;
    const memory = memoryDynamo();
    if (mode === "dynamodb") {
      const call = memory.store.call;
      memory.store.call = (target, body) => call(target, ["Query", "Scan"].includes(target) ? { ...body, Limit: 100 } : body);
      db.dynamo = memory.store;
    }
    const body = { chatId: "chat", senderId: "alice", content: "Here are my notes", attachments, clientId: "retry-request-123" };
    const messages = await Promise.all(Array.from({ length: 4 }, () => db.sendDirectMessage(body)));
    assert.equal(new Set(messages.map((item) => item.id)).size, 1);
    assert.equal((await db.listDirectMessages("chat")).length, 1);
    assert.ok(JSON.stringify(messages[0]).length < 1500, "message records contain only attachment metadata");
    if (!db.dynamo) db.local.state = null;
    const saved = await db.getDirectMessage("chat", messages[0].id);
    assert.equal((await db.readDirectMessageAttachment("chat", saved, 0)).base64, attachments[0].base64);
    assert.equal(await db.getDirectMessage("other-chat", saved.id), null);
    assert.equal(await db.readDirectMessageAttachment("other-chat", saved, 0), null);
    assert.equal(await db.readDirectMessageAttachment("chat", saved, 6), null);
    await assert.rejects(db.sendDirectMessage({ ...body, content: "Different payload" }), { statusCode: 409 });
    assert.equal((await db.sendDirectMessage({ ...body, senderId: "bob" })).senderId, "bob");
    assert.equal((await db.listDirectMessages("chat")).length, 2);
    if (db.dynamo) {
      assert.ok(memory.calls.some((call) => call.target === "TransactWriteItems"));
      const materialRows = [...memory.rows.values()].filter((row) => row.type.S === "material");
      assert.equal(materialRows.length, 2, "losing concurrent uploads leave no manifests");
    }
  });

  test(`${mode}: failed message publication leaves no visible message or attachment manifest`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-dm-failed-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json"); db.dynamo = null;
    const memory = memoryDynamo();
    if (mode === "dynamodb") {
      const call = memory.store.call;
      memory.store.call = (target, body) => call(target, ["Query", "Scan"].includes(target) ? { ...body, Limit: 100 } : body);
      db.dynamo = memory.store;
      db.dynamo.transactPut = async () => { throw Object.assign(new Error("Publish failed"), { code: "TransactionCanceledException" }); };
    } else db.local.save = async () => { throw new Error("Publish failed"); };
    await assert.rejects(db.sendDirectMessage({ chatId: "chat", senderId: "alice", content: "", attachments, clientId: "failed-request" }), /Publish failed/);
    assert.equal((await db.listDirectMessages("chat")).length, 0);
    if (db.dynamo) assert.equal([...memory.rows.values()].filter((row) => ["material", "materialPart"].includes(row.type.S)).length, 0);
    else assert.equal(Object.keys((await db.local.load()).materials || {}).length, 0);
  });
}

test("lost DynamoDB publication responses never delete a committed message's attachments", async () => {
  const db = new StudyBridgeDatabase();
  const memory = memoryDynamo(), call = memory.store.call;
  memory.store.call = (target, body) => call(target, ["Query", "Scan"].includes(target) ? { ...body, Limit: 100 } : body);
  db.dynamo = memory.store;
  const publish = db.dynamo.transactPut.bind(db.dynamo);
  db.dynamo.transactPut = async (writes) => { await publish(writes); throw Object.assign(new Error("Lost database response"), { code: "TimeoutError" }); };
  const body = { chatId: "chat", senderId: "alice", content: "", attachments, clientId: "lost-commit-response" };
  const message = await db.sendDirectMessage(body);
  assert.equal((await db.readDirectMessageAttachment("chat", message, 0)).base64, attachments[0].base64);
  assert.equal((await db.sendDirectMessage(body)).id, message.id);
  assert.equal((await db.listDirectMessages("chat")).length, 1);
});

test("a DynamoDB download reads only the requested file from a multi-file message", async () => {
  const db = new StudyBridgeDatabase();
  const memory = memoryDynamo(), call = memory.store.call;
  memory.store.call = (target, body) => call(target, ["Query", "Scan"].includes(target) ? { ...body, Limit: 100 } : body);
  db.dynamo = memory.store;
  const files = [attachments[0], { ...attachments[0], name: "second.txt" }];
  const message = await db.sendDirectMessage({ chatId: "chat", senderId: "alice", content: "", attachments: files, clientId: "separate-file-read" });
  memory.calls.length = 0;
  assert.equal((await db.readDirectMessageAttachment("chat", message, 1)).name, "second.txt");
  const reads = memory.calls.filter((call) => call.target === "Query");
  assert.ok(reads.length > 0);
  assert.ok(reads.every((call) => call.body.ExpressionAttributeValues[":prefix"].S.includes("#FILE#1#PART#")));
});
