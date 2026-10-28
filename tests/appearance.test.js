const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { themes, logos, normalize, isValid, createSaver, createController } = require("../public/appearance");
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

test("logo choices default to monochrome and stay independent of palette and dark mode", () => {
  assert.deepEqual(logos.map((logo) => logo.id), ["monochrome", "color"]);
  for (const theme of themes) for (const logo of logos) for (const mode of ["light", "dark"]) {
    assert.equal(isValid({ theme: theme.id, mode, logo: logo.id }), true);
  }
  for (const logo of [null, true, "unknown", "<svg>", {}, []]) assert.equal(isValid({ theme: "default", logo }), false);
  assert.deepEqual(normalize({ theme: "graphite", mode: "dark" }), { theme: "graphite", mode: "dark" });
  assert.deepEqual(normalize({ theme: "graphite", mode: "dark", logo: "color" }), { theme: "graphite", mode: "dark", logo: "color" });
  assert.deepEqual(normalize({ theme: "graphite", logo: "monochrome" }), { theme: "graphite" });
  assert.deepEqual(normalize({ logo: "unknown" }), { theme: "default" });
});

test("logo-only changes serialize and save returning to monochrome without losing other choices", async () => {
  const starts = [], releases = [];
  const saver = createSaver({ initial: { theme: "celadon", mode: "dark" },
    save: (value) => new Promise((resolve) => { starts.push(value); releases.push(resolve); }) });
  saver.setDraft({ theme: "celadon", mode: "dark", logo: "color" });
  const pending = saver.flush(); await turn();
  saver.setDraft({ theme: "celadon", mode: "dark", logo: "monochrome" });
  releases[0](); await turn();
  assert.deepEqual(starts, [{ theme: "celadon", mode: "dark", logo: "color" }, { theme: "celadon", mode: "dark" }]);
  releases[1](); await pending;
  assert.deepEqual(saver.snapshot().saved, { theme: "celadon", mode: "dark" });
});

test("logo controls await saved appearance, then preserve other choices and update the favicon", async () => {
  const attrs = new Map(), listeners = new Map(), writes = [], elements = new Map();
  let finishLoad;
  const node = () => ({ addEventListener() {}, classList: { toggle() {} } });
  for (const selector of ['input[name="sb-dark-mode"]', '.settings-logos', '.settings-themes', '.settings-save-status', '.settings-retry', '.settings-close']) elements.set(selector, node());
  const radios = logos.map((logo) => ({ value: logo.id }));
  const favicon = { setAttribute: (key, value) => attrs.set(`icon:${key}`, value) };
  const dialog = { querySelector: (key) => elements.get(key),
    querySelectorAll: (key) => key === 'input[name="sb-logo"]' ? radios : [],
    addEventListener: (name, handler) => listeners.set(name, handler),
    showModal() { this.open = true; }, close() {}, remove() {} };
  const controller = createController({ document: { body: { append() {} }, querySelector: () => favicon,
    documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } },
    storage: null, load: () => new Promise((resolve) => { finishLoad = resolve; }),
    save: async (_id, value) => writes.push(value), createSettingsView: () => dialog });
  controller.sync({ id: "alice" }); controller.open();
  assert.equal(elements.get('.settings-logos').disabled, true);
  assert.equal(elements.get('.settings-themes').disabled, true);
  finishLoad({ theme: "celadon", mode: "dark", logo: "color" }); await turn();
  assert.equal(elements.get('.settings-logos').disabled, false);
  assert.equal(elements.get('.settings-themes').disabled, true);
  assert.equal(radios.find((radio) => radio.value === 'color').checked, true);
  assert.equal(attrs.get('icon:href'), '/brand/icon-color.svg');
  listeners.get('change')({ target: { matches: () => true, name: 'sb-logo', value: 'monochrome' } });
  await turn();
  assert.deepEqual(writes, [{ theme: "celadon", mode: "dark" }]);
  assert.equal(attrs.has('data-sb-logo'), false);
  assert.equal(attrs.get('data-sb-mode'), 'dark');
  assert.equal(attrs.get('icon:href'), '/brand/icon-monochrome.svg');
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
  const cache = new Map([["studybridge.appearance.alice", JSON.stringify({ theme: "graphite", logo: "color" })]]);
  const controller = createController({ document: doc, storage: { getItem: (k) => cache.get(k), setItem: (k, v) => cache.set(k, v) },
    load: (id) => new Promise((resolve) => loads.set(id, resolve)), save: async () => {} });
  controller.sync({ id: "alice" });
  assert.equal(attrs.get("data-sb-theme"), "graphite");
  assert.equal(attrs.get("data-sb-logo"), "color");
  controller.sync({ id: "bob" });
  assert.equal(attrs.has("data-sb-theme"), false);
  assert.equal(attrs.has("data-sb-logo"), false);
  loads.get("alice")({ theme: "smoke-purple", logo: "color" }); await turn();
  assert.equal(attrs.has("data-sb-theme"), false);
  assert.equal(attrs.has("data-sb-logo"), false);
  loads.get("bob")({ theme: "celadon", logo: "color" }); await turn();
  assert.equal(attrs.get("data-sb-theme"), "celadon");
  assert.equal(attrs.get("data-sb-logo"), "color");
  assert.equal(JSON.parse(cache.get("studybridge.appearance.alice")).theme, "graphite");
  controller.sync(null);
  assert.equal(attrs.has("data-sb-theme"), false);
  assert.equal(attrs.has("data-sb-logo"), false);
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
  await Promise.all([db.setUserAppearance("alice", { theme: "monochrome", logo: "color" }), db.updateUser("alice", { preferences: { englishTerms: true } })]);
  db.local.state = null;
  assert.deepEqual(await db.getUserAppearance("alice"), { theme: "monochrome", logo: "color" });
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
  await db.setUserAppearance("alice", { theme: "dusty-rose", mode: "dark", logo: "color", ignored: true });
  assert.deepEqual(await db.getUserAppearance("alice"), { theme: "dusty-rose", mode: "dark", logo: "color" });
  await db.setUserAppearance("alice", { theme: "dusty-rose", mode: "dark", logo: "monochrome" });
  assert.deepEqual(await db.getUserAppearance("alice"), { theme: "dusty-rose", mode: "dark" });
  assert.equal(await db.getUserAppearance("bob"), null);
});
