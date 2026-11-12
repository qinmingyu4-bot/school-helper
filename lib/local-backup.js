'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const integrity = require('./backup-integrity');
async function snapshot(db, target) {
  const root = path.dirname(db.local.file), directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  for (const suffix of ['', '.pending', '.manifest', '.materials', '.creative']) {
    if (await fs.lstat(target + suffix).catch(e => { if (e.code === 'ENOENT') return null; throw e; })) throw new Error('Backup destination already exists.');
  }
  let created = false;
  try {
    await db.local.write(async state => {
      const creative = path.join(root, 'creative-files');
      await require('./storage').assertSpace(root, Buffer.byteLength(JSON.stringify(state)) + await require('./storage').tree(creative));
      await fs.writeFile(target + '.pending', JSON.stringify(state), { mode: 0o600, flag: 'wx' });
      created = true;
      const materialFiles = await require('./material-files').snapshot(db.local.file, state, target + '.materials');
      const originals = await integrity.manifest([creative]);
      if (await fs.stat(creative).catch(e => { if (e.code === 'ENOENT') return null; throw e; }))
        await fs.cp(creative, target + '.creative', { recursive: true, force: false, errorOnExist: true });
      const copied = await integrity.manifest([target + '.creative']);
      require('node:assert/strict').deepEqual(copied.map(f => ({...f,name:path.relative(target + '.creative',f.name)})), originals.map(f => ({...f,name:path.relative(creative,f.name)})));
      const files = await integrity.manifest([target + '.pending', target + '.creative']);
      await fs.writeFile(target + '.manifest', JSON.stringify({ version: 1, materialFiles, files: files.map(f => ({ ...f, name: path.relative(directory, f.name.replace(target + '.pending', target)) })) }), { mode: 0o600, flag: 'wx' });
      await fs.rename(target + '.pending', target);
    }, { skipSave: () => true });
  } catch (error) {
    if (created) for (const suffix of ['', '.pending', '.manifest', '.materials', '.creative']) await fs.rm(target + suffix, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
async function verify(target) {
  const manifest = JSON.parse(await fs.readFile(target + '.manifest','utf8'));
  if (manifest.version !== 1 || !manifest.files?.some(f => f.name === path.basename(target))) throw new Error('Incomplete backup manifest.');
  const hash = data => require('node:crypto').createHash('sha256').update(data).digest('hex');
  for (const f of [...manifest.files.map(f => ({...f,root:path.dirname(target)})), ...(manifest.materialFiles || []).map(f => ({...f,root:target+'.materials'}))]) {
    const file = path.resolve(f.root,f.name);
    if (!file.startsWith(path.resolve(f.root)+path.sep)) throw new Error('Unsafe backup path.');
    const bytes = await fs.readFile(file);
    if (bytes.length !== f.bytes || hash(bytes) !== f.sha256) throw new Error('Backup integrity verification failed.');
  }
  JSON.parse(await fs.readFile(target,'utf8'));
  return { verified:true, files:manifest.files.length + (manifest.materialFiles || []).length };
}
module.exports = { snapshot, verify };
