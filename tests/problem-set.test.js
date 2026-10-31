const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { questionsFrom, detectSet, enrichPlan, groupQuestions, validateAnswers, pdfPages } = require("../lib/problem-set");
const source = { id: "upload:0", name: "questions.txt", kind: "text", text: Array.from({ length: 20 }, (_, i) => `${i + 1}. Apply opportunity cost.\n(a) Explain.\n(b) Calculate.`).join("\n") };
test("problem sets preserve all 20 question texts and subparts and respect explicit restricted scopes", () => {
  const detected = detectSet({ sources: [source], message: "帮我做这套题" });
  assert.equal(detected.questions.length, 20);
  assert.deepEqual(detected.questions[19].parts, ["a", "b"]);
  assert.ok(detected.questions[19].text.startsWith("20."));
  for (const message of ["只讲第3题", "hints only", "先让我做", "one at a time"]) assert.equal(detectSet({ sources: [source], message }), null);
  assert.equal(detectSet({ sources: [source], mode: "exam", message: "生成试卷" }), null);
  assert.equal(questionsFrom({ text: "not a problem set" }).length, 0);
});
test("dependencies are topologically grouped, complex problems split and cycles fail explicitly", () => {
  const questions = detectSet({ sources: [source] }).questions;
  questions[0].dependsOn = ["q7"];
  const groups = groupQuestions(questions);
  assert.equal(groups.length, 4);
  const first = groups.findIndex((group) => group.questionIds.includes("q7")), second = groups.findIndex((group) => group.questionIds.includes("q1"));
  assert.ok(first <= second);
  questions[6].dependsOn = ["q1"];
  assert.throws(() => groupQuestions(questions), /cycle/);
  assert.ok(groupQuestions([{ ...questions[1], text: "Prove the theorem." }, questions[2]]).length === 2);
});
test("simple review questions are grouped separately from complex questions without dropping dependencies", () => {
  const questions = [
    { id: "q1", text: "Define opportunity cost.", parts: ["answer"] },
    { id: "q2", text: "True or false: resources are scarce.", parts: ["answer"] },
    { id: "q3", text: "Derive the equilibrium.", parts: ["answer"] },
    { id: "q4", text: "Multiple-choice: which option is correct?", parts: ["answer"], dependsOn: ["q3"] },
    { id: "q5", text: "Define scarcity.", parts: ["answer"] }
  ];
  const groups = groupQuestions(questions);
  assert.deepEqual(groups.map((group) => group.questionIds), [["q1", "q2"], ["q3", "q4"], ["q5"]]);
  assert.deepEqual(groups.flatMap((group) => group.questionIds), questions.map((question) => question.id));
  assert.deepEqual(groupQuestions(questions, "请深入分析每题").map((group) => group.questionIds), [["q1", "q2", "q3", "q4", "q5"]]);
});
test("planning cannot replace detected questions and invalid citation ids or missing subparts fail only the affected question", () => {
  const detected = detectSet({ sources: [source] }), questions = enrichPlan(detected, { questions: [{ id: "q1", text: "fabricated", queries: ["opportunity cost", "机会成本"], dependsOn: ["other-user-id"] }] }, [source]);
  assert.notEqual(questions[0].text, "fabricated");
  assert.deepEqual(questions[0].dependsOn, []);
  const refs = { q1: [{ ref: "q1.S1", name: "Lecture.pdf", location: "PDF 第 3 页" }], q2: [] };
  const raw = { answers: [{ id: "q1", parts: [{ id: "a", text: "Method", status: "done", basis: "source", sources: ["foreign"] }, { id: "b", text: "Answer", status: "done", basis: "general", sources: [] }] },
    { id: "q2", parts: ["a", "b"].map((id) => ({ id, text: "Complete working", status: "done", basis: "general", sources: [] })) }] };
  const checked = validateAnswers(raw, questions.slice(0, 2), refs);
  assert.deepEqual(checked.failed, ["q1"]); assert.equal(checked.answers[0].id, "q2");
});
test("native PDF subsets contain only selected pages with original-page mappings, leaving upload bytes unchanged", async () => {
  const bytes = await fs.readFile(path.join(__dirname, "fixtures/cheatsheet-letter-double.pdf"));
  const original = { name: "paper.pdf", kind: "pdf", dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}` };
  const selected = await pdfPages(original, [2, 2, 99]);
  assert.deepEqual(selected.originalPages, [2]);
  assert.equal((await PDFDocument.load(Buffer.from(selected.dataUrl.split(",")[1], "base64"))).getPageCount(), 1);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
  assert.match(selected.name, /original pages 2/);
});
