const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");
const { startGoogleOAuth, verifyGoogleOAuth, clearGoogleOAuthCookie } = require("../lib/google-oauth");

test("Google OAuth binds state and PKCE to the initiating browser and enforces expiry", () => {
  const first = startGoogleOAuth({ mode: "login", inviteCode: "", now: 1000000 });
  const second = startGoogleOAuth({ mode: "login", inviteCode: "", now: 1000000 });
  const verified = verifyGoogleOAuth(first.state, first.cookie.split(";")[0], 1000001);
  assert.equal(crypto.createHash("sha256").update(verified.codeVerifier).digest("base64url"), first.codeChallenge);
  assert.ok(!first.state.includes(verified.codeVerifier));
  for (const [state, cookie, now] of [
    [first.state, "", 1000001], [first.state, second.cookie, 1000001],
    [first.state + "corrupt", first.cookie, 1000001], [first.state + ".extra", first.cookie, 1000001],
    [first.state, first.cookie, 1600001], [first.state, first.cookie, 900000],
    [first.state, "sb_google_oauth=%ZZ", 1000001]
  ]) assert.throws(() => verifyGoogleOAuth(state, cookie, now), /invalid or expired/);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const production = startGoogleOAuth({ mode: "register", inviteCode: "test-invite" });
    assert.match(production.cookie, /^__Host-sb_google_oauth=/);
    assert.match(production.cookie, /HttpOnly; SameSite=Lax; Path=\/; Max-Age=600; Secure$/);
    assert.match(clearGoogleOAuthCookie(), /Max-Age=0; Secure$/);
    assert.equal(verifyGoogleOAuth(production.state, production.cookie).inviteCode, "test-invite");
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test("Google login reuses the existing account, preserves course data and rejects unsafe callbacks", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-google-login-test-"));
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/google-login-transport.js", "server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: path.join(directory, "db.json"),
      LOCAL_DB_BACKUP_DISABLED: "true", REQUIRE_INVITE_CODE: "false", REQUIRE_EMAIL_VERIFICATION: "false", ADMIN_EMAILS: "",
      SESSION_SECRET: "isolated-google-login-test-secret", APP_BASE_URL: "http://localhost", GOOGLE_CLIENT_ID: "fixture-client",
      GOOGLE_CLIENT_SECRET: "fixture-secret", GOOGLE_REDIRECT_URI: "http://localhost/api/auth/google/callback",
      OPENAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    if (child.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Google test server startup timed out")), 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Google test server exited ${code}`)); });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  const request = (route, cookie = "", options = {}) => fetch(base + route, { redirect: "manual", ...options,
    headers: { cookie, "content-type": "application/json", ...options.headers } });
  const registered = await request("/api/auth/register", "", { method: "POST", body: JSON.stringify({ email: "google-owner@example.test", name: "Original name", password: "Original-Password-2026!", passwordConfirm: "Original-Password-2026!" }) });
  assert.equal(registered.status, 201);
  const original = (await registered.json()).user;
  const originalCookie = registered.headers.get("set-cookie").split(";")[0];
  const course = await request("/api/courses", originalCookie, { method: "POST", body: JSON.stringify({ name: "Retained math", term: "Fall 2026" }) });
  assert.equal(course.status, 201);

  async function start() {
    const result = await request("/api/auth/google/start");
    const provider = new URL(result.headers.get("location"));
    assert.equal(provider.hostname, "accounts.google.com");
    assert.equal(provider.searchParams.get("scope"), "openid email profile");
    assert.equal(provider.searchParams.get("code_challenge_method"), "S256");
    assert.match(provider.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
    return { state: provider.searchParams.get("state"), cookie: result.headers.get("set-cookie").split(";")[0] };
  }
  async function callback(code, flow, cookie = flow.cookie) {
    return request(`/api/auth/google/callback?code=${code}&state=${encodeURIComponent(flow.state)}`, cookie);
  }
  const flow = await start(), other = await start();
  for (const cookie of ["", other.cookie]) {
    const rejected = await callback("good", flow, cookie);
    assert.equal(new URL(rejected.headers.get("location")).pathname, "/login");
    assert.ok(new URL(rejected.headers.get("location")).searchParams.get("authError"));
    assert.ok(rejected.headers.getSetCookie().every((value) => !value.startsWith("sb_session=")));
  }
  for (const code of ["unverified", "missing-verification", "missing-sub"]) {
    const rejected = await callback(code, await start());
    assert.ok(new URL(rejected.headers.get("location")).searchParams.get("authError"));
    assert.match(rejected.headers.get("set-cookie"), /Max-Age=0/);
  }
  const success = await callback("good", await start());
  assert.equal(new URL(success.headers.get("location")).pathname, "/app");
  assert.equal(new URL(success.headers.get("location")).searchParams.get("googleAuth"), "ok");
  assert.ok(success.headers.getSetCookie().some((value) => value.startsWith("sb_google_oauth=") && value.includes("Max-Age=0")));
  const loginCookie = success.headers.getSetCookie().find((value) => value.startsWith("sb_session=")).split(";")[0];
  const me = (await (await request("/api/me", loginCookie)).json()).user;
  assert.equal(me.id, original.id);
  assert.equal(me.name, "Original name");
  const courses = (await (await request("/api/courses", loginCookie)).json()).courses;
  assert.ok(courses.some((value) => value.name === "Retained math"));
  const mismatch = await callback("different-account", await start());
  assert.match(new URL(mismatch.headers.get("location")).searchParams.get("authError"), /different Google account/);
  const password = await request("/api/auth/login", "", { method: "POST", body: JSON.stringify({ email: "google-owner@example.test", password: "Original-Password-2026!" }) });
  assert.equal(password.status, 200, "Original password login is preserved");
});
