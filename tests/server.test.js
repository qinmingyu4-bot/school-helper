const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");
const AdmZip = require("adm-zip");

const root = path.resolve(__dirname, "..");
test("account, course, upload, and persistence health check", { timeout: 40000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-server-"));
  let child;
  let base;
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  t.after(async () => {
    await stop();
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function start() {
    child = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env, PORT: "0", NODE_ENV: "test", STUDYBRIDGE_DB: "local",
        LOCAL_DB_FILE: path.join(directory, "database.json"), LOCAL_DB_BACKUP_DISABLED: "true",
        SESSION_SECRET: "isolated-health-check-session-secret", ADMIN_EMAILS: "admin@example.test",
        OWNER_INVITE_CODE: "health-owner-invite", REQUIRE_INVITE_CODE: "true",
        OPENAI_SIMPLE_MODEL: "gpt-6-luna", OPENAI_COMPLEX_MODEL: "gpt-6.1-sol", OPENAI_SOL_ROUTE_PERCENT: "15",
        REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "", GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: ""
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Server startup timed out")), 10000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) { base = `http://127.0.0.1:${match[1]}`; clearTimeout(timer); resolve(); }
      });
    });
  }
  async function request(route, { method = "GET", body, cookie = "", raw } = {}) {
    const response = await fetch(base + route, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  const registration = (name, email, inviteCode) => ({
    name, email, inviteCode, password: "HealthCheck-Password-123!", passwordConfirm: "HealthCheck-Password-123!"
  });
  await start();

  await t.test("entry, authentication guard, and malformed input", async () => {
    assert.equal((await request("/")).status, 200);
    assert.equal((await request("/app.js")).status, 200);
    assert.equal((await request("/missing.js")).status, 404);
    assert.equal((await request("/api/health")).data.ok, true);
    assert.equal((await request("/api/me")).status, 401);
    assert.equal((await request("/api/auth/login", { method: "POST", raw: "{" })).status, 400);
    assert.equal((await request("/api/auth/login", { method: "POST", raw: "null" })).status, 400);
    assert.equal((await request("/%ZZ")).status, 400);
    assert.equal((await request("/..%2fpublic-private%2fsecret.txt")).status, 403);
    assert.equal((await request("/..%2f.env")).status, 403);
    assert.equal((await request("/api/auth/register", { method: "POST", body: registration("Blocked", "blocked@example.test", "") })).status, 403);
  });

  const admin = await request("/api/auth/register", { method: "POST", body: registration("Admin", "admin@example.test", "health-owner-invite") });
  assert.equal(admin.status, 201);
  assert.equal(admin.data.user.role, "admin");
  await t.test("admin status reports both configured task models", async () => {
    assert.equal((await request("/api/admin/system-status")).status, 401);
    const status = await request("/api/admin/system-status", { cookie: admin.cookie });
    assert.equal(status.status, 200);
    assert.equal(status.data.ai.simpleModel, "gpt-6-luna");
    assert.equal(status.data.ai.complexModel, "gpt-6.1-sol");
    assert.equal(status.data.ai.complexRoutePercent, 15);
    assert.equal(status.data.ai.configured, false);
    assert.equal(status.data.ai.ok, false);
  });
  const invite = await request("/api/admin/invites", { method: "POST", cookie: admin.cookie, body: { label: "Health check", maxUses: 2, role: "student" } });
  assert.equal(invite.status, 201);
  const code = invite.data.invite.code;
  const alice = await request("/api/auth/register", { method: "POST", body: registration("Alice", "alice@example.test", code) });
  const bob = await request("/api/auth/register", { method: "POST", body: registration("Bob", "bob@example.test", code) });
  assert.equal(alice.status, 201);
  assert.equal(bob.status, 201);
  let courseId;

  await t.test("profile uniqueness, role boundary, and exhausted invites", async () => {
    assert.equal((await request("/api/admin/overview", { cookie: alice.cookie })).status, 403);
    assert.equal((await request("/api/auth/register", { method: "POST", body: registration("Extra", "extra@example.test", code) })).status, 403);
    assert.equal((await request("/api/me/profile", { method: "PUT", cookie: alice.cookie, body: { name: "Alice", sbId: "alice", school: "Health University" } })).status, 200);
    assert.equal((await request("/api/me/profile", { method: "PUT", cookie: bob.cookie, body: { name: "Bob", sbId: "ALICE" } })).status, 409);
    assert.equal((await request("/api/me/profile", { method: "PUT", cookie: bob.cookie, body: { name: "Bob", sbId: "bob", school: "Health University" } })).status, 200);
  });

  await t.test("course isolation and document extraction", async () => {
    const course = await request("/api/courses", { method: "POST", cookie: alice.cookie, body: { name: "Calculus" } });
    assert.equal(course.status, 201);
    courseId = course.data.course.id;
    assert.equal((await request(`/api/courses/${courseId}/documents`, { cookie: bob.cookie })).status, 404);
    for (const [extension, entry, xml, expected] of [
      ["docx", "word/document.xml", "<w:document><w:p><w:t>Health check document</w:t></w:p></w:document>", "Health check document"],
      ["pptx", "ppt/slides/slide1.xml", "<p:sld><a:p><a:t>Health check slide</a:t></a:p></p:sld>", "Health check slide"],
      ["xlsx", "xl/worksheets/sheet1.xml", "<worksheet><row><c><v>12345</v></c></row></worksheet>", "12345"],
      ["txt", "", "Health check plain text", "Health check plain text"]
    ]) {
      const zip = new AdmZip();
      if (entry) zip.addFile(entry, Buffer.from(xml));
      const buffer = entry ? zip.toBuffer() : Buffer.from(xml);
      const uploaded = await request(`/api/courses/${courseId}/documents`, {
        method: "POST", cookie: alice.cookie,
        body: { name: `health.${extension}`, dataUrl: buffer.toString("base64") }
      });
      assert.equal(uploaded.status, 201);
      assert.ok(uploaded.data.document.text.includes(expected));
    }
    const fileOnly = await request(`/api/courses/${courseId}/documents`, {
      method: "POST", cookie: alice.cookie, body: { name: "image.png", type: "image/png", dataUrl: "aGVhbHRo" }
    });
    assert.equal(fileOnly.status, 201);
    assert.ok(fileOnly.data.document.text.includes("Uploaded file"));
    assert.equal((await request(`/api/courses/${courseId}/documents`, { cookie: alice.cookie })).data.documents.length, 5);
  });

  await t.test("community and accepted classmate messaging", async () => {
    const post = await request("/api/community/posts", {
      method: "POST", cookie: alice.cookie, body: { channel: "all", content: "Health check community post" }
    });
    assert.equal(post.status, 201);
    const feed = await request("/api/community?channel=all", { cookie: bob.cookie });
    assert.ok(feed.data.posts.some((item) => item.id === post.data.post.id));
    const pending = await request("/api/classmates", { method: "POST", cookie: alice.cookie, body: { sbId: "bob" } });
    assert.equal(pending.status, 201);
    assert.equal(pending.data.status, "pending");
    const accepted = await request(`/api/classmate-requests/${pending.data.request.id}`, {
      method: "PATCH", cookie: bob.cookie, body: { action: "accept" }
    });
    assert.equal(accepted.status, 200);
    const route = `/api/classmates/${accepted.data.classmate.id}/messages`;
    assert.equal((await request(route, { cookie: admin.cookie })).status, 404);
    assert.equal((await request(route, { method: "POST", cookie: alice.cookie, body: { content: "Hello Bob" } })).status, 201);
    assert.equal((await request(route, { cookie: bob.cookie })).data.messages.at(-1).content, "Hello Bob");
  });

  await t.test("AI fallback and persistence across restart", async () => {
    const chat = await request(`/api/courses/${courseId}/chat`, { method: "POST", cookie: alice.cookie, body: { message: "Explain calculus" } });
    assert.equal(chat.status, 201);
    assert.equal(chat.data.messages.length, 2);
    await stop();
    await start();
    assert.equal((await request("/api/me", { cookie: alice.cookie })).data.user.email, "alice@example.test");
    assert.equal((await request(`/api/courses/${courseId}/documents`, { cookie: alice.cookie })).data.documents.length, 5);
    assert.equal((await request(`/api/courses/${courseId}/messages`, { cookie: alice.cookie })).data.messages.length, 2);
    assert.equal((await request("/api/auth/logout", { method: "POST", cookie: alice.cookie })).status, 200);
    assert.equal((await request("/api/me", { cookie: alice.cookie })).status, 401);
    const login = await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } });
    assert.equal(login.status, 200);
  });
});
