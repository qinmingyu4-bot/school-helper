const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildRecentStudyHistory } = require("../lib/study-history");

test("follow-ups retain middle calculations from the previous long explanation", () => {
  const previous = "### 1(a)\n" + "intro ".repeat(350) + "MIDDLE_CALCULATION" + " working".repeat(450);
  const context = buildRecentStudyHistory([{ role: "assistant", content: previous }, { role: "user", content: "为什么这里这样计算？" }], "为什么这里这样计算？");
  assert(context.includes(previous));
});
test("a numbered follow-up retrieves older matching parts before truncating history", () => {
  const history = [{ role: "assistant", content: "### 1(a)\n" + "unrelated ".repeat(3000) + "\n### 3(a)\nTARGET_DERIVATION\n### 3(b)\nTARGET_SECOND_PART\n### 4(a)\nOTHER" },
    ...Array.from({ length: 18 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "recent" }))];
  const context = buildRecentStudyHistory(history, "第3题为什么这样算？");
  assert(context.includes("TARGET_DERIVATION")); assert(context.includes("TARGET_SECOND_PART")); assert(!context.includes("OTHER"));
  const part = buildRecentStudyHistory(history, "Explain question 3(a) again");
  assert(part.includes("TARGET_DERIVATION")); assert(!part.includes("TARGET_SECOND_PART"));
});
test("history remains bounded and marks genuinely omitted text and interruptions", () => {
  const value = buildRecentStudyHistory([{ role: "assistant", interrupted: true, content: "long ".repeat(20000) }], "继续", 4000);
  assert(value.length <= 4000); assert.match(value, /omitted text is not available/); assert.match(value, /interrupted/);
});

test("retrieved problem sections retain method and calculation subheadings", () => {
  const history = [{ role: "assistant", content: "### 3(a)\n#### Method\nRULE\n#### Working\nCALCULATION\n### 4(a)\nUNRELATED" }];
  const result = buildRecentStudyHistory(history, "第3题(a)为什么？");
  assert(result.includes("RULE")); assert(result.includes("CALCULATION")); assert(!result.includes("UNRELATED"));
});
