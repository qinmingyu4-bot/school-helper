const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { StudyBridgeDatabase } = require("../lib/database");
const { createStudyIndex } = require("../lib/study-index");
const { createStudyJobs } = require("../lib/study-jobs");
const { detectSet } = require("../lib/problem-set");
async function waitFor(work, check, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const value = await work(); if (check(value)) return value; await delay(10); }
  throw Error("Background fixture did not reach expected state.");
}
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-jobs-")), services = [];
  const db = new StudyBridgeDatabase(); db.dynamo = null; db.local.file = path.join(directory, "db.json");
  t.after(async () => { for (const service of services) await service.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  for (const id of ["math", "stats"]) await db.createCourse({ id, userId: "alice", name: id });
  for (let n = 0; n < 7; n++) await db.createDocument({ id: `doc-${n}`, userId: "alice", courseId: "math", title: `Lecture ${n}.txt`, text: "background ".repeat(200) + `Opportunity cost COURSE_MATH_${n}` });
  await db.createDocument({ id: "foreign", userId: "alice", courseId: "stats", title: "Foreign.txt", text: "opportunity cost FOREIGN_STATS_EVIDENCE" });
  const calls = new Map(); let current = 0, maximum = 0;
  const paper = { name: "questions.txt", kind: "text", text: Array.from({ length: 20 }, (_, n) => `${n + 1}. Explain opportunity cost.\n(a) State the method.\n(b) Show the working.`).join("\n") };
  const loadSources = async (job) => [
    ...(await db.listDocuments(job.userId, job.courseId)).map((doc) => ({ id: `doc:${doc.id}`, name: doc.title, text: doc.text, sourcePages: [] })),
    ...(await db.listChatAttachmentGroups(job.userId, job.courseId, job.conversationId)).flatMap((group) => group.attachments.map((item, n) => ({ ...item, id: `attachment:${group.id}:${n}`, materialId: group.id, attachmentIndex: n })))
  ];
  function service() {
    const value = createStudyJobs({ db, index: createStudyIndex({ db }), loadSources, loadVisual: options.loadVisual || (async () => null), tickMs: 10, leaseMs: 2000, batchTimeoutMs: 3000,
      learningInstruction: () => "Use Chinese explanations and English final answers.",
      saveQuestion: async (context) => {
        const attachmentRef = await db.saveChatAttachments(context.user.id, context.course.id, context.messageId, context.attachments, `CHAT#${context.createdAt}#${context.messageId}`);
        return db.saveStudyMessage({ id: context.messageId, userId: context.user.id, courseId: context.course.id, conversationId: context.conversationId,
          role: "user", content: context.message, attachmentRef, studyJobId: context.studyJobId, createdAt: context.createdAt });
      },
      finalize: (job, content, interrupted) => db.saveStudyMessage({ id: job.assistantId, userId: job.userId, courseId: job.courseId, conversationId: job.conversationId,
        role: "assistant", content, interrupted, createdAt: new Date(Date.parse(job.createdAt) + 1).toISOString(), studyJobId: job.id }),
      plan: async (messages) => {
        const request = JSON.parse(messages[1].content);
        return JSON.stringify({ questions: request.questions.map((question) => ({ id: question.id, queries: ["opportunity cost", "机会成本"], dependsOn: [] })) });
      },
      answer: async (messages, visuals, signal) => {
        current++; maximum = Math.max(maximum, current);
        const request = JSON.parse(messages[1].content);
        try {
          await delay(options.delay?.(request.questions) ?? 80, undefined, { signal });
          return JSON.stringify({ answers: request.questions.map((question) => {
            calls.set(question.id, (calls.get(question.id) || 0) + 1);
            const evidence = request.evidence[question.id] || [];
            assert.ok(evidence.every((item) => !item.text.includes("FOREIGN_STATS_EVIDENCE")));
            return { id: question.id, parts: question.parts.map((id) => ({ id, status: options.unreadable === question.id ? "unreadable" : "done", basis: evidence.length ? "derived" : "general",
              text: `Method, calculation and final answer for ${question.id}(${id}).`, sources: options.fail?.(question.id, calls.get(question.id)) ? ["foreign-source-id"] : evidence.length ? [evidence[0].ref] : [] })) };
          }) });
        } finally { current--; }
      }
    }); services.push(value); value.start(); return value;
  }
  const context = { user: { id: "alice", preferences: { englishAnswers: true, chineseExplanations: true } }, course: { id: "math" }, conversationId: "default", mode: "guided", message: "帮我做这套题", attachments: [paper] };
  const detected = detectSet({ message: context.message, sources: [{ ...paper, id: "upload:0" }] });
  return { db, service, context, detected, calls, maximum: () => maximum, loadSources };
}
test("20 questions with seven course sources finish incrementally with all parts, verified citations and at most two global workers", async (t) => {
  const f = await fixture(t), first = f.service(), second = f.service();
  const job = await first.create(f.context, f.detected, "request-00001");
  let partial = false;
  const completed = await waitFor(async () => { const current = await first.get("alice", "math", job.id), view = await first.publicJob(current); if (view.completed > 0 && view.completed < 20) partial = true; return { current, view }; }, ({ current }) => current.status === "completed");
  assert.equal(completed.view.completed, 20); assert.ok(partial); assert.ok(f.maximum() <= 2);
  assert.equal(completed.view.questions.length, 20);
  assert.ok(completed.view.questions.every((question) => question.parts.length === 2));
  assert.ok(completed.view.content.includes("（来源：Lecture"));
  assert.ok((await f.db.listMessages("alice", "math", Infinity, "default")).filter((message) => message.role === "assistant").length === 1);
  assert.equal(await first.get("bob", "math", job.id), null);
  assert.equal(await first.get("alice", "stats", job.id), null);
});
test("failed questions retry without re-solving completed questions; repeated acceptance does not duplicate uploads/messages", async (t) => {
  const f = await fixture(t, { fail: (id, attempt) => id === "q3" && attempt === 1 }), service = f.service();
  const [a, b] = await Promise.all([service.create(f.context, f.detected, "request-00002"), service.create(f.context, f.detected, "request-00002")]);
  assert.equal(a.id, b.id);
  await waitFor(() => service.get("alice", "math", a.id), (job) => job.status === "completed");
  assert.equal(f.calls.get("q3"), 2); assert.equal(f.calls.get("q1"), 1);
  assert.equal((await f.db.listChatAttachmentGroups("alice", "math", "default")).length, 1);
  assert.equal((await f.db.listMessages("alice", "math", Infinity, "default")).filter((message) => message.role === "user").length, 1);
});
test("restart resumes unfinished groups while preserving completed results, and cancel stops work without losing progress", async (t) => {
  const f = await fixture(t, { delay: (questions) => questions[0].id === "q1" ? 20 : 500 }), service = f.service();
  const job = await service.create(f.context, f.detected, "request-00003");
  await waitFor(async () => service.publicJob(await service.get("alice", "math", job.id)), (view) => view.completed >= 5);
  await service.stop();
  const restarted = f.service();
  const finished = await waitFor(() => restarted.get("alice", "math", job.id), (job) => job.status === "completed");
  assert.equal((await restarted.publicJob(finished)).completed, 20); assert.equal(f.calls.get("q1"), 1);
  const conversation = await f.db.createConversation("alice", "math", "Cancel test");
  const other = await restarted.create({ ...f.context, conversationId: conversation.id }, f.detected, "request-00004");
  const canceled = await restarted.cancel(other); assert.equal(canceled.status, "canceled");
  await delay(100); assert.equal((await restarted.get("alice", "math", other.id)).status, "canceled");
});
test("unreadable subparts remain explicit instead of being counted as completed", async (t) => {
  const f = await fixture(t, { unreadable: "q3" }), service = f.service();
  const job = await service.create(f.context, f.detected, "request-00005");
  const done = await waitFor(() => service.get("alice", "math", job.id), (job) => job.status === "needs_input");
  const view = await service.publicJob(done);
  assert.equal(view.completed, 19); assert.equal(view.questions.find((question) => question.id === "q3").status, "unreadable");
});
test("source edits during model execution prevent stale citations from being accepted", async (t) => {
  const f = await fixture(t, { delay: () => 500 }), service = f.service();
  const job = await service.create(f.context, f.detected, "request-00006");
  await waitFor(() => service.get("alice", "math", job.id), (job) => job.batches.some((batch) => batch.status === "running"));
  await f.db.updateDocument("alice", "math", "doc-0", { text: "Replacement lecture" });
  const ended = await waitFor(() => service.get("alice", "math", job.id), (job) => job.status === "partial");
  assert.equal((await service.publicJob(ended)).completed, 0);
  assert.match(ended.error, /资料已更新/);
  await assert.rejects(service.retry(ended), { statusCode: 409 });
});
test("an incompletely readable multi-image inventory cannot silently report the visible subset as the whole paper", async (t) => {
  const f = await fixture(t, { loadVisual: async () => ({ name: "scan.png", kind: "image", dataUrl: "data:image/png;base64,fixture" }) }), service = f.service();
  const context = { ...f.context, message: "请解答整套题", attachments: Array.from({ length: 10 }, (_, n) => ({ kind: "image", name: `scan-${n}.png`, dataUrl: "data:image/png;base64,fixture" })) };
  const detected = detectSet({ message: context.message, sources: context.attachments.map((source, n) => ({ ...source, id: `upload:${n}` })) });
  const job = await service.create(context, detected, "request-00007");
  const done = await waitFor(() => service.get("alice", "math", job.id), (job) => job.status === "failed");
  assert.equal((await service.publicJob(done)).content, "");
  assert.equal((await f.db.listChatAttachmentGroups("alice", "math", "default"))[0].attachments.length, 10, "All uploads are still accepted and retained");
});
