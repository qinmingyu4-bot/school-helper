const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

test("schedule management HTTP batches enforce login/ownership and preserve course material, chats and other courses", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "schedule-management-http-"));
  const child = spawn(process.execPath, ["server.js"], { cwd: path.resolve(__dirname, ".."), env: {
    ...process.env, PORT: "0", NODE_ENV: "test", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: path.join(directory, "db.json"), LOCAL_DB_BACKUP_DISABLED: "true",
    REQUIRE_INVITE_CODE: "false", REQUIRE_EMAIL_VERIFICATION: "false", SESSION_SECRET: "schedule-management-http-test"
  }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => { if (child.exitCode === null) { const stopped = once(child, "exit"); child.kill(); await stopped; } await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Startup timed out")), 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
  });
  async function request(route, body, cookie = "", method = "POST") {
    const response = await fetch(base + route, { method, headers: { "content-type": "application/json", cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], data: await response.json() };
  }
  const register = (name) => request("/api/auth/register", { name, email: `${name}@example.test`, password: "ScheduleTest2026!", passwordConfirm: "ScheduleTest2026!" });
  const alice = await register("Alice"), bob = await register("Bob");
  const course = (await request("/api/courses", { name: "STA437H1" }, alice.cookie)).data.course;
  const other = (await request("/api/courses", { name: "ECO101" }, alice.cookie)).data.course;
  const docs = `/api/courses/${course.id}/documents`;
  await request(docs, { title: "Syllabus", type: "Note", text: "Course material stays" }, alice.cookie);
  const items = Array.from({ length: 80 }, (_, index) => ({ title: `Lecture ${index}`, kind: "LEC", course: "STA437H1", startsAt: `${2090 + Math.floor(index / 28)}-11-${String(index % 28 + 1).padStart(2, "0")}T10:00`, endsAt: "", timeZone: "America/Toronto" }));
  const imported = await request("/api/schedule/import", { items }, alice.cookie);
  assert.equal(imported.data.saved, 80);
  await request("/api/schedule/import", { items: [{ ...items[0], title: "Other course", course: "ECO101" }] }, alice.cookie);
  const targets = imported.data.items.map(({ courseId, docId }) => ({ courseId, docId }));
  const edit = { operation: "edit", items: targets, patch: { location: "New classroom" } };
  assert.equal((await request("/api/schedule/manage", edit)).status, 401);
  assert.equal((await request("/api/schedule/manage", edit, bob.cookie)).status, 404);
  assert.equal((await request("/api/schedule/manage", { ...edit, patch: { userId: "Bob" } }, alice.cookie)).status, 400);
  const changed = await request("/api/schedule/manage", edit, alice.cookie);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.changed, 80);
  assert.ok(changed.data.items.every((item) => item.location === "New classroom"));
  const remove = { operation: "delete", items: targets };
  assert.equal((await request("/api/schedule/manage", remove, alice.cookie)).data.changed, 80);
  assert.equal((await request("/api/schedule/manage", remove, alice.cookie)).data.changed, 0);
  assert.equal((await request("/api/schedule/items", null, alice.cookie, "GET")).data.items.length, 1);
  assert.equal((await request(docs, null, alice.cookie, "GET")).data.documents[0].text, "Course material stays");
  const courses = (await request("/api/courses", null, alice.cookie, "GET")).data.courses;
  assert.ok(courses.some((entry) => entry.id === course.id));
  assert.ok(courses.some((entry) => entry.id === other.id));
});
