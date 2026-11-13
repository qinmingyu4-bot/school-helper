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
  const questions = detectSet({ sources: [source], message: "请解答整套题" }).questions;
  questions[0].dependsOn = ["q7"];
  const groups = groupQuestions(questions);
  assert.ok(groups.length >= 4);
  const first = groups.findIndex((group) => group.questionIds.includes("q7")), second = groups.findIndex((group) => group.questionIds.includes("q1"));
  assert.ok(first < second, "Dependencies must be verified in an earlier batch");
  questions[6].dependsOn = ["q1"];
  assert.throws(() => groupQuestions(questions), /cycle/);
  assert.ok(groupQuestions([{ ...questions[1], text: "Prove the theorem." }, questions[2]]).length === 2);
});
test("planning cannot replace detected questions and invalid citation ids or missing subparts fail only the affected question", () => {
  const detected = detectSet({ sources: [source], message: "请解答整套题" }), questions = enrichPlan(detected, { questions: [{ id: "q1", text: "fabricated", queries: ["opportunity cost", "机会成本"], dependsOn: ["other-user-id"] }] }, [source]);
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

test("whole-set routing preserves hints, interaction, scope and explicit complete-teaching shortcuts", () => {
  for (const message of ["先给提示，等我回答再继续", "请问我几个问题来检查我是否真的理解了。", "Explain question 2 only", "先讲第十二题", "这份试卷有多少道题？", "Please analyze the attached file(s).", "检查这套题的理解，问我几个问题", "Solve all questions in 10 minutes, focus on high priority"])
    assert.equal(detectSet({ message, sources: [source] }), null, message);
  const prompt = require("../public/study-modes").modes.guided.prompts[0][1];
  assert.equal(detectSet({ message: prompt, sources: [source] }).questions.length, 20);
  assert.equal(detectSet({ message: "Solve all questions", sources: [source] }).questions.length, 20);
});

test("all sections and gaps retain distinct question identities and section-level givens", () => {
  const paper = { ...source, text: "Section A\n" + source.text + "\nSection B\nUse rate 7 percent for this section.\n1. Calculate B1.\n(a) First.\n2. Calculate B2.\n(a) Second.\n4. Calculate B4." };
  const detected = detectSet({ message: "请完整解答这套题", sources: [paper] });
  assert.equal(detected.questions.length, 23);
  assert.equal(new Set(detected.questions.map((q) => q.number)).size, 23);
  assert.match(detected.questions[20].number, /Section B/);
  assert.match(detected.questions[21].shared, /rate 7 percent/);
  assert(!detected.questions[19].text.includes("rate 7 percent"));
  assert.match(detected.questions.at(-1).text, /Calculate B4/);
});

test("function arguments and parenthetical prose cannot become subpart headings", () => {
  const questions = questionsFrom({ text: "1. Evaluate f(x) and g(t).\n(a) Find f(a).\n(b) Explain g(b).\n2. Evaluate h(x).\n(i) Differentiate.\n(ii) Integrate." });
  assert.deepEqual(questions[0].parts, ["a", "b"]);
  assert.deepEqual(questions[1].parts, ["i", "ii"]);
});

test("mixed readable and scanned uploads require every source to be inspected", () => {
  const scan = { id: "upload:1", name: "extra.png", kind: "image", text: "" };
  const detected = detectSet({ message: "解答全部题目", sources: [source, scan] });
  assert.deepEqual(detected.sourceIds, [source.id, scan.id]);
  assert.deepEqual(detected.reviewSourceIds, [scan.id]);
  const base = detected.questions.map(({ id }) => ({ id }));
  assert.throws(() => enrichPlan(detected, { questions: base }, [source, scan]), /Every source/);
  const raw = { sourceChecks: [{ sourceId: scan.id, status: "complete" }], questions: [...base, { id: "q21", sourceId: scan.id, number: 21, text: "Calculate the area.", parts: ["a"], pages: [] }] };
  assert.equal(enrichPlan(detected, raw, [source, scan]).length, 21);
  assert.throws(() => enrichPlan(detected, { ...raw, questions: base }, [source, scan]), /inconsistent/);
  const unreadable = enrichPlan(detected, { sourceChecks: [{ sourceId: scan.id, status: "unreadable", reason: "Bottom half of extra.png is blurred." }], questions: base }, [source, scan]);
  assert.equal(unreadable.at(-1).unreadable, true);
  assert.match(unreadable.at(-1).text, /blurred/);
});

test("visual inventory can correct OCR subparts but cannot silently drop known questions", () => {
  const pdf = { ...source, kind: "pdf", pages: 2 };
  const detected = detectSet({ message: "解答整套题", sources: [pdf] });
  const raw = { sourceChecks: [{ sourceId: pdf.id, status: "complete" }], questions: detected.questions.map((q) => ({ id: q.id, parts: ["a", "b", "c"] })) };
  assert.deepEqual(enrichPlan(detected, raw, [pdf])[0].parts, ["a", "b", "c"]);
  assert.throws(() => enrichPlan(detected, { ...raw, questions: raw.questions.slice(1) }, [pdf]), /missing/);
  assert.throws(() => enrichPlan(detected, { ...raw, questions: [...raw.questions, raw.questions[0]] }, [pdf]), /Duplicate/);
});

test("partially readable scans retain readable new questions and an unresolved remainder", () => {
  const scan = { id: "upload:1", name: "partial.png", kind: "image", text: "" };
  const detected = detectSet({ message: "解答全部题目", sources: [source, scan] });
  const questions = enrichPlan(detected, { sourceChecks: [{ sourceId: scan.id, status: "unreadable", reason: "Question 22 is blurred" }],
    questions: [...detected.questions.map(({ id }) => ({ id })), { id: "q21", sourceId: scan.id, number: 21, text: "Readable problem", parts: ["answer"], pages: [] }] }, [source, scan]);
  assert.equal(questions.length, 22);
  assert.equal(questions[20].text, "Readable problem"); assert.equal(questions[21].unreadable, true);
});

test("visual planning cannot erase detected subparts and retains inspected PDF pages", () => {
  const pdf = { ...source, kind: "pdf", pages: 3 };
  const detected = detectSet({ message: "解答整套题", sources: [pdf] });
  const plan = { sourceChecks: [{ sourceId: pdf.id, status: "complete" }], questions: detected.questions.map((q) => ({ id: q.id, parts: ["a"], pages: [2, 3] })) };
  const result = enrichPlan(detected, plan, [pdf]);
  assert.deepEqual(result[0].parts, ["a", "b"]);
  assert.deepEqual(result[0].pages, [2, 3]);
  plan.questions[0].pages = [4];
  assert.throws(() => enrichPlan(detected, plan, [pdf]), /Invalid reviewed source pages/);
});

test("a named reference does not replace the requested paper, while explicit targets still work", () => {
  const { selectProblemSources } = require("../lib/problem-set");
  const paper = { ...source, name: "paper.pdf", kind: "pdf" };
  const notes = { id: "notes", name: "notes.pdf", kind: "pdf", text: "Reference notes" };
  for (const message of ["参考 notes.pdf，解答上传的整套题", "解答整套题，参考 notes.pdf", "Solve all uploaded questions based on notes.pdf"])
    assert.deepEqual(detectSet({ message, sources: [paper, notes] }).sourceIds, [paper.id, notes.id], message);
  assert.deepEqual(selectProblemSources([paper, notes], "参考 notes.pdf，解答整套题", [paper]), [paper]);
  assert.deepEqual(selectProblemSources([paper, notes], "Solve paper.pdf using notes.pdf", [notes]), [paper]);
  assert.deepEqual(selectProblemSources([paper, notes], "根据 notes.pdf 解答 paper.pdf 中全部题目", [notes]), [paper]);
});

test("implicit previous-question dependencies become persisted ids without crossing files", () => {
  const questions = [
    { id: "q1", sourceId: "paperA", text: "Compute", parts: ["answer"], dependsOn: [] },
    { id: "q2", sourceId: "paperA", text: "Use the previous question result", parts: ["answer"], dependsOn: [] },
    { id: "q3", sourceId: "paperB", text: "上一题", parts: ["answer"], dependsOn: [] }
  ];
  const batches = groupQuestions(questions);
  assert.deepEqual(questions[1].dependsOn, ["q1"]);
  assert.deepEqual(questions[2].dependsOn, []);
  assert(batches.find((b) => b.questionIds.includes("q2")).dependencies.includes(batches[0].id));
});
