const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");

for (const mode of ["local", "dynamodb"]) {
  test(`${mode}: unread existence isolates accounts and stays true until every conversation is read`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-unread-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json"); db.dynamo = null;
    if (mode === "dynamodb") {
      const memory = memoryDynamo(), call = memory.store.call;
      memory.store.call = (target, body) => call(target, ["Scan", "Query"].includes(target) ? { ...body, Limit: 100 } : body);
      db.dynamo = memory.store;
    }
    await db.createClassmate({ id: "ab", userIds: ["alice", "bob"] });
    await db.createClassmate({ id: "ac", userIds: ["alice", "carol"] });
    await db.createClassmate({ id: "de", userIds: ["dave", "eve"] });
    await db.createDirectMessage({ id: "mine", chatId: "ab", senderId: "alice", content: "Own outgoing message" });
    await db.createDirectMessage({ id: "other", chatId: "de", senderId: "dave", content: "Unrelated private message" });
    assert.equal(await db.hasUnreadDirectMessages("alice"), false);
    assert.equal(await db.hasUnreadDirectMessages("bob"), true);
    await db.createDirectMessage({ id: "from-bob", chatId: "ab", senderId: "bob", content: "Hello" });
    await db.createDirectMessage({ id: "from-carol", chatId: "ac", senderId: "carol", content: "", attachments: [{ kind: "image" }] });
    assert.equal(await db.hasUnreadDirectMessages("alice"), true);
    await db.markDirectMessagesRead("ab", "alice", ["from-bob"]);
    assert.equal(await db.hasUnreadDirectMessages("alice"), true);
    await db.markDirectMessagesRead("ac", "alice", ["from-carol"]);
    assert.equal(await db.hasUnreadDirectMessages("alice"), false);
    assert.equal(await db.hasUnreadDirectMessages("eve"), true);
    assert.equal(await db.hasUnreadDirectMessages("outsider"), false);
    await db.createDirectMessage({ id: "old-unread", chatId: "ab", senderId: "bob", content: "Still unread" });
    for (let index = 0; index < 81; index++) await db.createDirectMessage({ id: `outgoing-${index}`, chatId: "ab", senderId: "alice", content: "New outgoing" });
    assert.equal(await db.hasUnreadDirectMessages("alice"), true, "older unread messages must not disappear behind the latest-80 window");
    if (!db.dynamo) db.local.state = null;
    assert.equal(await db.hasUnreadDirectMessages("alice"), true);
  });
}
