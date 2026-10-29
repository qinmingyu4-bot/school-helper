const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

test("mailbox HTTP binds both providers in settings, waits for confirmation and enforces session/CSRF/ownership", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mailbox-http-"));
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/mailbox-transport.js", "server.js"], { cwd: path.resolve(__dirname, ".."), env: {
    ...process.env, NODE_ENV: "test", PORT: "0", APP_BASE_URL: "http://localhost", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: path.join(directory, "db.json"), LOCAL_DB_BACKUP_DISABLED: "true",
    REQUIRE_EMAIL_VERIFICATION: "false", SESSION_SECRET: "mailbox-http-secret", OPENAI_API_KEY: "fixture", MAILBOX_SYNC_DISABLED: "true", MAILBOX_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    GMAIL_CLIENT_ID: "gmail-client", GMAIL_CLIENT_SECRET: "gmail-secret", GMAIL_REDIRECT_URI: "http://localhost/api/mailbox/gmail/callback", OUTLOOK_CLIENT_ID: "outlook-client", OUTLOOK_CLIENT_SECRET: "outlook-secret", OUTLOOK_REDIRECT_URI: "http://localhost/api/mailbox/outlook/callback"
  }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; });
  t.after(async () => { if (child.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; } await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = ""; const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${stderr}`)), 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
  });
  const request = (route, cookie = "", options = {}) => fetch(base + route, { redirect: "manual", ...options, headers: { "content-type": "application/json", cookie, ...options.headers } });
  const register = async (name) => {
    const response = await request("/api/auth/register", "", { method: "POST", body: JSON.stringify({ email: `${name}@example.test`, name, password: "MailboxTest2026!", passwordConfirm: "MailboxTest2026!" }) });
    assert.equal(response.status, 201); return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
  };
  assert.equal((await request("/api/mailbox")).status, 401);
  const alice = await register("Alice"), bob = await register("Bob");
  const initial = await (await request("/api/mailbox", alice.cookie)).json();
  assert.equal(initial.connections.length, 2); assert.equal(initial.connections.every((row) => row.configured && !row.connected), true);
  const mutate = (route, body, csrf = initial.csrfToken, cookie = alice.cookie) => request(route, cookie, { method: "POST", headers: { "x-csrf-token": csrf }, body: JSON.stringify({ userId: alice.user.id, ...body }) });
  assert.equal((await mutate("/api/mailbox/gmail/start", { consent: true }, "")).status, 403);
  assert.equal((await mutate("/api/mailbox/gmail/start", { consent: false })).status, 400);
  assert.equal((await mutate("/api/mailbox/gmail/start", { consent: true, userId: bob.user.id })).status, 409);
  const stale = await mutate("/api/mailbox/gmail/start", { consent: true, timeZone: "UTC" });
  const staleUrl = new URL((await stale.json()).url), staleCookie = stale.headers.get("set-cookie").split(";")[0];
  await mutate("/api/mailbox/gmail/disconnect", {});
  const cancelled = await request(`/api/mailbox/gmail/callback?code=good&state=${encodeURIComponent(staleUrl.searchParams.get("state"))}`, `${alice.cookie}; ${staleCookie}`);
  assert.match(cancelled.headers.get("location"), /mailbox=failed/, "unlink cancels an authorization already in flight");
  for (const provider of ["gmail", "outlook"]) {
    const started = await mutate(`/api/mailbox/${provider}/start`, { consent: true, timeZone: "America/Toronto" });
    assert.equal(started.status, 200); const url = new URL((await started.json()).url);
    const oauthCookie = started.headers.get("set-cookie").split(";")[0];
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    const stolen = await request(`/api/mailbox/${provider}/callback?code=good&state=${encodeURIComponent(url.searchParams.get("state"))}`, `${bob.cookie}; ${oauthCookie}`);
    assert.match(stolen.headers.get("location"), /mailbox=failed/);
    const response = await request(`/api/mailbox/${provider}/callback?code=good&state=${encodeURIComponent(url.searchParams.get("state"))}`, `${alice.cookie}; ${oauthCookie}`);
    assert.equal(response.status, 302); assert.equal(response.headers.get("location"), "/app?page=email&mailbox=connected");
  }
  let inbox;
  for (let attempt = 0; attempt < 100; attempt++) {
    inbox = await (await request("/api/mailbox", alice.cookie)).json();
    if (inbox.drafts.length === 3 && inbox.connections.every((row) => !row.syncing)) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(inbox.drafts.length, 3, stderr);
  assert.equal(inbox.connections.every((row) => row.connected), true);
  assert.doesNotMatch(JSON.stringify(inbox), /fixture-private|refreshToken|accessToken/);
  assert.equal((await (await request("/api/schedule/items", alice.cookie)).json()).items.length, 0);
  const draft = inbox.drafts.find((row) => row.subject === "STA437 assignment");
  assert.equal(draft.items[0].date, "2026-11-16"); assert.equal(draft.items[0].time, "18:00");
  const route = `/api/mailbox/drafts/${encodeURIComponent(draft.id)}/resolve`;
  const body = { action: "confirm", generation: draft.generation, items: [{ index: 0 }] };
  const bobInbox = await (await request("/api/mailbox", bob.cookie)).json();
  assert.equal((await mutate(route, { ...body, userId: bob.user.id }, bobInbox.csrfToken, bob.cookie)).status, 404);
  const confirmed = await mutate(route, body); assert.equal(confirmed.status, 200); assert.equal((await confirmed.json()).saved, 1);
  assert.equal((await (await mutate(route, body)).json()).saved, 0);
  const incomplete = inbox.drafts.find((row) => row.subject === "MAT135 office hours");
  const incompleteRoute = `/api/mailbox/drafts/${encodeURIComponent(incomplete.id)}/resolve`;
  assert.equal((await mutate(incompleteRoute, { ...body, generation: incomplete.generation })).status, 400);
  const completed = await mutate(incompleteRoute, { ...body, generation: incomplete.generation, items: [{ index: 0, startsAt: "2026-11-15T15:00" }] });
  assert.equal(completed.status, 200); assert.equal((await completed.json()).saved, 1);
  assert.equal((await mutate("/api/mailbox/gmail/disconnect", {})).status, 200);
  const after = await (await request("/api/mailbox", alice.cookie)).json(); assert.equal(after.drafts.length, 1); assert.equal(after.connections[0].connected, false);
  assert.equal((await (await request("/api/schedule/items", alice.cookie)).json()).items.length, 2);
  const privateDb = await fs.readFile(path.join(directory, "db.json"), "utf8"); assert.doesNotMatch(privateDb, /fixture-private-access|fixture-private-refresh/);
});
