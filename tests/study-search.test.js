const assert = require("node:assert/strict");
const { test } = require("node:test");
const { expandStudySearch } = require("../lib/study-search");
const { buildMaterialContext } = require("../lib/study-context");

const sources = () => [{ title: "Lecture.pdf", text: "background ".repeat(9000) + "OPPORTUNITY COST means the value of the best alternative forgone. CROSS_LANGUAGE_EVIDENCE" + " background".repeat(9000) }];

test("Chinese questions retrieve English terminology from deep inside a large source", async () => {
  const documents = sources(), message = "为什么要考虑放弃另一个选择的代价？";
  const before = buildMaterialContext({ documents, message, budget: 6000 });
  assert.ok(!before.includes("CROSS_LANGUAGE_EVIDENCE"));
  const searchQueries = await expandStudySearch({ documents, message, generate: async (messages) => {
    assert.ok(JSON.parse(messages[1].content).question.includes("放弃"));
    return JSON.stringify({ queries: ["opportunity cost", "alternative forgone", "机会成本"] });
  } });
  const context = buildMaterialContext({ documents, message, searchQueries, budget: 6000 });
  assert.ok(context.includes("CROSS_LANGUAGE_EVIDENCE"));
  assert.ok(context.includes("Lecture.pdf"));
  assert.ok(context.length < 6300);
  assert.ok(!context.includes("机会成本"), "generated queries must not be presented as course evidence");
});

test("English paraphrases find Chinese sources and preserve exact original query matches", () => {
  const document = { title: "课程笔记", text: "背景 ".repeat(30000) + "净现值是未来现金流折现后与初始投资的差额。ZH_EVIDENCE" + "背景 ".repeat(30000) };
  assert.ok(buildMaterialContext({ documents: [document], message: "How do I compare cash received in future years?", searchQueries: ["净现值", "现金流折现", "net present value"], budget: 6000 }).includes("ZH_EVIDENCE"));
  const documents = [...sources(), { title: "Specific.txt", text: "EXACT_REFERENCE_912 direct evidence" }];
  assert.ok(buildMaterialContext({ documents, message: "EXACT_REFERENCE_912", searchQueries: ["unrelated synonym"], budget: 6000 }).includes("direct evidence"));
});

test("short complete sources and unconfigured generation avoid extra requests", async () => {
  let calls = 0;
  assert.deepEqual(await expandStudySearch({ documents: [{ title: "Short", text: "full text" }], message: "解释", generate: async () => { calls++; } }), []);
  assert.deepEqual(await expandStudySearch({ documents: sources(), message: "解释" }), []);
  assert.equal(calls, 0);
});

test("expansion has bounded validated output and only receives current user's questions", async () => {
  const result = await expandStudySearch({ documents: sources(), message: "新的主题", history: [
    { role: "assistant", content: "PRIVATE_ASSISTANT_RESPONSE" }, { role: "user", content: "上一个问题" }
  ], generate: async (messages) => {
    assert.ok(!JSON.stringify(messages).includes("PRIVATE_ASSISTANT_RESPONSE"));
    assert.ok(!JSON.stringify(messages).includes("CROSS_LANGUAGE_EVIDENCE"), "do not transmit documents to the query rewriting step");
    assert.deepEqual(JSON.parse(messages[1].content).recentQuestions, ["上一个问题"]);
    return '```json\n' + JSON.stringify({ queries: [" opportunity cost ", "opportunity cost", null, {}, "x".repeat(161), ...Array.from({ length: 20 }, (_, i) => `query ${i}`)] }) + '\n```';
  } });
  assert.equal(result.length, 8);
  assert.equal(result[0], "opportunity cost");
  assert.ok(result.every((query) => typeof query === "string" && query.length <= 160));
});

test("errors, malformed responses and timeouts fall back while cancellation propagates", async () => {
  for (const generate of [async () => { throw new Error("provider unavailable"); }, async () => "not json", async () => '{"queries":"wrong type"}', async () => "x".repeat(5001)]) {
    assert.deepEqual(await expandStudySearch({ documents: sources(), message: "解释机会成本", generate }), []);
  }
  let requestSignal;
  assert.deepEqual(await expandStudySearch({ documents: sources(), message: "解释", timeoutMs: 10, generate: async (messages, { signal }) => { requestSignal = signal; return new Promise(() => {}); } }), []);
  assert.equal(requestSignal.aborted, true);
  const controller = new AbortController();
  const pending = expandStudySearch({ documents: sources(), message: "解释", signal: controller.signal, generate: async () => { controller.abort(new Error("user stopped")); return new Promise(() => {}); } });
  await assert.rejects(pending, /user stopped/);
});

test("common filler cannot crowd out rare terms and matches respect English word boundaries", () => {
  const documents = [{ title: "General", text: "the and please material lecture ".repeat(6000) },
    { title: "Useful", text: "background ".repeat(9000) + "price elasticity measures demand sensitivity. RARE_EVIDENCE" }];
  assert.ok(buildMaterialContext({ documents, message: "please explain the price elasticity in the lecture material", budget: 6000 }).includes("RARE_EVIDENCE"));
  const boundary = [{ title: "First", text: "partial ".repeat(12000) }, { title: "Second", text: "background ".repeat(9000) + "art history EXACT_WORD_EVIDENCE" }];
  assert.ok(buildMaterialContext({ documents: boundary, message: "art", budget: 6000 }).includes("EXACT_WORD_EVIDENCE"));
});
