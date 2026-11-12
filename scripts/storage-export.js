#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { SqliteStore } = require('../lib/sqlite-store');
(async () => {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: storage-export.js <original-json-path> <new-export-path>');
  const store = new SqliteStore(path.resolve(process.argv[2]));
  try {
    await store.write(async state => {
      const serialized = JSON.stringify(state);
      await fs.writeFile(path.resolve(process.argv[3]), serialized, { mode: 0o600, flag: 'wx' });
      require('node:assert/strict').deepEqual(JSON.parse(await fs.readFile(path.resolve(process.argv[3]), 'utf8')), state);
    }, { skipSave: () => true });
    console.log('Verified current SQLite export; source unchanged.');
  } finally { store.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
