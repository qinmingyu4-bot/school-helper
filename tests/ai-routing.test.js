const assert = require("node:assert/strict");
const { test } = require("node:test");
const { selectAiModel } = require("../lib/ai-routing");
const models = { simpleModel: "gpt-6-luna", complexModel: "gpt-6.1-sol" };

test("short help requests about current or retained problem images use Sol", () => {
  const image = { kind: "image", name: "problem.png" };
  assert.equal(selectAiModel({ mode: "guided", message: "怎么做", attachments: [image] }, models), models.complexModel);
  assert.equal(selectAiModel({ mode: "guided", message: "这题怎么解", savedAttachments: [image] }, models), models.complexModel);
  assert.equal(selectAiModel({ mode: "guided", message: "How do I solve this?", attachments: [image] }, models), models.complexModel);
  assert.equal(selectAiModel({ mode: "guided", message: "为什么这一步成立", savedAttachments: [image], history: [{ role: "user", mode: "guided", content: "怎么做" }] }, models), models.complexModel);
  assert.equal(selectAiModel({ mode: "guided", message: "描述这张照片", attachments: [image] }, models), models.simpleModel);
  assert.equal(selectAiModel({ mode: "guided", message: "番茄炒鸡蛋怎么做", savedAttachments: [image] }, models), models.simpleModel);
});

test("complex tasks always choose Sol instead of a random percentage", () => {
  for (let i = 0; i < 100; i++) {
    assert.equal(selectAiModel({ message: "请推导利润最大化的一阶条件", mode: "guided" }, models), models.complexModel);
    assert.equal(selectAiModel({ message: "Prepare a mock paper", mode: "exam" }, models), models.complexModel);
  }
});

test("image tutoring requests use Sol for teach-me wording and preserve ordinary photo questions", () => {
  const savedAttachments = [{ kind: "image", name: "calculus-question.png" }];
  for (const message of ["teach me", "Teach me please", "walk me through this", "explain this", "教我", "带我学这题", "讲解一下"]) assert.equal(selectAiModel({ mode: "guided", message, savedAttachments }, models), models.complexModel, message);
  assert.equal(selectAiModel({ mode: "guided", message: "teach me", attachments: savedAttachments }, models), models.complexModel);
  assert.equal(selectAiModel({ mode: "guided", message: "describe the photo", savedAttachments }, models), models.simpleModel);
  assert.equal(selectAiModel({ mode: "guided", message: "谢谢", savedAttachments }, models), models.simpleModel);
});

test("ordinary questions stay on Luna despite long course material, history, or a study mode", () => {
  const context = { documents: [{ text: "x".repeat(100000) }], history: [{ role: "assistant", content: "x".repeat(10000) }] };
  assert.equal(selectAiModel({ ...context, message: "你好", mode: "review" }, models), models.simpleModel);
  assert.equal(selectAiModel({ ...context, message: "What's the weather today?", mode: "exam" }, models), models.simpleModel);
  assert.equal(selectAiModel({ ...context, message: "番茄炒鸡蛋怎么做", mode: "guided" }, models), models.simpleModel);
});

test("consecutive short follow-ups retain the original complex task", () => {
  const history = [
    { role: "user", mode: "guided", content: "请推导这个模型" },
    { role: "assistant", content: "Some answer" },
    { role: "user", mode: "guided", content: "继续第一步" },
    { role: "user", mode: "guided", content: "为什么这一步成立" }
  ];
  assert.equal(selectAiModel({ history, message: "为什么这一步成立", mode: "guided" }, models), models.complexModel);
  assert.equal(selectAiModel({ history, message: "谢谢", mode: "guided" }, models), models.simpleModel);
});

test("new large attachments and long tasks choose Sol", () => {
  assert.equal(selectAiModel({ message: "Analyze this", attachments: [{ text: "x".repeat(10000) }] }, models), models.complexModel);
  assert.equal(selectAiModel({ message: "x".repeat(901) }, models), models.complexModel);
});
