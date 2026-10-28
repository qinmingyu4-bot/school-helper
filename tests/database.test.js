const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { DynamoStore } = require("../lib/aws-dynamodb");
const { memoryDynamo } = require("./helpers/community-dynamo");

test("DynamoDB community likes stay in the selected channel and directory uses published labels", async () => {
  const db = new StudyBridgeDatabase();
  const { store, calls } = memoryDynamo();
  db.dynamo = store;
  await db.createCommunityPost({ id: "post", channels: [{ type: "all", key: "all", label: "全部社区" }, { type: "major", key: "major:psychology", label: "Psychology" }], content: "hello", userId: "alice" });
  assert.equal((await db.toggleCommunityPostLike("major:psychology", "post", "bob")).likeCount, 1);
  assert.equal((await db.toggleCommunityPostLike("all", "post", "bob")).likeCount, 0);
  await assert.rejects(db.toggleCommunityPostLike("school:other", "post", "bob"), { statusCode: 404 });
  assert.ok(calls.filter((call) => call.target === "TransactWriteItems").at(-1).body.TransactItems[0].Put.ExpressionAttributeValues[":expected"]);
  assert.deepEqual(await db.listCommunityChannels(), { schools: [], majors: ["Psychology"] });
});

test("community replies use independent local and DynamoDB records with stable paginated ordering", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-community-replies-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const mode of ["local", "dynamodb"]) {
    const db = new StudyBridgeDatabase();
    db.local.file = path.join(directory, `${mode}.json`);
    db.dynamo = mode === "local" ? null : memoryDynamo().store;
    for (const id of ["post", "other-post"]) await db.createCommunityPost({ id, userId: "alice", content: id });
    const records = await Promise.all(Array.from({ length: 55 }, (_, index) => db.createCommunityReply({ id: `reply-${String(index).padStart(3, "0")}`, postId: "post", userId: "alice", content: `Reply ${index}` })));
    await db.createCommunityReply({ id: "other", postId: "other-post", userId: "bob", content: "Other post" });
    const newest = await db.listCommunityReplies("post");
    assert.equal(newest.replies.length, 50);
    assert.ok(newest.nextBefore);
    const earlier = await db.listCommunityReplies("post", newest.nextBefore);
    assert.equal(earlier.replies.length, 5);
    assert.equal(earlier.nextBefore, null);
    assert.equal(new Set([...earlier.replies, ...newest.replies].map((reply) => reply.id)).size, records.length);
    if (mode === "local") db.local.state = null;
    assert.equal((await db.listCommunityReplies("other-post")).replies[0].id, "other");
    assert.equal((await db.listCommunityReplies("missing")).replies.length, 0);
  }
});

test("local activity is throttled, persistent and isolated from concurrent profile changes", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-activity-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  await db.createUser({ id: "alice", email: "alice@example.test", name: "Alice" });
  const time = Date.parse("2026-10-12T12:00:00Z");
  const first = await db.recordUserActivity("alice", time);
  const saved = await fs.readFile(db.local.file, "utf8");
  assert.deepEqual(await db.recordUserActivity("alice", time + 59999), first);
  assert.equal(await fs.readFile(db.local.file, "utf8"), saved);
  await Promise.all([db.recordUserActivity("alice", time + 60000), db.updateUser("alice", { name: "New name" })]);
  assert.equal((await db.getUser("alice")).name, "New name");
  await db.recordUserActivity("alice", time);
  db.local.state = null;
  assert.equal((await db.listUserActivity())[0].lastSeenAt, new Date(time + 60000).toISOString());
});

test("DynamoDB activity uses a separate conditional record and preserves a newer heartbeat", async () => {
  const db = new StudyBridgeDatabase();
  const time = Date.parse("2026-10-12T12:00:00Z");
  let stored = null;
  let writes = 0;
  db.dynamo = {
    get: async (pk, sk) => { assert.equal(pk, "USER#alice"); assert.equal(sk, "ACTIVITY"); return stored; },
    transactPut: async ([record]) => {
      assert.equal(record.type, "userActivity");
      assert.equal(record.sk, "ACTIVITY");
      writes++;
      if (record.expectedData) {
        stored = { userId: "alice", lastSeenAt: new Date(time + 120000).toISOString() };
        throw Object.assign(new Error("Stale write"), { code: "TransactionCanceledException", cancellationReasons: [{ Code: "ConditionalCheckFailed" }] });
      }
      assert.equal(record.createOnly, true);
      stored = record.data;
    },
    scanType: async (type) => { assert.equal(type, "userActivity"); return [stored]; }
  };
  await db.recordUserActivity("alice", time);
  await db.recordUserActivity("alice", time + 59999);
  assert.equal(writes, 1);
  assert.equal((await db.recordUserActivity("alice", time + 60000)).lastSeenAt, new Date(time + 120000).toISOString());
  assert.deepEqual(await db.listUserActivity(), [stored]);
});

test("legacy local invitations are claimed once without creating rejected accounts", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-invite-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  const invite = await db.createInvite({ id: "legacy", code: "LEGACY", maxUses: 99 });
  assert.equal(invite.maxUses, 1);
  await db.local.write((state) => { state.invites.legacy.maxUses = 99; });
  const attempts = await Promise.allSettled(["one", "two"].map((id) => db.createUser({ id, email: `${id}@example.test`, inviteId: invite.id, inviteCode: invite.code }, invite)));
  assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(attempts.find((item) => item.status === "rejected").reason.statusCode, 403);
  assert.equal((await db.listUsers()).length, 1);
  const used = await db.findInviteByCode("LEGACY");
  assert.equal(used.uses, 1);
  assert.equal(used.usedBy.length, 1);
  assert.equal(used.maxUses, 1);
  await assert.rejects(db.createUser({ id: "three", email: "three@example.test" }, invite), { statusCode: 403 });
  const saved = JSON.parse(await fs.readFile(db.local.file, "utf8"));
  assert.equal(Object.keys(saved.users).length, 1);
});

test("DynamoDB registrations atomically claim invitations and preserve account uniqueness", async () => {
  const db = new StudyBridgeDatabase();
  const store = Object.create(DynamoStore.prototype);
  store.table = "StudyBridge";
  const invite = { id: "invite", code: "SINGLE", active: true, uses: 0, maxUses: 99 };
  let current = { ...invite };
  const writes = [];
  store.scanType = async () => [];
  store.get = async () => ({ ...current });
  store.call = async (target, body) => {
    assert.equal(target, "TransactWriteItems");
    const puts = body.TransactItems.map((item) => item.Put);
    const expected = JSON.parse(puts[0].ExpressionAttributeValues[":expected"].S);
    if (expected.uses !== current.uses) throw Object.assign(new Error("Conflict"), { code: "TransactionCanceledException", cancellationReasons: [{ Code: "ConditionalCheckFailed" }] });
    assert.equal(puts[0].ConditionExpression, "#data = :expected");
    assert.equal(puts[0].Item.pk.S, "INVITE#SINGLE");
    assert.ok(puts.slice(1).every((put) => put.ConditionExpression === "attribute_not_exists(pk)"));
    current = JSON.parse(puts[0].Item.data.S);
    writes.push(puts);
  };
  db.dynamo = store;
  const attempts = await Promise.allSettled(["one", "two"].map((id) => db.createUser({ id, email: `${id}@example.test` }, invite)));
  assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(attempts.find((item) => item.status === "rejected").reason.statusCode, 403);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].length, 3);
  assert.equal(current.uses, 1);
});

test("SB IDs are assigned before persistence and lookup is case-sensitive in both stores", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-sbid-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  const generated = await Promise.all(["email", "google"].map((id) => db.createUser({ id, email: `${id}@example.test`, authProvider: id, profile: { school: "Test school", sbId: "" } })));
  for (const user of generated) {
    assert.match(user.profile.sbId, /^[A-Za-z0-9]{8}$/);
    assert.equal(user.profile.school, "Test school");
    assert.equal((await db.findUserBySbId(user.profile.sbId)).id, user.id);
  }
  assert.notEqual(generated[0].profile.sbId, generated[1].profile.sbId);
  for (const sbId of ["1", "Alpha", "alpha"]) {
    await db.createUser({ id: sbId, email: `${sbId}@example.test`, profile: { sbId } });
  }
  const reloaded = new StudyBridgeDatabase();
  reloaded.dynamo = null;
  reloaded.local.file = db.local.file;
  const records = await reloaded.listUsers();
  // Exercise the DynamoDB lookup and creation paths with the same persisted records.
  const dynamo = new StudyBridgeDatabase();
  dynamo.dynamo = {
    scanType: async () => records,
    transactPut: async (items) => { for (const item of items) if (item.type === "user") records.push(item.data); }
  };
  for (const store of [reloaded, dynamo]) {
    for (const sbId of ["1", "Alpha", "alpha"]) assert.equal((await store.findUserBySbId(sbId)).id, sbId);
    assert.equal(await store.findUserBySbId("ALPHA"), null);
  }
  const user = await dynamo.createUser({ id: "new-google", email: "new@example.test", authProvider: "google" });
  assert.match(user.profile.sbId, /^[A-Za-z0-9]{8}$/);
  assert.equal((await dynamo.findUserBySbId(user.profile.sbId)).id, user.id);
});

test("local writes recover after a duplicate SB ID is rejected", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-db-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  await db.createUser({ id: "alice", email: "alice@example.test", profile: { sbId: "alice" } });
  await assert.rejects(
    db.createUser({ id: "duplicate", email: "duplicate@example.test", profile: { sbId: "alice" } }),
    /already taken/
  );
  await db.createCourse({ id: "course", userId: "alice", name: "Calculus" });
  assert.equal((await db.listCourses("alice")).length, 1);
  const saved = JSON.parse(await fs.readFile(db.local.file, "utf8"));
  assert.equal(saved.users.duplicate, undefined);
  assert.equal(saved.courses.course.name, "Calculus");
  assert.deepEqual(await fs.readdir(directory), ["database.json"]);
});

test("a stale DynamoDB invitation toggle cannot overwrite a successful redemption", async () => {
  const db = new StudyBridgeDatabase();
  const store = Object.create(DynamoStore.prototype);
  store.table = "StudyBridge";
  let current = { id: "invite", code: "SINGLE", active: true, uses: 0 };
  let releaseToggle;
  let toggleStarted;
  const toggleReady = new Promise((resolve) => { toggleStarted = resolve; });
  const toggleGate = new Promise((resolve) => { releaseToggle = resolve; });
  store.scanType = async (type) => type === "invite" ? [{ ...current }] : [];
  store.get = async () => ({ ...current });
  store.call = async (_, body) => {
    const puts = body.TransactItems.map((item) => item.Put);
    if (puts.length === 1) { toggleStarted(); await toggleGate; }
    const expected = JSON.parse(puts[0].ExpressionAttributeValues[":expected"].S);
    if (expected.uses !== current.uses) throw Object.assign(new Error("Conflict"), { code: "TransactionCanceledException", cancellationReasons: [{ Code: "ConditionalCheckFailed" }] });
    current = JSON.parse(puts[0].Item.data.S);
  };
  db.dynamo = store;
  const toggle = db.updateInvite("invite", { active: true });
  const rejectedToggle = assert.rejects(toggle, { statusCode: 409 });
  await toggleReady;
  await db.createUser({ id: "user", email: "user@example.test" }, current);
  releaseToggle();
  await rejectedToggle;
  assert.equal(current.uses, 1);
  await assert.rejects(db.createUser({ id: "second", email: "second@example.test" }, current), { statusCode: 403 });
});

test("DynamoDB invitation deletion preserves password reset requests and unrelated records", async () => {
  const db = new StudyBridgeDatabase();
  const invite = { id: "invite", code: "SB-DELETE" };
  const reset = { id: "reset", code: "RESET-CODE", kind: "passwordReset" };
  const records = [invite, reset];
  const deletions = [];
  db.dynamo = {
    scanType: async () => records,
    delete: async (pk, sk) => { deletions.push([pk, sk]); records.splice(records.indexOf(invite), 1); }
  };
  assert.equal(await db.deleteInvite("missing"), null);
  assert.equal(await db.deleteInvite("reset"), null);
  assert.deepEqual(deletions, []);
  assert.deepEqual(await db.deleteInvite("invite"), invite);
  assert.deepEqual(deletions, [["INVITE#SB-DELETE", "META"]]);
  assert.deepEqual(records, [reset]);
});

test("corrupted local data is reported without replacing the file", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-corrupt-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  const original = '{"users":';
  await fs.writeFile(db.local.file, original);
  await assert.rejects(db.createCourse({ id: "course", userId: "alice", name: "Calculus" }), SyntaxError);
  assert.equal(await fs.readFile(db.local.file, "utf8"), original);
});

test("read acknowledgements preserve newer messages and isolate each private chat", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-read-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  for (const message of [
    { id: "seen", chatId: "chat", senderId: "bob" },
    { id: "new", chatId: "chat", senderId: "bob" },
    { id: "mine", chatId: "chat", senderId: "alice" },
    { id: "other", chatId: "other-chat", senderId: "bob" }
  ]) await db.createDirectMessage({ ...message, content: message.id });
  await db.local.write((state) => {
    for (const message of Object.values(state.directMessages)) message.createdAt = "2026-10-10T12:00:00.000Z";
  });
  assert.equal(await db.markDirectMessagesRead("chat", "alice", ["seen", "mine", "other", "missing"]), 1);
  assert.equal(await db.markDirectMessagesRead("chat", "alice", ["seen"]), 0);
  const reopened = new StudyBridgeDatabase();
  reopened.dynamo = null;
  reopened.local.file = db.local.file;
  const rows = await reopened.listDirectMessages("chat", Infinity);
  assert.ok(rows.find((message) => message.id === "seen").readAt);
  assert.equal(rows.find((message) => message.id === "new").readAt, undefined);
  assert.equal(rows.find((message) => message.id === "mine").readAt, undefined);
  assert.equal((await reopened.listDirectMessages("other-chat"))[0].readAt, undefined);
});

test("DynamoDB read acknowledgements update only the recipient's displayed messages", async () => {
  const db = new StudyBridgeDatabase();
  const rows = [
    { id: "seen", chatId: "chat", senderId: "bob", createdAt: "2026-10-10T12:00:00.000Z" },
    { id: "new", chatId: "chat", senderId: "bob", createdAt: "2026-10-10T12:00:00.000Z" },
    { id: "mine", chatId: "chat", senderId: "alice", createdAt: "2026-10-10T12:00:00.000Z" }
  ];
  db.dynamo = {
    query: async (pk, prefix) => {
      assert.equal(pk, "DM#chat");
      assert.equal(prefix, "MSG#");
      return rows;
    },
    put: async (pk, sk, type, record) => {
      assert.equal(pk, "DM#chat");
      assert.equal(sk, `MSG#${rows[0].createdAt}#seen`);
      assert.equal(type, "directMessage");
      rows[0] = record;
    }
  };
  assert.equal(await db.markDirectMessagesRead("chat", "alice", ["seen", "mine"]), 1);
  assert.equal(await db.markDirectMessagesRead("chat", "alice", ["seen"]), 0);
  assert.ok(rows[0].readAt);
  assert.equal(rows[1].readAt, undefined);
  assert.equal(rows[2].readAt, undefined);
});
