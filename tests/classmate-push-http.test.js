const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const crypto = require("node:crypto");
const webpush = require("web-push");

test("actual HTTP messages notify a subscribed recipient without any open page, deduplicate retries and skip read messages", { timeout: 30000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-classmate-push-http-")), keys = webpush.generateVAPIDKeys(), file = path.join(dir, "delivery.jsonl");
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/push-transport.js", "server.js"], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, NODE_ENV: "test", PORT: "0", APP_BASE_URL: "http://localhost", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: path.join(dir, "db.json"), LOCAL_DB_BACKUP_DISABLED: "true", REQUIRE_EMAIL_VERIFICATION: "false", SESSION_SECRET: "isolated-classmate-push", MAILBOX_SYNC_DISABLED: "true", WEB_PUSH_WORKER_DISABLED: "false", PUSH_FIXTURE_FAST: "true", PUSH_FIXTURE_FILE: file, WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: "mailto:push@example.test" }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; child.stderr.on("data", (chunk) => stderr += chunk);
  t.after(async () => { if (child.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; } await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { let output = ""; const timer = setTimeout(() => reject(new Error(stderr || "Startup timeout")), 10000); child.on("error", (error) => { clearTimeout(timer); reject(error); }); child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } }); });
  const request = async (route, account, body, method = body ? "POST" : "GET", headers = {}) => {
    const response = await fetch(base + route, { method, headers: { "content-type": "application/json", cookie: account?.cookie || "", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
  };
  const register = async (name) => {
    const response = await fetch(base + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email: `${name}@example.test`, password: "ClassmatePush2026!", passwordConfirm: "ClassmatePush2026!" }) });
    assert.equal(response.status, 201); return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
  };
  const alice = await register("alice"), bob = await register("bob");
  const pending = await request("/api/classmates", alice, { sbId: bob.user.profile.sbId });
  await request(`/api/classmate-requests/${pending.request.id}`, bob, { action: "accept" }, "PATCH");
  const chat = (await request("/api/classmates", alice)).classmates[0];
  const initial = await request("/api/push", alice), curve = crypto.createECDH("prime256v1"); curve.generateKeys();
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/background-fixture", keys: { p256dh: curve.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } };
  await request("/api/push", alice, { userId: alice.user.id, subscription, scheduleEnabled: false, messagesEnabled: true }, "POST", { "x-csrf-token": initial.csrfToken });
  const data = await request(`/api/classmates/${chat.id}/messages`, bob, { content: "Private HTTP text", clientId: "same_message_request" });
  await request(`/api/classmates/${chat.id}/messages`, bob, { content: "Private HTTP text", clientId: "same_message_request" });
  const deliveries = async () => { try { return (await fs.readFile(file, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse); } catch (error) { if (error.code === "ENOENT") return []; throw error; } };
  for (let i = 0; i < 100 && !(await deliveries()).length; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  let sent = await deliveries(); assert.equal(sent.length, 1); assert.equal(sent[0].userId, alice.user.id); assert.equal(sent[0].url, `/app?page=classmates&classmateChat=${encodeURIComponent(chat.id)}`); assert.doesNotMatch(JSON.stringify(sent), /Private HTTP text/);
  await request(`/api/classmates/${chat.id}/read`, alice, { messageIds: [data.message.id] });
  const next = await request(`/api/classmates/${chat.id}/messages`, bob, { content: "Already read" });
  await request(`/api/classmates/${chat.id}/read`, alice, { messageIds: [next.message.id] });
  await new Promise((resolve) => setTimeout(resolve, 3400));
  sent = await deliveries(); assert.equal(sent.length, 1);
  const status = await request(`/api/push?endpoint=${encodeURIComponent(subscription.endpoint)}`, alice); assert.equal(status.messagesEnabled, true); assert.equal(status.scheduleEnabled, false);
});
