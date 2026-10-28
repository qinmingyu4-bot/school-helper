const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");

test("homepage, authenticated entry, legacy bookmarks and OAuth use distinct page paths", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-page-entry-"));
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/google-auth.js", "server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local",
      LOCAL_DB_FILE: path.join(directory, "database.json"), LOCAL_DB_BACKUP_DISABLED: "true",
      REQUIRE_INVITE_CODE: "false", REQUIRE_EMAIL_VERIFICATION: "false", ADMIN_EMAILS: "",
      SESSION_SECRET: "isolated-page-entry-test-secret", APP_BASE_URL: "http://localhost",
      GOOGLE_CLIENT_ID: "page-entry-test-client", GOOGLE_CLIENT_SECRET: "page-entry-test-secret",
      GOOGLE_REDIRECT_URI: "http://localhost/api/auth/google/callback", OPENAI_API_KEY: "",
      SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    if (child.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Page-entry server startup timed out")), 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Page-entry server exited ${code}`)); });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  const request = (route, cookie = "", options = {}) => fetch(base + route, { redirect: "manual", ...options, headers: { cookie, "content-type": "application/json", ...options.headers } });
  async function redirect(route, destination, cookie = "") {
    const response = await request(route, cookie);
    assert.equal(response.status, 302, route);
    assert.equal(response.headers.get("location"), destination, route);
    assert.equal(response.headers.get("cache-control"), "no-store", route);
    await response.text();
  }

  await t.test("public homepage renders separately and every entry works without JavaScript", async () => {
    const response = await request("/");
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /连接学习的每一步/);
    assert.match(html, /进入 StudyBridge/);
    assert.doesNotMatch(html, /<script|id="root"/);
    assert.ok([...html.matchAll(/class="[^"]*button[^"\n]*" href="([^"]+)"/g)].every((match) => match[1] === "/app"));
    for (const file of ["landing.css", "typography.css"]) assert.equal((await request(`/${file}`)).status, 200);
    const login = await request("/login");
    assert.equal(login.status, 200);
    assert.match(await login.text(), /id="root"/);
    assert.equal((await request("/api/me")).status, 401);
    await redirect("/app", "/login");
    await redirect("/app?page=schedule", "/login?page=schedule");
    await redirect("/app", "/login", "sb_session=invalid-session");
  });

  await t.test("old root bookmarks and trailing slashes retain destination queries", async () => {
    await redirect("/?page=schedule&v=old", "/app?page=schedule&v=old");
    await redirect("/index.html?page=study", "/app?page=study");
    await redirect("/app/?page=tools", "/app?page=tools");
    await redirect("/login/?page=profile", "/login?page=profile");
    await redirect("/?authError=Please+try+again", "/login?authError=Please+try+again");
    await redirect("/?googleAuth=ok", "/app?googleAuth=ok");
    const followed = await fetch(base + "/?page=schedule");
    assert.equal(new URL(followed.url).pathname, "/login");
    assert.equal(new URL(followed.url).searchParams.get("page"), "schedule");
    assert.equal((await request("/%ZZ")).status, 400);
    assert.equal((await request("/..%2f.env")).status, 403);
    assert.equal((await request("/missing.js")).status, 404);
  });

  let cookie;
  const credentials = { email: "entry@example.test", name: "Page entry", password: "Page-Entry-Test-2026!", passwordConfirm: "Page-Entry-Test-2026!" };
  await t.test("registration and login sessions enter the app while homepage remains public", async () => {
    const registration = await request("/api/auth/register", "", { method: "POST", body: JSON.stringify(credentials) });
    assert.equal(registration.status, 201);
    cookie = registration.headers.get("set-cookie").split(";")[0];
    assert.match(registration.headers.get("set-cookie"), /Path=\//);
    const app = await request("/app?page=study", cookie);
    assert.equal(app.status, 200);
    assert.match(await app.text(), /id="root"/);
    await redirect("/login", "/app", cookie);
    await redirect("/login?page=schedule", "/app?page=schedule", cookie);
    const homepage = await request("/", cookie);
    assert.equal(homepage.status, 200);
    assert.match(await homepage.text(), /连接学习的每一步/);
    assert.equal((await request("/api/auth/logout", cookie, { method: "POST" })).status, 200);
    await redirect("/app", "/login", cookie);
    assert.equal((await request("/login", cookie)).status, 200);
    const login = await request("/api/auth/login", "", { method: "POST", body: JSON.stringify(credentials) });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal((await request("/app", cookie)).status, 200);
  });

  await t.test("Google success returns to the app and Google failures return to login", async () => {
    const account = await request("/api/auth/register", "", { method: "POST", body: JSON.stringify({ ...credentials, email: "google-entry@example.test" }) });
    assert.equal(account.status, 201);
    const start = await request("/api/auth/google/start");
    const provider = new URL(start.headers.get("location"));
    assert.equal(provider.hostname, "accounts.google.com");
    const oauthCookie = start.headers.getSetCookie().find((value) => value.startsWith("sb_google_oauth=")).split(";")[0];
    const callback = await request(`/api/auth/google/callback?code=fixture&state=${encodeURIComponent(provider.searchParams.get("state"))}`, oauthCookie);
    assert.equal(callback.status, 302);
    const success = new URL(callback.headers.get("location"));
    assert.equal(success.pathname, "/app", success.searchParams.get("authError"));
    assert.equal(success.searchParams.get("googleAuth"), "ok");
    const googleCookie = callback.headers.getSetCookie().find((value) => value.startsWith("sb_session=")).split(";")[0];
    assert.equal((await request("/app", googleCookie)).status, 200);
    const failed = await request("/api/auth/google/callback?error=access_denied");
    assert.equal(failed.status, 302);
    const error = new URL(failed.headers.get("location"));
    assert.equal(error.pathname, "/login");
    assert.ok(error.searchParams.get("authError"));
    assert.equal((await request(error.pathname + error.search)).status, 200);
  });
});
