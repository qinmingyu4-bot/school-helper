"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const root = (databaseFile) => path.join(path.dirname(databaseFile), "material-files");
function directory(databaseFile, userId, courseId, id) {
  return path.join(root(databaseFile), hash(JSON.stringify([userId, courseId])), hash(id));
}
async function write(databaseFile, userId, courseId, id, value) {
  const bytes = Buffer.from(JSON.stringify(value)), digest = hash(bytes);
  const dir = directory(databaseFile, userId, courseId, id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${digest}.json`), temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return { version: 1, digest, bytes: bytes.length };
}
async function read(databaseFile, userId, courseId, id, reference) {
  if (reference?.version !== 1 || !/^[a-f0-9]{64}$/.test(reference.digest)) throw new Error("Invalid private material reference.");
  const bytes = await fs.readFile(path.join(directory(databaseFile, userId, courseId, id), `${reference.digest}.json`));
  if (bytes.length !== reference.bytes || hash(bytes) !== reference.digest) throw new Error("Saved material failed integrity verification.");
  return JSON.parse(bytes.toString("utf8"));
}
async function remove(databaseFile, userId, courseId, id) {
  await fs.rm(directory(databaseFile, userId, courseId, id), { recursive: true, force: true });
}
async function snapshot(databaseFile, state, destination) {
  const entries = [];
  for (const record of Object.values(state.materials || {})) if (record.file) {
    const original = path.join(directory(databaseFile, record.userId, record.courseId, record.id), `${record.file.digest}.json`);
    await read(databaseFile, record.userId, record.courseId, record.id, record.file);
    const relative = path.relative(root(databaseFile), original), target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    try { await fs.link(original, target); }
    catch (error) { if (error.code !== "EEXIST") await fs.copyFile(original, target, require("node:fs").constants.COPYFILE_EXCL); }
    const saved = await fs.readFile(target);
    if (hash(saved) !== record.file.digest) throw new Error("Private file backup verification failed.");
    entries.push({ name: relative, bytes: saved.length, sha256: record.file.digest });
  }
  return entries;
}
module.exports = { write, read, remove, root, hash, snapshot };
