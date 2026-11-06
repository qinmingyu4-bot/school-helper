const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");
const { hashPassword } = require("../lib/security");

test("HTTP sign-in failure protection preserves valid sessions and independent users", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-login-http-"));
  const file = path.join(directory, "db.json"), password = "Existing-Password-2026!";
  const passwordHash = await hashPassword(password), users = {}, emailIndex = {};
  for (const id of ["owner", "other", "burst", "reset", "database", "hash", "session", "google"]) {
    const email = `${id}@example.test`;
    users[id] = { id, email, name: id, passwordHash: id === "google" ? "" : passwordHash, role: "student", profile: { sbId: id } };
    emailIndex[email] = id;
  }
  await fs.writeFile(file, JSON.stringify({ users, emailIndex, sessions: {}, courses: {}, documents: {}, messages: {} }));
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/login-failures.js", "server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: file,
      LOCAL_DB_BACKUP_DISABLED: "true", SESSION_SECRET: "isolated-login-rate-limit-test", OPENAI_API_KEY: "",
      APP_BASE_URL: "http://localhost", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    if (child.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Login test server startup timed out")), 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Login test server exited ${code}`)); });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.stderr.on("data", () => {});
  });
  const login = (email, value = password, address = "192.0.2.1", headers = {}) => fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": address, ...headers },
    body: JSON.stringify({ email, password: value })
  });
  const initial = await login("owner@example.test"); assert.equal(initial.status, 200);
  const cookie = initial.headers.getSetCookie().find((value) => value.startsWith("sb_session="))?.split(";")[0];
  assert.ok(cookie);

  await t.test("ten wrong credentials throttle only that pair, with no cookie or cacheable response", async () => {
    for (let i = 0; i < 10; i++) assert.equal((await login("OWNER@example.test ", "wrong")).status, 401);
    const blocked = await login("owner@example.test");
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0 && Number(blocked.headers.get("retry-after")) <= 900);
    assert.equal(blocked.headers.get("set-cookie"), null);
    assert.equal(blocked.headers.get("cache-control"), "private, no-store");
    assert.equal((await login("owner@example.test", password, "::ffff:192.0.2.1", { "x-forwarded-for": "198.51.100.1" })).status, 429);
    assert.equal((await login("other@example.test")).status, 200);
    assert.equal((await login("owner@example.test", password, "192.0.2.2")).status, 200);
    assert.equal((await login("owner@example.test")).status, 429);
    assert.equal((await fetch(`${base}/api/me`, { headers: { cookie } })).status, 200);
  });

  await t.test("parallel guesses cannot bypass the limit and unrelated API work stays available", async () => {
    const replies = await Promise.all(Array.from({ length: 16 }, () => login("burst@example.test", "wrong")));
    assert.equal(replies.filter((reply) => reply.status === 401).length, 10);
    assert.equal(replies.filter((reply) => reply.status === 429).length, 6);
    assert.equal((await login("burst@example.test")).status, 429);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
  });

  await t.test("a successful login clears earlier failures for the same pair", async () => {
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 9; i++) assert.equal((await login("reset@example.test", "wrong")).status, 401);
      assert.equal((await login("reset@example.test")).status, 200);
    }
  });

  await t.test("unknown and passwordless accounts have the same error and limit policy", async () => {
    for (const email of ["missing@example.test", "google@example.test"]) {
      for (let i = 0; i < 10; i++) {
        const reply = await login(email, { malformed: true });
        assert.equal(reply.status, 401); assert.equal((await reply.json()).error, "Email or password is incorrect.");
      }
      assert.equal((await login(email)).status, 429);
    }
  });

  await t.test("database, hashing and session outages release attempts without locking out good credentials", async () => {
    for (const id of ["database", "hash", "session"]) {
      for (let i = 0; i < 12; i++) assert.equal((await login(`${id}@example.test`, id === "hash" ? "simulate-hash-overload" : password)).status, 503);
      assert.equal((await login(`${id}@example.test`)).status, 200);
    }
  });

  await t.test("oversized and malformed login payloads fail without consuming a password attempt", async () => {
    assert.equal((await login("other@example.test", "x".repeat(17000))).status, 413);
    const malformed = await fetch(`${base}/api/auth/login`, { method: "POST", body: "null", headers: { "content-type": "application/json" } });
    assert.equal(malformed.status, 400);
    assert.equal((await login({ toString: null })).status, 401);
    assert.equal((await login("other@example.test")).status, 200);
  });
});
