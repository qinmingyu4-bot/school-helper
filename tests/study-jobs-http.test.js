const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
test("HTTP problem sets persist through restart, restore progress and isolate accounts, courses and conversations", { timeout: 45000 }, async (t) => {
  const root = path.resolve(__dirname, ".."), directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-task-http-")), database = path.join(directory, "db.json");
  let child, base;
  const stop = async () => { if (child?.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } };
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start() {
    child = spawn(process.execPath, ["--require", "./tests/fixtures/echo-ai.js", "server.js"], { cwd: root, env: {
      ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: database, LOCAL_DB_BACKUP_DISABLED: "true",
      SESSION_SECRET: "task-http-test-only", REQUIRE_INVITE_CODE: "false", REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "fixture", OPENAI_WEB_SEARCH: "false", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: ""
    }, stdio: ["ignore", "pipe", "pipe"] });
    base = await new Promise((resolve, reject) => {
      let output = ""; const timer = setTimeout(() => reject(Error("Startup timed out")), 10000);
      child.once("error", reject); child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    });
  }
  await start();
  const request = async (route, method = "GET", body, cookie = "") => {
    const response = await fetch(base + route, { method, headers: { cookie, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], data: await response.json() };
  };
  const register = (email) => request("/api/auth/register", "POST", { name: "Task test", email, password: "Task-HTTP-Test-2026!", passwordConfirm: "Task-HTTP-Test-2026!" });
  const alice = await register("task-alice@example.test"), bob = await register("task-bob@example.test");
  assert.equal(alice.status, 201); assert.equal(bob.status, 201);
  const course = await request("/api/courses", "POST", { name: "Economics" }, alice.cookie), route = `/api/courses/${course.data.course.id}`;
  const other = await request("/api/courses", "POST", { name: "Other course" }, alice.cookie), otherRoute = `/api/courses/${other.data.course.id}`;
  for (let n = 0; n < 7; n++) assert.equal((await request(route + "/documents", "POST", { title: `Lecture ${n}.txt`, text: "Lecture background\n".repeat(200) + "Opportunity cost is the best alternative forgone. COURSE_EVIDENCE" }, alice.cookie)).status, 201);
  await request(otherRoute + "/documents", "POST", { title: "Other.txt", text: "opportunity cost FOREIGN_COURSE" }, alice.cookie);
  const conversation = await request(route + "/conversations", "POST", { title: "Separate chat" }, alice.cookie);
  await request(route + "/chat", "POST", { conversationId: conversation.data.conversation.id, message: "Save these notes", attachments: [{ name: "Other-chat.txt", text: "opportunity cost FOREIGN_CHAT", kind: "text" }] }, alice.cookie);
  const body = { background: true, stream: true, requestId: "http-request-0001", mode: "guided", message: "请解答整套题，保留过程和出处", attachments: [{ name: "20-questions.txt", kind: "text", text: Array.from({ length: 20 }, (_, n) => `${n + 1}. Explain opportunity cost.\n(a) State the idea.\n(b) Calculate the result.`).join("\n") }] };
  const accepted = await request(route + "/chat", "POST", body, alice.cookie);
  assert.equal(accepted.status, 202, JSON.stringify(accepted.data));
  const taskRoute = route + "/study-jobs/" + accepted.data.job.id;
  assert.equal((await request(taskRoute)).status, 401);
  assert.equal((await request(taskRoute, "GET", null, bob.cookie)).status, 404);
  assert.equal((await request(otherRoute + "/study-jobs/" + accepted.data.job.id, "GET", null, alice.cookie)).status, 404);
  assert.deepEqual((await request(route + `/study-jobs?conversationId=${conversation.data.conversation.id}`, "GET", null, alice.cookie)).data.jobs, []);
  let view;
  async function until(check) {
    const deadline = Date.now() + 15000;
    do { view = (await request(taskRoute, "GET", null, alice.cookie)).data.job; if (check(view)) return; await delay(50); } while (Date.now() < deadline);
    assert.fail(`Task state timed out: ${JSON.stringify(view)}`);
  }
  await until((job) => job.completed > 0 && job.completed < 20);
  const before = view.completed;
  await stop(); await start();
  const restored = (await request(route + "/study-jobs", "GET", null, alice.cookie)).data.jobs[0];
  assert.equal(restored.id, accepted.data.job.id); assert.ok(restored.completed >= before);
  await until((job) => job.status === "completed");
  assert.equal(view.completed, 20); assert.equal(view.questions.length, 20);
  assert.ok(view.questions.every((question) => question.parts.length === 2 && question.status === "done"));
  assert.match(view.content, /来源：Lecture/); assert.match(view.content, /提取文本第/);
  assert.ok(view.timings.firstResultAt && view.timings.completedAt);
  const duplicate = await request(route + "/chat", "POST", body, alice.cookie); assert.equal(duplicate.data.job.id, view.id);
  const messages = (await request(route + "/messages", "GET", null, alice.cookie)).data.messages;
  assert.equal(messages.length, 2); assert.match(messages[1].content, /已完成 20\/20/);
  const state = JSON.parse(await fs.readFile(database, "utf8")); assert.ok(!JSON.stringify(state.materials).includes("MATH_TASK_FIXTURE"), "Task result payloads are persisted outside the resident material manifest");
  await request(route + "/conversations/default", "DELETE", null, alice.cookie);
  assert.equal((await request(taskRoute, "GET", null, alice.cookie)).status, 404);
});
