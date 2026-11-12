"use strict";
// Keep the existing collection API while committing only changed records.
// All handles in this process share a queue. SQLite's write lock serializes other processes.
const fs = require('node:fs');
const path = require('node:path');
const { LocalStore } = require('./local-store');
const queues = new Map();
class SqliteStore extends LocalStore {
  constructor(file) { super(file); this.format = 'sqlite'; this.connection = null; }
  open() {
    if (this.connection) return this.connection;
    const filename = this.file + '.sqlite';
    if (!fs.existsSync(filename)) throw new Error('SQLite has not been migrated. Run the offline storage migration first.');
    const { DatabaseSync } = require('node:sqlite');
    this.connection = new DatabaseSync(filename);
    this.connection.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    return this.connection;
  }
  async load() {
    const state = {};
    for (const row of this.open().prepare('SELECT collection, id, value FROM records').all()) {
      state[row.collection] ||= {};
      if (row.id !== '') state[row.collection][row.id] = JSON.parse(row.value);
    }
    this.state = state;
    return state;
  }
  async save(state) {
    await require('./storage').assertStateGrowth(this.state, state, this.file);
    const serialized = JSON.stringify(state);
    await require('./storage').assertSpace(path.dirname(this.file), Buffer.byteLength(serialized) * 2, this.state && serialized.length < JSON.stringify(this.state).length ? 16 * 1024 * 1024 : undefined);
    const connection = this.open(), next = new Map();
    for (const [collection, rows] of Object.entries(state)) {
      next.set(JSON.stringify([collection, '']), '{}');
      for (const [id, row] of Object.entries(rows)) {
        if (!id) throw new Error('Empty record ID is not supported.');
        next.set(JSON.stringify([collection, id]), JSON.stringify(row));
      }
    }
    const put = connection.prepare('INSERT INTO records VALUES (?, ?, ?) ON CONFLICT(collection,id) DO UPDATE SET value=excluded.value');
    const remove = connection.prepare('DELETE FROM records WHERE collection=? AND id=?');
    for (const row of connection.prepare('SELECT collection,id,value FROM records').all()) {
      const key = JSON.stringify([row.collection, row.id]);
      if (!next.has(key)) remove.run(row.collection, row.id);
      else if (next.get(key) === row.value) next.delete(key);
    }
    for (const [key, value] of next) put.run(...JSON.parse(key), value);
  }
  async write(mutator, { skipSave } = {}) {
    const operation = (queues.get(this.file) || Promise.resolve()).then(async () => {
      const connection = this.open();
      connection.exec('BEGIN IMMEDIATE');
      try {
        const before = await this.load(), draft = structuredClone(before);
        const result = await mutator(draft);
        if (!skipSave?.(result)) { this.state = before; await this.save(draft); }
        connection.exec('COMMIT'); this.state = null;
        return result;
      } catch (error) { connection.exec('ROLLBACK'); this.state = null; throw error; }
    });
    this.pending = operation.catch(() => {}); queues.set(this.file, this.pending);
    return operation;
  }
  close() { this.connection?.close(); this.connection = null; }
}
function migrate(file) {
  const { DatabaseSync } = require('node:sqlite');
  const target = file + '.sqlite', temp = target + '.migrating';
  const source = fs.readFileSync(file), state = JSON.parse(source);
  if (!state.users || !state.courses || !state.documents || !state.messages) throw new Error('Invalid source database.');
  if (fs.existsSync(target) || fs.existsSync(temp)) throw new Error('Migration destination already exists; inspect it first.');
  const fd = fs.openSync(temp, 'wx', 0o600); fs.closeSync(fd);
  const db = new DatabaseSync(temp);
  try {
    db.exec('PRAGMA synchronous=FULL; CREATE TABLE records(collection TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(collection,id)); BEGIN IMMEDIATE;');
    const put = db.prepare('INSERT INTO records VALUES(?,?,?)');
    for (const [collection, rows] of Object.entries(state)) {
      if (!rows || typeof rows !== 'object' || Array.isArray(rows)) throw new Error('Unsupported collection.');
      put.run(collection, '', '{}');
      for (const [id, value] of Object.entries(rows)) { if (!id) throw new Error('Empty record ID.'); put.run(collection, id, JSON.stringify(value)); }
    }
    db.exec('COMMIT');
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('SQLite integrity check failed.');
    const restored = {};
    for (const row of db.prepare('SELECT * FROM records').all()) { restored[row.collection] ||= {}; if (row.id) restored[row.collection][row.id] = JSON.parse(row.value); }
    require('node:assert/strict').deepEqual(restored, state);
    if (!fs.readFileSync(file).equals(source)) throw new Error('Source changed during migration. Stop all writers first.');
    db.close(); fs.renameSync(temp, target);
  } catch (error) { try { db.close(); } catch {} throw error; }
  return target;
}
module.exports = { SqliteStore, migrate };
