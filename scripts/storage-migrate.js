#!/usr/bin/env node
'use strict';
// Explicit offline operation. Never changes configuration or removes the JSON source.
const path = require('node:path');
if (!process.argv.includes('--writers-stopped')) throw new Error('Stop all application writers, take a verified backup, then pass --writers-stopped.');
const file = path.resolve(process.argv[2]);
const target = require('../lib/sqlite-store').migrate(file);
console.log(`Verified SQLite copy: ${target}. Original JSON retained. Set LOCAL_STORE_FORMAT=sqlite only after verifying a backup.`);
