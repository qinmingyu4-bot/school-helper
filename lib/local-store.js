const fs = require("node:fs/promises");
const path = require("node:path");

// Stored values are JSON data. Copy mutable containers while sharing immutable
// strings, including large encoded uploads, instead of copying their bytes.
function draftOf(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(draftOf);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, draftOf(item)]));
}

class LocalStore {
  constructor(file) {
    this.file = path.resolve(file || ".data/studybridge.json");
    this.state = null;
    this.loading = null;
    this.pending = Promise.resolve();
  }

  async load() {
    if (this.state) return this.state;
    // Concurrent first reads must share a load so a late read cannot replace a
    // state that has already been committed by another operation.
    if (this.loading) return this.loading;
    this.loading = this.loadFile();
    try { return await this.loading; } finally { this.loading = null; }
  }

  async loadFile() {
    let state;
    try { state = JSON.parse(await fs.readFile(this.file, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      state = { emailIndex: {}, users: {}, sessions: {}, courses: {}, documents: {}, messages: {}, invites: {}, authCodes: {},
        communityPosts: {}, classmates: {}, classmateRequests: {}, directMessages: {} };
    }
    for (const key of ["invites", "authCodes", "communityPosts", "classmates", "classmateRequests", "directMessages"]) state[key] ||= {};
    this.state = state;
    return state;
  }

  async save(state = this.state) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporaryFile = `${this.file}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporaryFile, JSON.stringify(state, null, 2), { mode: 0o600 });
      await fs.rename(temporaryFile, this.file);
    } finally { await fs.unlink(temporaryFile).catch(() => {}); }
  }

  async write(mutator, { skipSave } = {}) {
    const operation = this.pending.then(async () => {
      const draft = draftOf(await this.load());
      const result = await mutator(draft);
      if (!skipSave?.(result)) {
        await this.save(draft);
        // Readers only see durable state. A failed mutator or save discards the
        // entire draft, including nested changes and partially completed work.
        this.state = draft;
      }
      return result;
    });
    this.pending = operation.catch(() => {});
    return operation;
  }

  async read(selector) {
    return selector(await this.load());
  }
}

module.exports = { LocalStore };
