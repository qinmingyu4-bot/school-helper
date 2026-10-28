const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { DynamoStore } = require("../lib/aws-dynamodb");
const { memoryDynamo } = require("./helpers/community-dynamo");

async function localDatabase(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-integrity-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "database.json");
  return db;
}

const user = () => ({ id: "alice", email: "alice@example.test", name: "Alice", passwordHash: "saved-hash",
  profile: { sbId: "Alice", school: "Original school", avatarUrl: "saved-avatar" },
  preferences: { customInstruction: "Original preference" }, legacyField: { keep: true } });

test("local concurrent profile, preferences and account saves retain all changes after restart", async (t) => {
  const db = await localDatabase(t);
  await db.createUser(user());
  await db.setUserAppearance("alice", { theme: "graphite", mode: "dark" });
  await Promise.all([
    db.updateUser("alice", { profile: { ...user().profile, school: "Updated school" } }),
    db.updateUser("alice", { preferences: { customInstruction: "Updated preference" } }),
    db.updateUser("alice", { name: "Updated name" })
  ]);
  db.local.state = null;
  const saved = await db.getUser("alice");
  assert.equal(saved.profile.school, "Updated school");
  assert.equal(saved.preferences.customInstruction, "Updated preference");
  assert.equal(saved.name, "Updated name");
  assert.equal(saved.passwordHash, "saved-hash");
  assert.equal(saved.profile.avatarUrl, "saved-avatar");
  assert.deepEqual(saved.legacyField, { keep: true });
  assert.deepEqual(await db.getUserAppearance("alice"), { theme: "graphite", mode: "dark" });
});

test("failed local creation, nested mutation and deletion never leak into later saves", async (t) => {
  const db = await localDatabase(t);
  await db.createUser(user());
  await db.createCourse({ id: "kept", userId: "alice", name: "Keep this course" });
  const before = await fs.readFile(db.local.file, "utf8");
  const save = db.local.save.bind(db.local);
  db.local.save = async () => { throw new Error("disk full"); };
  await assert.rejects(db.createCourse({ id: "ghost", userId: "alice", name: "Failed course" }), /disk full/);
  await assert.rejects(db.local.write((state) => { state.users.alice.profile.school = "Failed school"; delete state.courses.kept; }), /disk full/);
  assert.equal((await db.getUser("alice")).profile.school, "Original school");
  assert.deepEqual((await db.listCourses("alice")).map((course) => course.id), ["kept"]);
  assert.equal(await fs.readFile(db.local.file, "utf8"), before);
  db.local.save = save;
  await assert.rejects(db.local.write((state) => {
    state.users.alice.legacyField.keep = false;
    throw new Error("mutator rejected");
  }), /mutator rejected/);
  await db.updateUser("alice", { name: "Later successful save" });
  db.local.state = null;
  assert.equal((await db.getUser("alice")).profile.school, "Original school");
  assert.deepEqual((await db.getUser("alice")).legacyField, { keep: true });
  assert.deepEqual((await db.listCourses("alice")).map((course) => course.id), ["kept"]);
});

test("local readers see the last committed data while a save is pending or fails", async (t) => {
  const db = await localDatabase(t);
  await db.createUser(user());
  let started, release;
  const ready = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  db.local.save = async () => { started(); await gate; throw new Error("disk full"); };
  const writing = assert.rejects(db.updateUser("alice", { name: "Uncommitted name" }), /disk full/);
  await ready;
  assert.equal((await db.getUser("alice")).name, "Alice");
  release();
  await writing;
  assert.equal((await db.getUser("alice")).name, "Alice");
});

test("simultaneous first reads and writes share initialization and preserve legacy records", async (t) => {
  const db = await localDatabase(t);
  await fs.writeFile(db.local.file, JSON.stringify({ users: { alice: user() }, emailIndex: { "alice@example.test": "alice" },
    courses: {}, documents: {}, messages: {}, sessions: {}, legacyTable: { unknown: { text: "保留历史数据" } } }));
  let loads = 0;
  const loadFile = db.local.loadFile.bind(db.local);
  db.local.loadFile = async () => { loads++; return loadFile(); };
  await Promise.all([db.getUser("alice"), db.listCourses("alice"), db.updateUser("alice", { name: "Updated name" })]);
  assert.equal(loads, 1);
  assert.equal((await db.getUser("alice")).name, "Updated name");
  const saved = JSON.parse(await fs.readFile(db.local.file, "utf8"));
  assert.deepEqual(saved.legacyTable, { unknown: { text: "保留历史数据" } });
  assert.equal(saved.users.alice.passwordHash, "saved-hash");
});

test("DynamoDB concurrent account saves retry conflicts without losing fields", async () => {
  const db = new StudyBridgeDatabase();
  const { store, rows, calls } = memoryDynamo();
  db.dynamo = store;
  await store.put("USER#alice", "PROFILE", "user", user());
  store.scanType = async () => [...rows.values()].filter((row) => row.type.S === "user").map((row) => JSON.parse(row.data.S));
  await Promise.all([
    db.updateUser("alice", { profile: { ...user().profile, school: "Updated school" } }),
    db.updateUser("alice", { preferences: { customInstruction: "Updated preference" } }),
    db.updateUser("alice", { name: "Updated name" })
  ]);
  const saved = await db.getUser("alice");
  assert.equal(saved.profile.school, "Updated school");
  assert.equal(saved.preferences.customInstruction, "Updated preference");
  assert.equal(saved.name, "Updated name");
  assert.equal(saved.passwordHash, "saved-hash");
  assert.deepEqual(saved.legacyField, { keep: true });
  assert.ok(calls.filter((call) => call.target === "TransactWriteItems").length > 3, "conflicting saves must read fresh data and retry");
});

test("DynamoDB account conflict exhaustion is explicit and unrelated service errors are preserved", async () => {
  const db = new StudyBridgeDatabase();
  let attempts = 0;
  db.dynamo = {
    get: async () => user(), scanType: async () => [user()],
    transactPut: async () => { attempts++; throw Object.assign(new Error("Conflict"), { code: "TransactionCanceledException", cancellationReasons: [{ Code: "ConditionalCheckFailed" }] }); }
  };
  await assert.rejects(db.updateUser("alice", { name: "Changed" }), { statusCode: 409 });
  assert.ok(attempts > 1 && attempts <= 8);
  const outage = Object.assign(new Error("Service unavailable"), { code: "ServiceUnavailable" });
  db.dynamo.transactPut = async () => { throw outage; };
  await assert.rejects(db.updateUser("alice", { name: "Changed" }), (error) => error === outage);
});

test("DynamoDB scans retain later pages even when a filtered page is empty", async () => {
  const store = Object.create(DynamoStore.prototype);
  store.table = "Test";
  const key1 = { pk: { S: "one" }, sk: { S: "META" } }, key2 = { pk: { S: "two" }, sk: { S: "META" } };
  const calls = [];
  store.call = async (target, body) => {
    calls.push(body);
    assert.equal(target, "Scan");
    assert.equal(body.TableName, "Test");
    assert.equal(body.ExpressionAttributeValues[":type"].S, "user");
    if (calls.length === 1) return { Items: [{ data: { S: '{"id":"first"}' } }], LastEvaluatedKey: key1 };
    if (calls.length === 2) { assert.deepEqual(body.ExclusiveStartKey, key1); return { Items: [], LastEvaluatedKey: key2 }; }
    assert.deepEqual(body.ExclusiveStartKey, key2);
    return { Items: [{ data: { S: '{"id":"last"}' } }], LastEvaluatedKey: {} };
  };
  assert.deepEqual(await store.scanType("user"), [{ id: "first" }, { id: "last" }]);
  assert.equal(calls.length, 3);
});

test("a failed later DynamoDB page rejects the scan instead of returning an incomplete directory", async () => {
  const store = Object.create(DynamoStore.prototype);
  store.table = "Test";
  const outage = new Error("Later page unavailable");
  store.call = async (_, body) => {
    if (body.ExclusiveStartKey) throw outage;
    return { Items: [{ data: { S: '{"id":"first"}' } }], LastEvaluatedKey: { pk: { S: "first" }, sk: { S: "PROFILE" } } };
  };
  await assert.rejects(store.scanType("user"), (error) => error === outage);
});
