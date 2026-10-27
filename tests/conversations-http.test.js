const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { readEvents } = require("../public/chat-stream");

test("course conversations isolate API history, AI context and attachments across threads, users and restart", { timeout: 45000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-conversation-http-"));
  let child, base;
  async function stop() { if (child?.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; } }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start() {
    child = spawn(process.execPath, ["--require", "./tests/fixtures/echo-ai.js", "server.js"], { cwd: path.resolve(__dirname, ".."), env: {
      ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: path.join(directory, "db.json"), LOCAL_DB_BACKUP_DISABLED: "true",
      REQUIRE_INVITE_CODE: "false", REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "test-fixture", OPENAI_WEB_SEARCH: "false", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", SESSION_SECRET: "isolated-conversation-http-secret"
    }, stdio: ["ignore", "pipe", "pipe"] });
    base = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Startup timed out")), 10000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
      child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    });
  }
  async function request(route, method = "GET", body, cookie = alice) {
    const response = await fetch(base + route, { method, headers: { cookie: cookie || "", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  await start();
  let alice = "";
  const registration = (email) => ({ email, name: "Conversation test", password: "Conversation-Test-2026!", passwordConfirm: "Conversation-Test-2026!" });
  alice = (await request("/api/auth/register", "POST", registration("alice-threads@example.test"), "")).cookie;
  const bob = (await request("/api/auth/register", "POST", registration("bob-threads@example.test"), "")).cookie;
  const course = (await request("/api/courses", "POST", { name: "MAT137" })).data.course;
  const other = (await request("/api/courses", "POST", { name: "STA437" })).data.course;
  const route = `/api/courses/${course.id}`;
  await request(route + "/documents", "POST", { title: "Syllabus", text: "SHARED_COURSE_SYLLABUS" });
  await request(route + "/chat", "POST", { message: "LEGACY_PRIVATE_QUESTION", attachments: [{ name: "legacy.txt", text: "LEGACY_PRIVATE_FILE" }] });
  const legacy = (await request(route + "/messages")).data.messages;
  assert.equal(legacy.length, 2);
  const chatA = (await request(route + "/conversations", "POST", {})).data.conversation;
  const chatB = (await request(route + "/conversations", "POST", { title: "Exam preparation" })).data.conversation;
  assert.equal((await request(route + "/conversations", "GET", undefined, "")).status, 401);
  assert.equal((await request(route + "/conversations", "GET", undefined, bob)).status, 404);
  assert.equal((await request(route + "/conversations", "POST", { title: " " })).status, 400);
  await request(route + "/chat", "POST", { conversationId: chatA.id, message: "CHAT_A_PRIVATE_QUESTION", attachments: [{ name: "a.txt", text: "CHAT_A_PRIVATE_FILE" }] });
  const answerB = await request(route + "/chat", "POST", { conversationId: chatB.id, message: "Independent exam preparation" });
  const contentB = answerB.data.messages[1].content;
  assert.ok(contentB.includes("SHARED_COURSE_SYLLABUS"));
  for (const secret of ["CHAT_A_PRIVATE_QUESTION", "CHAT_A_PRIVATE_FILE", "LEGACY_PRIVATE_QUESTION", "LEGACY_PRIVATE_FILE"]) assert.ok(!contentB.includes(secret), secret);
  assert.equal((await request(route + `/messages?conversationId=${chatA.id}`)).data.messages.length, 2);
  assert.equal((await request(route + `/messages?conversationId=${chatB.id}`)).data.messages.length, 2);
  assert.deepEqual((await request(route + "/messages")).data.messages.map((message) => message.id), legacy.map((message) => message.id));
  assert.equal((await request(`/api/courses/${other.id}/chat`, "POST", { conversationId: chatA.id, message: "Wrong course" })).status, 404);
  assert.equal((await request(route + `/messages?conversationId=${chatA.id}`, "GET", undefined, bob)).status, 404);
  assert.equal((await request(route + "/chat", "POST", { conversationId: "missing", message: "Missing" })).status, 404);
  assert.equal((await request(route + `/conversations/${chatA.id}`, "PATCH", { title: "Assignment discussion" })).status, 200);
  const response = await fetch(base + route + "/chat", { method: "POST", headers: { cookie: alice, "content-type": "application/json" }, body: JSON.stringify({ stream: true, conversationId: chatA.id, message: "Continue this discussion" }) });
  let done;
  await readEvents(response, ({ event, data }) => { if (event === "done") done = JSON.parse(data); });
  assert.ok(done.messages[1].content.includes("CHAT_A_PRIVATE_FILE"));
  assert.ok(!done.messages[1].content.includes("Independent exam preparation"));
  assert.equal(done.messages[1].conversationId, chatA.id);
  await stop(); await start();
  const rows = (await request(route + "/conversations")).data.conversations;
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.id === chatA.id).title, "Assignment discussion");
  assert.equal((await request(route + `/messages?conversationId=${chatA.id}`)).data.messages.length, 4);
  assert.deepEqual((await request(route + "/messages")).data.messages.map((message) => message.id), legacy.map((message) => message.id));
});
