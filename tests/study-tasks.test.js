const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../public/study-tasks");
const scope = { userId: "alice", courseId: "math", conversationId: "default" };
const job = { id: "task_one", messageId: "question", assistantId: "answer", status: "running", completed: 5, total: 20, content: "First five answers", revision: 2 };
test("task restoration discards old-account/course responses and merges one ordered assistant", async () => {
  let context = { ...scope }, resolveOld;
  const controller = create({ getContext: () => context, request: () => new Promise((resolve) => { resolveOld = resolve; }) });
  const pending = controller.load(context);
  context = { ...scope, userId: "bob" }; controller.clear(); resolveOld({ jobs: [job] }); await pending;
  assert.ok(!controller.active());
  assert.deepEqual(controller.mergeMessages([{ id: "question" }]), [{ id: "question" }]);
  controller.clear(); context = { ...scope }; controller.accept(scope, job);
  const messages = controller.mergeMessages([{ id: "question", role: "user" }, { id: "later", role: "user" }]);
  assert.deepEqual(messages.map((item) => item.id), ["question", "answer", "later"]);
  assert.equal(controller.mergeMessages(messages).length, 3);
  controller.accept(scope, { ...job, status: "completed", completed: 20, revision: 3, content: "All twenty answers" });
  assert.equal(controller.mergeMessages(messages)[1].content, "All twenty answers");
  const saved = controller.mergeMessages([{ id: "question" }, { id: "answer", content: "Saved answer with coverage summary" }]);
  assert.equal(saved[1].content, "Saved answer with coverage summary");
  controller.clear();
});
test("task actions deduplicate clicks, retain scoped state, escape errors and restore failed polling", async () => {
  let resolveAction, calls = 0, fail = false;
  const controller = create({ getContext: () => scope, request: async (url, options) => {
    if (options) { calls++; return new Promise((resolve) => { resolveAction = resolve; }); }
    if (fail) throw Error("network");
    return { jobs: [job] };
  } });
  await controller.load(scope);
  const first = controller.action(job.id, "cancel"); await controller.action(job.id, "cancel");
  assert.equal(calls, 1); assert.match(controller.html(job), /disabled/);
  resolveAction({ job: { ...job, status: "canceled" } }); await first;
  assert.equal(controller.active(), undefined);
  assert.match(controller.html({ ...job, error: "<img onerror=bad()>" }), /&lt;img/);
  fail = true; await controller.load(scope); assert.match(controller.html(job), /后台任务仍在继续/);
  fail = false; await controller.load(scope); assert.doesNotMatch(controller.html(job), /进度暂时无法更新/);
  controller.clear();
});
