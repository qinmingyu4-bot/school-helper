const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { StudyBridgeDatabase } = require("../lib/database");
const { createAiUsage } = require("../lib/ai-usage");

test("HTTP allowance is private, meters both chat transports, blocks exhausted accounts and retains spending on upgrade/restart", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-usage-http-"));
  const file = path.join(directory, "db.json");
  let child, base;
  async function stop() { if (child && child.exitCode === null) { const exit = once(child, "exit"); child.kill(); await exit; } }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start() {
    child = spawn(process.execPath, ["--require", "./tests/fixtures/echo-ai.js", "server.js"], { cwd: path.resolve(__dirname, ".."), env: {
      ...process.env, PORT: "0", NODE_ENV: "test", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: file, LOCAL_DB_BACKUP_DISABLED: "true",
      REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "test-fixture", OPENAI_WEB_SEARCH: "false", SESSION_SECRET: "usage-test-session"
    }, stdio: ["ignore", "pipe", "pipe"] });
    base = await new Promise((resolve, reject) => {
      let output = "", errors = "";
      const timer = setTimeout(() => reject(new Error(errors || "Server timed out")), 10000);
      child.stderr.on("data", (chunk) => errors += chunk);
      child.once("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
      child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    });
  }
  await start();
  const req = (route, cookie, body, headers = {}) => fetch(base + route, { method: body ? "POST" : "GET", headers: { cookie: cookie || "", "content-type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const register = async (name) => {
    const response = await req("/api/auth/register", "", { name, email: `${name}@example.test`, password: "UsageTest2026!", passwordConfirm: "UsageTest2026!" });
    assert.equal(response.status, 201);
    return { cookie: response.headers.get("set-cookie").split(";")[0], user: (await response.json()).user };
  };
  const alice = await register("alice"), bob = await register("bob");
  assert.equal((await req("/api/me/ai-usage")).status, 401);
  const initial = await req("/api/me/ai-usage", alice.cookie);
  assert.match(initial.headers.get("cache-control"), /private.*no-store/);
  assert.equal((await initial.json()).usage.canUpgrade, false);
  const course = (await (await req("/api/courses", alice.cookie, { name: "Calculus" })).json()).course;
  const chat = `/api/courses/${course.id}/chat`;
  const first = await req(chat, alice.cookie, { message: "Explain derivatives", mode: "guided" });
  assert.equal(first.status, 201);
  const streaming = await req(chat, alice.cookie, { message: "Explain a second example", mode: "guided", stream: true }, { accept: "text/event-stream" });
  assert.match(await streaming.text(), /event: done/);
  const usage = (await (await req("/api/me/ai-usage", alice.cookie)).json()).usage;
  assert.ok(usage.usedUsd > 0); assert.equal(usage.pendingUsd, 0); assert.equal(usage.estimatedUsd, 0);
  // Stop the test server before editing its private fixture database.
  await stop();
  const db = new StudyBridgeDatabase(); db.local.file = file; db.dynamo = null;
  const service = createAiUsage({ db });
  const ticket = await service.reserve(alice.user.id, Math.round((await service.status(alice.user.id)).remainingUsd * 1e6));
  await service.settle(ticket, ticket.amount);
  await start();
  const blocked = await req(chat, alice.cookie, { message: "Explain limits", mode: "guided" });
  assert.equal(blocked.status, 429); assert.match((await blocked.json()).error, /额度/);
  const blockedStream = await req(chat, alice.cookie, { message: "Explain limits", mode: "guided", stream: true }, { accept: "text/event-stream" });
  assert.match(await blockedStream.text(), /本周 AI 额度不足/);
  assert.equal((await (await req("/api/me/ai-usage", bob.cookie)).json()).usage.usedUsd, 0);
  await stop(); await db.setUserMembership(alice.user.id, "plus", "owner", "standard"); await start();
  const upgraded = (await (await req("/api/me/ai-usage", alice.cookie)).json()).usage;
  assert.equal(upgraded.limitUsd, 2); assert.equal(upgraded.usedUsd, 0.5); assert.equal(upgraded.remainingUsd, 1.5);
  assert.equal(upgraded.resetsAt, usage.resetsAt);
  assert.equal((await req(chat, alice.cookie, { message: "Explain limits", mode: "guided" })).status, 201);
});
