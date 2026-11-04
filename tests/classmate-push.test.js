const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const webpush = require("web-push");
const { LocalStore } = require("../lib/local-store");
const { StudyBridgeDatabase } = require("../lib/database");
const { createPushService } = require("../lib/push-service");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-classmate-push-")); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const db = Object.create(StudyBridgeDatabase.prototype); db.local = new LocalStore(path.join(dir, "db.json")); db.dynamo = null;
  let clock = Date.parse("2026-11-05T12:00:00Z"), failure = false, schedules = 0;
  await db.local.write((s) => { s.users.alice = { id: "alice" }; s.users.bob = { id: "bob" }; s.sessions.token = { userId: "alice", expiresAt: clock + 86400000 }; s.classmates.chat = { id: "chat", userIds: ["alice", "bob"] }; });
  const keys = webpush.generateVAPIDKeys(), curve = crypto.createECDH("prime256v1"); curve.generateKeys();
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/classmate", keys: { p256dh: curve.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } };
  const auth = { user: { id: "alice" }, tokenHash: "token" }, deliveries = [];
  const options = { db, now: () => clock, env: { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: "mailto:test@example.test" }, listSchedule: async () => { schedules++; return []; }, send: async (subscription, payload, options) => { if (failure) throw Object.assign(new Error("provider unavailable"), { statusCode: 503 }); deliveries.push({ subscription, data: JSON.parse(payload), options }); } };
  const service = createPushService(options);
  const enable = (flags = {}) => service.subscribe(auth, { subscription: sub, scheduleEnabled: false, messagesEnabled: true, ...flags });
  const message = async (id, extra = {}) => db.local.write((s) => { s.directMessages[id] = { id, chatId: "chat", senderId: "bob", content: "Private message text", createdAt: new Date(clock).toISOString(), ...extra }; });
  return { db, service, options, sub, auth, enable, message, deliveries, schedules: () => schedules, advance: (ms) => clock += ms, now: () => clock, fail: (value) => failure = value };
}

test("classmate messages require explicit device opt-in; schedule-only subscriptions retain legacy defaults", async (t) => {
  const f = await fixture(t); await f.service.subscribe(f.auth, { subscription: f.sub });
  await f.message("one"); f.advance(4000); await f.service.tick(); assert.equal(f.deliveries.length, 0); assert.equal(f.schedules(), 1);
  assert.equal((await f.service.status(f.auth, f.sub.endpoint)).messagesEnabled, false);
  await f.enable(); await f.service.tick(); assert.equal(f.deliveries.length, 0, "existing unread messages predate opt-in");
  f.advance(1); await f.message("two"); f.advance(4000); await f.service.tick(); assert.equal(f.deliveries.length, 1);
  assert.equal(f.schedules(), 1, "message-only devices do not read schedules");
  assert.equal(f.deliveries[0].data.type, "classmate-message"); assert.equal(f.deliveries[0].data.url, "/app?page=classmates&classmateChat=chat");
  assert.doesNotMatch(JSON.stringify(f.deliveries[0].data), /Private message text|bob|attachment/);
  await assert.rejects(f.enable({ scheduleEnabled: false, messagesEnabled: false }), { statusCode: 400 });
  await assert.rejects(f.enable({ messagesEnabled: "true" }), { statusCode: 400 });
});

test("read, own, old and removed-relationship messages do not notify; the grace period permits visible-chat acknowledgement", async (t) => {
  const f = await fixture(t); await f.enable();
  await f.message("visible"); await f.service.tick(); assert.equal(f.deliveries.length, 0);
  await f.db.local.write((s) => { s.directMessages.visible.readAt = new Date(f.now()).toISOString(); });
  await f.message("own", { senderId: "alice" }); await f.message("old", { createdAt: new Date(f.now() - 600000).toISOString() });
  await f.message("foreign", { chatId: "private" }); f.advance(4000); await f.service.tick(); assert.equal(f.deliveries.length, 0);
  await f.message("removed"); await f.db.local.write((s) => { delete s.classmates.chat; }); f.advance(4000); await f.service.tick(); assert.equal(f.deliveries.length, 0);
});

test("bursts coalesce per conversation and durable watermarks avoid resurfacing earlier unread messages", async (t) => {
  const f = await fixture(t); await f.enable();
  await f.message("early"); f.advance(1); await f.message("latest", { attachments: [{ name: "private.pdf" }] }); f.advance(4000);
  await Promise.all([f.service.tick(), createPushService(f.options).tick()]); assert.equal(f.deliveries.length, 1);
  await f.db.local.write((s) => { s.directMessages.latest.readAt = new Date(f.now()).toISOString(); });
  await f.service.tick(); assert.equal(f.deliveries.length, 1, "earlier unread message must not resurface");
  const restarted = Object.create(StudyBridgeDatabase.prototype); restarted.local = new LocalStore(f.db.local.file); restarted.dynamo = null;
  await createPushService({ ...f.options, db: restarted }).tick(); assert.equal(f.deliveries.length, 1);
  await f.message("next"); f.advance(4000); await f.service.tick(); assert.equal(f.deliveries.length, 2);
  assert.equal(f.deliveries[0].data.tag, f.deliveries[1].data.tag);
});

test("a read or permission change between lookup and send is rechecked; expired sessions stop message delivery", async (t) => {
  const f = await fixture(t); await f.enable(); await f.message("incoming"); f.advance(4000);
  const original = f.db.listPushMessages.bind(f.db);
  f.db.listPushMessages = async (...args) => { const result = await original(...args); await f.db.local.write((s) => { s.directMessages.incoming.readAt = new Date(f.now()).toISOString(); }); return result; };
  await f.service.tick(); assert.equal(f.deliveries.length, 0);
  f.db.listPushMessages = original; await f.message("later"); f.advance(4000); await f.db.deleteSession("token"); await f.service.tick(); assert.equal(f.deliveries.length, 0);
});

test("failed message deliveries retry without blocking message persistence and opt-out stops further attempts", async (t) => {
  const f = await fixture(t); await f.enable(); await f.message("incoming"); f.advance(4000); f.fail(true);
  await f.service.tick(); assert.equal(f.deliveries.length, 0); assert.ok(await f.db.getDirectMessage("chat", "incoming"));
  f.fail(false); f.advance(60000); await f.service.tick(); assert.equal(f.deliveries.length, 1);
  await f.enable({ scheduleEnabled: true, messagesEnabled: false }); await f.message("disabled"); f.advance(4000); await f.service.tick(); assert.equal(f.deliveries.length, 1);
});

test("Dynamo recent metadata lookup pages past outgoing/read messages and stops before old history", async () => {
  const db = Object.create(StudyBridgeDatabase.prototype); db.listClassmates = async () => [{ id: "chat" }, { id: "older" }];
  const calls = []; db.dynamo = { async queryPage(pk, options) {
    calls.push({ pk, ...options });
    if (pk === "DM#older") return { rows: [{ id: "old", createdAt: "2026-01-01T00:00:00Z", senderId: "bob" }], cursor: "must-not-follow" };
    if (!options.cursor) return { rows: [{ id: "own", createdAt: "2026-11-05T12:01:00Z", senderId: "alice" }], cursor: "next" };
    return { rows: [{ id: "incoming", createdAt: "2026-11-05T12:00:00Z", senderId: "bob", content: "Do not return text", attachments: ["private"] }], cursor: "unused" };
  } };
  assert.deepEqual(await db.listPushMessages("alice", Date.parse("2026-11-05T11:59:00Z")), [{ id: "incoming", chatId: "chat", createdAt: "2026-11-05T12:00:00Z" }]);
  assert.equal(calls.length, 3); assert.ok(calls.every((call) => call.prefix === "MSG#" && call.limit === 25));
});

test("Dynamo send-time checks use the canonical read marker instead of the stale message index", async () => {
  const db = Object.create(StudyBridgeDatabase.prototype); let observed;
  db.dynamo = { get: async (...args) => { observed = args; return { id: "incoming", readAt: "2026-11-05T12:00:05Z" }; } };
  const item = { id: "incoming", createdAt: "2026-11-05T12:00:00Z" };
  assert.ok((await db.getPushMessage("chat", item)).readAt);
  assert.deepEqual(observed, ["DM#chat", "MSG#2026-11-05T12:00:00Z#incoming", { consistent: true }]);
});
