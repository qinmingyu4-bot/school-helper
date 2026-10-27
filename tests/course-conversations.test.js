const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { key, title, touch, visibleCourses } = require("../public/course-conversations");
const { prepareBatch, storedItems } = require("../lib/schedule-batch");

test("hiding the planner chat preserves its schedule records, duplicate checks and save target", () => {
  const planner = { id: "planner", userId: "alice", name: "Schedule & Deadlines", term: "StudyBridge planner" };
  const math = { id: "math", userId: "alice", name: "MAT137" };
  const courses = [planner, math];
  const original = JSON.stringify(courses);
  assert.deepEqual(visibleCourses(courses), [math]);
  assert.deepEqual(visibleCourses([planner]), []);
  const item = { title: "Personal plan", kind: "EVENT", course: "", startsAt: "2026-11-02T20:00:00.000Z", endsAt: "", timeZone: "America/Toronto" };
  const first = prepareBatch("alice", [item], courses, []);
  assert.equal(first.newCourse, false);
  assert.equal(first.records[0].courseId, planner.id);
  assert.equal(storedItems(courses, first.records, "alice")[0].title, item.title);
  const retry = prepareBatch("alice", [item], courses, first.records);
  assert.equal(retry.saved, 0);
  assert.equal(retry.duplicates, 1);
  assert.equal(JSON.stringify(courses), original, "presentation filtering must not mutate schedule storage");
});

test("conversation identity and titles preserve distinct drafts and manual names", () => {
  assert.notEqual(key("alice", "math", "a"), key("alice", "math", "b"));
  assert.notEqual(key("alice", "math", "a"), key("bob", "math", "a"));
  assert.throws(() => title(" ")); assert.throws(() => title("a".repeat(121)));
  const chat = { title: "新对话", titleEdited: false };
  const first = touch(chat, { role: "user", content: "新对话", createdAt: "2026-01-01" });
  assert.equal(touch(first, { role: "user", content: "Second question" }).title, "新对话");
  assert.equal(touch({ title: "My assignment", titleEdited: true }, { role: "user", content: "Replace this" }).title, "My assignment");
});

test("legacy messages remain in default chat; new conversations isolate history and uploads while sharing course documents", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-conversations-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json");
  await db.createCourse({ id: "math", userId: "alice", name: "MAT137" });
  await db.createCourse({ id: "stats", userId: "alice", name: "STA437" });
  await db.createMessage({ id: "legacy", userId: "alice", courseId: "math", role: "user", content: "Old messages" });
  await db.saveChatAttachments("alice", "math", "legacy", [{ name: "old.txt", text: "Legacy private source" }]);
  const [chatA, chatB] = await Promise.all([db.createConversation("alice", "math"), db.createConversation("alice", "math", "Exam review")]);
  await db.createMessage({ id: "a1", userId: "alice", courseId: "math", conversationId: chatA.id, role: "user", content: "Explain derivatives" });
  await db.saveChatAttachments("alice", "math", "a1", [{ name: "a.txt", text: "Only A knows this" }]);
  await db.createMessage({ id: "b1", userId: "alice", courseId: "math", conversationId: chatB.id, role: "user", content: "Review exam topics" });
  await db.createDocument({ id: "shared", userId: "alice", courseId: "math", title: "Syllabus", text: "Shared evidence" });
  assert.deepEqual((await db.listMessages("alice", "math", 80, "default")).map((row) => row.id), ["legacy"]);
  assert.deepEqual((await db.listMessages("alice", "math", 80, chatA.id)).map((row) => row.id), ["a1"]);
  assert.deepEqual((await db.listMessages("alice", "math", 80, chatB.id)).map((row) => row.id), ["b1"]);
  assert.equal((await db.listMessages("alice", "math", Infinity)).length, 3);
  assert.equal((await db.listChatAttachments("alice", "math", "default"))[0].name, "old.txt");
  assert.equal((await db.listChatAttachments("alice", "math", chatA.id))[0].name, "a.txt");
  assert.deepEqual(await db.listChatAttachments("alice", "math", chatB.id), []);
  assert.equal((await db.getConversation("alice", "math", chatA.id)).title, "Explain derivatives");
  assert.equal(await db.getConversation("bob", "math", chatA.id), null);
  assert.equal(await db.getConversation("alice", "stats", chatA.id), null);
  await db.renameConversation("alice", "math", chatA.id, "Assignment 1");
  await db.createMessage({ id: "a2", userId: "alice", courseId: "math", conversationId: chatA.id, role: "assistant", content: "Late response" });
  assert.equal((await db.getConversation("alice", "math", chatA.id)).title, "Assignment 1");
  const restarted = new StudyBridgeDatabase(); restarted.local.file = db.local.file;
  assert.equal((await restarted.listConversations("alice", "math")).length, 3);
  assert.equal((await restarted.listMessages("alice", "math", Infinity)).find((row) => row.id === "legacy").conversationId, undefined, "no destructive migration of old messages");
  assert.equal((await restarted.listDocuments("alice", "math"))[0].text, "Shared evidence");
  const save = restarted.local.save.bind(restarted.local);
  restarted.local.save = async () => { throw new Error("disk full"); };
  await assert.rejects(restarted.createConversation("alice", "math", "Unsaved"), /disk full/);
  assert.equal((await restarted.listConversations("alice", "math")).length, 3);
  await assert.rejects(restarted.renameConversation("alice", "math", chatA.id, "Unsaved rename"), /disk full/);
  assert.equal((await restarted.getConversation("alice", "math", chatA.id)).title, "Assignment 1");
  await assert.rejects(restarted.createMessage({ id: "unsaved", userId: "alice", courseId: "math", conversationId: chatA.id, role: "user", content: "Not durable" }), /disk full/);
  assert.equal((await restarted.listMessages("alice", "math", Infinity)).some((message) => message.id === "unsaved"), false);
  restarted.local.save = save;
  await restarted.deleteCourse("alice", "math");
  assert.deepEqual(await restarted.listMessages("alice", "math"), []);
  assert.equal((await restarted.listConversations("alice", "math")).length, 1, "only the virtual default remains");
  assert.ok(await restarted.getCourse("alice", "stats"));
});

test("Dynamo conversation renames and late replies preserve message ownership and do not overwrite titles", async () => {
  const db = new StudyBridgeDatabase(), rows = new Map();
  db.dynamo = {
    get: async (pk, sk) => rows.get(`${pk}|${sk}`) || null,
    put: async (pk, sk, type, value) => { rows.set(`${pk}|${sk}`, value); return value; },
    delete: async (pk, sk) => rows.delete(`${pk}|${sk}`),
    query: async (pk, prefix) => [...rows].filter(([key]) => key.startsWith(`${pk}|${prefix}`)).map(([, value]) => value),
    transactPut: async (records) => {
      await new Promise((resolve) => setImmediate(resolve));
      for (const record of records) {
        const old = rows.get(`${record.pk}|${record.sk}`);
        if (record.expectedData && JSON.stringify(old) !== JSON.stringify(record.expectedData) || record.createOnly && old) {
          const error = new Error("Concurrent change"); error.code = "TransactionCanceledException"; throw error;
        }
      }
      records.forEach((record) => rows.set(`${record.pk}|${record.sk}`, record.data));
    }
  };
  const chat = await db.createConversation("alice", "math");
  await Promise.all([
    db.renameConversation("alice", "math", chat.id, "Manual title"),
    db.createMessage({ id: "m", userId: "alice", courseId: "math", conversationId: chat.id, role: "user", content: "Question" })
  ]);
  assert.equal((await db.getConversation("alice", "math", chat.id)).title, "Manual title");
  assert.equal((await db.listMessages("alice", "math", 80, chat.id)).length, 1);
  await assert.rejects(db.createMessage({ id: "bad", userId: "bob", courseId: "math", conversationId: chat.id, role: "user", content: "Not mine" }), /Conversation not found/);
  assert.equal(await db.deleteConversation("alice", "math", chat.id), true);
  assert.equal(await db.getConversation("alice", "math", chat.id), null);
  assert.equal(await db.renameConversation("alice", "math", chat.id, "Revived"), null);
  await assert.rejects(db.createMessage({ id: "late", userId: "alice", courseId: "math", conversationId: chat.id, role: "assistant", content: "Late reply" }), /Conversation not found/);
  assert.deepEqual(await db.listMessages("alice", "math", Infinity, chat.id), []);
  await db.createMessage({ id: "default", userId: "alice", courseId: "math", conversationId: "default", role: "user", content: "Old default" });
  await db.deleteConversation("alice", "math", "default");
  assert.deepEqual(await db.listConversations("alice", "math"), []);
  await assert.rejects(db.createMessage({ id: "late-default", userId: "alice", courseId: "math", conversationId: "default", role: "assistant", content: "Late default" }), /Conversation not found/);
});

test("local conversation deletion is durable, rolls back failed saves and preserves shared data", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-delete-chat-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json");
  const a = await db.createConversation("alice", "math"), b = await db.createConversation("alice", "math", "Keep");
  await db.createMessage({ id: "legacy", userId: "alice", courseId: "math", role: "user", content: "Legacy" });
  await db.createMessage({ id: "a", userId: "alice", courseId: "math", conversationId: a.id, role: "user", content: "Delete" });
  await db.createMessage({ id: "b", userId: "alice", courseId: "math", conversationId: b.id, role: "user", content: "Keep" });
  await db.saveChatAttachments("alice", "math", "legacy", [{ name: "legacy.txt", text: "legacy" }]);
  const ref = await db.saveChatAttachments("alice", "math", "a", [{ name: "a.txt", text: "private" }]);
  await db.saveChatAttachments("alice", "math", "b", [{ name: "b.txt", text: "keep" }]);
  await db.createDocument({ id: "shared", userId: "alice", courseId: "math", title: "Syllabus", text: "Shared" });
  const save = db.local.save.bind(db.local);
  db.local.save = async () => { throw new Error("disk full"); };
  await assert.rejects(db.deleteConversation("alice", "math", a.id), /disk full/);
  assert.ok(await db.getConversation("alice", "math", a.id));
  assert.equal((await db.listMessages("alice", "math", Infinity, a.id)).length, 1);
  assert.ok(await db.readMaterial("alice", "math", ref));
  db.local.save = save;
  assert.equal(await db.deleteConversation("bob", "math", a.id), false);
  await db.deleteConversation("alice", "math", a.id);
  assert.equal(await db.readMaterial("alice", "math", ref), null);
  await assert.rejects(db.createMessage({ id: "late", userId: "alice", courseId: "math", conversationId: a.id, role: "assistant", content: "Late" }), /Conversation not found/);
  await db.deleteConversation("alice", "math", "default");
  assert.equal(await db.getConversation("alice", "math", "default"), null);
  assert.equal(await db.renameConversation("alice", "math", "default", "Revived"), null);
  assert.deepEqual((await db.listConversations("alice", "math")).map((chat) => chat.id), [b.id]);
  assert.deepEqual((await db.listMessages("alice", "math", Infinity)).map((message) => message.id), ["b"]);
  assert.equal((await db.listChatAttachments("alice", "math"))[0].name, "b.txt");
  assert.equal((await db.listDocuments("alice", "math"))[0].id, "shared");
  const restarted = new StudyBridgeDatabase(); restarted.local.file = db.local.file;
  assert.deepEqual((await restarted.listConversations("alice", "math")).map((chat) => chat.id), [b.id]);
});
