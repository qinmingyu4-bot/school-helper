const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalStore } = require('../lib/local-store');
const { workerHealth, checkDatabase, createServiceHealth } = require('../lib/service-health');

test('storage probe verifies local IO without modifying account data or leaving artifacts', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-health-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const db = { mode: 'local', local: new LocalStore(path.join(dir, 'db.json')) };
  await db.local.write(s => { s.users.alice = { private: 'must remain unchanged' }; });
  const before = await fs.readFile(db.local.file);
  assert.deepEqual(await checkDatabase(db), { ok: true, read: true, write: true });
  assert.deepEqual(await fs.readFile(db.local.file), before);
  assert.deepEqual(await fs.readdir(dir), ['db.json']);
  await fs.unlink(db.local.file);
  await assert.rejects(checkDatabase(db)); // Loaded memory cannot hide missing persisted data.
});
test('corrupt persisted storage fails closed and public health redacts internal errors', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-health-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const db = { mode: 'local', local: new LocalStore(path.join(dir, 'db.json')) };
  await fs.writeFile(db.local.file, 'private invalid JSON');
  const result = await createServiceHealth({ db })();
  assert.equal(result.ok, false); assert.doesNotMatch(JSON.stringify(result), /private|sb-health/);
});
test('fresh storage is ready without manufacturing account records', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-health-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const db = { local: new LocalStore(path.join(dir, 'db.json')) };
  assert.equal((await checkDatabase(db)).ok, true); assert.deepEqual(await fs.readdir(dir), []);
});
test('Dynamo probe uses a consistent read and explicitly does not claim tested writes', async () => {
  let calls = 0;
  const db = { dynamo: { get: async (pk, sk, options) => { calls++; assert.equal(pk, 'HEALTH'); assert.equal(sk, 'READINESS'); assert.equal(options.consistent, true); } } };
  assert.deepEqual(await checkDatabase(db), { ok: true, read: true, write: 'not_checked' }); assert.equal(calls, 1);
});
test('concurrent and timed-out health reads remain bounded and recover after completion', async () => {
  let calls = 0, release, clock = 0;
  const health = createServiceHealth({ db: { mode: 'local' }, now: () => clock, timeoutMs: 5, cacheMs: 10,
    probe: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const results = await Promise.all([health(), health(), health()]);
  assert.equal(calls, 1); assert.ok(results.every(r => !r.ok && r.database.status === 'timeout'));
  assert.equal((await health()).ok, false); assert.equal(calls, 1);
  release({ ok: true }); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await health()).ok, true); assert.equal(calls, 1);
  clock = 11; const next = health(); await new Promise(resolve => setImmediate(resolve)); release({ ok: true });
  assert.equal((await next).ok, true); assert.equal(calls, 2);
});
test('worker failure, stalled loops, recovery and disabled services are distinguished', async () => {
  let clock = 0; const worker = workerHealth({ now: () => clock, staleMs: 100 });
  const health = createServiceHealth({ db: {}, probe: async () => ({ ok: true }), workers: () => ({ queue: worker.snapshot(true) }) });
  assert.equal(worker.snapshot(true).status, 'starting');
  worker.failure(); assert.equal((await health()).ok, false);
  clock = 1; worker.success(); assert.equal((await health()).ok, true);
  clock = 102; assert.equal(worker.snapshot(true).status, 'stale'); assert.equal((await health()).ok, false);
  assert.equal(worker.snapshot(false).status, 'disabled'); assert.equal(worker.snapshot(false).ok, true);
});
