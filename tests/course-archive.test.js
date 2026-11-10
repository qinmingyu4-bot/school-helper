const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");
const imported = require("../lib/import-courses");
const courseChats = require("../public/course-conversations");

test("course archives preserve records, isolate accounts and survive restoration in local and DynamoDB stores", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-course-archive-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const mode of ["local", "dynamodb"]) {
    const db = new StudyBridgeDatabase();
    db.local.file = path.join(directory, mode + ".json");
    db.dynamo = mode === "dynamodb" ? memoryDynamo().store : null;
    if (db.dynamo) {
      const call = db.dynamo.call.bind(db.dynamo);
      db.dynamo.call = (operation, body) => call(operation, operation === "Query" ? { ...body, Limit: body.Limit || 100 } : body);
    }
    const course = await db.createCourse({ id: "economics", userId: "alice", name: "ECO101", term: "Fall 2026" });
    await db.createDocument({ id: "notes", userId: "alice", courseId: course.id, title: "Lecture notes", text: "Supply and demand" });
    await db.createMessage({ id: "message", userId: "alice", courseId: course.id, role: "user", content: "Explain supply" });
    assert.equal(await db.setCourseArchived("bob", course.id, true), null);
    const beforeDocs = await db.listDocuments("alice", course.id);
    const beforeMessages = await db.listMessages("alice", course.id);
    const archive = await db.setCourseArchived("alice", course.id, true);
    assert.ok(archive.archivedAt);
    assert.equal((await db.setCourseArchived("alice", course.id, true)).archivedAt, archive.archivedAt);
    assert.equal(courseChats.visibleCourses(await db.listCourses("alice")).length, 0);
    const nextTerm = imported.prepareCourses("alice", ["ECO101"], await db.listCourses("alice"), "Winter 2027");
    assert.equal(nextTerm.createdCourses.length, 1);
    assert.notEqual(nextTerm.courses[0].id, course.id);
    assert.deepEqual(await db.listDocuments("alice", course.id), beforeDocs);
    assert.deepEqual(await db.listMessages("alice", course.id), beforeMessages);
    if (mode === "local") db.local.state = null;
    assert.equal((await db.getCourse("alice", course.id)).archivedAt, archive.archivedAt);
    const restored = await db.setCourseArchived("alice", course.id, false);
    assert.equal(restored.id, course.id);
    assert.equal(courseChats.visibleCourses([restored]).length, 1);
    assert.deepEqual(await db.listDocuments("alice", course.id), beforeDocs);
    assert.deepEqual(await db.listMessages("alice", course.id), beforeMessages);
    if (mode === "dynamodb") {
      const transact = db.dynamo.transactPut.bind(db.dynamo);
      let raced = false;
      db.dynamo.transactPut = async (...args) => {
        if (!raced) { raced = true; await db.dynamo.delete("USER#alice", "COURSE#" + course.id); }
        return transact(...args);
      };
      assert.equal(await db.setCourseArchived("alice", course.id, true), null, "An archive racing deletion must not recreate a course");
    }
  }
});

test("archived course history reads materials, original PDFs and more than 80 messages with account isolation", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-course-history-"));
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "db.json");
  const password = "ArchiveHistory2026!";
  const { hashPassword } = require("../lib/security");
  const passwordHash = await hashPassword(password);
  for (const id of ["alice", "bob"]) await db.createUser({ id, name: id, email: id + "@archive.test", passwordHash, role: "student", profile: {} });
  const course = await db.createCourse({ id: "eco", userId: "alice", name: "ECO101", term: "Fall 2026" });
  const pdf = await fs.readFile(path.join(__dirname, "fixtures/schedule-full.pdf"));
  await db.writeMaterial("alice", course.id, "DOCFILE#notes#PDF", { dataUrl: "data:application/pdf;base64," + pdf.toString("base64") });
  await db.createDocument({ id: "notes", userId: "alice", courseId: course.id, title: "Syllabus.pdf", text: "Historical materials", hasSourcePdf: true });
  await db.createDocument({ id: "meeting", userId: "alice", courseId: course.id, title: "[SCHEDULE_ITEM] Lecture", type: "Schedule", text: JSON.stringify({ title: "Lecture", course: "ECO101", kind: "LEC", startsAt: "2026-11-12T10:00" }) });
  for (let i = 0; i < 85; i++) await db.createMessage({ id: "m" + i, userId: "alice", courseId: course.id, role: i % 2 ? "assistant" : "user", content: "Saved message " + i });
  let child;
  t.after(async () => {
    if (child?.exitCode === null) { const closed = once(child, "exit"); child.kill(); await closed; }
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function start() {
    child = spawn(process.execPath, ["server.js"], { cwd: path.resolve(__dirname, ".."), env: {
      ...process.env, PORT: "0", NODE_ENV: "test", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: db.local.file,
      LOCAL_DB_BACKUP_DISABLED: "true", MAILBOX_SYNC_DISABLED: "true", WEB_PUSH_WORKER_DISABLED: "true",
      OPENAI_API_KEY: "", REQUIRE_EMAIL_VERIFICATION: "false"
    }, stdio: ["ignore", "pipe", "pipe"] });
    return new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(Error("Startup timeout")), 10000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve("http://127.0.0.1:" + match[1]); } });
    });
  }
  let base = await start();
  async function login(id) {
    const response = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: id + "@archive.test", password }) });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  }
  let cookie = await login("alice");
  const foreign = await login("bob");
  const req = (route, auth = cookie, body) => fetch(base + route, { method: body ? "PUT" : "GET", headers: { cookie: auth, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await req("/api/courses/eco/archive", "", { archived: true })).status, 401);
  assert.equal((await req("/api/courses/eco/archive", foreign, { archived: true })).status, 404);
  assert.equal((await req("/api/courses/eco/archive", cookie, { archived: "true" })).status, 400);
  assert.equal((await req("/api/courses/general/archive", cookie, { archived: true })).status, 400);
  assert.equal((await req("/api/courses/eco/archive", cookie, { archived: true })).status, 200);
  assert.equal((await (await req("/api/courses")).json()).courses.length, 0);
  assert.equal((await (await req("/api/courses?archived=true")).json()).courses[0].id, "eco");
  assert.equal((await req("/api/courses/eco/history", foreign)).status, 404);
  const history = await (await req("/api/courses/eco/history")).json();
  assert.equal(history.documents.length, 1);
  assert.equal(history.documents[0].text, "Historical materials");
  const messages = await (await req("/api/courses/eco/history?conversationId=default")).json();
  assert.equal(messages.messages.length, 85);
  assert.ok(messages.messages.some((message) => message.content === "Saved message 0"));
  const file = await req("/api/courses/eco/history?documentId=notes");
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), pdf);
  assert.equal((await req("/api/courses/eco/history?documentId=missing")).status, 404);
  const schedules = await (await req("/api/schedule/items")).json();
  assert.ok(schedules.items.some((item) => item.docId === "meeting"));
  assert.equal(schedules.courses.length, 0);
  const stopped = once(child, "exit"); child.kill(); await stopped;
  base = await start();
  cookie = await login("alice");
  assert.equal((await (await req("/api/courses?archived=true")).json()).courses[0].id, "eco");
  assert.equal((await req("/api/courses/eco/archive", cookie, { archived: false })).status, 200);
  assert.equal((await (await req("/api/courses")).json()).courses[0].id, "eco");
  assert.equal((await req("/api/courses/eco/history")).status, 409);
  assert.equal((await (await req("/api/courses/eco/documents")).json()).documents.length, 2);
});
