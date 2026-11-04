const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const webpush = require("web-push");
const { StudyBridgeDatabase } = require("../lib/database");
const { LocalStore } = require("../lib/local-store");
const { createPushService, validateSubscription, idFor } = require("../lib/push-service");
const { capability } = require("../public/push-notifications");
const keys = webpush.generateVAPIDKeys();
const env = { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: "mailto:push@example.test" };
function subscription(suffix = "one") {
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } };
}
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-push-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const db = Object.create(StudyBridgeDatabase.prototype); db.local = new LocalStore(path.join(dir, "db.json")); db.dynamo = null;
  let clock = Date.parse("2026-11-04T12:00:00Z");
  await db.local.write((s) => { s.users.alice = { id: "alice", passwordVersion: 0 }; s.users.bob = { id: "bob", passwordVersion: 0 }; s.sessions.token = { userId: "alice", expiresAt: clock + 86400000 }; s.sessions.bobtoken = { userId: "bob", expiresAt: clock + 86400000 }; });
  let items = [], behavior = async () => {};
  const deliveries = [], auth = { user: { id: "alice" }, tokenHash: "token" }, sub = subscription();
  const options = { db, env, now: () => clock, listSchedule: async () => items, send: async (target, payload, settings) => { await behavior(target); deliveries.push({ target, data: JSON.parse(payload), settings }); } };
  const service = createPushService(options);
  await service.subscribe(auth, { subscription: sub });
  return { db, auth, sub, service, deliveries, options, advance: (ms) => clock += ms, items: (rows) => items = rows, behavior: (fn) => behavior = fn, time: () => clock };
}

test("push validates keys and rejects private or arbitrary endpoints before any transport", () => {
  const good = subscription(); assert.equal(validateSubscription(good).endpoint, good.endpoint);
  for (const endpoint of ["http://fcm.googleapis.com/send", "https://127.0.0.1/send", "https://fcm.googleapis.com.evil.test/send", "https://evil.test/send", "https://fcm.googleapis.com:444/send", "https://user@fcm.googleapis.com/send"]) assert.throws(() => validateSubscription({ ...good, endpoint }), { statusCode: 400 });
  assert.throws(() => validateSubscription({ ...good, keys: { ...good.keys, p256dh: Buffer.alloc(65).toString("base64url") } }), { statusCode: 400 });
});

test("background sends at lead time without a page; durable state and concurrent workers prevent duplicates", async (t) => {
  const f = await fixture(t);
  f.items([{ id: "event", title: "Private title", course: "Private course", startsAt: new Date(f.time() + 16 * 60000).toISOString() }]);
  await f.service.tick(); assert.equal(f.deliveries.length, 0);
  f.advance(60000);
  await Promise.all([f.service.tick(), createPushService(f.options).tick()]); assert.equal(f.deliveries.length, 1);
  assert.equal(f.deliveries[0].data.url, "/app?page=schedule&scheduleItem=event");
  assert.doesNotMatch(JSON.stringify(f.deliveries[0].data), /Private/);
  const restarted = Object.create(StudyBridgeDatabase.prototype); restarted.local = new LocalStore(f.db.local.file); restarted.dynamo = null;
  await createPushService({ ...f.options, db: restarted }).tick(); assert.equal(f.deliveries.length, 1);
});

test("current edits, deletions, completions, old reminders and invalid dates do not trigger stale notifications", async (t) => {
  const f = await fixture(t);
  f.items([{ id: "edit", startsAt: new Date(f.time() + 16 * 60000).toISOString() }]);
  f.advance(60000); f.items([]); await f.service.tick();
  f.items([{ id: "done", startsAt: new Date(f.time() + 15 * 60000).toISOString(), completedAt: new Date(f.time()).toISOString() }, { id: "old", startsAt: new Date(f.time() - 60000).toISOString() }, { id: "invalid", startsAt: "bad" }]);
  await f.service.tick(); assert.equal(f.deliveries.length, 0);
  f.items([{ id: "edit", startsAt: new Date(f.time() + 16 * 60000).toISOString() }]); await f.service.tick();
  f.advance(60000); await f.service.tick(); assert.equal(f.deliveries.length, 1);
});

test("transient failures retry; expired subscriptions are removed and five-minute catch-up expires", async (t) => {
  const f = await fixture(t); f.advance(60000);
  f.items([{ id: "event", startsAt: new Date(f.time() + 15 * 60000).toISOString() }]);
  f.behavior(async () => { throw Object.assign(new Error("private provider response"), { statusCode: 503 }); });
  await f.service.tick(); assert.equal(f.deliveries.length, 0);
  f.behavior(async () => {}); await f.service.tick(); assert.equal(f.deliveries.length, 0);
  f.advance(60000); await f.service.tick(); assert.equal(f.deliveries.length, 1);
  f.items([{ id: "expired", startsAt: new Date(f.time() + 15 * 60000).toISOString() }]);
  f.behavior(async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); });
  await f.service.tick(); assert.equal(await f.db.getPushDevice(idFor(f.sub.endpoint)), null);
  await f.service.subscribe(f.auth, { subscription: f.sub }); f.advance(60000);
  f.items([{ id: "late", startsAt: new Date(f.time() + 15 * 60000).toISOString() }]);
  f.advance(6 * 60000); f.behavior(async () => {}); await f.service.tick(); assert.equal(f.deliveries.length, 1);
});

test("account ownership, session logout and password changes stop delivery; stale worker cannot delete re-bound device", async (t) => {
  const f = await fixture(t); const bob = { user: { id: "bob" }, tokenHash: "bobtoken" };
  assert.equal((await f.service.status(bob, f.sub.endpoint)).enabled, false);
  await f.service.unsubscribe(bob, f.sub.endpoint); assert.ok(await f.db.getPushDevice(idFor(f.sub.endpoint)));
  await assert.rejects(f.service.test(bob, f.sub.endpoint), { statusCode: 409 });
  const before = await f.db.getPushDevice(idFor(f.sub.endpoint));
  await f.service.subscribe(bob, { subscription: f.sub, leadMinutes: 0 });
  const removed = await f.db.changePushDevice(before.id, (row) => row.generation === before.generation ? null : undefined); assert.equal(removed, null);
  assert.equal((await f.db.getPushDevice(before.id)).userId, "bob");
  await f.db.deleteSession("bobtoken"); await f.service.tick(); assert.equal(await f.db.getPushDevice(before.id), null);
  await f.service.subscribe(f.auth, { subscription: f.sub });
  await f.db.local.write((s) => { s.users.alice.passwordVersion = 1; });
  await f.service.tick(); assert.equal(await f.db.getPushDevice(before.id), null); assert.equal(f.deliveries.length, 0);
});

test("device timing, timezone conversion, localization and bounded test requests", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.subscribe(f.auth, { subscription: f.sub, leadMinutes: -1 }), { statusCode: 400 });
  await f.service.subscribe(f.auth, { subscription: f.sub, leadMinutes: 0, language: "en" });
  f.items([{ id: "school-local", startsAt: "2026-11-04T07:01", timeZone: "America/Toronto" }]);
  f.advance(60000); await f.service.tick(); assert.equal(f.deliveries.length, 1); assert.match(f.deliveries[0].data.title, /schedule reminder/);
  await f.service.test(f.auth, f.sub.endpoint); assert.equal(f.deliveries.length, 2);
  await assert.rejects(f.service.test(f.auth, f.sub.endpoint), { statusCode: 429 });
  assert.ok(f.deliveries[0].settings.TTL <= 300);
  const disabled = createPushService({ ...f.options, env: {} });
  assert.equal((await disabled.status(f.auth)).configured, false);
  await assert.rejects(disabled.subscribe(f.auth, { subscription: f.sub }), { statusCode: 503 });
});

test("browser capability status handles insecure, unsupported, denied and supported devices", () => {
  assert.match(capability({ isSecureContext: false }), /HTTPS/);
  assert.match(capability({ isSecureContext: true, navigator: {} }), /不支持/);
  const win = { isSecureContext: true, navigator: { serviceWorker: {} }, PushManager: {}, Notification: { permission: "denied" } };
  assert.match(capability(win), /权限/); win.Notification.permission = "default"; assert.equal(capability(win), "");
});

test("Dynamo conditional device updates retry conflicts and preserve ownership across pagination", async () => {
  const db = Object.create(StudyBridgeDatabase.prototype), rows = new Map();
  let conflictOnce = true, writes = 0;
  db.dynamo = {
    async get(pk, id) { assert.equal(pk, "SCHEDULE_PUSH"); return structuredClone(rows.get(id) || null); },
    async transactPut(records) {
      writes++;
      if (conflictOnce) { conflictOnce = false; throw Object.assign(new Error("conflict"), { code: "TransactionCanceledException" }); }
      const record = records[0], before = rows.get(record.sk) || null;
      assert.deepEqual(record.expectedData || null, before);
      if (record.deleteOnly) rows.delete(record.sk); else rows.set(record.sk, structuredClone(record.data));
    },
    async queryPage(pk, { limit, cursor }) { assert.equal(pk, "SCHEDULE_PUSH"); assert.equal(limit, 25); return { rows: [...rows.values()], cursor: cursor || null }; }
  };
  await db.changePushDevice("device", () => ({ id: "device", userId: "alice", generation: "new" })); assert.equal(writes, 2);
  assert.equal((await db.listPushDevices()).rows.length, 1);
  assert.equal(await db.changePushDevice("device", (row) => row.userId === "bob" ? null : undefined), null);
  await db.changePushDevice("device", (row) => row.userId === "alice" ? null : undefined); assert.equal(await db.getPushDevice("device"), null);
});

test("service worker suppresses old-account pushes and restricts notification navigation to the app", async () => {
  const vm = require("node:vm"), source = await fs.readFile(path.join(__dirname, "../public/push-worker.js"), "utf8");
  const handlers = {}, shown = [], opened = [], messages = [];
  let userId = "alice", existing = false;
  const self = { location: { origin: "https://study.example" }, addEventListener: (name, handler) => handlers[name] = handler,
    registration: { showNotification: async (title, options) => shown.push({ title, options }) },
    clients: { matchAll: async () => existing ? [{ url: "https://study.example/app?page=study", postMessage: (value) => messages.push(value), focus: async () => {} }] : [], openWindow: async (url) => opened.push(url) }
  };
  vm.runInNewContext(source, { self, URL, fetch: async () => ({ ok: Boolean(userId), json: async () => ({ user: { id: userId } }) }) });
  const push = async (value) => { let work; handlers.push({ data: { json: () => value }, waitUntil: (promise) => work = promise }); await work; };
  const value = { title: "Reminder", body: "View schedule", userId: "alice", url: "https://evil.test/phishing" };
  await push(value); assert.equal(shown.length, 1); assert.equal(shown[0].options.data.url, "/app?page=schedule");
  userId = "bob"; await push(value); assert.equal(shown.length, 1);
  userId = null; await push(value); assert.equal(shown.length, 1);
  const click = async (url) => { let work; handlers.notificationclick({ notification: { close() {}, data: { url, userId: "alice" } }, waitUntil: (promise) => work = promise }); await work; };
  await click("https://evil.test/"); assert.equal(opened.length, 0);
  await click("/app?page=schedule&scheduleItem=event"); assert.equal(opened.length, 1);
  existing = true; await click("/app?page=schedule&scheduleItem=event"); assert.equal(opened.length, 1); assert.equal(messages[0].type, "studybridge-schedule-push");
});

test("local device pagination does not skip subsequent devices when expired rows are deleted", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 55; i++) await f.db.changePushDevice(String(i).padStart(3, "0"), () => ({ id: String(i).padStart(3, "0"), generation: "test" }));
  let cursor, seen = [];
  do {
    const page = await f.db.listPushDevices(cursor);
    for (const row of page.rows) { seen.push(row.id); await f.db.changePushDevice(row.id, () => null); }
    cursor = page.cursor;
  } while (cursor);
  assert.equal(new Set(seen).size, 56); assert.equal((await f.db.listPushDevices()).rows.length, 0);
});

test("push configuration writes private persistent keys, preserves other configuration and refuses rotation", async (t) => {
  const { spawnSync } = require("node:child_process");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-push-config-")); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const target = path.join(dir, ".env"), script = path.join(__dirname, "../scripts/configure-web-push.js");
  await fs.writeFile(target, "OTHER=preserve\n WEB_PUSH_PUBLIC_KEY =\nWEB_PUSH_PRIVATE_KEY=\nWEB_PUSH_SUBJECT=\n");
  const result = spawnSync(process.execPath, [script, target, "mailto:owner@example.test"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const text = await fs.readFile(target, "utf8"); assert.match(text, /OTHER=preserve/); assert.match(text, /WEB_PUSH_PUBLIC_KEY=[\w-]+/); assert.match(text, /WEB_PUSH_SUBJECT=mailto:owner@example.test/);
  assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
  const privateKey = text.match(/WEB_PUSH_PRIVATE_KEY=([^\n]+)/)[1]; assert.ok(!result.stdout.includes(privateKey));
  const again = spawnSync(process.execPath, [script, target, "mailto:owner@example.test"], { encoding: "utf8" });
  assert.equal(again.status, 1); assert.equal(await fs.readFile(target, "utf8"), text);
});
