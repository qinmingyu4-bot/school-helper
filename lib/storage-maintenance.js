'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const files = require('./material-files');
async function collectMaterials(db, { apply = false, now = Date.now(), minAgeMs = 7 * 86400000 } = {}) {
  if (db.dynamo) throw new Error('Local file maintenance only.');
  return db.local.write(async state => {
    const root = files.root(db.local.file), referenced = new Set();
    // Abort cleanup if ANY live reference is unreadable/corrupt.
    for (const row of Object.values(state.materials || {})) if (row.file) {
      await files.read(db.local.file, row.userId, row.courseId, row.id, row.file);
      referenced.add(path.join(root, files.hash(JSON.stringify([row.userId, row.courseId])), files.hash(row.id), row.file.digest + '.json'));
    }
    const candidates = [];
    async function visit(dir) {
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
        const filename = path.join(dir, e.name);
        if (e.isDirectory()) await visit(filename);
        else if (e.isFile() && /^[a-f0-9]{64}\.json$/.test(e.name) && !referenced.has(filename)) {
          const s = await fs.stat(filename);
          if (now - s.mtimeMs >= minAgeMs) candidates.push({ filename, bytes: s.size, exclusiveBytes: s.nlink === 1 ? s.blocks * 512 : 0 });
        }
      }
    }
    await visit(root);
    if (apply) for (const item of candidates) await fs.unlink(item.filename);
    return { apply, files: candidates.length, logicalBytes: candidates.reduce((n, f) => n + f.bytes, 0), reclaimableBytes: candidates.reduce((n, f) => n + f.exclusiveBytes, 0) };
  }, { skipSave: () => true });
}
async function releaseRetention(root, { apply = false, keep = 14, minDays = 30, now = Date.now() } = {}) {
  if (!Number.isInteger(keep) || keep < 3 || minDays < 7) throw new Error('Unsafe retention settings.');
  const releases = [];
  for (const e of await fs.readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory() || !/^release-[a-f0-9]{12}-[A-Za-z0-9]+$/.test(e.name)) continue;
    const directory = path.join(root, e.name);
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
      const time = Date.parse(manifest.createdAt);
      if (manifest.format === 1 && Number.isFinite(time) && manifest.files?.some(x => x.name === 'database.json')) releases.push({ directory, time, manifest });
    } catch { /* Never remove incomplete or unknown backups. */ }
  }
  releases.sort((a,b) => b.time - a.time);
  // Verify the newest complete backup before permitting any removal.
  if (apply) { if (!releases.length) throw new Error('No valid retained backup.'); await require('./backup-restore').restoreRelease(releases[0].directory); }
  const candidates = releases.slice(keep).filter(x => now - x.time >= minDays * 86400000);
  if (apply) for (const item of candidates) await fs.rm(item.directory, { recursive: true });
  return { apply, retained: releases.length - candidates.length, candidates: candidates.map(x => path.basename(x.directory)) };
}
module.exports = { collectMaterials, releaseRetention };
