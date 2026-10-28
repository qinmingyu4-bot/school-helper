const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");

for (const mode of ["local", "dynamodb"]) {
  test(`${mode} password updates are atomic, preserve account fields, and reject stale concurrent writes`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-password-store-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const db = new StudyBridgeDatabase();
    db.local.file = path.join(directory, "db.json");
    db.dynamo = mode === "dynamodb" ? memoryDynamo().store : null;
    const original = { id: "owner", email: "owner@example.test", name: "Owner", passwordHash: "old-hash", googleSub: "google-sub",
      profile: { sbId: "Owner", school: "Kept school" }, preferences: { customInstruction: "Kept preference" }, legacyField: { keep: true } };
    if (db.dynamo) await db.dynamo.put("USER#owner", "PROFILE", "user", original);
    else await db.createUser(original);
    await db.setUserAppearance("owner", { theme: "graphite", mode: "dark" });
    await Promise.all([db.updateUser("owner", { name: "Updated name" }), db.updatePassword("owner", "old-hash", "new-hash")]);
    const saved = await db.getUser("owner");
    assert.equal(saved.name, "Updated name");
    assert.equal(saved.googleSub, "google-sub");
    assert.deepEqual(saved.profile, original.profile);
    assert.deepEqual(saved.preferences, original.preferences);
    assert.deepEqual(saved.legacyField, original.legacyField);
    assert.deepEqual(await db.getUserAppearance("owner"), { theme: "graphite", mode: "dark" });
    assert.equal(saved.passwordVersion, 1);
    const writes = await Promise.allSettled([db.updatePassword("owner", "new-hash", "first-winner"), db.updatePassword("owner", "new-hash", "second-winner")]);
    assert.equal(writes.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(writes.find((item) => item.status === "rejected").reason.statusCode, 409);
    assert.equal((await db.getUser("owner")).passwordVersion, 2);
    await assert.rejects(db.updatePassword("owner", "old-hash", "stale-overwrite"), { statusCode: 409 });
    assert.equal((await db.getUser("owner")).passwordVersion, 2);
    if (mode === "local") {
      const before = await fs.readFile(db.local.file, "utf8");
      const current = await db.getUser("owner");
      db.local.save = async () => { throw new Error("disk full"); };
      await assert.rejects(db.updatePassword("owner", current.passwordHash, "failed-hash"), /disk full/);
      assert.equal((await db.getUser("owner")).passwordHash, current.passwordHash);
      assert.equal(await fs.readFile(db.local.file, "utf8"), before);
    }
  });
}

test("account security: Google-first setup and password changes retain one account and both sign-in methods", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-password-http-"));
  const secret = "isolated-account-security-session";
  const legacyToken = "fixture-only-old-google-session";
  const legacyHash = crypto.createHmac("sha256", secret).update(legacyToken).digest("hex");
  const file = path.join(directory, "db.json");
  await fs.writeFile(file, JSON.stringify({ courses: {}, documents: {}, messages: {}, users: { legacy: { id: "legacy", name: "Legacy Google", email: "legacy@example.test", googleSub: "legacy-sub", passwordHash: "", profile: { sbId: "Legacy" } } }, emailIndex: { "legacy@example.test": "legacy" }, sessions: {
    [legacyHash]: { tokenHash: legacyHash, userId: "legacy", authMethod: "google", createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(), expiresAt: Date.now() + 3600000 }
  } }));
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/google-login-transport.js", "server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: file,
      LOCAL_DB_BACKUP_DISABLED: "true", REQUIRE_INVITE_CODE: "false", REQUIRE_EMAIL_VERIFICATION: "false", ADMIN_EMAILS: "admin@example.test",
      SESSION_SECRET: secret, APP_BASE_URL: "http://localhost", GOOGLE_CLIENT_ID: "fixture-client", GOOGLE_CLIENT_SECRET: "fixture-secret",
      GOOGLE_REDIRECT_URI: "http://localhost/api/auth/google/callback", OPENAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    if (child.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Account security test server startup timed out")), 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Test server exited ${code}`)); });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  const cookieFrom = (response) => response.headers.getSetCookie().find((value) => value.startsWith("sb_session="))?.split(";")[0];
  async function request(route, cookie = "", body, headers = {}) {
    const response = await fetch(base + route, { redirect: "manual", method: body === undefined ? "GET" : "POST",
      headers: { cookie, "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data, response, cookie: cookieFrom(response) };
  }
  async function google(mode = "login") {
    const started = await request(`/api/auth/google/start?mode=${mode}`);
    const state = new URL(started.response.headers.get("location")).searchParams.get("state");
    const callback = await request(`/api/auth/google/callback?code=good&state=${encodeURIComponent(state)}`, started.response.headers.get("set-cookie").split(";")[0]);
    assert.equal(new URL(callback.response.headers.get("location")).searchParams.get("googleAuth"), "ok");
    return callback.cookie;
  }
  const passwordValues = (userId, password, currentPassword = "") => ({ userId, currentPassword, password, passwordConfirm: password });
  const securityFor = async (cookie) => (await request("/api/me/security", cookie)).data.security;
  const save = (cookie, security, values, headers = {}) => request("/api/me/password", cookie, values, { "x-csrf-token": security.csrfToken, ...headers });

  await t.test("anonymous and expired Google proof cannot set a password", async () => {
    assert.equal((await request("/api/me/security")).status, 401);
    assert.equal((await request("/api/me/password", "", {})).status, 401);
    const cookie = `sb_session=${legacyToken}`, security = await securityFor(cookie);
    assert.equal(security.needsGoogleReauth, true);
    const result = await save(cookie, security, passwordValues("legacy", "Valid-New-Password"));
    assert.equal(result.status, 409);
    assert.equal(result.data.code, "GOOGLE_REAUTH_REQUIRED");
  });
  let cookie = await google("register");
  const original = (await request("/api/me", cookie)).data.user;
  const sbId = original.profile.sbId;
  assert.equal((await request("/api/courses", cookie, { name: "Retained Google course", term: "Fall 2026" })).status, 201);
  let security = await securityFor(cookie);
  const initialPassword = "Google-First-Password-2026!", changedPassword = "Changed-Password-2026!";
  await t.test("new Google account has no password; CSRF, wrong account and invalid values cannot add one", async () => {
    assert.equal(security.hasPassword, false);
    assert.equal(security.googleLinked, true);
    assert.equal(security.needsGoogleReauth, false);
    assert.equal((await request("/api/auth/login", "", { email: original.email, password: "not-the-google-password" })).status, 401);
    for (const token of ["", "a".repeat(64), "é".repeat(64)]) {
      assert.equal((await save(cookie, security, passwordValues(original.id, initialPassword), { "x-csrf-token": token })).status, 403);
    }
    assert.equal((await save(cookie, security, passwordValues(original.id, initialPassword), { "content-type": "text/plain" })).status, 403);
    assert.equal((await save(cookie, security, passwordValues("legacy", initialPassword))).status, 409);
    for (const password of ["short", "x".repeat(129)]) assert.equal((await save(cookie, security, passwordValues(original.id, password))).status, 400);
    assert.equal((await save(cookie, security, { ...passwordValues(original.id, initialPassword), passwordConfirm: "mismatched" })).status, 400);
    assert.equal((await securityFor(cookie)).hasPassword, false);
  });
  const oldGoogleCookie = cookie;
  await t.test("first password rotates the session, stores only a hash and retains existing data", async () => {
    const result = await save(cookie, security, passwordValues(original.id, initialPassword));
    assert.equal(result.status, 200);
    cookie = result.cookie; security = result.data.security;
    assert.ok(cookie && cookie !== oldGoogleCookie);
    assert.equal(security.hasPassword, true);
    assert.equal((await request("/api/me", oldGoogleCookie)).status, 401);
    assert.equal((await request("/api/me", cookie)).data.user.id, original.id);
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    assert.ok(saved.users[original.id].passwordHash.includes(":"));
    assert.ok(!JSON.stringify(saved).includes(initialPassword));
    assert.ok(!JSON.stringify(result.data).includes("passwordHash"));
    assert.equal(saved.users[original.id].googleSub, "fixture-sub");
  });
  let passwordCookie;
  await t.test("email/password and Google both return the same original account", async () => {
    const result = await request("/api/auth/login", "", { email: original.email, password: initialPassword });
    assert.equal(result.status, 200); passwordCookie = result.cookie;
    assert.equal(result.data.user.id, original.id);
    assert.equal(result.data.user.profile.sbId, sbId);
    const googleCookie = await google();
    assert.equal((await request("/api/me", googleCookie)).data.user.id, original.id);
    assert.ok((await request("/api/courses", googleCookie)).data.courses.some((course) => course.name === "Retained Google course"));
  });
  const oldPasswordCookie = passwordCookie;
  await t.test("changing requires the current password even from a Google session", async () => {
    for (const current of ["", "wrong-current"]) assert.equal((await save(cookie, security, passwordValues(original.id, changedPassword, current))).status, 400);
    assert.equal((await save(cookie, security, passwordValues(original.id, initialPassword, initialPassword))).status, 400);
    const result = await save(cookie, security, passwordValues(original.id, changedPassword, initialPassword));
    assert.equal(result.status, 200); cookie = result.cookie; security = result.data.security;
    assert.equal((await request("/api/me", oldPasswordCookie)).status, 401);
    assert.equal((await request("/api/auth/login", "", { email: original.email, password: initialPassword })).status, 401);
    const login = await request("/api/auth/login", "", { email: original.email, password: changedPassword });
    assert.equal(login.status, 200); assert.equal(login.data.user.id, original.id);
    assert.equal((await request("/api/me", await google())).data.user.id, original.id);
  });
  await t.test("repeated current-password guessing is throttled per account", async () => {
    for (let index = 0; index < 5; index++) assert.equal((await save(cookie, security, passwordValues(original.id, initialPassword, "incorrect"))).status, 400);
    assert.equal((await save(cookie, security, passwordValues(original.id, initialPassword, changedPassword))).status, 429);
  });
  await t.test("existing email accounts use change-password mode and manual recovery still invalidates old sessions", async () => {
    const initial = "Email-Password-2026!", updated = "Email-Updated-2026!";
    const admin = await request("/api/auth/register", "", { name: "Admin", email: "admin@example.test", password: initial, passwordConfirm: initial });
    const user = admin.data.user;
    const status = await securityFor(admin.cookie);
    assert.equal(status.hasPassword, true); assert.equal(status.googleLinked, false);
    const changed = await save(admin.cookie, status, passwordValues(user.id, updated, initial));
    assert.equal(changed.status, 200);
    assert.equal((await request("/api/auth/login", "", { email: user.email, password: updated })).status, 200);
    const peer = await request("/api/auth/register", "", { name: "Peer", email: "peer@example.test", password: initial, passwordConfirm: initial });
    await request("/api/auth/request-manual-reset", "", { email: peer.data.user.email });
    const overview = (await request("/api/admin/overview", changed.cookie)).data;
    const reset = overview.resetRequests.find((record) => record.email === peer.data.user.email);
    assert.ok(reset);
    const recovered = await request(`/api/admin/password-resets/${reset.id}`, changed.cookie, {});
    assert.equal(recovered.status, 200);
    assert.equal((await request("/api/me", peer.cookie)).status, 401);
    assert.equal((await request("/api/auth/login", "", { email: peer.data.user.email, password: recovered.data.temporaryPassword })).status, 200);
  });
});
