const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { StudyBridgeDatabase } = require("../lib/database");
const files = require("../lib/material-files");
const { hydrate } = require("../scripts/material-compat");
const { backupRelease } = require("../scripts/release-backup");
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-materials-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.dynamo = null; db.local.file = path.join(directory, "database.json");
  return { db, directory };
}
test("large originals leave JSON, preserve exact bytes through restart and remain account/course isolated", async (t) => {
  const { db, directory } = await setup(t), value = [{ name: "paper.pdf", dataUrl: "data:application/pdf;base64," + "A".repeat(1000000) }];
  await db.writeMaterial("alice", "math", "DOCFILE#one#PDF", value);
  const json = await fs.readFile(db.local.file, "utf8");
  assert.ok(json.length < 2000); assert.ok(!json.includes(value[0].dataUrl));
  const restarted = new StudyBridgeDatabase(); restarted.local.file = db.local.file; restarted.dynamo = null;
  assert.deepEqual(await restarted.readMaterial("alice", "math", "DOCFILE#one#PDF"), value);
  assert.equal(await restarted.readMaterial("bob", "math", "DOCFILE#one#PDF"), null);
  assert.equal(await restarted.readMaterial("alice", "stats", "DOCFILE#one#PDF"), null);
  const rows = (await db.local.load()).materials, ref = Object.values(rows)[0].file;
  assert.equal(ref.version, 1); assert.ok(await fs.stat(path.join(directory, "material-files")));
});
test("legacy compaction is durable, failed manifest saves retain old values, and compatibility rollback preserves new data", async (t) => {
  const { db } = await setup(t), value = [{ name: "legacy.txt", text: "retained" }];
  await db.local.write((state) => { state.materials = { "alice#math#CHAT#old#msg": { userId: "alice", courseId: "math", id: "CHAT#old#msg", value } }; state.users.alice = { name: "Original account" }; });
  const save = db.local.save.bind(db.local); db.local.save = async () => { throw Error("disk full"); };
  await assert.rejects(db.compactStudyMaterials(), /disk full/);
  assert.deepEqual(await db.readMaterial("alice", "math", "CHAT#old#msg"), value);
  db.local.save = save; await db.compactStudyMaterials();
  await db.local.write((state) => { state.users.alice.name = "New account edit"; });
  assert.ok(Object.values((await db.local.load()).materials)[0].file);
  await hydrate(db.local.file);
  const current = JSON.parse(await fs.readFile(db.local.file, "utf8"));
  assert.deepEqual(Object.values(current.materials)[0].value, value);
  assert.equal(current.users.alice.name, "New account edit");
});
test("backup snapshots retain file bytes even after source deletion and corrupted files fail integrity checks", async (t) => {
  const { db, directory } = await setup(t);
  await db.writeMaterial("alice", "math", "CHAT#date#msg", [{ text: "Private original" }]);
  const state = await db.local.load(), backup = path.join(directory, "snapshot");
  const entries = await files.snapshot(db.local.file, state, backup);
  assert.equal(entries.length, 1);
  await db.deleteMaterials("alice", "math", "CHAT#date#msg#");
  assert.ok((await fs.readFile(path.join(backup, entries[0].name), "utf8")).includes("Private original"));
  const bad = { version: 1, digest: "../bad", bytes: 4 };
  await assert.rejects(files.read(db.local.file, "alice", "math", "id", bad), /Invalid/);
});
test("document deletion checks course ownership", async (t) => {
  const { db } = await setup(t);
  await db.createDocument({ id: "doc", userId: "alice", courseId: "math", text: "Keep" });
  await db.deleteDocument("alice", "stats", "doc");
  assert.equal((await db.listDocuments("alice", "math")).length, 1);
});
test("task retrieval reads saved attachment text without reloading original bytes, and deletion removes its derived source", async (t) => {
  const { db } = await setup(t);
  await db.createCourse({ id: "math", userId: "alice" });
  const attachments = [{ name: "paper.pdf", kind: "pdf", text: "Extracted question", dataUrl: "data:application/pdf;base64," + "A".repeat(1000000) }];
  const ref = await db.saveChatAttachments("alice", "math", "msg", attachments);
  await db.createMessage({ id: "msg", userId: "alice", courseId: "math", role: "user", attachmentRef: ref, attachments: [{ name: "paper.pdf" }] });
  const read = db.readMaterial.bind(db); let originals = 0;
  db.readMaterial = (...args) => { if (args[2].startsWith("CHAT#")) originals++; return read(...args); };
  for (let n = 0; n < 3; n++) {
    const sources = await db.listChatAttachmentSources("alice", "math", "default");
    assert.equal(sources[0].attachments[0].text, "Extracted question"); assert.equal(sources[0].attachments[0].dataUrl, undefined);
  }
  assert.equal(originals, 0);
  assert.deepEqual(await db.listChatAttachmentSources("bob", "math", "default"), []);
  await db.deleteConversation("alice", "math", "default");
  assert.equal(await db.readMaterial("alice", "math", `STUDYSOURCE#${ref}`), null);
});
test("release backup includes immutable private-file snapshots alongside the JSON manifest", async (t) => {
  const { db, directory } = await setup(t), root = path.join(directory, "checkout");
  await fs.mkdir(path.join(root, "lib"), { recursive: true });
  await fs.copyFile(path.join(__dirname, "../lib/material-files.js"), path.join(root, "lib/material-files.js"));
  db.local.file = path.join(root, "database.json");
  await db.writeMaterial("alice", "math", "CHAT#date#msg", [{ text: "Private release backup" }]);
  const backup = path.join(directory, "release");
  const manifest = await backupRelease({ root, directory: backup, env: { LOCAL_DB_FILE: db.local.file }, previousCommit: "a".repeat(40), targetCommit: "b".repeat(40) });
  assert.equal(manifest.materialFiles.length, 1);
  await db.deleteMaterials("alice", "math");
  assert.match(await fs.readFile(path.join(backup, "material-files", manifest.materialFiles[0].name), "utf8"), /Private release backup/);
});
