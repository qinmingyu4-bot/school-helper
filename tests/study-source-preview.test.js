"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Module } = require("node:module");
const { Readable } = require("node:stream");
const { PDFDocument } = require("pdf-lib");
const { SESSION_COOKIE, hashToken } = require("../lib/security");
const { revision } = require("../lib/study-index");
const { answerMarkdown, validateAnswers } = require("../lib/problem-set");
const { link, resolveCitation } = require("../lib/study-source-preview");
const { candidates, locate } = require("../public/study-formulas");
const markdown = require("../public/markdown");
const { studyMessageText, buildRecentStudyHistory } = require("../lib/study-history");

test("formula matching is local, bounded, and highlights only a unique complete expression", () => {
  const keys = candidates(String.raw`Use \(C = 2 \times q\). Then \[MC = \frac{dC}{dq}\].`);
  assert.deepEqual(keys, ["C=2*q", "MC=dC/dq"]);
  assert.deepEqual(candidates("MC = 2q"), ["MC=2q"]);
  const lines = ["中文说明 C ＝ 2 × q。", "Unrelated passage"];
  const match = locate(lines, keys);
  assert.equal(lines[match.line].slice(match.start, match.end), "C ＝ 2 × q");
  assert.equal(locate(["C = 2q", "C = 2q"], ["C=2q"]), null);
  assert.equal(locate(["MC = 20"], ["MC=2"]), null);
  assert.equal(locate(["MC = 2 + q"], ["MC=2"]), null);
});

test("real citation locators become modal links at the matching step and no-source cases stay explicit", () => {
  const course = { id: "course_1", idForJob: "task_" + "a".repeat(40), conversationId: "default" };
  const job = { courseId: course.id, id: course.idForJob, conversationId: course.conversationId };
  const part = { id: "a", text: String.raw`The notes give \(C=2q\).` + "\n\nSubstitute q to find the result.", basis: "derived", status: "done", sources: ["q1.S1"] };
  const question = { id: "q1", number: "1", parts: ["a"] };
  const evidence = { q1: [{ ref: "q1.S1", sourceId: "doc:lesson", name: "Lecture.pdf", location: "PDF 第 2 页",
    text: "The original formula is C = 2q.", start: 0, end: 31, pages: [2] }] };
  const { answers, failed } = validateAnswers({ answers: [{ id: "q1", parts: [part] }] }, [question], evidence);
  assert.deepEqual(failed, []);
  const answer = answerMarkdown(answers[0], (entry, subpart, source) => link(job, entry, subpart, source));
  assert(answer.indexOf("Lecture.pdf") < answer.indexOf("Substitute q"));
  assert.match(answer, /derivation based on the cited material/);
  const html = markdown.render(answer);
  assert.match(html, /<details class="study-source-disclosure"><summary>来源<\/summary><ul><li>/);
  assert.doesNotMatch(html, /<details[^>]*\sopen[ >]/);
  assert.match(html, /<a href="\/api\/courses\/course_1\/study-source\/task_[a-f0-9]+\?[^"]+" data-study-source="">Lecture.pdf/);
  assert.doesNotMatch(markdown.render("[unsafe](/api/me/profile)"), /<a/);
  assert.match(answerMarkdown({ ...answers[0], parts: [{ ...part, basis: "general", sources: [] }] }), /No supporting passage/);
});

test("multiple citations form one quiet disclosure and produce no extra model input", () => {
  const job = { id: "task_" + "c".repeat(40), courseId: "math", conversationId: "default" };
  const answer = { id: "q1", number: "1", parts: [{
    id: "a", status: "done", basis: "derived", text: "Worked solution.",
    sources: [{ name: "Lecture [A].pdf", location: "PDF 第 2 页", ref: "q1.S1" },
      { name: "Lecture B.pdf", location: "PDF 第 3 页", ref: "q1.S2" }]
  }] };
  const sourceLink = (entry, part, source) => link(job, entry, part, source);
  const html = markdown.render(answerMarkdown(answer, sourceLink));
  assert.equal((html.match(/<summary>来源<\/summary>/g) || []).length, 1);
  assert.equal((html.match(/data-study-source/g) || []).length, 2);
  assert.match(html, /Lecture \[A\]\.pdf，PDF 第 2 页/);
  assert.match(html, /Lecture B\.pdf，PDF 第 3 页/);
  assert.deepEqual(markdown.renderBlocks(answerMarkdown(answer, sourceLink)).join(""), html);
  assert.doesNotMatch(markdown.render("（来源：[External](https://example.com/)）"), /<details/);

  const oldContent = answerMarkdown(answer, null, { forStorage: true });
  const saved = { role: "assistant", studyJobId: job.id, content: answerMarkdown(answer, sourceLink, { forStorage: true }) };
  assert.match(saved.content, /\/study-source\//);
  assert.equal(studyMessageText(saved), oldContent);
  assert.equal(buildRecentStudyHistory([saved], "为什么这样算？"),
    buildRecentStudyHistory([{ ...saved, content: oldContent }], "为什么这样算？"));
});

test("legacy text citations use the stored offsets and original version", () => {
  const source = { text: "Intro\nC = 2q\nNext", kind: "text", name: "Lecture.txt" };
  const saved = { revision: revision(source), location: "提取文本第 2–2 行（字符 7–12）" };
  const view = resolveCitation(saved, { text: "C = 2q" }, source);
  assert.equal(view.excerpt, "C = 2q");
  assert.equal(view.pdf, false);
  assert.deepEqual(view.formulas, ["C=2q"]);
  assert.throws(() => resolveCitation(saved, { text: "C = 2q" }, { ...source, text: "New material" }), { statusCode: 409 });
  assert.throws(() => resolveCitation(saved, {}, null), { statusCode: 404 });
});

test("citation routes isolate accounts and conversations and serve only the verified original PDF and location", async (t) => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "sb-source-preview-"));
  t.after(() => fs.rm(scratch, { recursive: true, force: true }));
  const server = path.resolve(__dirname, "../server.js");
  const source = (await fs.readFile(server, "utf8")).split("\nconst server = http.createServer(")[0].replace("loadEnvFile();", "");
  const loaded = new Module(server, module);
  loaded.filename = server;
  loaded.paths = module.paths;
  loaded._compile(source + "\nmodule.exports={routeApi,db};", server);
  const { routeApi, db } = loaded.exports;
  db.dynamo = null;
  db.local.file = path.join(scratch, "db.json");

  for (const id of ["alice", "bob"]) {
    await db.createUser({ id, name: id, email: id + "@example.test", profile: {}, passwordVersion: 0 });
    await db.createSession({ tokenHash: hashToken(id), userId: id, expiresAt: Date.now() + 60000, passwordVersion: 0 });
  }
  const job = { id: "task_" + "b".repeat(40), userId: "alice", courseId: "math", conversationId: "default", status: "completed",
    createdAt: new Date().toISOString(), batches: [{ id: "b1", results: ["RESULT#fixture"] }] };
  await db.createCourse({ id: "math", userId: "alice", name: "Economics" });
  const text = "First page\nC = 2q";
  const sourcePages = [{ page: 1, start: 0, end: 10 }, { page: 2, start: 11, end: text.length }];
  await db.createDocument({ id: "lecture", userId: "alice", courseId: "math", title: "Lecture.pdf", hasSourcePdf: true, sourcePages, text });
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("First page");
  pdf.addPage().drawText("C = 2q");
  const bytes = Buffer.from(await pdf.save());
  await db.writeMaterial("alice", "math", "DOCFILE#lecture#PDF", { dataUrl: "data:application/pdf;base64," + bytes.toString("base64") });
  const ref = { ref: "q1.S1", sourceId: "doc:lecture", revision: revision({ name: "Lecture.pdf", sourcePages, text }),
    start: 0, end: text.length, pages: [1, 2], location: "PDF 第 1、2 页" };
  const part = { id: "a", text: "C = 2q", sources: [ref] }, answer = { id: "q1", parts: [part] };
  await db.writeMaterial("alice", "math", "RESULT#fixture", { answers: [answer] });
  await db.saveStudyJob(job);
  async function get(url, user) {
    const req = Readable.from([]);
    Object.assign(req, { method: "GET", url, headers: user ? { cookie: `${SESSION_COOKIE}=${user}` } : {} });
    const result = { headers: {} };
    const res = {
      setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
      getHeader(name) { return result.headers[name.toLowerCase()]; },
      writeHead(status, headers) { result.status = status; for (const [name, value] of Object.entries(headers)) res.setHeader(name, value); },
      end(body) { result.body = result.headers["content-type"] === "application/pdf" ? body : JSON.parse(body); },
    };
    try { await routeApi(req, res); }
    catch (error) { result.status = error.statusCode || 500; result.body = { error: error.message }; }
    return result;
  }
  const href = link(job, answer, part, ref);
  assert.equal((await get(href)).status, 401);
  assert.equal((await get(href, "bob")).status, 404);
  assert.equal((await get(href.replace("conversation=default", "conversation=other"), "alice")).status, 404);
  assert.equal((await get(href.replace("ref=q1.S1", "ref=q1.S99"), "alice")).status, 404);
  const view = await get(href, "alice");
  assert.equal(view.status, 200);
  assert.equal(view.headers["cache-control"], "private, no-store");
  assert.deepEqual(view.body.pages, [1, 2]);
  assert.equal(view.body.initialPage, 2);
  assert.deepEqual(view.body.formulas, ["C=2q"]);
  const original = await get(href + "&pdf=1", "alice");
  assert.equal(original.status, 200);
  assert.deepEqual(original.body, bytes);
  await db.updateDocument("alice", "math", "lecture", { text: "Replaced lecture" });
  assert.equal((await get(href, "alice")).status, 409);
  assert.equal((await get(href + "&pdf=1", "alice")).status, 409);
  await db.deleteDocument("alice", "math", "lecture");
  assert.equal((await get(href, "alice")).status, 404);
});

test("closing an open citation returns focus and restores the answer position", async () => {
  const vm = require("node:vm");
  class Element extends EventTarget {
    constructor() { super(); this.children = []; this.isConnected = true; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event("close")); }
    remove() { this.isConnected = false; }
    focus(options) { this.focusOptions = options; }
  }
  const body = new Element(), window = {
    StudyBridgeI18n: { text: (value) => value },
    StudyBridgeStudyFormulas: { locate },
  };
  const chat = { scrollTop: 100, isConnected: true };
  let position = 45, key = "same chat";
  const trigger = new Element();
  trigger.closest = () => chat;
  trigger.getBoundingClientRect = () => ({ top: position });
  const program = await fs.readFile(path.resolve(__dirname, "../public/study-source-preview.js"), "utf8");
  vm.runInNewContext(program, { window, document: { body, createElement: () => new Element() }, AbortController });
  const href = "/citation", calls = [];
  const options = { href, trigger, currentKey: () => key,
    api: async (request) => { calls.push(request); return { name: "Lecture", location: "Page 1", excerpt: "C = 2q", formulas: ["C=2q"] }; } };
  window.StudyBridgeStudySource.open(options);
  await new Promise(setImmediate);
  assert.equal(window.StudyBridgeStudySource.isOpen(), true);
  assert.deepEqual(calls, [href]);
  assert.equal(body.children[0].children[0].children[0].textContent, "Lecture");
  assert.equal(body.children[0].children[2].children[1].children[1].textContent, "C = 2q");
  position = 75;
  body.children[0].close();
  assert.equal(chat.scrollTop, 130);
  assert.equal(trigger.focusOptions.preventScroll, true);
  window.StudyBridgeStudySource.open(options);
  key = "another chat";
  window.StudyBridgeStudySource.sync(key);
  await new Promise(setImmediate);
  assert.equal(window.StudyBridgeStudySource.isOpen(), false);
  assert.equal(chat.scrollTop, 130);
});
