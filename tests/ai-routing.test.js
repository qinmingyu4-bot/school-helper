const assert = require("node:assert/strict");
const { test } = require("node:test");
const { selectAiModel } = require("../lib/ai-routing");
const models = { simpleModel: "gpt-6-luna", complexModel: "gpt-6.1-sol" };

test("complex tasks always choose Sol instead of a random percentage", () => {
  for (let i = 0; i < 100; i++) {
    assert.equal(selectAiModel({ message: "请推导利润最大化的一阶条件", mode: "guided" }, models), models.complexModel);
    assert.equal(selectAiModel({ message: "Prepare a mock paper", mode: "exam" }, models), models.complexModel);
  }
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
