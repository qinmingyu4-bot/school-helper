"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { StudyBridgeDatabase } = require("../lib/database");
const { createStorageQuota, capacities, bytes } = require("../lib/storage-quota");

const alice = { id: "alice", name: "Alice" };
const bob = { id: "bob", name: "Bob" };

async function fixture(t, limits = { standard: 100, plus: 200 }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-quota-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(dir, "database.json");
  await db.local.write(state => Object.assign(state.users, { alice, bob }));
  const paid = new Map();
  const clock = { time: Date.parse("2026-11-22T00:00:00Z") };
  const quota = createStorageQuota({ db, limits, now: () => clock.time, entitlement: id => paid.get(id) });
  return { db, quota, paid, clock };
}

test("storage counts retained uploads once, including legacy data, and releases deleted materials", async t => {
  const { db, quota } = await fixture(t, capacities);
  const pdf = { filename: "paper.pdf", dataUrl: "data:application/pdf;base64,YQ==" };
  const attachment = [{ name: "legacy.txt", text: "旧资料" }];
  const ref = await db.saveChatAttachments("alice", "course", "message", attachment);
  await db.createMessage({ id: "message", userId: "alice", courseId: "course", role: "user", attachmentRef: ref });
  await db.createDocument({ id: "pdf", userId: "alice", courseId: "course", type: "PDF", text: "Extracted duplicate", hasSourcePdf: true });
  await db.writeMaterial("alice", "course", "DOCFILE#pdf#PDF", pdf);
  await db.createDocument({ id: "ppt", userId: "alice", courseId: "course", type: "PPT", text: "资料" });
  await db.createDocument({ id: "blank", userId: "alice", courseId: "course", type: "PDF", text: "Blank note", blankNote: true });
  await db.local.write(state => {
    state.materials["alice#general#CHAT#legacy#msg"] = {
      userId: "alice", courseId: "general", id: "CHAT#legacy#msg", value: attachment
    };
  });
  await db.createDocument({ id: "other", userId: "bob", courseId: "course", type: "Word", text: "Other account" });
  assert.equal((await quota.current(alice)).quota.usedBytes, bytes(pdf) + 2 * bytes(attachment) + 6);
  await db.deleteDocument("alice", "course", "pdf");
  await db.deleteConversation("alice", "course", "default");
  assert.equal((await quota.current(alice)).quota.usedBytes, bytes(attachment) + 6);
  assert.equal((await quota.current(bob)).quota.usedBytes, 13);
});

test("parallel accepts cannot overshoot a quota and the creator can see warning, blocked and full accounts", async t => {
  const { db, quota, clock } = await fixture(t);
  const upload = (id, amount) => quota.withUpload(alice, amount, () => db.createDocument({
    id, userId: "alice", courseId: "course", type: "Text", text: "a".repeat(amount)
  }));
  const results = await Promise.allSettled([upload("first", 80), upload("second", 80)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const error = results.find(result => result.status === "rejected").reason;
  assert.equal(error.code, "UPLOAD_STORAGE_LIMIT");
  assert.equal(error.storage.remainingBytes, 20);
  assert.equal(error.storage.status, "warning");
  const warning = await quota.overview();
  assert.equal(warning.warning, 1);
  assert.equal(warning.blocked, 1);
  assert.equal(warning.accounts[0].userId, "alice");
  await upload("exact-fit", 20);
  const full = await quota.overview();
  assert.equal(full.full, 1);
  assert.equal(full.totalBytes, 100);
  await assert.rejects(upload("overflow", 1), { code: "UPLOAD_STORAGE_LIMIT" });
  clock.time += 7 * 86400000;
  assert.equal((await quota.overview()).blocked, 0);
});

test("active Plus and creator grants expand quota, and extra storage requests cannot be double granted", async t => {
  const { quota, paid, clock } = await fixture(t);
  const expires = new Date(clock.time + 60000).toISOString();
  paid.set("alice", expires);
  const upgraded = { ...alice, paidMembershipExpiresAt: expires };
  assert.equal((await quota.current(upgraded)).quota.limitBytes, 200);
  const start = await quota.requestExtra(upgraded);
  const again = await quota.requestExtra(upgraded);
  assert.equal(start.requestId, again.requestId);
  assert.equal((await quota.overview()).requests, 1);
  await assert.rejects(quota.grantExtra(alice, "wrong"), { statusCode: 409 });
  const grants = await Promise.allSettled([quota.grantExtra(alice, start.requestId), quota.grantExtra(alice, start.requestId)]);
  assert.equal(grants.filter(result => result.status === "fulfilled").length, 1);
  clock.time += 60001;
  const expired = (await quota.current(upgraded)).quota;
  assert.equal(expired.tier, "standard");
  assert.equal(expired.limitBytes, 100 + 1024 ** 3);
  assert.equal(expired.requestId, null);
  assert.equal((await quota.current(bob)).quota.limitBytes, 100);
});
