const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const spaces = require("../public/chat-spaces");
const { StudyBridgeDatabase } = require("../lib/database");

test("browser and server share the permanent general chat and everyday prompts", () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/chat-spaces"), "utf8"), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.StudyBridgeChatSpaces)), spaces);
  assert.equal(spaces.general.id, "general");
  assert.equal(spaces.general.chatType, "general");
  assert.equal(spaces.prompts.length, 4);
  assert.ok(spaces.prompts.every(([label, prompt]) => label && prompt));
});

test("DynamoDB general messages isolate users without counting a virtual course", async () => {
  const db = new StudyBridgeDatabase();
  const rows = new Map();
  db.dynamo = {
    put: async (pk, sk, type, data) => { rows.set(`${pk}|${sk}`, structuredClone(data)); return data; },
    query: async (pk, prefix) => [...rows.entries()].filter(([key]) => key.startsWith(`${pk}|${prefix}`)).map(([, value]) => structuredClone(value))
  };
  for (const [id, userId, courseId] of [["a", "alice", "general"], ["b", "bob", "general"], ["c", "alice", "math"]]) {
    await db.createMessage({ id, userId, courseId, role: "user", content: id });
  }
  assert.deepEqual((await db.listMessages("alice", "general")).map((row) => row.id), ["a"]);
  assert.deepEqual((await db.listMessages("bob", "general")).map((row) => row.id), ["b"]);
  assert.deepEqual(await db.listCourses("alice"), []);
  assert.deepEqual(await db.getUserStats("alice"), { courses: 0, documents: 0, messages: 1 });
});
