const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { StudyBridgeDatabase } = require("../lib/database");
const p = require("../lib/mailbox-providers");
const { createMailboxService, analysisMessages, parseAnalysis } = require("../lib/mailbox-service");
const { memoryDynamo } = require("./helpers/community-dynamo");
const env = { NODE_ENV: "test", APP_BASE_URL: "http://localhost", MAILBOX_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"), GMAIL_CLIENT_ID: "gmail-client", GMAIL_CLIENT_SECRET: "gmail-secret", OUTLOOK_CLIENT_ID: "outlook-client", OUTLOOK_CLIENT_SECRET: "outlook-secret", MAILBOX_SYNC_DISABLED: "true" };

test("mailbox OAuth uses read-only scopes, PKCE, encrypted browser state and current session/account binding", () => {
  const auth = { user: { id: "alice" }, tokenHash: "session-a" };
  for (const provider of p.providers) {
    const start = p.startOAuth(provider, auth, "America/Toronto", env, 1000000), url = new URL(start.url);
    const [name, value] = start.cookie.split(";")[0].split("=");
    const cookies = { [name]: value }, state = url.searchParams.get("state");
    const verified = p.verifyOAuth(provider, auth, state, cookies, env, 1000001);
    assert.equal(crypto.createHash("sha256").update(verified.verifier).digest("base64url"), url.searchParams.get("code_challenge"));
    assert.doesNotMatch(url.searchParams.get("scope"), /modify|write|send/i);
    assert.doesNotMatch(start.cookie, /alice|session-a/);
    for (const [who, token, jar, at] of [[auth, "bad-state", cookies, 1000001], [{ ...auth, tokenHash: "session-b" }, state, cookies, 1000001], [{ ...auth, user: { id: "bob" } }, state, cookies, 1000001], [auth, state, cookies, 1600001], [auth, state, {}, 1000001]]) {
      assert.throws(() => p.verifyOAuth(provider, who, token, jar, env, at), /过期|改变/);
    }
  }
  const sealed = p.seal({ refreshToken: "private" }, env);
  assert.equal(p.unseal(sealed, env).refreshToken, "private");
  assert.throws(() => p.unseal(sealed.slice(0, -2) + "AA", env));
  assert.equal(p.configuration("gmail", { ...env, MAILBOX_ENCRYPTION_KEY: "" }).enabled, false);
  assert.equal(p.configuration("gmail", { ...env, NODE_ENV: "production" }).enabled, false);
  assert.match(p.oauthCookie("gmail", "", { ...env, NODE_ENV: "production" }), /^__Host-.*Max-Age=0; Secure$/);
});

test("mail parsing excludes attachments and scripts; model output preserves incomplete times and normalizes full starts", () => {
  const part = { parts: [{ mimeType: "text/plain", body: { data: Buffer.from("Due Friday").toString("base64url") } }, { mimeType: "text/plain", filename: "private.txt", body: { data: Buffer.from("attachment secret").toString("base64url") } }] };
  assert.match(p.mimeText(part), /Due Friday/); assert.doesNotMatch(p.mimeText(part), /secret/);
  assert.doesNotMatch(p.plainHtml("<script>steal()</script><b>Hello</b>"), /steal/);
  assert.equal(p.safeMailLink("https://evil.test/", "outlook"), "");
  assert.equal(parseAnalysis('{"relevant":false,"items":[]}', "UTC"), null);
  const analysis = parseAnalysis(JSON.stringify({ relevant: true, summary: "Study", items: [{ title: "Deadline", kind: "DDL", date: "2026-11-15" }, { title: "Meeting", kind: "EVENT", startsAt: "2026-11-16T18:00" }] }), "America/Toronto");
  assert.equal(analysis.items[0].date, "2026-11-15"); assert.equal(analysis.items[0].time, "");
  assert.equal(analysis.items[1].date, "2026-11-16"); assert.equal(analysis.items[1].time, "18:00");
  assert.throws(() => parseAnalysis('{"relevant":"true","items":[]}', "UTC"));
  assert.match(analysisMessages({ receivedAt: "2026-10-28T12:00:00Z" }, "UTC")[0].content, /UNTRUSTED DATA/);
});

test("Gmail backfill/history and Outlook delta preserve continuation and reject token exfiltration URLs", async () => {
  const calls = [];
  const transport = p.createProviders({ env, request: async (input) => {
    const url = new URL(input); calls.push(url);
    if (url.pathname.endsWith("/profile")) return Response.json({ historyId: "100" });
    if (url.pathname.endsWith("/history")) return Response.json({ history: [{ messagesAdded: [{ message: { id: "new" } }, { message: { id: "new" } }] }], historyId: "110" });
    if (url.pathname.endsWith("/delta")) return Response.json({ value: [{ id: "new" }, { id: "deleted", "@removed": {} }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=ok" });
    return Response.json({ messages: [{ id: "first" }], nextPageToken: url.searchParams.has("pageToken") ? "" : "next" });
  } });
  const base = { provider: "gmail", since: "2026-10-21T00:00:00Z", sync: {} };
  const first = await transport.page(base, "token");
  assert.equal(first.more, true); assert.equal(first.sync.initialHistoryId, "100");
  const last = await transport.page({ ...base, sync: first.sync }, "token"); assert.equal(last.sync.historyId, "100");
  const history = await transport.page({ ...base, sync: last.sync }, "token"); assert.deepEqual(history.ids, ["new"]); assert.equal(history.sync.historyId, "110");
  const outlook = await transport.page({ ...base, provider: "outlook", sync: {} }, "token"); assert.deepEqual(outlook.ids, ["new"]);
  const count = calls.length;
  await assert.rejects(transport.page({ ...base, provider: "outlook", sync: { link: "https://evil.test/v1.0/me/mailFolders/inbox/messages/delta" } }, "secret"), /地址无效/);
  assert.equal(calls.length, count);
});

async function setup(t, dynamo = false) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mailbox-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();
  db.dynamo = dynamo ? memoryDynamo().store : null;
  if (db.dynamo) {
    const call = db.dynamo.call;
    // Legacy course/document queries use DynamoDB's default page size.
    db.dynamo.call = (target, body) => call(target, target === "Query" && !body.Limit ? { ...body, Limit: 100 } : body);
  }
  db.local.file = path.join(directory, "db.json");
  return db;
}
for (const dynamo of [false, true]) test(`mailbox ${dynamo ? "DynamoDB" : "local"}: automatic classification, atomic confirmation, duplicate/ownership and unlink`, async (t) => {
  const db = await setup(t, dynamo), clock = { value: Date.parse("2026-10-28T12:00:00Z") };
  const tokens = { accessToken: "access-private", refreshToken: "refresh-private", expiresAt: clock.value + 3600000 };
  const seen = [];
  const transport = {
    profile: async () => ({ email: "linked@example.test" }), refresh: async () => tokens,
    page: async () => ({ ids: ["study", "advert", "notice", "missing"], sync: { historyId: "2" }, more: false }),
    message: async (_provider, id) => id === "missing" ? null : { id, subject: id, sender: "Professor", receivedAt: "2026-10-28T10:00:00Z", text: id, link: "" }
  };
  const service = createMailboxService({ db, env, transport, now: () => clock.value, analyze: async (messages) => {
    const source = JSON.parse(messages[1].content); seen.push(source.body);
    return JSON.stringify({ relevant: source.body !== "advert", summary: "学习通知", items: source.body === "study" ? [{ kind: "DDL", title: "Assignment", startsAt: "2026-11-16T18:00", evidence: "Due Nov 16" }] : [] });
  } });
  await service.connect("alice", "gmail", tokens, "America/Toronto"); await service.sync("alice", "gmail");
  let status = await service.status("alice");
  assert.equal(status.drafts.length, 2); assert.equal((await db.listCourses("alice")).length, 0);
  assert.doesNotMatch(JSON.stringify(status), /access-private|refresh-private|tokens|lease/);
  assert.equal((await service.status("bob")).drafts.length, 0);
  const draft = status.drafts.find((row) => row.items.length);
  const body = { action: "confirm", generation: draft.generation, items: [{ index: 0, startsAt: "2026-11-16T18:00" }] };
  await assert.rejects(service.resolve("bob", draft.id, body), /不存在/);
  await assert.rejects(service.resolve("alice", draft.id, { ...body, generation: "stale" }), /连接已变更/);
  await assert.rejects(service.resolve("alice", draft.id, { ...body, items: [{ index: 0, startsAt: "" }] }), /补全/);
  const results = await Promise.all([service.resolve("alice", draft.id, body), service.resolve("alice", draft.id, body)]);
  assert.equal(results.reduce((sum, result) => sum + result.saved, 0), 1);
  const courses = await db.listCourses("alice"), docs = await db.listDocuments("alice", courses[0].id);
  assert.equal(docs.length, 1); assert.equal(JSON.parse(docs[0].text).startsAt, "2026-11-16T23:00:00.000Z");
  const notice = status.drafts.find((row) => !row.items.length);
  await service.resolve("alice", notice.id, { action: "dismiss", generation: notice.generation });
  // Resume a durable queue; replaying source IDs retains the already-reviewed draft.
  clock.value += 300001; await service.sync("alice", "gmail");
  assert.equal(seen.filter((id) => id === "study").length, 1);
  assert.equal((await service.status("alice")).drafts.find((row) => row.id === draft.id).status, "confirmed");
  await service.disconnect("alice", "gmail");
  status = await service.status("alice"); assert.equal(status.drafts.length, 0); assert.equal(status.connections[0].connected, false);
  assert.equal((await db.getMailbox("alice", "gmail")).tokens, undefined);
  assert.equal((await db.listDocuments("alice", courses[0].id)).length, 1);
});

test("unlink during AI processing prevents late extracted drafts and stops future sync", async (t) => {
  const db = await setup(t), tokens = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600000 };
  let release, entered;
  const wait = new Promise((resolve) => { release = resolve; }), started = new Promise((resolve) => { entered = resolve; });
  const service = createMailboxService({ db, env, transport: { profile: async () => ({ email: "mail@example.test" }),
    page: async () => ({ ids: ["one"], sync: {}, more: false }), message: async () => ({ text: "academic", receivedAt: new Date().toISOString(), subject: "Study" }) },
    analyze: async () => { entered(); await wait; return '{"relevant":true,"summary":"Study","items":[]}'; } });
  await service.connect("alice", "gmail", tokens, "UTC");
  await started; await service.disconnect("alice", "gmail"); release(); await service.sync("alice", "gmail");
  assert.deepEqual((await service.status("alice")).drafts, []);
});

test("background workers resume durable queues after restart, refresh tokens and coordinate leases across processes", async (t) => {
  const db = await setup(t), clock = { value: Date.now() }, analyzed = [], refreshed = [];
  const tokens = { accessToken: "expired", refreshToken: "refresh", expiresAt: 0 };
  await db.changeMailbox("alice", "outlook", () => ({ userId: "alice", provider: "outlook", active: true, generation: "restart-generation", email: "mail@example.test", timeZone: "UTC",
    tokens: p.seal(tokens, env), since: new Date(clock.value - 86400000).toISOString(), sync: { link: "saved-delta" }, queue: ["one", "two", "three", "four"], more: false, nextSyncAt: 0 }));
  const transport = {
    refresh: async (_provider, token) => { refreshed.push(token); return { accessToken: "renewed", refreshToken: "rotated", expiresAt: clock.value + 3600000 }; },
    page: async () => ({ ids: [], sync: { link: "next-delta" }, more: false }),
    message: async (_provider, id, token) => { assert.equal(token, "renewed"); return { text: id, subject: id, receivedAt: new Date(clock.value).toISOString() }; }
  };
  const options = { db, env, transport, now: () => clock.value, analyze: async (messages) => { const body = JSON.parse(messages[1].content).body; analyzed.push(body); await new Promise((resolve) => setTimeout(resolve, 5)); return '{"relevant":true,"summary":"Study","items":[]}'; } };
  const first = createMailboxService(options), second = createMailboxService(options);
  await Promise.all([first.tick(), second.tick()]);
  assert.deepEqual(analyzed, ["one", "two", "three"]); assert.deepEqual(refreshed, ["refresh"]);
  assert.equal(p.unseal((await db.getMailbox("alice", "outlook")).tokens, env).refreshToken, "rotated");
  clock.value += 16000;
  // A fresh service instance has no browser and no in-memory state.
  const restarted = createMailboxService(options); await restarted.tick();
  assert.deepEqual(analyzed, ["one", "two", "three", "four"]);
  assert.equal((await restarted.status("alice")).drafts.length, 4);
});

test("temporary provider failures back off without consuming queued mail, while revoked consent pauses retries", async (t) => {
  const db = await setup(t), clock = { value: Date.now() };
  const tokens = { accessToken: "valid", refreshToken: "refresh", expiresAt: clock.value + 3600000 };
  await db.changeMailbox("alice", "gmail", () => ({ userId: "alice", provider: "gmail", active: true, generation: "backoff-generation", tokens: p.seal(tokens, env), queue: ["keep"], nextSyncAt: 0 }));
  let calls = 0, revoked = false;
  const service = createMailboxService({ db, env, now: () => clock.value, analyze: async () => { throw new Error("Should not be reached"); },
    transport: { message: async () => { calls++; throw Object.assign(new Error("private-provider-detail"), { providerStatus: revoked ? 403 : 429, retryAfter: 900 }); } } });
  await service.sync("alice", "gmail");
  let row = await db.getMailbox("alice", "gmail"); assert.deepEqual(row.queue, ["keep"]); assert.equal(row.nextSyncAt, clock.value + 900000);
  await service.requestSync("alice", "gmail"); await service.sync("alice", "gmail"); assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(await service.status("alice")), /private-provider-detail/);
  clock.value += 901000; revoked = true; await service.tick();
  row = await db.getMailbox("alice", "gmail"); assert.equal(row.reconnectRequired, true);
  clock.value += 901000; await service.tick(); assert.equal(calls, 2);
  await assert.rejects(service.requestSync("alice", "gmail"), /重新绑定/);
});
