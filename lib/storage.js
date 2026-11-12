"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const GiB = 1024 ** 3;
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
const quota = () => positive(process.env.STORAGE_USER_LIMIT_BYTES, GiB);
const reserve = () => positive(process.env.STORAGE_RESERVE_BYTES, 2 * GiB);
async function disk(directory) {
  const s = await fs.statfs(directory);
  return { totalBytes: s.blocks * s.bsize, availableBytes: s.bavail * s.bsize, reserveBytes: reserve() };
}
async function assertSpace(directory, bytes, minimum = reserve()) {
  const s = await disk(directory);
  if (s.availableBytes - bytes < minimum) throw Object.assign(new Error("服务器存储空间不足，请稍后重试或联系管理员。 Server storage is low."), { statusCode: 507 });
}
async function tree(directory, seen = new Set()) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return 0; throw error; }
  let bytes = 0;
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += await tree(file, seen);
    else if (entry.isFile()) { const s = await fs.stat(file), key = `${s.dev}:${s.ino}`;
      if (!seen.has(key)) { seen.add(key); bytes += s.blocks * 512; }
    }
  }
  return bytes;
}
function recordUsage(state) {
  const users = {};
  const unmetered = new Set(["sessions", "authCodes", "users", "emailIndex", "userActivity", "aiUsage", "creativeQuota", "pushDevices", "mailboxes"]);
  for (const [collection, rows] of Object.entries(state)) for (const [key, row] of Object.entries(unmetered.has(collection) ? {} : rows || {})) {
    const owner = row?.userId || (collection === "users" ? key : null);
    if (!owner) continue;
    users[owner] = (users[owner] || 0) + Buffer.byteLength(JSON.stringify(row)) + (collection === "materials" ? Number(row.file?.bytes || 0) : 0);
  }
  return users;
}
async function userUsage(state, file, userId) {
  const owner = crypto.createHash("sha256").update(String(userId)).digest("hex");
  return (recordUsage(state)[userId] || 0) + await tree(path.join(path.dirname(file), "creative-files", owner));
}
async function assertQuota(state, file, userId, addedBytes) {
  if (addedBytes > 0 && await userUsage(state, file, userId) + addedBytes > quota())
    throw Object.assign(new Error("已达到账号存储上限，请删除不需要的资料或联系管理员。 Account storage limit reached."), { statusCode: 413 });
}
async function assertStateGrowth(before, after, file) {
  const previous = recordUsage(before || {}), next = recordUsage(after);
  for (const [id, size] of Object.entries(next)) if (size > (previous[id] || 0)) await assertQuota(before || {}, file, id, size - (previous[id] || 0));
}
async function report(db, userId) {
  if (db.dynamo) return { mode: "dynamodb", meteringAvailable: false };
  const state = await db.local.load();
  if (userId) return { usedBytes: await userUsage(state, db.local.file, userId), limitBytes: quota() };
  const root = path.dirname(db.local.file), seen = new Set();
  const activeFilesBytes = await tree(path.join(root, "material-files"), seen) + await tree(path.join(root, "creative-files"), seen);
  const localBackupBytes = await tree(process.env.LOCAL_DB_BACKUP_DIR || path.join(root, "backups"), seen);
  const releaseBackupBytes = await tree(process.env.STUDYBRIDGE_RELEASE_BACKUP_ROOT || path.join(require("node:os").homedir(), "studybridge-release-backups"), seen);
  const capacity = await disk(root);
  return { mode: db.local.format || "json", ...capacity, warning: capacity.availableBytes < Math.max(capacity.totalBytes * .2, capacity.reserveBytes * 2),
    activeFilesBytes, localBackupBytes, releaseBackupBytes, accounting: "allocated bytes; hard links counted once, active files first",
    users: await Promise.all(Object.keys(state.users || {}).map(async id => ({ userId: id, usedBytes: await userUsage(state, db.local.file, id), limitBytes: quota() }))) };
}
module.exports = { disk, assertSpace, tree, recordUsage, userUsage, assertQuota, assertStateGrowth, report, quota };
