"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

test("learning-loop HTTP keeps sources, answers, preferences and calendar links private across restart", { timeout: 45000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-learning-http-"));
  let child, base, errors = "";
  const stop = async () => { if (child?.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } };
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ["--require", "./tests/fixtures/learning-loop-ai.js", "server.js"], { cwd: path.resolve(__dirname, ".."), env: {
      ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: path.join(directory, "db.json"), LOCAL_DB_BACKUP_DISABLED: "true",
      SESSION_SECRET: "learning-loop-http-test-only", REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "fixture", OPENAI_WEB_SEARCH: "false", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: ""
    }, stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    base = await new Promise((resolve, reject) => {
      let output = ""; const timer = setTimeout(() => reject(Error("Startup timed out")), 10000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(Error(`Server exited ${code}: ${errors}`)); });
      child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    });
  };
  let cookie = "";
  const request = async (route, method = "GET", body, session = cookie) => {
    const response = await fetch(base + route, { method, headers: { cookie: session, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0], cache: response.headers.get("cache-control") };
  };
  await start();
  const register = (email) => request("/api/auth/register", "POST", { name: "Learning test", email, password: "Learning-HTTP-Test-2026!", passwordConfirm: "Learning-HTTP-Test-2026!" }, "");
  cookie = (await register("learning-alice@example.test")).cookie;
  const bob = (await register("learning-bob@example.test")).cookie;
  const course = (await request("/api/courses", "POST", { name: "STA220" })).data.course;
  const other = (await request("/api/courses", "POST", { name: "Other course" })).data.course;
  const root = `/api/courses/${course.id}`, route = root + "/learning-loop";
  const doc = (await request(root + "/documents", "POST", { title: "Hypothesis testing", text: "A p-value is calculated assuming the null hypothesis is true." })).data.document;
  assert.equal((await request(route, "GET", null, "")).status, 401);
  assert.equal((await request(route, "GET", null, bob)).status, 404);
  assert.equal((await request(route)).cache, "private, no-store");
  assert.equal((await request(route + "/extract", "POST", { version: 0, documentIds: ["foreign"] })).status, 400);
  const draft = await request(route + "/extract", "POST", { version: 0, documentIds: [doc.id] });
  assert.equal(draft.status, 200);
  assert.equal(draft.data.learning.topics.length, 0);
  const confirmed = await request(route + "/topics", "POST", { action: "confirm", version: draft.data.learning.version, draftId: draft.data.learning.draft.id, topics: draft.data.learning.draft.topics });
  assert.equal(confirmed.status, 200);
  const topicId = confirmed.data.learning.topics[0].id;
  const generated = await request(route + "/quiz", "POST", { topicId, requestId: "private-practice" });
  assert.equal(generated.status, 200);
  const quiz = generated.data.quiz;
  assert.ok(!JSON.stringify(quiz).includes("answerIndex"));
  assert.equal((await request(route + `/quiz?id=${quiz.id}`, "GET", null, bob)).status, 404);
  assert.equal((await request(`/api/courses/${other.id}/learning-loop/quiz?id=${quiz.id}`)).status, 404);
  assert.equal((await request(route + "/submit", "POST", { quizId: quiz.id, answers: [0, 1] })).status, 400);
  const feedback = await request(route + "/submit", "POST", { quizId: quiz.id, answers: [0, 1, 0], score: 3 });
  assert.equal(feedback.status, 200);
  assert.equal(feedback.data.quiz.score, 2);
  assert.equal((await request(route)).data.learning.topics[0].status, "needs_review");
  await request(route + "/preferences", "POST", { prompts: false });
  const gradeRoute = root + "/grades";
  assert.equal((await request(gradeRoute,"GET",null,bob)).status,404);
  const gradeBody={version:0,source:"manual",categories:[{id:"final",name:"Final",weight:100,method:"equal",plannedCount:1,items:[{id:"exam",name:"Final exam",status:"graded",score:0,max:100}]}]};
  assert.equal((await request(gradeRoute,"PUT",gradeBody)).status,200);
  assert.equal((await request(gradeRoute,"PUT",gradeBody)).status,409);
  assert.equal((await request(gradeRoute)).data.plan.categories[0].items[0].score,0);
  assert.equal((await request(route)).data.learning.topics[0].status,"needs_review");
  const advice=await request(route+"/recommendations","POST",{topicId,timeZone:"UTC",minutes:15,from:"09:00",to:"20:00"});
  assert.equal(advice.status,200);assert.equal(advice.data.recommendation.topicId,topicId);
  await stop(); await start();
  assert.equal((await request(gradeRoute)).data.plan.categories[0].items[0].score,0);
  assert.equal((await request(route)).data.learning.prompts, false);
  assert.equal((await request(route + `/quiz?id=${quiz.id}`)).data.quiz.score, 2);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);
  const planned = await request(route + "/plan", "POST", { topicId, requestId: "calendar-learning", startsAt: nextWeek, timeZone: "UTC", minutes: 15 });
  assert.equal(planned.status, 200);
  const calendar = (await request("/api/schedule/items")).data.items.find((item) => item.learningTopicId === topicId);
  assert.ok(calendar);
  assert.equal(calendar.courseId, course.id);
  await request(root, "DELETE");
  assert.equal((await request(route)).status, 404);
  assert.equal((await request(route + `/quiz?id=${quiz.id}`)).status, 404);
  assert.equal(errors, "");
});
