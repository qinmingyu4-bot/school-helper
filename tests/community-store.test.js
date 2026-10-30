const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");
const all = { type: "all", key: "all", label: "全部社区" };
const major = { type: "major", key: "major:economics", label: "Economics" };
async function database(t, mode) {
  const db = new StudyBridgeDatabase();
  const fake = memoryDynamo();
  db.dynamo = mode === "dynamodb" ? fake.store : null;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "community-v2-"));
  db.local.file = path.join(dir, "db.json");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return { db, ...fake };
}

for (const mode of ["local", "dynamodb"]) {
  test(`${mode}: edits move the same discussion and update search without losing reactions`, async (t) => {
    const { db } = await database(t, mode);
    await db.communityIndexStep();
    const original = await db.createCommunityPost({ id: "edit", userId: "alice", authorName: "Alice", anonymous: true, channels: [all], topic: "Old topic", content: "Old wording" });
    await db.toggleCommunityPostLike("all", "edit", "bob", true);
    await db.createCommunityReply({ id: "reply", postId: "edit", userId: "bob", content: "Original reply" });
    await assert.rejects(db.editCommunityPost("edit", "bob", { content: "Hijack" }, 0), { statusCode: 403 });
    const updated = await db.editCommunityPost("edit", "alice", { topic: "New topic", content: "New wording", channels: [all, major] }, 0);
    assert.equal(updated.id, original.id); assert.equal(updated.createdAt, original.createdAt);
    assert.equal(updated.editRevision, 1); assert.ok(updated.editedAt); assert.equal(updated.anonymous, true);
    assert.equal(updated.likeCount, 1); assert.equal((await db.listCommunityReplies("edit")).replies[0].content, "Original reply");
    assert.equal((await db.listCommunityPage("all", { search: "Old wording" })).posts.length, 0);
    assert.equal((await db.listCommunityPage(major.key, { search: "New wording" })).posts[0].id, "edit");
    const school = { type: "school", key: "school:new-school", label: "New school" };
    await db.editCommunityPost("edit", "alice", { channels: [school] }, 1);
    assert.equal((await db.listCommunityPage("all")).posts.length, 0);
    assert.equal((await db.listCommunityPage(major.key)).posts.length, 0);
    assert.equal((await db.listCommunityPage(school.key)).posts[0].likeCount, 1);
    await assert.rejects(db.editCommunityPost("edit", "alice", { content: "Stale content" }, 1), { statusCode: 409 });
    if (mode === "local") db.local.state = null;
    assert.equal((await db.getCommunityPost("edit")).content, "New wording");
    await db.deleteCommunityPost("edit", "alice");
    assert.equal(await db.editCommunityPost("edit", "alice", { content: "Restore" }, 2), null);
  });
  test(`${mode}: multi-channel posts share likes/replies and support more than 80 posts`, async (t) => {
    const { db, calls } = await database(t, mode);
    await db.communityIndexStep();
    for (let index = 0; index < 145; index++) await db.createCommunityPost({ id: `post-${String(index).padStart(3, "0")}`, userId: "alice", channels: [all, major], topic: "复习", content: index < 5 ? "ECO101 考试重点" : "Regular discussion" });
    await db.createCommunityPost({ id: "all-only", userId: "alice", channels: [all], content: "匿名" });
    let before = "", seen = [];
    do {
      const page = await db.listCommunityPage("major:economics", { before });
      assert.ok(page.posts.length <= 40);
      seen.push(...page.posts.map((post) => post.id));
      before = page.nextBefore;
    } while (before);
    assert.equal(seen.length, 145);
    assert.equal(new Set(seen).size, 145);
    let found = [], searchBefore = "";
    do {
      const page = await db.listCommunityPage("all", { search: "eco101", before: searchBefore });
      found.push(...page.posts); searchBefore = page.nextBefore;
    } while (searchBefore);
    assert.equal(found.length, 5);
    await db.toggleCommunityPostLike("all", "post-144", "bob", true);
    assert.equal((await db.listCommunityPage("major:economics")).posts.find((post) => post.id === "post-144").likeCount, 1);
    const reply = await db.createCommunityReply({ id: "reply", postId: "post-000", userId: "bob", authorName: "Bob", content: "One shared reply" });
    assert.equal((await db.listCommunityReplies("post-000")).replies[0].id, reply.id);
    await assert.rejects(db.deleteCommunityPost("post-000", "bob"), { statusCode: 403 });
    await db.deleteCommunityPost("post-000", "alice");
    assert.equal(await db.getCommunityPost("post-000"), null);
    assert.equal(await db.toggleCommunityPostLike("all", "post-000", "bob", false), null);
    await assert.rejects(db.createCommunityReply({ postId: "post-000", id: "orphan", userId: "bob" }), { statusCode: 404 });
    assert.equal((await db.listCommunityNotifications("alice")).notifications.length, 0);
    if (mode === "dynamodb") assert.ok(calls.filter((call) => call.target === "Scan").length <= 1, "only the one-time upgrade scans the table");
  });

  test(`${mode}: private persistent notices respect anonymous replies, ownership and deletion`, async (t) => {
    const { db } = await database(t, mode);
    await db.createCommunityPost({ id: "post", userId: "alice", channels: [all], topic: "My question", content: "Question" });
    const date = "2026-10-28T12:00:00.000Z";
    const id = `${date}~reply`;
    await db.createCommunityReply({ id, createdAt: date, postId: "post", userId: "bob", authorName: "Bob", anonymous: true, content: "Secret name" });
    await db.createCommunityReply({ id: "self", postId: "post", userId: "alice", content: "Self reply" });
    if (mode === "local") db.local.state = null;
    const notice = (await db.listCommunityNotifications("alice")).notifications[0];
    assert.equal(notice.authorName, "匿名同学");
    assert.equal(notice.userId, undefined);
    assert.equal(notice.read, false);
    assert.equal((await db.listCommunityNotifications("alice")).notifications.length, 1);
    assert.deepEqual((await db.listCommunityNotifications("bob")).notifications, []);
    await assert.rejects(db.readCommunityNotification("bob", id), { statusCode: 404 });
    await db.readCommunityNotification("alice", id);
    assert.equal((await db.listCommunityNotifications("alice")).notifications[0].read, true);
    await assert.rejects(db.deleteCommunityReply("post", id, "alice", false, date), { statusCode: 403 });
    await db.deleteCommunityReply("post", id, "bob", false, date);
    assert.equal((await db.listCommunityReplies("post")).replies.length, 1);
    assert.equal((await db.listCommunityNotifications("alice")).notifications.length, 0);
  });
}

test("DynamoDB concurrent likes are lossless, idempotent, and cannot restore a deleted post", async (t) => {
  const { db, store } = await database(t, "dynamodb");
  await db.createCommunityPost({ id: "post", userId: "alice", channels: [all, major], content: "Concurrency" });
  const users = Array.from({ length: 32 }, (_, index) => `user-${index}`);
  await Promise.all(users.map((user) => db.toggleCommunityPostLike("all", "post", user, true)));
  assert.equal((await db.getCommunityPost("post")).likeCount, 32);
  await Promise.all(users.map((user) => db.toggleCommunityPostLike("major:economics", "post", user, true)));
  assert.equal((await db.getCommunityPost("post")).likeCount, 32);
  await Promise.all(users.slice(0, 16).map((user) => db.toggleCommunityPostLike("all", "post", user, false)));
  assert.equal((await db.getCommunityPost("post")).likeCount, 16);
  const original = store.transactPut.bind(store);
  let release, entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  store.transactPut = async (records) => {
    if (records[0].data.likes?.includes("late")) { entered(); await gate; }
    return original(records);
  };
  const pending = db.toggleCommunityPostLike("all", "post", "late", true);
  await ready;
  await db.deleteCommunityPost("post", "alice"); release();
  assert.equal(await pending, null);
  assert.equal(await db.getCommunityPost("post"), null);
});

test("DynamoDB edits preserve concurrent likes, reject stale editors and atomically update indexes", async (t) => {
  const { db, store } = await database(t, "dynamodb");
  await db.communityIndexStep();
  await db.createCommunityPost({ id: "post", userId: "alice", channels: [all], content: "Original" });
  await Promise.all([db.editCommunityPost("post", "alice", { content: "New content", channels: [all, major] }, 0),
    ...Array.from({ length: 16 }, (_, index) => db.toggleCommunityPostLike("all", "post", `user-${index}`, true))]);
  assert.equal((await db.getCommunityPost("post")).likeCount, 16);
  const attempts = await Promise.allSettled(["First", "Second"].map((content) => db.editCommunityPost("post", "alice", { content }, 1)));
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.find((attempt) => attempt.status === "rejected").reason.statusCode, 409);
  const before = await db.getCommunityPost("post"), transact = store.transactPut.bind(store);
  store.transactPut = async () => { throw new Error("Save unavailable"); };
  await assert.rejects(db.editCommunityPost("post", "alice", { channels: [major], content: "Must not persist" }, 2), /Save unavailable/);
  assert.deepEqual(await db.getCommunityPost("post"), before);
  store.transactPut = transact;
  assert.equal((await db.listCommunityPage("all")).posts[0].content, before.content);
  assert.equal((await db.listCommunityPage(major.key)).posts[0].content, before.content);
});

test("local edit save failures restore the prior revision and allow a safe retry", async (t) => {
  const { db } = await database(t, "local");
  await db.createCommunityPost({ id: "post", userId: "alice", channels: [all], content: "Original content" });
  const save = db.local.save.bind(db.local);
  db.local.save = async () => { throw new Error("Disk unavailable"); };
  await assert.rejects(db.editCommunityPost("post", "alice", { content: "Updated content", channels: [major] }, 0), /Disk unavailable/);
  assert.equal((await db.getCommunityPost("post")).content, "Original content");
  assert.equal((await db.listCommunityPage("all")).posts.length, 1);
  db.local.save = save;
  await db.editCommunityPost("post", "alice", { content: "Updated content", channels: [major] }, 0);
  db.local.state = null;
  assert.equal((await db.getCommunityPost("post")).editRevision, 1);
  assert.equal((await db.listCommunityPage(major.key)).posts[0].content, "Updated content");
});

test("legacy upgrade is bounded, resumable, preserves data and cannot resurrect tombstones", async (t) => {
  const { db, store, calls } = await database(t, "dynamodb");
  for (let index = 0; index < 105; index++) {
    const post = { id: `legacy-${index}`, schoolKey: "old-school", school: "Old school", userId: "alice", likes: ["bob"], content: "Original", createdAt: `2026-10-01T12:00:${String(index % 60).padStart(2, "0")}.000Z` };
    await store.put("COMMUNITY#old-school", `POST#${post.createdAt}#${post.id}`, "communityPost", post);
  }
  assert.equal(await db.communityIndexStep(), true);
  const migrated = (await db.listCommunityPage("school:old-school")).posts[0];
  assert.equal(migrated.content, "Original");
  assert.equal(migrated.likes.length, 1);
  await db.deleteCommunityPost(migrated.id, "alice");
  db.communityIndexDone = false;
  while (await db.communityIndexStep()) { /* one bounded page at a time */ }
  const scans = calls.filter((call) => call.target === "Scan").length;
  const restarted = new StudyBridgeDatabase(); restarted.dynamo = store;
  await restarted.listCommunityPage("all");
  assert.equal(calls.filter((call) => call.target === "Scan").length, scans);
  assert.equal(await restarted.getCommunityPost(migrated.id), null);
});
