'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { StudyBridgeDatabase } = require('../lib/database');
const { SqliteStore, migrate } = require('../lib/sqlite-store');
const { collectMaterials } = require('../lib/storage-maintenance');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-storage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.dynamo = null; db.local.file = path.join(dir, 'studybridge.json');
  await db.createUser({ id: 'alice', email: 'alice@example.test' });
  return { db, dir };
}
test('SQLite migration preserves every record and originals; concurrent stores retain both writes and roll back failed transactions', async t => {
  const { db } = await fixture(t);
  await db.writeMaterial('alice', 'math', 'original', { base64: 'aGVsbG8=' });
  const before = await db.local.load(), json = await fs.readFile(db.local.file);
  migrate(db.local.file);
  const a = new SqliteStore(db.local.file), b = new SqliteStore(db.local.file);
  t.after(() => { a.close(); b.close(); });
  assert.deepEqual(await a.load(), before);
  await Promise.all([a.write(s => { s.users.alice.name = 'Alice'; }), b.write(s => { s.courses.math = { id: 'math', userId: 'alice' }; })]);
  await assert.rejects(a.write(s => { delete s.users.alice; throw new Error('abort'); }), /abort/);
  assert.equal((await b.load()).users.alice.name, 'Alice');
  assert.equal((await a.load()).courses.math.id, 'math');
  assert.ok((await fs.readFile(db.local.file)).equals(json));
  db.local = a;
  assert.deepEqual(await db.readMaterial('alice', 'math', 'original'), { base64: 'aGVsbG8=' });
  assert.throws(() => migrate(db.local.file), /exists/);
});
test('quota rejects concurrent uploads without replacing live metadata; deleting data is still allowed', async t => {
  const { db } = await fixture(t);
  const old = process.env.STORAGE_USER_LIMIT_BYTES; process.env.STORAGE_USER_LIMIT_BYTES = '5000';
  t.after(() => { if (old === undefined) delete process.env.STORAGE_USER_LIMIT_BYTES; else process.env.STORAGE_USER_LIMIT_BYTES = old; });
  const result = await Promise.allSettled([1,2].map(i => db.writeMaterial('alice', 'math', 'file'+i, { text: 'a'.repeat(3000) })));
  assert.equal(result.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(result.find(x => x.status === 'rejected').reason.statusCode, 413);
  await db.deleteMaterials('alice','math');
  assert.equal(Object.keys((await db.local.load()).materials).length, 0);
});
test('disk reserve prevents a commit and preserves the last durable state', async t => {
  const { db } = await fixture(t), old = process.env.STORAGE_RESERVE_BYTES;
  process.env.STORAGE_RESERVE_BYTES = String(1024 ** 5);
  t.after(() => { if (old === undefined) delete process.env.STORAGE_RESERVE_BYTES; else process.env.STORAGE_RESERVE_BYTES = old; });
  await assert.rejects(db.local.write(s => { s.users.alice.name = 'lost'; }), { statusCode: 507 });
  assert.equal((await db.local.load()).users.alice.name, undefined);
});
test('garbage collection preserves current references and hard-linked backups, with dry run by default', async t => {
  const { db, dir } = await fixture(t), files = require('../lib/material-files');
  await db.writeMaterial('alice','math','one',{ text:'first' });
  const oldState = await db.local.load();
  const entries = await files.snapshot(db.local.file, oldState, path.join(dir, 'backup'));
  await db.writeMaterial('alice','math','one',{ text:'second' });
  assert.equal((await collectMaterials(db, { minAgeMs: 0 })).files, 1);
  assert.equal((await collectMaterials(db, { apply: true, minAgeMs: 0 })).files, 1);
  assert.deepEqual(await db.readMaterial('alice','math','one'),{text:'second'});
  assert.match(await fs.readFile(path.join(dir,'backup',entries[0].name),'utf8'), /first/);
  assert.equal((await collectMaterials(db, { minAgeMs: 0 })).files, 0);
});
test('release backup restores authored files and rejects tampering before writing a restore directory', async t => {
  const { db, dir } = await fixture(t), root = path.join(dir,'checkout');
  await fs.mkdir(root);
  const source = path.join(dir,'creative-files','owner','job'); await fs.mkdir(source,{recursive:true}); await fs.writeFile(path.join(source,'file'),'original');
  const backup = path.join(dir,'release');
  await require('../scripts/release-backup').backupRelease({ root, directory:backup,env:{LOCAL_DB_FILE:db.local.file},previousCommit:'a'.repeat(40),targetCommit:'b'.repeat(40) });
  const restore = require('../lib/backup-restore').restoreRelease;
  await restore(backup,path.join(dir,'restored'));
  assert.equal(await fs.readFile(path.join(dir,'restored','creative-files','owner','job','file'),'utf8'),'original');
  await fs.writeFile(path.join(backup,'creative-files','owner','job','file'),'changed');
  await assert.rejects(restore(backup,path.join(dir,'bad-restore')), /integrity/);
  await assert.rejects(fs.stat(path.join(dir,'bad-restore')), {code:'ENOENT'});
});
test('scheduled backup includes originals and authored files and catches corrupted creative files', async t => {
  const {db,dir} = await fixture(t);
  await db.writeMaterial('alice','math','one',{ text:'source' });
  await db.saveCreativeFile('alice','job','file',Buffer.from('artwork'));
  const target = path.join(dir,'backups','snapshot.json'), backup = require('../lib/local-backup');
  await backup.snapshot(db,target);
  assert.equal((await backup.verify(target)).verified,true);
  const owner = require('node:crypto').createHash('sha256').update('alice').digest('hex');
  assert.equal(await fs.readFile(path.join(target+'.creative',owner,'job','file'),'utf8'),'artwork');
  await fs.writeFile(path.join(target+'.creative',owner,'job','file'),'corrupt');
  await assert.rejects(backup.verify(target),/integrity/);
});
test('release retention keeps recent and newest backups, skips unknown directories and aborts on corrupt retained backup', async t => {
  const { dir } = await fixture(t), root = path.join(dir,'releases'); await fs.mkdir(root);
  const now = Date.now(), body = JSON.stringify({users:{},courses:{},documents:{},messages:{}}), hash = require('node:crypto').createHash('sha256').update(body).digest('hex');
  for (let i=0;i<6;i++) {
    const folder = path.join(root,`release-aaaaaaaaaaaa-test${i}`); await fs.mkdir(folder);
    await fs.writeFile(path.join(folder,'database.json'),body);
    await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify({format:1,mode:'local',createdAt:new Date(now-(40+i)*86400000).toISOString(),files:[{name:'database.json',bytes:Buffer.byteLength(body),sha256:hash}]}));
  }
  await fs.mkdir(path.join(root,'unknown'));
  const retention = require('../lib/storage-maintenance').releaseRetention;
  assert.equal((await retention(root,{keep:3,minDays:30,now})).candidates.length,3);
  assert.equal((await fs.readdir(root)).length,7);
  await retention(root,{apply:true,keep:3,minDays:30,now});
  assert.equal((await fs.readdir(root)).length,4);
  await fs.writeFile(path.join(root,'release-aaaaaaaaaaaa-test0','database.json'),'corrupt');
  await assert.rejects(retention(root,{apply:true,keep:3,minDays:30,now}),/integrity/);
});
