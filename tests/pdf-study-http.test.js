const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { readEvents } = require("../public/chat-stream");

test("study PDFs retain original private bytes across restart, API transports, streaming fallback, source edits and deletion", { timeout: 45000 }, async (t) => {
  const root = path.resolve(__dirname, ".."), directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-pdf-input-"));
  const database = path.join(directory, "db.json");
  let child, base;
  const stop = async () => { if (child?.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } };
  t.after(async () => { await stop(); assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(directory, { recursive: true, force: true }); });
  async function start(webSearch) {
    child = spawn(process.execPath, ["--require", "./tests/fixtures/echo-ai.js", "server.js"], { cwd: root, env: {
      ...process.env, PORT: "0", NODE_ENV: "test", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: database, LOCAL_DB_BACKUP_DISABLED: "true",
      OWNER_INVITE_CODE: "pdf-test-owner", ADMIN_EMAILS: "pdf-owner@example.test", REQUIRE_INVITE_CODE: "true", REQUIRE_EMAIL_VERIFICATION: "false",
      OPENAI_API_KEY: "fixture", OPENAI_WEB_SEARCH: String(webSearch), OPENAI_SIMPLE_MODEL: "gpt-6-luna", OPENAI_COMPLEX_MODEL: "gpt-6.1-sol", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: ""
    }, stdio: ["ignore", "pipe", "pipe"] });
    base = await new Promise((resolve, reject) => { let output = ""; const timer = setTimeout(() => reject(Error("Startup timed out")), 10000); child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve("http://127.0.0.1:" + match[1]); } }); child.on("error", reject); });
  }
  await start(false);
  const request = async (route, method = "GET", body, cookie = "") => {
    const response = await fetch(base + route, { method, headers: { "content-type": "application/json", cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], data: await response.json() };
  };
  const owner = await request("/api/auth/register", "POST", { name: "PDF owner", email: "pdf-owner@example.test", password: "PDF-Test-Password1!", passwordConfirm: "PDF-Test-Password1!", inviteCode: "pdf-test-owner" });
  assert.equal(owner.status, 201); const cookie = owner.cookie;
  const created = await request("/api/courses", "POST", { name: "Multipart source", term: "test" }, cookie), id = created.data.course.id, route = `/api/courses/${id}`;
  const pdf = await fs.readFile(path.join(root, "tests/fixtures/schedule-full.pdf"));
  const dataUrl = "data:application/pdf;base64," + pdf.toString("base64");
  const parts = Array.from({ length: 6 }, (_, n) => `${n + 1}. Exercise\n(a) First part\n(b) Second part\n(c) Third part\n(d) Fourth part`).join("\n");
  const reply = await request(route + "/chat", "POST", { mode: "guided", message: "请带着我学习这部分内容，按概念、例子、检查理解的顺序来。", attachments: [{ name: "paper.pdf", mime: "application/pdf", dataUrl }, { name: "questions.txt", kind: "text", text: parts }] }, cookie);
  assert.equal(reply.status, 201); assert.equal(reply.data.model, "gpt-6.1-sol");
  const outbound = JSON.parse(reply.data.messages[1].content), content = outbound.messages[1].content;
  assert.equal(content.find((part) => part.type === "file").file.file_data, dataUrl);
  assert.equal(content.find((part) => part.type === "file").file.filename, "paper.pdf");
  assert(content[0].text.includes('"number":6,"parts":["a","b","c","d"]'));
  assert(outbound.messages[0].content.includes("cover every numbered problem and every subpart"));
  assert(outbound.messages[0].content.includes("Teach progressively WITHIN each part"));
  assert.equal(reply.data.messages[0].attachments[0].dataUrl, undefined);
  assert.equal(reply.data.messages[0].attachments[0].file_data, undefined);
  await stop(); await start(true);
  const again = await request(route + "/chat", "POST", { mode: "guided", message: "继续讲解 paper.pdf，只解释第一题，不要给其余题答案" }, cookie);
  assert.equal(again.status, 201);
  const responses = JSON.parse(again.data.messages[1].content);
  assert.equal(responses.input[1].content.find((part) => part.type === "input_file").file_data, dataUrl);
  assert(responses.input[1].content[0].text.includes("只解释第一题，不要给其余题答案"));
  const streamed = await fetch(base + route + "/chat", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ stream: true, mode: "guided", message: "STREAM_EARLY_FAIL 继续讲解 paper.pdf" }) });
  let done;
  await readEvents(streamed, ({ event, data }) => { if (event === "done") done = JSON.parse(data); });
  assert(done);
  const fallback = JSON.parse(done.messages[1].content.split("\n\n")[1]);
  assert.equal(fallback.messages[1].content.find((part) => part.type === "file").file.file_data, dataUrl);
  const doc = await request(route + "/documents", "POST", { title: "Source PDF", fileName: "source.pdf", fileType: "application/pdf", fileData: pdf.toString("base64") }, cookie);
  assert.equal(doc.status, 201); assert.equal(doc.data.document.hasSourcePdf, true); assert.equal(doc.data.document.dataUrl, undefined);
  const docId = doc.data.document.id;
  const stored = JSON.parse(await fs.readFile(database, "utf8"));
  assert(Object.values(stored.materials).some((row) => row.id === `DOCFILE#${docId}#PDF` && row.value.dataUrl === dataUrl));
  const isolated = await request("/api/courses", "POST", { name: "Course PDF only" }, cookie), docOnlyRoute = `/api/courses/${isolated.data.course.id}`;
  const docOnly = await request(docOnlyRoute + "/documents", "POST", { title: "Native source", fileName: "source.pdf", fileType: "application/pdf", fileData: pdf.toString("base64") }, cookie);
  const docReply = await request(docOnlyRoute + "/chat", "POST", { message: "请讲解这份 PDF", mode: "guided" }, cookie);
  assert.equal(JSON.parse(docReply.data.messages[1].content).input[1].content.find((part) => part.type === "input_file").file_data, dataUrl);
  const listed = await request(docOnlyRoute + "/documents", "GET", null, cookie); assert.equal(listed.data.documents[0].dataUrl, undefined);
  const changed = await request(docOnlyRoute + "/documents/" + docOnly.data.document.id, "PUT", { title: "Edited source", text: "The student replaced the source text." }, cookie);
  assert.equal(changed.data.document.hasSourcePdf, false);
  const afterEdit = await request(docOnlyRoute + "/chat", "POST", { message: "Explain the edited source", mode: "guided" }, cookie);
  assert.equal(typeof JSON.parse(afterEdit.data.messages[1].content).input[1].content, "string", "Old visuals must not override edited course text");
  await request(route + "/documents/" + docId, "DELETE", null, cookie);
  const afterDelete = JSON.parse(await fs.readFile(database, "utf8"));
  assert(!Object.values(afterDelete.materials).some((row) => row.id.startsWith(`DOCFILE#${docId}#`)));
  assert.equal((await request(route + "/documents", "GET")).status, 401);
  const incompleteCourse = await request("/api/courses", "POST", { name: "Incomplete provider response" }, cookie);
  const incompleteRoute = `/api/courses/${incompleteCourse.data.course.id}`;
  const incomplete = await request(incompleteRoute + "/chat", "POST", { message: "NONSTREAM_INCOMPLETE explain these problems", mode: "guided" }, cookie);
  assert(incomplete.status >= 400, "A truncated provider answer must not be reported as complete");
  const incompleteHistory = await request(incompleteRoute + "/messages", "GET", null, cookie);
  assert(!incompleteHistory.data.messages.some((item) => item.role === "assistant" && !item.interrupted));
});
