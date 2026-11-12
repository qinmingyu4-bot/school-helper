#!/usr/bin/env node
'use strict';
const { StudyBridgeDatabase } = require('../lib/database');
const maintenance = require('../lib/storage-maintenance');
const path = require('node:path');
(async () => {
  const [action, argument] = process.argv.slice(2), apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--writers-stopped')) throw new Error('Stop application writers and take a verified release backup before applying cleanup.');
  if (action === 'verify-scheduled') console.log(JSON.stringify(await require('../lib/local-backup').verify(path.resolve(argument))));
  else if (action === 'releases') console.log(JSON.stringify(await maintenance.releaseRetention(path.resolve(argument), { apply }), null, 2));
  else if (action === 'verify') console.log(JSON.stringify(await require('../lib/backup-restore').restoreRelease(path.resolve(argument), process.argv[4] && !process.argv[4].startsWith('--') ? path.resolve(process.argv[4]) : undefined)));
  else {
    const db = new StudyBridgeDatabase();
    try {
      if (action === 'materials') console.log(JSON.stringify(await maintenance.collectMaterials(db, { apply }), null, 2));
      else if (action === 'report') console.log(JSON.stringify(await require('../lib/storage').report(db), null, 2));
      else throw new Error('Use report, materials, releases <directory>, or verify <release> [new restore directory]. Environment must match the production service.');
    } finally { db.local.close?.(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
