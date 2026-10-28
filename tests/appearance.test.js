const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { themes, normalize, isValid, createSaver, createController } = require("../public/appearance");
const { StudyBridgeDatabase } = require("../lib/database");
const turn = () => new Promise((resolve) => setImmediate(resolve));

test("appearance keeps the original palettes and allows the new monochrome option", () => {
  assert.deepEqual(themes.map((theme) => theme.id), ["default", "smoke-purple", "graphite", "mist-blue", "dusty-rose", "celadon", "silver", "monochrome"]);
  for (const theme of themes) assert.equal(isValid({ theme: theme.id }), true);
  for (const value of [null, [], {}, "graphite", { theme: "<style>" }, { theme: 1 }, { theme: "graphite", userId: "another" }]) {
    assert.equal(isValid(value), false);
  }
  assert.deepEqual(normalize({ theme: "unknown" }), { theme: "default" });
  assert.deepEqual(normalize(null), { theme: "default" });
});

test("rapid changes serialize saves and retain the latest theme, including returning to default", async () => {
  const starts = [], releases = [];
  const saver = createSaver({ save: (value) => new Promise((resolve) => { starts.push(value.theme); releases.push(resolve); }) });
  saver.setDraft({ theme: "smoke-purple" });
  const pending = saver.flush();
  await turn();
  saver.setDraft({ theme: "mist-blue" });
  saver.setDraft({ theme: "default" });
  assert.equal(saver.flush(), pending);
  assert.deepEqual(starts, ["smoke-purple"]);
  releases[0]();
  await turn();
  assert.deepEqual(starts, ["smoke-purple", "default"]);
  releases[1]();
  await pending;
  assert.equal(saver.snapshot().status, "saved");
  assert.equal(saver.snapshot().saved.theme, "default");
});

test("dark mode is independent of the daytime theme and legacy records stay light", () => {
  assert.deepEqual(normalize({ theme: "celadon", mode: "dark" }), { theme: "celadon", mode: "dark" });
  assert.deepEqual(normalize({ theme: "celadon", mode: "light" }), { theme: "celadon" });
  for (const theme of themes) for (const mode of ["light", "dark"]) assert.equal(isValid({ theme: theme.id, mode }), true);
  for (const mode of [null, true, "auto", "<script>"]) assert.equal(isValid({ theme: "default", mode }), false);
});

test("rapid night/day changes save even when the daytime theme never changes", async () => {
  const starts = [], releases = [];
  const saver = createSaver({ initial: { theme: "celadon" }, save: (value) => new Promise((resolve) => { starts.push(value); releases.push(resolve); }) });
  saver.setDraft({ theme: "celadon", mode: "dark" });
  const pending = saver.flush();
  await turn();
  saver.setDraft({ theme: "celadon", mode: "light" });
  releases[0](); await turn();
  assert.deepEqual(starts, [{ theme: "celadon", mode: "dark" }, { theme: "celadon" }]);
  releases[1](); await pending;
  assert.equal(saver.snapshot().status, "saved");
  assert.deepEqual(saver.snapshot().saved, { theme: "celadon" });
});

test("failed or lost save responses keep the draft and explicitly re-save on retry", async () => {
  let failed = true, calls = 0;
  const saver = createSaver({ save: async () => { calls++; if (failed) throw new Error("offline"); } });
  saver.setDraft({ theme: "silver" });
  await assert.rejects(saver.flush(), /offline/);
  assert.equal(saver.snapshot().status, "error");
  assert.equal(saver.snapshot().draft.theme, "silver");
  // The previous write may have reached the server despite losing its response.
  saver.setDraft({ theme: "default" });
  failed = false;
  await saver.flush();
  assert.equal(calls, 2);
  assert.equal(saver.snapshot().saved.theme, "default");
});

test("disposed saves cannot send queued choices or notify the next account", async () => {
  let release, writes = 0, notifications = 0;
  const saver = createSaver({ save: () => { writes++; return new Promise((resolve) => { release = resolve; }); }, onChange: () => notifications++ });
  saver.setDraft({ theme: "graphite" });
  const pending = saver.flush();
  await turn();
  saver.setDraft({ theme: "silver" });
  saver.dispose();
  const before = notifications;
  release(); await pending;
  assert.equal(writes, 1);
  assert.equal(notifications, before);
});

test("account switches reject late loads, isolate cached themes and reset the default at logout", async () => {
  const attrs = new Map(), loads = new Map();
  const doc = { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } };
  const cache = new Map([["studybridge.appearance.alice", JSON.stringify({ theme: "graphite" })]]);
  const controller = createController({ document: doc, storage: { getItem: (k) => cache.get(k), setItem: (k, v) => cache.set(k, v) },
    load: (id) => new Promise((resolve) => loads.set(id, resolve)), save: async () => {} });
  controller.sync({ id: "alice" });
  assert.equal(attrs.get("data-sb-theme"), "graphite");
  controller.sync({ id: "bob" });
  assert.equal(attrs.has("data-sb-theme"), false);
  loads.get("alice")({ theme: "smoke-purple" }); await turn();
  assert.equal(attrs.has("data-sb-theme"), false);
  loads.get("bob")({ theme: "celadon" }); await turn();
  assert.equal(attrs.get("data-sb-theme"), "celadon");
  assert.equal(JSON.parse(cache.get("studybridge.appearance.alice")).theme, "graphite");
  controller.sync(null);
  assert.equal(attrs.has("data-sb-theme"), false);
});

test("cached dark mode applies with the saved daytime palette and clears across accounts/logout", async () => {
  const attrs = new Map(), loads = new Map();
  const doc = { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } };
  const controller = createController({ document: doc,
    storage: { getItem: (key) => key.endsWith("alice") ? JSON.stringify({ theme: "mist-blue", mode: "dark" }) : null, setItem() {} },
    load: (id) => new Promise((resolve) => loads.set(id, resolve)), save: async () => {} });
  controller.sync({ id: "alice" });
  assert.equal(attrs.get("data-sb-mode"), "dark");
  assert.equal(attrs.get("data-sb-theme"), "mist-blue");
  controller.sync({ id: "bob" });
  assert.equal(attrs.has("data-sb-mode"), false);
  loads.get("alice")({ theme: "silver", mode: "dark" }); await turn();
  assert.equal(attrs.has("data-sb-mode"), false);
  loads.get("bob")({ theme: "default", mode: "dark" }); await turn();
  assert.equal(attrs.get("data-sb-mode"), "dark");
  controller.sync(null);
  assert.equal(attrs.has("data-sb-mode"), false);
});

test("local appearance survives reloads, stays account scoped and does not overwrite profile/preferences", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-appearance-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.dynamo = null; db.local.file = path.join(directory, "db.json");
  await db.createUser({ id: "alice", email: "alice@example.test", name: "Alice" });
  await Promise.all([db.setUserAppearance("alice", { theme: "monochrome" }), db.updateUser("alice", { preferences: { englishTerms: true } })]);
  db.local.state = null;
  assert.deepEqual(await db.getUserAppearance("alice"), { theme: "monochrome" });
  assert.equal(await db.getUserAppearance("bob"), null);
  assert.deepEqual((await db.getUser("alice")).preferences, { englishTerms: true });
  assert.equal((await db.getUser("alice")).name, "Alice");
});

test("DynamoDB appearance uses a separate user-owned record without touching PROFILE", async () => {
  const db = new StudyBridgeDatabase(), records = new Map();
  db.dynamo = {
    get: async (pk, sk) => { assert.equal(sk, "APPEARANCE"); return records.get(pk) || null; },
    put: async (pk, sk, type, value) => { assert.equal(sk, "APPEARANCE"); assert.equal(type, "userAppearance"); records.set(pk, value); return value; }
  };
  await db.setUserAppearance("alice", { theme: "dusty-rose", mode: "dark", ignored: true });
  assert.deepEqual(await db.getUserAppearance("alice"), { theme: "dusty-rose", mode: "dark" });
  assert.equal(await db.getUserAppearance("bob"), null);
});
