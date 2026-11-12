const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createHash } = require("node:crypto");
const { courseFileBytes, courseRequestBytes } = require("../public/upload-limits");

for (const storeFormat of ["json", "sqlite"]) test(`large course uploads and original downloads remain private and durable (${storeFormat})`, { timeout: 90000 }, async (t) => {
  const root = path.resolve(__dirname, "..");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-large-upload-"));
  const database = path.join(directory, "db.json");
  let child, base;
  async function stop() {
    if (child?.exitCode !== null || !child) return;
    const stopped = once(child, "exit");
    child.kill();
    await stopped;
  }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start() {
    child = spawn(process.execPath, ["server.js"], { cwd: root, env: {
      ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: database,
      LOCAL_DB_BACKUP_DISABLED: "true", LOCAL_STORE_FORMAT: storeFormat, SESSION_SECRET: "large-upload-test-session", REQUIRE_INVITE_CODE: "false",
      REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: ""
    }, stdio: ["ignore", "pipe", "pipe"] });
    base = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Server startup timed out")), 10000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  if (storeFormat === "sqlite") {
    const local = new (require("../lib/local-store").LocalStore)(database);
    await local.write(() => {});
    require("../lib/sqlite-store").migrate(database);
  }
  await start();
  async function request(route, body, cookie = "", method = "POST") {
    const response = await fetch(base + route, { method, headers: { "content-type": "application/json", cookie },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], data: await response.json() };
  }
  const account = await request("/api/auth/register", { name: "Upload test", email: "upload@example.test", password: "Upload-Test-2026!", passwordConfirm: "Upload-Test-2026!" });
  assert.equal(account.status, 201);
  const cookie = account.cookie;
  const course = await request("/api/courses", { name: "Large materials" }, cookie);
  const route = `/api/courses/${course.data.course.id}/documents`;
  const source = await fs.readFile(path.join(root, "tests/fixtures/schedule-full.pdf"));
  const pdf = Buffer.alloc(26 * 1024 * 1024, 32);
  source.copy(pdf);
  const fileData = pdf.toString("base64");
  assert.ok(fileData.length > 32 * 1024 * 1024);
  assert.ok(fileData.length + 1024 < courseRequestBytes);
  const uploaded = await request(route, { fileName: "large-course.pdf", fileType: "application/pdf", fileData }, cookie);
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  assert.match(uploaded.data.document.text, /Schedule upload live test - SBTEST101/);
  assert.equal(uploaded.data.document.hasSourcePdf, true);
  assert.equal(uploaded.data.document.dataUrl, undefined);
  assert.equal((await request(route, null, "", "GET")).status, 401);
  let stored;
  if (storeFormat === "sqlite") {
    const store = new (require("../lib/sqlite-store").SqliteStore)(database);
    try { stored = await store.load(); } finally { store.close(); }
  } else stored = JSON.parse(await fs.readFile(database, "utf8"));
  const row = Object.values(stored.materials).find((item) => item.id === `DOCFILE#${uploaded.data.document.id}#PDF`);
  const original = await require("../lib/material-files").read(database, row.userId, row.courseId, row.id, row.file);
  assert.equal(createHash("sha256").update(Buffer.from(original.dataUrl.split(",")[1], "base64")).digest("hex"), createHash("sha256").update(pdf).digest("hex"));
  const empty = await request(route, { fileName: "empty.pdf", fileData: "data:application/pdf;base64," }, cookie);
  assert.equal(empty.status, 400);
  const tooLarge = await request(route, { fileName: "oversized.pdf", fileData: Buffer.alloc(courseFileBytes + 1).toString("base64") }, cookie);
  assert.equal(tooLarge.status, 413);
  assert.match(tooLarge.data.error, /50 MB/);
  const ordinary = await request("/api/me/profile", { name: "Still bounded", ignored: fileData }, cookie, "PUT");
  assert.equal(ordinary.status, 413);
  await stop();
  await start();
  const listed = await request(route, null, cookie, "GET");
  assert.equal(listed.status, 200);
  assert.equal(listed.data.documents.length, 1);
  assert.equal(listed.data.documents[0].id, uploaded.data.document.id);
  assert.equal(listed.data.documents[0].hasSourcePdf, true);
  assert.equal(listed.data.documents[0].dataUrl, undefined);
  const txt = Buffer.from("Original document: exact bytes\r\n preserved  spacing\n");
  const savedText = await request(route, { fileName: "source.txt", fileType: "text/plain", fileData: txt.toString("base64") }, cookie);
  assert.equal(savedText.status, 201);
  const originalRoute = `/api/courses/${course.data.course.id}/originals/${savedText.data.document.id}`;
  assert.equal((await fetch(base + originalRoute)).status, 401);
  const other = await request("/api/auth/register", { name: "Other", email: "other@example.test", password: "Upload-Test-2026!", passwordConfirm: "Upload-Test-2026!" });
  assert.equal((await fetch(base + originalRoute, { headers: { cookie: other.cookie } })).status, 404);
  const download = await fetch(base + originalRoute, { headers: { cookie } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /attachment/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), txt);
  await request(route + "/" + savedText.data.document.id, { title: "Changed text", text: "edited", type: "Note" }, cookie, "PATCH");
  await stop(); await start();
  assert.deepEqual(Buffer.from(await (await fetch(base + originalRoute, { headers: { cookie } })).arrayBuffer()), txt);
  const storage = await request("/api/me/storage", null, cookie, "GET");
  assert.equal(storage.status, 200); assert.ok(storage.data.usedBytes > txt.length);
  assert.equal(storage.data.limitBytes, 1024 ** 3); assert.equal(storage.data.users, undefined);
});
