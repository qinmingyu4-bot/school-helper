const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");
const { backupRelease, fileEnvironment } = require("../scripts/release-backup");

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-release-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "checkout"), backup = path.join(directory, "backup");
  await fs.mkdir(root);
  return { root, directory: backup, env: {}, previousCommit: "a".repeat(40), targetCommit: "b".repeat(40) };
}

test("release environment parsing retains actual process settings and quoted file values", () => {
  assert.deepEqual(fileEnvironment('# comment\nSTUDYBRIDGE_DB=local\nLOCAL_DB_FILE="private/db.json"\nEMPTY=\n', { STUDYBRIDGE_DB: "dynamodb" }),
    { STUDYBRIDGE_DB: "dynamodb", LOCAL_DB_FILE: "private/db.json", EMPTY: "" });
});

test("local release backup preserves every legacy record, configuration and authored file without changing sources", async (t) => {
  const options = await fixture(t);
  const data = { users: { alice: { profile: { sbId: "Alice" } } }, courses: {}, documents: {}, messages: {},
    materials: { old: { value: "Complete PDF bytes" } }, legacy: { keep: true } };
  const file = path.join(options.root, "custom", "database.json");
  await fs.mkdir(path.join(options.root, "custom", "creative-files", "owner", "job"), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data));
  await fs.writeFile(path.join(options.root, "custom", "creative-files", "owner", "job", "file"), "Existing authored file");
  await fs.writeFile(path.join(options.root, ".env"), "SESSION_SECRET=test-only-private-value\n");
  const original = await fs.readFile(file);
  const result = await backupRelease({ ...options, env: { LOCAL_DB_FILE: "custom/database.json" } });
  assert.equal(result.mode, "local");
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(options.directory, "database.json"), "utf8")), data);
  assert.equal(await fs.readFile(path.join(options.directory, "creative-files", "owner", "job", "file"), "utf8"), "Existing authored file");
  assert.deepEqual(await fs.readFile(file), original);
  assert.equal((await fs.stat(options.directory)).mode & 0o777, 0o700);
  for (const name of ["database.json", "environment.env", "manifest.json"]) assert.equal((await fs.stat(path.join(options.directory, name))).mode & 0o777, 0o600);
});

test("release backups reject unsafe locations and invalid or missing local data", async (t) => {
  const options = await fixture(t);
  await assert.rejects(backupRelease({ ...options, directory: path.join(options.root, "backup") }), /outside/);
  await assert.rejects(backupRelease(options), { code: "ENOENT" });
  await fs.mkdir(path.join(options.root, ".data"));
  await fs.writeFile(path.join(options.root, ".data/studybridge.json"), '{"users":{}}');
  await assert.rejects(backupRelease(options), /not valid/);
  assert.equal(await fs.readFile(path.join(options.root, ".data/studybridge.json"), "utf8"), '{"users":{}}');
});

test("cloud release backup follows all scan pages and retains raw restoreable DynamoDB items", async (t) => {
  const options = await fixture(t), calls = [];
  const item = { pk: { S: "USER#alice" }, sk: { S: "PROFILE" }, data: { S: '{"legacy":true}' } };
  const cursor = { pk: item.pk, sk: item.sk };
  const store = { table: "ExistingTable", call: async (target, body) => {
    calls.push(body); assert.equal(target, "Scan"); assert.equal(body.ConsistentRead, true);
    return calls.length === 1 ? { Items: [item], LastEvaluatedKey: cursor } : { Items: [], LastEvaluatedKey: {} };
  } };
  const result = await backupRelease({ ...options, env: { STUDYBRIDGE_DB: "dynamodb" }, dynamo: store });
  assert.deepEqual(calls[1].ExclusiveStartKey, cursor);
  assert.equal(result.table, "ExistingTable");
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(options.directory, "dynamodb-000001.json"), "utf8")), { table: "ExistingTable", items: [item] });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(options.directory, "dynamodb-000002.json"), "utf8")), { table: "ExistingTable", items: [] });
});

test("partial cloud backup failures cannot publish a success manifest", async (t) => {
  const options = await fixture(t);
  const store = { table: "ExistingTable", call: async (_, body) => {
    if (body.ExclusiveStartKey) throw new Error("Scan unavailable");
    return { Items: [], LastEvaluatedKey: { pk: { S: "next" } } };
  } };
  await assert.rejects(backupRelease({ ...options, env: { STUDYBRIDGE_DB: "dynamodb" }, dynamo: store }), /unavailable/);
  await assert.rejects(fs.stat(path.join(options.directory, "manifest.json")), { code: "ENOENT" });
});
