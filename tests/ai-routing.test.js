const assert = require("node:assert/strict");
const { test } = require("node:test");
const { selectAiModel, selectStudyBatchModel } = require("../lib/ai-routing");
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

test("basic review and short objective questions use Luna across academic modes", () => {
  for (const mode of ["guided", "review", "cram", "exam", "assignment"]) {
    for (const message of [
      "判断题：机会成本是放弃的最佳替代方案的价值。",
      "单选题：2 + 2 等于多少？\nA. 3\nB. 4\nC. 5",
      "Multiple-choice economics quiz: scarcity means?\nA. Limited resources\nB. Infinite resources",
      "True or false: assets equal liabilities plus equity.",
      "Which number is even?\nA. 3\nB. 4"
    ]) assert.equal(selectAiModel({ mode, message }, models), models.simpleModel, `${mode}: ${message}`);
  }
  for (const mode of ["review", "cram"]) {
    for (const message of ["Define opportunity cost.", "Explain the definition of scarcity.", "复习机会成本的定义和例子"]) {
      assert.equal(selectAiModel({ mode, message, documents: [{ text: "long notes ".repeat(10000) }] }, models), models.simpleModel, message);
    }
    for (const message of ["帮我复习这章", "帮我整理考试知识点", "Review economics key concepts"]) {
      assert.equal(selectAiModel({ mode, message }, models), models.complexModel, message);
    }
  }
});

test("demanding work stays on Sol even when described as review or multiple choice", () => {
  for (const message of ["复习微积分，推导定积分的换元公式", "简单选择题：请证明所选结论对任意矩阵成立", "True or false: derive the differential equation first", "复习并调试这段代码", "判断题：根据下图曲线计算面积", "复习综合题", "Review: prepare a mock exam", "Solve this problem", "复习这套题", "Review all questions"]) {
    assert.equal(selectAiModel({ mode: "review", message }, models), models.complexModel, message);
  }
  assert.equal(selectAiModel({ mode: "exam", message: "Prepare a mock paper" }, models), models.complexModel);
});

test("readable simple question files can use Luna, while unknown images and mixed papers stay on Sol", () => {
  const simple = { kind: "pdf", name: "quiz.pdf", text: "True or false: opportunity cost is the best alternative forgone." };
  for (const mode of ["guided", "review"]) {
    for (const field of ["attachments", "savedAttachments"]) {
      assert.equal(selectAiModel({ mode, message: "这道题怎么解", [field]: [simple] }, models), models.simpleModel);
      assert.equal(selectAiModel({ mode, message: "这道选择题怎么做", [field]: [{ kind: "image", name: "question.png" }] }, models), models.complexModel);
      assert.equal(selectAiModel({ mode, message: "这道判断题怎么解", [field]: [{ ...simple, text: "Prove the theorem and derive the equation." }] }, models), models.complexModel);
      assert.equal(selectAiModel({ mode, message: "复习这套判断题", [field]: [{ ...simple, text: "1. True or false: 2 + 2 = 4.\n2. Prove the theorem." }] }, models), models.complexModel);
    }
  }
  assert.equal(selectAiModel({ mode: "review", message: "teach me using the previous attachment", savedAttachments: [{ kind: "image", name: "old.png" }] }, models), models.complexModel);
  assert.equal(selectAiModel({ mode: "review", message: "什么是机会成本？", savedAttachments: [{ kind: "image", name: "old.png" }] }, models), models.simpleModel);
});

test("review-mode follow-ups keep the earlier simple or complex task", () => {
  for (const [original, expected] of [["请推导利润最大化条件", models.complexModel], ["判断题：2 + 2 = 4。", models.simpleModel]]) {
    const history = [{ role: "user", mode: "review", content: original }, { role: "user", mode: "review", content: "继续" }];
    assert.equal(selectAiModel({ mode: "review", message: "为什么", history }, models), expected);
    assert.equal(selectAiModel({ mode: "review", message: "继续", history }, models), expected);
  }
});

test("background batches use Luna only when every question is short, readable and independent", () => {
  const question = { text: "True or false: resources are scarce.", parts: ["answer"] };
  assert.equal(selectStudyBatchModel({ questions: [question, { text: "Define opportunity cost.", parts: ["answer"] }] }, models), models.simpleModel);
  for (const extra of [{ text: "Derive the equilibrium." }, { visual: true }, { shared: "Use the diagram shown below." }, { parts: ["a", "b"] }, { dependsOn: ["q1"] }, { text: "x".repeat(901) }]) {
    assert.equal(selectStudyBatchModel({ questions: [question, { ...question, ...extra }] }, models), models.complexModel);
  }
  assert.equal(selectStudyBatchModel({ questions: [question], message: "请深入分析每题" }, models), models.complexModel);
  assert.equal(selectStudyBatchModel({ questions: [] }, models), models.complexModel);
});

test("objective format alone never downgrades incomplete, tricky or advanced questions", () => {
  const questions = [
    "选择题", "这道判断题怎么做", "Multiple-choice: which option is correct?",
    "True or false: every continuous function is differentiable.",
    "判断题：所有连续函数都可导。", "判断题：至少存在一个满足条件的解。",
    "单选题：哪个说法不正确？\nA. 资源稀缺\nB. 资源无限",
    "多选题：选择正确选项。\nA. 资源稀缺\nB. 资源无限",
    "Which statement is NOT correct?\nA. Resources are scarce\nB. Resources are infinite",
    "True or false: if demand falls then equilibrium prices always fall.",
    "True or false: if demand falls, equilibrium prices fall.", "Please solve true or false",
    "What is the probability of obtaining this result?",
    "True or false: x^2 = x implies x = 1."
  ];
  for (const text of questions) {
    for (const mode of ["guided", "review", "exam"]) assert.equal(selectAiModel({ mode, message: text }, models), models.complexModel, `${mode}: ${text}`);
    assert.equal(selectStudyBatchModel({ questions: [{ text, parts: ["answer"] }] }, models), models.complexModel, text);
  }
});

test("correction and verification requests always upgrade a previous Luna answer", () => {
  const history = [{ role: "user", mode: "review", content: "判断题：2 + 2 = 4。" }, { role: "assistant", content: "An earlier answer" }];
  for (const message of ["你确定吗？", "不对", "错了", "答案不对，请重新检查", "再核对一下", "Are you sure?", "Double check your answer", "Recalculate", "为什么所有选项都成立？"]) {
    for (const mode of ["guided", "review"]) assert.equal(selectAiModel({ mode, message, history }, models), models.complexModel, message);
    assert.equal(selectStudyBatchModel({ message, questions: [{ text: "True or false: resources are scarce.", parts: ["answer"] }] }, models), models.complexModel, message);
  }
});
