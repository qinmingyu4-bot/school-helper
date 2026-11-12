'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
function safe(root, relative) {
  const result = path.resolve(root, relative);
  if (!result.startsWith(path.resolve(root) + path.sep)) throw new Error('Unsafe backup path.');
  return result;
}
async function verify(file, bytes, hash) {
  const data = await fs.readFile(file);
  if (data.length !== bytes || crypto.createHash('sha256').update(data).digest('hex') !== hash) throw new Error('Backup integrity verification failed.');
  return data;
}
async function restoreRelease(directory, destination) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.mode !== 'local' || !manifest.files?.some(x => x.name === 'database.json')) throw new Error('Expected a complete local release backup.');
  for (const f of manifest.files) await verify(safe(directory, f.name), f.bytes, f.sha256);
  for (const f of manifest.materialFiles || []) await verify(safe(path.join(directory, 'material-files'), f.name), f.bytes, f.sha256);
  const state = JSON.parse(await fs.readFile(path.join(directory, 'database.json'), 'utf8'));
  if (!state.users || !state.documents || !state.courses) throw new Error('Invalid backup database.');
  for (const record of Object.values(state.materials || {})) if (record.file) await require('./material-files').read(path.join(directory, 'database.json'), record.userId, record.courseId, record.id, record.file);
  // Old release backups do not have creative file hashes. Never claim those verified.
  if (manifest.creativeFiles && !manifest.creativeManifest) throw new Error('Legacy backup lacks creative file checksums; take a new verified backup before pruning.');
  for (const f of manifest.creativeManifest || []) await verify(safe(directory, f.name), f.bytes, f.sha256);
  if (destination) {
    await fs.mkdir(destination, { mode: 0o700 }); // exclusive: existing destination fails
    await fs.copyFile(path.join(directory, 'database.json'), path.join(destination, 'studybridge.json'), require('node:fs').constants.COPYFILE_EXCL);
    for (const name of ['material-files', 'creative-files']) {
      if (await fs.stat(path.join(directory, name)).catch(() => null)) await fs.cp(path.join(directory, name), path.join(destination, name), { recursive: true, force: false, errorOnExist: true });
    }
    for (const record of Object.values(state.materials || {})) if (record.file) await require('./material-files').read(path.join(destination, 'studybridge.json'), record.userId, record.courseId, record.id, record.file);
  }
  return { verified: true, users: Object.keys(state.users).length, courses: Object.keys(state.courses).length, documents: Object.keys(state.documents).length };
}
module.exports = { restoreRelease };
