"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { StudyBridgeDatabase } = require("../lib/database");
const { LocalStore } = require("../lib/local-store");
const { memoryDynamo } = require("./helpers/community-dynamo");
const { createLearningLoop } = require("../lib/learning-loop");
const { suggestion } = require("../public/learning-loop");
const { storedItems } = require("../lib/schedule-batch");
const QUOTE = "A p-value is calculated assuming the null hypothesis is true.";

async function setup(t, cloud = false) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-learning-unit-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local = new LocalStore(path.join(directory, "db.json"));
  const memory = cloud ? memoryDynamo() : null; db.dynamo = memory?.store || null;
  if (memory) memory.store.query = async (pk, prefix) => {
    let cursor, rows = [];
    do { const page = await memory.store.queryPage(pk, { prefix, limit: 100, cursor }); rows.push(...page.rows); cursor = page.cursor; } while (cursor);
    return rows;
  };
  const user = { id: "alice", preferences: { chineseExplanations: true } };
  const course = await db.createCourse({ id: "statistics", userId: user.id, name: "Statistics" });
  const document = await db.createDocument({ id: "notes", userId: user.id, courseId: course.id, title: "Lecture 1", type: "Note", text: QUOTE + "\n" + "Type I error rejects a true null hypothesis.", sourcePages: [{ page: 2, start: 0, end: QUOTE.length }] });
  let calls = [], custom, review, index = 0;
  const service = createLearningLoop({ db, now: () => Date.parse("2026-11-02T20:00:00Z"),
    listSchedule: async (userId) => storedItems(await db.listCourses(userId), await db.listDocuments(userId, course.id), userId),
    learningInstruction: () => "RESOLVED_LANGUAGES",
    generate: async (messages) => {
      calls.push(messages);
      if (messages[0].content.startsWith("StudyBridge quiz-review/v1")) return review ? review(messages) : JSON.stringify({ checks: JSON.parse(messages[1].content).questions.map(({ id }) => ({ id, correctIndices: [0], grounded: true, explanations: ["Assume the null is true.", "This reverses the conditional.", "Not the probability of the null.", "Not a causal claim."] })) });
      if (custom) return custom(messages);
      if (messages[0].content.includes("topics/v1")) return JSON.stringify({ topics: ["P-values", "Hypothesis testing"].map((title) => ({ title, documentId: document.id, quote: QUOTE })) });
      return JSON.stringify({ questions: Array.from({ length: 3 }, (_, question) => ({ prompt: `Practice ${++index} / ${question}`, choices: ["Right", "Wrong A", "Wrong B", "Wrong C"], answerIndex: 0, explanations: ["Assume the null is true.", "This reverses the conditional.", "Not the probability of the null.", "Not a causal claim."], documentId: document.id, quote: QUOTE })) });
    } });
  const read = () => service.read(user.id, course.id);
  const extract = async () => { await service.extract(user, course.id, { version: (await read()).version, documentIds: [document.id] }); return read(); };
  const confirm = async () => { const state = await extract(); await service.topics(user.id, course.id, { action: "confirm", version: state.version, draftId: state.draft.id, topics: state.draft.topics.slice(0, 1).map((topic) => ({ id: topic.id, title: "Understanding p-values" })) }); return (await read()).topics[0]; };
  return { db, memory, user, course, document, service, read, extract, confirm, calls, setCustom: (handler) => { custom = handler; }, setReview: (handler) => { review = handler; } };
}

for (const cloud of [false, true]) {
  test(`${cloud ? "DynamoDB" : "local"}: reviewed topics, private quizzes, durable mistakes and spaced retests form a loop`, async (t) => {
    const f = await setup(t, cloud), { service, user, course, db } = f;
    const topic = await f.confirm();
    assert.equal(topic.title, "Understanding p-values");
    assert.deepEqual(topic.sources[0].pages, [2]);
    const quiz = await service.quiz(user, course.id, { requestId: "first-attempt", topicId: topic.id });
    assert.equal(quiz.questions[0].answerIndex, undefined);
    assert.equal(quiz.questions[0].explanations, undefined);
    assert.ok(f.calls.findLast((call) => call[0].content.includes("quiz/v1"))[0].content.includes("RESOLVED_LANGUAGES"));
    const bad = await service.submit(user.id, course.id, { quizId: quiz.id, answers: [1, 0, 0] });
    assert.equal(bad.score, 2);
    let state = await f.read();
    assert.equal(state.topics[0].status, "needs_review");
    assert.equal(state.topics[0].streak, 0);
    assert.equal(state.topics[0].nextReviewAt, "2026-11-03T20:00:00.000Z");
    const repeated = await service.submit(user.id, course.id, { quizId: quiz.id, answers: [0, 0, 0] });
    assert.deepEqual(repeated.answers, [1, 0, 0]);
    assert.equal((await f.read()).version, state.version);
    if (!cloud) { const reopened = new StudyBridgeDatabase(); reopened.dynamo = null; reopened.local = new LocalStore(db.local.file); assert.equal((await reopened.getLearningQuiz(user.id, course.id, quiz.id)).score, 2); }
    const again = await service.quiz(user, course.id, { requestId: "second-attempt", topicId: topic.id });
    assert.ok(f.calls.findLast((call) => call[0].content.includes("quiz/v1"))[1].content.includes(bad.questions[0].prompt));
    assert.ok(!bad.questions.some((old) => again.questions.some((next) => next.prompt === old.prompt)));
    await service.submit(user.id, course.id, { quizId: again.id, answers: [0, 0, 0] });
    state = await f.read();
    assert.equal(state.topics[0].status, "answered_correct");
    assert.equal(state.topics[0].nextReviewAt, "2026-11-05T20:00:00.000Z");
    const helped = await service.quiz(user, course.id, { requestId: "assisted-attempt", topicId: topic.id });
    assert.equal((await service.help(user.id, course.id, { quizId: helped.id })).questions[0].answerIndex, 0);
    await service.submit(user.id, course.id, { quizId: helped.id, answers: [0, 0, 0], helped: false, score: 3 });
    state = await f.read();
    assert.equal(state.topics[0].status, "needs_review");
    assert.equal(state.topics[0].streak, 0);
    assert.equal(state.topics[0].helped, true);
    await assert.rejects(service.submit(user.id, course.id, { quizId: "foreign", answers: [0, 0, 0] }), { statusCode: 404 });
    await assert.rejects(service.quiz({ id: "bob" }, course.id, { requestId: "foreign-course", topicId: topic.id }), { statusCode: 404 });
    assert.equal((await service.read("bob", course.id)).topics.length, 0);
  });
  test(`${cloud ? "DynamoDB" : "local"}: confirmed calendar tasks launch retests; retries and manual completion do not fabricate mastery`, async (t) => {
    const f = await setup(t, cloud), { service, user, course, db } = f, topic = await f.confirm();
    assert.equal((await db.listDocuments(user.id, course.id)).filter((doc) => doc.type === "Schedule").length, 0);
    const body = { requestId: "review-plan-one", topicId: topic.id, startsAt: "2026-11-04T19:00", minutes: 15, timeZone: "America/Toronto" };
    await Promise.all([service.plan(user.id, course, body), service.plan(user.id, course, body)]);
    let tasks = (await db.listDocuments(user.id, course.id)).filter((doc) => doc.type === "Schedule");
    assert.equal(tasks.length, 1);
    assert.equal(JSON.parse(tasks[0].text).startsAt, "2026-11-04T19:00");
    assert.equal((await f.read()).topics[0].status, "untested");
    await assert.rejects(service.plan(user.id, course, { ...body, requestId: "overlapping-plan" }), { statusCode: 409 });
    await assert.rejects(service.plan(user.id, course, { ...body, requestId: "invalid-duration", minutes: 3 }), { statusCode: 400 });
    const quiz = await service.quiz(user, course.id, { topicId: topic.id, requestId: "scheduled-quiz", taskId: tasks[0].id });
    await Promise.all([service.submit(user.id, course.id, { quizId: quiz.id, answers: [0, 0, 0] }), service.submit(user.id, course.id, { quizId: quiz.id, answers: [0, 0, 0] })]);
    tasks = (await db.listDocuments(user.id, course.id)).filter((doc) => doc.type === "Schedule");
    assert.ok(JSON.parse(tasks[0].text).completedAt);
    assert.equal((await f.read()).topics[0].streak, 1);
    await db.deleteCourse(user.id, course.id);
    assert.equal((await db.getLearningState(user.id, course.id)).topics.length, 0);
    assert.equal(await db.getLearningQuiz(user.id, course.id, quiz.id), null);
  });
  test(`${cloud ? "DynamoDB" : "local"}: stale sources, invalid citations, incomplete answers and concurrent edits are rejected`, async (t) => {
    const f = await setup(t, cloud), { service, user, course, db } = f;
    let draft = await f.extract();
    assert.equal(draft.topics.length, 0);
    await assert.rejects(service.topics(user.id, course.id, { action: "confirm", version: 0, draftId: draft.draft.id, topics: [] }), { statusCode: 409 });
    await service.topics(user.id, course.id, { action: "discard", version: draft.version });
    const topic = await f.confirm();
    const quiz = await service.quiz(user, course.id, { topicId: topic.id, requestId: "validation-quiz" });
    await assert.rejects(service.submit(user.id, course.id, { quizId: quiz.id, answers: [0, null, 0] }), { statusCode: 400 });
    await db.updateDocument(user.id, course.id, f.document.id, { text: "Updated material no longer contains this definition." });
    assert.equal((await f.read()).topics[0].sourceStale, true);
    await assert.rejects(service.submit(user.id, course.id, { quizId: quiz.id, answers: [0, 0, 0] }), { statusCode: 409 });
    await assert.rejects(service.quiz(user, course.id, { topicId: topic.id, requestId: "stale-source-quiz" }), { statusCode: 409 });
    assert.equal((await f.read()).topics[0].status, "untested");
    f.setCustom(() => JSON.stringify({ topics: [{ title: "Invented topic", documentId: "notes", quote: "A quote which does not exist." }] }));
    await assert.rejects(f.extract(), { statusCode: 502 });
    const before = await f.read();
    const results = await Promise.allSettled([service.topics(user.id, course.id, { action: "rename", topicId: topic.id, title: "First", version: before.version }), service.topics(user.id, course.id, { action: "rename", topicId: topic.id, title: "Second", version: before.version })]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  });
  test(`${cloud ? "DynamoDB" : "local"}: failed grading commits retain both the unfinished quiz and its calendar task`, async (t) => {
    const f = await setup(t, cloud), { service, user, course, db } = f, topic = await f.confirm();
    await service.plan(user.id, course, { topicId: topic.id, requestId: "atomic-review-plan", startsAt: "2026-11-06T19:00", minutes: 15, timeZone: "America/Toronto" });
    const task = (await db.listDocuments(user.id, course.id)).find((doc) => doc.type === "Schedule");
    const quiz = await service.quiz(user, course.id, { topicId: topic.id, requestId: "atomic-review-quiz", taskId: task.id });
    const target = cloud ? db.dynamo : db.local, method = cloud ? "transactPut" : "save", original = target[method];
    target[method] = async () => { throw Error("Simulated persistence failure"); };
    await assert.rejects(service.submit(user.id, course.id, { quizId: quiz.id, answers: [0, 0, 0] }), /Simulated persistence failure/);
    target[method] = original;
    assert.equal((await f.read()).topics[0].status, "untested");
    assert.equal((await service.getQuiz(user.id, course.id, quiz.id)).submittedAt, undefined);
    assert.equal(JSON.parse((await db.listDocuments(user.id, course.id)).find((doc) => doc.id === task.id).text).completedAt, "");
    await service.submit(user.id, course.id, { quizId: quiz.id, answers: [0, 0, 0] });
    const pending = await service.quiz(user, course.id, { topicId: topic.id, requestId: "renamed-topic-quiz" });
    await service.topics(user.id, course.id, { action: "rename", version: (await f.read()).version, topicId: topic.id, title: "A revised learning goal" });
    assert.equal((await f.read()).topics[0].status, "untested");
    assert.equal((await f.read()).topics[0].nextReviewAt, undefined);
    await assert.rejects(service.submit(user.id, course.id, { quizId: pending.id, answers: [0, 0, 0] }), { statusCode: 409 });
    assert.equal((await service.getQuiz(user.id, course.id, quiz.id)).score, 3);
  });
}

test("automatic suggestions respect consent, snooze and stale evidence; manual learning needs no suggestion", () => {
  const data = { prompts: true, documents: [{ readable: true }], topics: [] };
  assert.equal(suggestion(data, "upload").kind, "organize");
  assert.equal(suggestion({ ...data, prompts: false }, "upload"), null);
  assert.equal(suggestion({ ...data, snoozedUntil: "2099-01-01T00:00:00Z" }, "lesson"), null);
  const topic = { id: "p-values", nextReviewAt: "2000-01-01T00:00:00Z" };
  assert.equal(suggestion({ ...data, topics: [topic] }, "load").topicId, topic.id);
  assert.equal(suggestion({ ...data, topics: [{ ...topic, sourceStale: true }] }, "load"), null);
});


test("new practice targets the selected wrong answer and its misconception, not only the old prompt", async (t) => {
  const f = await setup(t), topic = await f.confirm();
  const quiz = await f.service.quiz(f.user, f.course.id, { requestId: "misconception-first", topicId: topic.id });
  await f.service.submit(f.user.id, f.course.id, { quizId: quiz.id, answers: [1, 0, 0] });
  await f.service.quiz(f.user, f.course.id, { requestId: "misconception-next", topicId: topic.id });
  const input = JSON.parse(f.calls.findLast((call) => call[0].content.includes("quiz/v1"))[1].content);
  assert.equal(input.past[0].mistakes.length, 1);
  assert.equal(input.past[0].mistakes[0].selectedAnswer, "Wrong A");
  assert.equal(input.past[0].mistakes[0].correctAnswer, "Right");
  assert.equal(input.past[0].mistakes[0].misconception, "This reverses the conditional.");
});

test("a quiz failing semantic review is not saved and cannot affect learning evidence", async (t) => {
  const f = await setup(t), topic = await f.confirm(), before = await f.read();
  f.setReview((messages) => JSON.stringify({ checks: JSON.parse(messages[1].content).questions.map(({ id }) => ({ id, correctIndices: [0, 1], grounded: true, explanations: ["Assume the null is true.", "This reverses the conditional.", "Not the probability of the null.", "Not a causal claim."] })) }));
  await assert.rejects(f.service.quiz(f.user, f.course.id, { requestId: "ambiguous-quiz", topicId: topic.id }), { statusCode: 502 });
  assert.equal(await f.db.getLearningQuiz(f.user.id, f.course.id, "quiz_ambiguous-quiz"), null);
  const after = await f.read();
  assert.equal(after.version, before.version); assert.deepEqual(after.recent, before.recent); assert.deepEqual(after.topics, before.topics);
});
