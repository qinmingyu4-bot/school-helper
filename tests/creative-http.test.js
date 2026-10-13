const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");

test("creative HTTP jobs, private downloads, revisions, cancellation and video gate", { timeout: 20000 }, async (t) => {
  const root = path.resolve(__dirname, "..");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-creative-http-"));
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/creative-ai.js", "server.js"], {
    cwd: root, env: { ...process.env, PORT: "0", NODE_ENV: "test", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: path.join(directory, "db.json"), LOCAL_DB_BACKUP_DISABLED: "true", OWNER_INVITE_CODE: "creative-owner", REQUIRE_INVITE_CODE: "true", REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "test-only-key", OPENAI_DOCUMENT_MODEL: "test-document-model", STUDYBRIDGE_VIDEO_ENABLED: "false", ADMIN_EMAILS: "owner@example.test", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => { const exited = once(child, "exit"); child.kill(); await exited; await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Startup timed out")), 10000);
    child.on("error", reject);
    child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
  });
  async function request(route, { method = "GET", cookie = "", body } = {}) {
    return fetch(base + route, { method, headers: { cookie, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function json(route, options) { const response = await request(route, options); return { response, data: await response.json() }; }
  async function wait(id, cookie) {
    for (let i = 0; i < 150; i++) { const { data } = await json(`/api/creative/${id}`, { cookie }); if (["ready", "failed", "canceled"].includes(data.job.status)) return data.job; await new Promise((resolve) => setTimeout(resolve, 10)); }
    throw new Error("Job did not settle");
  }
  const registration = (email, inviteCode) => ({ name: email, email, inviteCode, password: "Creative-Test-Password1!", passwordConfirm: "Creative-Test-Password1!" });
  const alice = await request("/api/auth/register", { method: "POST", body: registration("owner@example.test", "creative-owner") });
  const cookie = alice.headers.get("set-cookie").split(";")[0];
  const invitation = await json("/api/admin/invites", { method: "POST", cookie, body: { label: "Bob" } });
  const bob = await request("/api/auth/register", { method: "POST", body: registration("bob@example.test", invitation.data.invite.code) });
  const foreign = bob.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/api/creative")).status, 401);
  assert.equal((await request("/api/creative", { method: "POST", cookie, body: { kind: "video", prompt: "No video calls" } })).status, 403);
  const created = await json("/api/creative", { method: "POST", cookie, body: { kind: "document", format: "pdf", prompt: "Create PDF" } });
  assert.equal(created.response.status, 202);
  const job = await wait(created.data.job.id, cookie);
  assert.equal(job.status, "ready");
  assert.ok(job.files.some((file) => file.extension === "png"));
  assert.equal((await request(`/api/creative/${job.id}`, { cookie: foreign })).status, 404);
  const pdf = job.files.find((file) => file.extension === "pdf");
  const route = `/api/creative/${job.id}/files/${pdf.id}`;
  const download = await request(route, { cookie });
  assert.equal(download.status, 200); assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.match(download.headers.get("content-disposition"), /^attachment;/);
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.ok(Buffer.from(await download.arrayBuffer()).subarray(0, 5).equals(Buffer.from("%PDF-")));
  assert.equal((await request(route)).status, 401);
  assert.equal((await request(route, { cookie: foreign })).status, 404);
  const preview = job.files.find((file) => file.extension === "png");
  const inline = await request(`/api/creative/${job.id}/files/${preview.id}?inline=1`, { cookie });
  assert.equal(inline.headers.get("content-type"), "image/png"); assert.match(inline.headers.get("content-disposition"), /^inline;/);
  const revision = await json("/api/creative", { method: "POST", cookie, body: { kind: "document", format: "pdf", prompt: "Revise", parentId: job.id } });
  assert.equal((await wait(revision.data.job.id, cookie)).status, "ready");
  const slow = await json("/api/creative", { method: "POST", cookie, body: { kind: "image", prompt: "SLOW" } });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal((await request(`/api/creative/${slow.data.job.id}/cancel`, { method: "POST", cookie: foreign })).status, 404);
  assert.equal((await request(`/api/creative/${slow.data.job.id}/cancel`, { method: "POST", cookie })).status, 200);
  assert.equal((await wait(slow.data.job.id, cookie)).status, "canceled");
  assert.equal((await request(`/api/creative/${job.id}`, { method: "DELETE", cookie })).status, 200);
  assert.equal((await request(route, { cookie })).status, 404);
});
