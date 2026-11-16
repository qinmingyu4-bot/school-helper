const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createFeedback } = require("../lib/feedback");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");

const student = { id: "student-fixture", name: "Example Student", email: "student@example.test" };
const admin = { id: "admin-fixture" };
const notification = "operator@example.test";

for (const backend of ["local", "dynamo"]) {
  test(`${backend}: repeated failures share one issue and notification; mail retries and manual rate limits persist`, async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-feedback-store-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const database = new StudyBridgeDatabase();
    database.local.file = path.join(dir, "db.json");
    database.dynamo = backend === "dynamo" ? memoryDynamo().store : null;
    database.listUsageDays = async () => [];
    const delivered = [];
    let clock = Date.parse("2026-11-16T04:05:00Z");
    let rejectMail = true;
    function service() {
      return createFeedback({
        db: database, recipient: () => notification, origin: () => "https://studybridge.ink",
        version: () => "fixture-version", now: () => clock,
        sendEmail: async (message) => {
          if (rejectMail) throw new Error("PRIVATE SMTP DETAIL");
          // The worker must be able to find the committed report before sending it.
          assert.ok((await service().list()).issues.length);
          delivered.push(message);
        }
      });
    }
    const feedback = service();
    const failure = () => feedback.observe({ user: student, path: "/api/courses/PRIVATE-ID/chat?secret=PRIVATE-PATH",
      method: "POST", status: 502, requestId: randomUUID(), occurredAt: clock, durationMs: 300,
      userAgent: "Mozilla/5.0 (iPhone) Safari/1.0 PRIVATE-UA" });
    await Promise.all([failure(), failure()]);
    let rows = (await feedback.list()).issues;
    assert.equal(rows.length, 1);
    const automaticId = rows[0].id;
    assert.equal(rows[0].count, 2);
    assert.equal(rows[0].area, "study");
    assert.equal(rows[0].action, "ask");
    assert.equal(rows[0].code, "HTTP-502");
    assert.equal(rows[0].diagnostics.device, "iOS");
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE-/);
    await feedback.drain();
    assert.equal((await feedback.get(automaticId)).mail.state, "queued");
    clock += 61000;
    await service().drain();
    clock += 121000;
    await service().drain();
    assert.equal((await service().get(automaticId)).mail.state, "failed");
    assert.ok(!(await feedback.get(automaticId)).mail.error);
    rejectMail = false;
    await feedback.update(automaticId, "retry-mail", admin);
    await Promise.all([feedback.drain(), service().drain()]);
    assert.equal((await feedback.get(automaticId)).mail.state, "sent");
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].to, notification);
    assert.match(delivered[0].text, /Example Student <student@example\.test>/);
    assert.match(delivered[0].text, new RegExp(encodeURIComponent(automaticId)));
    await feedback.update(automaticId, "resolve", admin);
    assert.equal((await feedback.get(automaticId)).status, "resolved");
    clock += 1000;
    await failure();
    assert.equal((await feedback.get(automaticId)).status, "new");
    assert.equal((await feedback.get(automaticId)).count, 3);
    await feedback.drain();
    assert.equal(delivered.length, 1);

    const clientId = randomUUID();
    const body = { userId: student.id, clientId, area: "study", action: "ask", code: "STREAM", note: "PRIVATE-USER-NOTE" };
    const [first, retry] = await Promise.all([feedback.submit(student, body), service().submit(student, body)]);
    assert.equal(first.id, retry.id);
    await feedback.drain();
    assert.equal(delivered.length, 2);
    assert.doesNotMatch(delivered[1].text, /PRIVATE-USER-NOTE/);
    assert.equal((await feedback.get(first.id)).note, body.note);
    assert.equal((await feedback.get(first.id)).diagnostics.requestId, "");
    for (let i = 0; i < 4; i++) await feedback.submit(student, { ...body, clientId: randomUUID() });
    await assert.rejects(() => feedback.submit(student, { ...body, clientId: randomUUID() }), { statusCode: 429 });
    clock += 91 * 86400000;
    assert.equal((await feedback.list()).issues.length, 0);
  });
}

test("HTTP failure feedback is scoped to the signed-in account and admin inbox", { timeout: 20000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-feedback-http-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, PORT: "0", NODE_ENV: "test", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: path.join(dir, "db.json"),
      LOCAL_DB_BACKUP_DISABLED: "true", REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "", SMTP_HOST: "",
      ADMIN_EMAILS: "owner@example.test", FEEDBACK_EMAIL_TO: "", SESSION_SECRET: "feedback-test-only" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    if (child.exitCode === null) { const exit = once(child, "exit"); child.kill(); await exit; }
    await fs.rm(dir, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let errors = "", output = "";
    child.stderr.on("data", part => { errors += part; });
    child.once("exit", () => reject(new Error(errors || "Fixture server exited.")));
    child.stdout.on("data", part => {
      output += part;
      const port = output.match(/http:\/\/localhost:(\d+)/)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
    });
  });
  function request(route, cookie = "", { method = "GET", body, headers } = {}) {
    return fetch(base + route, { method, headers: { cookie, "content-type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function register(name, email) {
    const response = await request("/api/auth/register", "", { method: "POST", body: { name, email, password: "Fixture2026!", passwordConfirm: "Fixture2026!" } });
    assert.equal(response.status, 201);
    return { id: (await response.json()).user.id, cookie: response.headers.get("set-cookie").split(";")[0] };
  }
  const owner = await register("Owner", "owner@example.test"), learner = await register("Student", "learner@example.test");
  assert.equal((await request("/api/admin/feedback")).status, 401);
  assert.equal((await request("/api/admin/feedback", learner.cookie)).status, 403);
  assert.equal((await request("/api/schedule/parse-text", learner.cookie, { method: "POST", body: { text: "" } })).status, 400);
  const failed = await request("/api/schedule/parse-text", learner.cookie, { method: "POST", body: { text: "PRIVATE-SCHEDULE-BODY" } });
  assert.equal(failed.status, 503);
  const trace = failed.headers.get("x-request-id");
  assert.match(trace, /^[a-f0-9-]{36}$/);
  await failed.json();
  // The failed response can reach the browser before the analytics write commits.
  let captured = false;
  for (let attempt = 0; attempt < 40 && !captured; attempt++) {
    const { issues } = await (await request("/api/admin/feedback", owner.cookie)).json();
    captured = issues.some(issue => issue.diagnostics.requestId === trace);
    if (!captured) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(captured, true);
  const clientId = randomUUID();
  const body = { userId: learner.id, clientId, area: "schedule", action: "recognize", code: "HTTP-503", requestId: trace, note: "Cannot create schedule" };
  assert.equal((await request("/api/feedback", learner.cookie, { method: "POST", body, headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await request("/api/feedback", learner.cookie, { method: "POST", body: { ...body, userId: owner.id } })).status, 400);
  const accepted = await request("/api/feedback", learner.cookie, { method: "POST", body });
  assert.equal(accepted.status, 201);
  const { id } = await accepted.json();
  const inbox = await request("/api/admin/feedback", owner.cookie);
  assert.match(inbox.headers.get("cache-control"), /private.*no-store/);
  const { issues } = await inbox.json();
  assert.equal(issues.length, 2);
  const automatic = issues.find(issue => issue.source === "automatic");
  assert.equal(automatic.diagnostics.requestId, trace);
  assert.equal(automatic.user.id, learner.id);
  assert.equal(automatic.code, "HTTP-503");
  assert.doesNotMatch(JSON.stringify(issues), /PRIVATE-SCHEDULE-BODY|passwordHash/);
  const url = "/api/admin/feedback/" + encodeURIComponent(id);
  assert.equal((await request(url, learner.cookie)).status, 403);
  assert.equal((await request(url, learner.cookie, { method: "PATCH", body: { actorId: learner.id, action: "resolve" } })).status, 403);
  const state = await (await request(url, owner.cookie, { method: "PATCH", body: { actorId: owner.id, action: "resolve" } })).json();
  assert.equal(state.issue.status, "resolved");
  assert.equal(state.issue.diagnostics.requestId, trace);
  assert.equal(state.issue.mail.state, "unconfigured");
});
