const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

// Only operational state is exposed: no account data, paths or provider errors.
function workerHealth({ now = Date.now, staleMs = 120000 } = {}) {
  const createdAt = now();
  let lastSuccess = null, lastFailure = null, failed = false;
  return {
    success() { lastSuccess = now(); failed = false; },
    failure() { lastFailure = now(); failed = true; },
    snapshot(enabled) {
      const stale = now() - (lastSuccess ?? createdAt) > staleMs;
      return { enabled, ok: !enabled || (!failed && !stale),
        status: !enabled ? "disabled" : failed ? "failed" : stale ? "stale" : lastSuccess === null ? "starting" : "ok",
        lastSuccess, lastFailure };
    }
  };
}

async function checkDatabase(db) {
  if (db.dynamo) {
    // Uses existing GetItem permission; never creates synthetic application rows.
    await db.dynamo.get("HEALTH", "READINESS", { consistent: true });
    return { ok: true, read: true, write: "not_checked" };
  }
  const state = await db.local.load();
  let handle;
  try {
    handle = await fs.open(db.local.file, "r+");
    if (!(await handle.stat()).size) throw new Error("Empty database");
    await handle.read(Buffer.alloc(1), 0, 1, 0);
  } catch (error) {
    // A fresh installation has no database until its first durable write.
    if (error.code !== "ENOENT" || Object.keys(state.users || {}).length) throw error;
  } finally { await handle?.close(); }
  const directory = path.dirname(db.local.file);
  await fs.mkdir(directory, { recursive: true });
  const probe = path.join(directory, `.health-${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(probe, "ready", { flag: "wx", mode: 0o600 });
    if (await fs.readFile(probe, "utf8") !== "ready") throw new Error("Storage probe mismatch");
  } finally { await fs.unlink(probe).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
  return { ok: true, read: true, write: true };
}

function createServiceHealth({ db, workers = () => ({}), probe = () => checkDatabase(db), now = Date.now, cacheMs = 30000, timeoutMs = 3000 }) {
  let pending, cached, expires = 0;
  async function database() {
    if (cached && now() < expires) return cached;
    if (!pending) {
      pending = Promise.resolve().then(probe).then((value) => value, () => ({ ok: false, status: "unavailable" }))
        .then((value) => { cached = value; expires = now() + cacheMs; return value; })
        .finally(() => { pending = null; });
    }
    // A stuck check stays single-flight; timed-out callers cannot start more probes.
    let timer;
    try {
      return await Promise.race([pending, new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, status: "timeout" }), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  return async () => {
    const storage = await database(), background = workers();
    return { ok: storage.ok && Object.values(background).every((worker) => worker.ok),
      db: db.mode || (db.dynamo ? "dynamodb" : "local"), database: storage, workers: background };
  };
}
module.exports = { workerHealth, checkDatabase, createServiceHealth };
