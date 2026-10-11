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
  async function start({ fakeAi = false, webSearch = false } = {}) {
    child = spawn(process.execPath, [...(fakeAi ? ["--require", "./tests/fixtures/echo-ai.js"] : []), "server.js"], {
      cwd: root,
      env: {
        ...process.env, PORT: "0", NODE_ENV: "test", STUDYBRIDGE_DB: "local",
        LOCAL_DB_FILE: path.join(directory, "database.json"), LOCAL_DB_BACKUP_DISABLED: "true",
        SESSION_SECRET: "isolated-health-check-session-secret", ADMIN_EMAILS: "admin@example.test,other-admin@example.test",
        OWNER_INVITE_CODE: "health-owner-invite", REQUIRE_INVITE_CODE: "true",
        OPENAI_SIMPLE_MODEL: "gpt-6-luna", OPENAI_COMPLEX_MODEL: "gpt-6.1-sol", OPENAI_SOL_ROUTE_PERCENT: "15",
        REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: fakeAi ? "test-only-key" : "",
        OPENAI_WEB_SEARCH: String(webSearch), GOOGLE_CLIENT_ID: "",
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
  assert.equal(invite.data.invite.maxUses, 1);
  const code = invite.data.invite.code;
  const alice = await request("/api/auth/register", { method: "POST", body: registration("Alice", "alice@example.test", code) });
  const bobInvite = await request("/api/admin/invites", { method: "POST", cookie: admin.cookie, body: { label: "Bob", role: "student" } });
  const bob = await request("/api/auth/register", { method: "POST", body: registration("Bob", "bob@example.test", bobInvite.data.invite.code) });
  assert.equal(alice.status, 201);
  assert.equal(bob.status, 201);
  let courseId;

  await t.test("single-use invitations cannot be reused or raced", async () => {
    assert.equal((await request("/api/auth/register", { method: "POST", body: registration("Other owner", "other-admin@example.test", "health-owner-invite") })).status, 403);
    const generated = await request("/api/admin/invites", { method: "POST", cookie: admin.cookie, body: { maxUses: 100, role: "admin" } });
    assert.equal(generated.data.invite.maxUses, 1);
    const raceCode = generated.data.invite.code;
    const attempts = await Promise.all(Array.from({ length: 4 }, (_, i) => request("/api/auth/register", { method: "POST", body: registration(`Concurrent ${i}`, `concurrent-${i}@example.test`, raceCode) })));
    assert.equal(attempts.filter((item) => item.status === 201).length, 1);
    assert.equal(attempts.filter((item) => item.status === 403).length, 3);
    assert.equal(attempts.find((item) => item.status === 201).data.user.role, "admin");
    const overview = await request("/api/admin/overview", { cookie: admin.cookie });
    assert.equal(overview.data.users.filter((user) => user.inviteCode === raceCode).length, 1);
    assert.equal(overview.data.invites.find((item) => item.code === raceCode).uses, 1);
    await request(`/api/admin/invites/${generated.data.invite.id}`, { method: "PATCH", cookie: admin.cookie, body: { active: true } });
    assert.equal((await request("/api/auth/register", { method: "POST", body: registration("Reuse", "reuse@example.test", raceCode) })).status, 403);
    await stop();
    const saved = JSON.parse(await fs.readFile(path.join(directory, "database.json"), "utf8"));
    saved.invites[generated.data.invite.id].maxUses = 100;
    await fs.writeFile(path.join(directory, "database.json"), JSON.stringify(saved));
    await start();
    assert.equal((await request("/api/auth/register", { method: "POST", body: registration("Legacy reuse", "legacy-reuse@example.test", raceCode) })).status, 403);
  });

  await t.test("only admins can delete invitations without removing registered users", async () => {
    const created = await request("/api/admin/invites", { method: "POST", cookie: admin.cookie, body: { label: "Delete check", maxUses: 3 } });
    assert.equal(created.status, 201);
    const deletedInvite = created.data.invite;
    const registered = await request("/api/auth/register", { method: "POST", body: registration("Invited user", "invited@example.test", deletedInvite.code) });
    assert.equal(registered.status, 201);
    const route = `/api/admin/invites/${deletedInvite.id}`;
    assert.equal((await request(route, { method: "DELETE" })).status, 401);
    assert.equal((await request(route, { method: "DELETE", cookie: alice.cookie })).status, 403);
    assert.ok((await request("/api/admin/overview", { cookie: admin.cookie })).data.invites.some((item) => item.id === deletedInvite.id));
    const removed = await request(route, { method: "DELETE", cookie: admin.cookie });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.deleted, true);
    assert.equal((await request(route, { method: "DELETE", cookie: admin.cookie })).status, 404);
    assert.equal((await request("/api/auth/register", { method: "POST", body: registration("Blocked", "deleted-code@example.test", deletedInvite.code) })).status, 403);
    assert.equal((await request("/api/me", { cookie: registered.cookie })).data.user.email, "invited@example.test");
    await stop();
    await start();
    const overview = await request("/api/admin/overview", { cookie: admin.cookie });
    assert.ok(!overview.data.invites.some((item) => item.id === deletedInvite.id));
    assert.ok(overview.data.users.some((item) => item.email === "invited@example.test" && item.inviteCode === deletedInvite.code));
  });

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

  await t.test("schedule extraction authentication, unreadable files, and unconfigured AI", async () => {
    const body = { fileName: "schedule.txt", fileData: Buffer.from("Essay due Nov 12, 2026 at 23:59").toString("base64") };
    assert.equal((await request("/api/schedule/extract", { method: "POST", body })).status, 401);
    assert.equal((await request("/api/schedule/extract", { method: "POST", cookie: alice.cookie, body: { ...body, fileName: "schedule.exe" } })).status, 400);
    assert.equal((await request("/api/schedule/extract", { method: "POST", cookie: alice.cookie, body: { ...body, fileData: Buffer.from(" ").toString("base64") } })).status, 422);
    assert.equal((await request("/api/schedule/extract", { method: "POST", cookie: alice.cookie, body })).status, 503);
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
    assert.equal((await request("/api/classmates/events")).status, 401);
    async function subscribe(cookie) {
      const controller = new AbortController();
      t.after(() => controller.abort());
      const response = await fetch(`${base}/api/classmates/events`, { headers: { cookie }, signal: controller.signal });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/event-stream/);
      const reader = response.body.getReader();
      const events = [];
      const decoder = new TextDecoder();
      const reading = (async () => {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (frame.startsWith("event: classmates\n")) events.push(JSON.parse(frame.split("\ndata: ")[1]));
          }
        }
      })().catch((error) => { if (error.name !== "AbortError") throw error; });
      return { events, reading, close: () => controller.abort() };
    }
    async function waitForEvents(stream, count) {
      const deadline = Date.now() + 2000;
      while (stream.events.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(stream.events.length, count);
      assert.equal(stream.events.at(-1).chatId, accepted.data.classmate.id);
    }
    const aliceStream = await subscribe(alice.cookie);
    const bobStream = await subscribe(bob.cookie);
    const unrelatedStream = await subscribe(admin.cookie);
    assert.equal((await request(route, { method: "POST", cookie: alice.cookie, body: { content: "Hello Bob" } })).status, 201);
    await Promise.all([waitForEvents(aliceStream, 1), waitForEvents(bobStream, 1)]);
    assert.equal((await request(route, { cookie: bob.cookie })).data.messages.at(-1).content, "Hello Bob");
    assert.equal((await request(route, { method: "POST", cookie: bob.cookie, body: { content: "Hello Alice" } })).status, 201);
    await Promise.all([waitForEvents(aliceStream, 2), waitForEvents(bobStream, 2)]);
    assert.deepEqual(unrelatedStream.events, []);
    const secondBobLogin = await request("/api/auth/login", { method: "POST", body: { email: "bob@example.test", password: "HealthCheck-Password-123!" } });
    const logoutStream = await subscribe(secondBobLogin.cookie);
    assert.equal((await request("/api/auth/logout", { method: "POST", cookie: secondBobLogin.cookie })).status, 200);
    await logoutStream.reading;
    assert.equal((await request("/api/classmates/events", { cookie: secondBobLogin.cookie })).status, 401);
    for (const stream of [aliceStream, bobStream, unrelatedStream]) stream.close();
    await Promise.all([aliceStream.reading, bobStream.reading, unrelatedStream.reading]);

    const unreadFor = async (cookie) => (await request("/api/classmates", { cookie })).data.classmates.find((mate) => mate.id === accepted.data.classmate.id).unreadCount;
    assert.equal(await unreadFor(alice.cookie), 1);
    assert.equal(await unreadFor(bob.cookie), 1);
    const snapshot = (await request(route, { cookie: bob.cookie })).data;
    assert.equal(await unreadFor(bob.cookie), 1);
    const readRoute = `/api/classmates/${accepted.data.classmate.id}/read`;
    assert.equal((await request(readRoute, { method: "POST", cookie: admin.cookie, body: { messageIds: snapshot.readMessageIds } })).status, 404);
    assert.equal((await request(readRoute, { method: "POST", cookie: bob.cookie, body: { messageIds: "invalid" } })).status, 400);
    assert.equal((await request(route, { method: "POST", cookie: alice.cookie, body: { content: "Message after snapshot" } })).status, 201);
    const read = await request(readRoute, { method: "POST", cookie: bob.cookie, body: { messageIds: snapshot.readMessageIds } });
    assert.equal(read.status, 200);
    assert.equal(read.data.markedCount, 1);
    assert.equal(read.data.unreadCount, 1);
    assert.equal(await unreadFor(alice.cookie), 1);
    for (let index = 0; index < 80; index += 1) {
      assert.equal((await request(route, { method: "POST", cookie: alice.cookie, body: { content: `Unread history ${index}` } })).status, 201);
    }
    const fullSnapshot = (await request(route, { cookie: bob.cookie })).data;
    assert.equal(fullSnapshot.messages.length, 80);
    assert.equal(fullSnapshot.readMessageIds.length, 81);
    assert.equal(await unreadFor(bob.cookie), 81);
    const cleared = await request(readRoute, { method: "POST", cookie: bob.cookie, body: { messageIds: fullSnapshot.readMessageIds } });
    assert.equal(cleared.data.unreadCount, 0);
    assert.equal(await unreadFor(bob.cookie), 0);
  });

  await t.test("latest messages move classmates above empty chats without clearing unread", async () => {
    const existing = (await request("/api/classmates", { cookie: alice.cookie })).data.classmates[0];
    const pending = await request("/api/classmates", { method: "POST", cookie: alice.cookie, body: { email: "admin@example.test" } });
    const accepted = await request(`/api/classmate-requests/${pending.data.request.id}`, { method: "PATCH", cookie: admin.cookie, body: { action: "accept" } });
    const newChat = accepted.data.classmate.id;
    const list = async () => (await request("/api/classmates", { cookie: alice.cookie })).data.classmates;
    assert.equal((await list())[0].id, existing.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal((await request(`/api/classmates/${newChat}/messages`, { method: "POST", cookie: admin.cookie, body: { content: "New message from second classmate" } })).status, 201);
    const afterIncoming = await list();
    assert.equal(afterIncoming[0].id, newChat);
    assert.equal(afterIncoming[0].unreadCount, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal((await request(`/api/classmates/${existing.id}/messages`, { method: "POST", cookie: bob.cookie, body: { content: "Newest message from Bob" } })).status, 201);
    const afterNext = await list();
    assert.equal(afterNext[0].id, existing.id);
    assert.equal(afterNext[0].unreadCount, 2);
    const snapshot = (await request(`/api/classmates/${existing.id}/messages`, { cookie: alice.cookie })).data;
    await request(`/api/classmates/${existing.id}/read`, { method: "POST", cookie: alice.cookie, body: { messageIds: snapshot.readMessageIds } });
    const afterRead = await list();
    assert.equal(afterRead[0].id, existing.id);
    assert.equal(afterRead[0].unreadCount, 0);
    assert.equal(afterRead[1].unreadCount, 1);
  });

  await t.test("AI fallback and persistence across restart", async () => {
    const chat = await request(`/api/courses/${courseId}/chat`, { method: "POST", cookie: alice.cookie, body: { message: "Explain calculus" } });
    assert.equal(chat.status, 201);
    assert.equal(chat.data.messages.length, 2);
    await stop();
    await start();
    assert.equal((await request("/api/me", { cookie: alice.cookie })).data.user.email, "alice@example.test");
    assert.equal((await request("/api/classmates", { cookie: bob.cookie })).data.classmates[0].unreadCount, 0);
    assert.equal((await request(`/api/courses/${courseId}/documents`, { cookie: alice.cookie })).data.documents.length, 5);
    assert.equal((await request(`/api/courses/${courseId}/messages`, { cookie: alice.cookie })).data.messages.length, 2);
    assert.equal((await request("/api/auth/logout", { method: "POST", cookie: alice.cookie })).status, 200);
    assert.equal((await request("/api/me", { cookie: alice.cookie })).status, 401);
    const login = await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } });
    assert.equal(login.status, 200);
  });

  await t.test("all study modes reach actual AI prompts and survive in chat history", async () => {
    const modes = require("../public/study-modes");
    await stop();
    await start({ fakeAi: true });
    const login = await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } });
    const cookie = login.cookie;
    const beforeExtraction = await request("/api/courses", { cookie });
    for (const extension of ["txt", "csv", "md", "docx", "pptx", "xlsx"]) {
      const zip = new AdmZip();
      const entries = { docx: "word/document.xml", pptx: "ppt/slides/slide1.xml", xlsx: "xl/worksheets/sheet1.xml" };
      if (entries[extension]) zip.addFile(entries[extension], Buffer.from(extension === "xlsx" ? '<worksheet><row><c r="A1" t="inlineStr"><is><t>Essay due Nov 12, 2026 at 23:59</t></is></c></row></worksheet>' : "<document><p>Essay due Nov 12, 2026 at 23:59</p></document>"));
      const buffer = entries[extension] ? zip.toBuffer() : Buffer.from("Essay due Nov 12, 2026 at 23:59");
      const result = await request("/api/schedule/extract", { method: "POST", cookie, body: { fileName: `schedule.${extension}`, fileData: buffer.toString("base64"), timeZone: "America/Toronto" } });
      assert.equal(result.status, 200);
      if (result.status === 200) {
        assert.deepEqual(result.data.items.map((item) => item.kind), ["DDL", "LEC", "TUT"]);
        assert.equal(result.data.items[2].startsAt, "");
        assert.ok(result.data.items[0].evidence);
      }
    }
    assert.deepEqual((await request("/api/courses", { cookie })).data, beforeExtraction.data, "extraction must not create a planner or reminders");
    const pdf = await fs.readFile(path.join(root, "tests/fixtures/schedule.pdf"));
    assert.equal((await request("/api/schedule/extract", { method: "POST", cookie, body: { fileName: "schedule.pdf", fileData: pdf.toString("base64") } })).status, 200);
    const fullPdf = await fs.readFile(path.join(root, "tests/fixtures/schedule-full.pdf"));
    for (let repeat = 0; repeat < 4; repeat++) {
      const result = await request("/api/schedule/extract", { method: "POST", cookie, body: { fileName: "schedule-full.pdf", fileData: `data:application/pdf;base64,${fullPdf.toString("base64")}`, timeZone: "America/New_York" } });
      assert.equal(result.status, 200, "PDFs decoded from repeated HTTP uploads must not depend on Buffer pool offsets");
    }
    const sourceBody = { fileName: "schedule.txt", fileData: Buffer.from("Essay due Nov 12, 2026 at 23:59").toString("base64") };
    assert.equal((await request("/api/schedule/extract", { method: "POST", cookie, body: { ...sourceBody, timeZone: "Invalid/Zone" } })).status, 400);
    assert.equal((await request("/api/schedule/extract", { method: "POST", cookie, body: { ...sourceBody, fileData: Buffer.from("x".repeat(100001)).toString("base64") } })).status, 400);
    const invalid = await request("/api/schedule/extract", { method: "POST", cookie, body: { fileName: "schedule.txt", fileData: Buffer.from("MALFORMED_SCHEDULE").toString("base64") } });
    assert.equal(invalid.status, 502);
    const course = await request("/api/courses", { method: "POST", cookie, body: { name: "Mode workflows" } });
    const id = course.data.course.id;
    await request(`/api/courses/${id}/documents`, { method: "POST", cookie, body: { title: "Mode source", text: "Mode-specific course evidence" } });
    await request("/api/me/preferences", { method: "PUT", cookie, body: { customInstruction: "Keep explanations concise" } });
    for (const [mode, config] of Object.entries(modes.modes)) {
      const question = config.prompts[0][1];
      const chat = await request(`/api/courses/${id}/chat`, { method: "POST", cookie, body: { message: question, mode } });
      assert.equal(chat.status, 201);
      assert.ok(chat.data.messages.every((item) => item.mode === mode));
      const payload = JSON.parse(chat.data.messages[1].content);
      assert.ok(payload.messages[0].content.includes(modes.buildInstruction(mode)));
      assert.ok(payload.messages[0].content.includes("Keep explanations concise"));
      assert.ok(payload.messages[1].content.includes(question));
      assert.ok(payload.messages[1].content.includes("Mode-specific course evidence"));
      if (mode === "cheatsheet") assert.ok(payload.messages[0].content.includes("Cheatsheet mode requirements"));
    }
    const email = await request(`/api/courses/${id}/chat`, { method: "POST", cookie, body: { message: "Draft a short email", mode: "email" } });
    assert.ok(!JSON.parse(email.data.messages[1].content).messages[0].content.includes("Selected study mode:"));
    await stop();
    await start({ fakeAi: true, webSearch: true });
    const web = await request(`/api/courses/${id}/chat`, { method: "POST", cookie, body: { message: "Review the course", mode: "review" } });
    assert.ok(JSON.parse(web.data.messages[1].content).input[0].content.includes(modes.buildInstruction("review")));
    const history = (await request(`/api/courses/${id}/messages`, { cookie })).data.messages;
    assert.equal(history.length, 18);
    for (const mode of Object.keys(modes.modes)) {
      assert.ok(history.some((item) => item.role === "user" && item.mode === mode));
      assert.ok(history.some((item) => item.role === "assistant" && item.mode === mode));
    }
    const pdfChat = await request(`/api/courses/${id}/chat`, { method: "POST", cookie, body: { message: "Read this schedule PDF", attachments: [{ name: "schedule-full.pdf", mime: "application/pdf", dataUrl: `data:application/pdf;base64,${fullPdf.toString("base64")}` }] } });
    assert.equal(pdfChat.status, 201);
    assert.ok(pdfChat.data.messages[1].content.includes("Essay due November 12, 2026 at 23:59"), "chat PDF extraction must retain document text too");
  });
});
