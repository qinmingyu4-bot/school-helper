const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");
const AdmZip = require("adm-zip");
const { readEvents } = require("../public/chat-stream");

const root = path.resolve(__dirname, "..");
test("account, course, upload, and persistence health check", { timeout: 60000 }, async (t) => {
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
        OPENAI_WEB_SEARCH: String(webSearch), OPENAI_WEB_MODEL: "must-not-override-task-model", GOOGLE_CLIENT_ID: "",
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
    assert.equal((await request("/fonts/missing.woff2")).status, 404);
    for (const file of ["inter-variable-4.1.woff2", "noto-sans-sc-gb2312-v2.004.woff2"]) {
      const response = await fetch(`${base}/fonts/${file}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "font/woff2");
      assert.ok(response.headers.get("cache-control").includes("immutable"));
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
      assert.ok(bytes.length > 10000 && bytes.length < 3 * 1024 * 1024);
    }
    assert.equal((await request("/api/health")).data.ok, true);
    assert.equal((await request("/api/me")).status, 401);
    assert.equal((await request("/api/creative")).status, 401);
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
    assert.equal(status.data.ai.complexRoutePercent, 100);
    assert.equal(status.data.ai.routing, "task-complexity");
    assert.equal(status.data.ai.webModelRouting, "selected-task-model");
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

  await t.test("last activity is admin-only, server-timed and persistent without fabricating legacy history", async () => {
    let overview = (await request("/api/admin/overview", { cookie: admin.cookie })).data;
    assert.ok(Number.isFinite(Date.parse(overview.users.find((user) => user.id === alice.data.user.id).lastSeenAt)));
    await stop();
    const file = path.join(directory, "database.json");
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    saved.userActivity[alice.data.user.id].lastSeenAt = "2020-01-01T00:00:00.000Z";
    delete saved.userActivity[bob.data.user.id];
    await fs.writeFile(file, JSON.stringify(saved));
    await start();
    overview = (await request("/api/admin/overview", { cookie: admin.cookie })).data;
    assert.equal(overview.users.find((user) => user.id === bob.data.user.id).lastSeenAt, null);
    assert.equal((await request("/api/me/activity", { method: "POST" })).status, 401);
    const before = Date.now();
    assert.equal((await request("/api/me/activity", { method: "POST", cookie: alice.cookie, body: { userId: bob.data.user.id, lastSeenAt: "2099-01-01" } })).status, 200);
    overview = (await request("/api/admin/overview", { cookie: admin.cookie })).data;
    const lastSeen = overview.users.find((user) => user.id === alice.data.user.id).lastSeenAt;
    assert.ok(Date.parse(lastSeen) >= before && Date.parse(lastSeen) <= Date.now());
    assert.equal(overview.users.find((user) => user.id === bob.data.user.id).lastSeenAt, null);
    assert.equal((await request("/api/me", { cookie: alice.cookie })).data.user.lastSeenAt, undefined);
    assert.equal((await request("/api/admin/overview", { cookie: alice.cookie })).status, 403);
    await request("/api/me/activity", { method: "POST", cookie: alice.cookie });
    await stop();
    await start();
    assert.equal((await request("/api/admin/overview", { cookie: admin.cookie })).data.users.find((user) => user.id === alice.data.user.id).lastSeenAt, lastSeen);
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

  await t.test("community channels allow browsing and posting beyond profile defaults", async () => {
    const before = (await request("/api/me", { cookie: alice.cookie })).data.user.profile;
    assert.equal((await request("/api/community/channels")).status, 401);
    for (const [type, name] of [["school", "University of Waterloo"], ["major", "Psychology"], ["school", "北京大学"], ["major", "计算机科学"]]) {
      const query = `channel=${type}&value=${encodeURIComponent(name)}`;
      const created = await request("/api/community/posts", {
        method: "POST", cookie: alice.cookie,
        body: { channel: type, channelValue: name, topic: "Other channel", content: `A discussion in ${name}`, anonymous: true }
      });
      assert.equal(created.status, 201);
      assert.equal(created.data.post.channelLabel, name);
      assert.equal(created.data.post.authorName, "匿名同学");
      const feed = await request(`/api/community?${query}`, { cookie: bob.cookie });
      assert.equal(feed.status, 200);
      assert.equal(feed.data.channel.label, name);
      assert.ok(feed.data.posts.some((post) => post.id === created.data.post.id));
      const different = await request(`/api/community?channel=${type}&value=Other`, { cookie: bob.cookie });
      assert.ok(!different.data.posts.some((post) => post.id === created.data.post.id));
      const like = `/api/community/posts/${created.data.post.id}/like`;
      assert.equal((await request(`${like}?channel=${type}&value=Other`, { method: "PATCH", cookie: bob.cookie })).status, 404);
      assert.equal((await request(`${like}?${query}`, { method: "PATCH", cookie: bob.cookie })).data.post.likeCount, 1);
      assert.equal((await request(`${like}?channel=all`, { method: "PATCH", cookie: bob.cookie })).data.post.likeCount, 0);
    }
    const catalog = (await request("/api/community/channels", { cookie: bob.cookie })).data;
    assert.ok(catalog.schools.includes("University of Waterloo"));
    assert.ok(catalog.schools.includes("北京大学"));
    assert.ok(catalog.majors.includes("Psychology"));
    assert.ok(catalog.majors.includes("计算机科学"));
    assert.equal((await request("/api/community?channel=school&value=", { cookie: alice.cookie })).status, 400);
    assert.equal((await request(`/api/community?channel=major&value=${"a".repeat(91)}`, { cookie: alice.cookie })).status, 400);
    assert.equal((await request("/api/community/posts", { method: "POST", cookie: alice.cookie, body: { channel: "major", channelValue: {}, content: "Invalid channel" } })).status, 400);
    assert.deepEqual((await request("/api/me", { cookie: alice.cookie })).data.user.profile, before);
    const defaultSchool = await request("/api/community?channel=school", { cookie: alice.cookie });
    assert.equal(defaultSchool.data.channel.label, before.school);
    await stop();
    await start();
    assert.ok((await request("/api/community/channels", { cookie: bob.cookie })).data.majors.includes("Psychology"));
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

  await t.test("creative APIs authenticate, gate video, and reject foreign jobs without provider calls", async () => {
    const cookie = (await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } })).cookie;
    assert.equal((await request("/api/creative/capabilities", { cookie })).data.video, false);
    assert.deepEqual((await request("/api/creative", { cookie })).data.jobs, []);
    assert.equal((await request("/api/creative", { method: "POST", cookie, body: { kind: "video", prompt: "Video" } })).status, 403);
    assert.equal((await request("/api/creative/missing", { cookie: bob.cookie })).status, 404);
    assert.equal((await request("/api/creative/missing/files/missing", { cookie: bob.cookie })).status, 404);
    assert.equal((await request("/api/creative", { method: "POST", cookie, body: { kind: "invalid", prompt: "bad" } })).status, 400);
  });

  await t.test("general chat is permanent, isolated, durable, and independent of course workflows", async () => {
    await stop();
    await start({ fakeAi: true });
    const cookie = (await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } })).cookie;
    const before = (await request("/api/courses", { cookie })).data;
    const route = "/api/courses/general";
    assert.equal((await request(`${route}/messages`)).status, 401);
    assert.deepEqual((await request(`${route}/messages`, { cookie })).data.messages, []);
    assert.equal((await request(route, { method: "DELETE", cookie })).status, 403);
    assert.equal((await request(`${route}/documents`, { method: "POST", cookie, body: { text: "blocked" } })).status, 403);
    const reply = await request(`${route}/chat`, { method: "POST", cookie, body: {
      message: "How do I cook dinner?", mode: "preview",
      attachments: [{ name: "ingredients.txt", mime: "text/plain", dataUrl: "data:text/plain;base64," + Buffer.from("GENERAL_INGREDIENTS tomato and egg").toString("base64") }]
    } });
    assert.equal(reply.status, 201);
    assert.ok(reply.data.messages.every((row) => row.courseId === "general" && row.mode === "general"));
    const payload = JSON.parse(reply.data.messages[1].content);
    assert.ok(payload.messages[0].content.includes("standalone general-purpose conversation"));
    assert.ok(!payload.messages[0].content.includes("Selected study mode:"));
    assert.ok(reply.data.messages[1].content.includes("GENERAL_INGREDIENTS"));
    assert.ok(!reply.data.messages[1].content.includes("Mode-specific course evidence"));
    assert.deepEqual((await request("/api/courses", { cookie })).data, before);
    assert.deepEqual((await request(`${route}/messages`, { cookie: bob.cookie })).data.messages, []);
    await stop();
    await start({ fakeAi: true });
    assert.equal((await request(`${route}/messages`, { cookie })).data.messages.length, 2);
    const followup = await request(`${route}/chat`, { method: "POST", cookie, body: { message: "Continue using my ingredients" } });
    assert.ok(followup.data.messages[1].content.includes("GENERAL_INGREDIENTS"));
    const response = await fetch(`${base}${route}/chat`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "Suggest a simple dinner", stream: true }) });
    const events = [];
    assert.equal(response.status, 200);
    await readEvents(response, ({ event, data }) => { events.push({ event, data: JSON.parse(data) }); });
    assert.ok(events.filter((row) => row.event === "delta").length > 1);
    const done = events.find((row) => row.event === "done");
    assert.ok(done && done.data.messages.every((row) => row.courseId === "general"));
    assert.equal((await request(`${route}/messages`, { cookie })).data.messages.length, 6);
    assert.deepEqual((await request(`${route}/messages`, { cookie: bob.cookie })).data.messages, []);
    assert.deepEqual((await request("/api/courses", { cookie })).data, before);
  });

  await t.test("all seven modes use late course content and durable chat attachments after restart", async () => {
    await stop();
    await start({ fakeAi: true });
    const login = await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } });
    const cookie = login.cookie;
    const course = await request("/api/courses", { method: "POST", cookie, body: { name: "Complete sources" } });
    const id = course.data.course.id;
    const route = `/api/courses/${id}`;
    const text = "background ".repeat(2000) + " LATE_COURSE_EVIDENCE";
    await request(`${route}/documents`, { method: "POST", cookie, body: { title: "Long lecture", text } });
    for (let i = 0; i < 9; i++) await request(`${route}/documents`, { method: "POST", cookie, body: { title: `Extra ${i}`, text: `SOURCE_${i}` } });
    const attachmentText = "attachment background ".repeat(700) + " LATE_ATTACHMENT_EVIDENCE";
    const uploaded = await request(`${route}/chat`, { method: "POST", cookie, body: { message: "Read these sources", attachments: [
      { name: "之前的讲义.txt", mime: "text/plain", text: attachmentText },
      { name: "diagram.png", kind: "image", mime: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" }
    ] } });
    assert.equal(uploaded.status, 201);
    await stop();
    await start({ fakeAi: true });
    const modes = require("../public/study-modes");
    for (const mode of Object.keys(modes.modes)) {
      const reply = await request(`${route}/chat`, { method: "POST", cookie, body: { mode, message: "teach me using the previous attachment and the end of the course lecture" } });
      assert.equal(reply.status, 201);
      const providerRequest = JSON.parse(reply.data.messages[1].content);
      assert.equal(providerRequest.model, "gpt-6.1-sol", mode);
      assert.ok(providerRequest.messages[0].content.includes("intermediate steps a beginner needs"), mode);
      assert.ok(providerRequest.messages[0].content.includes("Teach the method and reasons before"), mode);
      const content = providerRequest.messages[1].content;
      const prompt = content[0].text;
      assert.ok(prompt.includes("LATE_COURSE_EVIDENCE"), mode);
      assert.ok(prompt.includes("LATE_ATTACHMENT_EVIDENCE"), mode);
      assert.ok(prompt.includes("之前的讲义.txt"), mode);
      for (let i = 0; i < 9; i++) assert.ok(prompt.includes(`SOURCE_${i}`), mode);
      assert.equal(content[1].image_url.url, "data:image/png;base64,aGVsbG8=");
    }
    const response = await fetch(base + `${route}/chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ mode: "review", stream: true, message: "Continue the previous attachment", attachments: [{ name: "stream.txt", text: "STREAM_SAVED_EVIDENCE" }] }) });
    let answer = "";
    await readEvents(response, ({ event, data }) => {
      const packet = JSON.parse(data);
      if (event === "delta") answer += packet.text;
      assert.notEqual(event, "error");
    });
    assert.ok(answer.includes("LATE_ATTACHMENT_EVIDENCE") && answer.includes("LATE_COURSE_EVIDENCE"));
    const afterStream = await request(`${route}/chat`, { method: "POST", cookie, body: { message: "Use stream.txt again" } });
    assert.ok(afterStream.data.messages[1].content.includes("STREAM_SAVED_EVIDENCE"));
    const other = await request("/api/courses", { method: "POST", cookie, body: { name: "Isolated" } });
    const isolated = await request(`/api/courses/${other.data.course.id}/chat`, { method: "POST", cookie, body: { message: "Continue the previous attachment" } });
    assert.ok(!isolated.data.messages[1].content.includes("LATE_ATTACHMENT_EVIDENCE"));
    for (const item of (await request(`${route}/messages`, { cookie })).data.messages) {
      assert.equal(item.dataUrl, undefined);
      for (const attachment of item.attachments || []) {
        assert.equal(attachment.dataUrl, undefined);
        assert.equal(attachment.text, undefined);
      }
    }
  });

  await t.test("image history retains private previews through streams, restart and legacy backfill", async () => {
    const cookie = (await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } })).cookie;
    const id = (await request("/api/courses", { method: "POST", cookie, body: { name: "Picture history" } })).data.course.id;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII=", "base64");
    const response = await fetch(base + `/api/courses/${id}/chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ message: "怎么做", stream: true, attachments: [{ name: "题目.png", kind: "image", mime: "image/png", dataUrl: `data:image/png;base64,${png.toString("base64")}` }] }) });
    const packets = [];
    await readEvents(response, ({ event, data }) => packets.push({ event, ...JSON.parse(data) }));
    const startPacket = packets.find((packet) => packet.event === "start");
    const done = packets.find((packet) => packet.event === "done");
    assert.ok(done);
    assert.equal(startPacket.message.displayText, "怎么做");
    assert.equal(startPacket.message.attachments[0].name, "题目.png");
    assert.equal(startPacket.message.attachments[0].dataUrl, undefined);
    const imageUrl = startPacket.message.attachments[0].url;
    async function checkImage() {
      const result = await fetch(base + imageUrl, { headers: { cookie } });
      assert.equal(result.status, 200);
      assert.equal(result.headers.get("content-type"), "image/png");
      assert.match(result.headers.get("cache-control"), /no-store/);
      assert.deepEqual(Buffer.from(await result.arrayBuffer()), png);
    }
    await checkImage();
    assert.equal((await fetch(base + imageUrl)).status, 401);
    assert.equal((await fetch(base + imageUrl, { headers: { cookie: bob.cookie } })).status, 404);
    assert.equal((await fetch(base + imageUrl.replace("index=0", "index=99"), { headers: { cookie } })).status, 404);
    await stop();
    await start({ fakeAi: true });
    assert.equal((await request(`/api/courses/${id}/messages`, { cookie })).data.messages[0].attachments[0].url, imageUrl);
    await checkImage();
    // Pre-preview releases saved the bytes and message association, but no card metadata.
    await stop();
    const file = path.join(directory, "database.json");
    const state = JSON.parse(await fs.readFile(file, "utf8"));
    delete state.messages[startPacket.message.id].attachments;
    delete state.messages[startPacket.message.id].displayText;
    await fs.writeFile(file, JSON.stringify(state));
    await start({ fakeAi: true });
    const restored = (await request(`/api/courses/${id}/messages`, { cookie })).data.messages[0];
    assert.equal(restored.displayText, "怎么做");
    assert.equal(restored.attachments[0].url, imageUrl);
    await checkImage();
    await request(`/api/courses/${id}`, { method: "DELETE", cookie });
    assert.equal((await fetch(base + imageUrl, { headers: { cookie } })).status, 404);
  });

  await t.test("saved learning style reaches every mode, follow-ups and streams without ignoring combined checkboxes", async () => {
    const cookie = (await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } })).cookie;
    const previous = (await request("/api/me", { cookie })).data.user.preferences;
    const bobPreferences = (await request("/api/me", { cookie: bob.cookie })).data.user.preferences;
    const selected = { englishTerms: true, englishAnswers: true, chineseExplanations: true, customInstruction: "" };
    const saved = await request("/api/me/preferences", { method: "PUT", cookie, body: selected });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.user.preferences, selected);
    await stop();
    await start({ fakeAi: true });
    assert.deepEqual((await request("/api/me", { cookie })).data.user.preferences, selected);
    const id = (await request("/api/courses", { method: "POST", cookie, body: { name: "Learning Style" } })).data.course.id;
    for (const mode of Object.keys(require("../public/study-modes").modes)) {
      const result = await request(`/api/courses/${id}/chat`, { method: "POST", cookie, body: { mode, message: "怎么做" } });
      assert.equal(result.status, 201);
      const system = JSON.parse(result.data.messages[1].content).messages[0].content;
      assert.match(system, /English answer ON/);
      assert.match(system, /Chinese explanation ON/);
      assert.match(system, /Combined checkboxes/);
      assert.ok(system.includes("teach first in 中文讲解"));
      assert.ok(system.includes("Language choices do not reduce teaching depth"));
      assert.ok(system.includes("do not front-load all final answers"));
      assert.ok(system.includes("State the relevant rule or general formula before substituting"));
      assert.ok(system.includes(String.raw`\sqrt{x}`));
      assert.ok(system.includes("StudyBridge renders mathematical notation"));
      assert.ok(!system.includes("StudyBridge chat uses plain text"));
      assert.ok(!system.includes("Use readable plain-text math"));
      assert.match(system, /question merely written in Chinese/);
      assert.ok(!system.includes("old default toggles"));
    }
    const override = { ...selected, chineseExplanations: false };
    const response = await fetch(`${base}/api/courses/${id}/chat`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "继续讲这道题", mode: "guided", stream: true, learningStyle: override }) });
    const packets = [];
    await readEvents(response, ({ event, data }) => packets.push({ event, ...JSON.parse(data) }));
    const done = packets.find((packet) => packet.event === "done");
    assert.ok(done);
    const answer = done.messages[1].content;
    const system = JSON.parse(answer.slice(answer.indexOf("{"))).messages[0].content;
    assert.match(system, /English answer ON/);
    assert.match(system, /Chinese explanation OFF/);
    assert.ok(system.includes("Chinese explanation OFF does not remove the worked explanation"));
    assert.ok(!system.includes("Combined checkboxes"));
    assert.deepEqual((await request("/api/me", { cookie })).data.user.preferences, selected, "per-request snapshot must not silently rewrite the saved profile");
    assert.deepEqual((await request("/api/me", { cookie: bob.cookie })).data.user.preferences, bobPreferences);
    await request("/api/me/preferences", { method: "PUT", cookie, body: previous });
  });

  const streamingCookie = (await request("/api/auth/login", { method: "POST", body: { email: "alice@example.test", password: "HealthCheck-Password-123!" } })).cookie;
  async function streamCourse(name) {
    return (await request("/api/courses", { method: "POST", cookie: streamingCookie, body: { name } })).data.course.id;
  }
  async function streamReply(id, message, { onPacket = () => {}, signal, mode = "cheatsheet" } = {}) {
    const response = await fetch(`${base}/api/courses/${id}/chat`, {
      method: "POST", headers: { cookie: streamingCookie, "content-type": "application/json" }, signal,
      body: JSON.stringify({ message, mode, stream: true })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    const packets = [];
    await readEvents(response, async ({ event, data }) => {
      const packet = { event, ...JSON.parse(data) };
      packets.push(packet);
      await onPacket(packet, packets);
    });
    return packets;
  }

  await t.test("streaming retains authentication, course isolation and input validation", async () => {
    const id = await streamCourse("Stream guards");
    const body = { message: "Stream this", stream: true };
    assert.equal((await request(`/api/courses/${id}/chat`, { method: "POST", body })).status, 401);
    assert.equal((await request(`/api/courses/${id}/chat`, { method: "POST", cookie: bob.cookie, body })).status, 404);
    assert.equal((await request(`/api/courses/${id}/chat`, { method: "POST", cookie: streamingCookie, body: { stream: true } })).status, 400);
    assert.deepEqual((await request(`/api/courses/${id}/messages`, { cookie: streamingCookie })).data.messages, []);
  });

  await t.test("web, JSON, streaming and fallback preserve the selected task model", async () => {
    await stop();
    await start({ fakeAi: true, webSearch: true });
    for (const [message, expected] of [["你好", "gpt-6-luna"], ["请推导这个公式", "gpt-6.1-sol"]]) {
      const id = await streamCourse(`Routing ${expected}`);
      await request(`/api/courses/${id}/documents`, { method: "POST", cookie: streamingCookie, body: { title: "Long material", text: "background ".repeat(1000) } });
      const reply = await request(`/api/courses/${id}/chat`, { method: "POST", cookie: streamingCookie, body: { message, mode: "guided" } });
      assert.equal(reply.status, 201);
      assert.equal(reply.data.model, expected);
      assert.equal(JSON.parse(reply.data.messages[1].content).model, expected);
      const streamId = await streamCourse(`Stream routing ${expected}`);
      const packets = await streamReply(streamId, message, { mode: "guided" });
      const done = packets.at(-1);
      assert.equal(done.event, "done");
      assert.equal(done.model, expected);
      assert.equal(JSON.parse(done.messages[1].content.split("\n\n")[1]).model, expected);
      const fallbackId = await streamCourse(`Fallback ${expected}`);
      const fallback = await streamReply(fallbackId, `STREAM_EARLY_FAIL ${message}`, { mode: "guided" });
      const final = fallback.at(-1);
      assert.equal(final.event, "done");
      const outbound = JSON.parse(final.messages[1].content.split("\n\n")[1]);
      assert.ok(outbound.messages, "both web tools failed, so Chat Completions must be used");
      assert.equal(outbound.model, expected);
      assert.equal(final.model, expected);
    }
  });

  await t.test("both AI APIs deliver incremental text before completion and persist one final reply", async () => {
    for (const webSearch of [false, true]) {
      await stop();
      await start({ fakeAi: true, webSearch });
      const id = await streamCourse(`Incremental ${webSearch}`);
      let checkedPartial = false;
      const packets = await streamReply(id, "STREAM_SLOW: explain this course", { onPacket: async (packet) => {
        if (packet.event !== "delta" || checkedPartial) return;
        checkedPartial = true;
        const during = (await request(`/api/courses/${id}/messages`, { cookie: streamingCookie })).data.messages;
        assert.equal(during.length, 1, "First text must arrive before final assistant persistence");
        assert.equal(during[0].role, "user");
      } });
      assert.equal(checkedPartial, true);
      assert.ok(packets.filter((packet) => packet.event === "delta").length > 1);
      const text = packets.filter((packet) => packet.event === "delta").map((packet) => packet.text).join("");
      assert.ok(text.startsWith("逐步输出中文😀。"));
      assert.ok(!text.includes("PRIVATE_REASONING_MUST_NOT_APPEAR"));
      const prompt = JSON.parse(text.split("\n\n")[1]);
      assert.equal(prompt.stream, true);
      assert.ok((prompt.messages || prompt.input)[0].content.includes("Cheatsheet mode requirements"));
      if (webSearch) assert.ok(packets.some((packet) => packet.phase === "searching") && packets.some((packet) => packet.phase === "integrating"));
      const done = packets.at(-1);
      assert.equal(done.event, "done");
      assert.equal(done.messages[1].content, text);
      const history = (await request(`/api/courses/${id}/messages`, { cookie: streamingCookie })).data.messages;
      assert.deepEqual(history, done.messages);
    }
  });

  await t.test("stream failures retain partial text without duplicate fallback output or private errors", async () => {
    for (const webSearch of [false, true]) {
      await stop();
      await start({ fakeAi: true, webSearch });
      for (const marker of ["STREAM_FAIL_AFTER", "STREAM_TRUNCATED"]) {
        const id = await streamCourse(`${marker} ${webSearch}`);
        const packets = await streamReply(id, marker);
        assert.equal(packets.filter((packet) => packet.event === "delta").length, 1);
        assert.equal(packets.at(-1).event, "error");
        assert.ok(!JSON.stringify(packets).includes("INTERNAL_PROVIDER_DETAIL"));
        const history = (await request(`/api/courses/${id}/messages`, { cookie: streamingCookie })).data.messages;
        assert.equal(history.length, 2);
        assert.equal(history[1].content, packets.find((packet) => packet.event === "delta").text);
        assert.equal(history[1].interrupted, true);
      }
    }
    const id = await streamCourse("Early web failure");
    const packets = await streamReply(id, "STREAM_EARLY_FAIL");
    assert.equal(packets.at(-1).event, "done");
    assert.ok(packets.at(-1).messages[1].content.includes('"messages":'));
  });

  await t.test("disconnect cancels upstream generation and saves an interrupted reply", async () => {
    const id = await streamCourse("Canceled reply");
    const controller = new AbortController();
    let partial = "";
    await assert.rejects(streamReply(id, "STREAM_ABORT", { signal: controller.signal, onPacket: (packet) => {
      if (packet.event === "delta") { partial += packet.text; controller.abort(); }
    } }), { name: "AbortError" });
    let history = [];
    const deadline = Date.now() + 2500;
    while (history.length < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      history = (await request(`/api/courses/${id}/messages`, { cookie: streamingCookie })).data.messages;
    }
    assert.equal(history.length, 2);
    assert.equal(history[1].content, partial);
    assert.equal(history[1].interrupted, true);
  });

  await t.test("unconfigured AI keeps the existing fallback in the streaming protocol", async () => {
    await stop();
    await start();
    const id = await streamCourse("Local fallback stream");
    const packets = await streamReply(id, "Help with review");
    assert.equal(packets.at(-1).event, "done");
    assert.ok(packets.find((packet) => packet.event === "delta").text.includes("OPENAI_API_KEY"));
    assert.equal((await request(`/api/courses/${id}/messages`, { cookie: streamingCookie })).data.messages.length, 2);
  });
});
