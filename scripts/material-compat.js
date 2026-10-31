"use strict";
// Before rolling back to a release without private material references, rehydrate
// the CURRENT database. Never replace it with an older database snapshot.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
async function hydrate(databaseFile) {
  const state = JSON.parse(await fs.readFile(databaseFile, "utf8"));
  let changed = false;
  for (const record of Object.values(state.materials || {})) if (record.file) {
    const ref = record.file;
    if (ref.version !== 1 || !/^[a-f0-9]{64}$/.test(ref.digest)) throw new Error("Invalid material reference.");
    const file = path.join(path.dirname(databaseFile), "material-files", hash(JSON.stringify([record.userId, record.courseId])), hash(record.id), `${ref.digest}.json`);
    const bytes = await fs.readFile(file);
    if (bytes.length !== ref.bytes || hash(bytes) !== ref.digest) throw new Error("Material verification failed.");
    record.value = JSON.parse(bytes.toString("utf8")); delete record.file; changed = true;
  }
  if (changed) {
    const temporary = `${databaseFile}.${crypto.randomUUID()}.compat.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" }); await fs.rename(temporary, databaseFile); }
    finally { await fs.unlink(temporary).catch(() => {}); }
  }
}
if (require.main === module) {
  const [root, manifest] = process.argv.slice(2);
  (async () => {
    const saved = JSON.parse(await fs.readFile(manifest, "utf8"));
    if (saved.mode === "local") await hydrate(path.resolve(root, saved.databaseFile));
  })().catch(() => { console.error("Private material compatibility conversion failed; do not start an older application."); process.exitCode = 1; });
}
module.exports = { hydrate };
