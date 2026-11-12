'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
async function manifest(roots) {
  const output = [];
  async function visit(file) {
    const s = await fs.lstat(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (!s) return;
    if (s.isSymbolicLink()) throw new Error('Backup must not follow symbolic links.');
    if (s.isDirectory()) { for (const name of await fs.readdir(file)) await visit(path.join(file, name)); }
    else if (s.isFile()) {
      const bytes = await fs.readFile(file);
      output.push({ name: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  for (const root of roots) await visit(root);
  return output;
}
module.exports = { manifest };
