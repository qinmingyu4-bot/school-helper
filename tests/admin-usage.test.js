const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { overview, reportWindow } = require("../lib/usage-analytics");

test("return rates count eligible cohorts on exact completed UTC days", () => {
  const now = Date.parse("2026-11-14T10:00:00Z");
  const window = reportWindow(30, "2026-11-05T10:00:00.000Z", now);
  const user = (id, day) => ({ id, createdAt: day + "T11:00:00.000Z" });
  const row = (userId, day, active, steps = []) => ({ userId, day, active, features: {}, modes: {}, steps });
  const report = overview([
    row("a", "2026-11-06", true), row("a", "2026-11-07", true), row("a", "2026-11-13", true, ["firstStudy"]),
    row("b", "2026-11-13", true), row("b", "2026-11-14", false, ["firstStudy"])
  ], [user("a", "2026-11-06"), user("b", "2026-11-13"), user("old", "2026-11-04")], window, now);
  assert.equal(report.activeUsers, 2);
  assert.deepEqual(report.firstStudy, { reached: 2, eligible: 2 });
  assert.deepEqual(report.retention, { day1: { reached: 1, eligible: 1 }, day7: { reached: 1, eligible: 1 } });
  assert.equal(report.trend[0].day, "2026-11-05");
  assert.equal(report.trend.at(-1).activeUsers, 0);
});

test("developer usage queries enforce roles and retain only action metadata", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-admin-usage-"));
  const database = path.join(directory, "db.json");
  let program;
  async function stop() {
    if (!program || program.exitCode !== null) return;
    const closed = once(program, "exit");
    program.kill();
    await closed;
  }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start() {
    program = spawn(process.execPath, ["--require", "./tests/fixtures/echo-ai.js", "server.js"], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: database,
        LOCAL_DB_BACKUP_DISABLED: "true", REQUIRE_EMAIL_VERIFICATION: "false", ADMIN_EMAILS: "owner@example.test",
        OPENAI_API_KEY: "local-fixture", OPENAI_WEB_SEARCH: "false", SESSION_SECRET: "admin-usage-test" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    return new Promise((resolve, reject) => {
      let output = "", errors = "";
      program.stderr.on("data", (chunk) => { errors += chunk; });
      program.once("exit", () => reject(new Error(errors || "Server exited")));
      program.stdout.on("data", (chunk) => {
        output += chunk;
        const port = output.match(/localhost:(\d+)/)?.[1];
        if (port) resolve(`http://127.0.0.1:${port}`);
      });
    });
  }
  let base = await start();
  const request = (route, cookie, body, headers = {}) => fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: { cookie: cookie || "", "content-type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  async function register(name) {
    const response = await request("/api/auth/register", "", { name, email: `${name}@example.test`,
      password: "UsageReport2026!", passwordConfirm: "UsageReport2026!" });
    assert.equal(response.status, 201);
    return { cookie: response.headers.get("set-cookie").split(";")[0], id: (await response.json()).user.id };
  }
  const owner = await register("owner"), student = await register("student");
  const userPath = `/api/admin/users/${student.id}/usage`;
  assert.equal((await request("/api/admin/usage")).status, 401);
  assert.equal((await request("/api/admin/usage", student.cookie)).status, 403);
  assert.equal((await request(userPath, student.cookie)).status, 403);
  assert.equal((await request("/api/admin/usage?days=8", owner.cookie)).status, 400);
  assert.equal((await request("/api/admin/users/missing/usage", owner.cookie)).status, 404);
  assert.equal((await request("/api/me/activity", owner.cookie, {}, { "x-studybridge-context": "admin" })).status, 200);
  const course = (await (await request("/api/courses", student.cookie, { name: "PRIVATE_COURSE_TITLE" })).json()).course;
  const docs = `/api/courses/${course.id}/documents`;
  const [uploaded, failed] = await Promise.all([
    request(docs, student.cookie, { fileName: "PRIVATE_FILE_NAME.txt", fileData: Buffer.from("PRIVATE_FILE_CONTENT").toString("base64") }),
    request(docs, student.cookie, {})
  ]);
  assert.equal(uploaded.status, 201);
  assert.equal(failed.status, 400);
  const requestId = failed.headers.get("x-request-id");
  assert.match(requestId, /^[a-f0-9-]{36}$/);
  const chat = `/api/courses/${course.id}/chat`;
  assert.equal((await request(chat, student.cookie, { mode: "review", message: "PRIVATE_QUESTION" })).status, 201);
  const stream = await request(chat, student.cookie, { mode: "guided", message: "PRIVATE_STREAM_QUESTION", stream: true });
  assert.match(await stream.text(), /event: done/);

  // Analytics writes run after responses. Wait for the committed report.
  let summary;
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await request(userPath, owner.cookie);
    assert.match(result.headers.get("cache-control"), /private.*no-store/);
    summary = await result.json();
    if (summary.aiRequests === 2 && summary.steps.every((step) => step.at)) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(summary.activeDays, 1);
  assert.equal(summary.courses, 1);
  assert.equal(summary.materials, 1);
  assert.equal(summary.completed, 4);
  assert.equal(summary.failed, 1);
  assert.equal(summary.aiRequests, 2);
  assert.equal(summary.usageReports, 2);
  assert.ok(summary.inputTokens && summary.outputTokens);
  assert.deepEqual(summary.modes, { review: 1, guided: 1 });
  assert.equal(summary.errors[0].id, requestId);
  assert.equal(summary.errors[0].code, "HTTP-400");
  assert.ok(summary.steps.every((step) => step.at));
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE_|passwordHash|@example\.test/);

  const report = await (await request("/api/admin/usage?days=30", owner.cookie)).json();
  assert.equal(report.activeUsers, 1);
  assert.deepEqual(report.firstStudy, { reached: 1, eligible: 2 });
  assert.deepEqual(report.retention.day1, { reached: 0, eligible: 0 });
  assert.equal(report.trend.at(-1).activeUsers, 1);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(student.id));
  const allowance = (await (await request("/api/me/ai-usage", student.cookie)).json()).usage;
  assert.equal(report.costUsd, allowance.usedUsd);

  const snapshot = JSON.parse(await fs.readFile(database, "utf8"));
  assert.doesNotMatch(JSON.stringify(snapshot.usageDays), /PRIVATE_|passwordHash|@example\.test/);
  await stop();
  base = await start();
  const restarted = await (await request(userPath + "?days=30", owner.cookie)).json();
  assert.equal(restarted.since, summary.since);
  assert.equal(restarted.costUsd, summary.costUsd);
  assert.deepEqual(restarted.steps, summary.steps);
});
