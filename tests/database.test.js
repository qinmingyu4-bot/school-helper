const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { DynamoStore } = require("../lib/aws-dynamodb");

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

test("local writes recover after a duplicate SB ID is rejected", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-db-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  await db.createUser({ id: "alice", email: "alice@example.test", profile: { sbId: "alice" } });
  await assert.rejects(
    db.createUser({ id: "duplicate", email: "duplicate@example.test", profile: { sbId: "ALICE" } }),
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
