const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildMaterialContext, selectImages } = require("../lib/study-context");
const { StudyBridgeDatabase } = require("../lib/database");
const { DynamoStore } = require("../lib/aws-dynamodb");

test("retrieval searches beyond eight documents and late passages within a bounded prompt", () => {
  const documents = Array.from({ length: 50 }, (_, i) => ({ title: `Lecture ${i}`, text: "background ".repeat(3000) }));
  documents[49].text += "photosynthesis checkpoint: oxygen comes from water";
  const context = buildMaterialContext({ documents, message: "Explain the photosynthesis checkpoint", budget: 35000 });
  assert.ok(context.includes("oxygen comes from water"));
  assert.ok(context.includes("Lecture 49"));
  assert.ok(context.includes("not the complete corpus"));
  assert.ok(context.length < 35500);
});

test("small corpora retain complete text, Chinese filenames and prior attachments", () => {
  const context = buildMaterialContext({ documents: [{ title: "完整讲义", text: "first " + "x".repeat(13000) + " LAST_PAGE" }], attachments: [{ name: "之前的附件.txt", kind: "text", text: "ATTACHMENT_END" }], message: "继续" });
  assert.ok(context.includes("LAST_PAGE") && context.includes("ATTACHMENT_END") && context.includes("之前的附件.txt"));
});

test("Chinese queries retrieve matching late passages and broad reviews sample the end", () => {
  const document = { title: "经济学", text: "背景 ".repeat(50000) + "机会成本是放弃的最佳选择。" };
  assert.ok(buildMaterialContext({ documents: [document], message: "解释机会成本", budget: 10000 }).includes("放弃的最佳选择"));
  assert.ok(buildMaterialContext({ documents: [document], message: "总结整份资料", budget: 10000 }).includes("放弃的最佳选择"));
});

test("a named older image remains available outside the latest eight images", () => {
  const attachments = Array.from({ length: 12 }, (_, i) => ({ name: `image-${i}.png`, kind: "image", dataUrl: `data:image/png;base64,${i}` }));
  const selected = selectImages(attachments, "Explain image-0.png again");
  assert.ok(selected.includes(attachments[0]));
  assert.equal(selected.length, 8);
});

function memoryDynamo() {
  const rows = new Map();
  return {
    rows,
    put: async (pk, sk, type, data) => { assert.ok(Buffer.byteLength(JSON.stringify(data)) < 400000); rows.set(`${pk}|${sk}`, structuredClone(data)); return data; },
    get: async (pk, sk) => rows.get(`${pk}|${sk}`) || null,
    query: async (pk, prefix) => [...rows.entries()].filter(([key]) => key.startsWith(`${pk}|${prefix}`)).map(([, value]) => structuredClone(value)),
    delete: async (pk, sk) => rows.delete(`${pk}|${sk}`)
  };
}

test("DynamoDB chunks full Unicode materials and images, isolates users/courses and deletes them", async () => {
  const db = new StudyBridgeDatabase();
  db.dynamo = memoryDynamo();
  const text = "完整正文😀".repeat(40000) + "END";
  const doc = await db.createDocument({ id: "long", userId: "alice", courseId: "math", title: "Long", text });
  assert.equal(doc.text, text);
  assert.equal((await db.listDocuments("alice", "math"))[0].text, text);
  const originalPdf = { name: "paper.pdf", kind: "pdf", dataUrl: "data:application/pdf;base64," + Buffer.from("%PDF-1.7\n" + "source".repeat(80000)).toString("base64") };
  const attachments = [{ name: "图.png", kind: "image", dataUrl: "data:image/png;base64," + "a".repeat(500000) }, originalPdf, { name: "notes", kind: "text", text }];
  await db.saveChatAttachments("alice", "math", "msg", attachments);
  assert.deepEqual(await db.listChatAttachments("alice", "math"), attachments);
  assert.deepEqual(await db.listChatAttachments("bob", "math"), []);
  assert.deepEqual(await db.listChatAttachments("alice", "other"), []);
  await db.updateDocument("alice", "math", "long", { title: "Renamed" });
  assert.equal((await db.listDocuments("alice", "math"))[0].text, text);
  await db.updateDocument("alice", "math", "long", { text: "replacement" });
  assert.equal((await db.listDocuments("alice", "math"))[0].text, "replacement");
  await db.writeMaterial("alice", "math", "DOCFILE#long#PDF", originalPdf);
  assert.deepEqual(await db.readMaterial("alice", "math", "DOCFILE#long#PDF"), originalPdf);
  await db.deleteDocument("alice", "math", "long");
  await assert.rejects(db.readMaterial("alice", "math", "DOCFILE#long#PDF"));
  assert.deepEqual(await db.listChatAttachments("alice", "math"), attachments, "Deleting a course source must preserve separately uploaded chat files");
  await db.deleteCourse("alice", "math");
  assert.equal(db.dynamo.rows.size, 0);
});

test("DynamoDB query reads every page of a large course", async () => {
  const store = Object.create(DynamoStore.prototype);
  store.table = "test";
  let calls = 0;
  store.call = async (operation, body) => {
    assert.equal(operation, "Query");
    assert.equal(body.ConsistentRead, true);
    calls++;
    if (calls === 1) return { Items: [{ data: { S: '{"id":"first"}' } }], LastEvaluatedKey: { pk: { S: "cursor" } } };
    assert.deepEqual(body.ExclusiveStartKey, { pk: { S: "cursor" } });
    return { Items: [{ data: { S: '{"id":"last"}' } }] };
  };
  assert.deepEqual(await store.query("user", "course"), [{ id: "first" }, { id: "last" }]);
});
